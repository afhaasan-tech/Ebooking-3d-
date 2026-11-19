import { createHmac, randomBytes } from 'node:crypto';
import { priceOrder, GatewayTimeoutError, DemoPaymentProvider } from '@ebooking/booking-engine';
import { MAX_SEATS_PER_ORDER, type DemoScenario, type PaymentMethod } from '@ebooking/shared';
import type { Db, Tx } from '../db';
import { HttpError, type AuthUser } from '../auth';
import { config } from '../config';

export interface Owner {
  user: AuthUser | null;
  session: string | null;
}

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newReference(prefix = 'EBK'): string {
  const b = randomBytes(8);
  return `${prefix}-${Array.from(b, (x) => REF_ALPHABET[x % REF_ALPHABET.length]).join('')}`;
}

export function ticketQrPayload(ticketId: string): string {
  const sig = createHmac('sha256', config.ticketSigningSecret).update(ticketId).digest('base64url').slice(0, 32);
  return `EBK1.${ticketId}.${sig}`;
}

export function verifyTicketQr(payload: string): string | null {
  const m = /^EBK1\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{32})$/.exec(payload.trim());
  if (!m) return null;
  return ticketQrPayload(m[1]) === payload.trim() ? m[1] : null;
}

/** Map database exceptions from booking functions to API errors. */
function mapDbError(e: unknown): never {
  const msg = (e as Error).message ?? '';
  const known: Record<string, [number, string]> = {
    no_seats: [400, 'no_seats'],
    too_many_seats: [400, 'too_many_seats'],
    duplicate_seats: [400, 'duplicate_seats'],
    unknown_seat: [400, 'unknown_seat'],
    performance_not_found: [404, 'performance_not_found'],
    not_on_sale: [409, 'not_on_sale'],
    wrong_inventory_type: [400, 'wrong_inventory_type'],
    capacity_exceeded: [409, 'capacity_exceeded'],
    unknown_category: [400, 'unknown_category'],
    invalid_quantity: [400, 'invalid_quantity'],
    no_owner: [400, 'session_required'],
  };
  const unavailable = /seat_unavailable:([^\s"]+)/.exec(msg);
  if (unavailable) throw new HttpError(409, 'seat_unavailable', { seats: unavailable[1].split(',') });
  for (const k of Object.keys(known)) if (msg.includes(k)) throw new HttpError(known[k][0], known[k][1]);
  throw e;
}

export class BookingService {
  constructor(
    private readonly db: Db,
    readonly provider: DemoPaymentProvider,
    private readonly log: { info: (o: object, m?: string) => void; error: (o: object, m?: string) => void } = console as any,
  ) {}

  async audit(tx: Tx, actorId: string | null, orgId: string | null, action: string, entity: string, entityId: string | null, details: object = {}) {
    await tx.query(`insert into public.audit_logs(actor_id, org_id, action, entity, entity_id, details) values ($1,$2,$3,$4,$5,$6)`, [actorId, orgId, action, entity, entityId, JSON.stringify(details)]);
  }

  // ───────────── holds ─────────────
  async holdSeats(performanceId: string, seatIds: string[], owner: Owner) {
    if (!owner.user && !owner.session) throw new HttpError(400, 'session_required');
    if (seatIds.length > MAX_SEATS_PER_ORDER) throw new HttpError(400, 'too_many_seats');
    const max = await this.db.one<{ max_per_order: number }>(`select e.max_per_order from public.performances p join public.events e on e.id = p.event_id where p.id = $1`, [performanceId]);
    if (!max) throw new HttpError(404, 'performance_not_found');
    let holdId: string;
    try {
      holdId = await this.db.tx(async (tx) => {
        const r = await tx.one<{ id: string }>(`select app.hold_seats($1, $2, $3, $4, $5, $6) as id`, [performanceId, seatIds, owner.user?.id ?? null, owner.session, config.holdTtlSeconds, Math.min(max.max_per_order, MAX_SEATS_PER_ORDER)]);
        return r!.id;
      });
    } catch (e) {
      mapDbError(e);
    }
    return this.getHold(holdId, owner);
  }

  async holdAdmission(performanceId: string, quantity: number, owner: Owner) {
    if (!owner.user && !owner.session) throw new HttpError(400, 'session_required');
    const p = await this.db.one<{ inventory_type: string; max_per_order: number; category_id: string }>(
      `select e.inventory_type, e.max_per_order, c.category_id from public.performances p join public.events e on e.id = p.event_id
         join public.capacity_inventory c on c.performance_id = p.id where p.id = $1 limit 1`,
      [performanceId],
    );
    if (!p) throw new HttpError(404, 'performance_not_found');
    let holdId: string;
    try {
      holdId = await this.db.tx(async (tx) => {
        const r = await tx.one<{ id: string }>(`select app.hold_admission($1,$2,$3,$4,$5,$6,$7,$8) as id`, [performanceId, p.category_id, quantity, owner.user?.id ?? null, owner.session, config.holdTtlSeconds, p.max_per_order, p.inventory_type]);
        return r!.id;
      });
    } catch (e) {
      mapDbError(e);
    }
    return this.getHold(holdId, owner);
  }

  private async loadHoldForOwner(tx: Tx, holdId: string, owner: Owner, lock = false) {
    const h = await tx.one<any>(`select * from public.seat_holds where id = $1 ${lock ? 'for update' : ''}`, [holdId]);
    const owns = h && ((owner.user && h.owner_user_id === owner.user.id) || (owner.session && h.owner_session === owner.session));
    // do not reveal whether a hold exists to non-owners
    if (!owns) throw new HttpError(404, 'hold_not_found');
    return h;
  }

  /** Authoritative hold summary with server-calculated prices and fees. */
  async getHold(holdId: string, owner: Owner) {
    return this.db.tx(async (tx) => {
      const h = await this.loadHoldForOwner(tx, holdId, owner);
      return this.holdSummary(tx, h);
    });
  }

  private async holdSummary(tx: Tx, h: any) {
    const ev = await tx.one<any>(
      `select e.id as event_id, e.slug, e.title_ar, e.title_en, e.service_fee_bps, e.service_fee_fixed_fils, e.inventory_type, e.layout_version_id,
              p.starts_at, p.label_ar, p.label_en, v.name_ar as venue_ar, v.name_en as venue_en
         from public.performances p join public.events e on e.id = p.event_id join public.venues v on v.id = e.venue_id where p.id = $1`,
      [h.performance_id],
    );
    const items = await tx.query<any>(
      `select hi.seat_code, hi.quantity, c.id as category_id, c.code as category_code, c.name_ar as category_ar, c.name_en as category_en, c.price_fils,
              s.section_code, s.row_label, s.seat_number, s.view_score, sec.name_ar as section_ar, sec.name_en as section_en
         from public.seat_hold_items hi
         join public.ticket_categories c on c.id = hi.category_id
         left join public.venue_seats s on s.layout_version_id = $2 and s.seat_code = hi.seat_code
         left join public.venue_sections sec on sec.layout_version_id = $2 and sec.code = s.section_code
        where hi.hold_id = $1 order by s.section_code, s.row_label, s.seat_number`,
      [h.id, ev.layout_version_id],
    );
    const pricing = priceOrder(
      items.map((i) => ({ ref: i.seat_code ?? i.category_code, unitPriceFils: i.price_fils, quantity: i.quantity })),
      { serviceFeeBps: ev.service_fee_bps, serviceFeeFixedFils: ev.service_fee_fixed_fils },
    );
    return {
      id: h.id,
      status: h.status,
      expiresAt: h.expires_at,
      performanceId: h.performance_id,
      event: ev,
      items,
      pricing: { subtotalFils: pricing.subtotalFils, serviceFeeFils: pricing.serviceFeeFils, totalFils: pricing.totalFils, ticketCount: pricing.ticketCount, serviceFeeBps: ev.service_fee_bps, serviceFeeFixedFils: ev.service_fee_fixed_fils },
    };
  }

  async releaseHold(holdId: string, owner: Owner) {
    await this.db.tx(async (tx) => {
      const h = await this.loadHoldForOwner(tx, holdId, owner, true);
      const o = await tx.one(`select status from public.orders where hold_id = $1`, [h.id]);
      if (o && ['payment_processing', 'confirmed', 'reconciliation_required'].includes((o as any).status)) throw new HttpError(409, 'payment_in_progress');
      await tx.query(`select app._release_hold($1, 'released')`, [h.id]);
    });
  }

  // ───────────── checkout ─────────────
  async checkout(input: { holdId: string; contact: { name: string; email: string; mobile: string }; method: PaymentMethod; demoScenario: DemoScenario; idempotencyKey: string }, user: AuthUser, session: string | null) {
    // Idempotent retry: the same key always maps to the same payment attempt (never a second charge).
    const prior = await this.db.one<{ order_id: string; user_id: string }>(`select p.order_id, o.user_id from public.payments p join public.orders o on o.id = p.order_id where p.idempotency_key = $1`, [input.idempotencyKey]);
    if (prior) {
      if (prior.user_id !== user.id) throw new HttpError(409, 'idempotency_key_conflict');
      return this.orderView(prior.order_id, user.id);
    }

    const prep = await this.db.tx(async (tx) => {
      const h = await this.loadHoldForOwner(tx, input.holdId, { user, session }, true);
      let order = await tx.one<any>(`select * from public.orders where hold_id = $1 for update`, [h.id]);
      if (order && order.user_id !== user.id) throw new HttpError(404, 'hold_not_found');
      if (order?.status === 'confirmed') return { orderId: order.id, skip: true as const };
      if (order && ['payment_processing', 'reconciliation_required'].includes(order.status)) throw new HttpError(409, 'payment_in_progress', { reference: order.reference });
      if (h.status !== 'active' || new Date(h.expires_at).getTime() < Date.now()) throw new HttpError(410, 'hold_expired');

      const summary = await this.holdSummary(tx, h);
      if (summary.items.length === 0) throw new HttpError(400, 'empty_hold');
      const total = summary.pricing.totalFils;

      if (!order) {
        order = await tx.one<any>(
          `insert into public.orders(reference, user_id, performance_id, hold_id, subtotal_fils, service_fee_fils, total_fils, contact_name, contact_email, contact_mobile, demo)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true) returning *`,
          [newReference(), user.id, h.performance_id, h.id, summary.pricing.subtotalFils, summary.pricing.serviceFeeFils, total, input.contact.name, input.contact.email, input.contact.mobile],
        );
        for (const i of summary.items) {
          await tx.query(`insert into public.order_items(order_id, seat_code, category_id, unit_price_fils, quantity) values ($1,$2,$3,$4,$5)`, [order.id, i.seat_code, i.category_id, i.price_fils, i.quantity]);
        }
      } else {
        // retry after a failed attempt: re-price authoritatively (prices may have changed)
        await tx.query(`update public.orders set subtotal_fils=$2, service_fee_fils=$3, total_fils=$4, contact_name=$5, contact_email=$6, contact_mobile=$7 where id=$1`, [order.id, summary.pricing.subtotalFils, summary.pricing.serviceFeeFils, total, input.contact.name, input.contact.email, input.contact.mobile]);
        // keep line items consistent with the new totals (safe: an unconfirmed order has no tickets)
        await tx.query(`delete from public.order_items where order_id = $1`, [order.id]);
        for (const i of summary.items) {
          await tx.query(`insert into public.order_items(order_id, seat_code, category_id, unit_price_fils, quantity) values ($1,$2,$3,$4,$5)`, [order.id, i.seat_code, i.category_id, i.price_fils, i.quantity]);
        }
      }
      // claim the hold for this user and keep it reserved while the payment is in flight
      await tx.query(`update public.seat_holds set owner_user_id = $2, expires_at = greatest(expires_at, now() + make_interval(secs => $3)) where id = $1`, [h.id, user.id, config.paymentWindowSeconds]);
      const pay = await tx.one<{ id: string }>(
        `insert into public.payments(order_id, provider, method, amount_fils, status, idempotency_key, demo_scenario) values ($1,$2,$3,$4,'initiated',$5,$6) returning id`,
        [order.id, this.provider.name, input.method, total, input.idempotencyKey, input.demoScenario],
      );
      await tx.query(`update public.orders set status = 'payment_processing', updated_at = now() where id = $1`, [order.id]);
      return { orderId: order.id as string, paymentId: pay!.id, reference: order.reference as string, total, skip: false as const };
    });
    if (prep.skip) return this.orderView(prep.orderId, user.id);

    try {
      const res = await this.provider.createPayment({ paymentId: prep.paymentId, orderReference: prep.reference, amountFils: prep.total, method: input.method, idempotencyKey: input.idempotencyKey, scenario: input.demoScenario });
      await this.db.query(`update public.payments set provider_ref = $2, status = case when status = 'initiated' then 'pending' else status end, updated_at = now() where id = $1`, [prep.paymentId, res.providerRef]);
      if (res.status === 'succeeded') await this.applyPaymentResult(prep.paymentId, 'succeeded', 'provider_response');
      else if (res.status === 'failed') await this.applyPaymentResult(prep.paymentId, 'failed', 'provider_response');
    } catch (e) {
      // Network failure / timeout: the charge MAY have happened. Never retry automatically; mark unknown and reconcile.
      const ref = e instanceof GatewayTimeoutError ? e.providerRef : null;
      await this.db.query(`update public.payments set status = 'unknown', provider_ref = coalesce(provider_ref, $2), last_error = $3, updated_at = now() where id = $1 and status in ('initiated','pending')`, [prep.paymentId, ref, (e as Error).message.slice(0, 200)]);
      this.log.error({ paymentId: prep.paymentId, err: (e as Error).message }, 'payment status unknown — awaiting reconciliation');
    }
    return this.orderView(prep.orderId, user.id);
  }

  /**
   * Single entry point for verified payment outcomes (webhook, status query, provider response).
   * Idempotent: repeated calls never issue duplicate tickets.
   */
  async applyPaymentResult(paymentId: string, outcome: 'succeeded' | 'failed', source: string): Promise<string> {
    const result = await this.db.tx(async (tx) => {
      const p = await tx.one<any>(`select * from public.payments where id = $1 for update`, [paymentId]);
      if (!p) return 'payment_not_found';
      const order = await tx.one<any>(`select o.*, app.performance_org(o.performance_id) as org_id from public.orders o where o.id = $1 for update`, [p.order_id]);
      if (outcome === 'failed') {
        if (p.status === 'succeeded') return 'ignored_failure_after_success';
        await tx.query(`update public.payments set status = 'failed', updated_at = now() where id = $1`, [paymentId]);
        if (order.status === 'payment_processing') await tx.query(`update public.orders set status = 'payment_failed', updated_at = now() where id = $1`, [order.id]);
        return 'payment_failed';
      }
      if (p.status !== 'succeeded') {
        const other = await tx.one(`select id from public.payments where order_id = $1 and status = 'succeeded' and id <> $2`, [order.id, paymentId]);
        if (other) {
          // Two successful charges for one order: never issue more tickets; escalate for an authorized refund.
          await tx.query(`update public.payments set status = 'unknown', last_error = 'duplicate_charge_requires_refund', updated_at = now() where id = $1`, [paymentId]);
          await this.openCase(tx, order, 'reconciliation', 'urgent', 'Duplicate successful charge detected — refund required after verification');
          await this.audit(tx, null, order.org_id, 'payment.duplicate_charge', 'payment', paymentId, { source });
          return 'duplicate_charge_escalated';
        }
        await tx.query(`update public.payments set status = 'succeeded', updated_at = now() where id = $1`, [paymentId]);
      }
      const r = await tx.one<{ r: string }>(`select app.confirm_order($1) as r`, [order.id]);
      if (r!.r === 'reconciliation_required') {
        await this.openCase(tx, order, 'reconciliation', 'urgent', 'Payment verified but seats could not be allocated');
        await this.audit(tx, null, order.org_id, 'order.reconciliation_required', 'order', order.id, { source });
      } else if (r!.r === 'confirmed') {
        await this.audit(tx, order.user_id, order.org_id, 'order.confirmed', 'order', order.id, { source, total_fils: order.total_fils });
      }
      return r!.r;
    });
    this.log.info({ paymentId, outcome, source, result }, 'payment result applied');
    return result;
  }

  private async openCase(tx: Tx, order: any, category: string, priority: string, subject: string) {
    await tx.query(
      `insert into public.support_cases(reference, user_id, order_id, subject, category, status, priority)
       values ($1,$2,$3,$4,$5,'escalated',$6)
       on conflict (order_id) where category = 'reconciliation' and status <> 'resolved' do nothing`,
      [newReference('SUP'), order.user_id, order.id, subject, category, priority],
    );
  }

  async handleWebhook(raw: string, signature: string | undefined) {
    const ev = this.provider.verifyWebhook(raw, signature);
    if (!ev) throw new HttpError(401, 'invalid_signature');
    const inserted = await this.db.one<{ id: string }>(
      `insert into public.payment_provider_events(provider, provider_event_id, type, payload) values ($1,$2,$3,$4)
       on conflict (provider, provider_event_id) do nothing returning id`,
      [this.provider.name, ev.eventId, ev.type, raw],
    );
    if (!inserted) return { duplicate: true };
    const p = await this.db.one<{ id: string; provider_ref: string | null; amount_fils: number }>(
      `select id, provider_ref, amount_fils from public.payments where provider_ref = $1 or (provider_ref is null and id::text = $2)`,
      [ev.providerRef, ev.paymentId],
    );
    let result = 'payment_not_found';
    if (p) {
      if (ev.amountFils !== p.amount_fils) {
        result = 'amount_mismatch';
        this.log.error({ ev }, 'webhook amount mismatch');
      } else {
        await this.db.query(`update public.payments set provider_ref = coalesce(provider_ref, $2) where id = $1`, [p.id, ev.providerRef]);
        if (ev.type === 'payment.succeeded') result = await this.applyPaymentResult(p.id, 'succeeded', 'webhook');
        else if (ev.type === 'payment.failed') result = await this.applyPaymentResult(p.id, 'failed', 'webhook');
        else result = 'noted';
      }
    }
    await this.db.query(`update public.payment_provider_events set processed_at = now(), payment_id = $2 where id = $1`, [inserted.id, p?.id ?? null]);
    return { duplicate: false, result };
  }

  /** Query the provider for authoritative status of unresolved payments of an order. */
  async reconcileOrder(orderId: string): Promise<void> {
    const pays = await this.db.query<{ id: string; provider_ref: string | null; idempotency_key: string; status: string }>(
      `select id, provider_ref, idempotency_key, status from public.payments where order_id = $1 and status in ('initiated','pending','unknown')`,
      [orderId],
    );
    for (const p of pays) {
      const ref = p.provider_ref ?? this.provider.findByIdempotencyKey(p.idempotency_key);
      if (!ref) continue; // never reached the gateway — nothing was charged
      if (!p.provider_ref) await this.db.query(`update public.payments set provider_ref = $2 where id = $1`, [p.id, ref]);
      const st = await this.provider.getStatus(ref);
      if (st?.status === 'succeeded') await this.applyPaymentResult(p.id, 'succeeded', 'reconciliation');
      else if (st?.status === 'failed') await this.applyPaymentResult(p.id, 'failed', 'reconciliation');
    }
    // verified payment exists but order never confirmed (e.g. crash between steps) → retry allocation
    const o = await this.db.one<{ status: string }>(`select status from public.orders where id = $1`, [orderId]);
    if (o && ['payment_processing', 'expired'].includes(o.status)) {
      const ok = await this.db.one(`select id from public.payments where order_id = $1 and status = 'succeeded'`, [orderId]);
      if (ok) await this.applyPaymentResult((ok as any).id, 'succeeded', 'reconciliation');
    }
  }

  /** Background sweeper: expire holds and reconcile stale in-flight payments. */
  async sweep() {
    await this.db.tx((tx) => tx.query(`select app.release_expired_holds(null)`));
    const stale = await this.db.query<{ order_id: string }>(
      `select distinct order_id from public.payments where status in ('pending','unknown','initiated') and updated_at < now() - interval '5 seconds' limit 50`,
    );
    for (const s of stale) await this.reconcileOrder(s.order_id).catch((e) => this.log.error({ err: (e as Error).message }, 'reconcile failed'));
  }

  async refundOrder(orderId: string, admin: AuthUser) {
    const pay = await this.db.one<{ id: string; provider_ref: string; amount_fils: number; status: string }>(`select id, provider_ref, amount_fils, status from public.payments where order_id = $1 and status = 'succeeded'`, [orderId]);
    if (!pay) throw new HttpError(409, 'no_verified_payment');
    const st = await this.provider.getStatus(pay.provider_ref);
    if (st?.status !== 'succeeded') throw new HttpError(409, 'provider_status_not_verified');
    const r = await this.provider.refund(pay.provider_ref, pay.amount_fils);
    if (r.status !== 'succeeded') throw new HttpError(502, 'refund_not_confirmed', { providerStatus: r.status });
    await this.db.tx(async (tx) => {
      const o = await tx.one<any>(`select o.*, app.performance_org(o.performance_id) as org_id from public.orders o where id = $1 for update`, [orderId]);
      await tx.query(`update public.payments set status = 'refunded', updated_at = now() where id = $1`, [pay.id]);
      await tx.query(`update public.tickets set status = 'void' where order_id = $1 and status = 'valid'`, [orderId]);
      await tx.query(`update public.performance_seat_inventory set status = 'available', updated_at = now() where performance_id = $1 and status = 'sold' and seat_code in (select seat_code from public.order_items where order_id = $2 and seat_code is not null) and not exists (select 1 from public.tickets t where t.performance_id = $1 and t.seat_code = performance_seat_inventory.seat_code and t.status <> 'void')`, [o.performance_id, orderId]);
      // general admission / time slots: a refunded confirmed order frees its places again
      if (o.confirmed_at) {
        await tx.query(
          `update public.capacity_inventory c set sold = c.sold - oi.quantity
             from public.order_items oi where oi.order_id = $2 and oi.seat_code is null and c.performance_id = $1 and c.category_id = oi.category_id`,
          [o.performance_id, orderId],
        );
      }
      await tx.query(`update public.orders set status = 'refunded', updated_at = now() where id = $1`, [orderId]);
      await tx.query(`update public.support_cases set status = 'resolved', updated_at = now() where order_id = $1 and category = 'reconciliation' and status <> 'resolved'`, [orderId]);
      await this.audit(tx, admin.id, o.org_id, 'order.refunded', 'order', orderId, { amount_fils: pay.amount_fils });
    });
  }

  // ───────────── views ─────────────
  async orderView(orderId: string, userId: string | null) {
    const o = await this.db.one<any>(
      `select o.*, e.title_ar, e.title_en, e.slug, e.inventory_type, e.layout_version_id, p.starts_at, p.label_ar, p.label_en, v.name_ar as venue_ar, v.name_en as venue_en
         from public.orders o join public.performances p on p.id = o.performance_id join public.events e on e.id = p.event_id join public.venues v on v.id = e.venue_id
        where o.id = $1 ${userId ? 'and o.user_id = $2' : ''}`,
      userId ? [orderId, userId] : [orderId],
    );
    if (!o) throw new HttpError(404, 'order_not_found');
    const items = await this.db.query<any>(
      `select oi.*, c.code as category_code, c.name_ar as category_ar, c.name_en as category_en, s.section_code, s.row_label, s.seat_number,
              sec.name_ar as section_ar, sec.name_en as section_en
         from public.order_items oi join public.ticket_categories c on c.id = oi.category_id
         left join public.venue_seats s on s.layout_version_id = $2 and s.seat_code = oi.seat_code
         left join public.venue_sections sec on sec.layout_version_id = $2 and sec.code = s.section_code
        where oi.order_id = $1 order by s.section_code, s.row_label, s.seat_number`,
      [o.id, o.layout_version_id],
    );
    const payments = await this.db.query<any>(`select id, method, status, amount_fils, created_at, updated_at, last_error from public.payments where order_id = $1 order by created_at`, [o.id]);
    const tickets = await this.db.query<any>(`select id, order_item_id, seat_code, admission_index, status, demo, issued_at from public.tickets where order_id = $1 order by seat_code, admission_index`, [o.id]);
    const supportCase = await this.db.one<any>(`select reference, status, category from public.support_cases where order_id = $1 order by created_at desc limit 1`, [o.id]);
    return {
      id: o.id,
      reference: o.reference,
      status: o.status,
      demo: o.demo,
      subtotalFils: o.subtotal_fils,
      serviceFeeFils: o.service_fee_fils,
      totalFils: o.total_fils,
      contact: { name: o.contact_name, email: o.contact_email, mobile: o.contact_mobile },
      createdAt: o.created_at,
      confirmedAt: o.confirmed_at,
      event: { slug: o.slug, titleAr: o.title_ar, titleEn: o.title_en, inventoryType: o.inventory_type, venueAr: o.venue_ar, venueEn: o.venue_en, startsAt: o.starts_at, labelAr: o.label_ar, labelEn: o.label_en },
      performanceId: o.performance_id,
      items,
      payments,
      supportCase,
      tickets: o.status === 'confirmed' ? tickets.map((t) => ({ ...t, qr: ticketQrPayload(t.id) })) : [],
    };
  }
}

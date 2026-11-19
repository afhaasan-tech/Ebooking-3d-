import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { QuoteBody, uuid, sumFils } from '@ebooking/shared';
import { QUICK_EVENT_TRANSITIONS, assertTransition, InvalidTransitionError } from '@ebooking/booking-engine';
import type { QuickEventStatus } from '@ebooking/shared';
import { parse, type Ctx } from '../app';
import { HttpError, requireAdmin } from '../auth';

export async function adminRoutes(app: FastifyInstance, { db, booking }: Ctx) {
  app.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/admin/')) requireAdmin(req.user);
  });

  app.get('/api/admin/overview', async () => {
    const counts = await db.one(
      `select (select count(*)::int from public.organizations) as organizations,
              (select count(*)::int from public.events where status = 'published') as published_events,
              (select count(*)::int from public.events where status = 'pending_approval') as pending_events,
              (select count(*)::int from public.orders where status = 'confirmed') as confirmed_orders,
              (select count(*)::int from public.orders where status = 'reconciliation_required') as reconciliation,
              (select count(*)::int from public.payments where status in ('pending','unknown')) as unverified_payments,
              (select count(*)::int from public.quick_event_requests where status in ('submitted','under_review')) as new_quick_events,
              (select count(*)::int from public.support_cases where status <> 'resolved') as open_cases,
              (select coalesce(sum(service_fee_fils),0)::bigint from public.orders where status = 'confirmed') as platform_fees_fils`,
    );
    const orgs = await db.query(
      `select o.id, o.name, o.status, s.status as sub_status, s.current_period_end, pl.code as plan, s.mock,
              (select count(*)::int from public.events e where e.org_id = o.id) as events
         from public.organizations o left join public.organizer_subscriptions s on s.org_id = o.id and s.status in ('trial','active','past_due') left join public.organizer_plans pl on pl.id = s.plan_id order by o.name`,
    );
    const plans = await db.query(`select code, name_ar, name_en, annual_fee_fils, commission_bps, features from public.organizer_plans order by code`);
    const settings = await db.query(`select key, value from public.platform_settings`);
    return { counts, orgs, plans, settings, demoData: true };
  });

  app.get('/api/admin/events', async (req) => {
    const q = parse(z.object({ status: z.enum(['draft', 'pending_approval', 'published', 'cancelled']).optional() }), req.query);
    return db.query(`select e.id, e.slug, e.title_ar, e.title_en, e.status, e.category, e.inventory_type, o.name as organizer, e.created_at from public.events e join public.organizations o on o.id = e.org_id where ($1::text is null or e.status = $1) order by e.created_at desc`, [q.status ?? null]);
  });

  app.post('/api/admin/events/:id/decision', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(z.object({ decision: z.enum(['published', 'draft']) }), req.body);
    return db.tx(async (tx) => {
      const e = await tx.one<any>(`update public.events set status = $2 where id = $1 and status = 'pending_approval' returning id, org_id`, [id, b.decision]);
      if (!e) throw new HttpError(409, 'event_not_pending');
      await booking.audit(tx, req.user!.id, e.org_id, `event.${b.decision === 'published' ? 'approved' : 'returned_to_draft'}`, 'event', id);
      return { id, status: b.decision };
    });
  });

  // ───────────── Quick Event pipeline (manual approval) ─────────────
  app.get('/api/admin/quick-events', async () => {
    return db.query(
      `select q.*, (select json_agg(json_build_object('id', s.id, 'status', s.status, 'total_fils', s.total_fils, 'valid_until', s.valid_until, 'created_at', s.created_at,
                     'items', (select json_agg(json_build_object('description', i.description, 'amount_fils', i.amount_fils, 'quantity', i.quantity)) from public.quote_items i where i.quote_id = s.id)) order by s.created_at)
                    from public.service_quotes s where s.quick_event_request_id = q.id) as quotes
         from public.quick_event_requests q order by q.created_at desc`,
    );
  });

  app.post('/api/admin/quick-events/:id/status', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(z.object({ status: z.enum(['under_review', 'rejected', 'configuring', 'approved', 'live']) }), req.body);
    return db.tx(async (tx) => {
      const q = await tx.one<{ status: QuickEventStatus }>(`select status from public.quick_event_requests where id = $1 for update`, [id]);
      if (!q) throw new HttpError(404, 'request_not_found');
      try {
        assertTransition(QUICK_EVENT_TRANSITIONS, q.status, b.status);
      } catch (e) {
        if (e instanceof InvalidTransitionError) throw new HttpError(409, 'invalid_transition', { from: q.status, to: b.status });
        throw e;
      }
      await tx.query(`update public.quick_event_requests set status = $2, updated_at = now() where id = $1`, [id, b.status]);
      await booking.audit(tx, req.user!.id, null, 'quick_event.status', 'quick_event_request', id, { from: q.status, to: b.status });
      return { id, status: b.status };
    });
  });

  app.post('/api/admin/quick-events/:id/quotes', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(QuoteBody, req.body);
    return db.tx(async (tx) => {
      const q = await tx.one<{ status: QuickEventStatus }>(`select status from public.quick_event_requests where id = $1 for update`, [id]);
      if (!q) throw new HttpError(404, 'request_not_found');
      if (!['under_review', 'quoted', 'quote_declined'].includes(q.status)) throw new HttpError(409, 'invalid_transition', { from: q.status, to: 'quoted' });
      // supersede any open quote
      await tx.query(`update public.service_quotes set status = 'expired' where quick_event_request_id = $1 and status = 'sent'`, [id]);
      const total = sumFils(b.items.map((i) => i.amountFils * i.quantity));
      const s = await tx.one<{ id: string }>(
        `insert into public.service_quotes(quick_event_request_id, status, total_fils, valid_until, notes, created_by) values ($1,'sent',$2,(now() + make_interval(days => $3))::date,$4,$5) returning id`,
        [id, total, b.validDays, b.notes, req.user!.id],
      );
      for (const i of b.items) await tx.query(`insert into public.quote_items(quote_id, description, amount_fils, quantity) values ($1,$2,$3,$4)`, [s!.id, i.description, i.amountFils, i.quantity]);
      await tx.query(`update public.quick_event_requests set status = 'quoted', updated_at = now() where id = $1`, [id]);
      await booking.audit(tx, req.user!.id, null, 'quote.sent', 'service_quote', s!.id, { total_fils: total });
      return { id: s!.id, totalFils: total, status: 'sent' };
    });
  });

  // ───────────── support & payment reconciliation ─────────────
  app.get('/api/admin/support-cases', async () =>
    db.query(
      `select c.reference, c.subject, c.category, c.status, c.priority, c.created_at, o.reference as order_ref, o.status as order_status, o.total_fils, u.email
         from public.support_cases c join auth.users u on u.id = c.user_id left join public.orders o on o.id = c.order_id order by (c.status = 'resolved'), c.created_at desc limit 100`,
    ),
  );

  app.post('/api/admin/support-cases/:ref/resolve', async (req) => {
    const { ref } = parse(z.object({ ref: z.string().max(40) }), req.params);
    await db.tx(async (tx) => {
      const r = await tx.one(`update public.support_cases set status = 'resolved', updated_at = now() where reference = $1 returning id`, [ref]);
      if (!r) throw new HttpError(404, 'case_not_found');
      await booking.audit(tx, req.user!.id, null, 'support.resolved', 'support_case', ref);
    });
    return { ok: true };
  });

  app.post('/api/admin/orders/:ref/retry-confirm', async (req) => {
    const { ref } = parse(z.object({ ref: z.string().max(40) }), req.params);
    const o = await db.one<{ id: string }>(`select id from public.orders where reference = $1`, [ref]);
    if (!o) throw new HttpError(404, 'order_not_found');
    const p = await db.one<{ id: string }>(`select id from public.payments where order_id = $1 and status = 'succeeded'`, [o.id]);
    if (!p) throw new HttpError(409, 'no_verified_payment');
    return { result: await booking.applyPaymentResult(p.id, 'succeeded', `admin:${req.user!.id}`) };
  });

  // Refund only after provider status verification and explicit admin authorization.
  app.post('/api/admin/orders/:ref/refund', async (req) => {
    const { ref } = parse(z.object({ ref: z.string().max(40) }), req.params);
    const b = parse(z.object({ confirm: z.literal(true) }), req.body);
    void b;
    const o = await db.one<{ id: string }>(`select id from public.orders where reference = $1`, [ref]);
    if (!o) throw new HttpError(404, 'order_not_found');
    await booking.refundOrder(o.id, req.user!);
    return booking.orderView(o.id, null);
  });

  app.get('/api/admin/audit', async () =>
    db.query(`select a.action, a.entity, a.entity_id, a.details, a.created_at, u.email as actor from public.audit_logs a left join auth.users u on u.id = a.actor_id order by a.created_at desc limit 150`),
  );
}

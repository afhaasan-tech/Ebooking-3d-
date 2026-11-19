import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CategoryPriceBody, uuid } from '@ebooking/shared';
import { organizerNet } from '@ebooking/booking-engine';
import { parse, type Ctx } from '../app';
import { HttpError, requireOrgRole } from '../auth';
import { verifyTicketQr } from '../services/booking';

/**
 * Organizer portal. Every route:
 *  1. verifies membership + role of the org in the URL (server authorization), and
 *  2. scopes every query to that org (tenant isolation), reading through RLS where practical.
 */
export async function orgRoutes(app: FastifyInstance, { db, booking }: Ctx) {
  const P = z.object({ orgId: uuid });

  app.get('/api/org/:orgId/dashboard', async (req) => {
    const { orgId } = parse(P, req.params);
    await requireOrgRole(db, orgId, req.user, ['owner', 'manager']);
    return db.asUser(req.user!.id, async (tx) => {
      const totals = await tx.one<any>(
        // gross = every sale that was ever confirmed (incl. later refunded); refunds are then subtracted ONCE.
        // Orders refunded during reconciliation were never confirmed (confirmed_at is null) and are not sales.
        `select coalesce(sum(o.subtotal_fils) filter (where o.confirmed_at is not null and o.status in ('confirmed', 'refunded')), 0)::bigint as gross_fils,
                coalesce(sum(o.service_fee_fils) filter (where o.status = 'confirmed'), 0)::bigint as fees_fils,
                coalesce(sum(o.subtotal_fils) filter (where o.confirmed_at is not null and o.status = 'refunded'), 0)::bigint as refunds_fils,
                coalesce(sum(o.total_fils) filter (where o.confirmed_at is null and o.status = 'refunded'), 0)::bigint as reconciliation_refunds_fils,
                count(*) filter (where o.status = 'confirmed')::int as confirmed_orders,
                count(*) filter (where o.status = 'reconciliation_required')::int as reconciliation_orders,
                bool_or(o.demo) as has_demo
           from public.orders o where app.performance_org(o.performance_id) = $1`,
        [orgId],
      );
      const tickets = await tx.one<any>(
        `select count(*) filter (where t.status <> 'void')::int as sold, count(*) filter (where t.status = 'used')::int as checked_in
           from public.tickets t where app.performance_org(t.performance_id) = $1`,
        [orgId],
      );
      const inventory = await tx.one<any>(
        `select count(*) filter (where i.status = 'available')::int as available, count(*)::int as total
           from public.performance_seat_inventory i join public.performances p on p.id = i.performance_id join public.events e on e.id = p.event_id where e.org_id = $1`,
        [orgId],
      );
      const byEvent = await tx.query(
        `select e.id, e.title_ar, e.title_en, e.inventory_type,
                coalesce(sum(o.subtotal_fils) filter (where o.status = 'confirmed'), 0)::bigint as gross_fils,
                (select count(*)::int from public.tickets t join public.performances p2 on p2.id = t.performance_id where p2.event_id = e.id and t.status <> 'void') as tickets
           from public.events e left join public.performances p on p.event_id = e.id left join public.orders o on o.performance_id = p.id
          where e.org_id = $1 group by e.id order by gross_fils desc`,
        [orgId],
      );
      const byCategory = await tx.query(
        `select c.code, c.name_ar, c.name_en, e.title_en, count(oi.id)::int as items, coalesce(sum(oi.unit_price_fils * oi.quantity), 0)::bigint as gross_fils
           from public.order_items oi join public.orders o on o.id = oi.order_id and o.status = 'confirmed'
           join public.ticket_categories c on c.id = oi.category_id join public.events e on e.id = c.event_id
          where e.org_id = $1 group by c.code, c.name_ar, c.name_en, e.title_en order by gross_fils desc`,
        [orgId],
      );
      const byPerformance = await tx.query(
        `select p.id, p.starts_at, e.title_ar, e.title_en,
                coalesce(sum(o.subtotal_fils) filter (where o.status = 'confirmed'), 0)::bigint as gross_fils,
                count(o.id) filter (where o.status = 'confirmed')::int as orders
           from public.performances p join public.events e on e.id = p.event_id left join public.orders o on o.performance_id = p.id
          where e.org_id = $1 group by p.id, e.title_ar, e.title_en order by p.starts_at`,
        [orgId],
      );
      const recent = await tx.query(
        `select o.reference, o.status, o.total_fils, o.created_at, o.demo, e.title_ar, e.title_en,
                (select count(*)::int from public.order_items oi where oi.order_id = o.id) as items
           from public.orders o join public.performances p on p.id = o.performance_id join public.events e on e.id = p.event_id
          where e.org_id = $1 order by o.created_at desc limit 12`,
        [orgId],
      );
      const sub = await tx.one<any>(`select s.status, s.current_period_end, s.mock, pl.code, pl.name_ar, pl.name_en, pl.commission_bps, pl.annual_fee_fils from public.organizer_subscriptions s join public.organizer_plans pl on pl.id = s.plan_id where s.org_id = $1 and s.status in ('trial','active','past_due')`, [orgId]);
      const net = organizerNet(Number(totals!.gross_fils), Number(totals!.refunds_fils), sub?.commission_bps ?? 0);
      return { totals: { ...totals, ...net, commissionConfigured: sub?.commission_bps != null }, tickets, inventory, byEvent, byCategory, byPerformance, recent, subscription: sub, demoData: true };
    });
  });

  app.get('/api/org/:orgId/events', async (req) => {
    const { orgId } = parse(P, req.params);
    await requireOrgRole(db, orgId, req.user, ['owner', 'manager', 'staff']);
    return db.asUser(req.user!.id, (tx) =>
      tx.query(
        `select e.id, e.slug, e.title_ar, e.title_en, e.category, e.inventory_type, e.status, e.demo,
                (select count(*)::int from public.performances p where p.event_id = e.id) as performances
           from public.events e where e.org_id = $1 order by e.created_at`,
        [orgId],
      ),
    );
  });

  app.get('/api/org/:orgId/events/:eventId', async (req) => {
    const { orgId, eventId } = parse(P.extend({ eventId: uuid }), req.params);
    await requireOrgRole(db, orgId, req.user, ['owner', 'manager']);
    return db.asUser(req.user!.id, async (tx) => {
      const e = await tx.one<any>(`select * from public.events where id = $1 and org_id = $2`, [eventId, orgId]);
      if (!e) throw new HttpError(404, 'event_not_found');
      const categories = await tx.query(`select id, code, name_ar, name_en, price_fils, color from public.ticket_categories where event_id = $1 order by price_fils desc`, [eventId]);
      const performances = await tx.query(
        `select p.id, p.starts_at, p.status, p.label_ar, p.label_en,
                (select json_object_agg(status, n) from (select status, count(*)::int n from public.performance_seat_inventory where performance_id = p.id group by status) s) as seat_status,
                (select json_agg(json_build_object('capacity', capacity, 'held', held, 'sold', sold)) from public.capacity_inventory where performance_id = p.id) as capacity
           from public.performances p where p.event_id = $1 order by p.starts_at`,
        [eventId],
      );
      return { event: e, categories, performances };
    });
  });

  app.post('/api/org/:orgId/events', async (req) => {
    const { orgId } = parse(P, req.params);
    const { user } = await requireOrgRole(db, orgId, req.user, ['owner', 'manager']);
    const b = parse(
      z.object({
        titleAr: z.string().trim().min(3).max(150),
        titleEn: z.string().trim().min(3).max(150),
        category: z.enum(['theatre', 'concert', 'comedy', 'workshop', 'conference', 'family']),
        inventoryType: z.enum(['general_admission', 'time_slot']),
        capacity: z.number().int().min(1).max(20000),
        priceFils: z.number().int().min(0).max(100_000_000),
        startsAt: z.string().datetime(),
        descriptionAr: z.string().max(2000).default(''),
        descriptionEn: z.string().max(2000).default(''),
      }),
      req.body,
    );
    // validate before the DB check constraint (sales_end > sales_start) would turn it into a 500
    if (new Date(b.startsAt).getTime() < Date.now() + 10 * 60_000) throw new HttpError(400, 'starts_at_in_past');
    // New events start as DRAFT → submitted for platform approval; never auto-published.
    return db.tx(async (tx) => {
      const venue = await tx.one<{ id: string }>(`select id from public.venues where code = 'DEMO-COMMUNITY-HALL'`);
      const slug = `${b.titleEn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)}-${Date.now().toString(36)}`;
      const e = await tx.one<{ id: string }>(
        `insert into public.events(org_id, slug, category, inventory_type, title_ar, title_en, description_ar, description_en, venue_id, status, demo, service_fee_bps, service_fee_fixed_fils)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending_approval',true,200,250) returning id`,
        [orgId, slug, b.category, b.inventoryType, b.titleAr, b.titleEn, b.descriptionAr, b.descriptionEn, venue!.id],
      );
      const c = await tx.one<{ id: string }>(`insert into public.ticket_categories(event_id, code, name_ar, name_en, price_fils) values ($1,'GA','دخول عام','General Admission',$2) returning id`, [e!.id, b.priceFils]);
      const p = await tx.one<{ id: string }>(`insert into public.performances(event_id, starts_at, sales_start, sales_end) values ($1,$2, now(), $2) returning id`, [e!.id, b.startsAt]);
      await tx.query(`insert into public.capacity_inventory(performance_id, category_id, capacity) values ($1,$2,$3)`, [p!.id, c!.id, b.capacity]);
      await booking.audit(tx, user.id, orgId, 'event.created', 'event', e!.id, { status: 'pending_approval' });
      return { id: e!.id, slug, status: 'pending_approval' };
    });
  });

  app.patch('/api/org/:orgId/events/:eventId', async (req) => {
    const { orgId, eventId } = parse(P.extend({ eventId: uuid }), req.params);
    const { user } = await requireOrgRole(db, orgId, req.user, ['owner', 'manager']);
    const b = parse(z.object({ titleAr: z.string().trim().min(3).max(150).optional(), titleEn: z.string().trim().min(3).max(150).optional(), descriptionAr: z.string().max(2000).optional(), descriptionEn: z.string().max(2000).optional(), serviceFeeBps: z.number().int().min(0).max(3000).optional() }), req.body);
    return db.tx(async (tx) => {
      const r = await tx.one(
        `update public.events set title_ar = coalesce($3, title_ar), title_en = coalesce($4, title_en), description_ar = coalesce($5, description_ar), description_en = coalesce($6, description_en), service_fee_bps = coalesce($7, service_fee_bps)
          where id = $1 and org_id = $2 returning id`,
        [eventId, orgId, b.titleAr ?? null, b.titleEn ?? null, b.descriptionAr ?? null, b.descriptionEn ?? null, b.serviceFeeBps ?? null],
      );
      if (!r) throw new HttpError(404, 'event_not_found');
      await booking.audit(tx, user.id, orgId, 'event.updated', 'event', eventId, b);
      return { ok: true };
    });
  });

  // Re-submit a draft (e.g. returned by the platform) for approval. Never publishes directly.
  app.post('/api/org/:orgId/events/:eventId/submit', async (req) => {
    const { orgId, eventId } = parse(P.extend({ eventId: uuid }), req.params);
    const { user } = await requireOrgRole(db, orgId, req.user, ['owner', 'manager']);
    return db.tx(async (tx) => {
      const r = await tx.one(`update public.events set status = 'pending_approval' where id = $1 and org_id = $2 and status = 'draft' returning id`, [eventId, orgId]);
      if (!r) throw new HttpError(409, 'event_not_draft');
      await booking.audit(tx, user.id, orgId, 'event.submitted', 'event', eventId);
      return { id: eventId, status: 'pending_approval' };
    });
  });

  // Prices are event-level configuration. Existing orders keep their snapshotted unit prices.
  app.patch('/api/org/:orgId/categories/:categoryId', async (req) => {
    const { orgId, categoryId } = parse(P.extend({ categoryId: uuid }), req.params);
    const { user } = await requireOrgRole(db, orgId, req.user, ['owner', 'manager']);
    const b = parse(CategoryPriceBody, req.body);
    return db.tx(async (tx) => {
      const before = await tx.one<{ price_fils: number }>(`select c.price_fils from public.ticket_categories c join public.events e on e.id = c.event_id where c.id = $1 and e.org_id = $2 for update of c`, [categoryId, orgId]);
      if (!before) throw new HttpError(404, 'category_not_found');
      await tx.query(`update public.ticket_categories set price_fils = $2 where id = $1`, [categoryId, b.priceFils]);
      await booking.audit(tx, user.id, orgId, 'category.price_changed', 'ticket_category', categoryId, { from: before.price_fils, to: b.priceFils });
      return { id: categoryId, priceFils: b.priceFils };
    });
  });

  app.get('/api/org/:orgId/performances/:performanceId/inventory', async (req) => {
    const { orgId, performanceId } = parse(P.extend({ performanceId: uuid }), req.params);
    await requireOrgRole(db, orgId, req.user, ['owner', 'manager']);
    const owns = await db.one(`select 1 where app.performance_org($1) = $2`, [performanceId, orgId]);
    if (!owns) throw new HttpError(404, 'performance_not_found');
    return db.query(
      `select i.seat_code, i.status, s.section_code, s.row_label, s.seat_number, c.code as category
         from public.performance_seat_inventory i join public.performances p on p.id = i.performance_id join public.events e on e.id = p.event_id
         join public.venue_seats s on s.layout_version_id = e.layout_version_id and s.seat_code = i.seat_code
         join public.ticket_categories c on c.id = i.category_id where i.performance_id = $1 order by s.section_code, s.row_label, s.seat_number`,
      [performanceId],
    );
  });

  app.get('/api/org/:orgId/orders', async (req) => {
    const { orgId } = parse(P, req.params);
    await requireOrgRole(db, orgId, req.user, ['owner', 'manager']);
    const q = parse(z.object({ eventId: uuid.optional(), status: z.string().max(40).optional() }), req.query);
    return db.asUser(req.user!.id, (tx) =>
      tx.query(
        `select o.reference, o.status, o.subtotal_fils, o.service_fee_fils, o.total_fils, o.created_at, o.demo, o.contact_name, e.title_ar, e.title_en, p.starts_at,
                (select string_agg(coalesce(oi.seat_code, 'GA x' || oi.quantity), ', ') from public.order_items oi where oi.order_id = o.id) as seats
           from public.orders o join public.performances p on p.id = o.performance_id join public.events e on e.id = p.event_id
          where e.org_id = $1 and ($2::uuid is null or e.id = $2) and ($3::text is null or o.status = $3)
          order by o.created_at desc limit 200`,
        [orgId, q.eventId ?? null, q.status ?? null],
      ),
    );
  });

  // Check-in is available to staff; atomic single use.
  app.post('/api/org/:orgId/checkin', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const { orgId } = parse(P, req.params);
    const { user } = await requireOrgRole(db, orgId, req.user, ['owner', 'manager', 'staff']);
    const b = parse(z.object({ code: z.string().max(200) }), req.body);
    const ticketId = verifyTicketQr(b.code);
    if (!ticketId) return { result: 'invalid_code' };
    const t = await db.one<any>(
      `select t.id, t.seat_code, t.demo, e.title_ar, e.title_en, p.starts_at from public.tickets t join public.performances p on p.id = t.performance_id join public.events e on e.id = p.event_id
        where t.id = $1 and e.org_id = $2`,
      [ticketId, orgId],
    );
    if (!t) return { result: 'not_for_this_organizer' };
    const r = await db.tx((tx) => tx.one<{ r: string }>(`select app.check_in_ticket($1, $2) as r`, [ticketId, user.id]));
    await db.tx((tx) => booking.audit(tx, user.id, orgId, 'ticket.checkin', 'ticket', ticketId, { result: r!.r }));
    return { result: r!.r, ticket: t };
  });

  // ───────────── exhibitions ─────────────
  app.get('/api/org/:orgId/booth-requests', async (req) => {
    const { orgId } = parse(P, req.params);
    await requireOrgRole(db, orgId, req.user, ['owner', 'manager']);
    return db.asUser(req.user!.id, (tx) =>
      tx.query(
        `select r.id, r.status, r.notes, r.created_at, b.booth_code, b.width_m, b.depth_m, b.status as booth_status, b.price_fils,
                x.company_name, x.contact_name, x.email, x.mobile, x.product_category, e.title_ar, e.title_en
           from public.exhibition_booking_requests r join public.exhibition_booths b on b.id = r.booth_id
           join public.exhibitor_profiles x on x.id = r.exhibitor_profile_id join public.events e on e.id = r.event_id
          where e.org_id = $1 order by r.created_at desc`,
        [orgId],
      ),
    );
  });

  app.post('/api/org/:orgId/booth-requests/:requestId/decision', async (req) => {
    const { orgId, requestId } = parse(P.extend({ requestId: uuid }), req.params);
    const { user } = await requireOrgRole(db, orgId, req.user, ['owner', 'manager']);
    const b = parse(z.object({ decision: z.enum(['approved', 'rejected']) }), req.body);
    try {
      return await db.tx(async (tx) => {
        const r = await tx.one<any>(
          `select r.*, b.status as booth_status from public.exhibition_booking_requests r join public.exhibition_booths b on b.id = r.booth_id join public.events e on e.id = r.event_id
            where r.id = $1 and e.org_id = $2 for update of r, b`,
          [requestId, orgId],
        );
        if (!r) throw new HttpError(404, 'request_not_found');
        if (r.status !== 'pending') throw new HttpError(409, 'request_already_decided');
        if (b.decision === 'approved') {
          if (r.booth_status !== 'available' && r.booth_status !== 'held') throw new HttpError(409, 'booth_not_available');
          await tx.query(`update public.exhibition_booths set status = 'booked' where id = $1`, [r.booth_id]);
          // other pending requests for the same booth are automatically rejected
          await tx.query(`update public.exhibition_booking_requests set status = 'rejected', decided_by = $2, decided_at = now(), notes = notes || ' [auto: booth allocated]' where booth_id = $1 and status = 'pending' and id <> $3`, [r.booth_id, user.id, requestId]);
        }
        await tx.query(`update public.exhibition_booking_requests set status = $2, decided_by = $3, decided_at = now() where id = $1`, [requestId, b.decision, user.id]);
        await booking.audit(tx, user.id, orgId, `booth_request.${b.decision}`, 'exhibition_booking_request', requestId, {});
        return { id: requestId, status: b.decision };
      });
    } catch (e) {
      if ((e as Error).message?.includes('booth_one_approved')) throw new HttpError(409, 'booth_already_allocated');
      throw e;
    }
  });

  app.patch('/api/org/:orgId/booths/:boothId', async (req) => {
    const { orgId, boothId } = parse(P.extend({ boothId: uuid }), req.params);
    const { user } = await requireOrgRole(db, orgId, req.user, ['owner', 'manager']);
    const b = parse(z.object({ priceFils: z.number().int().min(0).max(1_000_000_000).nullable().optional(), status: z.enum(['available', 'unavailable']).optional() }), req.body);
    return db.tx(async (tx) => {
      const r = await tx.one(
        `update public.exhibition_booths bo set price_fils = case when $3::boolean then $4::bigint else price_fils end,
                status = case when $5::text is not null and bo.status in ('available','unavailable') then $5 else bo.status end
           from public.events e where bo.id = $1 and e.id = bo.event_id and e.org_id = $2 returning bo.id, bo.price_fils, bo.status`,
        [boothId, orgId, b.priceFils !== undefined, b.priceFils ?? null, b.status ?? null],
      );
      if (!r) throw new HttpError(404, 'booth_not_found');
      await booking.audit(tx, user.id, orgId, 'booth.updated', 'exhibition_booth', boothId, b);
      return r;
    });
  });

  // ───────────── staff & subscription ─────────────
  app.get('/api/org/:orgId/staff', async (req) => {
    const { orgId } = parse(P, req.params);
    await requireOrgRole(db, orgId, req.user, ['owner', 'manager']);
    return db.query(`select u.email, p.full_name, m.role, m.created_at from public.organization_members m join auth.users u on u.id = m.user_id left join public.profiles p on p.id = m.user_id where m.org_id = $1 order by m.role`, [orgId]);
  });

  app.post('/api/org/:orgId/staff', async (req) => {
    const { orgId } = parse(P, req.params);
    const { user } = await requireOrgRole(db, orgId, req.user, ['owner']);
    const b = parse(z.object({ email: z.string().email().max(200), role: z.enum(['manager', 'staff']) }), req.body);
    return db.tx(async (tx) => {
      const u = await tx.one<{ id: string }>(`select id from auth.users where email = lower($1)`, [b.email]);
      if (!u) throw new HttpError(404, 'user_not_found');
      await tx.query(`insert into public.organization_members(org_id, user_id, role) values ($1,$2,$3) on conflict (org_id, user_id) do update set role = excluded.role where public.organization_members.role <> 'owner'`, [orgId, u.id, b.role]);
      await booking.audit(tx, user.id, orgId, 'staff.upserted', 'organization_member', u.id, { role: b.role });
      return { ok: true };
    });
  });

  app.get('/api/org/:orgId/audit', async (req) => {
    const { orgId } = parse(P, req.params);
    await requireOrgRole(db, orgId, req.user, ['owner']);
    return db.asUser(req.user!.id, (tx) => tx.query(`select action, entity, entity_id, details, created_at from public.audit_logs where org_id = $1 order by created_at desc limit 100`, [orgId]));
  });
}

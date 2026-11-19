import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { BoothRequestBody, QuickEventRequestBody, SupportMessageBody, uuid } from '@ebooking/shared';
import { parse, type Ctx } from '../app';
import { HttpError, requireUser } from '../auth';
import { newReference } from '../services/booking';
import { UsageBudget } from '../ai/providers';
import { config } from '../config';

export async function extraRoutes(app: FastifyInstance, { db, booking, assistant }: Ctx) {
  // ───────────── Exhibitor booth requests ─────────────
  app.post('/api/exhibitions/requests', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireUser(req.user);
    const b = parse(BoothRequestBody, req.body);
    try {
      return await db.tx(async (tx) => {
        const booth = await tx.one<any>(
          `select bo.id, bo.status, e.org_id from public.exhibition_booths bo join public.events e on e.id = bo.event_id
            where bo.event_id = $1 and bo.booth_code = $2 and e.status = 'published' for update of bo`,
          [b.exhibitionId, b.boothCode],
        );
        if (!booth) throw new HttpError(404, 'booth_not_found');
        if (booth.status !== 'available') throw new HttpError(409, 'booth_not_available');
        const prof = await tx.one<{ id: string }>(
          `insert into public.exhibitor_profiles(user_id, company_name, contact_name, email, mobile, product_category) values ($1,$2,$3,$4,$5,$6) returning id`,
          [user.id, b.companyName, b.contactName, b.email, b.mobile, b.productCategory],
        );
        const r = await tx.one<{ id: string }>(
          `insert into public.exhibition_booking_requests(event_id, booth_id, user_id, exhibitor_profile_id, notes) values ($1,$2,$3,$4,$5) returning id`,
          [b.exhibitionId, booth.id, user.id, prof!.id, b.notes],
        );
        await booking.audit(tx, user.id, booth.org_id, 'booth_request.created', 'exhibition_booking_request', r!.id, { booth: b.boothCode });
        return { id: r!.id, status: 'pending' };
      });
    } catch (e) {
      if ((e as Error).message?.includes('booth_one_pending_per_user')) throw new HttpError(409, 'request_already_pending');
      throw e;
    }
  });

  app.get('/api/exhibitions/requests/mine', async (req) => {
    const user = requireUser(req.user);
    return db.asUser(user.id, (tx) =>
      tx.query(
        `select r.id, r.status, r.created_at, r.decided_at, b.booth_code, b.width_m, b.depth_m, b.price_fils, e.title_ar, e.title_en, e.slug
           from public.exhibition_booking_requests r join public.exhibition_booths b on b.id = r.booth_id join public.events e on e.id = r.event_id
          where r.user_id = auth.uid() order by r.created_at desc`,
      ),
    );
  });

  // ───────────── Quick Event requests ─────────────
  app.post('/api/quick-events', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req) => {
    const b = parse(QuickEventRequestBody, req.body);
    if (b.venuePlanFileName && !/\.(pdf|png|jpe?g)$/i.test(b.venuePlanFileName)) throw new HttpError(400, 'unsupported_file_type');
    const ref = newReference('QE');
    const r = await db.tx(async (tx) => {
      const row = await tx.one<{ id: string }>(
        `insert into public.quick_event_requests(reference, user_id, company_name, contact_name, email, mobile, venue_name, event_type, proposed_dates, expected_attendance, admission, seating_mode, services, notes, venue_plan_file_name)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
        [ref, req.user?.id ?? null, b.companyName, b.contactName, b.email, b.mobile, b.venueName, b.eventType, b.proposedDates, b.expectedAttendance, b.admission, b.seatingMode, JSON.stringify(b.services), b.notes, b.venuePlanFileName ?? null],
      );
      await booking.audit(tx, req.user?.id ?? null, null, 'quick_event.submitted', 'quick_event_request', row!.id, {});
      return row!;
    });
    return { id: r.id, reference: ref, status: 'submitted' };
  });

  app.get('/api/quick-events/mine', async (req) => {
    const user = requireUser(req.user);
    return db.asUser(user.id, (tx) =>
      tx.query(
        `select q.id, q.reference, q.company_name, q.venue_name, q.event_type, q.status, q.created_at,
                (select json_agg(json_build_object('id', s.id, 'status', s.status, 'total_fils', s.total_fils, 'valid_until', s.valid_until, 'notes', s.notes,
                     'items', (select json_agg(json_build_object('description', i.description, 'amount_fils', i.amount_fils, 'quantity', i.quantity)) from public.quote_items i where i.quote_id = s.id)) order by s.created_at desc)
                   from public.service_quotes s where s.quick_event_request_id = q.id) as quotes
           from public.quick_event_requests q where q.user_id = auth.uid() order by q.created_at desc`,
      ),
    );
  });

  // Quote acceptance is a server-controlled state transition by the requesting user only.
  app.post('/api/quick-events/:id/quotes/:quoteId/:decision', async (req) => {
    const user = requireUser(req.user);
    const p = parse(z.object({ id: uuid, quoteId: uuid, decision: z.enum(['accept', 'decline']) }), req.params);
    const result = await db.tx(async (tx) => {
      const q = await tx.one<any>(
        `select s.id, s.status, s.valid_until, r.status as req_status from public.service_quotes s join public.quick_event_requests r on r.id = s.quick_event_request_id
          where s.id = $1 and r.id = $2 and r.user_id = $3 for update of s, r`,
        [p.quoteId, p.id, user.id],
      );
      if (!q) throw new HttpError(404, 'quote_not_found');
      if (q.status !== 'sent') throw new HttpError(409, 'quote_not_open', { status: q.status });
      if (new Date(q.valid_until).getTime() + 86400000 < Date.now()) {
        // commit the expiry (throwing here would roll the status change back)
        await tx.query(`update public.service_quotes set status = 'expired' where id = $1`, [q.id]);
        return { expired: true as const };
      }
      const accepted = p.decision === 'accept';
      await tx.query(`update public.service_quotes set status = $2, decided_at = now() where id = $1`, [q.id, accepted ? 'accepted' : 'declined']);
      await tx.query(`update public.quick_event_requests set status = $2, updated_at = now() where id = $1`, [p.id, accepted ? 'quote_accepted' : 'quote_declined']);
      await booking.audit(tx, user.id, null, `quote.${accepted ? 'accepted' : 'declined'}`, 'service_quote', q.id);
      return { status: accepted ? 'accepted' : 'declined' };
    });
    if ('expired' in result) throw new HttpError(409, 'quote_expired');
    return result;
  });

  // ───────────── Support assistant ─────────────
  const budget = new UsageBudget(config.aiMaxRequestsPerUserPerHour);
  app.post('/api/support/assistant', { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireUser(req.user);
    const b = parse(SupportMessageBody, req.body);
    if (!budget.take(user.id)) throw new HttpError(429, 'assistant_budget_exceeded');
    return assistant.handle(user, b.message, b.orderRef);
  });

  app.get('/api/support/cases', async (req) => {
    const user = requireUser(req.user);
    return db.asUser(user.id, (tx) =>
      tx.query(`select c.reference, c.subject, c.category, c.status, c.priority, c.created_at, o.reference as order_ref from public.support_cases c left join public.orders o on o.id = c.order_id where c.user_id = auth.uid() order by c.created_at desc`),
    );
  });
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CheckoutBody, HoldAdmissionBody, HoldSeatsBody, LoginBody, uuid } from '@ebooking/shared';
import { parse, type Ctx } from '../app';
import { HttpError, createLocalUser, issueToken, requireUser, verifyPassword } from '../auth';
import { config } from '../config';

export async function bookingRoutes(app: FastifyInstance, { db, booking }: Ctx) {
  // ───────────── auth (local mode; Supabase Auth issues tokens in hosted mode) ─────────────
  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    if (config.authMode !== 'local') throw new HttpError(404, 'use_supabase_auth');
    const b = parse(LoginBody, req.body);
    const row = await db.one<{ id: string; email: string; password_hash: string }>(
      `select u.id, u.email, c.password_hash from auth.users u join auth.local_credentials c on c.user_id = u.id where u.email = lower($1)`,
      [b.email],
    );
    // identical error for unknown user / wrong password
    if (!row || !verifyPassword(b.password, row.password_hash)) throw new HttpError(401, 'invalid_credentials');
    return { token: await issueToken(row) };
  });

  app.post('/api/auth/register', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req) => {
    if (config.authMode !== 'local') throw new HttpError(404, 'use_supabase_auth');
    const b = parse(LoginBody.extend({ fullName: z.string().trim().min(2).max(100), password: z.string().min(8).max(200) }), req.body);
    const exists = await db.one(`select 1 from auth.users where email = lower($1)`, [b.email]);
    if (exists) throw new HttpError(409, 'email_taken');
    const id = await db.tx((tx) => createLocalUser(tx, b.email, b.password, b.fullName));
    return { token: await issueToken({ id, email: b.email.toLowerCase() }) };
  });

  app.get('/api/me', async (req) => {
    const u = requireUser(req.user);
    const profile = await db.asUser(u.id, (tx) => tx.one(`select full_name, mobile, locale, platform_role from public.profiles where id = auth.uid()`));
    const orgs = await db.asUser(u.id, (tx) => tx.query(`select o.id, o.name, o.slug, m.role from public.organization_members m join public.organizations o on o.id = m.org_id where m.user_id = auth.uid()`));
    return { id: u.id, email: u.email, platformRole: u.platformRole, profile, organizations: orgs };
  });

  // ───────────── holds (guests may hold with an anonymous session id) ─────────────
  const owner = (req: any) => ({ user: req.user, session: req.sessionId });

  app.post('/api/holds/seats', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const b = parse(HoldSeatsBody, req.body);
    return booking.holdSeats(b.performanceId, b.seatIds, owner(req));
  });

  app.post('/api/holds/admission', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const b = parse(HoldAdmissionBody, req.body);
    return booking.holdAdmission(b.performanceId, b.quantity, owner(req));
  });

  app.get('/api/holds/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    return booking.getHold(id, owner(req));
  });

  app.delete('/api/holds/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    await booking.releaseHold(id, owner(req));
    return { released: true };
  });

  // ───────────── checkout (authentication required here, not before) ─────────────
  app.post('/api/checkout', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireUser(req.user);
    const b = parse(CheckoutBody, req.body);
    return booking.checkout(b, user, req.sessionId);
  });

  app.get('/api/orders', async (req) => {
    const u = requireUser(req.user);
    // RLS-enforced read (defence in depth) + explicit filter
    return db.asUser(u.id, (tx) =>
      tx.query(
        `select o.id, o.reference, o.status, o.total_fils, o.created_at, o.demo, p.starts_at, e.title_ar, e.title_en, e.slug, e.inventory_type,
                (select count(*)::int from public.tickets t where t.order_id = o.id and t.status <> 'void') as ticket_count
           from public.orders o join public.performances p on p.id = o.performance_id join public.events e on e.id = p.event_id
          where o.user_id = auth.uid() order by o.created_at desc`,
      ),
    );
  });

  app.get('/api/orders/:ref', async (req) => {
    const u = requireUser(req.user);
    const { ref } = parse(z.object({ ref: z.string().regex(/^EBK-[A-Z0-9]{4,12}$/) }), req.params);
    const o = await db.one<{ id: string }>(`select id from public.orders where reference = $1 and user_id = $2`, [ref, u.id]);
    if (!o) throw new HttpError(404, 'order_not_found');
    return booking.orderView(o.id, u.id);
  });

  // customer-triggered status verification (asks provider; never charges)
  app.post('/api/orders/:ref/verify', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const u = requireUser(req.user);
    const { ref } = parse(z.object({ ref: z.string().regex(/^EBK-[A-Z0-9]{4,12}$/) }), req.params);
    const o = await db.one<{ id: string }>(`select id from public.orders where reference = $1 and user_id = $2`, [ref, u.id]);
    if (!o) throw new HttpError(404, 'order_not_found');
    await booking.reconcileOrder(o.id);
    return booking.orderView(o.id, u.id);
  });

  app.get('/api/tickets', async (req) => {
    const u = requireUser(req.user);
    const orders = await db.query<{ id: string }>(`select id from public.orders where user_id = $1 and status = 'confirmed' order by created_at desc`, [u.id]);
    return Promise.all(orders.map((o) => booking.orderView(o.id, u.id)));
  });

  // ───────────── payment provider webhook ─────────────
  app.post('/api/payments/webhook/demo', async (req, reply) => {
    const sig = req.headers['x-demo-signature'];
    const r = await booking.handleWebhook(req.rawBody ?? '', typeof sig === 'string' ? sig : undefined);
    return reply.status(200).send(r);
  });
}

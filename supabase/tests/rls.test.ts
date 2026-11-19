/**
 * Database-level RLS tests: run the SAME migrations as Supabase on embedded Postgres (PGlite),
 * switch to the `authenticated` / `anon` role with Supabase-style JWT claims, and prove access rules.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPgliteDb, migrate, type Db } from '../../apps/api/src/db';
import { seed, DEMO_USERS, ORG_GULF } from '../../apps/api/src/seed';

let db: Db;
const U = DEMO_USERS;
const count = async (user: string | null, sql: string, params: unknown[] = []) => (await db.asUser(user, (tx) => tx.one<{ n: number }>(`select count(*)::int as n from (${sql}) q`, params)))!.n;

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await seed(db, { presell: true });
});
afterAll(() => db.close());

describe('RLS: public catalogue', () => {
  it('anon sees published events but no orders, tickets, payments or profiles', async () => {
    expect(await count(null, 'select * from public.events')).toBeGreaterThan(0);
    for (const t of ['orders', 'tickets', 'payments', 'profiles', 'support_cases', 'audit_logs', 'quick_event_requests', 'organizations'])
      expect(await count(null, `select * from public.${t}`), t).toBe(0);
  });
  it('drafts are hidden from the public', async () => {
    await db.query(`update public.events set status = 'draft' where slug = 'echoes-of-the-gulf'`);
    expect(await count(null, `select * from public.events where slug = 'echoes-of-the-gulf'`)).toBe(0);
    expect(await count(U.owner.id, `select * from public.events where slug = 'echoes-of-the-gulf'`)).toBe(1);
    expect(await count(U.otherOwner.id, `select * from public.events where slug = 'echoes-of-the-gulf'`)).toBe(0);
    await db.query(`update public.events set status = 'published' where slug = 'echoes-of-the-gulf'`);
  });
});

describe('RLS: customers', () => {
  it('a customer sees only their own orders and tickets', async () => {
    const buyerOrders = await count(U.buyers.id, 'select * from public.orders');
    expect(buyerOrders).toBeGreaterThan(0);
    expect(await count(U.customer.id, 'select * from public.orders')).toBe(0);
    expect(await count(U.customer.id, 'select * from public.tickets')).toBe(0);
    expect(await count(U.customer.id, 'select * from public.payments')).toBe(0);
  });
  it('clients cannot write directly (all mutations are server-side)', async () => {
    await expect(db.asUser(U.customer.id, (tx) => tx.query(`insert into public.support_cases(reference, user_id, subject) values ('X', $1, 'x')`, [U.customer.id]))).rejects.toThrow(/permission denied/);
    await expect(db.asUser(U.customer.id, (tx) => tx.query(`update public.performance_seat_inventory set status = 'available'`))).rejects.toThrow(/permission denied/);
    await expect(db.asUser(U.customer.id, (tx) => tx.query(`update public.profiles set platform_role = 'platform_admin' where id = auth.uid()`))).rejects.toThrow(/permission denied/);
  });
  it('clients cannot call the booking functions directly', async () => {
    await expect(db.asUser(U.customer.id, (tx) => tx.query(`select app.confirm_order(gen_random_uuid())`))).rejects.toThrow(/permission denied/);
    await expect(db.asUser(U.customer.id, (tx) => tx.query(`select app.hold_seats(gen_random_uuid(), array['x'], auth.uid(), null, 60, 6)`))).rejects.toThrow(/permission denied/);
  });
});

describe('RLS: organizers', () => {
  it('owner sees orders of their own events; other org sees none', async () => {
    const all = (await db.one<{ n: number }>(`select count(*)::int n from public.orders`))!.n;
    expect(await count(U.owner.id, 'select * from public.orders')).toBe(all);
    expect(await count(U.otherOwner.id, 'select * from public.orders')).toBe(0);
  });
  it('staff see tickets (for check-in) but not orders or payments', async () => {
    expect(await count(U.staff.id, 'select * from public.tickets')).toBeGreaterThan(0);
    expect(await count(U.staff.id, 'select * from public.orders')).toBe(0);
    expect(await count(U.staff.id, 'select * from public.payments')).toBe(0);
  });
  it('organization membership is only visible to members', async () => {
    expect(await count(U.otherOwner.id, `select * from public.organization_members where org_id = $1`, [ORG_GULF])).toBe(0);
    expect(await count(U.owner.id, `select * from public.organization_members where org_id = $1`, [ORG_GULF])).toBe(3);
  });
  it('audit logs: only org owners (own org) and platform admins', async () => {
    await db.query(`insert into public.audit_logs(org_id, action, entity) values ($1, 'test', 'x')`, [ORG_GULF]);
    expect(await count(U.owner.id, `select * from public.audit_logs where org_id = $1`, [ORG_GULF])).toBeGreaterThan(0);
    expect(await count(U.manager.id, `select * from public.audit_logs`)).toBe(0);
    expect(await count(U.otherOwner.id, `select * from public.audit_logs where org_id = $1`, [ORG_GULF])).toBe(0);
    expect(await count(U.admin.id, `select * from public.audit_logs`)).toBeGreaterThan(0);
  });
});

describe('security definer hygiene', () => {
  it('every SECURITY DEFINER function pins search_path', async () => {
    const rows = await db.query<{ proname: string; cfg: string[] | null }>(
      `select p.proname, p.proconfig as cfg from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.prosecdef`,
    );
    expect(rows.length).toBeGreaterThan(5);
    for (const r of rows) expect((r.cfg ?? []).some((c) => c.startsWith('search_path=')), r.proname).toBe(true);
  });
  it('every public table has RLS enabled', async () => {
    const rows = await db.query<{ relname: string }>(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});

import { randomUUID } from 'node:crypto';
import { createPgliteDb, migrate, type Db } from './db';
import { seed, DEMO_USERS, DEMO_PASSWORD } from './seed';
import { buildApp } from './app';

export async function setup(opts: { presell?: boolean } = {}) {
  const db: Db = await createPgliteDb();
  await migrate(db);
  await seed(db, { presell: opts.presell ?? false });
  const tasks: (() => void)[] = [];
  const { app, ctx } = await buildApp(db, { schedule: (fn) => void tasks.push(fn) });
  /** Deliver all queued simulated gateway callbacks (webhooks, delayed confirmations). */
  const flush = async () => {
    while (tasks.length) {
      const batch = tasks.splice(0);
      for (const t of batch) t();
      await new Promise((r) => setTimeout(r, 30));
    }
  };
  const tokens: Record<string, string> = {};
  for (const [k, u] of Object.entries(DEMO_USERS)) {
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: u.email, password: DEMO_PASSWORD } });
    tokens[k] = r.json().token;
  }
  const call = async (method: string, url: string, opts: { as?: keyof typeof DEMO_USERS | null; body?: unknown; session?: string; token?: string } = {}) => {
    const headers: Record<string, string> = {};
    const token = opts.token ?? (opts.as ? tokens[opts.as] : undefined);
    if (token) headers.authorization = `Bearer ${token}`;
    if (opts.session) headers['x-session-id'] = opts.session;
    const r = await app.inject({ method: method as any, url, headers, payload: opts.body as any });
    return { status: r.statusCode, body: r.body ? (() => { try { return r.json(); } catch { return r.body; } })() : null };
  };
  const firstPerformance = async (slug: string) => {
    const r = await call('GET', `/api/events/${slug}`);
    return r.body.performances[0].id as string;
  };
  const newSession = () => randomUUID().replace(/-/g, '');
  return { db, app, ctx, call, flush, tokens, firstPerformance, newSession };
}

export const contact = { name: 'عميل تجريبي', email: 'customer@demo.ebooking.test', mobile: '99887766' };
export const idem = () => `idem-${randomUUID()}`;

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, contact, idem } from './test-helpers';
import { ORG_GULF } from './seed';

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  t = await setup({ presell: false });
});
afterAll(async () => {
  await t.app.close();
  await t.db.close();
});

describe('organizer revenue reporting', () => {
  it('net = gross − refunds − commission, with refunds subtracted exactly once', async () => {
    const perf = await t.firstPerformance('mubarakiya-nights');
    const buy = async (seat: string) => {
      const session = t.newSession();
      const h = await t.call('POST', '/api/holds/seats', { session, body: { performanceId: perf, seatIds: [seat] } });
      const o = await t.call('POST', '/api/checkout', { as: 'customer', session, body: { holdId: h.body.id, contact, method: 'knet', idempotencyKey: idem() } });
      expect(o.body.status).toBe('confirmed');
      return o.body;
    };
    const a = await buy('VIP-A-3'); // 45 KWD
    await buy('BAL-BA-4'); // 10 KWD
    const refund = await t.call('POST', `/api/admin/orders/${a.reference}/refund`, { as: 'admin', body: { confirm: true } });
    expect(refund.body.status).toBe('refunded');

    const d = await t.call('GET', `/api/org/${ORG_GULF}/dashboard`, { as: 'owner' });
    expect(d.status).toBe(200);
    expect(d.body.totals.gross_fils).toBe(55000); // both sales happened
    expect(d.body.totals.refunds_fils).toBe(45000); // one refunded
    expect(d.body.totals.netFils).toBe(10000); // commission not configured (null → 0)
    expect(d.body.totals.commissionConfigured).toBe(false);
    // the refunded seat is sellable again
    const map = await t.call('GET', `/api/performances/${perf}/availability`);
    expect(map.body.seats.find((s: any) => s.c === 'VIP-A-3').s).toBe('available');
  });
});

describe('organizer event lifecycle', () => {
  const body = (startsAt: string) => ({ titleAr: 'أمسية شعرية تجريبية', titleEn: 'Demo Poetry Evening', category: 'family', inventoryType: 'general_admission', capacity: 80, priceFils: 5000, startsAt });

  it('rejects a start time in the past with a 400 (not a 500)', async () => {
    const r = await t.call('POST', `/api/org/${ORG_GULF}/events`, { as: 'manager', body: body(new Date(Date.now() - 3600_000).toISOString()) });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('starts_at_in_past');
  });

  it('create → pending approval → admin returns to draft → organizer resubmits', async () => {
    const c = await t.call('POST', `/api/org/${ORG_GULF}/events`, { as: 'manager', body: body(new Date(Date.now() + 7 * 86400_000).toISOString()) });
    expect(c.body.status).toBe('pending_approval');
    // not public yet
    expect((await t.call('GET', `/api/events/${c.body.slug}`)).status).toBe(404);
    // cannot resubmit while already pending
    expect((await t.call('POST', `/api/org/${ORG_GULF}/events/${c.body.id}/submit`, { as: 'manager' })).status).toBe(409);
    expect((await t.call('POST', `/api/admin/events/${c.body.id}/decision`, { as: 'admin', body: { decision: 'draft' } })).body.status).toBe('draft');
    // staff and other orgs cannot resubmit
    expect((await t.call('POST', `/api/org/${ORG_GULF}/events/${c.body.id}/submit`, { as: 'staff' })).status).toBe(403);
    expect((await t.call('POST', `/api/org/10000000-0000-4000-a000-000000000002/events/${c.body.id}/submit`, { as: 'otherOwner' })).status).toBe(409);
    const s = await t.call('POST', `/api/org/${ORG_GULF}/events/${c.body.id}/submit`, { as: 'owner' });
    expect(s.body.status).toBe('pending_approval');
    expect((await t.call('POST', `/api/admin/events/${c.body.id}/decision`, { as: 'admin', body: { decision: 'published' } })).body.status).toBe('published');
    expect((await t.call('GET', `/api/events/${c.body.slug}`)).status).toBe(200);
  });
});

describe('refunds & re-pricing consistency', () => {
  it('refunding a confirmed general-admission order puts the places back on sale', async () => {
    const perf = await t.firstPerformance('diwaniya-standup');
    const before = await t.db.one<any>(`select sold from public.capacity_inventory where performance_id = $1`, [perf]);
    const session = t.newSession();
    const h = await t.call('POST', '/api/holds/admission', { session, body: { performanceId: perf, quantity: 3 } });
    const o = await t.call('POST', '/api/checkout', { as: 'customer', session, body: { holdId: h.body.id, contact, method: 'knet', idempotencyKey: idem() } });
    expect(o.body.status).toBe('confirmed');
    expect((await t.db.one<any>(`select sold from public.capacity_inventory where performance_id = $1`, [perf])).sold).toBe(before.sold + 3);
    await t.call('POST', `/api/admin/orders/${o.body.reference}/refund`, { as: 'admin', body: { confirm: true } });
    expect((await t.db.one<any>(`select sold from public.capacity_inventory where performance_id = $1`, [perf])).sold).toBe(before.sold);
  });

  it('a retry after a failed payment re-prices line items together with totals', async () => {
    const perf = await t.firstPerformance('mubarakiya-nights');
    const session = t.newSession();
    const h = await t.call('POST', '/api/holds/seats', { session, body: { performanceId: perf, seatIds: ['PRC-F-3'] } });
    const failed = await t.call('POST', '/api/checkout', { as: 'customer', session, body: { holdId: h.body.id, contact, method: 'knet', demoScenario: 'fail', idempotencyKey: idem() } });
    expect(failed.body.status).toBe('payment_failed');
    await t.db.query(`update public.ticket_categories set price_fils = 33000 where id = (select category_id from public.performance_seat_inventory where performance_id = $1 and seat_code = 'PRC-F-3')`, [perf]);
    const ok = await t.call('POST', '/api/checkout', { as: 'customer', session, body: { holdId: h.body.id, contact, method: 'knet', idempotencyKey: idem() } });
    expect(ok.body.status).toBe('confirmed');
    const lines = ok.body.items.reduce((a: number, i: any) => a + i.unit_price_fils * i.quantity, 0);
    expect(lines).toBe(ok.body.subtotalFils);
    expect(lines).toBe(33000);
  });
});

describe('quote expiry', () => {
  it('an expired quote returns 409 and is persisted as expired', async () => {
    const qe = await t.call('POST', '/api/quick-events', { as: 'customer', body: { companyName: 'Exp Co', contactName: 'Ali', email: 'a@demo.test', mobile: '99112233', venueName: 'Hall', eventType: 'Expo', proposedDates: 'Jan', expectedAttendance: 50, admission: 'free', seatingMode: 'general_admission' } });
    await t.call('POST', `/api/admin/quick-events/${qe.body.id}/status`, { as: 'admin', body: { status: 'under_review' } });
    const q = await t.call('POST', `/api/admin/quick-events/${qe.body.id}/quotes`, { as: 'admin', body: { items: [{ description: 'Setup', amountFils: 1000, quantity: 1 }], validDays: 1 } });
    await t.db.query(`update public.service_quotes set valid_until = (now() - interval '5 days')::date where id = $1`, [q.body.id]);
    const r = await t.call('POST', `/api/quick-events/${qe.body.id}/quotes/${q.body.id}/accept`, { as: 'customer' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('quote_expired');
    expect((await t.db.one<any>(`select status from public.service_quotes where id = $1`, [q.body.id])).status).toBe('expired');
  });
});

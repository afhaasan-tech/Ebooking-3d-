import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, contact, idem } from './test-helpers';

let t: Awaited<ReturnType<typeof setup>>;
let perf: string;

beforeAll(async () => {
  t = await setup({ presell: true });
  perf = await t.firstPerformance('mubarakiya-nights');
});
afterAll(async () => {
  await t.app.close();
  await t.db.close();
});

async function availableSeats(n: number, section = 'STC'): Promise<string[]> {
  const r = await t.call('GET', `/api/performances/${perf}/seatmap`);
  const rows = new Map<string, any[]>();
  for (const s of r.body.seats) if (s.status === 'available' && s.section === section) (rows.get(s.row) ?? rows.set(s.row, []).get(s.row)!).push(s);
  for (const list of rows.values()) {
    list.sort((a, b) => a.number - b.number);
    for (let i = 0; i + n <= list.length; i++) {
      const w = list.slice(i, i + n);
      if (w.every((s, j) => !j || s.number === w[j - 1].number + 1)) return w.map((s) => s.id);
    }
  }
  throw new Error('no seats');
}

async function bookAndPay(seats: string[], scenario = 'success', as: 'customer' | 'owner' = 'customer') {
  const session = t.newSession();
  const hold = await t.call('POST', '/api/holds/seats', { session, body: { performanceId: perf, seatIds: seats } });
  expect(hold.status).toBe(200);
  const key = idem();
  const res = await t.call('POST', '/api/checkout', { as, session, body: { holdId: hold.body.id, contact, method: 'knet', demoScenario: scenario, idempotencyKey: key } });
  return { hold, res, key, session };
}

describe('catalogue & seat map', () => {
  it('lists published demo events', async () => {
    const r = await t.call('GET', '/api/events');
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThanOrEqual(4);
    expect(r.body.every((e: any) => e.demo)).toBe(true);
  });
  it('seat map exposes uniquely identified seats with geometry and status', async () => {
    const r = await t.call('GET', `/api/performances/${perf}/seatmap`);
    const ids = r.body.seats.map((s: any) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.body.seats.some((s: any) => s.status === 'sold')).toBe(true); // demo presales
    expect(r.body.performance.preview_authenticity).toBe('simulated');
  });
});

describe('holds', () => {
  it('holds available seats and prices them on the server', async () => {
    const seats = await availableSeats(2);
    const r = await t.call('POST', '/api/holds/seats', { session: t.newSession(), body: { performanceId: perf, seatIds: seats } });
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(2);
    // Standard 20 KWD x2 + 2% + 0.250 per ticket
    expect(r.body.pricing.subtotalFils).toBe(40000);
    expect(r.body.pricing.serviceFeeFils).toBe(800 + 500);
    expect(r.body.pricing.totalFils).toBe(41300);
  });

  it('rejects sold seats', async () => {
    const map = await t.call('GET', `/api/performances/${perf}/seatmap`);
    const sold = map.body.seats.find((s: any) => s.status === 'sold').id;
    const r = await t.call('POST', '/api/holds/seats', { session: t.newSession(), body: { performanceId: perf, seatIds: [sold] } });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('seat_unavailable');
  });

  it('enforces max 6 seats server-side', async () => {
    const seats = await availableSeats(7, 'BAL').catch(async () => [...(await availableSeats(4, 'BAL')), ...(await availableSeats(3, 'STC'))]);
    const r = await t.call('POST', '/api/holds/seats', { session: t.newSession(), body: { performanceId: perf, seatIds: seats } });
    expect(r.status).toBe(400);
  });

  it('replacing the basket (add/remove seat) keeps one hold per owner', async () => {
    const session = t.newSession();
    const [a, b] = await availableSeats(2, 'PRC');
    const h1 = await t.call('POST', '/api/holds/seats', { session, body: { performanceId: perf, seatIds: [a] } });
    const h2 = await t.call('POST', '/api/holds/seats', { session, body: { performanceId: perf, seatIds: [a, b] } });
    expect(h2.status).toBe(200);
    const old = await t.call('GET', `/api/holds/${h1.body.id}`, { session });
    expect(old.body.status).toBe('released');
    const h3 = await t.call('POST', '/api/holds/seats', { session, body: { performanceId: perf, seatIds: [b] } });
    const map = await t.call('GET', `/api/performances/${perf}/availability`);
    const st = Object.fromEntries(map.body.seats.map((s: any) => [s.c, s.s]));
    expect(st[a]).toBe('available');
    expect(st[b]).toBe('held');
    expect(h3.body.items).toHaveLength(1);
  });

  it('another session cannot read or release my hold', async () => {
    const seats = await availableSeats(1, 'PRL');
    const mine = await t.call('POST', '/api/holds/seats', { session: t.newSession(), body: { performanceId: perf, seatIds: seats } });
    expect((await t.call('GET', `/api/holds/${mine.body.id}`, { session: t.newSession() })).status).toBe(404);
    expect((await t.call('DELETE', `/api/holds/${mine.body.id}`, { session: t.newSession() })).status).toBe(404);
  });

  it('expired holds are released and can be taken by others', async () => {
    const seats = await availableSeats(1, 'PRR');
    const s1 = t.newSession();
    const h = await t.call('POST', '/api/holds/seats', { session: s1, body: { performanceId: perf, seatIds: seats } });
    await t.db.query(`update public.seat_holds set expires_at = now() - interval '1 second' where id = $1`, [h.body.id]);
    const other = await t.call('POST', '/api/holds/seats', { session: t.newSession(), body: { performanceId: perf, seatIds: seats } });
    expect(other.status).toBe(200);
    const res = await t.call('POST', '/api/checkout', { as: 'customer', session: s1, body: { holdId: h.body.id, contact, method: 'knet', idempotencyKey: idem() } });
    expect(res.status).toBe(410);
  });

  it('CONCURRENCY: 10 buyers race for the same seat — exactly one wins', async () => {
    const [seat] = await availableSeats(1, 'VIP');
    const results = await Promise.all(Array.from({ length: 10 }, () => t.call('POST', '/api/holds/seats', { session: t.newSession(), body: { performanceId: perf, seatIds: [seat] } })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
  });

  it('general admission enforces capacity atomically', async () => {
    const ga = await t.firstPerformance('diwaniya-standup');
    await t.db.query(`update public.capacity_inventory set capacity = held + sold + 5 where performance_id = $1`, [ga]);
    const results = await Promise.all(Array.from({ length: 4 }, () => t.call('POST', '/api/holds/admission', { session: t.newSession(), body: { performanceId: ga, quantity: 2 } })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    expect(results.filter((r) => r.body?.error === 'capacity_exceeded')).toHaveLength(2);
  });
});

describe('checkout & payments', () => {
  it('requires authentication for checkout', async () => {
    const seats = await availableSeats(1, 'STL');
    const session = t.newSession();
    const h = await t.call('POST', '/api/holds/seats', { session, body: { performanceId: perf, seatIds: seats } });
    const r = await t.call('POST', '/api/checkout', { session, body: { holdId: h.body.id, contact, method: 'knet', idempotencyKey: idem() } });
    expect(r.status).toBe(401);
  });

  it('success → confirmed with one ticket per seat; duplicate webhook does not duplicate tickets', async () => {
    const seats = await availableSeats(2, 'STR');
    const { res } = await bookAndPay(seats, 'success');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
    expect(res.body.tickets).toHaveLength(2);
    expect(res.body.tickets[0].qr).toMatch(/^EBK1\./);
    await t.flush(); // webhook arrives after the synchronous confirmation
    const again = await t.call('GET', `/api/orders/${res.body.reference}`, { as: 'customer' });
    expect(again.body.tickets).toHaveLength(2);
  });

  it('client cannot influence the total (server ignores any submitted totals)', async () => {
    const seats = await availableSeats(1, 'VIP');
    const session = t.newSession();
    const h = await t.call('POST', '/api/holds/seats', { session, body: { performanceId: perf, seatIds: seats } });
    const r = await t.call('POST', '/api/checkout', { as: 'customer', session, body: { holdId: h.body.id, contact, method: 'card', idempotencyKey: idem(), totalFils: 1 } as any });
    expect(r.body.totalFils).toBe(45000 + 900 + 250);
  });

  it('failure → payment_failed, seats remain held for a retry, no tickets', async () => {
    const seats = await availableSeats(1, 'STC');
    const { res, session, hold } = await bookAndPay(seats, 'fail');
    expect(res.body.status).toBe('payment_failed');
    expect(res.body.tickets).toHaveLength(0);
    const retry = await t.call('POST', '/api/checkout', { as: 'customer', session, body: { holdId: hold.body.id, contact, method: 'knet', demoScenario: 'success', idempotencyKey: idem() } });
    expect(retry.body.status).toBe('confirmed');
    expect(retry.body.reference).toBe(res.body.reference);
  });

  it('delayed confirmation → processing until the verified webhook arrives', async () => {
    const seats = await availableSeats(2, 'BAL');
    const { res } = await bookAndPay(seats, 'delayed');
    expect(res.body.status).toBe('payment_processing');
    await t.flush();
    const r = await t.call('GET', `/api/orders/${res.body.reference}`, { as: 'customer' });
    expect(r.body.status).toBe('confirmed');
    expect(r.body.tickets).toHaveLength(2);
  });

  it('gateway confirms but our call times out → unknown status, recovered without a second charge', async () => {
    const before = t.ctx.provider.chargeCount;
    const seats = await availableSeats(1, 'PRL');
    const { res, key, session, hold } = await bookAndPay(seats, 'confirm_after_timeout');
    expect(res.body.status).toBe('payment_processing');
    expect(res.body.payments[0].status).toBe('unknown');
    // customer retries with the SAME idempotency key → same order, no new charge
    const retry = await t.call('POST', '/api/checkout', { as: 'customer', session, body: { holdId: hold.body.id, contact, method: 'knet', demoScenario: 'success', idempotencyKey: key } });
    expect(retry.body.reference).toBe(res.body.reference);
    // a retry with a NEW key while payment is in flight is refused (prevents double charge)
    const second = await t.call('POST', '/api/checkout', { as: 'customer', session, body: { holdId: hold.body.id, contact, method: 'knet', idempotencyKey: idem() } });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('payment_in_progress');
    // reconciliation via provider status query (also happens via webhook/sweeper)
    const v = await t.call('POST', `/api/orders/${res.body.reference}/verify`, { as: 'customer' });
    expect(v.body.status).toBe('confirmed');
    await t.flush();
    expect(t.ctx.provider.chargeCount - before).toBe(1);
    const final = await t.call('GET', `/api/orders/${res.body.reference}`, { as: 'customer' });
    expect(final.body.tickets).toHaveLength(1);
  });

  it('duplicate_webhook scenario issues tickets once', async () => {
    const seats = await availableSeats(3, 'STC');
    const { res } = await bookAndPay(seats, 'duplicate_webhook');
    await t.flush();
    const n = await t.db.one<{ n: number }>(`select count(*)::int as n from public.tickets t join public.orders o on o.id = t.order_id where o.reference = $1`, [res.body.reference]);
    expect(n!.n).toBe(3);
    const ev = await t.db.one<{ n: number }>(`select count(*)::int as n from public.payment_provider_events`);
    expect(ev!.n).toBeGreaterThan(0);
  });

  it('forged webhook is rejected', async () => {
    const r = await t.app.inject({ method: 'POST', url: '/api/payments/webhook/demo', headers: { 'content-type': 'application/json', 'x-demo-signature': 'deadbeef' }, payload: JSON.stringify({ eventId: 'x', providerRef: 'y', paymentId: 'z', type: 'payment.succeeded', amountFils: 1 }) });
    expect(r.statusCode).toBe(401);
  });

  it('verified payment after seats were lost → reconciliation_required, NO ticket, support case opened', async () => {
    const seats = await availableSeats(1, 'PRR');
    const { res, hold } = await bookAndPay(seats, 'delayed');
    expect(res.body.status).toBe('payment_processing');
    // simulate: hold expired & seat sold to someone else before the confirmation arrived
    await t.db.query(`update public.seat_holds set expires_at = now() - interval '1 second' where id = $1`, [hold.body.id]);
    await t.db.tx((tx) => tx.query(`select app.release_expired_holds(null)`));
    const thief = await bookAndPay(seats, 'success', 'owner');
    expect(thief.res.body.status).toBe('confirmed');
    await t.flush();
    const r = await t.call('GET', `/api/orders/${res.body.reference}`, { as: 'customer' });
    expect(r.body.status).toBe('reconciliation_required');
    expect(r.body.tickets).toHaveLength(0);
    expect(r.body.supportCase.category).toBe('reconciliation');
    // invariant: only one live ticket for that seat
    const live = await t.db.one<{ n: number }>(`select count(*)::int n from public.tickets where performance_id = $1 and seat_code = $2 and status <> 'void'`, [perf, seats[0]]);
    expect(live!.n).toBe(1);
    // admin refunds after provider verification
    const refund = await t.call('POST', `/api/admin/orders/${res.body.reference}/refund`, { as: 'admin', body: { confirm: true } });
    expect(refund.body.status).toBe('refunded');
  });

  it('database invariant: a seat can never have two live tickets', async () => {
    const t1 = await t.db.one<any>(`select order_id, order_item_id, performance_id, seat_code from public.tickets where seat_code is not null and status = 'valid' limit 1`);
    await expect(t.db.query(`insert into public.tickets(order_id, order_item_id, performance_id, seat_code, admission_index) values ($1,$2,$3,$4,2)`, [t1.order_id, t1.order_item_id, t1.performance_id, t1.seat_code])).rejects.toThrow();
  });
});

describe('tickets & check-in', () => {
  it('staff can check in once; second scan is rejected; forged code invalid', async () => {
    const seats = await availableSeats(1, 'STL');
    const { res } = await bookAndPay(seats);
    const qr = res.body.tickets[0].qr;
    const org = '10000000-0000-4000-a000-000000000001';
    const a = await t.call('POST', `/api/org/${org}/checkin`, { as: 'staff', body: { code: qr } });
    expect(a.body.result).toBe('checked_in');
    const b = await t.call('POST', `/api/org/${org}/checkin`, { as: 'staff', body: { code: qr } });
    expect(b.body.result).toBe('already_used');
    const forged = qr.slice(0, -4) + 'AAAA';
    expect((await t.call('POST', `/api/org/${org}/checkin`, { as: 'staff', body: { code: forged } })).body.result).toBe('invalid_code');
    // other organizer cannot check in Gulf Stage tickets
    const other = await t.call('POST', `/api/org/10000000-0000-4000-a000-000000000002/checkin`, { as: 'otherOwner', body: { code: qr } });
    expect(other.body.result).toBe('not_for_this_organizer');
  });
});

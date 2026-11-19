import { describe, it, expect } from 'vitest';
import { priceOrder, organizerNet } from './pricing';
import { ORDER_TRANSITIONS, assertTransition, canTransition, QUOTE_TRANSITIONS } from './states';
import { DemoPaymentProvider, GatewayTimeoutError, signPayload } from './payments';

describe('pricing', () => {
  it('computes authoritative totals in fils', () => {
    const p = priceOrder(
      [
        { ref: 'a', unitPriceFils: 45000, quantity: 1 },
        { ref: 'b', unitPriceFils: 20000, quantity: 2 },
      ],
      { serviceFeeBps: 500, serviceFeeFixedFils: 250 },
    );
    expect(p.subtotalFils).toBe(85000);
    expect(p.serviceFeeFils).toBe(4250 + 750);
    expect(p.totalFils).toBe(90000);
  });
  it('free events have no fee', () => {
    expect(priceOrder([{ ref: 'x', unitPriceFils: 0, quantity: 3 }], { serviceFeeBps: 500, serviceFeeFixedFils: 250 }).totalFils).toBe(0);
  });
  it('rejects float prices', () => {
    expect(() => priceOrder([{ ref: 'x', unitPriceFils: 10.5, quantity: 1 }], { serviceFeeBps: 0, serviceFeeFixedFils: 0 })).toThrow();
  });
  it('organizer net subtracts refunds and commission', () => {
    expect(organizerNet(100000, 20000, 300)).toEqual({ commissionFils: 2400, netFils: 77600 });
  });
});

describe('state machines', () => {
  it('blocks invalid order transitions', () => {
    expect(canTransition(ORDER_TRANSITIONS, 'confirmed', 'pending_payment')).toBe(false);
    expect(() => assertTransition(ORDER_TRANSITIONS, 'cancelled', 'confirmed')).toThrow();
    expect(canTransition(ORDER_TRANSITIONS, 'expired', 'reconciliation_required')).toBe(true);
  });
  it('quotes cannot be accepted twice or after decline', () => {
    expect(canTransition(QUOTE_TRANSITIONS, 'declined', 'accepted')).toBe(false);
    expect(canTransition(QUOTE_TRANSITIONS, 'sent', 'accepted')).toBe(true);
  });
});

describe('demo payment provider', () => {
  const mk = () => {
    const sent: string[] = [];
    const tasks: (() => void)[] = [];
    const p = new DemoPaymentProvider('secret', async (b) => void sent.push(b), (fn) => void tasks.push(fn));
    return { p, sent, flush: () => tasks.splice(0).forEach((t) => t()) };
  };
  const base = { paymentId: 'p1', orderReference: 'R1', amountFils: 1000, method: 'knet' as const };

  it('is idempotent: same key never charges twice', async () => {
    const { p } = mk();
    const a = await p.createPayment({ ...base, idempotencyKey: 'k'.repeat(20) });
    const b = await p.createPayment({ ...base, idempotencyKey: 'k'.repeat(20) });
    expect(a.providerRef).toBe(b.providerRef);
    expect(p.chargeCount).toBe(1);
  });
  it('timeout scenario charges once and is recoverable by idempotency key', async () => {
    const { p, sent, flush } = mk();
    await expect(p.createPayment({ ...base, idempotencyKey: 't'.repeat(20), scenario: 'confirm_after_timeout' })).rejects.toBeInstanceOf(GatewayTimeoutError);
    const ref = p.findByIdempotencyKey('t'.repeat(20))!;
    expect((await p.getStatus(ref))!.status).toBe('succeeded');
    flush();
    expect(sent).toHaveLength(1);
    expect(p.chargeCount).toBe(1);
  });
  it('duplicate webhook scenario emits duplicate event ids', async () => {
    const { p, sent, flush } = mk();
    await p.createPayment({ ...base, idempotencyKey: 'd'.repeat(20), scenario: 'duplicate_webhook' });
    flush();
    const ids = sent.map((s) => JSON.parse(s).eventId);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(2);
  });
  it('rejects forged webhooks', () => {
    const { p } = mk();
    const body = JSON.stringify({ eventId: 'e', providerRef: 'r', paymentId: 'p', type: 'payment.succeeded', amountFils: 1 });
    expect(p.verifyWebhook(body, signPayload('wrong', body))).toBeNull();
    expect(p.verifyWebhook(body, signPayload('secret', body))).not.toBeNull();
    expect(p.verifyWebhook(body, undefined)).toBeNull();
  });
});

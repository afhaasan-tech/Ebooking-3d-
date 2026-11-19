import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { DemoScenario, PaymentMethod } from '@ebooking/shared';

export type ProviderStatus = 'pending' | 'succeeded' | 'failed' | 'unknown';

export interface CreatePaymentInput {
  paymentId: string;
  orderReference: string;
  amountFils: number;
  method: PaymentMethod;
  idempotencyKey: string;
  scenario?: DemoScenario;
}

export interface CreatePaymentResult {
  providerRef: string;
  status: ProviderStatus;
}

export interface ProviderEvent {
  eventId: string;
  providerRef: string;
  paymentId: string;
  type: 'payment.succeeded' | 'payment.failed' | 'refund.succeeded';
  amountFils: number;
}

/**
 * Abstraction over payment gateways (demo simulator now; KNET-compatible / Apple Pay / hosted card later).
 * Rules: a browser redirect is never proof of payment. Only verified webhooks or getStatus() count.
 */
export interface PaymentProvider {
  readonly name: string;
  readonly isDemo: boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  getStatus(providerRef: string): Promise<{ status: ProviderStatus; amountFils: number } | null>;
  verifyWebhook(rawBody: string, signature: string | undefined): ProviderEvent | null;
  refund(providerRef: string, amountFils: number): Promise<{ status: 'succeeded' | 'failed' | 'pending' }>;
}

export class GatewayTimeoutError extends Error {
  constructor(public readonly providerRef: string) {
    super('gateway_timeout');
  }
}

export function signPayload(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function verifySignature(secret: string, body: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signPayload(secret, body), 'hex');
  let given: Buffer;
  try {
    given = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

interface GatewayTx {
  providerRef: string;
  paymentId: string;
  amountFils: number;
  status: ProviderStatus;
  idempotencyKey: string;
  refunded: boolean;
}

export type WebhookDispatcher = (rawBody: string, signature: string) => Promise<void>;
export type Scheduler = (fn: () => void, ms: number) => void;

/**
 * Deterministic demo gateway. It simulates an EXTERNAL system: it keeps its own ledger,
 * de-duplicates by idempotency key (never charges twice) and sends signed webhooks.
 */
export class DemoPaymentProvider implements PaymentProvider {
  readonly name = 'demo';
  readonly isDemo = true;
  private ledger = new Map<string, GatewayTx>();
  private byIdem = new Map<string, string>();
  /** Number of distinct charges actually performed — used by tests to prove "no double charge". */
  chargeCount = 0;

  constructor(
    private readonly secret: string,
    private readonly dispatch: WebhookDispatcher,
    private readonly schedule: Scheduler = (fn, ms) => void setTimeout(fn, ms),
    private readonly delays = { webhook: 250, delayed: 4000, afterTimeout: 2500 },
  ) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const existing = this.byIdem.get(input.idempotencyKey);
    if (existing) {
      const tx = this.ledger.get(existing)!;
      return { providerRef: tx.providerRef, status: tx.status };
    }
    const providerRef = `DEMO-${randomUUID()}`;
    const scenario = input.scenario ?? 'success';
    const tx: GatewayTx = { providerRef, paymentId: input.paymentId, amountFils: input.amountFils, status: 'pending', idempotencyKey: input.idempotencyKey, refunded: false };
    this.ledger.set(providerRef, tx);
    this.byIdem.set(input.idempotencyKey, providerRef);

    switch (scenario) {
      case 'success':
        this.charge(tx, 'succeeded');
        this.emit(tx, 'payment.succeeded', this.delays.webhook);
        return { providerRef, status: 'succeeded' };
      case 'fail':
        tx.status = 'failed';
        this.emit(tx, 'payment.failed', this.delays.webhook);
        return { providerRef, status: 'failed' };
      case 'delayed':
        this.schedule(() => {
          this.charge(tx, 'succeeded');
          this.emit(tx, 'payment.succeeded', 0);
        }, this.delays.delayed);
        return { providerRef, status: 'pending' };
      case 'duplicate_webhook': {
        this.charge(tx, 'succeeded');
        const eventId = `evt_${randomUUID()}`;
        this.emit(tx, 'payment.succeeded', this.delays.webhook, eventId);
        this.emit(tx, 'payment.succeeded', this.delays.webhook + 50, eventId); // exact duplicate delivery
        this.emit(tx, 'payment.succeeded', this.delays.webhook + 100); // same payment, new event id
        return { providerRef, status: 'succeeded' };
      }
      case 'confirm_after_timeout':
        // Gateway charges the customer, but our call "times out" before we learn the result.
        this.charge(tx, 'succeeded');
        this.emit(tx, 'payment.succeeded', this.delays.afterTimeout);
        throw new GatewayTimeoutError(providerRef);
    }
  }

  async getStatus(providerRef: string) {
    const tx = this.ledger.get(providerRef);
    return tx ? { status: tx.status, amountFils: tx.amountFils } : null;
  }

  /** Lookup by our idempotency key — used to recover when createPayment timed out before returning a ref. */
  findByIdempotencyKey(key: string): string | null {
    return this.byIdem.get(key) ?? null;
  }

  verifyWebhook(rawBody: string, signature: string | undefined): ProviderEvent | null {
    if (!verifySignature(this.secret, rawBody, signature)) return null;
    try {
      const e = JSON.parse(rawBody) as ProviderEvent;
      if (!e.eventId || !e.providerRef || !e.type) return null;
      return e;
    } catch {
      return null;
    }
  }

  async refund(providerRef: string, amountFils: number) {
    const tx = this.ledger.get(providerRef);
    if (!tx || tx.status !== 'succeeded' || tx.refunded || amountFils > tx.amountFils) return { status: 'failed' as const };
    tx.refunded = true;
    this.emit(tx, 'refund.succeeded', this.delays.webhook);
    return { status: 'succeeded' as const };
  }

  private charge(tx: GatewayTx, status: ProviderStatus) {
    if (tx.status !== 'succeeded' && status === 'succeeded') this.chargeCount++;
    tx.status = status;
  }

  private emit(tx: GatewayTx, type: ProviderEvent['type'], ms: number, eventId = `evt_${randomUUID()}`) {
    const ev: ProviderEvent = { eventId, providerRef: tx.providerRef, paymentId: tx.paymentId, type, amountFils: tx.amountFils };
    const body = JSON.stringify(ev);
    this.schedule(() => {
      this.dispatch(body, signPayload(this.secret, body)).catch(() => {
        /* gateway would retry; reconciliation covers lost webhooks */
      });
    }, ms);
  }
}

import type { OrderStatus, PaymentStatus, QuoteStatus, QuickEventStatus, BoothRequestStatus } from '@ebooking/shared';

type Graph<S extends string> = Record<S, readonly S[]>;

export const ORDER_TRANSITIONS: Graph<OrderStatus> = {
  pending_payment: ['payment_processing', 'expired', 'cancelled', 'payment_failed'],
  payment_processing: ['confirmed', 'payment_failed', 'reconciliation_required', 'expired'],
  payment_failed: ['payment_processing', 'expired', 'cancelled'],
  // A late, verified payment for an expired order must still be reconciled, never silently dropped.
  expired: ['reconciliation_required', 'confirmed'],
  confirmed: ['refunded'],
  reconciliation_required: ['confirmed', 'refunded'],
  cancelled: [],
  refunded: [],
};

export const PAYMENT_TRANSITIONS: Graph<PaymentStatus> = {
  initiated: ['pending', 'succeeded', 'failed', 'unknown'],
  pending: ['succeeded', 'failed', 'unknown'],
  unknown: ['succeeded', 'failed', 'pending'],
  succeeded: ['refunded'],
  failed: [],
  refunded: [],
};

export const QUOTE_TRANSITIONS: Graph<QuoteStatus> = {
  draft: ['sent'],
  sent: ['accepted', 'declined', 'expired'],
  accepted: [],
  declined: [],
  expired: [],
};

export const QUICK_EVENT_TRANSITIONS: Graph<QuickEventStatus> = {
  submitted: ['under_review', 'rejected'],
  under_review: ['quoted', 'rejected'],
  quoted: ['quote_accepted', 'quote_declined', 'quoted'],
  quote_declined: ['quoted', 'rejected'],
  quote_accepted: ['configuring'],
  configuring: ['approved'],
  approved: ['live'],
  live: [],
  rejected: [],
};

export const BOOTH_REQUEST_TRANSITIONS: Graph<BoothRequestStatus> = {
  pending: ['approved', 'rejected', 'withdrawn'],
  approved: [],
  rejected: [],
  withdrawn: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`invalid_transition:${from}->${to}`);
  }
}

export function canTransition<S extends string>(graph: Graph<S>, from: S, to: S): boolean {
  return from === to || (graph[from] ?? []).includes(to);
}

export function assertTransition<S extends string>(graph: Graph<S>, from: S, to: S): void {
  if (!canTransition(graph, from, to)) throw new InvalidTransitionError(from, to);
}

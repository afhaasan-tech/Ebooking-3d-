export const ROLES = ['guest', 'customer', 'org_owner', 'org_manager', 'event_staff', 'platform_admin'] as const;
export type Role = (typeof ROLES)[number];
export type OrgRole = 'owner' | 'manager' | 'staff';

/** Each inventory type has its own validation rules; do not reuse seat assumptions everywhere. */
export const INVENTORY_TYPES = ['assigned_seat', 'general_admission', 'exhibition_booth', 'time_slot'] as const;
export type InventoryType = (typeof INVENTORY_TYPES)[number];

export type SeatState = 'available' | 'held' | 'sold' | 'blocked';
/** Client-side display states layered on top of server state. */
export type SeatDisplayState = SeatState | 'selected' | 'in_basket' | 'mine';

export type OrderStatus =
  | 'pending_payment'
  | 'payment_processing'
  | 'confirmed'
  | 'payment_failed'
  | 'expired'
  | 'reconciliation_required'
  | 'cancelled'
  | 'refunded';

export type PaymentStatus = 'initiated' | 'pending' | 'succeeded' | 'failed' | 'unknown' | 'refunded';
export type PaymentMethod = 'knet' | 'apple_pay' | 'card';
export type DemoScenario = 'success' | 'fail' | 'delayed' | 'duplicate_webhook' | 'confirm_after_timeout';

export type PreviewAuthenticity = 'simulated' | 'geometry_based' | 'verified_reference';

export type QuickEventStatus =
  | 'submitted'
  | 'under_review'
  | 'quoted'
  | 'quote_accepted'
  | 'quote_declined'
  | 'configuring'
  | 'approved'
  | 'live'
  | 'rejected';
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
export type BoothRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

/** Theatre demo purchase rule. Booths / GA / workshops use their own limits. */
export const MAX_SEATS_PER_ORDER = 6;
export const MAX_ADMISSIONS_PER_ORDER = 10;
export const SEAT_HOLD_TTL_SECONDS = 10 * 60;

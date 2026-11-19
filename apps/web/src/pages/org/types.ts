/**
 * Response shapes of the organizer API (apps/api/src/routes/org.ts).
 * Field names mirror the SQL column aliases exactly. Money is always integer fils.
 */
export type OrgRole = 'owner' | 'manager' | 'staff';
export type InventoryType = 'assigned_seat' | 'general_admission' | 'exhibition_booth' | 'time_slot';
export type EventStatus = 'draft' | 'pending_approval' | 'published' | 'cancelled';
export type SeatStatus = 'available' | 'held' | 'sold' | 'blocked';

export interface Subscription {
  status: string; // trial | active | past_due
  current_period_end: string;
  mock: boolean;
  code: string;
  name_ar: string;
  name_en: string;
  commission_bps: number | null;
  annual_fee_fils: number | null;
}

export interface DashboardData {
  totals: {
    gross_fils: number;
    fees_fils: number;
    refunds_fils: number;
    confirmed_orders: number;
    reconciliation_orders: number;
    has_demo: boolean | null;
    commissionFils: number;
    netFils: number;
    commissionConfigured: boolean;
  };
  tickets: { sold: number; checked_in: number };
  inventory: { available: number; total: number };
  byEvent: { id: string; title_ar: string; title_en: string; inventory_type: InventoryType; gross_fils: number; tickets: number }[];
  byCategory: { code: string; name_ar: string; name_en: string; title_en: string; items: number; gross_fils: number }[];
  byPerformance: { id: string; starts_at: string; title_ar: string; title_en: string; gross_fils: number; orders: number }[];
  recent: { reference: string; status: string; total_fils: number; created_at: string; demo: boolean; title_ar: string; title_en: string; items: number }[];
  subscription: Subscription | null;
  demoData: boolean;
}

export interface OrgEvent {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string;
  category: string;
  inventory_type: InventoryType;
  status: EventStatus;
  demo: boolean;
  performances: number;
}

export interface TicketCategory {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  price_fils: number;
  color: string;
}

export interface Performance {
  id: string;
  starts_at: string;
  status: string;
  label_ar: string | null;
  label_en: string | null;
  /** assigned seating: count per inventory status, e.g. { available: 700, sold: 80 } */
  seat_status: Partial<Record<SeatStatus, number>> | null;
  /** general admission / time slots */
  capacity: { capacity: number; held: number; sold: number }[] | null;
}

export interface EventDetailData {
  event: {
    id: string;
    slug: string;
    title_ar: string;
    title_en: string;
    description_ar: string;
    description_en: string;
    category: string;
    inventory_type: InventoryType;
    status: EventStatus;
    demo: boolean;
    service_fee_bps: number;
    service_fee_fixed_fils: number;
    max_per_order: number;
    created_at: string;
  };
  categories: TicketCategory[];
  performances: Performance[];
}

export interface OrgOrder {
  reference: string;
  status: string;
  subtotal_fils: number;
  service_fee_fils: number;
  total_fils: number;
  created_at: string;
  demo: boolean;
  contact_name: string;
  title_ar: string;
  title_en: string;
  starts_at: string;
  seats: string | null;
}

export interface InventorySeat {
  seat_code: string;
  status: SeatStatus;
  section_code: string;
  row_label: string;
  seat_number: number;
  category: string;
}

export type CheckinResult = 'checked_in' | 'already_used' | 'void' | 'invalid_code' | 'not_for_this_organizer' | 'not_found';
export interface CheckinResponse {
  result: CheckinResult | string;
  ticket?: { id: string; seat_code: string | null; demo: boolean; title_ar: string; title_en: string; starts_at: string };
}

export interface BoothRequest {
  id: string;
  status: string;
  notes: string;
  created_at: string;
  booth_code: string;
  width_m: number;
  depth_m: number;
  booth_status: string;
  price_fils: number | null;
  company_name: string;
  contact_name: string;
  email: string;
  mobile: string;
  product_category: string;
  title_ar: string;
  title_en: string;
}

export interface PublicBooth {
  id: string;
  code: string;
  zone: string;
  width: number;
  depth: number;
  status: string;
  price_fils: number | null;
}

export interface PublicExhibition {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string;
  booths: PublicBooth[];
}

export interface StaffMember {
  email: string;
  full_name: string | null;
  role: OrgRole;
  created_at: string;
}

export interface AuditRow {
  action: string;
  entity: string;
  entity_id: string | null;
  details: unknown;
  created_at: string;
  /** admin audit only */
  actor?: string | null;
}

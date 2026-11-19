/**
 * Response shapes of the platform admin API (apps/api/src/routes/admin.ts) and GET /api/health.
 * Field names mirror the SQL column aliases exactly. Money is always integer fils.
 */
export interface AdminOverview {
  counts: {
    organizations: number;
    published_events: number;
    pending_events: number;
    confirmed_orders: number;
    reconciliation: number;
    unverified_payments: number;
    new_quick_events: number;
    open_cases: number;
    platform_fees_fils: number;
  };
  orgs: {
    id: string;
    name: string;
    status: string;
    sub_status: string | null;
    current_period_end: string | null;
    plan: string | null;
    mock: boolean | null;
    events: number;
  }[];
  plans: {
    code: string;
    name_ar: string;
    name_en: string;
    annual_fee_fils: number | null;
    commission_bps: number | null;
    features: Record<string, unknown> | null;
  }[];
  settings: { key: string; value: unknown }[];
  demoData: boolean;
}

export interface Health {
  ok: boolean;
  db: string;
  dbLatencyMs: number;
  payments: string;
  ai: string;
  demoMode: boolean;
}

export interface AdminEvent {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string;
  status: string;
  category: string;
  inventory_type: string;
  organizer: string;
  created_at: string;
}

export type QuickEventStatus = 'submitted' | 'under_review' | 'quoted' | 'quote_accepted' | 'quote_declined' | 'configuring' | 'approved' | 'live' | 'rejected';

export interface Quote {
  id: string;
  status: string;
  total_fils: number;
  valid_until: string;
  created_at: string;
  items: { description: string; amount_fils: number; quantity: number }[] | null;
}

export interface QuickEventRequest {
  id: string;
  reference: string;
  user_id: string | null;
  company_name: string;
  contact_name: string;
  email: string;
  mobile: string;
  venue_name: string;
  event_type: string;
  proposed_dates: string;
  expected_attendance: number;
  admission: string;
  seating_mode: string;
  services: unknown;
  notes: string;
  venue_plan_file_name: string | null;
  status: QuickEventStatus;
  created_at: string;
  updated_at: string;
  quotes: Quote[] | null;
}

export interface SupportCase {
  reference: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  order_ref: string | null;
  order_status: string | null;
  total_fils: number | null;
  email: string;
}

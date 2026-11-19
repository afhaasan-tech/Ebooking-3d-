-- Ebooking Ticket — core schema
-- Money: integer fils (1 KWD = 1000 fils). Never numeric floats for totals.
-- gen_random_uuid() is built into PostgreSQL >= 13 (no extension required).
create schema if not exists app;

-- ───────────────────────── Identity & organizations ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  mobile text,
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  platform_role text not null default 'customer' check (platform_role in ('customer', 'platform_admin')),
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('pending', 'active', 'suspended')),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on public.organization_members (user_id);

create table public.organizer_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null,
  name_en text not null,
  -- null = price not approved yet ("Price on Request")
  annual_fee_fils bigint check (annual_fee_fils >= 0),
  commission_bps int check (commission_bps between 0 and 10000),
  features jsonb not null default '{}'::jsonb
);

create table public.organizer_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.organizer_plans(id),
  status text not null check (status in ('trial', 'active', 'past_due', 'cancelled')),
  current_period_end date not null,
  mock boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index on public.organizer_subscriptions (org_id) where status in ('trial', 'active', 'past_due');

-- ───────────────────────── Venues (separate from sellable inventory) ─────────────────────────
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id),
  code text not null unique,
  kind text not null check (kind in ('theatre', 'exhibition_hall', 'open_space')),
  name_ar text not null,
  name_en text not null,
  city text not null default 'Kuwait City',
  fictional boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.venue_layout_versions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  version int not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  preview_authenticity text not null default 'simulated' check (preview_authenticity in ('simulated', 'geometry_based', 'verified_reference')),
  geometry jsonb not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (venue_id, version)
);

create table public.venue_sections (
  layout_version_id uuid not null references public.venue_layout_versions(id) on delete cascade,
  code text not null,
  name_ar text not null,
  name_en text not null,
  tier text not null check (tier in ('floor', 'balcony')),
  default_category text not null,
  color text not null,
  primary key (layout_version_id, code)
);

create table public.venue_seats (
  layout_version_id uuid not null references public.venue_layout_versions(id) on delete cascade,
  seat_code text not null,
  section_code text not null,
  row_label text not null,
  seat_number int not null check (seat_number > 0),
  tier text not null,
  x real not null, y real not null, z real not null,
  yaw real not null,
  eye_height real not null default 1.15,
  aisle boolean not null default false,
  accessible text check (accessible in ('wheelchair_space', 'companion')),
  -- precomputed SeatVision metrics for this layout version (deterministic, ESTIMATED)
  view_score int not null check (view_score between 0 and 100),
  distance_m real not null,
  h_angle_deg real not null,
  v_angle_deg real not null,
  centre_offset_m real not null,
  c_value_m real,
  blocked_by text[] not null default '{}',
  primary key (layout_version_id, seat_code),
  unique (layout_version_id, section_code, row_label, seat_number),
  foreign key (layout_version_id, section_code) references public.venue_sections(layout_version_id, code)
);

create table public.seat_view_references (
  id uuid primary key default gen_random_uuid(),
  layout_version_id uuid not null references public.venue_layout_versions(id) on delete cascade,
  section_code text not null,
  seat_code text,
  asset_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  version int not null default 1,
  uploaded_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  check (status <> 'approved' or (approved_by is not null and approved_at is not null))
);

-- ───────────────────────── Events ─────────────────────────
create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  slug text not null unique,
  category text not null check (category in ('theatre', 'concert', 'comedy', 'workshop', 'conference', 'family', 'exhibition')),
  inventory_type text not null check (inventory_type in ('assigned_seat', 'general_admission', 'exhibition_booth', 'time_slot')),
  title_ar text not null,
  title_en text not null,
  description_ar text not null default '',
  description_en text not null default '',
  venue_id uuid not null references public.venues(id),
  -- events always reference a specific published layout version
  layout_version_id uuid references public.venue_layout_versions(id),
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'published', 'cancelled')),
  demo boolean not null default true,
  stage_mode text check (stage_mode in ('theatre', 'concert')),
  service_fee_bps int not null default 0 check (service_fee_bps between 0 and 3000),
  service_fee_fixed_fils int not null default 0 check (service_fee_fixed_fils >= 0),
  max_per_order int not null default 6 check (max_per_order between 1 and 50),
  age_restriction text,
  cancellation_policy_ar text not null default '',
  cancellation_policy_en text not null default '',
  accessibility_ar text not null default '',
  accessibility_en text not null default '',
  accent_color text not null default '#d4a64a',
  created_at timestamptz not null default now(),
  check (inventory_type <> 'assigned_seat' or layout_version_id is not null)
);
create index on public.events (org_id);
create index on public.events (status, category);

create table public.performances (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  sales_start timestamptz not null default now(),
  sales_end timestamptz not null,
  status text not null default 'on_sale' check (status in ('scheduled', 'on_sale', 'sold_out', 'cancelled', 'ended')),
  label_ar text,
  label_en text,
  check (sales_end > sales_start)
);
create index on public.performances (event_id, starts_at);

create table public.ticket_categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  name_ar text not null,
  name_en text not null,
  price_fils bigint not null check (price_fils >= 0),
  color text not null default '#888888',
  unique (event_id, code)
);

-- section → category mapping per event (event-level pricing configuration)
create table public.pricing_rules (
  event_id uuid not null references public.events(id) on delete cascade,
  section_code text not null,
  category_id uuid not null references public.ticket_categories(id) on delete cascade,
  primary key (event_id, section_code)
);

-- ───────────────────────── Holds & inventory ─────────────────────────
create table public.seat_holds (
  id uuid primary key default gen_random_uuid(),
  performance_id uuid not null references public.performances(id),
  kind text not null check (kind in ('seats', 'admission')),
  owner_user_id uuid references auth.users(id),
  owner_session text,
  status text not null default 'active' check (status in ('active', 'converted', 'expired', 'released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (owner_user_id is not null or owner_session is not null)
);
create index on public.seat_holds (status, expires_at);
create index on public.seat_holds (performance_id, owner_session);

create table public.performance_seat_inventory (
  performance_id uuid not null references public.performances(id) on delete cascade,
  seat_code text not null,
  category_id uuid not null references public.ticket_categories(id),
  status text not null default 'available' check (status in ('available', 'held', 'sold', 'blocked')),
  hold_id uuid references public.seat_holds(id),
  updated_at timestamptz not null default now(),
  primary key (performance_id, seat_code),
  check ((status = 'held') = (hold_id is not null))
);
create index on public.performance_seat_inventory (hold_id);

create table public.capacity_inventory (
  performance_id uuid not null references public.performances(id) on delete cascade,
  category_id uuid not null references public.ticket_categories(id),
  capacity int not null check (capacity >= 0),
  held int not null default 0 check (held >= 0),
  sold int not null default 0 check (sold >= 0),
  primary key (performance_id, category_id),
  check (held + sold <= capacity)
);

create table public.seat_hold_items (
  id uuid primary key default gen_random_uuid(),
  hold_id uuid not null references public.seat_holds(id) on delete cascade,
  seat_code text,
  category_id uuid not null references public.ticket_categories(id),
  quantity int not null default 1 check (quantity > 0),
  unique (hold_id, seat_code)
);

-- ───────────────────────── Orders, payments, tickets ─────────────────────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid not null references auth.users(id),
  performance_id uuid not null references public.performances(id),
  hold_id uuid not null unique references public.seat_holds(id),
  status text not null default 'pending_payment' check (status in ('pending_payment', 'payment_processing', 'confirmed', 'payment_failed', 'expired', 'reconciliation_required', 'cancelled', 'refunded')),
  subtotal_fils bigint not null check (subtotal_fils >= 0),
  service_fee_fils bigint not null check (service_fee_fils >= 0),
  total_fils bigint not null check (total_fils = subtotal_fils + service_fee_fils),
  contact_name text not null,
  contact_email text not null,
  contact_mobile text not null,
  demo boolean not null default true,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.orders (user_id, created_at desc);
create index on public.orders (performance_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  seat_code text,
  category_id uuid not null references public.ticket_categories(id),
  unit_price_fils bigint not null check (unit_price_fils >= 0),
  quantity int not null default 1 check (quantity > 0),
  unique (order_id, seat_code)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  provider text not null,
  method text not null check (method in ('knet', 'apple_pay', 'card')),
  amount_fils bigint not null check (amount_fils >= 0),
  status text not null default 'initiated' check (status in ('initiated', 'pending', 'succeeded', 'failed', 'unknown', 'refunded')),
  provider_ref text unique,
  idempotency_key text not null unique,
  demo_scenario text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.payments (order_id);
-- at most one successful payment per order: a second success is a duplicate charge to be refunded
create unique index payments_one_success_per_order on public.payments (order_id) where status = 'succeeded';

create table public.payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  payment_id uuid references public.payments(id),
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  order_item_id uuid not null references public.order_items(id),
  performance_id uuid not null references public.performances(id),
  seat_code text,
  admission_index int not null default 1,
  status text not null default 'valid' check (status in ('valid', 'used', 'void')),
  demo boolean not null default true,
  issued_at timestamptz not null default now(),
  unique (order_item_id, admission_index)
);
-- THE invariant: a reserved seat can only have one live ticket per performance.
create unique index tickets_one_live_ticket_per_seat on public.tickets (performance_id, seat_code) where seat_code is not null and status <> 'void';
create index on public.tickets (order_id);

create table public.ticket_checkins (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.tickets(id),
  checked_in_by uuid not null references auth.users(id),
  checked_in_at timestamptz not null default now()
);

-- ───────────────────────── Exhibitions ─────────────────────────
create table public.exhibition_booths (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  booth_code text not null,
  zone text not null,
  width_m real not null check (width_m > 0),
  depth_m real not null check (depth_m > 0),
  x real not null,
  z real not null,
  open_sides int not null check (open_sides between 1 and 4),
  fronts_main_aisle boolean not null,
  dist_main_entrance_m real not null,
  dist_nearest_exit_m real not null,
  layout_score int not null check (layout_score between 0 and 100),
  status text not null default 'available' check (status in ('available', 'held', 'booked', 'unavailable')),
  -- null = quote-based ("Price on Request"); never hard-coded
  price_fils bigint check (price_fils >= 0),
  unique (event_id, booth_code)
);

create table public.exhibitor_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  company_name text not null,
  contact_name text not null,
  email text not null,
  mobile text not null,
  product_category text not null,
  created_at timestamptz not null default now()
);

create table public.exhibition_booking_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  booth_id uuid not null references public.exhibition_booths(id),
  user_id uuid not null references auth.users(id),
  exhibitor_profile_id uuid not null references public.exhibitor_profiles(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  notes text not null default '',
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
-- an exclusive booth can only ever be approved for one exhibitor
create unique index booth_one_approved on public.exhibition_booking_requests (booth_id) where status = 'approved';
create unique index booth_one_pending_per_user on public.exhibition_booking_requests (booth_id, user_id) where status = 'pending';

-- ───────────────────────── Quick Event ─────────────────────────
create table public.quick_event_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid references auth.users(id),
  company_name text not null,
  contact_name text not null,
  email text not null,
  mobile text not null,
  venue_name text not null,
  event_type text not null,
  proposed_dates text not null,
  expected_attendance int not null check (expected_attendance > 0),
  admission text not null check (admission in ('free', 'paid')),
  seating_mode text not null check (seating_mode in ('reserved', 'general_admission', 'exhibition_booths')),
  services jsonb not null default '[]'::jsonb,
  notes text not null default '',
  venue_plan_file_name text,
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'quoted', 'quote_accepted', 'quote_declined', 'configuring', 'approved', 'live', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_quotes (
  id uuid primary key default gen_random_uuid(),
  quick_event_request_id uuid not null references public.quick_event_requests(id) on delete cascade,
  status text not null default 'sent' check (status in ('draft', 'sent', 'accepted', 'declined', 'expired')),
  total_fils bigint not null check (total_fils >= 0),
  valid_until date not null,
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index one_open_quote_per_request on public.service_quotes (quick_event_request_id) where status in ('sent', 'accepted');

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.service_quotes(id) on delete cascade,
  description text not null,
  amount_fils bigint not null check (amount_fils >= 0),
  quantity int not null default 1 check (quantity > 0)
);

-- ───────────────────────── Administration ─────────────────────────
create table public.support_cases (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid not null references auth.users(id),
  order_id uuid references public.orders(id),
  subject text not null,
  category text not null default 'general' check (category in ('general', 'payment', 'reconciliation', 'ticket', 'exhibition', 'quick_event')),
  status text not null default 'open' check (status in ('open', 'escalated', 'resolved')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  transcript jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_open_reconciliation_case_per_order on public.support_cases (order_id) where category = 'reconciliation' and status <> 'resolved';

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  org_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_logs (org_id, created_at desc);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

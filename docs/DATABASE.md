# DATABASE.md — Ebooking Ticket

> Engine: **PostgreSQL**. Locally: **PGlite** (PostgreSQL 16 compiled to WASM, embedded in the API, no Docker). Hosted target: **Supabase Postgres**.
> Full entity diagram and per-table columns: [`ERD.md`](ERD.md). This file covers how the database is run, secured and verified.

## 1. Migrations

| File | Applies to | Purpose |
|---|---|---|
| `supabase/local/0000_local_auth_shim.sql` | **Local only** (never on Supabase) | Emulates `auth.users`, `auth.uid()` (reads `request.jwt.claims.sub`, same as Supabase), roles `anon` / `authenticated` / `service_role`, and a local password table |
| `supabase/migrations/0001_core_schema.sql` | Local + Supabase | 33 tables, keys, checks, partial unique indexes |
| `supabase/migrations/0002_booking_functions.sql` | Local + Supabase | `SECURITY DEFINER` booking primitives (holds, confirmation, check-in, expiry) and RLS helper functions |
| `supabase/migrations/0003_rls.sql` | Local + Supabase | Enables RLS on every public table, read policies, revokes client writes |

Runner: `apps/api/src/db.ts → migrate()` records applied files in `local_meta.migrations`. Reset local data: `npm run db:reset`.

## 2. Money and identifiers
- All money is **integer fils** (`bigint`, 1 KWD = 1000 fils); `orders` has `CHECK (total_fils = subtotal_fils + service_fee_fils)`.
- Order line prices are **snapshotted** in `order_items.unit_price_fils`; later price changes never alter sold orders.
- Seat identities are stable per **layout version** (`venue_seats` PK `(layout_version_id, seat_code)`); events reference a specific `layout_version_id`.
- Tickets have opaque UUIDs; the check-in code is `EBK1.<uuid>.<HMAC>` (server-signed, not stored).

## 3. Integrity invariants enforced by the database

| Invariant | Mechanism |
|---|---|
| A reserved seat has at most one live ticket per performance | partial unique index `tickets_one_live_ticket_per_seat (performance_id, seat_code) WHERE status <> 'void'` |
| Concurrent buyers cannot both hold a seat | `app.hold_seats` locks the rows `FOR UPDATE` in seat-code order inside one transaction |
| Held seats always point to a hold | `CHECK ((status = 'held') = (hold_id IS NOT NULL))` |
| GA / workshop capacity is never oversold | `capacity_inventory CHECK (held + sold <= capacity)` + row lock in `app.hold_admission` |
| One successful payment per order | partial unique index `payments_one_success_per_order` |
| Retried payment requests are idempotent | `payments.idempotency_key UNIQUE` |
| Provider webhooks processed once | `payment_provider_events UNIQUE (provider, provider_event_id)` |
| An exclusive booth is approved for one exhibitor only | partial unique index `booth_one_approved` |
| One open quote per Quick Event request | partial unique index `one_open_quote_per_request` |
| Approved seat photos must record who approved them | `CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))` |

## 4. Authentication (Supabase Auth status)

| Mode | Status |
|---|---|
| **Local** (`AUTH_MODE=local`) | ✅ Working. Users in `auth.users`; scrypt hashes in `auth.local_credentials`; API issues Supabase-shaped HS256 JWTs (`sub`, `aud=authenticated`, `role`). |
| **Supabase Auth** (`AUTH_MODE=supabase`) | ⚠ **Prepared, not integrated**: the API can verify HS256 tokens signed with the project JWT secret, but the web app has no Supabase Auth client, no trigger creates `profiles` rows for new Supabase users, and JWKS (asymmetric) keys are not supported. See `ARCHITECTURE.md §19` items 2–3. |

## 5. Row Level Security (tenant isolation)

RLS is **enabled on all 33 public tables** (asserted by `supabase/tests/rls.test.ts`). Clients have **SELECT only**; all writes go through the API (service connection) and `SECURITY DEFINER` functions whose `EXECUTE` is revoked from `public`.

| Data | Customer | Org owner | Org manager | Event staff | Other org | Platform admin |
|---|---|---|---|---|---|---|
| Published events, seat statuses | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Draft events | — | own org | own org | own org | ❌ | ✅ |
| Orders / payments | own only | own org's events | own org's events | ❌ | ❌ | ✅ |
| Tickets | own only | own org | own org | own org (check-in) | ❌ | ✅ |
| Booth requests / exhibitor profiles | own only | own org's events | own org's events | ❌ | ❌ | ✅ |
| Quick Event requests / quotes | own only | — | — | — | — | ✅ |
| Audit logs | — | own org | ❌ | ❌ | ❌ | ✅ |
| Profiles | own only | — | — | — | — | ✅ |

Helper functions `app.is_platform_admin()`, `app.is_org_member()`, `app.performance_org()`, `app.event_org()` are `SECURITY DEFINER` with `SET search_path = public, pg_temp`.

## 6. Protected user information
- PII stored: name, email, Kuwait mobile (orders), business contacts (exhibitors, Quick Event). **No** card data, national IDs or bank details are collected.
- Passwords: scrypt with per-user salt (local mode); never logged.
- Logs redact `authorization`, `contact`, `password`.
- Retention proposals: see `SECURITY.md §6`.

## 7. Verification (actual results)
- `supabase/tests/rls.test.ts` — **11/11 pass**: anon sees no private tables; customers see only their own orders/tickets/payments; organizer B sees 0 of organizer A's orders; staff see tickets but no orders/payments; clients cannot INSERT/UPDATE or call booking functions; every `SECURITY DEFINER` function pins `search_path`; no public table lacks RLS.
- API-level isolation and booking-integrity tests: see `TEST-PLAN.md`.
- **Not yet run on a hosted Supabase project** (no project credentials were provided).

## 8. Operations
- **Backups (hosted):** enable Supabase daily backups + Point-in-Time Recovery; test restore quarterly into a staging project.
- **Local:** `apps/api/.data/pglite` is disposable demo data (git-ignored).
- **Connection pooling:** use Supabase's pooled connection string for the API (`DATABASE_URL`); the API uses `pg.Pool` (max 10) in hosted mode.
- **Maintenance:** hold expiry runs every 5 s in the API process (`app.release_expired_holds`); move to `pg_cron` or a single scheduled worker before running multiple API instances.

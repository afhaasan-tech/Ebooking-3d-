# Ebooking Ticket — إي بوكنق تكت

**شوف إطلالتك. اختر كرسيك. احجز بثقة.** · *See your view. Choose your seat. Book with confidence.*

A Kuwait-first, Arabic-first (RTL) **B2C + B2B SaaS** platform for entertainment ticketing, exhibition booth booking and fast temporary events — with **Ebooking SeatVision AI** (3D seat-level previews, geometric view scores, smart seat recommendations, side-by-side comparison) and **SpaceVision** (3D exhibition floor plans).

> ⚠️ **Demo build.** Every venue, organizer, event, booking, payment and ticket is **fictional**. No real payment is processed. Demo tickets are **not valid for admission**. Nothing here represents a real Kuwait venue or mall, and no partnership is implied.

---

## Quick start

Requirements: **Node.js ≥ 22** (developed on Node 26) and npm. No Docker needed.

```bash
npm install
```

```bash
cp .env.example apps/api/.env
```

Locally you can leave the secret values empty: the API then generates random keys per process (sign-ins reset when the API restarts). In production every secret is **required**, must be ≥ 32 random characters, and placeholder values are rejected at startup. To generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run API + web together:

```bash
npm run dev
```

| Service | URL |
|---|---|
| Web app (Vite) | http://localhost:5173 |
| API (Fastify) | http://127.0.0.1:8787 — health: `/api/health` |

The API starts an **embedded PostgreSQL (PGlite)**, applies `supabase/migrations/*.sql`, and seeds fictional demo data on first run (persisted in `apps/api/.data/pglite`). Reset it with `npm run db:reset`, then restart.

### Demo accounts (local test values only)

Password for all: `Demo-Pass-2026` — also available as one-click buttons on the sign-in page.

| Role | Email |
|---|---|
| Customer | `customer@demo.ebooking.test` |
| Organizer owner — *Gulf Stage Productions (Demo)* | `owner@gulfstage.demo.test` |
| Organizer manager | `manager@gulfstage.demo.test` |
| Event staff (check-in only) | `staff@gulfstage.demo.test` |
| Owner of a **different** organizer — *Desert Lights Events (Demo)* (tenant isolation) | `owner@desertlights.demo.test` |
| Platform admin | `admin@ebooking.demo.test` |

---

## Pages

| Path | Screen |
|---|---|
| `/` | Home: hero, search, categories, featured events |
| `/events` | Discovery with type/date filters |
| `/events/:slug` | Event details, showtimes, policies; GA & workshop booking |
| `/book/:performanceId` | **SeatVision**: 3D venue → section → seat perspective, mini-map, smart pick, comparison, basket, 2D accessible fallback |
| `/checkout` | Demo checkout (KNET / Apple Pay / card selection, never card numbers) |
| `/orders/:ref` | Booking confirmation & payment status / recovery |
| `/tickets`, `/bookings` | My tickets (demo QR + signed check-in code), my bookings |
| `/exhibitions/:slug` | **SpaceVision** 3D exhibition floor, booth comparison & requests |
| `/quick-event` | Ebooking Quick Event landing + enquiry form + my quotes |
| `/support` | Booking Recovery Assistant, support cases |
| `/org` | Organizer portal (dashboard, events, pricing, bookings, inventory, check-in, exhibitors, staff, subscription) |
| `/admin` | Platform admin (overview, Quick Event pipeline & quotes, event approvals, reconciliation/refunds, audit) |
| `/login` | Sign in / register (+ demo accounts) |

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API (watch) + web dev server |
| `npm test` | Unit + integration + database (RLS) tests — Vitest |
| `npm run test:e2e` | Browser tests (Playwright, desktop + mobile), spins up its own isolated API/web on ports 8790/5180 |
| `npm run typecheck` | TypeScript strict checks for all packages and apps |
| `npm run build` | Production build of the web app (`apps/web/dist`) |
| `npm run db:reset` | Delete the local embedded database (re-seeded on next start) |
| `npm run lint` | ESLint (TypeScript + React Hooks rules) |

Build with `VITE_DEMO_MODE=false` to remove the demo-account buttons and the payment-outcome simulator from the UI.

First-time browser tests need Chromium: `npx playwright install chromium`.

---

## Architecture at a glance

```
apps/web            React 19 + Vite + three.js / React Three Fiber (SeatVision & SpaceVision)
apps/api            Fastify + Zod; booking service, payments, AI assistant, organizer/admin routes
packages/shared     money (integer fils), Kuwait mobile, domain types, Zod request schemas
packages/seatvision venue generator, view-quality scoring, intent parser (AR/EN), recommender, exhibition layout
packages/booking-engine  pricing, state machines, PaymentProvider + deterministic demo gateway
supabase/migrations SQL schema, booking functions (atomic holds), RLS policies — Supabase-compatible
supabase/local      local-only auth shim so the same migrations run on PGlite
supabase/tests      database-level RLS tests
tests/e2e           Playwright browser tests
docs/               PRD, architecture, ERD, API, security, design system, test plan, phase reports, evidence
```

Key guarantees (all covered by automated tests):
- **The same reserved seat can never be confirmed twice** (row locks + partial unique index).
- **Prices and fees are computed on the server** in integer fils; client totals are ignored.
- **No uncontrolled double charge**: idempotency keys, in-flight payment lock, verified webhooks, reconciliation.
- **Tenant isolation**: organizers see only their own data (API checks + PostgreSQL RLS).
- **Works without AI**: deterministic Arabic/English seat-request parser; LLM providers (Gemini/OpenAI/Claude) are optional and server-side only.

### Hosted mode (Supabase) — prepared, not yet run
Set `DATABASE_URL` (pooled connection string) and `AUTH_MODE=supabase` + `SUPABASE_JWT_SECRET`, then apply `supabase/migrations` with the Supabase CLI (`supabase db push`). Do **not** apply `supabase/local/*` to Supabase. See `docs/ARCHITECTURE.md` → Deployment.

---

## Documentation

`docs/INSTRUCTOR-AUDIT.md` · `docs/DATABASE.md` · `docs/PRD.md` · `docs/ARCHITECTURE.md` · `docs/ERD.md` · `docs/API-CONTRACTS.md` · `docs/SECURITY.md` · `docs/DESIGN-SYSTEM.md` · `docs/TEST-PLAN.md` · `docs/PHASE-REPORTS.md` · `docs/evidence/` (browser screenshots)

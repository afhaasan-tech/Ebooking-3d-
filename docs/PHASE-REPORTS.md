# Phase Reports — Ebooking Ticket

All results are from real runs on 19 November 2026 (Windows 11, Node 26, Chromium via Playwright with SwiftShader software WebGL). The independent compliance audit is in [`INSTRUCTOR-AUDIT.md`](INSTRUCTOR-AUDIT.md).

---

## Phase 1 — Product, requirements & system architecture

**Objective:** define the product, roles, inventory models and architecture, and initialise a runnable foundation.

**Implemented:** npm-workspaces monorepo (`apps/web`, `apps/api`, `packages/shared|seatvision|booking-engine`, `supabase/`, `tests/e2e`, `docs/`); PRD, architecture + ADRs, ERD, API contracts, security/threat model/privacy, design system, test plan, database guide.

**Key decisions:** TypeScript end-to-end; Vite + React + R3F; Fastify + Zod; PostgreSQL with RLS; **PGlite locally** because Docker is unavailable (the same SQL migrations target Supabase); integer fils; separate inventory types (assigned seats, GA, booths, time slots); AI optional and isolated from booking.

**Files:** `package.json`, `tsconfig.base.json`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/ERD.md`, `docs/API-CONTRACTS.md`, `docs/SECURITY.md`, `docs/DATABASE.md`.

**Tests / results:** foundation verified by later phases (typecheck 0 errors).

**Expected vs actual:** expected a documented architecture + runnable foundation → **met**. Business model documented with all prices "Price on Request" (no invented figures). No fitness features exist.

**Limitations:** hosted Supabase mode prepared but not exercised (no credentials).

---

## Phase 2 — 3D engine, computer vision & seat intelligence

**Objective:** a working 3D venue with individually selectable seats, geometry-based previews, comparison and deterministic recommendations; plus a SpaceVision exhibition prototype.

**Implemented:**
- `packages/seatvision`: fictional *Gulf Pearl Demo Theatre* (444 seats, 8 sections, progressive rake, balcony, obstacles); view score 0–100 from explicit weights (distance 0.30, horizontal 0.20, vertical 0.15, centre 0.10, obstruction 0.20 incl. ray/box tests + C-value, tier 0.05) — labelled *estimated*; Arabic (Kuwaiti) + English intent parser; adjacency/budget/category/accessibility recommender; 24-booth demo exhibition with layout-only scoring.
- `apps/web/src/components/venue`: instanced seats (2 draw calls), three navigation levels, seated-eye camera, look-around, zoom, adjacent/row navigation, mini-map with camera direction, 360° tour, theatre + concert stage modes with lightweight animation, multi-viewport comparison in one WebGL context, DOM label projection, on-demand rendering, auto light-quality, context-loss recovery, accessible 2D fallback.
- Exhibition (SpaceVision) 3D hall with booth overview/selection/standing perspective, comparison, recommendations, 2D plan.
- Computer-vision ingestion: **architecture only** (`ARCHITECTURE.md`), with `seat_view_references` table requiring human approval — not implemented as automation.

**Tests / results:** `seatvision.test.ts` 24/24; E2E asserts the camera reaches the selected seat's eye position (< 0.15 m) and moves when navigating to the adjacent seat.

**Expected vs actual:** **met.** Every demo seat uniquely identified; sold seats unselectable; perspectives differ per seat; recommendations respect budget/adjacency; 2D fallback works without WebGL.

**Limitations:** all previews are *Simulated*; theatre architecture meshes are specific to the demo venue; no real-GPU performance baseline.

---

## Phase 3 — Brand identity, UI/UX & complete frontend

**Objective:** premium Arabic-first experience for customers, organizers and admins.

**Implemented:** original ticket + stage-arch logo, animated loader, favicon/app icon, PWA manifest; charcoal/gold/ivory token system with WCAG-AA text contrast; RTL default + English LTR; customer screens (home, discovery, event details, showtimes, 3D booking with smart pick and comparison, basket drawer, checkout, confirmation/recovery, My Tickets, My Bookings, sign-in, support assistant), exhibition and Quick Event pages, organizer portal (10 tabs, role-aware), admin portal (5 tabs); error boundary, loading/empty/error states, reduced-motion support, keyboard navigation.

**Tests / results:** Playwright desktop, Pixel 7 touch, tablet 820 px and 375 px suites; zero console errors on main journeys.

**Expected vs actual:** **met.** One residual: auth token is JS-readable (sessionStorage) — move to httpOnly cookies before production.

---

## Phase 4 — Full-stack, database, booking safety & testing

**Objective:** secure full-stack booking with reliable holds, simulated payments, tickets, organizer reporting and verified tests.

**Implemented:** 33-table schema; atomic `hold_seats` / `hold_admission` / `confirm_order` / `check_in_ticket` functions; RLS on every table; server pricing; idempotent checkout; demo gateway with success/fail/delayed/duplicate/timeout scenarios and signed webhooks; reconciliation sweeper; admin refunds after provider verification; signed ticket codes with atomic single-use check-in; organizer revenue reporting; booth allocation with exclusive approval; Quick Event pipeline with quotes; AI support assistant with allow-listed tools and prompt-injection defence; rate limiting, Helmet, CORS allow-list, audit log.

**Tests / results (final):**
| Suite | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npx eslint .` | 0 problems |
| `npx vitest run` | **103 / 103** passed (8 files) |
| `npx playwright test` | **18 / 18** passed (desktop + mobile) |
| `npm audit` | 0 vulnerabilities |
| `npm run build` | success; 3D libraries lazy-loaded |

**Security findings:** SEC-001 (empty JWT secret → forgeable tokens) and SEC-002 (secret placeholders accepted) were found during the audit, **fixed, and regression-tested**; other fixes: GA refund capacity, retry line-item re-pricing, quote expiry persistence, availability visibility, past-date validation, organizer net revenue double-subtracting refunds, booth recommendations now using stored geometry, three.js no longer preloaded on every page.

**Expected vs actual:** **met for the local MVP.** The same reserved seat cannot be confirmed twice; delayed/failed/duplicate/timeout payments cannot cause a double charge; prices are server-authoritative; no secrets in client code; demo bookings clearly labelled; works with AI offline.

**Remaining issues / next-phase dependencies:** git commits + GitHub; deployment configuration; Sentry; Supabase Auth + hosted RLS run; real payment sandbox; CSP; shared rate-limit store and single sweeper; real-device performance and load testing. See `INSTRUCTOR-AUDIT.md §6`.

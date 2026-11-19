# Instructor Compliance Audit — Ebooking Ticket

**Date:** 19 November 2026 · **Scope:** the actual code in this repository, inspected and executed on the development machine (Windows 11, Node 26, Chromium/Playwright with software WebGL).
**Rule followed:** nothing is marked PASS without a test, a command output, or a file that proves it. Verdicts: **PASS · PARTIAL · FAIL · NOT TESTED · NOT APPLICABLE · NOT CONFIGURED**.

---

## 0. Executive summary

| Area | Verdict |
|---|---|
| Plan (Zone A) | **PASS** |
| Frontend (Zone B) | **PASS** (one PARTIAL: browser token storage model) |
| APIs (Zone C) | **PASS** (response schemas not machine-validated → PARTIAL) |
| Backend (Zone D) | **PASS** after fixing critical finding SEC-001 during this audit |
| Database (Zone E) | **PASS locally**; Supabase Auth / hosted Supabase **PARTIAL / NOT TESTED** |
| Deployment (Zone F) | **FAIL**: no git commits, no GitHub remote, no deployment (production build itself PASSES) |
| Security & Monitoring (Zone G) | **PARTIAL**: strong tests, but **no Sentry / external monitoring** |
| Real payment gateway | **NOT CONFIGURED** (simulator only, by design) |

### Critical findings
| ID | Severity | Status | Summary |
|---|---|---|---|
| **SEC-001** | Critical | **FIXED + regression-tested** | An empty `SUPABASE_JWT_SECRET=` line became the HS256 signing key; a forged admin token returned **200** on the running dev API. After the fix the same token returns **401**. Details: `SECURITY.md §9`. |
| SEC-002 | High | **FIXED** | `.env.example` secret placeholders were ≥ 32 chars and therefore *accepted* as real keys if copied unchanged; placeholders are now empty and placeholder values are rejected at startup. |
| DEP-001 | High (process) | **OPEN** | The repository has **no commits** and no GitHub remote — the SDLC history cannot be shown. Needs your approval to commit (see §7). |
| MON-001 | High (ops) | **OPEN** | No error monitoring (Sentry or equivalent) in browser or server. Integration plan in §5. |
| DB-001 | High (launch) | **OPEN** | Hosted Supabase mode (Supabase Auth client, profile trigger, migration ownership) is prepared but not integrated or tested. |

---

## 1. Evidence runs (this audit)

| Check | Command | Result |
|---|---|---|
| Type safety (5 workspaces, `strict`) | `npm run typecheck` | **0 errors** |
| Lint | `npx eslint .` | **0 errors, 0 warnings** |
| Unit + integration + DB/RLS tests | `npx vitest run` | **103 / 103 passed** in 8 files (`docs/evidence/vitest-run.txt`) |
| Browser E2E (desktop + mobile/tablet/375 px) | `npx playwright test` | **18 / 18 passed** in 4.6 min (`docs/evidence/e2e-run.txt`) |
| Production build | `npm run build` | **PASS** — entry 36 KB gz + React 84 KB gz; three.js (239 KB gz) lazy-loaded only on 3D pages |
| Dependency scan | `npm audit` | **0 vulnerabilities** (after upgrading `zod` 3→4, `vitest` 2→5 during the build-out) |
| Secret scan of built bundle | `grep` for secret names / key patterns in `apps/web/dist` | **none found** |
| Secret scan of source | `grep` for `sk-…`, `AKIA…`, private keys, JWTs | **none found**; `apps/api/.env` and `.data/` are git-ignored (`git check-ignore`) |
| XSS sinks | `grep dangerouslySetInnerHTML / innerHTML=` | **none** |
| Live forged-token probe | HS256 token with empty key → `GET /api/admin/overview` on the running API | before fix **200** ❌ → after fix **401** ✅ |

### 1.1 Browser E2E suites
| Suite | What it proves |
|---|---|
| `tests/e2e/booking.spec.ts` | Full Definition-of-Done customer journey (home → event → showtime → 3D venue → section → seat → seat-perspective camera within 0.15 m of the seat's eye → arrow-key neighbour → smart pick in Kuwaiti Arabic → compare → basket → server fees → checkout validation → demo payment → `EBK-…` reference → My Tickets); EN/LTR switch; sold seats not selectable; automatic 2D fallback without WebGL; failed payment → safe retry |
| `tests/e2e/portals.spec.ts` | Organizer dashboard, bookings and **check-in of a real signed ticket** (second scan refused); staff sees no financial tabs; Organizer B never sees Organizer A's bookings; admin builds a Quick Event quote (exact fils); non-admin refused |
| `tests/e2e/extras.spec.ts` | Exhibition booth request → organizer approval → booth `booked`; Quick Event form validation + customer accepts quote; support assistant with **AI disabled**; My Bookings |
| `tests/e2e/responsive.spec.ts` (Pixel 7 touch profile) | Mobile home/menu/3D venue/2D map without horizontal overflow, touch tap on 3D labels; tablet layout; keyboard skip-link |

Screenshots: `docs/evidence/*.png` (desktop venue overview, VIP section, seat perspective, comparison, checkout, confirmation, organizer dashboard, check-in, admin quote, exhibition, Quick Event, support, mobile and tablet views).

---

## 2. Zone-by-zone review

### Zone A — Planning
| Requirement | Verdict | Evidence |
|---|---|---|
| PRD + clearly defined MVP | **PASS** | `docs/PRD.md` (vision, audiences, journeys, MVP vs out-of-scope, backlog) |
| WHAT → WHAT'S INSIDE → HOW → DONE | **PASS** | §2.1 below |
| Architecture documentation | **PASS** | `docs/ARCHITECTURE.md` (Mermaid component/sequence diagrams, 20+ ADRs, known gaps §19 + resolution §19.1), `docs/ERD.md`, `docs/API-CONTRACTS.md`, `docs/DATABASE.md` |
| Acceptance criteria | **PASS** | `docs/PRD.md` acceptance criteria; `docs/TEST-PLAN.md` maps each to a test |

#### 2.1 WHAT → WHAT'S INSIDE → HOW → DONE
- **WHAT:** a Kuwait-first, Arabic-first ticketing marketplace whose differentiator is *seeing the view from a seat before paying* (SeatVision), plus exhibition booths (SpaceVision) and Quick Event setup for temporary events.
- **WHAT'S INSIDE:** React/Vite SPA with three.js venue engine · Fastify API · PostgreSQL schema with atomic booking functions and RLS · payment-provider abstraction with a deterministic simulator · optional AI layer · organizer and admin portals.
- **HOW:** integer-fils money; server-authoritative holds (`FOR UPDATE` + partial unique index); idempotent payments with verified webhooks and reconciliation; deterministic geometry scoring; tenant isolation in API **and** database.
- **DONE:** a customer can complete all 14 Definition-of-Done steps and an organizer all 7 — both are executed end-to-end by Playwright against the real API and database (§1.1).

### Zone B — Frontend
| Requirement | Verdict | Evidence |
|---|---|---|
| Reusable React components | **PASS** | `apps/web/src/ui/*` (Field/TextInput/StatusBadge/ErrorBox/Empty/Stat/DemoQr/Layout/BasketDrawer/ErrorBoundary), `pages/org/kit.tsx` shared by organizer + admin, `components/venue/*` shared by booking and comparison |
| Responsive UX | **PASS** | E2E on 1366×860, Pixel 7 (touch) and 820×1180 assert no horizontal overflow; header fixed for ≤ 480 px after the portal agent measured an overflow at 375 px (CSS fix; 375 px itself verified only by that agent's mocked run → minor residual risk) |
| Loading / error / empty states | **PASS** | `Loading`, `ErrorBox` (retry), `Empty` on every data page; top-level `AppErrorBoundary` (`ui/ErrorBoundary.tsx`) contains render crashes and handles stale lazy chunks; E2E asserts **zero console errors** on the main journeys |
| Safe browser storage | **PARTIAL** | Inventory/prices never trusted from storage (server is source of truth). Access token in **sessionStorage** (cleared on tab close), hold id + per-tab contact details in sessionStorage, language/org preference in localStorage, all wrapped in try/catch. *Residual risk:* any token readable by JS is exposed if an XSS is ever introduced — production should move to httpOnly, SameSite cookies (Supabase SSR pattern) |
| Functional 3D seat selection | **PASS** | `components/venue/*`: 444 seats in 2 instanced draw calls, three navigation levels, seat-eye camera (asserted numerically in E2E), mini-map, 360° tour, keyboard navigation, comparison in one WebGL context, context-loss recovery, auto light-quality, on-demand rendering, accessible 2D fallback |

### Zone C — APIs
| Requirement | Verdict | Evidence |
|---|---|---|
| Validated request contracts | **PASS** | Zod on every body/params/query (`packages/shared/src/schemas.ts`, `parse()` in `apps/api/src/app.ts`); 64 KB body limit |
| Validated response contracts | **PARTIAL** | Responses are typed in code and documented in `docs/API-CONTRACTS.md`, but not validated at runtime / no OpenAPI schema |
| Correct HTTP status codes | **PASS** | Tests assert 400 (validation, past dates), 401 (auth/forged webhooks/forged tokens), 403 (role), 404 (non-owner resources — no existence leak), 409 (seat unavailable, payment in progress, booth allocated, quote state), 410 (hold expired), 429 (rate limit) |
| Proper error handling | **PASS** | Central error handler returns codes only, `internal_error` for unexpected errors (no stack traces); DB constraint errors mapped to domain codes; past-date 500 found by the portal agent → fixed to 400 (`org.test.ts`) |
| Rate limiting | **PASS** | `@fastify/rate-limit` global + per route (login 10/min, holds 60/min, checkout 20/min, assistant 15/min + hourly budget); E2E/integration test triggers 429 on login brute force. *Note:* in-memory store — use Redis store before running multiple instances |

### Zone D — Backend
| Requirement | Verdict | Evidence |
|---|---|---|
| Server-authoritative pricing | **PASS** | `services/booking.ts holdSummary()` + `packages/booking-engine/src/pricing.ts`; test "client cannot influence the total" (client sends `totalFils: 1`, server charges 46.150 KWD) |
| Secure API secrets | **PASS (after fix)** | SEC-001/SEC-002 fixed; secrets only in server env; none in bundle; production refuses missing/short/placeholder secrets (`config.test.ts`) |
| Authorization | **PASS** | Identity only from verified JWT; platform role from DB; org role checked per route; tested for customer, owner, manager, staff, other org, admin |
| Atomic reservations | **PASS** | `app.hold_seats` / `app.hold_admission` (`0002_booking_functions.sql`); 10 concurrent buyers → exactly 1 hold; capacity race → exactly 2 of 4 succeed |
| Verified payment-status handling | **PASS (simulated provider)** | Signed webhooks, duplicate-event table, idempotency keys, `unknown` state + reconciliation by provider status query; real gateway **NOT CONFIGURED** |

### Zone E — Database
| Requirement | Verdict | Evidence |
|---|---|---|
| Supabase Auth | **PARTIAL** | Supabase-compatible JWT shape and `auth.uid()` semantics (local shim); **no Supabase Auth client in the SPA, no profile trigger, no JWKS** → hosted Supabase Auth not integrated (DB-001) |
| PostgreSQL tables & constraints | **PASS** | 33 tables, checks, FKs, partial unique indexes (`docs/DATABASE.md §3`), all exercised by tests |
| RLS tenant isolation | **PASS (local PostgreSQL)** / **NOT TESTED (hosted)** | `supabase/tests/rls.test.ts` 11/11 with real `SET ROLE authenticated/anon` + JWT claims |
| Protected user information | **PASS** | Owner-only reads; no card/ID data; log redaction; staff cannot read contact/financial data |
| DATABASE.md | **PASS** | `docs/DATABASE.md` (created in this audit) |

### Zone F — Deployment
| Requirement | Verdict | Evidence |
|---|---|---|
| Git commits | **FAIL** | `git log` → *"branch 'master' does not have any commits yet"* (repo initialised, nothing committed). Not done automatically: committing requires your approval |
| GitHub repository status | **NOT CONFIGURED** | `git remote -v` → no remote |
| Production build | **PASS** | `npm run build` succeeds; lazy 3D chunk verified (index.html preloads only the React chunk) |
| Vercel configuration | **NOT CONFIGURED** | No `vercel.json` / `vercel.ts` / `.vercel`. The architecture is deployable to Vercel (static SPA + Node API on Fluid Compute) but the in-process sweeper and in-memory rate-limit/demo ledger must move to shared infrastructure first (`ARCHITECTURE.md §19` items 12) |
| Verification of the deployed version | **NOT TESTED** | Nothing is deployed (the audit brief forbids deploying) |

### Zone G — Security & Monitoring
| Requirement | Verdict | Evidence |
|---|---|---|
| OWASP checks | **PASS (MVP scope)** | `docs/SECURITY.md §3` A01–A10 with test references; no penetration test yet |
| XSS protection | **PARTIAL** | React escaping, no HTML sinks, Helmet headers on the API; **no Content-Security-Policy on the SPA host yet** |
| Prompt-injection defenses | **PASS** | Deterministic tool selection, allow-listed read-only tools bound to the caller, injection patterns refused, LLM output schema-validated; test "refuses prompt-injection attempts" (0 tool calls) |
| Exposed-secret inspection | **PASS (after fix)** | Bundle + source scans clean; SEC-001/002 found and fixed in this audit |
| Two-account isolation testing | **PASS** | API: customer↔customer, org A↔org B, staff↔financials; DB: RLS suite; Browser: Desert Lights owner cannot see Gulf Stage bookings |
| DevTools / browser testing | **PASS** | Playwright collects `pageerror` + `console.error` on main journeys and asserts none; a React-19/drei console error was found this way and eliminated |
| Sentry integration | **FAIL (not integrated)** | No Sentry SDK in `apps/web` or `apps/api`; plan in §5 |
| Error logging & recovery | **PARTIAL** | Fastify structured logs with redaction, `audit_logs`, UI error boundary, payment reconciliation sweeper, WebGL context-loss recovery; **no alerting / external aggregation** |

---

## 3. Critical booking tests

| # | Scenario | Verdict | Test → actual result |
|---|---|---|---|
| 1 | Two customers competing for one seat | **PASS** | `booking.test.ts` "CONCURRENCY: 10 buyers race…" → 1×200, 9×409; DB index blocks a second live ticket |
| 2 | Unauthorized access to another user's booking | **PASS** | `security.test.ts` "another customer cannot read my order" → 404; assistant also refuses; RLS: customer sees 0 foreign orders |
| 3 | Organizer A reads Organizer B's data | **PASS** | `security.test.ts` cross-org → 403 on 6 endpoints; RLS → 0 rows; browser `portals.spec.ts` |
| 4 | Frontend price tampering | **PASS** | `booking.test.ts` "client cannot influence the total" |
| 5 | Duplicate reservation submissions | **PASS** | Same idempotency key → same order, `chargeCount` 1; new key while in flight → 409 `payment_in_progress`; basket resubmits replace the owner's hold (no duplicates) |
| 6 | Seat-hold expiry | **PASS** | `booking.test.ts` "expired holds are released…" → other buyer gets the seat; old hold checkout → 410 |
| 7 | Failed and delayed simulated payments | **PASS** | `booking.test.ts` failure/retry + delayed webhook; browser "payment failure shows a safe retry path" |
| 8 | Duplicate payment notifications | **PASS** | `booking.test.ts` "duplicate_webhook scenario issues tickets once" (3 deliveries, 2 event ids → 3 tickets total) |
| 9 | App with AI services disabled | **PASS** | `AI_PROVIDER=none` in all runs; `/api/health` reports `ai: none`; smart pick uses the deterministic parser (`source: deterministic`); support assistant answers (`extras.spec.ts`) |
| 10 | Mobile booking & 3D performance | **PASS (function) / PARTIAL (performance)** | Mobile E2E: 3D venue, touch, 2D map, no overflow. Performance only measured under **software** WebGL (auto-switches to light quality + on-demand rendering). **No real-device GPU baseline** |
| — | Real gateway (KNET / Apple Pay / card) | **NOT CONFIGURED** | No sandbox credentials; no real-payment success is claimed |

---

## 4. What is simulated / fictional
- Payment gateway (deterministic simulator with signed webhooks); refunds are against the simulator.
- Venue (Gulf Pearl Demo Theatre), exhibition hall, organizers, events, presales; all previews are **Simulated** (no verified seat photographs exist).
- Tickets are demo tickets (visual QR is decorative; a real server-signed code is provided for check-in testing).
- SaaS billing (`mock: true`), plan prices and commission ("Price on Request").
- Local authentication (Supabase-compatible but not Supabase Auth).

---

## 5. Sentry integration plan (not implemented)

| Topic | Plan |
|---|---|
| Browser capture | `@sentry/react` initialised in `apps/web/src/main.tsx` only when `VITE_SENTRY_DSN` is set; wrap routes with `Sentry.ErrorBoundary` (reuse `AppErrorBoundary` fallback); `browserTracingIntegration` with low sample rate (e.g. 0.1) |
| Server capture | `@sentry/node` in `apps/api/src/server.ts` + Fastify integration (`Sentry.setupFastifyErrorHandler(app)`); report from the central error handler only for 5xx and for reconciliation events (`order.reconciliation_required`, duplicate charge) as explicit `captureMessage` with level `warning` |
| Grouping | Fingerprint by error code (`internal_error` + route), not by message text; tag `inventory_type`, `payment_provider`, `org_id` (opaque UUID only) |
| Stack traces & source maps | Build with `sourcemap: 'hidden'`, upload with `@sentry/vite-plugin` in CI using `SENTRY_AUTH_TOKEN` from CI secrets, then **delete `.map` files from the deployed artefact** so maps are never public |
| Breadcrumbs | Navigation, fetch (method + path only), 3D mode changes (`overview/section/seat`), hold/checkout state transitions; **strip query strings and bodies** |
| Release tracking | `release = <git sha>`, `environment = local/staging/production`; requires DEP-001 (commits) first |
| Privacy-safe reporting | `sendDefaultPii: false`; `beforeSend` scrubs `authorization`, emails, Kuwait mobile patterns (`\+?965\d{8}`), names, contact objects, ticket QR codes (`EBK1.…`); replay disabled (or masked all-text if ever enabled) |
| Alerts | New issue in production; error rate > 1% for 5 min; any `reconciliation_required` or `duplicate_charge` event (page on-call); payment webhook signature failures spike; 3D `webglcontextlost` rate (product signal) |
| Secrets | DSN is public-by-design; `SENTRY_AUTH_TOKEN` only in CI secret store — never in the repo, `.env.example`, or the bundle |

---

## 6. Minimum changes to make the project demonstrable and safe
**Already done in this audit:** SEC-001 and SEC-002 fixed and regression-tested; GA refund capacity, retry re-pricing, quote-expiry persistence, availability visibility and past-date 500 fixed with tests; demo affordances can be removed with `VITE_DEMO_MODE=false`; hint-text contrast raised to WCAG AA.

**To demonstrate today (local):** commit the code (needs your OK), run `npm run dev`, use the demo accounts in `README.md`.

**Before any public deployment:**
1. Commit + push to a private GitHub repo; enable CI running typecheck, lint, vitest, Playwright and `npm audit`.
2. Integrate Sentry per §5.
3. Integrate Supabase Auth (client, profile trigger, JWKS) and run the RLS suite against a hosted Supabase project.
4. Add a CSP on the SPA host; move auth to httpOnly cookies.
5. Shared rate-limit store and a single scheduled sweeper (or `pg_cron`).
6. Choose a payment provider and run its **sandbox**; never mark real-payment tests as passed before that.

---

## 7. Final summary

1. **Genuinely working (proven by tests):** 3D seat selection with real seat-eye perspectives, view scores, smart recommendations in Kuwaiti Arabic/English, comparison, 2D accessible fallback; atomic seat/capacity holds; server-side pricing in fils; idempotent checkout with verified webhooks, delayed/failed/duplicate/timeout handling and reconciliation; demo tickets with signed check-in codes; organizer portal (dashboard, pricing, bookings, inventory, check-in, exhibitors, staff); admin (Quick Event pipeline with quotes, approvals, reconciliation/refunds, audit); exhibitions with booth requests and approvals; RLS and tenant isolation; RTL/LTR; mobile.
2. **Simulated:** payment gateway, venue/event data, SaaS billing, preview authenticity ("Simulated"), local auth.
3. **Missing:** git history + GitHub, deployment + Vercel config, Sentry/monitoring, Supabase Auth integration and hosted DB verification, real payment provider, CSP, real-device 3D performance baseline, CV-assisted venue ingestion (designed only).
4. **Critical security problems:** SEC-001 (forgeable admin tokens via empty JWT secret) — **found, confirmed, fixed and regression-tested during this audit**. No other open critical issue was found; open High items are process/ops (no commits, no monitoring, hosted auth).
5. **Demonstrable today:** the full customer journey in 3D (Arabic and English), smart pick, comparison, demo checkout including the "charged then timeout" recovery, tickets and staff check-in, organizer dashboard and isolation between two organizers, admin Quick Event quoting, exhibition booth approval, and the automated evidence (`npm test`, `npm run test:e2e`, screenshots in `docs/evidence/`).
6. **Before a real launch:** everything in §6, plus legal/privacy review (Kuwait), verified venue data and photographs, payment provider certification, load testing of sale openings, penetration test, MFA for organizer/admin accounts.

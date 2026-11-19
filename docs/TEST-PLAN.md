# Test Plan — Ebooking Ticket

All results below come from real runs on the development machine (Windows 11, Node 26, Chromium via Playwright with SwiftShader software WebGL). Latest results are recorded in `docs/PHASE-REPORTS.md`.

## 1. Layers

| Layer | Tool | Location | Command |
|---|---|---|---|
| Unit — money, Kuwait mobile | Vitest | `packages/shared/src/money.test.ts` | `npm test` |
| Unit — SeatVision geometry, scoring, intent parser, recommender, SpaceVision | Vitest | `packages/seatvision/src/seatvision.test.ts` | `npm test` |
| Unit — pricing, state machines, demo payment gateway | Vitest | `packages/booking-engine/src/engine.test.ts` | `npm test` |
| Integration — booking, holds, concurrency, payments, reconciliation, check-in | Vitest + Fastify `inject` + PGlite | `apps/api/src/booking.test.ts` | `npm test` |
| Integration — security, isolation, validation, rate limits, AI safety, exhibitions, Quick Event | Vitest + Fastify `inject` + PGlite | `apps/api/src/security.test.ts` | `npm test` |
| Database — RLS policies, privilege hygiene | Vitest + PGlite (`SET ROLE authenticated/anon`) | `supabase/tests/rls.test.ts` | `npm test` |
| Browser E2E — journeys, RTL/LTR, 2D fallback, payment failure, mobile/tablet, keyboard | Playwright | `tests/e2e/*.spec.ts` | `npm run test:e2e` |
| Static analysis | TypeScript `strict` | all workspaces | `npm run typecheck` |
| Dependency scan | `npm audit` | lockfile | `npm audit` |

Each integration file boots a **fresh in-memory PostgreSQL**, applies the real migrations and seeds, so tests are hermetic and repeatable. Simulated gateway callbacks are captured by an injected scheduler and flushed deterministically.

## 2. Coverage matrix (requirement → test)

### Venue & seats
| Requirement | Test |
|---|---|
| Unique seat mapping | `seatvision.test.ts` "has 400–700 uniquely identified seats"; `booking.test.ts` "seat map exposes uniquely identified seats" |
| Seat numbers consecutive / stable IDs across versions | `seatvision.test.ts` |
| Camera positioning at seated eye & aimed at stage | `seatvision.test.ts` "positions the camera…"; e2e journey asserts camera within 0.15 m of the seat's eye position |
| Perspective varies with geometry | e2e: ArrowRight moves the camera > 0.3 m |
| Visibility-score calculation, explicit weights | `seatvision.test.ts` "visibility scoring" block |
| Obstruction (segment/AABB) | `seatvision.test.ts` |
| Adjacent recommendation, never bridging sold gaps | `seatvision.test.ts` "does not bridge a sold gap" |
| Group budget constraints | `seatvision.test.ts` + `security.test.ts` "recommendations through the API" |
| Sold-seat rejection | `booking.test.ts` "rejects sold seats"; e2e "sold seats cannot be selected" |
| 2D fallback | e2e "2D fallback renders automatically when WebGL is unavailable" |

### Booking
| Requirement | Test |
|---|---|
| Add / remove seat (basket replace) | `booking.test.ts` "replacing the basket…" |
| Max six seats (server) | `booking.test.ts` "enforces max 6 seats server-side" |
| Expired hold | `booking.test.ts` "expired holds are released…" (+ checkout returns 410) |
| Concurrent purchases | `booking.test.ts` "CONCURRENCY: 10 buyers race…" |
| Duplicate booking / DB invariant | `booking.test.ts` "a seat can never have two live tickets" |
| Reload & restore | Basket stores only the hold id; contents re-fetched from the server (`lib/basket.tsx`) — exercised in e2e navigation |
| Event capacity (GA) | `booking.test.ts` "general admission enforces capacity atomically" |

### Payments
| Requirement | Test |
|---|---|
| Success | `booking.test.ts` "success → confirmed…"; e2e journey |
| Failure + retry | `booking.test.ts` "failure → payment_failed…"; e2e "payment failure shows a safe retry path" |
| Delayed confirmation | `booking.test.ts` "delayed confirmation…" |
| Duplicate webhook | `booking.test.ts` "duplicate_webhook scenario issues tickets once" |
| Unknown status / network interruption / idempotent retry / no double charge | `booking.test.ts` "gateway confirms but our call times out…" (asserts `chargeCount` = 1) |
| Forged webhook | `booking.test.ts`, `engine.test.ts` |
| Reconciliation (verified payment, seats lost) + admin refund | `booking.test.ts` "verified payment after seats were lost…" |

### Security
| Requirement | Test |
|---|---|
| Cross-user access | `security.test.ts` "cross-user isolation" |
| Cross-organizer access | `security.test.ts` "cross-organization isolation"; `rls.test.ts` |
| Invalid authentication | `security.test.ts` "authentication" |
| Invalid input / SQL injection payloads | `security.test.ts` "input validation" |
| Unauthorized admin action | `security.test.ts` "admin authorization" |
| Rate limiting | `security.test.ts` "limits brute-force login attempts" |
| Unsafe AI tool requests | `security.test.ts` "AI assistant safety" |
| RLS on every table, SECURITY DEFINER hygiene | `rls.test.ts` |

### Exhibitions & Quick Event
| Requirement | Test |
|---|---|
| Booth conflicts (two exhibitors, one approval) | `security.test.ts` "exhibitions" |
| Booth prices not hard-coded (Price on Request) | same |
| Quote states (no skipping, single acceptance, owner only) | `security.test.ts` "quick event workflow" |

### UX
| Requirement | Test |
|---|---|
| RTL default / English LTR switch | e2e "language switch…" + journey asserts `dir="rtl"` |
| Desktop | e2e `desktop` project (1366×860) |
| Mobile (touch) | e2e `mobile` project (Pixel 7) — tap on 3D labels, menu, 2D map, no horizontal overflow |
| Tablet | e2e "tablet: event discovery…" (820×1180) |
| Keyboard | e2e skip-link test; seat navigation with arrow keys in the journey |
| Loading & error states | `ErrorBox`/`Loading` components on every data page; console-error assertion in e2e |

## 3. Manual test script (when browser automation is unavailable)

1. `npm run dev`, open http://localhost:5173 — page is Arabic and right-to-left.
2. Open *ليالي المباركية* → choose a showtime → the 3D venue loads and slowly rotates.
3. Tap *كبار الشخصيات* label → camera flies to the section; tap a seat → details panel; tap again → seated perspective; use ← → ↑ ↓.
4. *اقتراح ذكي* → type `أبي ٤ كراسي يم بعض وبالنص` → compare → add to basket.
5. Basket → checkout → sign in with the customer demo account → pay → confirmation `EBK-…` → *تذاكري*.
6. Repeat with the simulator set to *انقطاع الاتصال بعد الخصم*: the order shows "verifying payment" and resolves to confirmed without a second charge.
7. Sign in as `staff@gulfstage.demo.test` → `/org` → Check-in → paste a ticket's check-in code → first scan succeeds, second is rejected.
8. Toggle **EN** → layout flips to LTR.

## 4. Not covered yet (honest gaps)
- Load / soak testing of hold acquisition under real network concurrency on hosted Postgres (PGlite serialises connections locally; correctness relies on row locks + unique indexes, which are Postgres-standard).
- Visual regression baselines; cross-browser (Firefox/WebKit) runs; real-GPU performance baselines.
- Hosted Supabase run of the migrations and RLS suite.
- Screen-reader manual audit (NVDA/VoiceOver).

## 5. Tests added during the instructor audit (19 Nov 2026)
| File | Covers |
|---|---|
| `apps/api/src/config.test.ts` | SEC-001 regression: empty/whitespace/placeholder/short secrets; forged empty-key and `alg:none` tokens → 401 |
| `apps/api/src/org.test.ts` | Net revenue = gross − refunds (once) − commission; past start time → 400; draft resubmission & approval; GA refund restores capacity; retry re-prices line items; expired quote persisted |
| `apps/api/src/security.test.ts` | Booth recommendations rank from the stored layout |
| `tests/e2e/portals.spec.ts` | Organizer dashboard/bookings/check-in of a real signed ticket; staff tab restrictions; cross-organizer isolation in the browser; admin quote with exact fils; non-admin refusal |
| `tests/e2e/extras.spec.ts` | Booth request → organizer approval → booked; Quick Event form validation + quote acceptance; support assistant with AI disabled; My Bookings |
| `tests/e2e/responsive.spec.ts` | 375 px small-phone overflow check on 6 pages |

Final counts: **Vitest 103/103**, **Playwright 18/18**, typecheck 0 errors, ESLint 0 problems, `npm audit` 0 vulnerabilities (logs in `docs/evidence/`).

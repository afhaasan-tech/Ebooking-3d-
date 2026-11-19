# Ebooking Ticket — API Contracts

> **Scope:** every HTTP endpoint registered in `apps/api/src/app.ts` and `apps/api/src/routes/*.ts` (55 endpoints), as built in November 2026. Request schemas come from `packages/shared/src/schemas.ts` or inline Zod in the route. Responses are summarised from the SQL/service code (they are not schema-validated).
>
> Related: [ARCHITECTURE.md](./ARCHITECTURE.md) (flows) · [ERD.md](./ERD.md) (tables) · [SECURITY.md](./SECURITY.md)

---

## 1. Conventions

| Topic | Contract |
|---|---|
| Base path | `/api` on the **same origin** as the SPA (the web app uses relative URLs). No version segment |
| Format | JSON request and response bodies (`content-type: application/json`), max request body **64 KB** |
| Authentication | `Authorization: Bearer <JWT>` (HS256; claims `sub`, `email`, `role: authenticated`, `aud: authenticated`; 8 h expiry). A missing, invalid or expired token is treated as **anonymous**; protected endpoints then return `401 auth_required` |
| Roles | Platform role comes from `profiles.platform_role`; organization roles from `organization_members` — both read from the database on every request, never from the token |
| Guest hold owner | `x-session-id: <24–64 chars of [A-Za-z0-9_-]>` (random per browser tab; the SPA sends it on every request). Ignored if malformed |
| Idempotency | Checkout carries `idempotencyKey` **in the body** (16–100 chars). The CORS allow-list also permits an `idempotency-key` header, but the API does not read it |
| Money | Integer **fils** (1 KWD = 1000 fils) in every `*_fils` / `*Fils` field; percentages in basis points (`*_bps`) |
| Time | ISO 8601 strings (stored as `timestamptz`; the UI renders `Asia/Kuwait`) |
| Naming | Raw table reads use `snake_case` fields; composed views (hold, order, checkout) use `camelCase` |
| Bilingual fields | `*_ar` / `*_en` pairs |
| Validation | Zod; unknown body fields are dropped (e.g. a client-sent `totalFils` is ignored) |
| Caching | Seat map and availability send `cache-control: no-store`; nothing else sets cache headers |
| Security headers | `@fastify/helmet` (CSP disabled at the API; `cross-origin-resource-policy: same-site`) |
| CORS | Origins from `CORS_ORIGINS` (exact match; requests without an `Origin` header are allowed); methods `GET, POST, PATCH, DELETE`; headers `content-type, authorization, x-session-id, idempotency-key` |

### 1.1 Error envelope

```json
{ "error": "seat_unavailable", "details": { "seats": ["VIP-A-3"] } }
```

| HTTP | `error` | When |
|---|---|---|
| 400 | `validation_error` | Zod failure; `details` = `[{ "path": "contact.mobile", "message": "invalid_kuwait_mobile" }, …]` |
| 400 | `invalid_json` | Body is not valid JSON |
| 4xx | `bad_request` | Other framework-level client errors (e.g. 413 body too large, 415 unsupported media type) |
| 401 | `auth_required` | Endpoint needs a signed-in user |
| 403 | `forbidden` | Signed in but lacking the platform or organization role |
| 429 | `rate_limited` | A rate limit was exceeded |
| 500 | `internal_error` | Anything unexpected (details are logged server-side, never returned) |

Endpoint-specific codes are listed per endpoint and collected in §11. Unknown routes return Fastify's default 404 body (not this envelope).

### 1.2 Rate limits

`@fastify/rate-limit`, keyed by client IP, in-memory per API instance (see ARCHITECTURE §12–13 on proxies and scale-out).

| Scope | Limit per minute |
|---|---|
| Global default (`RATE_LIMIT_PER_MINUTE`) | 300 |
| `POST /api/payments/webhook/*` | **exempt** (signature required instead) |
| `POST /api/auth/login` | 10 |
| `POST /api/auth/register` | 5 |
| `POST /api/holds/seats`, `POST /api/holds/admission` | 60 each |
| `POST /api/checkout` | 20 |
| `POST /api/orders/:ref/verify` | 20 |
| `POST /api/recommend` | 30 |
| `POST /api/exhibitions/requests` | 10 |
| `POST /api/quick-events` | 5 |
| `POST /api/support/assistant` | 15, **plus** a per-user budget of `AI_MAX_REQ_PER_HOUR` (default 30) messages per hour → `429 assistant_budget_exceeded` |
| `POST /api/org/:orgId/checkin` | 120 |

### 1.3 Identifier formats

| Identifier | Format |
|---|---|
| Order reference | `EBK-` + 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`; customer routes accept `^EBK-[A-Z0-9]{4,12}$` (seeded demo orders are `EBK-SEED0001…`) |
| Quick Event reference | `QE-` + 8 characters (same alphabet) |
| Support case reference | `SUP-` + 8 characters (same alphabet) |
| Seat code | `<SECTION>-<ROW>-<NUMBER>`, e.g. `VIP-C-5`, `BAL-BA-4` (demo generator) |
| Ticket check-in code | `EBK1.<ticket uuid>.<32-char base64url HMAC-SHA256 of the ticket id>` |

---

## 2. Endpoint index

Auth legend: **—** public · **G/U** guest session or user · **U** signed-in user · **O:roles** organization member with one of the roles · **A** platform admin · **Sig** webhook signature.

| # | Method | Path | Auth | Limit/min |
|---|---|---|---|---|
| 1 | GET | `/api/health` | — | 300 |
| 2 | GET | `/api/events` | — | 300 |
| 3 | GET | `/api/events/:slug` | — | 300 |
| 4 | GET | `/api/performances/:id/seatmap` | — | 300 |
| 5 | GET | `/api/performances/:id/availability` | — | 300 |
| 6 | POST | `/api/recommend` | — | 30 |
| 7 | GET | `/api/exhibitions/:slug` | — | 300 |
| 8 | POST | `/api/exhibitions/recommend` | — | 300 |
| 9 | POST | `/api/auth/login` | — | 10 |
| 10 | POST | `/api/auth/register` | — | 5 |
| 11 | GET | `/api/me` | U | 300 |
| 12 | POST | `/api/holds/seats` | G/U | 60 |
| 13 | POST | `/api/holds/admission` | G/U | 60 |
| 14 | GET | `/api/holds/:id` | G/U (owner) | 300 |
| 15 | DELETE | `/api/holds/:id` | G/U (owner) | 300 |
| 16 | POST | `/api/checkout` | U | 20 |
| 17 | GET | `/api/orders` | U | 300 |
| 18 | GET | `/api/orders/:ref` | U (owner) | 300 |
| 19 | POST | `/api/orders/:ref/verify` | U (owner) | 20 |
| 20 | GET | `/api/tickets` | U | 300 |
| 21 | POST | `/api/payments/webhook/demo` | Sig | exempt |
| 22 | POST | `/api/exhibitions/requests` | U | 10 |
| 23 | GET | `/api/exhibitions/requests/mine` | U | 300 |
| 24 | POST | `/api/quick-events` | — (user optional) | 5 |
| 25 | GET | `/api/quick-events/mine` | U | 300 |
| 26 | POST | `/api/quick-events/:id/quotes/:quoteId/:decision` | U (requester) | 300 |
| 27 | POST | `/api/support/assistant` | U | 15 + hourly budget |
| 28 | GET | `/api/support/cases` | U | 300 |
| 29 | GET | `/api/org/:orgId/dashboard` | O: owner, manager | 300 |
| 30 | GET | `/api/org/:orgId/events` | O: owner, manager, staff | 300 |
| 31 | GET | `/api/org/:orgId/events/:eventId` | O: owner, manager | 300 |
| 32 | POST | `/api/org/:orgId/events` | O: owner, manager | 300 |
| 33 | PATCH | `/api/org/:orgId/events/:eventId` | O: owner, manager | 300 |
| 34 | POST | `/api/org/:orgId/events/:eventId/submit` | O: owner, manager | 300 |
| 35 | PATCH | `/api/org/:orgId/categories/:categoryId` | O: owner, manager | 300 |
| 36 | GET | `/api/org/:orgId/performances/:performanceId/inventory` | O: owner, manager | 300 |
| 37 | GET | `/api/org/:orgId/orders` | O: owner, manager | 300 |
| 38 | POST | `/api/org/:orgId/checkin` | O: owner, manager, staff | 120 |
| 39 | GET | `/api/org/:orgId/booth-requests` | O: owner, manager | 300 |
| 40 | POST | `/api/org/:orgId/booth-requests/:requestId/decision` | O: owner, manager | 300 |
| 41 | PATCH | `/api/org/:orgId/booths/:boothId` | O: owner, manager | 300 |
| 42 | GET | `/api/org/:orgId/staff` | O: owner, manager | 300 |
| 43 | POST | `/api/org/:orgId/staff` | O: owner | 300 |
| 44 | GET | `/api/org/:orgId/audit` | O: owner | 300 |
| 45 | GET | `/api/admin/overview` | A | 300 |
| 46 | GET | `/api/admin/events` | A | 300 |
| 47 | POST | `/api/admin/events/:id/decision` | A | 300 |
| 48 | GET | `/api/admin/quick-events` | A | 300 |
| 49 | POST | `/api/admin/quick-events/:id/status` | A | 300 |
| 50 | POST | `/api/admin/quick-events/:id/quotes` | A | 300 |
| 51 | GET | `/api/admin/support-cases` | A | 300 |
| 52 | POST | `/api/admin/support-cases/:ref/resolve` | A | 300 |
| 53 | POST | `/api/admin/orders/:ref/retry-confirm` | A | 300 |
| 54 | POST | `/api/admin/orders/:ref/refund` | A | 300 |
| 55 | GET | `/api/admin/audit` | A | 300 |

---

## 3. Shared response shapes

### 3.1 `HoldView` — returned by endpoints 12–14

```jsonc
{
  "id": "uuid",
  "status": "active",                 // active | converted | expired | released
  "expiresAt": "2026-11-19T18:10:00.000Z",
  "performanceId": "uuid",
  "event": {
    "event_id": "uuid", "slug": "mubarakiya-nights", "title_ar": "…", "title_en": "…",
    "service_fee_bps": 200, "service_fee_fixed_fils": 250, "inventory_type": "assigned_seat",
    "layout_version_id": "uuid", "starts_at": "…", "label_ar": null, "label_en": null,
    "venue_ar": "…", "venue_en": "…"
  },
  "items": [
    {
      "seat_code": "STC-C-4",          // null for general admission / time slots
      "quantity": 1,
      "category_id": "uuid", "category_code": "STANDARD", "category_ar": "عادي", "category_en": "Standard",
      "price_fils": 20000,             // current category price (server)
      "section_code": "STC", "row_label": "C", "seat_number": 4, "view_score": 81,
      "section_ar": "عادي وسط", "section_en": "Standard Centre"
    }
  ],
  "pricing": {
    "subtotalFils": 20000, "serviceFeeFils": 650, "totalFils": 20650, "ticketCount": 1,
    "serviceFeeBps": 200, "serviceFeeFixedFils": 250
  }
}
```

`serviceFeeFils = round_half_up(subtotal × bps / 10000) + fixed × ticketCount`, and `0` when the subtotal is `0`. Values above are illustrative of the **demo** fee configuration, not approved pricing.

### 3.2 `OrderView` — returned by endpoints 16, 18, 19, 20 (array), 54

```jsonc
{
  "id": "uuid",
  "reference": "EBK-7K2M9QXA",
  "status": "confirmed",               // see ERD §6 for all order states
  "demo": true,
  "subtotalFils": 40000, "serviceFeeFils": 1300, "totalFils": 41300,
  "contact": { "name": "…", "email": "…", "mobile": "+96599887766" },
  "createdAt": "…", "confirmedAt": "…",
  "event": { "slug": "…", "titleAr": "…", "titleEn": "…", "inventoryType": "assigned_seat",
             "venueAr": "…", "venueEn": "…", "startsAt": "…", "labelAr": null, "labelEn": null },
  "performanceId": "uuid",
  "items": [ { "id": "uuid", "order_id": "uuid", "seat_code": "STR-C-7", "category_id": "uuid",
               "unit_price_fils": 20000, "quantity": 1, "category_code": "STANDARD",
               "category_ar": "…", "category_en": "…", "section_code": "STR", "row_label": "C",
               "seat_number": 7, "section_ar": "…", "section_en": "…" } ],
  "payments": [ { "id": "uuid", "method": "knet", "status": "succeeded", "amount_fils": 41300,
                  "created_at": "…", "updated_at": "…", "last_error": null } ],
  "supportCase": null,                 // { reference, status, category } of the latest case, if any
  "tickets": [ { "id": "uuid", "order_item_id": "uuid", "seat_code": "STR-C-7", "admission_index": 1,
                 "status": "valid", "demo": true, "issued_at": "…",
                 "qr": "EBK1.<uuid>.<signature>" } ]   // only when status = confirmed, otherwise []
}
```

---

## 4. Public catalogue, SeatVision and SpaceVision

### 1. `GET /api/health`
- **Auth:** none.
- **Response:** `{ ok: true, db: "pglite" | "postgres", dbLatencyMs, payments: "demo", ai: "none" | "gemini" | "openai" | "claude", demoMode: true }`.
- **Errors:** `500 internal_error` if the database is unreachable.

### 2. `GET /api/events`
- **Query:** `category?` ∈ `theatre, concert, comedy, workshop, conference, family, exhibition`; `q?` (≤ 80 chars, case-insensitive match on Arabic or English title).
- **Response:** array of **published** events ordered by next performance: `id, slug, category, inventory_type, title_ar/en, description_ar/en, accent_color, demo, stage_mode, venue_ar/en, organizer, price_from, price_to` (min/max category price in fils; null if none), `next_at` (next future performance), `upcoming` (count of future performances).
- **Errors:** `400 validation_error`.

### 3. `GET /api/events/:slug`
- **Params:** `slug` ≤ 80 chars.
- **Response:** event fields above plus `service_fee_bps, service_fee_fixed_fils, max_per_order, age_restriction, cancellation_policy_ar/en, accessibility_ar/en, fictional, preview_authenticity`; `performances[]` (future only) with `id, starts_at, ends_at, status, label_ar/en, sales_end, available, total` (seat counts for assigned seats, otherwise capacity sums); `categories[]` (`id, code, name_ar/en, price_fils, color`, highest price first).
- **Errors:** `404 event_not_found` (missing or not published).

### 4. `GET /api/performances/:id/seatmap`
- **Params:** `id` UUID. Only for **published assigned-seat** events.
- **Response** (`cache-control: no-store`):
  - `performance`: `id, starts_at, label_ar/en, event_id, slug, title_ar/en, stage_mode, layout_version_id, layout_version, max_per_order, service_fee_bps, service_fee_fixed_fils, geometry` (stage, arcCenter, obstacles, bounds), `preview_authenticity, venue_ar/en, fictional`;
  - `sections[]`: `code, name_ar/en, tier, default_category, color`;
  - `seats[]`: `id, section, row, number, tier, x, y, z, yaw, eye_height, aisle, accessible, score, distance, h_angle, v_angle, centre_offset, c_value, blocked_by, status, category_id`;
  - `categories[]`;
  - `verifiedReferences[]`: approved `seat_view_references` (`section_code, seat_code, asset_path, version`) — empty in the demo.
- **Errors:** `404 performance_not_found`.

### 5. `GET /api/performances/:id/availability`
- Lightweight revalidation (the SPA polls it every 20 s while visible).
- **Response** (`no-store`): `{ seats: [{ c: seat_code, s: status }], capacity: [{ category_id, capacity, held, sold, available }], at: ISO time }`.
- **Note:** does not check the event's publication status; it only exposes statuses for a known performance UUID.

### 6. `POST /api/recommend` — smart pick
- **Body** (`RecommendBody`): `{ performanceId: uuid, query: string (trimmed, 1–300) }`.
- **Response:** `{ intent, recommendations: [{ seatIds[], sectionCode, row, totalFils, avgScore, rankScore, reasons: [{ ar, en }] }], emptyReason?: { ar, en }, source: "deterministic" | "llm_assisted", estimated: true }` — up to 5 groups of consecutive **available** seats within the budget (see ARCHITECTURE §9.1). `intent` includes `quantity, together, maxTotalFils, preferCentre, avoidEdge, preferClose, bestView, cheapest, categories, accessible, tier, matched, language`.
- **Errors:** `404 performance_not_found` (no inventory for a published event); `400 validation_error`; `429`.

### 7. `GET /api/exhibitions/:slug`
- **Response:** `id, slug, title_ar/en, description_ar/en, accent_color, demo, geometry` (hall, entrances, exits, mainAisles, fictional), `preview_authenticity, venue_ar/en, organizer, dates: { starts_at, ends_at }`, `booths[]`: `id, code, zone, width, depth, x, z, open_sides, fronts_main_aisle, dist_entrance, dist_exit, score, status, price_fils` (`null` = Price on Request).
- **Errors:** `404 exhibition_not_found` (missing, unpublished or not an exhibition).

### 8. `POST /api/exhibitions/recommend`
- **Body:** `{ eventId: uuid, nearEntrance?: boolean = false, corner?: boolean = false, mainAisle?: boolean = false, minArea?: number 0–500 }`.
- **Response:** `{ recommendations: [{ code, rankScore, reasons: [{ ar, en }] }], basis: "layout_measurements_only" }` (top 3 available booths), ranked from the stored layout version geometry and the stored booth rows (ARCHITECTURE §10.2).
- **Errors:** `404 exhibition_not_found` (unknown event, not published, or not an exhibition).

---

## 5. Authentication and profile

### 9. `POST /api/auth/login` *(local auth mode only)*
- **Body** (`LoginBody`): `{ email: string (trimmed email, ≤ 200), password: string (6–200) }`.
- **Response:** `{ token }`.
- **Errors:** `401 invalid_credentials` (same for unknown email and wrong password); `404 use_supabase_auth` when `AUTH_MODE ≠ local`; `429` after 10/min.

### 10. `POST /api/auth/register` *(local auth mode only)*
- **Body:** `{ email, password: string (8–200), fullName: string (trimmed, 2–100) }`.
- **Response:** `{ token }` — creates `auth.users`, local credentials (scrypt) and a `customer` profile.
- **Errors:** `409 email_taken`; `404 use_supabase_auth`; `429` after 5/min.

### 11. `GET /api/me`
- **Auth:** U.
- **Response:** `{ id, email, platformRole: "customer" | "platform_admin", profile: { full_name, mobile, locale, platform_role } | null, organizations: [{ id, name, slug, role }] }` (read through RLS).

---

## 6. Holds, checkout, orders and tickets

### 12. `POST /api/holds/seats`
- **Auth:** guest `x-session-id` and/or Bearer token (at least one).
- **Body** (`HoldSeatsBody`): `{ performanceId: uuid, seatIds: string[1–6] (each 1–64 chars) }` — always the **full** basket; it replaces the owner's previous hold for that performance.
- **Response:** `HoldView`.
- **Errors:** `400 validation_error | session_required | too_many_seats | no_seats | duplicate_seats | unknown_seat | wrong_inventory_type`; `404 performance_not_found`; `409 not_on_sale`; `409 seat_unavailable` with `details.seats` (the seats that are not available).

### 13. `POST /api/holds/admission`
- **Auth:** as above.
- **Body** (`HoldAdmissionBody`): `{ performanceId: uuid, quantity: integer 1–10 }`. The category is the performance's capacity category (one per performance in the MVP).
- **Response:** `HoldView` (`items[].seat_code = null`, `quantity` set).
- **Errors:** `400 session_required | invalid_quantity` (above the event's `max_per_order`) `| wrong_inventory_type | unknown_category`; `404 performance_not_found`; `409 not_on_sale | capacity_exceeded`.

### 14. `GET /api/holds/:id`
- **Auth:** the hold's owner (same user id or same session id).
- **Response:** `HoldView` (any status — the SPA discards non-active or expired holds).
- **Errors:** `404 hold_not_found` (also for non-owners, so existence is not revealed).

### 15. `DELETE /api/holds/:id`
- **Auth:** the hold's owner.
- **Response:** `{ released: true }` — seats/capacity return to sale.
- **Errors:** `404 hold_not_found`; `409 payment_in_progress` (its order is paying, confirmed or under reconciliation).

### 16. `POST /api/checkout`
- **Auth:** U (a guest-held basket can be checked out after sign-in; the session id still proves hold ownership).
- **Body** (`CheckoutBody`):

```jsonc
{
  "holdId": "uuid",
  "contact": { "name": "2–100 chars", "email": "valid email ≤ 200", "mobile": "Kuwait mobile" },
  "method": "knet",                     // knet | apple_pay | card — labels only in the demo
  "demoScenario": "success",            // success | fail | delayed | duplicate_webhook | confirm_after_timeout (default success; demo only)
  "idempotencyKey": "16–100 chars"      // one key per payment attempt
}
```

  `mobile` accepts 8 digits starting with 4, 5, 6 or 9, optional `+965`/`00965`/`965`, spaces, dashes, parentheses and Arabic-Indic digits; it is normalised to `+965XXXXXXXX`.
- **Behaviour:** a known `idempotencyKey` returns the existing order (no new attempt). Otherwise the server prices the hold, creates or reuses the order, extends the hold to `PAYMENT_WINDOW_SECONDS`, records a payment `initiated`, sets the order `payment_processing`, calls the provider and applies the result.
- **Response:** `200 OrderView` — inspect `status`: `confirmed`, `payment_failed` or `payment_processing` (verification pending).
- **Errors:** `401 auth_required`; `400 validation_error | empty_hold`; `404 hold_not_found` (not the owner, or the order belongs to another user); `409 idempotency_key_conflict` (key used by another user); `409 payment_in_progress` with `details.reference`; `410 hold_expired`.

### 17. `GET /api/orders`
- **Auth:** U. Read through RLS.
- **Response:** newest first: `[{ id, reference, status, total_fils, created_at, demo, starts_at, title_ar, title_en, slug, inventory_type, ticket_count }]` (`ticket_count` excludes void tickets).

### 18. `GET /api/orders/:ref`
- **Auth:** U; only the customer's own orders.
- **Params:** `ref` matching `^EBK-[A-Z0-9]{4,12}$`.
- **Response:** `OrderView`.
- **Errors:** `400 validation_error`; `404 order_not_found` (also for other users' orders).

### 19. `POST /api/orders/:ref/verify`
- **Auth:** U (own order).
- **Behaviour:** asks the provider for the verified status of unresolved payments (`initiated`, `pending`, `unknown`), applies it, and retries confirmation if a verified payment exists for a `payment_processing`/`expired` order. **Never charges.**
- **Response:** `OrderView` after reconciliation.
- **Errors:** as endpoint 18; `429` after 20/min.

### 20. `GET /api/tickets`
- **Auth:** U.
- **Response:** `OrderView[]` for the user's **confirmed** orders (newest first), each with `tickets[].qr`.

### 21. `POST /api/payments/webhook/demo`
- **Auth:** header `x-demo-signature` = lowercase hex HMAC-SHA256 of the **raw** request body with `DEMO_WEBHOOK_SECRET`. In the demo the in-process gateway is the only legitimate caller (delivered through the HTTP pipeline).
- **Body:** `{ eventId, providerRef, paymentId, type: "payment.succeeded" | "payment.failed" | "refund.succeeded", amountFils }`.
- **Processing:** verify signature → insert into `payment_provider_events` (duplicate `eventId` → `{ duplicate: true }`) → find the payment by `providerRef` (or by `paymentId` when no reference is stored yet) → reject amount mismatches → apply the result.
- **Response:** `200 { duplicate: true }` or `200 { duplicate: false, result }`, where `result` ∈ `payment_not_found`, `amount_mismatch`, `noted` (refund events), `confirmed`, `already_confirmed`, `reconciliation_required`, `payment_failed`, `ignored_failure_after_success`, `duplicate_charge_escalated`, `not_confirmable`, `payment_not_verified`.
- **Errors:** `401 invalid_signature`.

---

## 7. Exhibitors, Quick Event and support

### 22. `POST /api/exhibitions/requests`
- **Auth:** U.
- **Body** (`BoothRequestBody`): `{ exhibitionId: uuid, boothCode: 1–64, companyName: 2–150, contactName: 2–100, email: ≤ 200, mobile: Kuwait mobile, productCategory: 2–100, notes?: ≤ 2000 }`.
- **Response:** `{ id, status: "pending" }` — creates an exhibitor profile and a pending request (audited).
- **Errors:** `404 booth_not_found` (unknown booth or unpublished exhibition); `409 booth_not_available`; `409 request_already_pending`; `429` after 10/min.

### 23. `GET /api/exhibitions/requests/mine`
- **Auth:** U (RLS).
- **Response:** `[{ id, status, created_at, decided_at, booth_code, width_m, depth_m, price_fils, title_ar, title_en, slug }]`.

### 24. `POST /api/quick-events`
- **Auth:** optional. With a token the request is linked to the user (trackable, quotes can be accepted); without one it is stored unlinked.
- **Body** (`QuickEventRequestBody`):

| Field | Rule |
|---|---|
| `companyName` | 2–150 |
| `contactName` | 2–100 |
| `email` | email, ≤ 200 |
| `mobile` | Kuwait mobile (normalised) |
| `venueName` | 2–150 |
| `eventType` | 2–80 |
| `proposedDates` | 2–200 (free text) |
| `expectedAttendance` | integer 1–1 000 000 |
| `admission` | `free` \| `paid` |
| `seatingMode` | `reserved` \| `general_admission` \| `exhibition_booths` |
| `services` | string[] (≤ 20 items, each ≤ 60), default `[]` |
| `notes` | ≤ 2000, default `""` |
| `venuePlanFileName` | optional, ≤ 200; must end in `.pdf`, `.png`, `.jpg` or `.jpeg` — **only the name is stored** |

- **Response:** `{ id, reference: "QE-…", status: "submitted" }` (audited).
- **Errors:** `400 validation_error | unsupported_file_type`; `429` after 5/min.

### 25. `GET /api/quick-events/mine`
- **Auth:** U (RLS).
- **Response:** `[{ id, reference, company_name, venue_name, event_type, status, created_at, quotes: [{ id, status, total_fils, valid_until, notes, items: [{ description, amount_fils, quantity }] }] | null }]` (quotes newest first).

### 26. `POST /api/quick-events/:id/quotes/:quoteId/:decision`
- **Auth:** U — the user linked to the request.
- **Params:** `id`, `quoteId` UUIDs; `decision` ∈ `accept`, `decline`. No body.
- **Response:** `{ status: "accepted" | "declined" }`; the request moves to `quote_accepted` / `quote_declined` (audited).
- **Errors:** `404 quote_not_found` (also when it is not your request); `409 quote_not_open` with `details.status`; `409 quote_expired` (after the end of `valid_until`). *Note:* the code also tries to mark the quote `expired` in that case, but the update is rolled back together with the error, so the quote stays `sent`.

### 27. `POST /api/support/assistant`
- **Auth:** U.
- **Body** (`SupportMessageBody`): `{ message: string (trimmed, 1–1000), orderRef?: string (≤ 40) }`.
- **Response:** `{ reply: string (in the message's language), actions: [{ type: "open_order" | "open_case" | "retry_payment" | "view_tickets", ref? }], toolCalls: string[] (subset of get_my_order, verify_payment_status, get_order_status, create_support_case), verified: boolean }`. Every tool call is audited.
- **Errors:** `429 assistant_budget_exceeded` (hourly budget); `429 rate_limited`.

### 28. `GET /api/support/cases`
- **Auth:** U (RLS).
- **Response:** `[{ reference, subject, category, status, priority, created_at, order_ref }]`.

---

## 8. Organizer portal — `/api/org/:orgId/*`

Common rules: `orgId` must be a UUID (`400 validation_error`); the caller must be signed in (`401 auth_required`) and a member of **that** organization with an allowed role (`403 forbidden`). Every query is scoped to `orgId`; tenant-scoped reads also run under RLS. Mutations are audited.

### 29. `GET /api/org/:orgId/dashboard` — owner, manager
- **Response:**
  - `totals`: `gross_fils` (subtotals of every order that was ever confirmed, including later refunds), `refunds_fils` (subtotals of confirmed-then-refunded orders), `reconciliation_refunds_fils` (totals of orders refunded without ever being confirmed), `fees_fils` (customer fees of confirmed orders), `confirmed_orders`, `reconciliation_orders`, `has_demo`, `commissionFils`, `netFils` (`gross − refunds − commission`), `commissionConfigured`;
  - `tickets`: `{ sold, checked_in }`; `inventory`: `{ available, total }` (seats);
  - `byEvent[]`, `byCategory[]`, `byPerformance[]`, `recent[]` (12 latest orders);
  - `subscription`: `{ status, current_period_end, mock, code, name_ar, name_en, commission_bps, annual_fee_fils } | null`;
  - `demoData: true`.

### 30. `GET /api/org/:orgId/events` — owner, manager, staff
- **Response:** `[{ id, slug, title_ar, title_en, category, inventory_type, status, demo, performances }]` (all statuses).

### 31. `GET /api/org/:orgId/events/:eventId` — owner, manager
- **Response:** `{ event: <all events columns>, categories: [...], performances: [{ id, starts_at, status, label_ar, label_en, seat_status: { available: n, held: n, sold: n, blocked: n } | null, capacity: [{ capacity, held, sold }] | null }] }`.
- **Errors:** `404 event_not_found`.

### 32. `POST /api/org/:orgId/events` — owner, manager
- **Body:**

| Field | Rule |
|---|---|
| `titleAr`, `titleEn` | trimmed, 3–150 |
| `category` | `theatre, concert, comedy, workshop, conference, family` |
| `inventoryType` | `general_admission` \| `time_slot` (assigned-seat and exhibition events cannot be created here) |
| `capacity` | integer 1–20 000 |
| `priceFils` | integer 0–100 000 000 |
| `startsAt` | ISO datetime, at least 10 minutes in the future |
| `descriptionAr`, `descriptionEn` | ≤ 2000, default `""` |

- **Effect:** creates the event as **`pending_approval`** (never auto-published, `demo = true`, venue *Demo Community Hall*, fee 200 bps + 250 fils), one `GA` category, one performance (sales open now, close at start) and its capacity row.
- **Response:** `{ id, slug, status: "pending_approval" }`.
- **Errors:** `400 starts_at_in_past`.

### 33. `PATCH /api/org/:orgId/events/:eventId` — owner, manager
- **Body (all optional):** `titleAr`, `titleEn` (3–150), `descriptionAr`, `descriptionEn` (≤ 2000), `serviceFeeBps` (integer 0–3000).
- **Response:** `{ ok: true }`.
- **Errors:** `404 event_not_found`.

### 34. `POST /api/org/:orgId/events/:eventId/submit` — owner, manager
- **Effect:** `draft → pending_approval` (e.g. after the platform returned it). Never publishes.
- **Response:** `{ id, status: "pending_approval" }`.
- **Errors:** `409 event_not_draft` (not a draft, or not this organization's event).

### 35. `PATCH /api/org/:orgId/categories/:categoryId` — owner, manager
- **Body** (`CategoryPriceBody`): `{ priceFils: integer 0–100 000 000 }`.
- **Effect:** updates the event-level category price; existing orders keep their snapshotted unit prices; audited with `from`/`to`.
- **Response:** `{ id, priceFils }`.
- **Errors:** `404 category_not_found` (including another organization's category).

### 36. `GET /api/org/:orgId/performances/:performanceId/inventory` — owner, manager
- **Response:** `[{ seat_code, status, section_code, row_label, seat_number, category }]` (assigned-seat performances; empty for capacity-based ones).
- **Errors:** `404 performance_not_found`.

### 37. `GET /api/org/:orgId/orders` — owner, manager
- **Query:** `eventId?` (UUID), `status?` (≤ 40 chars).
- **Response:** up to 200 newest: `[{ reference, status, subtotal_fils, service_fee_fils, total_fils, created_at, demo, contact_name, title_ar, title_en, starts_at, seats }]` — `seats` is a summary string such as `"VIP-A-1, VIP-A-2"` or `"GA x2"`.

### 38. `POST /api/org/:orgId/checkin` — owner, manager, staff
- **Body:** `{ code: string (≤ 200) }` — the ticket's `EBK1.…` code.
- **Response:** always `200` with `{ result, ticket? }`:

| `result` | Meaning |
|---|---|
| `checked_in` | Admitted now (`ticket` = `{ id, seat_code, demo, title_ar, title_en, starts_at }`) |
| `already_used` | Scanned before — do not admit |
| `void` | Ticket voided (e.g. refunded) |
| `invalid_code` | Malformed code or bad signature |
| `not_for_this_organizer` | Valid ticket of another organization |
| `not_found` | Ticket id no longer exists |

  Verified tickets are audited (`ticket.checkin`).

### 39. `GET /api/org/:orgId/booth-requests` — owner, manager
- **Response:** `[{ id, status, notes, created_at, booth_code, width_m, depth_m, booth_status, price_fils, company_name, contact_name, email, mobile, product_category, title_ar, title_en }]`.

### 40. `POST /api/org/:orgId/booth-requests/:requestId/decision` — owner, manager
- **Body:** `{ decision: "approved" | "rejected" }`.
- **Effect:** approval books the booth and auto-rejects every other pending request for it (`notes` gets `[auto: booth allocated]`).
- **Response:** `{ id, status }`.
- **Errors:** `404 request_not_found`; `409 request_already_decided | booth_not_available | booth_already_allocated`.

### 41. `PATCH /api/org/:orgId/booths/:boothId` — owner, manager
- **Body (optional fields):** `priceFils: integer 0–1 000 000 000 | null` (`null` = Price on Request; omit to keep), `status: "available" | "unavailable"` (ignored for booked/held booths).
- **Response:** `{ id, price_fils, status }`.
- **Errors:** `404 booth_not_found`.

### 42. `GET /api/org/:orgId/staff` — owner, manager
- **Response:** `[{ email, full_name, role, created_at }]`.

### 43. `POST /api/org/:orgId/staff` — owner
- **Body:** `{ email: email ≤ 200, role: "manager" | "staff" }` — the person must already have an account.
- **Effect:** adds the member or changes their role; an existing **owner** is never changed.
- **Response:** `{ ok: true }`.
- **Errors:** `404 user_not_found`.

### 44. `GET /api/org/:orgId/audit` — owner
- **Response:** latest 100 `[{ action, entity, entity_id, details, created_at }]` for this organization.

---

## 9. Platform admin — `/api/admin/*`

A pre-handler rejects every `/api/admin/` request unless the caller is signed in (`401 auth_required`) with `platform_role = 'platform_admin'` (`403 forbidden`). Platform admins have **no** implicit access to `/api/org/*`.

### 45. `GET /api/admin/overview`
- **Response:** `counts` (`organizations, published_events, pending_events, confirmed_orders, reconciliation, unverified_payments, new_quick_events, open_cases, platform_fees_fils`), `orgs[]` (`id, name, status, sub_status, current_period_end, plan, mock, events`), `plans[]` (`code, name_ar/en, annual_fee_fils, commission_bps, features`), `settings[]` (`key, value`), `demoData: true`.

### 46. `GET /api/admin/events`
- **Query:** `status?` ∈ `draft, pending_approval, published, cancelled`.
- **Response:** `[{ id, slug, title_ar, title_en, status, category, inventory_type, organizer, created_at }]` newest first.

### 47. `POST /api/admin/events/:id/decision`
- **Body:** `{ decision: "published" | "draft" }` — only from `pending_approval`.
- **Response:** `{ id, status }` (audited as `event.approved` or `event.returned_to_draft`).
- **Errors:** `409 event_not_pending`.

### 48. `GET /api/admin/quick-events`
- **Response:** all requests (newest first) with every column plus `quotes: [{ id, status, total_fils, valid_until, created_at, items[] }] | null` (oldest quote first).

### 49. `POST /api/admin/quick-events/:id/status`
- **Body:** `{ status: "under_review" | "rejected" | "configuring" | "approved" | "live" }`, validated against `QUICK_EVENT_TRANSITIONS` (PRD §12).
- **Response:** `{ id, status }` (audited with `from`/`to`).
- **Errors:** `404 request_not_found`; `409 invalid_transition` with `details: { from, to }`.

### 50. `POST /api/admin/quick-events/:id/quotes`
- **Body** (`QuoteBody`): `{ items: [{ description: 2–200, amountFils: 0–1 000 000 000, quantity: 1–10 000 }] (1–30 lines), validDays?: 1–90 (default 14), notes?: ≤ 2000 }`.
- **Effect:** allowed only when the request is `under_review`, `quoted` or `quote_declined`; any open (`sent`) quote is expired; the new quote is `sent` with `total_fils = Σ amountFils × quantity` and `valid_until = today + validDays`; the request becomes `quoted`.
- **Response:** `{ id, totalFils, status: "sent" }`.
- **Errors:** `404 request_not_found`; `409 invalid_transition`.

### 51. `GET /api/admin/support-cases`
- **Response:** latest 100, unresolved first: `[{ reference, subject, category, status, priority, created_at, order_ref, order_status, total_fils, email }]`.

### 52. `POST /api/admin/support-cases/:ref/resolve`
- **Params:** `ref` ≤ 40 chars.
- **Response:** `{ ok: true }` (audited).
- **Errors:** `404 case_not_found`.

### 53. `POST /api/admin/orders/:ref/retry-confirm`
- **Effect:** re-runs confirmation for an order that has a verified (`succeeded`) payment.
- **Response:** `{ result }` ∈ `confirmed`, `already_confirmed`, `reconciliation_required`, `not_confirmable`, `payment_not_verified`.
- **Errors:** `404 order_not_found`; `409 no_verified_payment`.

### 54. `POST /api/admin/orders/:ref/refund`
- **Body:** `{ confirm: true }` (literal `true` is required).
- **Effect:** re-verifies the payment with the provider, asks the provider to refund the full amount, then marks the payment and order `refunded`, voids valid tickets, returns sold seats to sale when no other live ticket exists, resolves open reconciliation cases and audits. *Capacity of general-admission/time-slot orders is not returned (known gap).*
- **Response:** `OrderView`.
- **Errors:** `400 validation_error` (missing `confirm: true`); `404 order_not_found`; `409 no_verified_payment | provider_status_not_verified`; `502 refund_not_confirmed` with `details.providerStatus`.

### 55. `GET /api/admin/audit`
- **Response:** latest 150 `[{ action, entity, entity_id, details, created_at, actor }]` (`actor` = email or `null` for system actions).

---

## 10. Webhook and ticket-code contracts

**Demo webhook signature**

```text
signature = hex( HMAC_SHA256( key = DEMO_WEBHOOK_SECRET, message = raw_request_body_bytes ) )
header    : x-demo-signature: <signature>
compare   : constant-time, after hex decoding
```

**Ticket check-in code**

```text
EBK1.<ticket_uuid>.<base64url( HMAC_SHA256(key = TICKET_SIGNING_SECRET, message = ticket_uuid) )[0:32]>
```

The code is recomputed on every order view; rotating `TICKET_SIGNING_SECRET` invalidates all issued codes.

---

## 11. Error code catalogue

| Code | HTTP | Endpoint(s) |
|---|---|---|
| `validation_error` | 400 | any |
| `invalid_json` | 400 | any JSON body |
| `bad_request` | 4xx | framework-level client errors |
| `auth_required` | 401 | protected endpoints |
| `forbidden` | 403 | `/api/org/*`, `/api/admin/*` |
| `rate_limited` | 429 | any rate-limited route |
| `internal_error` | 500 | any |
| `use_supabase_auth` | 404 | 9, 10 |
| `invalid_credentials` | 401 | 9 |
| `email_taken` | 409 | 10 |
| `event_not_found` | 404 | 3, 31, 33 |
| `performance_not_found` | 404 | 4, 6, 12, 13, 36 |
| `exhibition_not_found` | 404 | 7, 8 |
| `session_required` | 400 | 12, 13 |
| `too_many_seats`, `no_seats`, `duplicate_seats`, `unknown_seat` | 400 | 12 |
| `invalid_quantity`, `unknown_category` | 400 | 13 |
| `wrong_inventory_type` | 400 | 12, 13 |
| `not_on_sale` | 409 | 12, 13 |
| `seat_unavailable` (+ `details.seats`) | 409 | 12 |
| `capacity_exceeded` | 409 | 13 |
| `hold_not_found` | 404 | 14, 15, 16 |
| `payment_in_progress` (+ `details.reference` on 16) | 409 | 15, 16 |
| `hold_expired` | 410 | 16 |
| `empty_hold` | 400 | 16 |
| `idempotency_key_conflict` | 409 | 16 |
| `order_not_found` | 404 | 18, 19, 53, 54 |
| `invalid_signature` | 401 | 21 |
| `booth_not_found` | 404 | 22, 41 |
| `booth_not_available` | 409 | 22, 40 |
| `request_already_pending` | 409 | 22 |
| `unsupported_file_type` | 400 | 24 |
| `quote_not_found` | 404 | 26 |
| `quote_not_open` (+ `details.status`) | 409 | 26 |
| `quote_expired` | 409 | 26 |
| `assistant_budget_exceeded` | 429 | 27 |
| `starts_at_in_past` | 400 | 32 |
| `event_not_draft` | 409 | 34 |
| `category_not_found` | 404 | 35 |
| `request_not_found` | 404 | 40, 49, 50 |
| `request_already_decided` | 409 | 40 |
| `booth_already_allocated` | 409 | 40 |
| `user_not_found` | 404 | 43 |
| `event_not_pending` | 409 | 47 |
| `invalid_transition` (+ `details.from/to`) | 409 | 49, 50 |
| `case_not_found` | 404 | 52 |
| `no_verified_payment` | 409 | 53, 54 |
| `provider_status_not_verified` | 409 | 54 |
| `refund_not_confirmed` (+ `details.providerStatus`) | 502 | 54 |

The SPA maps the most common codes to bilingual messages in `apps/web/src/lib/i18n.tsx` (`ERRORS`) and per-page maps (support, exhibition, Quick Event, organizer kit).

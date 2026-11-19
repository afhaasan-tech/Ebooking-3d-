# CLASS DEMO — Ebooking Ticket (19 Nov 2026, 4:30 PM)

> One-line pitch: **"شوف إطلالتك. اختر كرسيك. احجز بثقة."** — see the real view from your exact seat in 3D *before* you pay.
> Everything shown is a **local demo** with fictional venues, events, payments and tickets. No real payment is processed.

---

## A. Startup (do this 10 minutes before presenting)

| Item | Value |
|---|---|
| Start command (repo root) | `npm run dev` |
| Web app | **http://localhost:5173** |
| API health | http://127.0.0.1:8787/api/health → `{"ok":true,"db":"pglite","payments":"demo","ai":"none"}` |
| Required services | **None external.** Node.js only. Database = embedded PostgreSQL (PGlite) started by the API. No Docker, no internet needed except Google Fonts. |
| GitHub | https://github.com/afhaasan-tech/Ebooking-3d- (branch `main`) |

First-time setup on a new machine:

```bash
npm install
```

```bash
cp .env.example apps/api/.env
```

```bash
npm run dev
```

**Demo accounts** (local test values only — password for all: `Demo-Pass-2026`; also one-click buttons on the sign-in page):

| Role | Email |
|---|---|
| Customer | `customer@demo.ebooking.test` |
| Organizer owner (Gulf Stage) | `owner@gulfstage.demo.test` |
| Event staff (check-in only) | `staff@gulfstage.demo.test` |
| Other organizer (isolation demo) | `owner@desertlights.demo.test` |
| Platform admin | `admin@ebooking.demo.test` |

**Reset the demo data** (fresh seats, no previous test orders): stop `npm run dev` (Ctrl+C), then:

```bash
npm run db:reset
```

```bash
npm run dev
```

Tips: use Chrome, zoom 100%, close other heavy tabs (3D uses the GPU). If 3D is slow, click **"الجودة"** to switch to light quality or **"عرض ثنائي الأبعاد"** for the 2D map — booking works the same.

---

## B. Live demonstration (≈ 8 minutes)

| # | Step | What to click | What to say |
|---|---|---|---|
| 1 | Homepage & discovery | Open http://localhost:5173 → categories → **ليالي المباركية** | Arabic-first, RTL, prices in KWD (3 decimals), demo banner always visible. Press **EN** to show English/LTR, then back to **ع**. |
| 2 | Interactive 3D theatre | **اختر كرسيك ثلاثي الأبعاد** on a showtime | 444 individually identified seats rendered with instancing; drag to rotate, **⟳ جولة ٣٦٠°**. Mini-map bottom corner. |
| 3 | Seat selection | Click the **كبار الشخصيات** label → click a green seat | Section level; seat panel shows price, category, availability; sold seats are folded and can't be selected. |
| 4 | SeatVision preview | **👁 شوف الإطلالة من الكرسي**, drag to look around, ←/→ for neighbour seats | Camera sits at the seated eye height of *that* seat. Score (0–100) is a geometric **estimate**: distance, angles, obstruction (incl. C-value over the row in front), tier. Badge says *Simulated preview* — honest about the fictional venue. |
| 5 | Smart recommendations | Tab **✨ اقتراح ذكي** → chip **أبي ٤ كراسي يم بعض وبالنص** (or type `أبي أحسن إطلالة بميزانية ٦٠ دينار`) → **قارن** | Works with **AI disabled** — deterministic Arabic/English parser; results are only genuinely adjacent, currently available seats within budget. Compare shows 2–3 seat views side by side. |
| 6 | Basket & demo checkout | **أضفها للسلة** → basket drawer → **متابعة للدفع** → sign in as *Customer* → mobile `99887766` → **ادفع (تجريبي)** | Seats are held atomically on the server (10-min timer). Prices/fees computed by the server (browser totals ignored). Confirmation `EBK-…` + demo tickets marked "not valid for entry". Optional: open *محاكي الدفع التجريبي* and choose **انقطاع الاتصال بعد الخصم** to show "verifying payment — don't pay again" → it confirms without a second charge. |
| 7 | Organizer dashboard | Sign out → sign in as *Organizer owner* → **بوابة المنظّم** | Sales/fees/net (demo data), bookings list, **تسجيل الحضور**: paste a ticket's check-in code (from *تذاكري → رمز التحقق*) → admitted; scan again → refused. Optional: sign in as *Other organizer* → sees none of Gulf Stage's bookings. |
| 8 | Quick Event | **Quick Event** in the header → fill the form → **إرسال الطلب** | Reference `QE-…`; admin (`/admin` → طلبات Quick Event) starts review and sends a custom quote; customer accepts on the same page. Prices are custom quotes — never invented. |
| 9 | Exhibition booth request | **المعارض** → *معرض المشاريع الصغيرة* → pick a booth → **طلب حجز هذا البوث** | SpaceVision 3D hall (simulated plan); booth price "السعر عند الطلب"; organizer approves in *بوابة المنظّم → العارضون* → booth becomes booked; a second approval is impossible. |

---

## C. Technical explanation (simple)

| Topic | Explanation |
|---|---|
| **Frontend** | React 19 + Vite SPA. three.js / React Three Fiber draws the theatre; all seats in 2 draw calls (instancing); renders only when something moves. Accessible 2D seat map as fallback. |
| **Backend** | Node.js + Fastify. Every request is validated with Zod; errors return clear codes, never stack traces. |
| **API** | REST JSON under `/api` (events, seat map, holds, checkout, orders, tickets, organizer, admin, exhibitions, quick events, support). Documented in `docs/API-CONTRACTS.md`. |
| **Supabase / PostgreSQL** | Real PostgreSQL schema (33 tables, constraints, functions) written as Supabase migrations. Locally it runs on **PGlite** (embedded Postgres). A hosted Supabase project is **not connected yet**. |
| **Authentication** | Local demo auth: scrypt-hashed passwords + signed JWT tokens in the same format Supabase uses. **Not Supabase Auth yet** — not production-ready. |
| **RLS** | Row Level Security on every table: customers see only their orders; an organizer only their organization; staff no finances. Proven by tests that switch database roles. |
| **Booking engine** | Seats are held inside one database transaction with row locks; a unique index makes a second live ticket for the same seat impossible. Holds expire automatically. |
| **Server-side pricing** | Prices are stored as integer *fils* (1 KWD = 1000 fils) and calculated on the server; anything the browser sends as a total is ignored. |
| **Webhook verification** | Payment notifications are accepted only with a valid HMAC signature; each provider event is processed once; a browser redirect is never treated as payment. Uncertain payments are reconciled by asking the provider. |
| **AI features** | Optional (currently OFF). Smart pick uses a deterministic Kuwaiti-Arabic/English parser; the support assistant only explains verified records with read-only tools and refuses prompt-injection. AI can never create seats, prices or payments. |
| **GitHub** | Code in https://github.com/afhaasan-tech/Ebooking-3d- ; secrets excluded (`.env` git-ignored, secret scan clean). |
| **Testing** | Vitest unit/integration/database tests + Playwright browser tests on desktop, phone and tablet. |

---

## D. Evidence (`docs/evidence/`)

| Evidence | Result |
|---|---|
| `vitest-run.txt` | **103 / 103** unit + integration + RLS tests passed |
| `e2e-run.txt` | **18 / 18** Playwright browser tests passed (desktop + mobile + tablet + 375 px) |
| `static-and-unit-run.txt` | TypeScript 0 errors · ESLint 0 problems · `npm audit` 0 vulnerabilities |
| Screenshots | `01-home-desktop.png` … `13-support.png` (journey, 3D views, checkout, organizer, admin, exhibition, Quick Event), `m01–m04` mobile, `t01` tablet |
| Security | `docs/SECURITY.md §9`: critical JWT empty-secret bug found during the audit → fixed → regression-tested (forged admin token 200 → 401) |
| Full audit | `docs/INSTRUCTOR-AUDIT.md` |

---

## E. Current limitations (say these honestly)

| Status | Items |
|---|---|
| **Fully functional locally** | 3D SeatVision + 2D map, smart pick, comparison, atomic holds, server pricing, demo checkout incl. failure/delay/duplicate/timeout recovery, tickets + check-in, organizer & admin portals, exhibitions, Quick Event, Arabic/English, mobile layouts, AI-off mode |
| **Simulated** | Payment gateway (demo simulator), all venues/events/presales, preview authenticity ("Simulated"), SaaS billing, local authentication |
| **Not connected yet** | Hosted Supabase (DB + Auth), deployment (no public URL), Sentry monitoring |
| **Awaiting external credentials** | MyFatoorah **sandbox** key (a new one — the previously shared key is treated as compromised and is never used), Sentry DSN, Supabase project, hosting accounts |
| **Not production-ready** | Authentication (local demo auth), no live payments, no verified venue data/photos, no load test, no CSP on a host yet, rate limits in memory (single instance) |

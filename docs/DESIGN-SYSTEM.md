# Ebooking Ticket — Design System

> **Scope:** the visual language and interaction rules **as implemented** in `apps/web` (November 2026): tokens in `apps/web/src/styles.css`, shared components in `apps/web/src/ui/*` and `apps/web/src/pages/org/kit.tsx`, the SeatVision components in `apps/web/src/components/venue/*` and the SpaceVision components in `apps/web/src/pages/exhibition/*`. Recommendations are marked as such.
>
> Related: [PRD.md](./PRD.md) · [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 1. Brand

### 1.1 Name, promise and voice

| Element | Definition |
|---|---|
| Product name | **Ebooking Ticket** (Arabic site title uses the same Latin wordmark) |
| Promise (EN) | *See your view. Choose your seat. Book with confidence.* |
| Promise (AR) | **شوف إطلالتك. اختر كرسيك. احجز بثقة.** |
| Feature names | **Ebooking SeatVision AI** (3D seat views), **SpaceVision** (exhibition halls), **Ebooking Quick Event** (managed temporary events) |
| Mood | "Night at the theatre": deep charcoal, warm metallic gold, soft ivory, stage-light blue/violet accents |
| Voice (Arabic) | Warm, direct **Kuwaiti dialect** for customer-facing copy — e.g. «أبي ٤ كراسي يم بعض وبالنص», «ما لقينا…», «لا تعيد الدفع» — and clear Modern Standard Arabic for policies and portals |
| Voice (English) | Plain, calm, specific; never hype |
| Honesty rules | Scores are always "estimated"; previews state their authenticity (*simulated* / *geometry-based* / *verified reference*); demo content is labelled; unapproved prices read **Price on Request** (السعر عند الطلب); payment states never guess ("we can't confirm whether you were charged until the provider responds") |

### 1.2 Logo mark

An original mark (`apps/web/src/ui/Logo.tsx`): a **ticket outline** with semicircular side notches, enclosing a **stage arch**, with a **spotlight dot** at the arch's centre — "a seat facing a lit stage, on a ticket".

| Part | SVG (64 × 64 viewBox) | Colour |
|---|---|---|
| Ticket outline | `M14 18h36a4 4 0 0 1 4 4v6a4 4 0 0 0 0 8v6a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4v-6a4 4 0 0 0 0-8v-6a4 4 0 0 1 4-4z`, stroke 3, no fill | `--gold` |
| Stage arch | `M24 40V28a8 8 0 0 1 16 0v12`, stroke 3, round caps | `--ivory` |
| Spotlight | circle `cx 32 cy 34 r 2.6` | `--gold-2` |

The mark is decorative in the UI (`aria-hidden`); the header link carries the accessible name "Ebooking Ticket — home".

### 1.3 Wordmark

`<Wordmark>` = mark + **"Ebooking"** in `--ivory` + **" Ticket"** in `--gold`, set in **El Messiri 700** at 0.62 × the mark size, letter-spacing 0.3 px, no wrapping, always `direction: ltr` (it stays Latin and left-to-right inside the Arabic layout). Header size: 30 px mark; on phones ≤ 480 px the header shows the **mark only** (the wordmark text is hidden) so the header fits a 375 px screen.

### 1.4 Animated loader

`<LoadingLogo>` (56 px mark) is the loading state for routes and data (`<Loading>`): the ticket outline **draws itself** (stroke-dash animation, 1.6 s, alternating, infinite) while the spotlight **glows** (opacity 0.3 → 1, 1.6 s). It is wrapped in `role="status"` + `aria-live="polite"` with a bilingual label ("جاري التحميل…" / "Loading…" or a context label such as "Preparing the 3D venue…"). Under reduced motion it renders static.

### 1.5 Favicon, app icon and manifest (`apps/web/public`)

| Asset | Description |
|---|---|
| `favicon.svg` | The mark on a `#121014` rounded square (rx 14); spotlight in gold |
| `icon-192.svg` | 192 × 192, radial gradient `#2a2430 → #121014`, rx 40, stroke 8; declared `purpose: "any maskable"` |
| `manifest.webmanifest` | `name` Ebooking Ticket, `short_name` Ebooking, description = Arabic tagline, `lang: ar`, `dir: rtl`, `display: standalone`, background and theme `#121014` |
| `index.html` | `lang="ar" dir="rtl"`, `theme-color #121014`, meta description with the Arabic tagline, favicon, `apple-touch-icon` (SVG), manifest link, Arabic `<noscript>` message |

*Recommendation:* add PNG icons (incl. a 180 × 180 `apple-touch-icon`, which iOS expects as PNG) and verify the maskable safe zone.

### 1.6 Generated artwork

No third-party imagery is used. `EventArt` (`ui/EventCard.tsx`) generates each event's banner: a radial glow of the event's `accent_color`, a translucent spotlight cone, a stage arch and a row of seat dots, plus the category emoji (🎭 🎶 😂 🖋 🎤 👨‍👩‍👧 🏛). The home hero is an original SVG of a lit stage, seat rows and one highlighted seat with a dashed sightline.

---

## 2. Colour tokens

Dark theme only (`color-scheme: dark`). Tokens live on `:root` in `styles.css`.

### 2.1 Surfaces, text and lines

| Token | Value | Use |
|---|---|---|
| `--bg` | `#121014` | Page background (with a subtle radial highlight `#241e29` at the top) |
| `--bg-2` | `#18151b` | Inputs, inset cards, table headers, drawer |
| `--surface` | `#1e1a22` | Cards, buttons, stat tiles |
| `--surface-2` | `#26212b` | Hover surfaces |
| `--surface-glass` | `rgba(30, 26, 34, 0.78)` + `backdrop-filter: blur(14px)` | Overlays on the 3D canvas (`.glass`) |
| `--line` | `#3a3340` | Borders of controls |
| `--line-soft` | `#2c2631` | Card borders, dividers |
| `--ivory` | `#f3ead8` | Headings, strong text, wordmark |
| `--text` | `#ece4d4` | Body text |
| `--muted` | `#a9a094` | Secondary text |
| `--faint` | `#7d756c` | Hints, disclaimers, metadata (see contrast note) |

### 2.2 Brand and semantic

| Token | Value | Use |
|---|---|---|
| `--gold` | `#d4a64a` | Brand accent, focus borders, logo outline |
| `--gold-2` | `#e8c77c` | Links, focus ring, highlighted numbers, primary-button gradient top |
| `--gold-ink` | `#1a1408` | Text on gold (primary buttons, skip link) |
| `--stage-blue` | `#7aa8d8` | Stage lighting accent |
| `--stage-violet` | `#a58bd6` | Stage lighting accent |
| `--ok` | `#6fbf8e` | Success |
| `--warn` | `#e6b450` | Warning, pending |
| `--danger` | `#e07a5f` | Errors, failures |
| `--info` | `#7aa8d8` | Information |

Badges and alerts pair each semantic colour with a dark tinted background and border (e.g. `.badge-ok` `#13241a` / `#2c5a40`; `.alert-danger` `#1f110e` / `#5a2f25`).

### 2.3 Seat-state tokens

| Token | Value | Used for |
|---|---|---|
| `--seat-available` | `#6f8f7d` | Legend swatch; fallback seat colour when a category colour is missing |
| `--seat-sold` | `#4a4250` | Legend swatch (diagonal hatch pattern) |
| `--seat-held` | `#b9893e` | Legend swatch (same value as the 3D/2D held colour) |
| `--seat-selected` | `#e8c77c` | Legend swatch "Selected ▼" |
| `--seat-mine` | `#6fbf8e` | Legend swatch — currently used for **"In basket ▼"** |
| `--seat-blocked` | `#2a252e` | Legend swatch (dashed border) |

> **Known inconsistency.** The 3D scene (`VenueModel.tsx`, `STATE_COLOR`) and the 2D map (`SeatMap2D.tsx`) use their own hex values (e.g. sold `#3b3440`, blocked `#1f1b22`, focused `#ffe08a`, confirmed seat `#5fb4d6`), and available seats take the **category** colour. Recommendation: one shared seat-state palette consumed by CSS, SVG and three.js.

### 2.4 Computed contrast (WCAG 2.x formula on the token values)

| Foreground on background | Ratio |
|---|---|
| `--text` on `--bg` | 14.97 : 1 |
| `--ivory` on `--bg` | 15.83 : 1 |
| `--muted` on `--bg` / `--surface` | 7.34 : 1 / 6.64 : 1 |
| `--gold-2` (links) on `--bg` | 11.61 : 1 |
| `--gold-ink` on `--gold` / `--gold-2` | 8.15 : 1 / 11.23 : 1 |
| `--danger` / `--ok` / `--warn` / `--info` on `--bg-2` | 6.13 / 8.19 / 9.47 / 7.25 : 1 |
| **`--faint` on `--bg` / `--bg-2` / `--surface`** | **4.17 / 3.99 / 3.78 : 1** — below the 4.5 : 1 AA threshold for normal-size text |

Recommendation: lighten `--faint` (or restrict it to large/non-essential text), since it is used for hints and disclaimers.

---

## 3. Typography

| Role | Family | Weights loaded | Where |
|---|---|---|---|
| Display | **El Messiri** → IBM Plex Sans Arabic → Georgia, serif (`--font-display`) | 500, 700 | `h1–h3`, `.display`, stat values, wordmark, ticket titles, scores |
| UI / body | **IBM Plex Sans Arabic** → system-ui, -apple-system, Segoe UI, Tahoma, sans-serif (`--font-ui`) | 400, 500, 600, 700 | Everything else; both scripts |
| Code | `ui-monospace` | — | `.kbd` (check-in codes), Quick Event reference |

Fonts load from Google Fonts with `display=swap` (preconnect in `index.html`).

| Style | Size | Line height |
|---|---|---|
| Body | 16 px | 1.6 |
| `h1` | `clamp(1.8rem, 4vw, 3rem)` (hero: `clamp(2rem, 5vw, 3.4rem)`) | 1.25 |
| `h2` | `clamp(1.35rem, 2.6vw, 1.9rem)` | 1.25 |
| `h3` | 1.15rem | 1.25 |
| `.small` | 0.875rem | inherit |
| `.tiny` | 0.78rem | inherit |
| Stat value | 1.6rem (display) | — |

**Numbers.** `.num` = `font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: isolate; display: inline-block` — used for prices, scores, counts, references, seat numbers and times so they never re-order inside Arabic text.

---

## 4. Spacing, shape, elevation and layout

| Token | Values |
|---|---|
| Spacing `--s1 … --s8` | 4, 8, 12, 16, 24, 32, 48, 64 px |
| Radius `--r1 … --r4` | 6, 10, 16, 24 px; pills use 999 px |
| `--shadow-1` | `0 1px 2px rgba(0,0,0,.4), 0 4px 16px rgba(0,0,0,.25)` — cards |
| `--shadow-gold` | gold hairline + soft gold glow — primary buttons, selected choices, open quotes |
| `--header-h` | 64 px (sticky, blurred header) |
| Container | `width: min(1200px, 100% − 32px)` → 16 px gutters on phones |
| Page rhythm | `.page` padding 32 px top / 64 px bottom; `.stack` 16 px between children |
| Grids | `.grid-2` min 340 px columns, `.grid-3` min 280 px, `.grid-4` min 200 px (all `auto-fit/fill`) |

Breakpoints are set per component (not tokens): 1000 px (SpaceVision layout stacks), 980 px (booking layout stacks), 900 px (support layout), 860 px (navigation collapses into a menu; hero stacks), 640 px (card-style tables, compact SpaceVision stage), 600 px (smaller 3D labels), 480 px (header shows the logo mark only, tighter gaps).

---

## 5. Components and states

### 5.1 Foundations (`styles.css`, `ui/components.tsx`)

| Component | Variants | States and behaviour |
|---|---|---|
| **Button** `.btn` | default, `.btn-primary` (gold gradient, gold ink, gold glow), `.btn-ghost`, `.btn-danger`; sizes `.btn-sm`, `.btn-block`, `.icon-btn` | min-height **44 px** (`.btn-sm` 34 px); hover raises surface; active presses down 1 px; disabled 50% opacity + `not-allowed`; busy labels ("…", "Processing…") |
| **Card** `.card`, `.card-tight`, `.glass` | — | 16 px radius, soft shadow; glass for canvas overlays |
| **Badge** `.badge` | `-gold`, `-ok`, `-warn`, `-danger`, `-info` | Pill; always carries text, never colour only |
| **StatusBadge** | maps ~35 statuses (orders, booths, quotes, Quick Event, cases, events, tickets) to bilingual labels + tone | Unknown status falls back to the raw code |
| **DemoTag** | — | Warn badge "تجريبي / DEMO" with tooltip "Fictional demo data" |
| **Field / TextInput / SelectInput / TextArea** | — | Visible `<label>`; optional hint and error linked by `aria-describedby`; error has `role="alert"`; `aria-invalid` turns the border red; focus = gold border + 3 px gold ring |
| **Choice group** `.choice` | radio "cards" | Checked card gets gold border + glow (`:has(input:checked)`) |
| **Table** `.table-wrap` + `.table` | — | Horizontal scroll container, sticky header; My Bookings switches to stacked label/value rows under 640 px |
| **Tabs** `.tabs` | — | 44 px targets; selected = ivory text + 2 px gold underline |
| **Stat** | — | Label, display-font value (`.num`), optional sub-line |
| **Alert** `.alert` | `-ok`, `-warn`, `-danger`, `-info` | Icon + text (+ optional action); `role="alert"` for errors, `role="status"`/`note` otherwise |
| **ErrorBox** | — | Bilingual message from the error code + optional *Retry* |
| **Page error boundary** (`ui/ErrorBoundary.tsx`) | — | Contains a render crash to the current route: danger alert ("Your bookings and payments are stored on the server and are not affected") + *Try again*; after a deployment that removed a lazy chunk it offers *Reload*; resets on navigation |
| **Empty** | — | Centred card with title and call to action |
| **Loading** | — | Animated logo + label (`role="status"`) |
| **Skeleton** `.skeleton` | — | Shimmer placeholder (1.4 s) for event grids |
| **Drawer** `.drawer` (BasketDrawer) | — | `role="dialog"`, `aria-modal`, labelled title; focuses the close button on open; **Esc** and backdrop close; slides in from its inline-end edge |
| **Countdown** | — | `MM:SS` hold timer in `.num` |
| **Ticket** `.ticket-shape` | — | Ticket silhouette with side notches; red "DEMO TICKET — NOT VALID FOR ENTRY" badge; decorative QR (`DemoQr`, labelled "Decorative demo QR"); reveal/copy of the signed check-in code |
| **Legend swatches** `.legend` + `.sw-*` | — | Swatch + text label; sold swatch is hatched, blocked swatch dashed |
| **Header** | — | Skip link, demo banner (`role="note"`), wordmark, navigation (collapses < 860 px, `aria-expanded` menu button), language toggle (EN / ع), basket button with count, sign-in/out |

### 5.2 Event discovery (`ui/EventCard.tsx`)

`EventCard`: generated art, category badge, DEMO tag, feature badges (**SeatVision 3D** for assigned seats, **SpaceVision** for exhibitions), title, venue, next date, "From 10.000 د.ك" or "Booths — Price on Request". Hover lifts the card 3 px.

### 5.3 SeatVision (`components/venue/*`, `pages/Booking.tsx`)

| Component | Purpose and states |
|---|---|
| `VenueCanvas` | 3D venue with three levels (overview, section, seat), section label buttons, hover label, marker cones, mini-map, toolbar (360° tour, back, zoom in/out in seat view, basket count `n/6`), seat HUD (section · row · seat · score · price). States: loading, interactive, *context lost → restart*, fatal → 2D |
| `SeatMap2D` | SVG overview + section buttons (`available/total`) + row groups of seat buttons |
| `MiniMap` | Section wedges (fill opacity = share of seats available), current seat dot, camera position and heading; wedges are keyboard buttons |
| `SeatDetails` | Price, category, estimated score bar + reasons, authenticity badge, aisle/wheelchair/companion badges, add/remove, view from seat, compare, seat-to-seat navigation pad |
| `SmartSearch` | Free-text request, example chips (Arabic dialect / English), "Understood: …" summary, recommendation cards with reasons and actions |
| Compare panel | Up to 3 seats: shared-context previews + metrics table |
| Slow-device alert | Offers *Light quality* or *2D view* |

### 5.4 SpaceVision (`pages/exhibition/*`)

Segmented 3D/2D control, level badge (overview / booth selection / booth perspective), camera control buttons (orbit or look left/right, zoom, reset), hint chip, selection bar, booth tags (code + status icon, ★ rank, pin number), door signs (entrance gold, EXIT green), `HallPlan2D`, booth details with score-factor meters, recommendation list, comparison table, booth list, request form with inline validation and success state, legend.

### 5.5 Portal kit (`pages/org/kit.tsx`, shared by `/org` and `/admin`)

`TabBar` (WAI-ARIA tabs, manual activation, RTL-aware arrows, Home/End, keeps the active tab scrolled into view), `ToneBadge` (roles, plans, priorities, subscription states), `Async` (loading / error / forbidden around a fetch), `ApiErrorAlert` (bilingual portal error messages), `Flash` (dismissible success), `RoleNotice` (🔒 owner/manager only), `DemoNotice` (figures come from fictional sales), `BarList` (accessible horizontal bars — the text carries the data), `DL` (definition list), `Clip` (truncation with `dir="auto"` isolation), `AuditTable`, `ChoiceGroup`, `RefreshButton`, `useFocusOnMount`.

### 5.6 Interaction states checklist

Every data view implements: **loading** (logo or skeleton), **error** (bilingual message + retry), **empty** (explanation + next step), **success** (`Flash`/alert), **disabled** (with reason, e.g. "Basket full (max 6 seats)"), **demo** (tag or notice).

---

## 6. Seat-state encoding — never colour alone

Each state is distinguishable by **shape, symbol or text** in addition to colour. Display state is derived once by `stateOf()` with this precedence: *your confirmed seat* → *in basket* → *focused* → server state (held / sold / blocked) → *suggested* → *filtered out* → *available*.

### 6.1 Theatre seats (3D and 2D)

| State | Meaning | 3D cue | 2D symbol | 2D SVG cue | Accessible text (AR / EN) |
|---|---|---|---|---|---|
| available | Can be selected | Upright backrest, **category colour** | ○ | Category-colour dot | متاح / available |
| held | Temporarily held by someone else | Upright, amber `#b9893e` | ◔ | Amber dot + amber ring | محجوز مؤقتاً / temporarily held |
| sold | Sold | **Folded backrest** (35% height, lowered), dark `#3b3440` | ✕ | Dark dot + ✕ stroke | مباع / sold |
| blocked | Not for sale | **Folded backrest**, near-black `#1f1b22` | – | Near-black dot | غير متاح / unavailable |
| focused | The seat in focus | Yellow `#ffe08a` + **yellow marker cone ▼** above the seat | ★ | Yellow dot + outer ring | محدد / selected |
| basket | In your basket | Green `#6fbf8e` + **green marker cone ▼** | ✓ | Green dot + check | في السلة / in basket |
| mine | Your confirmed seat | Blue `#5fb4d6` | ♥ | Blue dot + check | كرسيك المؤكد / your confirmed seat |
| highlight | Suggested by Smart pick | Violet `#c9a0dc` | ◆ | Violet dot | مقترح / suggested |
| dimmed | Filtered out by the category filter | Muted `#2c3a33` | · | Dim dot; button at 50% opacity | خارج الفلتر / filtered out |
| *wheelchair space* (attribute) | Demo accessibility data | — | ♿ after the number | — | "مساحة كرسي متحرك (تجريبي)" / "wheelchair space (demo)" |

- **2D seat buttons** announce, in the UI language: section, row, seat number, state, price, estimated view score and the wheelchair flag. Sold, blocked and held seats are `aria-disabled="true"` (clicks ignored); focused/basket seats are `aria-pressed="true"`.
- **3D hover label** repeats section · row · number · price · score · state as text.
- **Legend** under the map uses swatch **and** words: Available · Sold (folded) · Held · Selected ▼ · In basket ▼ · Your seat · Unavailable.
- **Category filter** buttons show swatch + name + price.

### 6.2 Exhibition booths

| Status | Colour | Icon | 2D pattern | Word (AR / EN) |
|---|---|---|---|---|
| available | `#5d9f7b` | ✓ | — | متاح / Available |
| held | `#c79140` | ⏳ (2D: clock glyph) | dashed inner outline | محجوز مؤقتاً / On hold |
| booked | `#a0525a` | ✕ | diagonal hatch | محجوز / Booked |
| unavailable | `#55505c` | ⊘ | dot pattern | غير متاح / Unavailable |

Selection = gold outline; pinned for comparison = blue numbered badge; recommended = ★ + rank; open booth front = ▲ (2D) or the dark counter (3D); main aisles dashed; exits in a green **EXIT** sign. Booth buttons announce code, status, size and area, score, main-aisle frontage and selection.

---

## 7. Motion system

| Motion | Spec | Purpose |
|---|---|---|
| UI transitions | `--dur` 220 ms, `--ease` `cubic-bezier(0.2, 0.7, 0.2, 1)` | Buttons, cards, borders |
| Drawer | 260 ms slide + fade from the inline-end edge (mirrored per direction); backdrop fade | Basket |
| Card hover | `translateY(-3px)` | Event cards |
| Skeleton | 1.4 s shimmer | Loading grids |
| Logo loader | 1.6 s stroke draw + spotlight glow, alternating | Loading |
| Camera flights (theatre) | ≈ 1.15 s, cubic ease-in-out, position + target + field of view | Overview ↔ section ↔ seat |
| Idle auto-rotate (theatre overview) | Slow orbit until the first interaction | Invite exploration |
| 360° tour | Fast orbit for 9 s, on request | Overview |
| Stage life (high quality only) | Performers sway; concert LED wall pattern (≤ 15 fps); swinging light beams; marker cones bob | Atmosphere |
| Seat-view zoom | Field of view 22°–75° (step 8°), smoothed | Look closer |
| SpaceVision | Camera flights; slow idle auto-rotate only in overview, before interaction, while on screen | Hall exploration |

### 7.1 `prefers-reduced-motion: reduce`

- **CSS:** a global rule shortens every animation and transition to ~0, forces a single iteration and disables smooth scrolling.
- **Theatre 3D:** camera moves jump directly to the destination; no idle auto-rotate; the 360° tour button is disabled; no stage animation (the canvas switches to on-demand rendering); markers are static.
- **SpaceVision:** camera moves jump; orbit damping and auto-rotate are off.
- **Scrolling:** chat and "scroll to booth/details" use instant scrolling.
- *Gap:* the booking page reads the preference once on load; SpaceVision listens for changes.

---

## 8. RTL / LTR rules

1. **Arabic first.** `index.html` ships `lang="ar" dir="rtl"`; `I18nProvider` keeps `<html lang dir>` in sync with the chosen language and stores it in `localStorage` (`ebk.lang`). English switches the whole document to LTR (`ع` / `EN` toggle in the header).
2. **Inline bilingual strings.** Every UI string is written as `t('عربي', 'English')` at the call site. Database content is bilingual by column and read with `pick(row, 'title')` → `title_ar` / `title_en` (Arabic fallback). Error codes map to bilingual messages (`errorText`).
3. **Logical CSS properties** for anything directional: `margin-inline`, `padding-inline-start`, `inset-inline-start/end`, `border-inline-start`, `text-align: start/end`, logical corner radii on chat bubbles. Physical properties are used only where the meaning is physical: projected 3D labels, symmetric ticket notches, the hall-plan SVG (forced `direction: ltr` because it is a map) and the seat-navigation arrows ◀ ▶ (forced LTR because they mean the venue's left and right).
4. **Numbers with `.num`.** Prices, scores, counts, references, seat numbers and times are isolated LTR runs with tabular figures.
5. **Direction hints on inputs:** `dir="ltr"` for email, phone, reference and code fields; `dir="auto"` for free text (chat, notes, case subjects); `<bdi>` for organization names.
6. **Keyboard follows reading direction:** in tab lists the "next" arrow is ← in RTL and → in LTR.
7. **Money:** always three decimals — `45.000 د.ك` (Arabic) / `KWD 45.000` (English); `null` renders *السعر عند الطلب / Price on Request*.
8. **Dates:** `Intl.DateTimeFormat` with `ar-KW` or `en-GB` in the `Asia/Kuwait` time zone. *Note:* `ar-KW` produces Arabic-Indic digits (e.g. «١٠ ديسمبر، ٠٨:٠٠ م») while prices and `.num` values use Western digits — pick one digit policy (e.g. the `-u-nu-latn` extension) for consistency.
9. **Digit input:** Arabic-Indic digits are accepted and normalised in mobile numbers, KWD amounts and order references (`toAsciiDigits`).
10. **The wordmark stays Latin and LTR** in both languages.

---

## 9. Accessibility commitments

Target: **WCAG 2.2 AA** (not yet audited or certified; a manual screen-reader audit is pending — see TEST-PLAN §4).

| Commitment | Implementation |
|---|---|
| Booking never requires 3D or a mouse | Complete 2D seat map and booth plan/list; automatic fallback without WebGL |
| Keyboard access | Skip link to `#main`; all controls are buttons/links/inputs; seat view: arrows move to adjacent seats/rows, **Enter** adds, **Esc** goes up a level; mini-map wedges and hall-plan booths are focusable buttons (Enter/Space); WAI-ARIA tab lists in My Bookings and the portals |
| Visible focus | `:focus-visible` 2 px `--gold-2` outline with offset; inputs get a gold border + ring |
| Touch targets | 44 px minimum for standard buttons, inputs, tabs and icon buttons (compact `.btn-sm` is 34 px) |
| Forms | Visible labels, linked hints and errors, `aria-invalid`, bilingual custom validation, focus moves to the first invalid field (booth request) |
| Status announcements | `role="status"`/`aria-live="polite"` for basket messages, order status banner, loaders and SpaceVision selection announcements; `role="log"` for the assistant conversation; errors use `role="alert"` |
| Never colour alone | §6; badges always contain words |
| Reduced motion | §7.1 |
| Language | `<html lang>` follows the UI language so screen readers switch voices; ARIA labels are localized |
| 3D canvas | Labelled (`aria-label`), with section labels as real buttons; the 2D path is the screen-reader path |
| Honest content | Demo, simulated and estimated states are stated in text |

**Known gaps (to fix):**

- `--faint` text contrast is below 4.5 : 1 (§2.4).
- The basket drawer does not trap focus or return focus to its trigger on close.
- The booking side panel uses `role="tab"` buttons without arrow-key support or `tabpanel` roles.
- Smart-pick errors show the raw error code instead of a translated message.
- Booking-page flash messages disappear after 5 s.
- Some decorative emoji inside buttons are not hidden from assistive technology.
- Seat-state colours are duplicated between CSS tokens and the 3D/2D code (§2.3).

---

## 10. Content patterns

| Situation | Pattern |
|---|---|
| Demo context | Site banner (*Demo build: all events, venues, payments and tickets are fictional — no real payment is processed*), DEMO tags, simulated-plan notices, demo checkout notice ("Never enter real card details. This page never asks for card numbers") |
| Estimates | "Estimated view score 81/100" + "A geometric estimate … not a guarantee of viewing quality" |
| Authenticity | Badges: *Simulated preview* (warn), *Geometry-based preview* (info), *Verified reference available* (ok) |
| Prices | Server-computed; fee rule shown before checkout ("2% + 0.250 KWD per ticket — shown in full before payment" in the demo configuration) |
| Payment uncertainty | Tell the customer what is known, what is not, and what not to do ("Please do not pay again") |
| Errors | Say what happened and what to do next, in the user's language; never expose internals |

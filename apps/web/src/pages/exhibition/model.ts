/**
 * SpaceVision data model + pure geometry helpers shared by the 3D scene, the 2D plan and the panels.
 * Coordinates follow packages/seatvision/src/exhibition.ts: hall x ∈ [-w/2, w/2], z ∈ [0, depth] (metres),
 * booth x/z is the centre, width runs along x and depth along z.
 */
import { DEFAULT_BOOTH_WEIGHTS, scoreBooth, type BoothSpec, type BoothWeights, type ExhibitionLayout } from '@ebooking/seatvision';

export type BoothStatus = 'available' | 'held' | 'booked' | 'unavailable';
export type ViewMode = 'overview' | 'booth' | 'eye';
export type WallSide = 'back' | 'front' | 'left' | 'right';

export interface Pt {
  x: number;
  z: number;
}

export interface Booth {
  id: string;
  code: string;
  zone: string;
  width: number;
  depth: number;
  x: number;
  z: number;
  open_sides: number;
  fronts_main_aisle: boolean;
  dist_entrance: number;
  dist_exit: number;
  score: number;
  status: BoothStatus;
  price_fils: number | null;
}

export interface HallGeometry {
  hall: { width: number; depth: number; height: number };
  entrances: { id: string; labelAr: string; labelEn: string; at: Pt; main: boolean }[];
  exits: { id: string; at: Pt }[];
  mainAisles: { id: string; from: Pt; to: Pt; width: number }[];
  fictional: boolean;
}

export interface Exhibition {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string;
  description_ar: string | null;
  description_en: string | null;
  demo: boolean;
  preview_authenticity: string | null;
  venue_ar: string;
  venue_en: string;
  organizer: string;
  dates: { starts_at: string | null; ends_at: string | null } | null;
  geometry: HallGeometry;
  booths: Booth[];
}

/** Geometry derived on the client (the API does not send facing / partition data). */
export interface BoothGeo {
  /** Unit vector of the booth front on the floor plane (always ±z in this layout family). */
  facing: Pt;
  /** A neighbouring booth shares the −x / +x side → a partition wall is drawn there. */
  closedLeft: boolean;
  closedRight: boolean;
  /** What the open front looks onto. */
  front: 'cross_aisle' | 'entrance_side' | 'perimeter';
  area: number;
}

export interface Recommendation {
  code: string;
  rankScore: number;
  reasons: { ar: string; en: string }[];
}

export interface Opening {
  id: string;
  kind: 'entrance' | 'exit';
  side: WallSide;
  /** Position along the wall axis (x for back/front walls, z for left/right walls). */
  center: number;
  width: number;
  main: boolean;
  at: Pt;
  labelAr: string;
  labelEn: string;
}

export interface WallSegment {
  side: WallSide;
  from: number;
  to: number;
}

export const STATUSES: BoothStatus[] = ['available', 'held', 'booked', 'unavailable'];

/** Status colour is never the only cue: each status also has an icon and a word. */
export const STATUS_META: Record<BoothStatus, { color: string; ink: string; icon: string; ar: string; en: string; badge: string }> = {
  available: { color: '#5d9f7b', ink: '#0d1912', icon: '✓', ar: 'متاح', en: 'Available', badge: 'badge-ok' },
  held: { color: '#c79140', ink: '#1a1206', icon: '⏳', ar: 'محجوز مؤقتاً', en: 'On hold', badge: 'badge-warn' },
  booked: { color: '#a0525a', ink: '#ffffff', icon: '✕', ar: 'محجوز', en: 'Booked', badge: 'badge-danger' },
  unavailable: { color: '#55505c', ink: '#ffffff', icon: '⊘', ar: 'غير متاح', en: 'Unavailable', badge: '' },
};

const EPS = 0.05;
const num = (v: unknown, d = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};
const pt = (p: any): Pt => ({ x: num(p?.x), z: num(p?.z) });

/** Round to one decimal and drop a trailing ".0". */
export const r1 = (n: number): string => String(Math.round(n * 10) / 10);

/** Coerce the API row into well-typed numbers (Postgres `real` columns may arrive as strings). */
export function normalizeExhibition(raw: any): Exhibition {
  let g = raw?.geometry;
  if (typeof g === 'string') {
    try {
      g = JSON.parse(g);
    } catch {
      g = null;
    }
  }
  const geometry: HallGeometry = {
    hall: { width: num(g?.hall?.width, 40), depth: num(g?.hall?.depth, 26), height: num(g?.hall?.height, 8) },
    entrances: Array.isArray(g?.entrances)
      ? g.entrances.map((e: any) => ({ id: String(e?.id ?? ''), labelAr: String(e?.labelAr ?? 'مدخل'), labelEn: String(e?.labelEn ?? 'Entrance'), at: pt(e?.at), main: !!e?.main }))
      : [],
    exits: Array.isArray(g?.exits) ? g.exits.map((e: any) => ({ id: String(e?.id ?? ''), at: pt(e?.at) })) : [],
    mainAisles: Array.isArray(g?.mainAisles) ? g.mainAisles.map((a: any) => ({ id: String(a?.id ?? ''), from: pt(a?.from), to: pt(a?.to), width: num(a?.width, 3) })) : [],
    fictional: g?.fictional !== false,
  };
  const booths: Booth[] = (Array.isArray(raw?.booths) ? raw.booths : []).map((b: any) => ({
    id: String(b.id),
    code: String(b.code),
    zone: String(b.zone ?? ''),
    width: num(b.width, 3),
    depth: num(b.depth, 3),
    x: num(b.x),
    z: num(b.z),
    open_sides: num(b.open_sides, 1),
    fronts_main_aisle: !!b.fronts_main_aisle,
    dist_entrance: num(b.dist_entrance),
    dist_exit: num(b.dist_exit),
    score: num(b.score),
    status: (STATUSES as string[]).includes(b.status) ? (b.status as BoothStatus) : 'unavailable',
    price_fils: b.price_fils == null ? null : num(b.price_fils),
  }));
  return {
    id: String(raw?.id ?? ''),
    slug: String(raw?.slug ?? ''),
    title_ar: String(raw?.title_ar ?? ''),
    title_en: String(raw?.title_en ?? ''),
    description_ar: raw?.description_ar ?? null,
    description_en: raw?.description_en ?? null,
    demo: !!raw?.demo,
    preview_authenticity: raw?.preview_authenticity ?? null,
    venue_ar: String(raw?.venue_ar ?? ''),
    venue_en: String(raw?.venue_en ?? ''),
    organizer: String(raw?.organizer ?? ''),
    dates: raw?.dates ?? null,
    geometry,
    booths,
  };
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > EPS;

/**
 * Facing: a booth's front looks toward the hall centre line (the cross aisle) unless another booth sits
 * directly against that edge (back-to-back rows) — then it faces the other way, toward the perimeter aisle.
 */
export function deriveBoothGeo(booths: Booth[], g: HallGeometry): Map<string, BoothGeo> {
  const mid = g.hall.depth / 2;
  const out = new Map<string, BoothGeo>();
  for (const b of booths) {
    const xOverlap = (o: Booth) => overlap(o.x - o.width / 2, o.x + o.width / 2, b.x - b.width / 2, b.x + b.width / 2);
    const zOverlap = (o: Booth) => overlap(o.z - o.depth / 2, o.z + o.depth / 2, b.z - b.depth / 2, b.z + b.depth / 2);
    const blocked = (dir: number) => booths.some((o) => o !== b && xOverlap(o) && Math.abs(o.z - (dir * o.depth) / 2 - (b.z + (dir * b.depth) / 2)) < EPS);
    let dir = b.z <= mid ? 1 : -1;
    if (blocked(dir) && !blocked(-dir)) dir = -dir;
    const closedLeft = booths.some((o) => o !== b && zOverlap(o) && Math.abs(o.x + o.width / 2 - (b.x - b.width / 2)) < EPS);
    const closedRight = booths.some((o) => o !== b && zOverlap(o) && Math.abs(o.x - o.width / 2 - (b.x + b.width / 2)) < EPS);

    const frontZ = b.z + (dir * b.depth) / 2;
    const facesCross = g.mainAisles.some((a) => {
      if (Math.abs(a.from.z - a.to.z) > EPS) return false; // only aisles running along x can sit in front
      const ahead = (a.from.z - frontZ) * dir;
      const x0 = Math.min(a.from.x, a.to.x);
      const x1 = Math.max(a.from.x, a.to.x);
      return ahead > -EPS && ahead <= a.width / 2 + 4 && b.x >= x0 - EPS && b.x <= x1 + EPS;
    });
    const wallZ = dir > 0 ? g.hall.depth : 0;
    const entranceSide = g.entrances.some((e) => e.main && Math.abs(e.at.z - wallZ) < 0.75);
    out.set(b.code, {
      facing: { x: 0, z: dir },
      closedLeft,
      closedRight,
      front: facesCross ? 'cross_aisle' : entranceSide ? 'entrance_side' : 'perimeter',
      area: b.width * b.depth,
    });
  }
  return out;
}

function sideOf(p: Pt, g: HallGeometry): WallSide | null {
  const hw = g.hall.width / 2;
  const c: [WallSide, number][] = [
    ['back', Math.abs(p.z)],
    ['front', Math.abs(p.z - g.hall.depth)],
    ['left', Math.abs(p.x + hw)],
    ['right', Math.abs(p.x - hw)],
  ];
  c.sort((a, b) => a[1] - b[1]);
  return c[0][1] <= 0.75 ? c[0][0] : null;
}

/** Door openings in the hall walls, derived from the entrance/exit points in the layout geometry. */
export function hallOpenings(g: HallGeometry): Opening[] {
  const out: Opening[] = [];
  const add = (id: string, kind: Opening['kind'], at: Pt, main: boolean, labelAr: string, labelEn: string) => {
    const side = sideOf(at, g);
    if (!side) return;
    const along = side === 'back' || side === 'front' ? at.x : at.z;
    out.push({ id, kind, side, center: along, width: kind === 'exit' ? 2 : main ? 6 : 4, main, at, labelAr, labelEn });
  };
  for (const e of g.entrances) add(e.id, 'entrance', e.at, e.main, e.labelAr, e.labelEn);
  for (const e of g.exits) add(e.id, 'exit', e.at, false, 'مخرج', 'Exit');
  return out;
}

/** Wall pieces between the door openings (for both the 3D walls and the 2D outline). */
export function wallSegments(g: HallGeometry, openings: Opening[]): WallSegment[] {
  const hw = g.hall.width / 2;
  const ranges: Record<WallSide, [number, number]> = { back: [-hw, hw], front: [-hw, hw], left: [0, g.hall.depth], right: [0, g.hall.depth] };
  const segs: WallSegment[] = [];
  for (const side of Object.keys(ranges) as WallSide[]) {
    const [lo, hi] = ranges[side];
    const holes = openings
      .filter((o) => o.side === side)
      .map((o) => [Math.max(lo, o.center - o.width / 2), Math.min(hi, o.center + o.width / 2)] as const)
      .sort((a, b) => a[0] - b[0]);
    let cur = lo;
    for (const [a, b] of holes) {
      if (a - cur > EPS) segs.push({ side, from: cur, to: a });
      cur = Math.max(cur, b);
    }
    if (hi - cur > EPS) segs.push({ side, from: cur, to: hi });
  }
  return segs;
}

/**
 * Re-derives the score components from the same function the server used at seed time, so the panel can
 * explain the number. `consistent` is false when the stored score came from different weights.
 */
export function scoreBreakdown(b: Booth, all: Booth[], g: HallGeometry): { weights: BoothWeights; components: BoothWeights; consistent: boolean } {
  const toSpec = (x: Booth): BoothSpec => ({
    code: x.code,
    zone: x.zone,
    center: { x: x.x, z: x.z },
    width: x.width,
    depth: x.depth,
    area: x.width * x.depth,
    openSides: x.open_sides,
    frontsMainAisle: x.fronts_main_aisle,
    facing: { x: 0, z: 1 },
    distToMainEntrance: x.dist_entrance,
    distToNearestExit: x.dist_exit,
  });
  const layout: ExhibitionLayout = {
    code: 'client-view',
    nameAr: '',
    nameEn: '',
    fictional: true,
    hall: g.hall,
    entrances: g.entrances,
    exits: g.exits,
    mainAisles: g.mainAisles,
    booths: all.map(toSpec),
  };
  const r = scoreBooth(toSpec(b), layout);
  return { weights: DEFAULT_BOOTH_WEIGHTS, components: r.components, consistent: Math.abs(r.score - b.score) <= 1 };
}

export const SV_CSS = `
.sv-page { padding-top: var(--s5); }
/* make scrollers the containing block so .sr-only (absolute) cells cannot widen the page */
.sv-page .table-wrap, .sv-plan-scroll { position: relative; }
.sv-head { display: grid; gap: var(--s3); margin-bottom: var(--s4); }
.sv-head h1 { margin: 0; }
.sv-meta { display: flex; flex-wrap: wrap; gap: 6px 20px; margin: 0; color: var(--muted); font-size: 0.92rem; }
.sv-meta div { display: flex; gap: 6px; }
.sv-meta dt { color: var(--faint); }
.sv-meta dd { margin: 0; color: var(--text); }
.sv-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-block: var(--s4) var(--s3); }
.sv-seg { display: inline-flex; border: 1px solid var(--line); border-radius: var(--r2); overflow: hidden; background: var(--bg-2); }
.sv-seg button { background: transparent; color: var(--muted); border: 0; padding: 6px 14px; min-height: 40px; font: inherit; font-weight: 600; cursor: pointer; }
.sv-seg button + button { border-inline-start: 1px solid var(--line); }
.sv-seg button[aria-pressed='true'] { background: var(--surface-2); color: var(--gold-2); }
.sv-seg button:disabled { opacity: 0.45; cursor: not-allowed; }
.sv-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 380px); gap: var(--s4); align-items: start; }
@media (max-width: 1000px) { .sv-layout { grid-template-columns: minmax(0, 1fr); } }
.sv-side { display: grid; gap: var(--s4); min-width: 0; }
.sv-side h2, .sv-side section { scroll-margin-top: calc(var(--header-h) + 16px); }
.sv-stage { position: relative; height: clamp(420px, 64vh, 660px); border-radius: var(--r3); overflow: hidden; isolation: isolate;
  background: radial-gradient(900px 420px at 50% 0%, #221c27 0%, #141117 70%); border: 1px solid var(--line-soft); scroll-margin-top: calc(var(--header-h) + 12px); }
@media (max-width: 640px) { .sv-stage { height: 55vh; min-height: 300px; } }
.sv-stage.is-2d { height: auto; min-height: 0; }
.sv-canvas-wrap { position: absolute; inset: 0; }
.sv-label-layer { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 1; }
.sv-label-layer > * { position: absolute; top: 0; left: 0; visibility: hidden; will-change: transform; }
.sv-loading { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; padding: 24px; color: var(--muted); }
.sv-ctrls { position: absolute; top: 10px; inset-inline-end: 10px; display: flex; flex-direction: column; gap: 6px; z-index: 30; }
.sv-ctrl { width: 40px; height: 40px; border-radius: 10px; background: rgba(18, 16, 20, 0.84); border: 1px solid var(--line); color: var(--ivory);
  cursor: pointer; display: grid; place-items: center; padding: 0; }
.sv-ctrl:hover { background: var(--surface-2); border-color: #4b4352; }
.sv-ctrl:disabled { opacity: 0.4; cursor: not-allowed; }
.sv-ctrl svg { width: 20px; height: 20px; }
.sv-chip { position: absolute; top: 10px; inset-inline-start: 10px; z-index: 30; max-width: calc(100% - 80px); display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  background: rgba(18, 16, 20, 0.84); border: 1px solid var(--line); border-radius: 10px; padding: 6px 10px; font-size: 0.8rem; color: var(--muted); }
@media (max-width: 640px) { .sv-chip { font-size: 0.72rem; padding: 4px 8px; max-width: calc(100% - 64px); } }
.sv-selbar { position: absolute; bottom: 10px; inset-inline: 10px; z-index: 30; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between;
  background: rgba(18, 16, 20, 0.9); border: 1px solid var(--line); border-radius: 12px; padding: 8px 10px 8px 12px; }
.sv-selbar strong { color: var(--ivory); }
.sv-tag { pointer-events: none; user-select: none; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; direction: ltr;
  padding: 2px 8px; border-radius: 999px; font: 600 11px/1.5 var(--font-ui); color: #f3ead8; background: rgba(18, 16, 20, 0.8);
  border: 1.5px solid var(--sv-c, #5d9f7b); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); }
.sv-tag .ic { color: var(--sv-c); font-size: 11px; }
.sv-tag .word { font-weight: 500; }
.sv-tag .pin { background: #7aa8d8; color: #0b1520; border-radius: 999px; padding: 0 5px; font-size: 10px; }
.sv-tag .rec { color: #e8c77c; }
.sv-tag.is-hover { background: rgba(38, 33, 43, 0.95); }
.sv-tag.is-sel { background: #e8c77c; color: #1a1408; border-color: #e8c77c; font-size: 12px; padding: 3px 10px; }
.sv-tag.is-sel .ic, .sv-tag.is-sel .rec { color: #1a1408; }
.sv-sign { pointer-events: none; user-select: none; white-space: nowrap; font: 700 11px/1.4 var(--font-ui); padding: 3px 8px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); }
.sv-sign.entrance { background: rgba(232, 199, 124, 0.95); color: #1a1408; }
.sv-sign.entrance.minor { background: rgba(243, 234, 216, 0.9); }
.sv-sign.exit { background: #1f8a4c; color: #fff; letter-spacing: 0.3px; }
.sv-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 0.82rem; color: var(--muted); margin-top: 10px; }
.sv-legend > span { display: inline-flex; align-items: center; gap: 6px; }
.sv-sw { width: 18px; height: 18px; border-radius: 4px; display: inline-grid; place-items: center; font-size: 11px; font-weight: 700; line-height: 1; }
.sv-sw.line { width: 22px; height: 8px; border-radius: 2px; }
.sv-plan-scroll { overflow-x: auto; padding: 8px; }
.sv-plan { display: block; width: 100%; min-width: 560px; height: auto; }
.sv-plan .booth { cursor: pointer; outline: none; }
.sv-plan .booth .ring { fill: none; stroke: transparent; stroke-width: 0.32; }
.sv-plan .booth:hover .tile { filter: brightness(1.18); }
.sv-plan .booth:focus-visible .ring { stroke: #f3ead8; stroke-dasharray: 0.5 0.3; }
.sv-plan text { font-family: var(--font-ui); }
.sv-dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; margin: 0; font-size: 0.92rem; }
.sv-dl dt { color: var(--muted); }
.sv-dl dd { margin: 0; color: var(--ivory); font-weight: 600; }
.sv-meter { height: 8px; border-radius: 99px; background: var(--bg-2); overflow: hidden; border: 1px solid var(--line-soft); }
.sv-meter > i { display: block; height: 100%; background: linear-gradient(90deg, var(--gold), var(--gold-2)); }
.sv-factors { display: grid; gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; font-size: 0.82rem; }
.sv-factors li { display: grid; grid-template-columns: minmax(0, 1fr) 72px; gap: 8px; align-items: center; }
.sv-score { font-family: var(--font-display); font-size: 1.8rem; color: var(--ivory); line-height: 1; }
.sv-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.sv-recs { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.sv-recs li { border: 1px solid var(--line-soft); border-radius: var(--r2); padding: 10px 12px; background: var(--bg-2); }
.sv-recs li.is-sel { border-color: var(--gold); }
.sv-rank { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: #241c0e; color: var(--gold-2); border: 1px solid #5a4720; font-weight: 700; font-size: 0.85rem; }
.sv-reasons { margin: 6px 0 0; padding-inline-start: 18px; font-size: 0.85rem; color: var(--muted); }
.sv-table tr.is-sel td, .sv-table tr.is-sel th { background: rgba(212, 166, 74, 0.09); }
.sv-table th[scope='row'] { color: var(--muted); font-weight: 600; background: var(--bg-2); position: static; }
.sv-table td { vertical-align: middle; }
.sv-table button.code { background: none; border: 1px solid var(--line); color: var(--ivory); border-radius: 8px; padding: 4px 10px; min-height: 34px; font: inherit; font-weight: 700; cursor: pointer; }
.sv-table button.code[aria-pressed='true'] { border-color: var(--gold); color: var(--gold-2); }
.sv-best { color: var(--gold-2); font-size: 0.75rem; margin-inline-start: 4px; }
.sv-check { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; cursor: pointer; }
.sv-check input { width: 18px; height: 18px; accent-color: var(--gold); }
.sv-section { margin-top: var(--s6); scroll-margin-top: calc(var(--header-h) + 12px); }
.sv-section > h2 { margin-bottom: var(--s2); }
.sv-filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; margin-bottom: var(--s3); }
.sv-filters .field { min-width: 180px; }
.sv-prefs { border: 0; padding: 0; margin: 0; display: grid; gap: 8px; }
.sv-prefs legend { font-weight: 600; color: var(--ivory); margin-bottom: 6px; padding: 0; }
.sv-form { display: grid; gap: var(--s3); }
.sv-form .grid-2 { gap: var(--s3); }
`;

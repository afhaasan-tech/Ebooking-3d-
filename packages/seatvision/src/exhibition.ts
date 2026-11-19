/**
 * SpaceVision — fictional demo exhibition hall layout and booth scoring.
 * Scores use only measurable layout characteristics (distances, open sides, aisle frontage, area).
 * They are NOT visitor-traffic or sales predictions.
 */
export interface Point2 {
  x: number;
  z: number;
}

export interface BoothSpec {
  code: string;
  zone: string;
  center: Point2;
  width: number;
  depth: number;
  area: number;
  openSides: number;
  frontsMainAisle: boolean;
  /** Direction the booth front faces (unit vector on the floor plane). */
  facing: Point2;
  distToMainEntrance: number;
  distToNearestExit: number;
}

export interface ExhibitionLayout {
  code: string;
  nameAr: string;
  nameEn: string;
  fictional: true;
  hall: { width: number; depth: number; height: number };
  entrances: { id: string; labelAr: string; labelEn: string; at: Point2; main: boolean }[];
  exits: { id: string; at: Point2 }[];
  mainAisles: { id: string; from: Point2; to: Point2; width: number }[];
  booths: BoothSpec[];
}

const d2 = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z);

export function generateDemoExhibition(): ExhibitionLayout {
  const entrances = [
    { id: 'main', labelAr: 'المدخل الرئيسي', labelEn: 'Main entrance', at: { x: 0, z: 26 }, main: true },
    { id: 'side', labelAr: 'المدخل الجانبي', labelEn: 'Side entrance', at: { x: -20, z: 13 }, main: false },
  ];
  const exits = [
    { id: 'exit-ne', at: { x: 20, z: 3 } },
    { id: 'exit-se', at: { x: 20, z: 23 } },
    { id: 'exit-nw', at: { x: -20, z: 3 } },
  ];
  const mainAisles = [
    { id: 'cross', from: { x: -20, z: 13 }, to: { x: 20, z: 13 }, width: 4 },
    { id: 'spine', from: { x: 0, z: 0 }, to: { x: 0, z: 26 }, width: 4 },
  ];

  const booths: BoothSpec[] = [];
  const quads: Array<{ letter: string; sx: number; sz: number; w: number }> = [
    { letter: 'A', sx: -1, sz: -1, w: 4 },
    { letter: 'B', sx: 1, sz: -1, w: 4 },
    { letter: 'C', sx: -1, sz: 1, w: 4 },
    { letter: 'D', sx: 1, sz: 1, w: 4 },
  ];
  for (const q of quads) {
    let n = 1;
    for (const rowOffset of [5.5, 8.5]) {
      const cz = 13 + q.sz * rowOffset;
      const facesMain = rowOffset === 5.5;
      for (let i = 0; i < 3; i++) {
        const cx = q.sx * (2 + q.w / 2 + i * q.w + (i === 0 ? 0 : 0));
        const isEnd = i === 0 || i === 2;
        const center = { x: cx, z: cz };
        const facing = { x: 0, z: facesMain ? -q.sz : q.sz };
        // booths next to the spine aisle (i === 0) also have frontage on a main aisle
        const frontsMainAisle = facesMain || i === 0;
        booths.push({
          code: `${q.letter}${String(n++).padStart(2, '0')}`,
          zone: q.letter,
          center,
          width: q.w,
          depth: 3,
          area: q.w * 3,
          openSides: isEnd ? 2 : 1,
          frontsMainAisle,
          facing,
          distToMainEntrance: round(d2(center, entrances[0].at)),
          distToNearestExit: round(Math.min(...exits.map((e) => d2(center, e.at)))),
        });
      }
    }
  }
  return {
    code: 'DEMO-EXPO-HALL',
    nameAr: 'قاعة المعارض التجريبية',
    nameEn: 'Demo Exhibition Hall',
    fictional: true,
    hall: { width: 40, depth: 26, height: 8 },
    entrances,
    exits,
    mainAisles,
    booths,
  };
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

export interface BoothWeights {
  entranceProximity: number;
  openSides: number;
  mainAisle: number;
  area: number;
}
export const DEFAULT_BOOTH_WEIGHTS: BoothWeights = { entranceProximity: 0.35, openSides: 0.25, mainAisle: 0.25, area: 0.15 };

export interface BoothScore {
  score: number;
  components: BoothWeights;
}

export function scoreBooth(b: BoothSpec, layout: ExhibitionLayout, w: BoothWeights = DEFAULT_BOOTH_WEIGHTS): BoothScore {
  const maxD = Math.hypot(layout.hall.width, layout.hall.depth);
  const maxArea = Math.max(...layout.booths.map((x) => x.area));
  const components = {
    entranceProximity: Math.max(0, 1 - b.distToMainEntrance / maxD),
    openSides: Math.min(1, (b.openSides - 1) / 2 + 0.5),
    mainAisle: b.frontsMainAisle ? 1 : 0.4,
    area: b.area / maxArea,
  };
  const sum = (Object.keys(w) as (keyof BoothWeights)[]).reduce((s, k) => s + w[k] * components[k], 0);
  return { score: Math.round((100 * sum) / Object.values(w).reduce((a, c) => a + c, 0)), components };
}

export interface BoothPreference {
  nearEntrance?: boolean;
  corner?: boolean;
  mainAisle?: boolean;
  minArea?: number;
  maxPriceFils?: number | null;
}

export interface BoothInventory {
  code: string;
  status: 'available' | 'held' | 'booked' | 'unavailable';
  priceFils: number | null;
}

export function recommendBooths(layout: ExhibitionLayout, inventory: BoothInventory[], pref: BoothPreference, limit = 3) {
  const inv = new Map(inventory.map((i) => [i.code, i]));
  return layout.booths
    .filter((b) => inv.get(b.code)?.status === 'available')
    .filter((b) => !pref.minArea || b.area >= pref.minArea)
    .filter((b) => {
      const p = inv.get(b.code)?.priceFils;
      // quote-based booths (null price) are kept; the organizer quotes later
      return pref.maxPriceFils == null || p == null || p <= pref.maxPriceFils;
    })
    .map((b) => {
      let r = scoreBooth(b, layout).score;
      const reasons: { ar: string; en: string }[] = [];
      if (pref.nearEntrance) {
        r += 20 * Math.max(0, 1 - b.distToMainEntrance / 30);
        reasons.push({ ar: `${b.distToMainEntrance} م من المدخل الرئيسي`, en: `${b.distToMainEntrance} m from the main entrance` });
      }
      if (pref.corner && b.openSides >= 2) {
        r += 10;
        reasons.push({ ar: 'بوث زاوية بواجهتين مفتوحتين', en: 'Corner booth with two open sides' });
      }
      if (pref.mainAisle && b.frontsMainAisle) {
        r += 10;
        reasons.push({ ar: 'واجهته على ممر رئيسي', en: 'Fronts a main aisle' });
      }
      return { code: b.code, rankScore: Math.round(r), reasons };
    })
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, limit);
}

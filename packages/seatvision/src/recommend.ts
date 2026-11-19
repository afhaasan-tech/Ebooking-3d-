import type { SeatIntent } from './intent';

/** A seat as seen by the recommender: server-authoritative status and price. */
export interface InventorySeat {
  id: string;
  sectionCode: string;
  row: string;
  number: number;
  tier: 'floor' | 'balcony';
  status: 'available' | 'held' | 'sold' | 'blocked';
  priceFils: number;
  categoryCode: string;
  score: number;
  distance: number;
  horizontalAngleDeg: number;
  centreOffset: number;
  accessible?: string | null;
}

export interface Recommendation {
  seatIds: string[];
  sectionCode: string;
  row: string;
  totalFils: number;
  avgScore: number;
  rankScore: number;
  reasons: { ar: string; en: string }[];
}

export interface RecommendResult {
  intent: SeatIntent;
  recommendations: Recommendation[];
  /** Explains why nothing matched, when applicable. */
  emptyReason?: { ar: string; en: string };
}

/**
 * Deterministic recommender. Only seats whose server status is "available" are considered,
 * adjacency means consecutive seat numbers in the same section and row (aisles split sections),
 * and the group total must not exceed the requested budget.
 */
export function recommendSeats(seats: InventorySeat[], intent: SeatIntent, limit = 5): RecommendResult {
  const q = intent.quantity;
  const rows = new Map<string, InventorySeat[]>();
  for (const s of seats) {
    if (s.status !== 'available') continue;
    if (intent.categories.length && !intent.categories.includes(s.categoryCode as never)) continue;
    if (intent.tier && s.tier !== intent.tier) continue;
    const k = `${s.sectionCode}|${s.row}`;
    (rows.get(k) ?? rows.set(k, []).get(k)!).push(s);
  }

  // row length (all seats, any status) for edge detection
  const rowMax = new Map<string, number>();
  for (const s of seats) {
    const k = `${s.sectionCode}|${s.row}`;
    rowMax.set(k, Math.max(rowMax.get(k) ?? 0, s.number));
  }

  const candidates: Recommendation[] = [];
  for (const [key, list] of rows) {
    list.sort((a, b) => a.number - b.number);
    for (let i = 0; i + q <= list.length; i++) {
      const win = list.slice(i, i + q);
      if (!isConsecutive(win)) continue;
      if (intent.accessible && !win.some((s) => s.accessible === 'wheelchair_space')) continue;
      const total = win.reduce((a, s) => a + s.priceFils, 0);
      if (intent.maxTotalFils !== null && total > intent.maxTotalFils) continue;
      candidates.push(rank(win, total, intent, rowMax.get(key) ?? win[win.length - 1].number));
    }
  }

  candidates.sort((a, b) => b.rankScore - a.rankScore || a.totalFils - b.totalFils);

  // diversity: avoid near-duplicate windows from the same row
  const picked: Recommendation[] = [];
  const usedRows = new Map<string, number>();
  for (const c of candidates) {
    const rk = `${c.sectionCode}|${c.row}`;
    if ((usedRows.get(rk) ?? 0) >= 1) continue;
    if (picked.some((p) => p.seatIds.some((id) => c.seatIds.includes(id)))) continue;
    picked.push(c);
    usedRows.set(rk, (usedRows.get(rk) ?? 0) + 1);
    if (picked.length >= limit) break;
  }

  let emptyReason: RecommendResult['emptyReason'];
  if (!picked.length) {
    emptyReason =
      intent.maxTotalFils !== null
        ? { ar: `ما لقينا ${q} كراسي متجاورة متاحة ضمن الميزانية المحددة. جرّب ميزانية أعلى أو عدد أقل.`, en: `No ${q} adjacent available seats fit that budget. Try a higher budget or fewer seats.` }
        : { ar: `ما لقينا ${q} كراسي متجاورة متاحة بهالشروط.`, en: `No ${q} adjacent available seats match these constraints.` };
  }
  return { intent, recommendations: picked, emptyReason };
}

function isConsecutive(win: InventorySeat[]): boolean {
  for (let i = 1; i < win.length; i++) if (win[i].number !== win[i - 1].number + 1) return false;
  return true;
}

function rank(win: InventorySeat[], total: number, intent: SeatIntent, rowMax: number): Recommendation {
  const avgScore = win.reduce((a, s) => a + s.score, 0) / win.length;
  const avgAngle = win.reduce((a, s) => a + s.horizontalAngleDeg, 0) / win.length;
  const avgDist = win.reduce((a, s) => a + s.distance, 0) / win.length;
  const avgOffset = win.reduce((a, s) => a + s.centreOffset, 0) / win.length;
  const touchesEdge = win[0].number <= 1 || win[win.length - 1].number >= rowMax;

  let r = avgScore;
  const reasons: Recommendation['reasons'] = [];
  reasons.push({ ar: `تقييم الرؤية التقديري ${Math.round(avgScore)}/100`, en: `Estimated view score ${Math.round(avgScore)}/100` });
  if (win.length > 1) reasons.push({ ar: `${win.length} كراسي متجاورة فعلياً بنفس الصف`, en: `${win.length} genuinely adjacent seats in one row` });

  if (intent.preferCentre) {
    r += 12 * (1 - Math.min(1, avgOffset / 8));
    if (avgOffset < 3) reasons.push({ ar: 'قريبة من منتصف المسرح', en: 'Close to the stage centre line' });
  }
  if (intent.avoidEdge) {
    r -= Math.max(0, avgAngle - 20) * 0.6;
    if (touchesEdge) r -= 4;
    if (avgAngle < 20) reasons.push({ ar: `زاوية جانبية بسيطة (${Math.round(avgAngle)}°)`, en: `Low side angle (${Math.round(avgAngle)}°)` });
  }
  if (intent.preferClose) {
    r += 15 * (1 - Math.min(1, Math.max(0, avgDist - 5) / 15));
    reasons.push({ ar: `المسافة للمسرح تقريباً ${avgDist.toFixed(1)} م`, en: `About ${avgDist.toFixed(1)} m from the stage` });
  }
  if (intent.cheapest) r -= total / 1000 / win.length;
  if (intent.maxTotalFils !== null) {
    reasons.push({ ar: `المجموع ${(total / 1000).toFixed(3)} د.ك ضمن ميزانيتك`, en: `Total KWD ${(total / 1000).toFixed(3)} within your budget` });
  }
  return {
    seatIds: win.map((s) => s.id),
    sectionCode: win[0].sectionCode,
    row: win[0].row,
    totalFils: total,
    avgScore: Math.round(avgScore),
    rankScore: Math.round(r * 10) / 10,
    reasons,
  };
}

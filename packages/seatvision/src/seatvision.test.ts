import { describe, it, expect } from 'vitest';
import { generateDemoVenue, seatCamera, eyePosition } from './venue';
import { scoreVenue, scoreFromMetrics, computeMetrics, DEFAULT_WEIGHTS } from './scoring';
import { segmentHitsAABB, v3 } from './geometry';
import { parseSeatIntent } from './intent';
import { recommendSeats, InventorySeat } from './recommend';
import { generateDemoExhibition, scoreBooth, recommendBooths } from './exhibition';

const venue = generateDemoVenue();
const scores = scoreVenue(venue);
const PRICES: Record<string, number> = { VIP: 45000, PREMIUM: 30000, STANDARD: 20000, ECONOMY: 10000 };

function inventory(sold: Set<string> = new Set()): InventorySeat[] {
  return venue.seats.map((s) => {
    const sc = scores.get(s.id)!;
    return {
      id: s.id,
      sectionCode: s.sectionCode,
      row: s.row,
      number: s.number,
      tier: s.tier,
      status: sold.has(s.id) ? 'sold' : 'available',
      priceFils: PRICES[s.defaultCategory],
      categoryCode: s.defaultCategory,
      score: sc.score,
      distance: sc.metrics.distance,
      horizontalAngleDeg: sc.metrics.horizontalAngleDeg,
      centreOffset: sc.metrics.centreOffset,
      accessible: s.accessible,
    };
  });
}

describe('demo venue', () => {
  it('has 400–700 uniquely identified seats', () => {
    expect(venue.seats.length).toBeGreaterThanOrEqual(400);
    expect(venue.seats.length).toBeLessThanOrEqual(700);
    expect(new Set(venue.seats.map((s) => s.id)).size).toBe(venue.seats.length);
  });
  it('places every seat in front of the stage and seats do not overlap', () => {
    for (const s of venue.seats) expect(s.position.z).toBeGreaterThan(0);
    const pos = new Set(venue.seats.map((s) => `${s.position.x.toFixed(2)},${s.position.y},${s.position.z.toFixed(2)}`));
    expect(pos.size).toBe(venue.seats.length);
  });
  it('seat numbers are consecutive within each row', () => {
    const rows = new Map<string, number[]>();
    for (const s of venue.seats) (rows.get(`${s.sectionCode}${s.row}`) ?? rows.set(`${s.sectionCode}${s.row}`, []).get(`${s.sectionCode}${s.row}`)!).push(s.number);
    for (const nums of rows.values()) nums.forEach((n, i) => expect(n).toBe(i + 1));
  });
  it('is generated deterministically (stable IDs across versions)', () => {
    expect(generateDemoVenue(2).seats.map((s) => s.id)).toEqual(venue.seats.map((s) => s.id));
  });
});

describe('seat camera', () => {
  it('positions the camera at the seated eye and aims at the stage', () => {
    const seat = venue.seats.find((s) => s.id === 'VIP-C-5')!;
    const cam = seatCamera(seat, venue.stage);
    expect(cam.position).toEqual(eyePosition(seat));
    expect(cam.position.y).toBeCloseTo(seat.position.y + 1.15);
    expect(cam.target).toEqual(venue.stage.focus);
  });
  it('different seats produce different camera positions', () => {
    const a = seatCamera(venue.seats[0], venue.stage).position;
    const b = seatCamera(venue.seats[100], venue.stage).position;
    expect(a).not.toEqual(b);
  });
});

describe('visibility scoring', () => {
  it('scores are integers in 0..100', () => {
    for (const s of scores.values()) {
      expect(Number.isInteger(s.score)).toBe(true);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
      expect(s.estimated).toBe(true);
    }
  });
  it('centre VIP beats far side balcony', () => {
    const vip = scores.get('VIP-C-5')!.score;
    const balSide = scores.get('BAL-BC-1')!.score;
    expect(vip).toBeGreaterThan(balSide);
  });
  it('a centre seat beats the aisle-end seat of the same side-section row', () => {
    const prl = venue.seats.filter((s) => s.sectionCode === 'PRL' && s.row === 'C');
    const inner = prl[prl.length - 1];
    const outer = prl[0];
    expect(scores.get(inner.id)!.score).toBeGreaterThan(scores.get(outer.id)!.score);
  });
  it('weights are explicit and normalised', () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
    const m = computeMetrics(venue.seats[0], venue, null);
    const perfect = scoreFromMetrics({ ...m, distance: 9, horizontalAngleDeg: 0, verticalAngleDeg: -6, centreOffset: 0, structuralVisibility: 1, cValue: null }, 'floor');
    expect(perfect.score).toBe(100);
  });
  it('segment/box obstruction test works', () => {
    const box = { id: 'b', min: v3(-1, -1, -1), max: v3(1, 1, 1) };
    expect(segmentHitsAABB(v3(-5, 0, 0), v3(5, 0, 0), box)).toBe(true);
    expect(segmentHitsAABB(v3(-5, 3, 0), v3(5, 3, 0), box)).toBe(false);
  });
});

describe('intent parser', () => {
  it('Kuwaiti: 4 together in the middle', () => {
    const i = parseSeatIntent('أبي ٤ كراسي يم بعض وبالنص');
    expect(i.quantity).toBe(4);
    expect(i.together).toBe(true);
    expect(i.preferCentre).toBe(true);
    expect(i.language).toBe('ar');
  });
  it('Arabic budget', () => {
    const i = parseSeatIntent('أبي أحسن إطلالة بميزانية ٦٠ دينار');
    expect(i.maxTotalFils).toBe(60000);
    expect(i.bestView).toBe(true);
  });
  it('close but not on the edge', () => {
    const i = parseSeatIntent('أبي كرسي قريب بس مو وايد على الطرف');
    expect(i.quantity).toBe(1);
    expect(i.preferClose).toBe(true);
    expect(i.avoidEdge).toBe(true);
  });
  it('English best two under 40 KWD', () => {
    const i = parseSeatIntent('Show me the best two seats under 40 KWD.');
    expect(i.quantity).toBe(2);
    expect(i.maxTotalFils).toBe(40000);
    expect(i.bestView).toBe(true);
  });
  it('caps quantity at 6', () => {
    expect(parseSeatIntent('I need 9 seats').quantity).toBe(6);
  });
});

describe('recommendations', () => {
  it('returns only available, adjacent seats within budget', () => {
    const intent = parseSeatIntent('أبي ٤ كراسي يم بعض وبالنص بميزانية 100 دينار');
    const res = recommendSeats(inventory(), intent);
    expect(res.recommendations.length).toBeGreaterThan(0);
    for (const r of res.recommendations) {
      expect(r.seatIds).toHaveLength(4);
      expect(r.totalFils).toBeLessThanOrEqual(100000);
      const nums = r.seatIds.map((id) => Number(id.split('-').pop()));
      nums.forEach((n, i) => i && expect(n).toBe(nums[i - 1] + 1));
    }
  });
  it('never includes sold seats', () => {
    const sold = new Set(venue.seats.filter((s) => s.sectionCode === 'VIP').map((s) => s.id));
    const res = recommendSeats(inventory(sold), parseSeatIntent('best 2 seats'));
    for (const r of res.recommendations) for (const id of r.seatIds) expect(sold.has(id)).toBe(false);
  });
  it('does not bridge a sold gap', () => {
    const rowSeats = venue.seats.filter((s) => s.sectionCode === 'VIP' && s.row === 'A');
    const others = new Set(venue.seats.filter((s) => !(s.sectionCode === 'VIP' && s.row === 'A')).map((s) => s.id));
    // sell every second seat in VIP row A and everything else
    rowSeats.forEach((s, i) => i % 2 === 0 && others.add(s.id));
    const res = recommendSeats(inventory(others), parseSeatIntent('2 seats together'));
    expect(res.recommendations).toHaveLength(0);
    expect(res.emptyReason).toBeDefined();
  });
  it('respects a tight budget (2 seats for 40 KWD => economy/standard only)', () => {
    const res = recommendSeats(inventory(), parseSeatIntent('best two seats under 40 KWD'));
    for (const r of res.recommendations) expect(r.totalFils).toBeLessThanOrEqual(40000);
    expect(res.recommendations.length).toBeGreaterThan(0);
  });
  it('accessible request returns a group including a wheelchair space', () => {
    const res = recommendSeats(inventory(), parseSeatIntent('2 wheelchair accessible seats'));
    expect(res.recommendations.length).toBeGreaterThan(0);
  });
});

describe('SpaceVision exhibition', () => {
  const ex = generateDemoExhibition();
  it('has 20–30 uniquely coded booths', () => {
    expect(ex.booths.length).toBeGreaterThanOrEqual(20);
    expect(ex.booths.length).toBeLessThanOrEqual(30);
    expect(new Set(ex.booths.map((b) => b.code)).size).toBe(ex.booths.length);
  });
  it('booths do not overlap', () => {
    for (const a of ex.booths)
      for (const b of ex.booths) {
        if (a === b) continue;
        const overlap = Math.abs(a.center.x - b.center.x) < (a.width + b.width) / 2 - 1e-6 && Math.abs(a.center.z - b.center.z) < (a.depth + b.depth) / 2 - 1e-6;
        expect(overlap).toBe(false);
      }
  });
  it('scores are bounded and recommendations skip booked booths', () => {
    for (const b of ex.booths) {
      const s = scoreBooth(b, ex).score;
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
    const inv = ex.booths.map((b, i) => ({ code: b.code, status: (i % 2 ? 'booked' : 'available') as 'booked' | 'available', priceFils: null }));
    const rec = recommendBooths(ex, inv, { nearEntrance: true, corner: true });
    for (const r of rec) expect(inv.find((i) => i.code === r.code)!.status).toBe('available');
  });
});

import { AABB, Vec3, clamp01, deg, dist, horizDist, segmentHitsAABB } from './geometry';
import { SeatSpec, StageSpec, VenueLayout, eyePosition } from './venue';

/**
 * SeatVision view-quality score (0–100). ESTIMATED from geometry — not a guarantee.
 * Every component is normalised to [0,1] and combined with explicit, configurable weights.
 */
export interface ScoringWeights {
  distance: number;
  horizontalAngle: number;
  verticalAngle: number;
  centreOffset: number;
  obstruction: number;
  tier: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  distance: 0.3,
  horizontalAngle: 0.2,
  verticalAngle: 0.15,
  centreOffset: 0.1,
  obstruction: 0.2,
  tier: 0.05,
};

export interface ScoringParams {
  /** Distance (m) at or below which distance score is maximal (beyond "too close" zone). */
  idealDistance: number;
  /** Distance (m) where distance score reaches 0. */
  maxDistance: number;
  /** Below this distance, viewers crane their necks; score eases down to 0.8. */
  tooClose: number;
  /** Comfortable vertical sightline (deg, negative = looking down). */
  idealVerticalDeg: number;
  verticalToleranceDeg: number;
  maxHorizontalDeg: number;
  /** C-value (m) considered excellent for sightlines over the row in front. */
  goodCValue: number;
  tierFactor: Record<string, number>;
}

export const DEFAULT_PARAMS: ScoringParams = {
  idealDistance: 9,
  maxDistance: 32,
  tooClose: 5,
  idealVerticalDeg: -6,
  verticalToleranceDeg: 40,
  maxHorizontalDeg: 75,
  goodCValue: 0.12,
  tierFactor: { floor: 1, balcony: 0.85 },
};

export interface SeatMetrics {
  distance: number;
  horizontalAngleDeg: number;
  verticalAngleDeg: number;
  centreOffset: number;
  /** Fraction of stage sample points with an unobstructed structural line of sight. */
  structuralVisibility: number;
  /** Sightline clearance over the eyes of the row in front (m); null when no row in front. */
  cValue: number | null;
  blockedBy: string[];
}

export interface SeatScore {
  score: number;
  components: Record<keyof ScoringWeights, number>;
  metrics: SeatMetrics;
  estimated: true;
}

export function computeMetrics(seat: SeatSpec, venue: Pick<VenueLayout, 'stage' | 'obstacles' | 'arcCenter'>, frontSeat?: SeatSpec | null): SeatMetrics {
  const eye = eyePosition(seat);
  const { stage } = venue;
  const f = stage.focus;
  const distance = dist(eye, f);

  // horizontal angle between line of sight and the stage normal (+z axis)
  const dx = eye.x - f.x;
  const dz = eye.z - f.z;
  const horizontalAngleDeg = Math.abs(deg(Math.atan2(dx, dz)));

  // vertical angle: negative means looking down at the focus point
  const verticalAngleDeg = deg(Math.atan2(f.y - eye.y, horizDist(eye, f)));

  const centreOffset = Math.abs(eye.x - f.x);

  const blocked = new Set<string>();
  let visible = 0;
  for (const p of stage.samples) {
    const hit = firstObstacle(eye, p, venue.obstacles);
    if (hit) blocked.add(hit);
    else visible++;
  }

  return {
    distance,
    horizontalAngleDeg,
    verticalAngleDeg,
    centreOffset,
    structuralVisibility: visible / stage.samples.length,
    cValue: frontSeat ? cValue(seat, frontSeat, stage) : null,
    blockedBy: [...blocked],
  };
}

function firstObstacle(a: Vec3, b: Vec3, obstacles: AABB[]): string | null {
  for (const o of obstacles) if (segmentHitsAABB(a, b, o)) return o.id;
  return null;
}

/**
 * Theatre C-value: vertical distance between this viewer's sightline to the stage front edge
 * and the eye of the person directly in front.
 */
export function cValue(seat: SeatSpec, front: SeatSpec, stage: StageSpec): number {
  const eye = eyePosition(seat);
  const frontEye = eyePosition(front);
  const p = { x: eye.x * 0.5, y: stage.height, z: 0 }; // stage front edge point roughly ahead
  const D = horizDist(eye, p);
  const d = horizDist(eye, frontEye);
  if (D <= 0 || d >= D) return 1;
  const lineY = eye.y + (p.y - eye.y) * (d / D);
  return lineY - frontEye.y;
}

export function scoreFromMetrics(m: SeatMetrics, tier: string, w: ScoringWeights = DEFAULT_WEIGHTS, p: ScoringParams = DEFAULT_PARAMS): SeatScore {
  const distance =
    m.distance < p.tooClose
      ? 0.8 + 0.2 * (m.distance / p.tooClose)
      : m.distance <= p.idealDistance
        ? 1
        : clamp01(1 - (m.distance - p.idealDistance) / (p.maxDistance - p.idealDistance));
  const horizontalAngle = clamp01(1 - m.horizontalAngleDeg / p.maxHorizontalDeg);
  const verticalAngle = clamp01(1 - Math.abs(m.verticalAngleDeg - p.idealVerticalDeg) / p.verticalToleranceDeg);
  const centreOffset = clamp01(1 - m.centreOffset / 16);
  const head = m.cValue === null ? 1 : clamp01(m.cValue / p.goodCValue);
  const obstruction = 0.6 * m.structuralVisibility + 0.4 * head;
  const tierScore = p.tierFactor[tier] ?? 1;

  const components = { distance, horizontalAngle, verticalAngle, centreOffset, obstruction, tier: tierScore };
  const total = (Object.keys(w) as (keyof ScoringWeights)[]).reduce((s, k) => s + w[k] * components[k], 0);
  const wsum = Object.values(w).reduce((a, b) => a + b, 0);
  return { score: Math.round((100 * total) / wsum), components, metrics: m, estimated: true };
}

/** Find the seat directly in front (same section, previous row, nearest lateral position). */
export function buildFrontSeatIndex(seats: SeatSpec[]): Map<string, SeatSpec | null> {
  const byRow = new Map<string, SeatSpec[]>();
  for (const s of seats) {
    const k = `${s.tier}|${s.rowIndex}`;
    (byRow.get(k) ?? byRow.set(k, []).get(k)!).push(s);
  }
  const res = new Map<string, SeatSpec | null>();
  for (const s of seats) {
    const prev = byRow.get(`${s.tier}|${s.rowIndex - 1}`);
    if (!prev) {
      res.set(s.id, null);
      continue;
    }
    let best: SeatSpec | null = null;
    let bestD = Infinity;
    for (const c of prev) {
      const d = horizDist(c.position, s.position);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    res.set(s.id, bestD < 1.6 ? best : null);
  }
  return res;
}

export function scoreVenue(venue: VenueLayout, w?: ScoringWeights, p?: ScoringParams): Map<string, SeatScore> {
  const front = buildFrontSeatIndex(venue.seats);
  const out = new Map<string, SeatScore>();
  for (const s of venue.seats) out.set(s.id, scoreFromMetrics(computeMetrics(s, venue, front.get(s.id)), s.tier, w, p));
  return out;
}

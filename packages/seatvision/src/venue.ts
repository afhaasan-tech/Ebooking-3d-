import { AABB, Vec3, rad, v3 } from './geometry';

/**
 * Procedural generator for the FICTIONAL demo venue "Gulf Pearl Demo Theatre".
 * Dimensions are invented for demonstration and do not describe any real Kuwait venue.
 *
 * Coordinate system (metres): stage front edge on z = 0, audience at z > 0 looking toward -z,
 * +x is the audience's right, y is up, floor at y = 0.
 */

export type Tier = 'floor' | 'balcony';

export interface StageSpec {
  width: number;
  depth: number;
  height: number;
  /** Representative performance focus point used for camera aim and scoring. */
  focus: Vec3;
  /** Sample points across the playing area (performer feet/heads) for visibility tests. */
  samples: Vec3[];
}

export interface SectionSpec {
  code: string;
  nameAr: string;
  nameEn: string;
  tier: Tier;
  /** Default ticket category code; actual price comes from event-level configuration. */
  defaultCategory: 'VIP' | 'PREMIUM' | 'STANDARD' | 'ECONOMY';
  rows: string[];
  angleFrom: number;
  angleTo: number;
  color: string;
}

export interface SeatSpec {
  id: string;
  sectionCode: string;
  row: string;
  rowIndex: number;
  number: number;
  tier: Tier;
  position: Vec3;
  /** Yaw (radians) so the seat faces the stage arc centre. */
  yaw: number;
  eyeHeight: number;
  accessible?: 'wheelchair_space' | 'companion' | null;
  /** True if the seat sits at the end of its row (next to an aisle). */
  aisle: boolean;
  defaultCategory: SectionSpec['defaultCategory'];
}

export interface VenueLayout {
  venueCode: string;
  layoutVersion: number;
  nameAr: string;
  nameEn: string;
  fictional: true;
  stage: StageSpec;
  arcCenter: Vec3;
  sections: SectionSpec[];
  seats: SeatSpec[];
  obstacles: AABB[];
  bounds: { width: number; depth: number; height: number };
}

const SEAT_PITCH = 0.62; // centre-to-centre along the row
const ROW_SPACING = 0.95;
const FLOOR_R0 = 9.2;
const BALCONY_R0 = 21;
const BALCONY_BASE_Y = 5.2;
const EYE = 1.15;

const FLOOR_ROWS = 'ABCDEFGHJKLM'.split(''); // I skipped by convention
const BALCONY_ROWS = ['BA', 'BB', 'BC'];

export function floorRowElevation(i: number): number {
  // progressive rake for stable C-values toward the back
  return Math.round((0.1 * i + 0.015 * i * i) * 1000) / 1000;
}
export function balconyRowElevation(i: number): number {
  return BALCONY_BASE_Y + 0.45 * i;
}

export function demoSections(): SectionSpec[] {
  const C = 15.5;
  const S0 = 17.5;
  const S1 = 38;
  return [
    { code: 'VIP', nameAr: 'كبار الشخصيات', nameEn: 'VIP', tier: 'floor', defaultCategory: 'VIP', rows: FLOOR_ROWS.slice(0, 5), angleFrom: -C, angleTo: C, color: '#d4a64a' },
    { code: 'PRC', nameAr: 'بريميوم وسط', nameEn: 'Premium Centre', tier: 'floor', defaultCategory: 'PREMIUM', rows: FLOOR_ROWS.slice(5, 8), angleFrom: -C, angleTo: C, color: '#b98a3c' },
    { code: 'PRL', nameAr: 'بريميوم يسار', nameEn: 'Premium Left', tier: 'floor', defaultCategory: 'PREMIUM', rows: FLOOR_ROWS.slice(0, 6), angleFrom: -S1, angleTo: -S0, color: '#9c7a46' },
    { code: 'PRR', nameAr: 'بريميوم يمين', nameEn: 'Premium Right', tier: 'floor', defaultCategory: 'PREMIUM', rows: FLOOR_ROWS.slice(0, 6), angleFrom: S0, angleTo: S1, color: '#9c7a46' },
    { code: 'STC', nameAr: 'عادي وسط', nameEn: 'Standard Centre', tier: 'floor', defaultCategory: 'STANDARD', rows: FLOOR_ROWS.slice(8), angleFrom: -C, angleTo: C, color: '#6f7d8c' },
    { code: 'STL', nameAr: 'عادي يسار', nameEn: 'Standard Left', tier: 'floor', defaultCategory: 'STANDARD', rows: FLOOR_ROWS.slice(6), angleFrom: -S1, angleTo: -S0, color: '#5d6976' },
    { code: 'STR', nameAr: 'عادي يمين', nameEn: 'Standard Right', tier: 'floor', defaultCategory: 'STANDARD', rows: FLOOR_ROWS.slice(6), angleFrom: S0, angleTo: S1, color: '#5d6976' },
    { code: 'BAL', nameAr: 'البلكونة', nameEn: 'Balcony', tier: 'balcony', defaultCategory: 'ECONOMY', rows: BALCONY_ROWS, angleFrom: -30, angleTo: 30, color: '#4a5a6a' },
  ];
}

export function generateDemoVenue(layoutVersion = 1): VenueLayout {
  const arcCenter = v3(0, 0, -6);
  const stage: StageSpec = {
    width: 16,
    depth: 9,
    height: 1.1,
    focus: v3(0, 2.3, -3),
    samples: [
      v3(-4.5, 1.25, -2.5), v3(0, 1.25, -2.5), v3(4.5, 1.25, -2.5),
      v3(-4.5, 2.9, -3.5), v3(0, 2.9, -3.5), v3(4.5, 2.9, -3.5),
      v3(0, 1.2, -6.5),
    ],
  };
  const sections = demoSections();
  const seats: SeatSpec[] = [];

  for (const sec of sections) {
    sec.rows.forEach((row) => {
      const globalRowIndex = sec.tier === 'floor' ? FLOOR_ROWS.indexOf(row) : BALCONY_ROWS.indexOf(row);
      const R = sec.tier === 'floor' ? FLOOR_R0 + globalRowIndex * ROW_SPACING : BALCONY_R0 + globalRowIndex * 1.0;
      const y = sec.tier === 'floor' ? floorRowElevation(globalRowIndex) : balconyRowElevation(globalRowIndex);
      const a0 = rad(sec.angleFrom);
      const a1 = rad(sec.angleTo);
      const span = (a1 - a0) * R;
      const count = Math.max(1, Math.floor(span / SEAT_PITCH));
      const used = (count - 1) * SEAT_PITCH;
      const start = (a0 + a1) / 2 - used / R / 2;
      for (let n = 0; n < count; n++) {
        const theta = start + (n * SEAT_PITCH) / R;
        const x = arcCenter.x + R * Math.sin(theta);
        const z = arcCenter.z + R * Math.cos(theta);
        const number = n + 1;
        const isLastFloorRow = sec.code === 'STC' && row === FLOOR_ROWS[FLOOR_ROWS.length - 1];
        seats.push({
          id: `${sec.code}-${row}-${number}`,
          sectionCode: sec.code,
          row,
          rowIndex: globalRowIndex,
          number,
          tier: sec.tier,
          position: v3(round(x), y, round(z)),
          yaw: Math.atan2(arcCenter.x - x, arcCenter.z - z),
          eyeHeight: EYE,
          // Demo-only: fictional wheelchair positions at the rear aisle ends of Standard Centre.
          accessible: isLastFloorRow && (n === 0 || n === count - 1) ? 'wheelchair_space' : isLastFloorRow && (n === 1 || n === count - 2) ? 'companion' : null,
          aisle: n === 0 || n === count - 1,
          defaultCategory: sec.defaultCategory,
        });
      }
    });
  }

  const obstacles: AABB[] = [
    // lighting/speaker truss towers at stage front corners
    { id: 'truss-left', min: v3(-8.6, 0, -0.6), max: v3(-7.8, 7, 0.4) },
    { id: 'truss-right', min: v3(7.8, 0, -0.6), max: v3(8.6, 7, 0.4) },
    // stage deck (blocks low sightlines to upstage floor)
    { id: 'stage-deck', min: v3(-stage.width / 2, 0, -stage.depth), max: v3(stage.width / 2, stage.height, 0) },
    // proscenium side walls
    { id: 'proscenium-left', min: v3(-12, 0, -0.9), max: v3(-8.7, 10, -0.5) },
    { id: 'proscenium-right', min: v3(8.7, 0, -0.9), max: v3(12, 10, -0.5) },
  ];

  return {
    venueCode: 'GULF-PEARL-DEMO',
    layoutVersion,
    nameAr: 'مسرح لؤلؤة الخليج (تجريبي)',
    nameEn: 'Gulf Pearl Demo Theatre',
    fictional: true,
    stage,
    arcCenter,
    sections,
    seats,
    obstacles,
    bounds: { width: 52, depth: 40, height: 14 },
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Eye position of a seated adult. */
export function eyePosition(seat: Pick<SeatSpec, 'position' | 'eyeHeight'>): Vec3 {
  return v3(seat.position.x, seat.position.y + seat.eyeHeight, seat.position.z);
}

/** Camera pose for the SeatVision perspective: seated eye, aimed at the stage focus. */
export function seatCamera(seat: SeatSpec, stage: StageSpec): { position: Vec3; target: Vec3 } {
  return { position: eyePosition(seat), target: stage.focus };
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface AABB {
  id: string;
  min: Vec3;
  max: Vec3;
}

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
export const horizDist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);
export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
export const deg = (rad: number): number => (rad * 180) / Math.PI;
export const rad = (d: number): number => (d * Math.PI) / 180;

/**
 * Segment vs axis-aligned box (slab method).
 * Returns true if the open segment a→b intersects the box strictly between the endpoints.
 */
export function segmentHitsAABB(a: Vec3, b: Vec3, box: AABB, eps = 1e-6): boolean {
  const d = sub(b, a);
  let tmin = eps;
  let tmax = 1 - eps;
  for (const axis of ['x', 'y', 'z'] as const) {
    const o = a[axis];
    const dir = d[axis];
    const lo = box.min[axis];
    const hi = box.max[axis];
    if (Math.abs(dir) < 1e-12) {
      if (o < lo || o > hi) return false;
    } else {
      let t1 = (lo - o) / dir;
      let t2 = (hi - o) / dir;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

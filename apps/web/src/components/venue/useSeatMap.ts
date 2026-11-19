import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';

export interface SeatRow {
  id: string;
  section: string;
  row: string;
  number: number;
  tier: 'floor' | 'balcony';
  x: number;
  y: number;
  z: number;
  yaw: number;
  eye_height: number;
  aisle: boolean;
  accessible: 'wheelchair_space' | 'companion' | null;
  score: number;
  distance: number;
  h_angle: number;
  v_angle: number;
  centre_offset: number;
  c_value: number | null;
  blocked_by: string[];
  status: 'available' | 'held' | 'sold' | 'blocked';
  category_id: string;
}
export interface Section {
  code: string;
  name_ar: string;
  name_en: string;
  tier: string;
  default_category: string;
  color: string;
}
export interface Category {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  price_fils: number;
  color: string;
}
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Geometry {
  stage: { width: number; depth: number; height: number; focus: Vec3; samples: Vec3[] };
  arcCenter: Vec3;
  obstacles: { id: string; min: Vec3; max: Vec3 }[];
  bounds: { width: number; depth: number; height: number };
}
export interface SeatMap {
  performance: any & { geometry: Geometry; stage_mode: 'theatre' | 'concert'; preview_authenticity: string };
  sections: Section[];
  seats: SeatRow[];
  categories: Category[];
  verifiedReferences: { section_code: string; seat_code: string | null; asset_path: string; version: number }[];
}

export interface SeatIndex {
  byId: Map<string, SeatRow>;
  indexOf: Map<string, number>;
  rows: Map<string, SeatRow[]>; // key section|row, sorted by number
  sectionRows: Map<string, string[]>; // section -> ordered row labels
  sectionCentroid: Map<string, Vec3>;
  catById: Map<string, Category>;
  sectionStats: Map<string, { available: number; total: number; minPrice: number }>;
}

export function buildIndex(map: SeatMap): SeatIndex {
  const byId = new Map<string, SeatRow>();
  const indexOf = new Map<string, number>();
  const rows = new Map<string, SeatRow[]>();
  const sectionRowsSet = new Map<string, Map<string, number>>();
  const acc = new Map<string, { x: number; y: number; z: number; n: number }>();
  const catById = new Map(map.categories.map((c) => [c.id, c]));
  const sectionStats = new Map<string, { available: number; total: number; minPrice: number }>();
  map.seats.forEach((s, i) => {
    byId.set(s.id, s);
    indexOf.set(s.id, i);
    const k = `${s.section}|${s.row}`;
    (rows.get(k) ?? rows.set(k, []).get(k)!).push(s);
    const sr = sectionRowsSet.get(s.section) ?? sectionRowsSet.set(s.section, new Map()).get(s.section)!;
    sr.set(s.row, Math.min(sr.get(s.row) ?? Infinity, s.z));
    const a = acc.get(s.section) ?? acc.set(s.section, { x: 0, y: 0, z: 0, n: 0 }).get(s.section)!;
    a.x += s.x;
    a.y += s.y;
    a.z += s.z;
    a.n++;
    const st = sectionStats.get(s.section) ?? sectionStats.set(s.section, { available: 0, total: 0, minPrice: Infinity }).get(s.section)!;
    st.total++;
    if (s.status === 'available') st.available++;
    st.minPrice = Math.min(st.minPrice, catById.get(s.category_id)?.price_fils ?? Infinity);
  });
  for (const list of rows.values()) list.sort((a, b) => a.number - b.number);
  const sectionRows = new Map<string, string[]>();
  for (const [sec, m] of sectionRowsSet) sectionRows.set(sec, [...m.entries()].sort((a, b) => a[1] - b[1]).map(([r]) => r));
  const sectionCentroid = new Map<string, Vec3>();
  for (const [sec, a] of acc) sectionCentroid.set(sec, { x: a.x / a.n, y: a.y / a.n, z: a.z / a.n });
  return { byId, indexOf, rows, sectionRows, sectionCentroid, catById, sectionStats };
}

/** Loads the seat map once; revalidates availability on an interval (never per frame). */
export function useSeatMap(performanceId: string | undefined) {
  const [map, setMap] = useState<SeatMap | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [version, setVersion] = useState(0);
  const mapRef = useRef<SeatMap | null>(null);

  useEffect(() => {
    if (!performanceId) return;
    let alive = true;
    api<SeatMap>(`/api/performances/${performanceId}/seatmap`)
      .then((m) => {
        if (!alive) return;
        mapRef.current = m;
        setMap(m);
      })
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [performanceId]);

  const refreshAvailability = useCallback(async () => {
    if (!performanceId || !mapRef.current) return;
    try {
      const a = await api<{ seats: { c: string; s: SeatRow['status'] }[] }>(`/api/performances/${performanceId}/availability`);
      const st = new Map(a.seats.map((x) => [x.c, x.s]));
      let changed = false;
      for (const s of mapRef.current.seats) {
        const n = st.get(s.id);
        if (n && n !== s.status) {
          s.status = n;
          changed = true;
        }
      }
      if (changed) setVersion((v) => v + 1);
    } catch {
      /* transient; next tick retries */
    }
  }, [performanceId]);

  useEffect(() => {
    const tick = () => document.visibilityState === 'visible' && void refreshAvailability();
    const t = setInterval(tick, 20000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refreshAvailability]);

  // statuses are updated in place on revalidation; `version` forces the index (stats) to rebuild
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const index = useMemo(() => (map ? buildIndex(map) : null), [map, version]);
  return { map, index, error, refreshAvailability, version };
}

export function canUseWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function defaultQuality(): 'high' | 'low' {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  return mobile || (navigator.hardwareConcurrency ?? 8) <= 4 ? 'low' : 'high';
}

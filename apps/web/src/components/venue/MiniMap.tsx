import { useMemo } from 'react';
import type { SeatIndex, SeatMap, SeatRow } from './useSeatMap';
import type { CameraInfo } from './VenueCanvas';

/** Section outline polygons derived from actual seat positions (arc wedges around the arc centre). */
export function useSectionOutlines(map: SeatMap) {
  return useMemo(() => {
    const c = map.performance.geometry.arcCenter;
    const by = new Map<string, SeatRow[]>();
    for (const s of map.seats) (by.get(s.section) ?? by.set(s.section, []).get(s.section)!).push(s);
    const out = new Map<string, string>();
    for (const [code, seats] of by) {
      let r0 = Infinity, r1 = -Infinity, a0 = Infinity, a1 = -Infinity;
      for (const s of seats) {
        const R = Math.hypot(s.x - c.x, s.z - c.z);
        const a = Math.atan2(s.x - c.x, s.z - c.z);
        r0 = Math.min(r0, R); r1 = Math.max(r1, R); a0 = Math.min(a0, a); a1 = Math.max(a1, a);
      }
      r0 -= 0.5; r1 += 0.5; a0 -= 0.025; a1 += 0.025;
      const pts: string[] = [];
      for (let i = 0; i <= 12; i++) { const a = a0 + ((a1 - a0) * i) / 12; pts.push(`${(c.x + r0 * Math.sin(a)).toFixed(2)},${(c.z + r0 * Math.cos(a)).toFixed(2)}`); }
      for (let i = 12; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / 12; pts.push(`${(c.x + r1 * Math.sin(a)).toFixed(2)},${(c.z + r1 * Math.cos(a)).toFixed(2)}`); }
      out.set(code, pts.join(' '));
    }
    return out;
  }, [map]);
}

export function MiniMap({ map, index, selectedSection, currentSeat, camera, onSection, label }: { map: SeatMap; index: SeatIndex; selectedSection: string | null; currentSeat: SeatRow | null; camera: CameraInfo | null; onSection: (code: string) => void; label: (code: string) => string }) {
  const outlines = useSectionOutlines(map);
  const st = map.performance.geometry.stage;
  return (
    <svg viewBox="-26 -11 52 40" role="group" aria-label="Venue mini-map" style={{ width: '100%', height: 'auto', display: 'block' }}>
      <rect x={-st.width / 2} y={-st.depth} width={st.width} height={st.depth} rx={0.4} fill="#4a3424" stroke="#d4a64a" strokeWidth={0.15} />
      <text x={0} y={-st.depth / 2} textAnchor="middle" fontSize={1.6} fill="#f3ead8" style={{ fontFamily: 'var(--font-ui)' }}>STAGE · المسرح</text>
      {map.sections.map((s) => {
        const stats = index.sectionStats.get(s.code)!;
        const ratio = stats.available / stats.total;
        const sel = selectedSection === s.code;
        return (
          <g key={s.code}>
            <polygon
              points={outlines.get(s.code)}
              fill={s.color}
              fillOpacity={0.25 + ratio * 0.55}
              stroke={sel ? '#ffe08a' : '#121014'}
              strokeWidth={sel ? 0.45 : 0.15}
              style={{ cursor: 'pointer' }}
              tabIndex={0}
              role="button"
              aria-label={`${label(s.code)} — ${stats.available}/${stats.total}`}
              aria-pressed={sel}
              onClick={() => onSection(s.code)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSection(s.code))}
            />
          </g>
        );
      })}
      {currentSeat && <circle cx={currentSeat.x} cy={currentSeat.z} r={0.7} fill="#ffe08a" stroke="#121014" strokeWidth={0.2} />}
      {camera && (
        <g transform={`translate(${camera.position.x.toFixed(2)} ${camera.position.z.toFixed(2)})`}>
          <circle r={0.6} fill="#7aa8d8" />
          <line x1={0} y1={0} x2={(Math.sin(camera.yaw) * 4).toFixed(2)} y2={(-Math.cos(camera.yaw) * 4).toFixed(2)} stroke="#7aa8d8" strokeWidth={0.35} markerEnd="url(#arrow)" />
        </g>
      )}
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#7aa8d8" />
        </marker>
      </defs>
    </svg>
  );
}

/**
 * Accessible top-down SVG plan: every booth is a focusable button with a descriptive label.
 * Used when WebGL is unavailable / fails, and whenever the visitor picks the 2D view.
 * The plan is spatial, so it is never mirrored for RTL (x grows to the right, the main entrance is at the bottom).
 */
import { useId, useMemo, type KeyboardEvent, type ReactElement } from 'react';
import { STATUS_META, hallOpenings, wallSegments, type Booth, type BoothGeo, type BoothStatus, type HallGeometry, type Opening } from './model';

export interface PlanText {
  planLabel: string;
  boothAria: (b: Booth) => string;
  exit: string;
  entrance: (o: Opening) => string;
  aisle: string;
  scale: string;
}

function StatusGlyph({ status, color }: { status: BoothStatus; color: string }) {
  const sw = 0.13;
  if (status === 'available') return <path d="M-0.32 0.02 L-0.1 0.24 L0.32 -0.2" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />;
  if (status === 'booked') return <path d="M-0.24 -0.24 L0.24 0.24 M0.24 -0.24 L-0.24 0.24" stroke={color} strokeWidth={sw} strokeLinecap="round" />;
  if (status === 'held')
    return (
      <g fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round">
        <circle r={0.3} />
        <path d="M0 -0.17 V0 L0.13 0.1" />
      </g>
    );
  return (
    <g fill="none" stroke={color} strokeWidth={sw}>
      <circle r={0.3} />
      <path d="M-0.21 0.21 L0.21 -0.21" />
    </g>
  );
}

export function HallPlan2D({
  geometry,
  booths,
  geo,
  selected,
  pinned,
  recommended,
  text,
  onSelect,
}: {
  geometry: HallGeometry;
  booths: Booth[];
  geo: Map<string, BoothGeo>;
  selected: string | null;
  pinned: string[];
  recommended: Map<string, number>;
  text: PlanText;
  onSelect: (code: string) => void;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const hatchId = `sv-hatch-${uid}`;
  const dotsId = `sv-dots-${uid}`;
  const { hall } = geometry;
  const hw = hall.width / 2;
  const D = hall.depth;
  const pad = 3.6;
  const openings = useMemo(() => hallOpenings(geometry), [geometry]);
  const segs = useMemo(() => wallSegments(geometry, openings), [geometry, openings]);

  const gridLines: ReactElement[] = [];
  for (let x = -hw + 2; x < hw - 1e-6; x += 2) gridLines.push(<line key={`gx${x}`} x1={x} y1={0} x2={x} y2={D} />);
  for (let z = 2; z < D - 1e-6; z += 2) gridLines.push(<line key={`gz${z}`} x1={-hw} y1={z} x2={hw} y2={z} />);

  const onKey = (code: string) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(code);
    }
  };

  return (
    <div className="sv-plan-scroll">
      <svg className="sv-plan" viewBox={`${-hw - pad} ${-pad} ${hall.width + 2 * pad} ${D + 2 * pad}`} style={{ direction: 'ltr' }} role="group" aria-label={text.planLabel}>
        <defs>
          <pattern id={hatchId} patternUnits="userSpaceOnUse" width="0.7" height="0.7" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="0.7" stroke="rgba(0,0,0,0.38)" strokeWidth="0.26" />
          </pattern>
          <pattern id={dotsId} patternUnits="userSpaceOnUse" width="0.6" height="0.6">
            <circle cx="0.3" cy="0.3" r="0.09" fill="rgba(255,255,255,0.22)" />
          </pattern>
        </defs>

        {/* floor + 2 m grid */}
        <rect x={-hw} y={0} width={hall.width} height={D} fill="#1f1b23" />
        <g stroke="#2e2934" strokeWidth={0.04} aria-hidden="true">
          {gridLines}
        </g>

        {/* main aisles */}
        <g aria-hidden="true">
          {geometry.mainAisles.map((a, i) => {
            const ang = (Math.atan2(a.to.z - a.from.z, a.to.x - a.from.x) * 180) / Math.PI;
            const lx = a.from.x + (a.to.x - a.from.x) * 0.16;
            const lz = a.from.z + (a.to.z - a.from.z) * 0.16;
            const upright = ang > 90 || ang < -90 ? ang + 180 : ang;
            return (
              <g key={a.id || i}>
                <line x1={a.from.x} y1={a.from.z} x2={a.to.x} y2={a.to.z} stroke="#2b2631" strokeWidth={a.width} />
                <line x1={a.from.x} y1={a.from.z} x2={a.to.x} y2={a.to.z} stroke="#6f5c33" strokeWidth={0.1} strokeDasharray="0.8 0.6" />
                <text x={lx} y={lz} transform={`rotate(${upright} ${lx} ${lz})`} dy={-0.35} textAnchor="middle" fontSize={0.72} fill="#9a8a62">
                  {text.aisle}
                </text>
              </g>
            );
          })}
        </g>

        {/* walls with door openings */}
        <g stroke="#6a6172" strokeWidth={0.32} strokeLinecap="square" aria-hidden="true">
          {segs.map((s, i) => {
            if (s.side === 'back') return <line key={i} x1={s.from} y1={0} x2={s.to} y2={0} />;
            if (s.side === 'front') return <line key={i} x1={s.from} y1={D} x2={s.to} y2={D} />;
            if (s.side === 'left') return <line key={i} x1={-hw} y1={s.from} x2={-hw} y2={s.to} />;
            return <line key={i} x1={hw} y1={s.from} x2={hw} y2={s.to} />;
          })}
        </g>

        {/* entrances & exits */}
        <g aria-hidden="true">
          {openings.map((o) => {
            const horizontal = o.side === 'back' || o.side === 'front';
            const half = o.width / 2;
            const wallCoord = o.side === 'back' ? 0 : o.side === 'front' ? D : o.side === 'left' ? -hw : hw;
            const outward = o.side === 'back' || o.side === 'left' ? -1 : 1;
            const lx = horizontal ? o.center : wallCoord + outward * 1.35;
            const ly = horizontal ? wallCoord + outward * 1.35 : o.center;
            const rot = horizontal ? 0 : o.side === 'left' ? -90 : 90;
            const isExit = o.kind === 'exit';
            const color = isExit ? '#2fbf71' : o.main ? '#e8c77c' : '#d9d0c1';
            const line = horizontal ? (
              <line x1={o.center - half} y1={wallCoord} x2={o.center + half} y2={wallCoord} stroke={color} strokeWidth={0.18} strokeDasharray={isExit ? undefined : '0.5 0.3'} />
            ) : (
              <line x1={wallCoord} y1={o.center - half} x2={wallCoord} y2={o.center + half} stroke={color} strokeWidth={0.18} strokeDasharray={isExit ? undefined : '0.5 0.3'} />
            );
            // inward arrow for entrances
            const ax = horizontal ? o.center : wallCoord - outward * 0.2;
            const ay = horizontal ? wallCoord - outward * 0.2 : o.center;
            const arrow = !isExit && (
              <path
                d={horizontal ? `M${ax - 0.5} ${ay} L${ax + 0.5} ${ay} L${ax} ${ay - outward * 0.8} Z` : `M${ax} ${ay - 0.5} L${ax} ${ay + 0.5} L${ax - outward * 0.8} ${ay} Z`}
                fill={color}
              />
            );
            return (
              <g key={`${o.kind}-${o.id}`}>
                {line}
                {arrow}
                {isExit ? (
                  <g transform={`translate(${lx} ${ly}) rotate(${rot})`}>
                    <rect x={-1.25} y={-0.48} width={2.5} height={0.96} rx={0.15} fill="#1f8a4c" />
                    <text y={0.28} textAnchor="middle" fontSize={0.66} fontWeight={700} fill="#fff">
                      {text.exit}
                    </text>
                  </g>
                ) : (
                  <text x={lx} y={ly} transform={rot ? `rotate(${rot} ${lx} ${ly})` : undefined} dy={0.3} textAnchor="middle" fontSize={o.main ? 0.9 : 0.78} fontWeight={700} fill={color}>
                    {text.entrance(o)}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* booths */}
        <g>
          {booths.map((b) => {
            const g = geo.get(b.code);
            if (!g) return null;
            const meta = STATUS_META[b.status];
            const w = b.width;
            const d = b.depth;
            const f = g.facing.z >= 0 ? 1 : -1;
            const isSel = selected === b.code;
            const pin = pinned.indexOf(b.code);
            const rec = recommended.get(b.code) ?? 0;
            const fy = (f * d) / 2;
            return (
              <g
                key={b.code}
                className={`booth${isSel ? ' is-sel' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={isSel}
                aria-label={text.boothAria(b)}
                transform={`translate(${b.x} ${b.z})`}
                onClick={() => onSelect(b.code)}
                onKeyDown={onKey(b.code)}
              >
                <rect className="tile" x={-w / 2 + 0.07} y={-d / 2 + 0.07} width={w - 0.14} height={d - 0.14} rx={0.14} fill={meta.color} />
                {b.status === 'booked' && <rect x={-w / 2 + 0.07} y={-d / 2 + 0.07} width={w - 0.14} height={d - 0.14} rx={0.14} fill={`url(#${hatchId})`} />}
                {b.status === 'unavailable' && <rect x={-w / 2 + 0.07} y={-d / 2 + 0.07} width={w - 0.14} height={d - 0.14} rx={0.14} fill={`url(#${dotsId})`} />}
                {b.status === 'held' && <rect x={-w / 2 + 0.2} y={-d / 2 + 0.2} width={w - 0.4} height={d - 0.4} rx={0.1} fill="none" stroke={meta.ink} strokeOpacity={0.5} strokeWidth={0.08} strokeDasharray="0.35 0.25" />}
                {/* back panel */}
                <line x1={-w / 2 + 0.07} y1={-fy} x2={w / 2 - 0.07} y2={-fy} stroke="#e9e1d2" strokeWidth={0.2} />
                {/* side partitions */}
                {g.closedLeft && <line x1={-w / 2 + 0.07} y1={-d / 2} x2={-w / 2 + 0.07} y2={d / 2} stroke="#e9e1d2" strokeWidth={0.1} />}
                {g.closedRight && <line x1={w / 2 - 0.07} y1={-d / 2} x2={w / 2 - 0.07} y2={d / 2} stroke="#e9e1d2" strokeWidth={0.1} />}
                {/* open front marker */}
                <path d={`M-0.42 ${fy - f * 0.05} L0.42 ${fy - f * 0.05} L0 ${fy + f * 0.42} Z`} fill="#f3ead8" opacity={0.85} />
                <text y={-0.08} textAnchor="middle" fontSize={1} fontWeight={700} fill={meta.ink}>
                  {b.code}
                </text>
                <g transform={`translate(0 ${f > 0 ? 0.62 : 0.72})`}>
                  <StatusGlyph status={b.status} color={meta.ink} />
                </g>
                {rec > 0 && (
                  <text x={-w / 2 + 0.25} y={-d / 2 + 0.75} fontSize={0.62} fontWeight={700} fill="#e8c77c" stroke="#1a1408" strokeWidth={0.12} paintOrder="stroke">
                    ★{rec}
                  </text>
                )}
                {pin >= 0 && (
                  <g transform={`translate(${w / 2 - 0.5} ${-d / 2 + 0.5})`}>
                    <circle r={0.4} fill="#7aa8d8" stroke="#0b1520" strokeWidth={0.06} />
                    <text y={0.2} textAnchor="middle" fontSize={0.55} fontWeight={700} fill="#0b1520">
                      {pin + 1}
                    </text>
                  </g>
                )}
                {isSel && <rect x={-w / 2 - 0.08} y={-d / 2 - 0.08} width={w + 0.16} height={d + 0.16} rx={0.2} fill="none" stroke="#e8c77c" strokeWidth={0.26} />}
                <rect className="ring" x={-w / 2 - 0.26} y={-d / 2 - 0.26} width={w + 0.52} height={d + 0.52} rx={0.3} />
              </g>
            );
          })}
        </g>

        {/* 10 m scale bar */}
        <g transform={`translate(${-hw} ${D + 2.5})`} stroke="#a9a094" strokeWidth={0.08} aria-hidden="true">
          <line x1={0} y1={0} x2={10} y2={0} />
          <line x1={0} y1={-0.3} x2={0} y2={0.3} />
          <line x1={5} y1={-0.2} x2={5} y2={0.2} />
          <line x1={10} y1={-0.3} x2={10} y2={0.3} />
          <text x={11} y={0.25} fontSize={0.7} fill="#a9a094" stroke="none">
            {text.scale}
          </text>
        </g>
      </svg>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useI18n } from '../../lib/i18n';
import type { DisplayState } from './VenueModel';
import type { SeatIndex, SeatMap, SeatRow } from './useSeatMap';
import { useSectionOutlines } from './MiniMap';

const SYMBOL: Record<DisplayState, string> = {
  available: '○', held: '◔', sold: '✕', blocked: '–', focused: '★', basket: '✓', mine: '♥', highlight: '◆', dimmed: '·',
};

export function stateLabel(st: DisplayState, t: (a: string, b: string) => string) {
  const L: Record<DisplayState, [string, string]> = {
    available: ['متاح', 'available'], held: ['محجوز مؤقتاً', 'temporarily held'], sold: ['مباع', 'sold'], blocked: ['غير متاح', 'unavailable'],
    focused: ['محدد', 'selected'], basket: ['في السلة', 'in basket'], mine: ['كرسيك المؤكد', 'your confirmed seat'], highlight: ['مقترح', 'suggested'], dimmed: ['خارج الفلتر', 'filtered out'],
  };
  return t(...L[st]);
}

/**
 * Accessible 2D alternative: a top-down SVG (pointer) plus a keyboard/screen-reader friendly
 * section → row → seat list. Booking never requires the 3D view.
 */
export function SeatMap2D({ map, index, stateOf, categoryColor, onSeat, focusedId, sectionLabel }: { map: SeatMap; index: SeatIndex; stateOf: (s: SeatRow) => DisplayState; categoryColor: (s: SeatRow) => string; onSeat: (s: SeatRow) => void; focusedId: string | null; sectionLabel: (code: string) => string }) {
  const { t, money } = useI18n();
  const outlines = useSectionOutlines(map);
  const [section, setSection] = useState<string>(() => (focusedId ? index.byId.get(focusedId)?.section : null) ?? map.sections[0].code);
  const rows = index.sectionRows.get(section) ?? [];
  const st = map.performance.geometry.stage;
  const fill = (s: SeatRow, ds: DisplayState) =>
    ({ available: categoryColor(s), held: '#b9893e', sold: '#3b3440', blocked: '#1f1b22', focused: '#ffe08a', basket: '#6fbf8e', mine: '#5fb4d6', highlight: '#c9a0dc', dimmed: '#2c3a33' })[ds];

  const svgSeats = useMemo(() => map.seats, [map]);

  return (
    <div className="stack">
      <svg viewBox="-26 -11 52 40" style={{ width: '100%', height: 'auto', background: '#0d0b0f', borderRadius: 12 }} aria-hidden="true">
        <rect x={-st.width / 2} y={-st.depth} width={st.width} height={st.depth} fill="#4a3424" stroke="#d4a64a" strokeWidth={0.15} />
        {map.sections.map((s) => (
          <polygon key={s.code} points={outlines.get(s.code)} fill="none" stroke={s.code === section ? '#ffe08a' : '#3a3340'} strokeWidth={s.code === section ? 0.3 : 0.1} />
        ))}
        {svgSeats.map((s) => {
          const ds = stateOf(s);
          return (
            <g key={s.id} transform={`translate(${s.x} ${s.z})`} onClick={() => onSeat(s)} style={{ cursor: ds === 'sold' || ds === 'blocked' ? 'not-allowed' : 'pointer' }}>
              <circle r={0.27} fill={fill(s, ds)} stroke={ds === 'held' ? '#e6b450' : 'none'} strokeWidth={0.08} />
              {ds === 'sold' && <path d="M-0.16,-0.16 L0.16,0.16 M0.16,-0.16 L-0.16,0.16" stroke="#9a90a0" strokeWidth={0.07} />}
              {(ds === 'basket' || ds === 'mine') && <path d="M-0.14,0 L-0.04,0.12 L0.15,-0.12" stroke="#0b1a10" strokeWidth={0.08} fill="none" />}
              {ds === 'focused' && <circle r={0.42} fill="none" stroke="#ffe08a" strokeWidth={0.1} />}
            </g>
          );
        })}
      </svg>

      <div role="group" aria-label={t('اختر القسم', 'Choose a section')} className="row" style={{ gap: 6 }}>
        {map.sections.map((s) => {
          const stats = index.sectionStats.get(s.code)!;
          return (
            <button key={s.code} className="btn btn-sm" aria-pressed={section === s.code} style={section === s.code ? { borderColor: 'var(--gold)' } : undefined} onClick={() => setSection(s.code)}>
              {sectionLabel(s.code)} <span className="tiny muted num">{stats.available}/{stats.total}</span>
            </button>
          );
        })}
      </div>

      <div className="stack" style={{ maxHeight: 360, overflowY: 'auto' }}>
        {rows.map((r) => (
          <div key={r} role="group" aria-label={`${t('صف', 'Row')} ${r}`}>
            <div className="tiny muted">{t('صف', 'Row')} {r}</div>
            <div className="row" style={{ gap: 4 }}>
              {(index.rows.get(`${section}|${r}`) ?? []).map((s) => {
                const ds = stateOf(s);
                const cat = index.catById.get(s.category_id);
                const disabled = ds === 'sold' || ds === 'blocked' || ds === 'held';
                return (
                  <button
                    key={s.id}
                    className="btn btn-sm"
                    style={{ minWidth: 44, padding: '4px 6px', background: disabled ? 'var(--bg-2)' : undefined, borderColor: ds === 'focused' ? 'var(--gold-2)' : ds === 'basket' ? 'var(--ok)' : undefined, opacity: ds === 'dimmed' ? 0.5 : 1 }}
                    aria-disabled={disabled}
                    aria-pressed={ds === 'focused' || ds === 'basket'}
                    aria-label={`${sectionLabel(s.section)}, ${t('صف', 'row')} ${s.row}, ${t('كرسي', 'seat')} ${s.number}, ${stateLabel(ds, t)}, ${cat ? money(cat.price_fils) : ''}, ${t('تقييم الرؤية', 'view score')} ${s.score}${s.accessible ? `, ${t('مساحة كرسي متحرك (تجريبي)', 'wheelchair space (demo)')}` : ''}`}
                    onClick={() => !disabled && onSeat(s)}
                  >
                    <span aria-hidden className="num">{SYMBOL[ds]}{s.number}{s.accessible === 'wheelchair_space' ? '♿' : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

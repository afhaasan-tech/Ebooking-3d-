import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useBasket } from '../lib/basket';
import { api, ApiError } from '../lib/api';
import { ErrorBox, Loading, DemoTag } from '../ui/components';
import { Countdown } from '../ui/BasketDrawer';
import { useSeatMap, canUseWebGL, prefersReducedMotion, defaultQuality, type SeatRow } from '../components/venue/useSeatMap';
import { VenueCanvas, CompareCanvas, type ViewMode, type CameraInfo } from '../components/venue/VenueCanvas';
import type { DisplayState } from '../components/venue/VenueModel';
import { MiniMap } from '../components/venue/MiniMap';
import { SeatMap2D, stateLabel } from '../components/venue/SeatMap2D';
import { SeatDetails, SmartSearch, explainSeat } from '../components/venue/Panels';

const MAX = 6;

export default function Booking() {
  const { performanceId } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { t, pick, money, date, errorText } = useI18n();
  const { me } = useAuth();
  const { hold, setSeats, busy, setDrawerOpen } = useBasket();
  const { map, index, error, refreshAvailability, version } = useSeatMap(performanceId);

  const [mode, setMode] = useState<ViewMode>({ level: 'overview' });
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [hovered, setHovered] = useState<SeatRow | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [render, setRender] = useState<'3d' | '2d'>(() => (canUseWebGL() ? '3d' : '2d'));
  const [quality, setQuality] = useState<'high' | 'low'>(defaultQuality);
  const [reduced] = useState(prefersReducedMotion);
  const [camera, setCamera] = useState<CameraInfo | null>(null);
  const [seatFov, setSeatFov] = useState(55);
  const [tour, setTour] = useState(false);
  const [panel, setPanel] = useState<'seat' | 'smart' | 'compare'>('seat');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'danger'; text: string } | null>(null);
  const [slow, setSlow] = useState(false);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const basketIds = useMemo(() => (hold && hold.performanceId === performanceId ? hold.items.map((i) => i.seat_code as string) : []), [hold, performanceId]);
  const basketSet = useMemo(() => new Set(basketIds), [basketIds]);

  // my confirmed seats for this performance
  useEffect(() => {
    if (!me || !performanceId) return;
    api<any[]>('/api/tickets')
      .then((orders) => setMine(new Set(orders.filter((o) => o.performanceId === performanceId).flatMap((o) => o.tickets.map((x: any) => x.seat_code)))))
      .catch(() => {});
  }, [me, performanceId]);

  // deep link: ?view=SEAT opens the seat perspective
  useEffect(() => {
    const v = params.get('view');
    if (v && index?.byId.has(v)) {
      setFocusedId(v);
      setMode({ level: 'seat', seatId: v });
      setPanel('seat');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index !== null]);

  const sectionLabel = useCallback((code: string) => pick(map?.sections.find((s) => s.code === code), 'name') || code, [map, pick]);

  const stateOf = useCallback(
    (s: SeatRow): DisplayState => {
      if (mine.has(s.id)) return 'mine';
      if (basketSet.has(s.id)) return 'basket';
      if (focusedId === s.id) return 'focused';
      if (s.status !== 'available') return s.status;
      if (highlight.has(s.id)) return 'highlight';
      if (catFilter && index?.catById.get(s.category_id)?.code !== catFilter) return 'dimmed';
      return 'available';
    },
    [mine, basketSet, focusedId, highlight, catFilter, index],
  );
  const categoryColor = useCallback((s: SeatRow) => index?.catById.get(s.category_id)?.color ?? '#6f8f7d', [index]);

  const focused = focusedId ? index?.byId.get(focusedId) ?? null : null;
  const selectable = (s: SeatRow) => s.status === 'available' || basketSet.has(s.id);

  const flash = (kind: 'ok' | 'warn' | 'danger', text: string) => {
    setMsg({ kind, text });
    window.setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 5000);
  };

  const focusSeat = (s: SeatRow, view = false) => {
    if (!selectable(s) && !mine.has(s.id)) {
      flash('warn', `${s.id}: ${stateLabel(stateOf(s), t)}`);
      return;
    }
    setFocusedId(s.id);
    setPanel('seat');
    if (view) setMode({ level: 'seat', seatId: s.id });
    else if (mode.level === 'overview') setMode({ level: 'section', section: s.section });
  };

  const onSeatClick = useCallback(
    (s: SeatRow) => {
      if (mode.level === 'overview') {
        setMode({ level: 'section', section: s.section });
        return;
      }
      if (focusedId === s.id && mode.level === 'section') {
        setMode({ level: 'seat', seatId: s.id });
        return;
      }
      focusSeat(s, mode.level === 'seat');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, focusedId, stateOf],
  );

  const applySeats = async (ids: string[]) => {
    if (!performanceId) return;
    if (ids.length > MAX) {
      flash('warn', errorText('too_many_seats'));
      return;
    }
    try {
      await setSeats(performanceId, ids);
      flash('ok', ids.length ? t(`السلة فيها ${ids.length} كرسي — محجوزة لك مؤقتاً`, `${ids.length} seat(s) held for you`) : t('تم تفريغ السلة', 'Basket emptied'));
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'seat_unavailable') await refreshAvailability();
      flash('danger', errorText(err.code));
    }
  };
  const add = (ids: string[]) => applySeats([...new Set([...basketIds, ...ids])]);
  const remove = (id: string) => applySeats(basketIds.filter((x) => x !== id));

  const navSeat = (d: 'left' | 'right' | 'front' | 'back') => {
    if (!focused || !index) return;
    if (d === 'left' || d === 'right') {
      const row = index.rows.get(`${focused.section}|${focused.row}`)!;
      const i = row.findIndex((s) => s.id === focused.id);
      const step = d === 'right' ? 1 : -1;
      for (let j = i + step; j >= 0 && j < row.length; j += step) if (selectable(row[j])) return focusSeat(row[j], true);
      flash('warn', t('ما فيه كرسي متاح بهالاتجاه بنفس الصف', 'No available seat in that direction in this row'));
    } else {
      const rows = index.sectionRows.get(focused.section)!;
      const ri = rows.indexOf(focused.row);
      const step = d === 'back' ? 1 : -1;
      for (let k = ri + step; k >= 0 && k < rows.length; k += step) {
        const cands = index.rows.get(`${focused.section}|${rows[k]}`)!.filter(selectable);
        if (cands.length) {
          cands.sort((a, b) => Math.hypot(a.x - focused.x, a.z - focused.z) - Math.hypot(b.x - focused.x, b.z - focused.z));
          return focusSeat(cands[0], true);
        }
      }
      flash('warn', t('ما فيه صف متاح بهالاتجاه', 'No available row in that direction'));
    }
  };

  // keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') {
        if (mode.level === 'seat' && focused) setMode({ level: 'section', section: focused.section });
        else if (mode.level === 'section') setMode({ level: 'overview' });
      }
      if (mode.level !== 'seat' || !focused) return;
      const map: Record<string, 'left' | 'right' | 'front' | 'back'> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'front', ArrowDown: 'back' };
      if (map[e.key]) {
        e.preventDefault();
        navSeat(map[e.key]);
      }
      if (e.key === 'Enter' && !basketSet.has(focused.id)) void add([focused.id]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!tour) return;
    const tm = setTimeout(() => setTour(false), 9000);
    return () => clearTimeout(tm);
  }, [tour]);

  if (error) return <div className="container page"><ErrorBox error={error} /></div>;
  if (!map || !index) return <Loading label={t('جاري تجهيز المسرح ثلاثي الأبعاد…', 'Preparing the 3D venue…')} />;

  const perf = map.performance;
  const seatProps = { seats: map.seats, stateOf, categoryColor, stateVersion: `${version}|${basketIds.join()}|${focusedId}|${[...highlight].join()}|${catFilter}|${[...mine].join()}`, onSeatClick, onSeatHover: setHovered };
  const markers = [
    ...(focused ? [{ seat: focused, color: '#ffe08a' }] : []),
    ...basketIds.filter((id) => id !== focusedId).map((id) => ({ seat: index.byId.get(id)!, color: '#6fbf8e' })).filter((m) => m.seat),
  ];
  const hoverLabel = (s: SeatRow) => {
    const c = index.catById.get(s.category_id);
    return `${sectionLabel(s.section)} · ${t('صف', 'Row')} ${s.row} · ${s.number} · ${c ? money(c.price_fils) : ''} · ${s.score}/100 · ${stateLabel(stateOf(s), t)}`;
  };
  const compareSeats = compareIds.map((id) => index.byId.get(id)!).filter(Boolean);
  const fallback2D = (
    <SeatMap2D map={map} index={index} stateOf={stateOf} categoryColor={categoryColor} focusedId={focusedId} sectionLabel={sectionLabel} onSeat={(s) => focusSeat(s)} />
  );

  const crumbs = (
    <nav aria-label={t('مسار التنقل', 'Breadcrumb')} className="row small" style={{ gap: 6 }}>
      <Link to={`/events/${perf.slug}`}>{pick(perf, 'title')}</Link>
      <span aria-hidden>›</span>
      <button className="btn btn-ghost btn-sm" onClick={() => setMode({ level: 'overview' })} aria-current={mode.level === 'overview' ? 'page' : undefined}>{t('المسرح كامل', 'Venue')}</button>
      {mode.level !== 'overview' && (
        <>
          <span aria-hidden>›</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMode({ level: 'section', section: mode.level === 'section' ? mode.section : focused!.section })} aria-current={mode.level === 'section' ? 'page' : undefined}>
            {sectionLabel(mode.level === 'section' ? mode.section : focused?.section ?? '')}
          </button>
        </>
      )}
      {mode.level === 'seat' && focused && (
        <>
          <span aria-hidden>›</span>
          <span aria-current="page" className="badge badge-gold">{t('صف', 'Row')} {focused.row} · {t('كرسي', 'Seat')} {focused.number}</span>
        </>
      )}
    </nav>
  );

  return (
    <div className="container" style={{ paddingBlock: 16 }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: 2 }}>{pick(perf, 'title')} <DemoTag /></h1>
          <div className="small muted">{pick(perf, 'venue')} · {date(perf.starts_at)}</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-sm" onClick={() => setRender(render === '3d' ? '2d' : '3d')} aria-pressed={render === '2d'}>{render === '3d' ? t('عرض ثنائي الأبعاد', '2D view') : t('عرض ثلاثي الأبعاد', '3D view')}</button>
          {render === '3d' && <button className="btn btn-sm" onClick={() => setQuality(quality === 'high' ? 'low' : 'high')}>{t('الجودة', 'Quality')}: {quality === 'high' ? t('عالية', 'High') : t('خفيفة', 'Light')}</button>}
        </div>
      </div>
      {crumbs}

      {slow && render === '3d' && (
        <div className="alert alert-warn" style={{ marginBlock: 8 }}>
          <span className="spacer">{t('العرض ثلاثي الأبعاد كان بطيء على جهازك، فحوّلناه للجودة الخفيفة تلقائياً.', 'The 3D view was slow on this device, so we switched to light quality automatically.')}</span>
          <button className="btn btn-sm" onClick={() => { setQuality('low'); setSlow(false); }}>{t('جودة خفيفة', 'Light quality')}</button>
          <button className="btn btn-sm" onClick={() => setRender('2d')}>{t('عرض ثنائي الأبعاد', '2D view')}</button>
        </div>
      )}
      {msg && <div className={`alert alert-${msg.kind}`} role="status" style={{ marginBlock: 8 }}>{msg.text}</div>}

      <div className="booking-grid">
        <section className="stage-area" aria-label={t('خريطة المسرح', 'Venue map')}>
          {render === '3d' ? (
            <div className="canvas-wrap" data-testid="venue-3d" data-camera={camera ? `${camera.position.x.toFixed(2)},${camera.position.y.toFixed(2)},${camera.position.z.toFixed(2)}` : ''} data-mode={mode.level}>
              <VenueCanvas
                map={map} index={index} mode={mode} seatFov={seatFov} seatProps={seatProps} hovered={hovered} hoverLabel={hoverLabel}
                markers={markers} quality={quality} reduced={reduced} tour={tour} sectionLabel={(c) => `${sectionLabel(c)} · ${index.sectionStats.get(c)!.available}`}
                onSectionClick={(c) => setMode({ level: 'section', section: c })} onCamera={setCamera} onSlow={() => { setQuality('low'); setSlow(true); }} onFatal={() => setRender('2d')}
                controlsRef={controlsRef} fallback={fallback2D}
              />
              <div className="canvas-toolbar glass">
                {mode.level === 'overview' && <button className="btn btn-sm" onClick={() => setTour(true)} disabled={reduced}>⟳ {t('جولة ٣٦٠°', '360° tour')}</button>}
                {mode.level !== 'overview' && (
                  <button className="btn btn-sm" onClick={() => (mode.level === 'seat' && focused ? setMode({ level: 'section', section: focused.section }) : setMode({ level: 'overview' }))}>
                    ↩ {mode.level === 'seat' ? t('رجوع للقسم', 'Back to section') : t('المسرح كامل', 'Whole venue')}
                  </button>
                )}
                {mode.level === 'seat' && (
                  <>
                    <button className="btn btn-sm icon-btn" onClick={() => setSeatFov((f) => Math.max(22, f - 8))} aria-label={t('تقريب', 'Zoom in')}>＋</button>
                    <button className="btn btn-sm icon-btn" onClick={() => setSeatFov((f) => Math.min(75, f + 8))} aria-label={t('تبعيد', 'Zoom out')}>－</button>
                    <span className="tiny muted">{t('اسحب للتلفت حولك', 'Drag to look around')}</span>
                  </>
                )}
                <span className="spacer" />
                <button className="btn btn-sm" onClick={() => setDrawerOpen(true)}>🎟 <span className="num">{basketIds.length}</span>/{MAX}</button>
              </div>
              <div className="minimap glass" aria-label={t('خريطة مصغرة', 'Mini-map')}>
                <MiniMap map={map} index={index} selectedSection={mode.level === 'section' ? mode.section : focused?.section ?? null} currentSeat={focused} camera={camera} onSection={(c) => setMode({ level: 'section', section: c })} label={sectionLabel} />
              </div>
              {mode.level === 'seat' && focused && (
                <div className="seat-hud glass small">
                  <strong>{sectionLabel(focused.section)} · {t('صف', 'Row')} {focused.row} · {t('كرسي', 'Seat')} {focused.number}</strong>
                  <span className="num" style={{ color: 'var(--gold-2)' }}>{focused.score}/100</span>
                  <span className="muted">{money(index.catById.get(focused.category_id)?.price_fils)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="card">{fallback2D}</div>
          )}
          <div className="row" style={{ gap: 12, marginTop: 10 }}>
            <div className="legend" aria-label={t('دليل الألوان', 'Legend')}>
              <span><i className="sw sw-available" />{t('متاح', 'Available')}</span>
              <span><i className="sw sw-sold" />{t('مباع (مطوي)', 'Sold (folded)')}</span>
              <span><i className="sw sw-held" />{t('محجوز مؤقتاً', 'Held')}</span>
              <span><i className="sw sw-selected" />{t('محدد ▼', 'Selected ▼')}</span>
              <span><i className="sw sw-mine" />{t('في سلتك ▼', 'In basket ▼')}</span>
              <span><i className="sw" style={{ background: '#5fb4d6' }} />{t('كرسيك المؤكد', 'Your seat')}</span>
              <span><i className="sw sw-blocked" />{t('غير متاح', 'Unavailable')}</span>
            </div>
            <span className="spacer" />
            <div className="row" style={{ gap: 4 }} role="group" aria-label={t('فلتر الفئة', 'Category filter')}>
              <button className="btn btn-sm" aria-pressed={!catFilter} onClick={() => setCatFilter(null)}>{t('الكل', 'All')}</button>
              {map.categories.map((c) => (
                <button key={c.id} className="btn btn-sm" aria-pressed={catFilter === c.code} onClick={() => setCatFilter(catFilter === c.code ? null : c.code)} style={catFilter === c.code ? { borderColor: c.color } : undefined}>
                  <i className="sw" style={{ background: c.color }} /> {pick(c, 'name')} <span className="num tiny">{money(c.price_fils)}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="side-panel card card-tight" aria-label={t('لوحة الحجز', 'Booking panel')}>
          <div className="tabs" role="tablist" style={{ marginBottom: 12 }}>
            <button role="tab" aria-selected={panel === 'seat'} onClick={() => setPanel('seat')}>{t('الكرسي', 'Seat')}</button>
            <button role="tab" aria-selected={panel === 'smart'} onClick={() => setPanel('smart')}>✨ {t('اقتراح ذكي', 'Smart pick')}</button>
            <button role="tab" aria-selected={panel === 'compare'} onClick={() => setPanel('compare')}>{t('مقارنة', 'Compare')} <span className="num">({compareIds.length})</span></button>
          </div>

          {panel === 'seat' &&
            (focused ? (
              <SeatDetails
                seat={focused} map={map} index={index} inBasket={basketSet.has(focused.id)} basketFull={basketIds.length >= MAX} busy={busy}
                onAdd={() => void add([focused.id])} onRemove={() => void remove(focused.id)} onView={() => setMode({ level: 'seat', seatId: focused.id })}
                onCompare={() => { setCompareIds((c) => (c.includes(focused.id) ? c : [...c, focused.id].slice(-3))); setPanel('compare'); }}
                comparing={compareIds.includes(focused.id)} onNav={navSeat} viewing={mode.level === 'seat'}
              />
            ) : (
              <div className="stack">
                <p className="muted">{mode.level === 'overview' ? t('اختر قسماً من المسرح أو الخريطة المصغرة، أو جرّب الاقتراح الذكي.', 'Pick a section on the venue or mini-map, or try Smart pick.') : t('اضغط على كرسي متاح لعرض تفاصيله. اضغط مرة ثانية لتشوف الإطلالة منه.', 'Tap an available seat for details. Tap again to see the view from it.')}</p>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {map.sections.map((s) => {
                    const st = index.sectionStats.get(s.code)!;
                    return (
                      <button key={s.code} className="btn btn-sm" style={{ justifyContent: 'space-between' }} onClick={() => setMode({ level: 'section', section: s.code })} aria-pressed={mode.level === 'section' && mode.section === s.code}>
                        <span>{pick(s, 'name')}</span>
                        <span className="tiny muted num">{st.available}/{st.total}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

          {performanceId && (
            <div hidden={panel !== 'smart'}>
            <SmartSearch
              performanceId={performanceId} index={index} sectionLabel={sectionLabel}
              onHighlight={(ids) => setHighlight(new Set(ids))}
              onView={(ids) => { setFocusedId(ids[0]); setMode({ level: 'seat', seatId: ids[0] }); }}
              onCompare={(ids) => { setCompareIds(ids); setPanel('compare'); }}
              onAdd={(ids) => void add(ids)}
            />
            </div>
          )}

          {panel === 'compare' && (
            <div className="stack">
              {compareSeats.length === 0 ? (
                <p className="muted">{t('أضف ٢–٣ كراسي للمقارنة من تفاصيل الكرسي أو الاقتراح الذكي.', 'Add 2–3 seats from seat details or Smart pick to compare.')}</p>
              ) : (
                <>
                  {render === '3d' && (
                    <div style={{ height: 170, borderRadius: 10, overflow: 'hidden', background: '#0d0b0f' }}>
                      <CompareCanvas map={map} seats={compareSeats} seatProps={seatProps} reduced={reduced} onFatal={() => undefined} fallback={<div className="small muted" style={{ padding: 12 }}>{t('المعاينة غير متاحة', 'Preview unavailable')}</div>} />
                    </div>
                  )}
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr><th>{t('المقياس', 'Metric')}</th>{compareSeats.map((s) => <th key={s.id} className="num">{s.id}</th>)}</tr>
                      </thead>
                      <tbody>
                        <tr><td>{t('تقييم الرؤية', 'View score')}</td>{compareSeats.map((s) => <td key={s.id} className="num"><strong>{s.score}</strong></td>)}</tr>
                        <tr><td>{t('المسافة', 'Distance')}</td>{compareSeats.map((s) => <td key={s.id} className="num">{s.distance.toFixed(1)} m</td>)}</tr>
                        <tr><td>{t('الزاوية الأفقية', 'Horizontal angle')}</td>{compareSeats.map((s) => <td key={s.id} className="num">{s.h_angle.toFixed(0)}°</td>)}</tr>
                        <tr><td>{t('الزاوية العمودية', 'Vertical angle')}</td>{compareSeats.map((s) => <td key={s.id} className="num">{s.v_angle.toFixed(0)}°</td>)}</tr>
                        <tr><td>{t('الوضوح فوق الصف الأمامي', 'Clearance over row ahead')}</td>{compareSeats.map((s) => <td key={s.id} className="num">{s.c_value === null ? '—' : `${Math.round(s.c_value * 1000)} mm`}</td>)}</tr>
                        <tr><td>{t('السعر', 'Price')}</td>{compareSeats.map((s) => <td key={s.id} className="num">{money(index.catById.get(s.category_id)?.price_fils)}</td>)}</tr>
                        <tr><td>{t('التوفر', 'Availability')}</td>{compareSeats.map((s) => <td key={s.id}>{stateLabel(stateOf(s), t)}</td>)}</tr>
                      </tbody>
                    </table>
                  </div>
                  {compareSeats.map((s) => (
                    <div key={s.id} className="small">
                      <strong className="num">{s.id}</strong>: {explainSeat(s, t).slice(0, 3).join(' · ')}
                      <div className="row" style={{ gap: 6, marginTop: 4 }}>
                        <button className="btn btn-sm" onClick={() => focusSeat(s, true)}>👁 {t('الإطلالة', 'View')}</button>
                        {selectable(s) && !basketSet.has(s.id) && <button className="btn btn-sm btn-primary" onClick={() => void add([s.id])}>{t('أضف', 'Add')}</button>}
                        <button className="btn btn-sm btn-ghost" onClick={() => setCompareIds((c) => c.filter((x) => x !== s.id))}>{t('إزالة', 'Remove')}</button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {basketIds.length > 0 && hold && (
            <div className="card card-tight" style={{ marginTop: 16, background: 'var(--bg-2)' }}>
              <div className="row between small">
                <span>{t('في السلة', 'In basket')}: <strong className="num">{basketIds.length}</strong> · ⏱ <Countdown until={hold.expiresAt} /></span>
                <strong className="num">{money(hold.pricing.totalFils)}</strong>
              </div>
              <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={() => nav('/checkout')}>{t('متابعة للدفع', 'Checkout')}</button>
            </div>
          )}
        </aside>
      </div>
      <style>{`
        .booking-grid { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; margin-top: 8px; }
        .canvas-wrap { position: relative; height: min(72vh, 720px); min-height: 420px; border-radius: 16px; overflow: hidden; border: 1px solid var(--line-soft); background: #0d0b0f; }
        .canvas-toolbar { position: absolute; top: 10px; inset-inline: 10px; display: flex; gap: 6px; align-items: center; padding: 6px; flex-wrap: wrap; }
        .minimap { position: absolute; bottom: 10px; inset-inline-end: 10px; width: 210px; padding: 6px; }
        .seat-hud { position: absolute; bottom: 10px; inset-inline-start: 10px; padding: 8px 12px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; max-width: calc(100% - 240px); }
        .side-panel { max-height: calc(100vh - 140px); overflow-y: auto; position: sticky; top: 76px; }
        @media (max-width: 980px) {
          .booking-grid { grid-template-columns: 1fr; }
          .canvas-wrap { height: 58vh; min-height: 340px; }
          .minimap { width: 130px; }
          .seat-hud { max-width: calc(100% - 160px); }
          .side-panel { position: static; max-height: none; }
        }
      `}</style>
    </div>
  );
}

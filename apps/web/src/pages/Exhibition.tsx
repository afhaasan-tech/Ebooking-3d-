/**
 * /exhibitions/:slug — "SpaceVision": the secondary 3D experience for exhibition halls.
 * Levels: overview (orbit) → booth selection (camera flies to the booth) → booth perspective (standing eye height).
 * A fully keyboard-accessible 2D SVG plan + booth list mirror everything the 3D view offers.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { useApi } from '../lib/useApi';
import type { ApiError } from '../lib/api';
import { DemoTag, Empty, ErrorBox, Loading } from '../ui/components';
import { SV_CSS, STATUS_META, deriveBoothGeo, normalizeExhibition, type Exhibition as ExhibitionData, type Recommendation, type ViewMode } from './exhibition/model';
import { SceneBoundary, detectWebGL, useInView, useReducedMotion } from './exhibition/webgl';
import { HallPlan2D, type PlanText } from './exhibition/HallPlan2D';
import { BoothCompare, BoothDetails, BoothList, BoothRecommend, Legend } from './exhibition/panels';
import { BoothRequestForm } from './exhibition/BoothRequestForm';
import { boothAria, errMessage, sizeText, sqm, statusWord } from './exhibition/labels';
import type { SceneText } from './exhibition/HallScene';

const loadScene = () => import('./exhibition/HallScene');
const HallScene = lazy(loadScene);
const MAX_PINS = 3;

export default function Exhibition() {
  const { slug = '' } = useParams();
  const { t, errorText } = useI18n();
  const [webgl] = useState(detectWebGL);
  const { data, error, loading, reload } = useApi<unknown>(`/api/exhibitions/${encodeURIComponent(slug)}`, [slug]);
  const ex = useMemo(() => (data ? normalizeExhibition(data) : null), [data]);

  // start fetching the three.js chunk while the exhibition data loads
  useEffect(() => {
    if (webgl) loadScene().catch(() => undefined);
  }, [webgl]);

  if (!ex) {
    if (loading || (!error && !data)) return <Loading label={t('جاري تحميل مخطط المعرض…', 'Loading the exhibition plan…')} />;
    if (error?.status === 404 || error?.code === 'exhibition_not_found') {
      return (
        <div className="container page">
          <Empty title={t('المعرض غير موجود', 'Exhibition not found')}>
            <p>{errMessage(t, errorText, error)}</p>
            <Link className="btn btn-primary" to="/events?category=exhibition">
              {t('تصفح المعارض', 'Browse exhibitions')}
            </Link>
          </Empty>
        </div>
      );
    }
    return (
      <div className="container page">
        <ErrorBox error={error} onRetry={reload} />
      </div>
    );
  }
  return <ExhibitionView key={ex.id} ex={ex} webgl={webgl} reload={reload} reloadError={error} />;
}

function ExhibitionView({ ex, webgl, reload, reloadError }: { ex: ExhibitionData; webgl: boolean; reload: () => void; reloadError: ApiError | null }) {
  const { t, lang, pick, date } = useI18n();
  const [params, setParams] = useSearchParams();
  const geo = useMemo(() => deriveBoothGeo(ex.booths, ex.geometry), [ex]);
  const boothMap = useMemo(() => new Map(ex.booths.map((b) => [b.code, b])), [ex]);
  const reducedMotion = useReducedMotion();

  const paramBooth = params.get('booth');
  const selected = paramBooth && boothMap.has(paramBooth) ? paramBooth : null;
  const selectedBooth = selected ? boothMap.get(selected) ?? null : null;

  const [view, setView] = useState<'3d' | '2d'>(webgl ? '3d' : '2d');
  const [fallback, setFallback] = useState<null | 'error' | 'lost'>(null);
  const [sceneKey, setSceneKey] = useState(0);
  const [mode, setMode] = useState<ViewMode>(() => (selected ? 'booth' : 'overview'));
  const [nonce, setNonce] = useState(0);
  const [pinned, setPinned] = useState<string[]>([]);
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [requestOpen, setRequestOpen] = useState(() => params.get('request') === '1' && selectedBooth?.status === 'available');
  const [announce, setAnnounce] = useState('');
  const stageRef = useRef<HTMLDivElement>(null);
  const detailsHeadingRef = useRef<HTMLHeadingElement>(null);
  const stageInView = useInView(stageRef);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // "?request=1" (set when returning from sign-in) only opens the form once
  useEffect(() => {
    if (params.get('request') !== null) {
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.delete('request');
          return n;
        },
        { replace: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setBoothParam = useCallback(
    (code: string | null) => {
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (code) n.set('booth', code);
          else n.delete('booth');
          n.delete('request');
          return n;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const select = useCallback(
    (code: string) => {
      const b = boothMap.get(code);
      if (!b) return;
      if (code !== selectedRef.current) setRequestOpen(false);
      setBoothParam(code);
      setMode('booth');
      setNonce((n) => n + 1);
      setAnnounce(t(`تم تحديد البوث ${code}، ${statusWord(t, b.status)}.`, `Selected booth ${code}, ${statusWord(t, b.status)}.`));
    },
    [boothMap, setBoothParam, t],
  );

  const focusBooth = useCallback(
    (code: string) => {
      select(code);
      if (!stageInView) stageRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    },
    [select, stageInView, reducedMotion],
  );

  const togglePin = (code: string) => {
    if (pinned.includes(code)) {
      setPinned(pinned.filter((c) => c !== code));
      setAnnounce(t(`أُزيل البوث ${code} من المقارنة.`, `Booth ${code} removed from comparison.`));
    } else if (pinned.length >= MAX_PINS) {
      setAnnounce(t('يمكن مقارنة ٣ بوثات كحد أقصى.', 'You can compare up to 3 booths.'));
    } else {
      setPinned([...pinned, code]);
      setAnnounce(t(`أُضيف البوث ${code} للمقارنة.`, `Booth ${code} pinned for comparison.`));
    }
  };

  const toOverview = useCallback(() => {
    setMode('overview');
    setNonce((n) => n + 1);
  }, []);
  const toEye = () => {
    if (!selected || !webgl) return;
    if (view === '2d') {
      setFallback(null);
      setView('3d');
    }
    setMode('eye');
    setAnnounce(t(`منظور واقف عند واجهة البوث ${selected}.`, `Standing view from the front of booth ${selected}.`));
  };
  const exitEye = () => setMode(selected ? 'booth' : 'overview');
  const clearSelection = () => {
    setBoothParam(null);
    setRequestOpen(false);
    setMode('overview');
    setNonce((n) => n + 1);
  };
  const show3D = () => {
    if (!webgl) return;
    if (fallback) setSceneKey((k) => k + 1);
    setFallback(null);
    setView('3d');
  };
  const show2D = () => {
    setView('2d');
    setMode((m) => (m === 'eye' ? 'booth' : m));
  };
  const onSceneError = useCallback(() => {
    setView('2d');
    setFallback('error');
    setMode((m) => (m === 'eye' ? 'booth' : m));
  }, []);
  const onContextLost = useCallback(() => {
    setView('2d');
    setFallback('lost');
    setMode((m) => (m === 'eye' ? 'booth' : m));
  }, []);
  const showDetails = () => {
    detailsHeadingRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    detailsHeadingRef.current?.focus({ preventScroll: true });
  };
  const openRequest = () => {
    setRequestOpen((v) => !v);
  };

  const recommended = useMemo(() => new Map((recs ?? []).map((r, i) => [r.code, i + 1])), [recs]);
  const pinnedBooths = pinned.map((c) => boothMap.get(c)).filter((b): b is NonNullable<typeof b> => !!b);
  const canPin = pinned.length < MAX_PINS;

  const sceneText = useMemo<SceneText>(
    () => ({
      status: { available: statusWord(t, 'available'), held: statusWord(t, 'held'), booked: statusWord(t, 'booked'), unavailable: statusWord(t, 'unavailable') },
      exit: t('مخرج · EXIT', 'EXIT · مخرج'),
      entrance: (o) => (lang === 'ar' ? o.labelAr : o.labelEn),
      sceneLabel: t('مخطط ثلاثي الأبعاد للقاعة. للاختيار بلوحة المفاتيح استخدم قائمة البوثات أسفل الصفحة أو العرض ثنائي الأبعاد.', '3D hall plan. To choose with a keyboard, use the booth list below or the 2D view.'),
      controls: t('التحكم بالكاميرا', 'Camera controls'),
      orbitLeft: t('تدوير الكاميرا لليسار', 'Orbit left'),
      orbitRight: t('تدوير الكاميرا لليمين', 'Orbit right'),
      lookLeft: t('النظر لليسار', 'Look left'),
      lookRight: t('النظر لليمين', 'Look right'),
      zoomIn: t('تقريب', 'Zoom in'),
      zoomOut: t('تبعيد', 'Zoom out'),
      reset: t('إعادة ضبط العرض العام', 'Reset to overview'),
    }),
    [t, lang],
  );
  const planText = useMemo<PlanText>(
    () => ({
      planLabel: t('مخطط القاعة ثنائي الأبعاد — كل بوث زر يمكن اختياره', '2D hall plan — every booth is a selectable button'),
      boothAria: (b) => boothAria(t, b, b.code === selected),
      exit: 'EXIT',
      entrance: (o) => (lang === 'ar' ? o.labelAr : o.labelEn),
      aisle: t('ممر رئيسي', 'Main aisle'),
      scale: t('10 م', '10 m'),
    }),
    [t, lang, selected],
  );

  const dateRange = useMemo(() => {
    const s = ex.dates?.starts_at;
    const e = ex.dates?.ends_at;
    const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    if (s && e) {
      const a = date(s, o);
      const b = date(e, o);
      return a === b ? a : `${a} – ${b}`;
    }
    return s ? date(s, o) : null;
  }, [ex.dates, date]);

  const counts = useMemo(() => {
    const c = { available: 0, held: 0, booked: 0, unavailable: 0 };
    for (const b of ex.booths) c[b.status]++;
    return c;
  }, [ex.booths]);
  const allOnRequest = ex.booths.every((b) => b.price_fils == null);
  const simulated = ex.preview_authenticity === 'simulated' || ex.preview_authenticity == null || ex.geometry.fictional;

  const levelLabel = mode === 'eye' && selected ? t('المستوى ٣: منظور البوث', 'Level 3: booth perspective') : mode === 'booth' && selected ? t('المستوى ٢: اختيار بوث', 'Level 2: booth selection') : t('المستوى ١: نظرة عامة', 'Level 1: overview');

  return (
    <div className="container page sv-page">
      <style>{SV_CSS}</style>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <header className="sv-head">
        <div className="row" style={{ gap: 8 }}>
          <span className="badge badge-info">SpaceVision</span>
          {ex.demo && <DemoTag />}
          {simulated && <span className="badge badge-warn">{t('مخطط محاكى', 'Simulated plan')}</span>}
        </div>
        <h1>{pick(ex, 'title')}</h1>
        {pick(ex, 'description') && <p className="muted" style={{ maxWidth: 760, margin: 0 }}>{pick(ex, 'description')}</p>}
        <dl className="sv-meta">
          <div>
            <dt>{t('المكان:', 'Venue:')}</dt>
            <dd>{pick(ex, 'venue')}</dd>
          </div>
          {dateRange && (
            <div>
              <dt>{t('التاريخ:', 'Dates:')}</dt>
              <dd>{dateRange}</dd>
            </div>
          )}
          <div>
            <dt>{t('المنظّم:', 'Organizer:')}</dt>
            <dd>{ex.organizer}</dd>
          </div>
          <div>
            <dt>{t('البوثات المتاحة:', 'Available booths:')}</dt>
            <dd>
              <span className="num">
                {counts.available}/{ex.booths.length}
              </span>
            </dd>
          </div>
          {allOnRequest && (
            <div>
              <dt>{t('الأسعار:', 'Prices:')}</dt>
              <dd>{t('السعر عند الطلب', 'Price on Request')}</dd>
            </div>
          )}
        </dl>
        {simulated ? (
          <div className="alert alert-warn small" role="note">
            <span aria-hidden="true">⚠</span>
            <div>
              <strong>{t('مخطط محاكى (SIMULATED): ', 'SIMULATED hall plan: ')}</strong>
              {t(
                'هذا المخطط تجريبي ولا يمثل أي مول أو قاعة حقيقية. المقاسات والمسافات والدرجات لأغراض العرض فقط.',
                'this plan is a demo and does not represent any real mall or venue. Sizes, distances and scores are for illustration only.',
              )}
            </div>
          </div>
        ) : (
          <div className="alert alert-info small" role="note">
            <span aria-hidden="true">ℹ</span>
            <div>{t('المخطط مبني على قياسات المكان. قد تختلف التفاصيل النهائية في موقع المعرض.', 'This plan is based on venue measurements. Final on-site details may differ.')}</div>
          </div>
        )}
        {reloadError && <ErrorBox error={reloadError} onRetry={reload} />}
      </header>

      <div className="sv-toolbar">
        <div className="sv-seg" role="group" aria-label={t('نوع العرض', 'View type')}>
          <button type="button" aria-pressed={view === '3d'} onClick={show3D} disabled={!webgl} title={!webgl ? t('غير مدعوم على هذا الجهاز', 'Not supported on this device') : undefined}>
            {t('ثلاثي الأبعاد', '3D')}
          </button>
          <button type="button" aria-pressed={view === '2d'} onClick={show2D}>
            {t('ثنائي الأبعاد', '2D plan')}
          </button>
        </div>
        <span className="badge">{levelLabel}</span>
        <span className="spacer" />
        {selected && mode !== 'eye' && webgl && (
          <button type="button" className="btn btn-sm" onClick={toEye}>
            <span aria-hidden="true">👁</span> {t('المنظور من البوث', 'View from booth')}
          </button>
        )}
        {mode === 'eye' && selected && (
          <button type="button" className="btn btn-sm" onClick={exitEye}>
            {t('الخروج من منظور البوث', 'Leave booth perspective')}
          </button>
        )}
        {(mode !== 'overview' || selected) && (
          <button type="button" className="btn btn-sm" onClick={toOverview}>
            {t('العودة للعرض العام', 'Back to overview')}
          </button>
        )}
      </div>

      <div className="sv-layout">
        <section aria-label={t('مخطط القاعة', 'Hall plan')} style={{ minWidth: 0 }}>
          <div ref={stageRef} className={`sv-stage${view === '2d' ? ' is-2d' : ''}`}>
            {view === '3d' ? (
              <SceneBoundary key={sceneKey} onError={onSceneError} fallback={null}>
                <Suspense
                  fallback={
                    <div className="sv-loading">
                      <Loading label={t('جاري تحميل العرض ثلاثي الأبعاد…', 'Loading the 3D view…')} />
                    </div>
                  }
                >
                  <HallScene
                    geometry={ex.geometry}
                    booths={ex.booths}
                    geo={geo}
                    selected={selected}
                    pinned={pinned}
                    recommended={recommended}
                    mode={mode}
                    nonce={nonce}
                    reducedMotion={reducedMotion}
                    text={sceneText}
                    onSelect={select}
                    onContextLost={onContextLost}
                    onReset={toOverview}
                  />
                </Suspense>
              </SceneBoundary>
            ) : (
              <HallPlan2D geometry={ex.geometry} booths={ex.booths} geo={geo} selected={selected} pinned={pinned} recommended={recommended} text={planText} onSelect={select} />
            )}

            {view === '3d' && (mode !== 'booth' || !selected) && (
              <div className="sv-chip" role="note">
                {mode === 'eye' && selected
                  ? t(`👁 واقف عند واجهة ${selected} (ارتفاع العين 1.65 م) — اسحب للنظر حولك`, `👁 Standing at the front of ${selected} (eye height 1.65 m) — drag to look around`)
                  : t('اسحب للتدوير · مرّر أو اقرص للتقريب · اضغط على بوث لاختياره', 'Drag to orbit · scroll or pinch to zoom · tap a booth to select it')}
              </div>
            )}

            {view === '3d' && selectedBooth && (
              <div className="sv-selbar">
                <span className="small">
                  <strong className="num">{selectedBooth.code}</strong> · <span aria-hidden="true">{STATUS_META[selectedBooth.status].icon}</span> {statusWord(t, selectedBooth.status)} · <span className="num">{sizeText(t, selectedBooth)}</span> ·{' '}
                  <span className="num">{sqm(t, selectedBooth.width * selectedBooth.depth)}</span>
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn btn-sm" onClick={showDetails}>
                    {t('التفاصيل', 'Details')}
                  </button>
                  {mode === 'eye' ? (
                    <button type="button" className="btn btn-sm" onClick={exitEye}>
                      {t('خروج من المنظور', 'Exit perspective')}
                    </button>
                  ) : (
                    <button type="button" className="btn btn-sm" onClick={toEye}>
                      <span aria-hidden="true">👁</span> {t('المنظور', 'Perspective')}
                    </button>
                  )}
                  <button type="button" className="btn btn-sm" onClick={toOverview}>
                    {t('عرض عام', 'Overview')}
                  </button>
                </span>
              </div>
            )}
          </div>

          <Legend planView={view === '2d'} />

          {!webgl && (
            <div className="alert alert-info small" role="note" style={{ marginTop: 12 }}>
              <span aria-hidden="true">ℹ</span>
              <div>{t('العرض ثلاثي الأبعاد غير مدعوم على هذا الجهاز أو المتصفح، لذلك نعرض المخطط ثنائي الأبعاد. كل الميزات متاحة هنا وفي القائمة.', '3D is not supported on this device or browser, so the 2D plan is shown. Every feature is available here and in the list.')}</div>
            </div>
          )}
          {webgl && fallback && view === '2d' && (
            <div className="alert alert-warn small" role="alert" style={{ marginTop: 12 }}>
              <span aria-hidden="true">⚠</span>
              <div className="spacer">
                {fallback === 'lost'
                  ? t('توقف العرض ثلاثي الأبعاد (فُقد سياق الرسوميات)، فانتقلنا إلى المخطط ثنائي الأبعاد.', 'The 3D view stopped (graphics context lost), so we switched to the 2D plan.')
                  : t('تعذّر تشغيل العرض ثلاثي الأبعاد، فانتقلنا إلى المخطط ثنائي الأبعاد.', 'The 3D view could not start, so we switched to the 2D plan.')}
              </div>
              <button type="button" className="btn btn-sm" onClick={show3D}>
                {t('جرّب 3D مرة أخرى', 'Try 3D again')}
              </button>
            </div>
          )}
        </section>

        <div className="sv-side">
          {selectedBooth ? (
            <BoothDetails
              booth={selectedBooth}
              geo={geo.get(selectedBooth.code)}
              all={ex.booths}
              geometry={ex.geometry}
              recRank={recommended.get(selectedBooth.code) ?? 0}
              pinned={pinned.includes(selectedBooth.code)}
              canPin={canPin}
              mode={view === '3d' ? mode : mode === 'eye' ? 'booth' : mode}
              canEye={webgl}
              requestOpen={requestOpen}
              headingRef={detailsHeadingRef}
              onTogglePin={() => togglePin(selectedBooth.code)}
              onEye={toEye}
              onExitEye={exitEye}
              onRequest={openRequest}
              onClear={clearSelection}
            />
          ) : (
            <section className="card card-tight stack" aria-labelledby="sv-details-empty">
              <h2 id="sv-details-empty" ref={detailsHeadingRef} tabIndex={-1} style={{ fontSize: '1.15rem', margin: 0 }}>
                {t('اختر بوثاً', 'Choose a booth')}
              </h2>
              <p className="muted small" style={{ margin: 0 }}>
                {t(
                  'اضغط على أي بوث في المخطط، أو اختر من القائمة أسفل الصفحة، أو اطلب اقتراحات. ستتحرك الكاميرا إلى البوث وتظهر قياساته هنا، ويمكنك بعدها رؤية المنظور من واجهته.',
                  'Tap any booth on the plan, pick one from the list below, or ask for suggestions. The camera moves to the booth, its measurements appear here, and you can then see the view from its front.',
                )}
              </p>
              <ul className="small muted" style={{ margin: 0, paddingInlineStart: 18 }}>
                <li>
                  {t('متاح', 'Available')}: <span className="num">{counts.available}</span> · {t('محجوز', 'Booked')}: <span className="num">{counts.booked}</span>
                  {counts.held > 0 && (
                    <>
                      {' '}
                      · {t('محجوز مؤقتاً', 'On hold')}: <span className="num">{counts.held}</span>
                    </>
                  )}
                  {counts.unavailable > 0 && (
                    <>
                      {' '}
                      · {t('غير متاح', 'Unavailable')}: <span className="num">{counts.unavailable}</span>
                    </>
                  )}
                </li>
                <li>{t('حجز البوث يتم بطلب يوافق عليه المنظّم.', 'Booths are allocated by request, approved by the organizer.')}</li>
              </ul>
            </section>
          )}

          {selectedBooth && requestOpen && <BoothRequestForm key={selectedBooth.code} exhibitionId={ex.id} booth={selectedBooth} onClose={() => setRequestOpen(false)} onBoothUnavailable={reload} />}

          <BoothRecommend eventId={ex.id} results={recs} onResults={setRecs} onFocus={focusBooth} selected={selected} pinned={pinned} canPin={canPin} onTogglePin={togglePin} />
        </div>
      </div>

      <BoothCompare booths={pinnedBooths} geo={geo} selected={selected} onRemove={togglePin} onClear={() => setPinned([])} onFocus={focusBooth} />

      <BoothList booths={ex.booths} selected={selected} pinned={pinned} recommended={recommended} canPin={canPin} onSelect={focusBooth} onTogglePin={togglePin} />
    </div>
  );
}

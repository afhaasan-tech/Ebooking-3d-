import { useMemo, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { toAsciiDigits } from '@ebooking/shared';
import { useI18n } from '../../lib/i18n';
import { api, ApiError } from '../../lib/api';
import { ErrorBox, SelectInput } from '../../ui/components';
import { STATUSES, STATUS_META, scoreBreakdown, type Booth, type BoothGeo, type BoothStatus, type HallGeometry, type Recommendation, type ViewMode } from './model';
import { frontText, metres, openSidesText, sizeText, sqm, statusWord } from './labels';

export function BoothStatusBadge({ status }: { status: BoothStatus }) {
  const { t } = useI18n();
  const m = STATUS_META[status];
  return (
    <span className={`badge ${m.badge}`}>
      <span aria-hidden="true">{m.icon}</span>
      {statusWord(t, status)}
    </span>
  );
}

export function Legend({ planView }: { planView: boolean }) {
  const { t } = useI18n();
  return (
    <div className="sv-legend" role="note" aria-label={t('دليل الألوان والرموز', 'Legend')}>
      {STATUSES.map((s) => (
        <span key={s}>
          <span className="sv-sw" style={{ background: STATUS_META[s].color, color: STATUS_META[s].ink }} aria-hidden="true">
            {STATUS_META[s].icon}
          </span>
          {statusWord(t, s)}
        </span>
      ))}
      <span>
        <span className="sv-sw" style={{ border: '2px solid #e8c77c' }} aria-hidden="true" />
        {t('البوث المحدد', 'Selected')}
      </span>
      <span>
        <span className="sv-sw" style={{ background: '#7aa8d8', color: '#0b1520', borderRadius: 999 }} aria-hidden="true">
          1
        </span>
        {t('ضمن المقارنة', 'Pinned to compare')}
      </span>
      <span>
        <span aria-hidden="true" style={{ color: '#e8c77c' }}>
          ★
        </span>
        {t('مقترح', 'Recommended')}
      </span>
      <span>
        <span className="sv-sw line" style={{ background: '#2b2631', border: '1px dashed #6f5c33' }} aria-hidden="true" />
        {t('ممر رئيسي', 'Main aisle')}
      </span>
      <span>
        <span className="sv-sw" style={{ background: '#1f8a4c', color: '#fff', width: 'auto', padding: '0 4px', fontSize: 9 }} aria-hidden="true">
          EXIT
        </span>
        {t('مخرج طوارئ', 'Exit')}
      </span>
      {planView ? (
        <span>
          <span aria-hidden="true">▲</span>
          {t('الواجهة المفتوحة للبوث', 'Open booth front')}
        </span>
      ) : (
        <span>{t('الطاولة الداكنة تشير إلى واجهة البوث', 'The dark counter marks the booth front')}</span>
      )}
    </div>
  );
}

// ───────────────────────── details ─────────────────────────
const FACTORS: { key: 'entranceProximity' | 'openSides' | 'mainAisle' | 'area'; ar: string; en: string }[] = [
  { key: 'entranceProximity', ar: 'القرب من المدخل الرئيسي', en: 'Proximity to main entrance' },
  { key: 'openSides', ar: 'الواجهات المفتوحة', en: 'Open sides' },
  { key: 'mainAisle', ar: 'الإطلالة على ممر رئيسي', en: 'Main-aisle frontage' },
  { key: 'area', ar: 'المساحة', en: 'Area' },
];

export function BoothDetails({
  booth,
  geo,
  all,
  geometry,
  recRank,
  pinned,
  canPin,
  mode,
  canEye,
  requestOpen,
  headingRef,
  onTogglePin,
  onEye,
  onExitEye,
  onRequest,
  onClear,
}: {
  booth: Booth;
  geo: BoothGeo | undefined;
  all: Booth[];
  geometry: HallGeometry;
  recRank: number;
  pinned: boolean;
  canPin: boolean;
  mode: ViewMode;
  canEye: boolean;
  requestOpen: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onTogglePin: () => void;
  onEye: () => void;
  onExitEye: () => void;
  onRequest: () => void;
  onClear: () => void;
}) {
  const { t, money } = useI18n();
  const breakdown = useMemo(() => scoreBreakdown(booth, all, geometry), [booth, all, geometry]);
  const valueOf = (key: (typeof FACTORS)[number]['key']) => {
    if (key === 'entranceProximity') return metres(t, booth.dist_entrance);
    if (key === 'openSides') return String(booth.open_sides);
    if (key === 'mainAisle') return booth.fronts_main_aisle ? t('نعم', 'yes') : t('لا', 'no');
    return sqm(t, booth.width * booth.depth);
  };
  const score = Math.max(0, Math.min(100, booth.score));
  return (
    <section className="card card-tight stack" aria-labelledby="sv-details-title">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <span className="tiny faint">{t('تفاصيل البوث', 'Booth details')}</span>
          <h2 id="sv-details-title" ref={headingRef} tabIndex={-1} style={{ margin: 0, fontSize: '1.45rem' }}>
            {t('بوث', 'Booth')} <span className="num">{booth.code}</span>
          </h2>
        </div>
        <BoothStatusBadge status={booth.status} />
      </div>
      {recRank > 0 && <span className="badge badge-gold" style={{ alignSelf: 'flex-start' }}>★ {t(`الاقتراح رقم ${recRank}`, `Recommendation #${recRank}`)}</span>}

      <dl className="sv-dl">
        <dt>{t('المقاس (عرض × عمق)', 'Size (W × D)')}</dt>
        <dd>
          <span className="num">{sizeText(t, booth)}</span>
        </dd>
        <dt>{t('المساحة', 'Area')}</dt>
        <dd>
          <span className="num">{sqm(t, booth.width * booth.depth)}</span>
        </dd>
        <dt>{t('المنطقة', 'Zone')}</dt>
        <dd>{booth.zone || '—'}</dd>
        <dt>{t('الواجهات المفتوحة', 'Open sides')}</dt>
        <dd>{openSidesText(t, booth.open_sides)}</dd>
        <dt>{t('على ممر رئيسي', 'Main-aisle frontage')}</dt>
        <dd>{booth.fronts_main_aisle ? t('نعم', 'Yes') : t('لا', 'No')}</dd>
        <dt>{t('اتجاه الواجهة', 'Front faces')}</dt>
        <dd>{frontText(t, geo)}</dd>
        <dt>{t('إلى المدخل الرئيسي', 'To main entrance')}</dt>
        <dd>
          <span className="num">{metres(t, booth.dist_entrance)}</span>
        </dd>
        <dt>{t('إلى أقرب مخرج', 'To nearest exit')}</dt>
        <dd>
          <span className="num">{metres(t, booth.dist_exit)}</span>
        </dd>
        <dt>{t('السعر', 'Price')}</dt>
        <dd>{money(booth.price_fils)}</dd>
      </dl>
      {booth.price_fils == null && <p className="tiny faint" style={{ margin: 0 }}>{t('يحدد المنظّم السعر عند مراجعة طلبك.', 'The organizer quotes the price when reviewing your request.')}</p>}

      <div className="stack" style={{ gap: 6 }}>
        <div className="row between">
          <span className="small muted">{t('درجة المخطط', 'Layout score')}</span>
          <span>
            <span className="sv-score num">{score}</span>
            <span className="faint small"> / 100</span>
          </span>
        </div>
        <div className="sv-meter" role="img" aria-label={t(`الدرجة ${score} من 100`, `Score ${score} out of 100`)}>
          <i style={{ width: `${score}%` }} />
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>
          {t(
            'مبنية فقط على خصائص قابلة للقياس في المخطط — ليست توقعاً لعدد الزوار أو المبيعات.',
            'Based only on measurable layout characteristics — not a traffic or sales prediction.',
          )}
        </p>
        <details>
          <summary className="small" style={{ cursor: 'pointer', color: 'var(--gold-2)' }}>
            {t('مما تتكوّن الدرجة؟', 'What makes up this score?')}
          </summary>
          <ul className="sv-factors">
            {FACTORS.map((f) => (
              <li key={f.key}>
                <span>
                  {t(f.ar, f.en)} <span className="faint num">({Math.round(breakdown.weights[f.key] * 100)}%)</span> — <span className="num">{valueOf(f.key)}</span>
                </span>
                {breakdown.consistent ? (
                  <span className="sv-meter" aria-hidden="true">
                    <i style={{ width: `${Math.round(Math.max(0, Math.min(1, breakdown.components[f.key])) * 100)}%` }} />
                  </span>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        </details>
      </div>

      {booth.status !== 'available' && (
        <div className="alert alert-warn small" role="note">
          <span aria-hidden="true">ℹ</span>
          <div>{t('هذا البوث غير متاح للطلب حالياً. اختر بوثاً متاحاً أو استخدم الاقتراحات.', 'This booth cannot be requested right now. Pick an available booth or use the recommendations.')}</div>
        </div>
      )}

      <div className="sv-actions">
        {booth.status === 'available' && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onRequest} aria-expanded={requestOpen} aria-controls="sv-request">
            {t('طلب حجز هذا البوث', 'Request this booth')}
          </button>
        )}
        {mode === 'eye' ? (
          <button type="button" className="btn btn-sm" onClick={onExitEye}>
            {t('الخروج من منظور البوث', 'Leave booth perspective')}
          </button>
        ) : (
          <button type="button" className="btn btn-sm" onClick={onEye} disabled={!canEye}>
            <span aria-hidden="true">👁</span> {t('المنظور من البوث', 'View from the booth')}
          </button>
        )}
        <button type="button" className="btn btn-sm" aria-pressed={pinned} onClick={onTogglePin} disabled={!pinned && !canPin}>
          <span aria-hidden="true">📌</span> {pinned ? t('إزالة من المقارنة', 'Unpin') : t('أضف للمقارنة', 'Pin to compare')}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
          {t('إلغاء التحديد', 'Clear selection')}
        </button>
      </div>
      {!canEye && <p className="tiny faint" style={{ margin: 0 }}>{t('المنظور من البوث يحتاج العرض ثلاثي الأبعاد، وهو غير متاح على هذا الجهاز.', 'The booth perspective needs the 3D view, which is not available on this device.')}</p>}
      {!pinned && !canPin && <p className="tiny faint" style={{ margin: 0 }}>{t('يمكن مقارنة ٣ بوثات كحد أقصى.', 'You can compare up to 3 booths.')}</p>}
    </section>
  );
}

// ───────────────────────── comparison ─────────────────────────
type Best = 'max' | 'min' | 'true' | null;

export function BoothCompare({
  booths,
  geo,
  selected,
  onRemove,
  onClear,
  onFocus,
}: {
  booths: Booth[];
  geo: Map<string, BoothGeo>;
  selected: string | null;
  onRemove: (code: string) => void;
  onClear: () => void;
  onFocus: (code: string) => void;
}) {
  const { t, money } = useI18n();
  if (!booths.length) return null;
  const rows: { label: string; value: (b: Booth) => ReactNode; num?: (b: Booth) => number; best?: Best }[] = [
    { label: t('الحالة', 'Status'), value: (b) => <BoothStatusBadge status={b.status} /> },
    { label: t('المقاس', 'Size'), value: (b) => <span className="num">{sizeText(t, b)}</span> },
    { label: t('المساحة', 'Area'), value: (b) => <span className="num">{sqm(t, b.width * b.depth)}</span>, num: (b) => b.width * b.depth, best: 'max' },
    { label: t('الواجهات المفتوحة', 'Open sides'), value: (b) => openSidesText(t, b.open_sides), num: (b) => b.open_sides, best: 'max' },
    { label: t('على ممر رئيسي', 'Main-aisle frontage'), value: (b) => (b.fronts_main_aisle ? t('نعم', 'Yes') : t('لا', 'No')), num: (b) => (b.fronts_main_aisle ? 1 : 0), best: 'max' },
    { label: t('اتجاه الواجهة', 'Front faces'), value: (b) => frontText(t, geo.get(b.code)) },
    { label: t('إلى المدخل الرئيسي', 'To main entrance'), value: (b) => <span className="num">{metres(t, b.dist_entrance)}</span>, num: (b) => b.dist_entrance, best: 'min' },
    { label: t('إلى أقرب مخرج', 'To nearest exit'), value: (b) => <span className="num">{metres(t, b.dist_exit)}</span>, num: (b) => b.dist_exit, best: 'min' },
    { label: t('درجة المخطط', 'Layout score'), value: (b) => <span className="num">{b.score}/100</span>, num: (b) => b.score, best: 'max' },
    { label: t('السعر', 'Price'), value: (b) => money(b.price_fils) },
  ];
  const isBest = (row: (typeof rows)[number], b: Booth) => {
    if (booths.length < 2 || !row.num || !row.best) return false;
    const vals = booths.map(row.num);
    const target = row.best === 'min' ? Math.min(...vals) : Math.max(...vals);
    if (vals.every((v) => v === target)) return false;
    return row.num(b) === target;
  };
  return (
    <section className="sv-section" aria-labelledby="sv-compare-title" id="sv-compare">
      <div className="row between">
        <h2 id="sv-compare-title">{t('مقارنة البوثات', 'Compare booths')}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
          {t('مسح المقارنة', 'Clear comparison')}
        </button>
      </div>
      {booths.length < 2 && <p className="muted small">{t('ثبّت بوثاً آخر على الأقل (حتى ٣) لعرض المقارنة جنباً إلى جنب.', 'Pin at least one more booth (up to 3) to compare side by side.')}</p>}
      <div className="table-wrap">
        <table className="table sv-table">
          <caption className="sr-only">{t('مقارنة البوثات المثبّتة. ★ تعني الأفضل في هذا البند حسب قياسات المخطط.', 'Pinned booth comparison. ★ marks the best value in that row by layout measurements.')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('البند', 'Attribute')}</th>
              {booths.map((b, i) => (
                <th scope="col" key={b.code}>
                  <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <span className="sv-sw" style={{ background: '#7aa8d8', color: '#0b1520', borderRadius: 999 }} aria-hidden="true">
                      {i + 1}
                    </span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onFocus(b.code)} aria-pressed={selected === b.code} aria-label={t(`عرض البوث ${b.code} على المخطط`, `Show booth ${b.code} on the plan`)}>
                      {b.code}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm icon-btn" onClick={() => onRemove(b.code)} aria-label={t(`إزالة ${b.code} من المقارنة`, `Remove ${b.code} from comparison`)}>
                      ✕
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {booths.map((b) => (
                  <td key={b.code}>
                    {row.value(b)}
                    {isBest(row, b) && (
                      <span className="sv-best">
                        <span aria-hidden="true">★</span>
                        <span className="sr-only">{t('(الأفضل)', '(best)')}</span>
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny faint">{t('★ الأفضل في البند حسب القياسات فقط — لا يعكس توقعات زوار أو مبيعات.', '★ best in that row by measurements only — not a traffic or sales prediction.')}</p>
    </section>
  );
}

// ───────────────────────── list ─────────────────────────
type SortKey = 'code' | 'score' | 'entrance' | 'exit' | 'area';

export function BoothList({
  booths,
  selected,
  pinned,
  recommended,
  canPin,
  onSelect,
  onTogglePin,
}: {
  booths: Booth[];
  selected: string | null;
  pinned: string[];
  recommended: Map<string, number>;
  canPin: boolean;
  onSelect: (code: string) => void;
  onTogglePin: (code: string) => void;
}) {
  const { t, money } = useI18n();
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [sort, setSort] = useState<SortKey>('code');
  const rows = useMemo(() => {
    const list = booths.filter((b) => !onlyAvailable || b.status === 'available');
    const by: Record<SortKey, (a: Booth, b: Booth) => number> = {
      code: (a, b) => a.code.localeCompare(b.code),
      score: (a, b) => b.score - a.score || a.code.localeCompare(b.code),
      entrance: (a, b) => a.dist_entrance - b.dist_entrance,
      exit: (a, b) => a.dist_exit - b.dist_exit,
      area: (a, b) => b.width * b.depth - a.width * a.depth || a.code.localeCompare(b.code),
    };
    return [...list].sort(by[sort]);
  }, [booths, onlyAvailable, sort]);
  const available = booths.filter((b) => b.status === 'available').length;

  return (
    <section className="sv-section" aria-labelledby="sv-list-title" id="sv-list">
      <h2 id="sv-list-title">{t('جميع البوثات', 'All booths')}</h2>
      <p className="muted small">
        {t(
          `${available} من ${booths.length} بوث متاحة. اختر بوثاً لتحريك الكاميرا إليه وعرض تفاصيله — هذه القائمة بديل كامل للمخطط وتعمل بلوحة المفاتيح.`,
          `${available} of ${booths.length} booths available. Pick a booth to move the camera to it and see its details — this list is a full keyboard-friendly alternative to the plan.`,
        )}
      </p>
      <div className="sv-filters">
        <label className="sv-check">
          <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
          {t('المتاحة فقط', 'Available only')}
        </label>
        <SelectInput label={t('الترتيب حسب', 'Sort by')} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="code">{t('رمز البوث', 'Booth code')}</option>
          <option value="score">{t('درجة المخطط (الأعلى أولاً)', 'Layout score (highest first)')}</option>
          <option value="entrance">{t('الأقرب للمدخل الرئيسي', 'Closest to main entrance')}</option>
          <option value="exit">{t('الأقرب لمخرج', 'Closest to an exit')}</option>
          <option value="area">{t('المساحة (الأكبر أولاً)', 'Area (largest first)')}</option>
        </SelectInput>
      </div>
      {rows.length === 0 ? (
        <p className="muted">{t('لا توجد بوثات متاحة حالياً.', 'No booths are available right now.')}</p>
      ) : (
        <div className="table-wrap">
          <table className="table sv-table">
            <caption className="sr-only">{t('قائمة البوثات مع القياسات والحالة والسعر', 'Booths with measurements, status and price')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('البوث', 'Booth')}</th>
                <th scope="col">{t('الحالة', 'Status')}</th>
                <th scope="col">{t('المقاس', 'Size')}</th>
                <th scope="col">{t('المساحة', 'Area')}</th>
                <th scope="col">{t('الواجهات', 'Open sides')}</th>
                <th scope="col">{t('ممر رئيسي', 'Main aisle')}</th>
                <th scope="col">{t('إلى المدخل', 'To entrance')}</th>
                <th scope="col">{t('أقرب مخرج', 'Nearest exit')}</th>
                <th scope="col">{t('الدرجة', 'Score')}</th>
                <th scope="col">{t('السعر', 'Price')}</th>
                <th scope="col">{t('مقارنة', 'Compare')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const isPinned = pinned.includes(b.code);
                const rec = recommended.get(b.code);
                return (
                  <tr key={b.code} className={selected === b.code ? 'is-sel' : undefined}>
                    <td>
                      <button type="button" className="code" aria-pressed={selected === b.code} onClick={() => onSelect(b.code)} aria-label={t(`عرض البوث ${b.code}`, `Show booth ${b.code}`)}>
                        {b.code}
                      </button>
                      {rec ? (
                        <span className="sv-best" title={t(`مقترح رقم ${rec}`, `Recommendation #${rec}`)}>
                          ★{rec}
                          <span className="sr-only">{t(`، مقترح رقم ${rec}`, `, recommendation #${rec}`)}</span>
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <BoothStatusBadge status={b.status} />
                    </td>
                    <td className="num">{sizeText(t, b)}</td>
                    <td className="num">{sqm(t, b.width * b.depth)}</td>
                    <td>{b.open_sides}</td>
                    <td>{b.fronts_main_aisle ? t('نعم', 'Yes') : t('لا', 'No')}</td>
                    <td className="num">{metres(t, b.dist_entrance)}</td>
                    <td className="num">{metres(t, b.dist_exit)}</td>
                    <td className="num">{b.score}</td>
                    <td>{money(b.price_fils)}</td>
                    <td>
                      <label className="sv-check">
                        <input type="checkbox" checked={isPinned} disabled={!isPinned && !canPin} onChange={() => onTogglePin(b.code)} />
                        <span className="sr-only">{t(`قارن البوث ${b.code}`, `Compare booth ${b.code}`)}</span>
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!canPin && <p className="tiny faint">{t('وصلت للحد الأقصى (٣ بوثات) في المقارنة.', 'You reached the comparison limit (3 booths).')}</p>}
    </section>
  );
}

// ───────────────────────── recommendations ─────────────────────────
export function BoothRecommend({
  eventId,
  results,
  onResults,
  onFocus,
  selected,
  pinned,
  canPin,
  onTogglePin,
}: {
  eventId: string;
  results: Recommendation[] | null;
  onResults: (r: Recommendation[] | null) => void;
  onFocus: (code: string) => void;
  selected: string | null;
  pinned: string[];
  canPin: boolean;
  onTogglePin: (code: string) => void;
}) {
  const { t, lang } = useI18n();
  const [nearEntrance, setNearEntrance] = useState(true);
  const [corner, setCorner] = useState(false);
  const [mainAisle, setMainAisle] = useState(true);
  const [minArea, setMinArea] = useState('');
  const [minErr, setMinErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const raw = toAsciiDigits(minArea).trim();
    let min: number | undefined;
    if (raw) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 500) {
        setMinErr(t('أدخل رقماً بين 0 و 500.', 'Enter a number between 0 and 500.'));
        return;
      }
      min = n;
    }
    setMinErr(null);
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ recommendations: Recommendation[]; basis: string }>('/api/exhibitions/recommend', {
        method: 'POST',
        body: { eventId, nearEntrance, corner, mainAisle, ...(min !== undefined ? { minArea: min } : {}) },
      });
      onResults(Array.isArray(r.recommendations) ? r.recommendations : []);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'network_error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card card-tight stack" aria-labelledby="sv-rec-title">
      <div>
        <h2 id="sv-rec-title" style={{ fontSize: '1.15rem', margin: 0 }}>
          {t('اقتراح بوثات', 'Suggest booths')}
        </h2>
        <p className="tiny muted" style={{ margin: '4px 0 0' }}>
          {t('يرتّب البوثات المتاحة حسب تفضيلاتك وقياسات المخطط فقط — ليس توقعاً للزوار أو المبيعات.', 'Ranks available booths by your preferences and layout measurements only — not a traffic or sales prediction.')}
        </p>
      </div>
      <form onSubmit={submit} className="stack" style={{ gap: 10 }} noValidate>
        <fieldset className="sv-prefs">
          <legend>{t('ماذا يهمك؟', 'What matters to you?')}</legend>
          <label className="sv-check">
            <input type="checkbox" checked={nearEntrance} onChange={(e) => setNearEntrance(e.target.checked)} />
            {t('قريب من المدخل الرئيسي', 'Near the main entrance')}
          </label>
          <label className="sv-check">
            <input type="checkbox" checked={corner} onChange={(e) => setCorner(e.target.checked)} />
            {t('بوث زاوية (واجهتان مفتوحتان)', 'Corner booth (2 open sides)')}
          </label>
          <label className="sv-check">
            <input type="checkbox" checked={mainAisle} onChange={(e) => setMainAisle(e.target.checked)} />
            {t('على ممر رئيسي', 'On a main aisle')}
          </label>
        </fieldset>
        <div className="field">
          <label htmlFor="sv-min-area">{t('أقل مساحة (م²) — اختياري', 'Minimum area (m²) — optional')}</label>
          <input
            id="sv-min-area"
            className="input"
            inputMode="decimal"
            value={minArea}
            onChange={(e) => setMinArea(e.target.value)}
            placeholder={t('مثال: 12', 'e.g. 12')}
            aria-invalid={!!minErr}
            aria-describedby={minErr ? 'sv-min-area-err' : undefined}
          />
          {minErr && (
            <span id="sv-min-area-err" className="error" role="alert">
              {minErr}
            </span>
          )}
        </div>
        <button className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? t('جاري الاقتراح…', 'Finding booths…') : t('اقترح بوثات', 'Suggest booths')}
        </button>
      </form>
      <ErrorBox error={error} />
      <div aria-live="polite">
        {results && results.length === 0 && <p className="muted small">{t('لا توجد بوثات متاحة تطابق هذه التفضيلات. جرّب تخفيف الشروط.', 'No available booths match these preferences. Try relaxing them.')}</p>}
        {results && results.length > 0 && (
          <>
            <p className="sr-only">{t(`تم العثور على ${results.length} بوثات مقترحة.`, `${results.length} booths suggested.`)}</p>
            <ol className="sv-recs">
              {results.map((r, i) => {
                const isPinned = pinned.includes(r.code);
                return (
                  <li key={r.code} className={selected === r.code ? 'is-sel' : undefined}>
                    <div className="row between">
                      <span className="row" style={{ gap: 8 }}>
                        <span className="sv-rank" aria-hidden="true">
                          {i + 1}
                        </span>
                        <strong className="num">{r.code}</strong>
                        <span className="tiny faint">
                          {t('درجة الترتيب', 'Rank score')} <span className="num">{r.rankScore}</span>
                        </span>
                      </span>
                    </div>
                    {r.reasons.length > 0 ? (
                      <ul className="sv-reasons">
                        {r.reasons.map((x, j) => (
                          <li key={j}>{lang === 'ar' ? x.ar : x.en}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="tiny faint" style={{ margin: '6px 0 0' }}>{t('مرتّب حسب درجة المخطط العامة.', 'Ranked by the general layout score.')}</p>
                    )}
                    <div className="sv-actions" style={{ marginTop: 8 }}>
                      <button type="button" className="btn btn-sm" onClick={() => onFocus(r.code)} aria-label={t(`عرض البوث ${r.code} على المخطط`, `Show booth ${r.code} on the plan`)}>
                        {t('عرض على المخطط', 'Show on plan')}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" aria-pressed={isPinned} disabled={!isPinned && !canPin} onClick={() => onTogglePin(r.code)}>
                        {isPinned ? t('إزالة من المقارنة', 'Unpin') : t('أضف للمقارنة', 'Pin to compare')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => onResults(null)}>
              {t('مسح الاقتراحات', 'Clear suggestions')}
            </button>
          </>
        )}
      </div>
    </section>
  );
}

import { useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { api, ApiError } from '../../lib/api';
import type { SeatIndex, SeatMap, SeatRow } from './useSeatMap';

export function authenticityInfo(a: string, t: (ar: string, en: string) => string) {
  if (a === 'verified_reference') return { label: t('مرجع موثّق متاح', 'Verified reference available'), cls: 'badge-ok', text: t('صورة معتمدة من المنظّم لهذا القسم/الكرسي.', 'An organizer-approved photo exists for this section/seat.') };
  if (a === 'geometry_based') return { label: t('معاينة مبنية على مخطط موثّق', 'Geometry-based preview'), cls: 'badge-info', text: t('مولّدة من مخطط مكان موثّق.', 'Generated from a documented venue layout.') };
  return { label: t('معاينة محاكاة', 'Simulated preview'), cls: 'badge-warn', text: t('مولّدة من نموذج ثلاثي الأبعاد تقريبي لمسرح خيالي. للاسترشاد فقط.', 'Generated from an approximate 3D model of a fictional venue. Guidance only.') };
}

export function explainSeat(s: SeatRow, t: (ar: string, en: string) => string): string[] {
  const out: string[] = [];
  out.push(t(`تبعد تقريباً ${s.distance.toFixed(1)} م عن مركز الأداء`, `About ${s.distance.toFixed(1)} m from the performance focus`));
  out.push(s.h_angle < 15 ? t('زاوية مستقيمة تقريباً مع المسرح', 'Nearly straight-on to the stage') : t(`زاوية جانبية ${s.h_angle.toFixed(0)}°`, `Side angle ${s.h_angle.toFixed(0)}°`));
  out.push(s.v_angle < -20 ? t(`نظرة للأسفل ${Math.abs(s.v_angle).toFixed(0)}°`, `Looking down ${Math.abs(s.v_angle).toFixed(0)}°`) : s.v_angle > 3 ? t(`نظرة للأعلى ${s.v_angle.toFixed(0)}°`, `Looking up ${s.v_angle.toFixed(0)}°`) : t('مستوى نظر مريح', 'Comfortable eye level'));
  if (s.c_value !== null) out.push(s.c_value >= 0.09 ? t('رؤية جيدة فوق الصف الأمامي', 'Good sightline over the row in front') : t('قد تحجب رؤوس الصف الأمامي جزءاً من الرؤية', 'Heads in the row ahead may partly block the view'));
  if (s.blocked_by.some((b) => b.startsWith('truss') || b.startsWith('proscenium'))) out.push(t('جزء من المسرح قد يحجبه عمود إضاءة/جدار جانبي', 'Part of the stage may be hidden by a truss/side wall'));
  return out;
}

export function SeatDetails({ seat, map, index, inBasket, basketFull, busy, onAdd, onRemove, onView, onCompare, comparing, onNav, viewing }: {
  seat: SeatRow; map: SeatMap; index: SeatIndex; inBasket: boolean; basketFull: boolean; busy: boolean;
  onAdd: () => void; onRemove: () => void; onView: () => void; onCompare: () => void; comparing: boolean; onNav: (d: 'left' | 'right' | 'front' | 'back') => void; viewing: boolean;
}) {
  const { t, pick, money } = useI18n();
  const cat = index.catById.get(seat.category_id);
  const sec = map.sections.find((s) => s.code === seat.section);
  const verified = map.verifiedReferences.some((r) => r.section_code === seat.section && (!r.seat_code || r.seat_code === seat.id));
  const auth = authenticityInfo(verified ? 'verified_reference' : map.performance.preview_authenticity, t);
  const available = seat.status === 'available' || inBasket;
  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h3 style={{ margin: 0 }}>{pick(sec, 'name')}</h3>
          <div className="muted">{t('صف', 'Row')} <strong className="num">{seat.row}</strong> · {t('كرسي', 'Seat')} <strong className="num">{seat.number}</strong></div>
          <div className="tiny faint num">{seat.id}</div>
        </div>
        <div style={{ textAlign: 'end' }}>
          <div className="display num" style={{ fontSize: '1.4rem' }}>{cat ? money(cat.price_fils) : '—'}</div>
          <span className="badge">{pick(cat, 'name')}</span>
        </div>
      </div>

      <div className="card card-tight" style={{ background: 'var(--bg-2)' }}>
        <div className="row between">
          <span className="small muted">{t('تقييم الرؤية التقديري', 'Estimated view score')}</span>
          <strong className="num" style={{ fontSize: '1.3rem', color: 'var(--gold-2)' }}>{seat.score}<span className="tiny muted">/100</span></strong>
        </div>
        <div aria-hidden style={{ height: 6, background: 'var(--line-soft)', borderRadius: 4, overflow: 'hidden', margin: '6px 0' }}>
          <div style={{ width: `${seat.score}%`, height: '100%', background: 'linear-gradient(90deg, var(--gold), var(--gold-2))' }} />
        </div>
        <ul className="small" style={{ margin: 0, paddingInlineStart: 18 }}>
          {explainSeat(seat, t).map((x) => <li key={x}>{x}</li>)}
        </ul>
        <div className="tiny faint" style={{ marginTop: 6 }}>{t('تقدير هندسي (مسافة، زوايا، عوائق، ارتفاع الصف) وليس ضماناً لجودة الرؤية.', 'A geometric estimate (distance, angles, obstructions, tier) — not a guarantee of viewing quality.')}</div>
      </div>

      <div className="row" style={{ gap: 6 }}>
        <span className={`badge ${auth.cls}`} title={auth.text}>{auth.label}</span>
        {seat.accessible === 'wheelchair_space' && <span className="badge badge-info">♿ {t('مساحة كرسي متحرك (بيانات تجريبية)', 'Wheelchair space (demo data)')}</span>}
        {seat.accessible === 'companion' && <span className="badge badge-info">{t('مقعد مرافق (تجريبي)', 'Companion seat (demo)')}</span>}
        {seat.aisle && <span className="badge">{t('على الممر', 'Aisle seat')}</span>}
      </div>
      <p className="tiny faint" style={{ margin: 0 }}>{auth.text}</p>

      {!available ? (
        <div className="alert alert-danger">{seat.status === 'sold' ? t('هذا الكرسي مباع.', 'This seat is sold.') : seat.status === 'held' ? t('هذا الكرسي محجوز مؤقتاً لعميل آخر.', 'This seat is temporarily held by another customer.') : t('هذا الكرسي غير متاح.', 'This seat is unavailable.')}</div>
      ) : inBasket ? (
        <button className="btn btn-block" disabled={busy} onClick={onRemove}>✓ {t('في السلة — إزالة', 'In basket — remove')}</button>
      ) : (
        <button className="btn btn-primary btn-block" disabled={busy || basketFull} onClick={onAdd}>
          {basketFull ? t('السلة ممتلئة (٦ كراسي كحد أقصى)', 'Basket full (max 6 seats)') : t('أضف للسلة', 'Add to basket')}
        </button>
      )}
      <div className="row" style={{ gap: 6 }}>
        {!viewing && <button className="btn btn-sm" onClick={onView}>👁 {t('شوف الإطلالة من الكرسي', 'View from seat')}</button>}
        <button className="btn btn-sm" onClick={onCompare} disabled={comparing}>{comparing ? t('في المقارنة', 'In comparison') : t('قارن', 'Compare')}</button>
      </div>
      {viewing && (
        <div className="stack" aria-label={t('التنقل بين الكراسي', 'Seat navigation')}>
          <div className="row" style={{ gap: 6, justifyContent: 'center' }}>
            <button className="btn btn-sm" onClick={() => onNav('front')} aria-label={t('الصف الأمامي', 'Row in front')}>▲ {t('صف أقرب', 'Closer row')}</button>
          </div>
          <div className="row" style={{ gap: 6, justifyContent: 'center', direction: 'ltr' }}>
            <button className="btn btn-sm" onClick={() => onNav('left')} aria-label={t('الكرسي على اليسار', 'Seat to the left')}>◀</button>
            <span className="small muted" style={{ direction: 'rtl' }}>{t('الكراسي المجاورة', 'Adjacent seats')}</span>
            <button className="btn btn-sm" onClick={() => onNav('right')} aria-label={t('الكرسي على اليمين', 'Seat to the right')}>▶</button>
          </div>
          <div className="row" style={{ gap: 6, justifyContent: 'center' }}>
            <button className="btn btn-sm" onClick={() => onNav('back')} aria-label={t('الصف الخلفي', 'Row behind')}>▼ {t('صف أبعد', 'Further row')}</button>
          </div>
          <div className="tiny faint" style={{ textAlign: 'center' }}>{t('لوحة المفاتيح: الأسهم للتنقل · Enter للإضافة · Esc للرجوع', 'Keyboard: arrows to move · Enter to add · Esc to go back')}</div>
        </div>
      )}
    </div>
  );
}

interface Rec { seatIds: string[]; sectionCode: string; row: string; totalFils: number; avgScore: number; reasons: { ar: string; en: string }[] }

export function SmartSearch({ performanceId, index, sectionLabel, onView, onCompare, onAdd, onHighlight }: {
  performanceId: string; index: SeatIndex; sectionLabel: (c: string) => string;
  onView: (ids: string[]) => void; onCompare: (ids: string[]) => void; onAdd: (ids: string[]) => void; onHighlight: (ids: string[]) => void;
}) {
  const { t, lang, money } = useI18n();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ recommendations: Rec[]; emptyReason?: { ar: string; en: string }; intent: any; source: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const examples = lang === 'ar'
    ? ['أبي ٤ كراسي يم بعض وبالنص', 'أبي أحسن إطلالة بميزانية ٦٠ دينار', 'أبي كرسي قريب بس مو وايد على الطرف']
    : ['Show me the best two seats under 40 KWD.', '4 seats together in the centre', 'One close seat, not on the edge'];

  const run = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<any>('/api/recommend', { method: 'POST', body: { performanceId, query: text } });
      setRes(r);
      onHighlight(r.recommendations.flatMap((x: Rec) => x.seatIds));
    } catch (e) {
      setErr((e as ApiError).code);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void run(q); }}>
        <label htmlFor="sv-q" className="small" style={{ fontWeight: 600 }}>{t('اكتب طلبك بالعربي أو الإنجليزي', 'Describe what you want (Arabic or English)')}</label>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input id="sv-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} placeholder={examples[0]} />
          <button className="btn btn-primary" disabled={busy}>{busy ? '…' : t('ابحث', 'Search')}</button>
        </div>
      </form>
      <div className="row" style={{ gap: 6 }}>
        {examples.map((x) => <button key={x} className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--line)' }} onClick={() => { setQ(x); void run(x); }}>{x}</button>)}
      </div>
      {err && <div className="alert alert-danger" role="alert">{err}</div>}
      <div aria-live="polite" className="stack">
        {res && (
          <div className="tiny muted">
            {t('فهمنا:', 'Understood:')} {res.intent.quantity} {t('كرسي', 'seat(s)')}
            {res.intent.maxTotalFils != null && <> · {t('ميزانية', 'budget')} {money(res.intent.maxTotalFils)}</>}
            {res.intent.preferCentre && <> · {t('بالنص', 'centre')}</>}
            {res.intent.avoidEdge && <> · {t('بعيد عن الطرف', 'not on the edge')}</>}
            {res.intent.preferClose && <> · {t('قريب', 'close')}</>}
            {' '}· {res.source === 'deterministic' ? t('محلل محلي بدون ذكاء اصطناعي خارجي', 'local parser, no external AI') : t('بمساعدة الذكاء الاصطناعي', 'AI-assisted')}
          </div>
        )}
        {res?.emptyReason && <div className="alert alert-warn">{lang === 'ar' ? res.emptyReason.ar : res.emptyReason.en}</div>}
        {res?.recommendations.map((r, i) => (
          <div key={r.seatIds.join()} className="card card-tight stack" style={{ gap: 6 }}>
            <div className="row between">
              <strong>#{i + 1} · {sectionLabel(r.sectionCode)} · {t('صف', 'Row')} {r.row}</strong>
              <span className="badge badge-gold num">{r.avgScore}/100</span>
            </div>
            <div className="small muted num">{r.seatIds.map((id) => index.byId.get(id)?.number).join(' · ')} — {money(r.totalFils)}</div>
            <ul className="tiny" style={{ margin: 0, paddingInlineStart: 18 }}>{r.reasons.map((x) => <li key={x.en}>{lang === 'ar' ? x.ar : x.en}</li>)}</ul>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-sm" onClick={() => onView(r.seatIds)}>👁 {t('الإطلالة', 'View')}</button>
              <button className="btn btn-sm" onClick={() => onCompare(r.seatIds.slice(0, 3))}>{t('قارن', 'Compare')}</button>
              <button className="btn btn-sm btn-primary" onClick={() => onAdd(r.seatIds)}>{t('أضفها للسلة', 'Add to basket')}</button>
            </div>
          </div>
        ))}
      </div>
      <p className="tiny faint">{t('التوصيات محسوبة من المخزون الفعلي والأسعار في الخادم. الذكاء الاصطناعي (إن وُجد) يفسّر الطلب فقط ولا ينشئ كراسي أو أسعار.', 'Recommendations come from live server inventory and prices. AI (if enabled) only interprets the request — it never creates seats or prices.')}</p>
    </div>
  );
}

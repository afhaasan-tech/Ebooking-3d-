import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { useApi } from '../lib/useApi';
import { useBasket } from '../lib/basket';
import type { ApiError } from '../lib/api';
import { DemoTag, ErrorBox, Loading } from '../ui/components';
import { EventArt, CATEGORY_LABEL } from '../ui/EventCard';
import { authenticityInfo } from '../components/venue/Panels';

export default function EventDetail() {
  const { slug } = useParams();
  const { t, pick, money, date, lang, errorText } = useI18n();
  const nav = useNavigate();
  const { holdAdmission, busy } = useBasket();
  const { data: e, error, loading, reload } = useApi<any>(`/api/events/${slug}`);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [err, setErr] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error) return <div className="container page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (!e) return null;
  if (e.inventory_type === 'exhibition_booth') return <Navigate to={`/exhibitions/${e.slug}`} replace />;

  const assigned = e.inventory_type === 'assigned_seat';
  const cat = CATEGORY_LABEL[e.category];
  const auth = authenticityInfo(e.preview_authenticity ?? 'simulated', t);

  const bookAdmission = async (performanceId: string) => {
    setErr(null);
    try {
      await holdAdmission(performanceId, qty[performanceId] ?? 1);
      nav('/checkout');
    } catch (x) {
      setErr(errorText((x as ApiError).code));
    }
  };

  return (
    <div className="container page">
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <EventArt accent={e.accent_color} category={e.category} height={190} />
        <div style={{ padding: 24 }} className="stack">
          <div className="row" style={{ gap: 6 }}>
            <span className="badge">{cat ? (lang === 'ar' ? cat[0] : cat[1]) : e.category}</span>
            <DemoTag />
            {e.age_restriction && <span className="badge">{e.age_restriction}</span>}
            {assigned && <span className="badge badge-gold">SeatVision 3D</span>}
          </div>
          <h1 style={{ marginBottom: 0 }}>{pick(e, 'title')}</h1>
          <div className="muted">{pick(e, 'venue')} · {t('المنظّم', 'Organizer')}: {e.organizer}</div>
          <p style={{ maxWidth: 760 }}>{pick(e, 'description')}</p>
          {e.categories.length > 0 && (
            <div className="row" style={{ gap: 6 }}>
              {e.categories.map((c: any) => (
                <span key={c.id} className="badge" style={{ borderColor: c.color }}>
                  <i className="sw" style={{ background: c.color }} /> {pick(c, 'name')} · <span className="num">{money(c.price_fils)}</span>
                </span>
              ))}
            </div>
          )}
          <p className="small muted" style={{ margin: 0 }}>
            {t('رسوم الخدمة', 'Service fee')}: <span className="num">{e.service_fee_bps / 100}%</span> + <span className="num">{money(e.service_fee_fixed_fils)}</span> {t('لكل تذكرة — تظهر كاملة قبل الدفع.', 'per ticket — shown in full before payment.')}
          </p>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 20, alignItems: 'start' }}>
        <section className="card stack" aria-labelledby="showtimes">
          <h2 id="showtimes">{assigned ? t('اختر موعد العرض', 'Choose a showtime') : e.inventory_type === 'time_slot' ? t('اختر الجلسة', 'Choose a session') : t('المواعيد', 'Dates')}</h2>
          {err && <div className="alert alert-danger" role="alert">{err}</div>}
          {e.performances.length === 0 && <p className="muted">{t('لا توجد مواعيد قادمة.', 'No upcoming dates.')}</p>}
          {e.performances.map((p: any) => {
            const soldOut = p.available <= 0;
            return (
              <div key={p.id} className="card card-tight row between" style={{ background: 'var(--bg-2)' }}>
                <div>
                  <strong>{date(p.starts_at, { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
                  <div className="small muted">
                    {date(p.starts_at, { hour: '2-digit', minute: '2-digit' })}
                    {p.label_ar && <> · {pick(p, 'label')}</>}
                  </div>
                  <div className="tiny" style={{ color: soldOut ? 'var(--danger)' : p.available < p.total * 0.2 ? 'var(--warn)' : 'var(--ok)' }}>
                    {soldOut ? t('نفدت التذاكر', 'Sold out') : <>{t('متاح', 'Available')}: <span className="num">{p.available}</span> / <span className="num">{p.total}</span></>}
                  </div>
                </div>
                {assigned ? (
                  <Link className={`btn ${soldOut ? '' : 'btn-primary'}`} to={`/book/${p.id}`} aria-disabled={soldOut}>
                    {t('اختر كرسيك ثلاثي الأبعاد', 'Pick your seat in 3D')}
                  </Link>
                ) : (
                  <div className="row" style={{ gap: 6 }}>
                    <label className="sr-only" htmlFor={`q-${p.id}`}>{t('العدد', 'Quantity')}</label>
                    <select id={`q-${p.id}`} className="input" style={{ width: 80 }} value={qty[p.id] ?? 1} onChange={(ev) => setQty({ ...qty, [p.id]: Number(ev.target.value) })} disabled={soldOut}>
                      {Array.from({ length: Math.min(e.max_per_order, Math.max(1, p.available)) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <button className="btn btn-primary" disabled={soldOut || busy} onClick={() => void bookAdmission(p.id)}>{t('احجز', 'Book')}</button>
                  </div>
                )}
              </div>
            );
          })}
          {assigned && <p className="tiny faint">{t('تقدر تحجز من الخريطة ثنائية الأبعاد بدون الحاجة للعرض ثلاثي الأبعاد.', 'You can also book from the 2D map — 3D is never required.')}</p>}
        </section>

        <section className="stack">
          {assigned && (
            <div className="card">
              <h3>{t('عن معاينة الكراسي', 'About seat previews')}</h3>
              <span className={`badge ${auth.cls}`}>{auth.label}</span>
              <p className="small muted" style={{ marginTop: 8 }}>{auth.text} {t('المسرح خيالي ولا يمثل أي مكان حقيقي في الكويت.', 'The venue is fictional and does not represent any real Kuwait venue.')}</p>
            </div>
          )}
          <div className="card">
            <h3>{t('سياسة الإلغاء', 'Cancellation policy')}</h3>
            <p className="small muted">{pick(e, 'cancellation_policy') || t('حسب سياسة المنظّم.', "Per the organizer's policy.")}</p>
            <h3>{t('إمكانية الوصول', 'Accessibility')}</h3>
            <p className="small muted">{pick(e, 'accessibility') || t('لا توجد بيانات موثقة عن إمكانية الوصول لهذا المكان.', 'No verified accessibility data for this venue.')}</p>
            <h3>{t('حد الشراء', 'Purchase limit')}</h3>
            <p className="small muted">{t('حتى', 'Up to')} <span className="num">{e.max_per_order}</span> {t('تذاكر للطلب الواحد.', 'tickets per order.')}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { normalizeKuwaitMobile } from '@ebooking/shared';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { forgetBasket, useBasket } from '../lib/basket';
import { api, newIdempotencyKey, type ApiError } from '../lib/api';
import { Empty, TextInput, DemoTag } from '../ui/components';
import { Countdown } from '../ui/BasketDrawer';
import { LoginForm } from './Login';
import { DEMO_MODE } from '../lib/demo';

type Method = 'knet' | 'apple_pay' | 'card';
type Scenario = 'success' | 'fail' | 'delayed' | 'duplicate_webhook' | 'confirm_after_timeout';

export default function Checkout() {
  const { t, pick, money, date, errorText } = useI18n();
  const { me } = useAuth();
  const { hold, reload } = useBasket();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [method, setMethod] = useState<Method>('knet');
  const [scenario, setScenario] = useState<Scenario>('success');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ code: string; retryable: boolean } | null>(null);
  // One idempotency key per payment attempt: a network retry reuses it → never a second charge.
  const idem = useRef<string>(newIdempotencyKey());

  useEffect(() => {
    if (me) {
      // session-scoped memory of the last contact details (cleared when the tab closes) so a retry is frictionless
      let saved: { name?: string; email?: string; mobile?: string } = {};
      try {
        saved = JSON.parse(sessionStorage.getItem(`ebk.contact.${me.id}`) ?? '{}');
      } catch {
        /* ignore */
      }
      setEmail((v) => v || saved.email || me.email);
      setName((v) => v || saved.name || me.profile?.full_name || '');
      setMobile((v) => v || saved.mobile || me.profile?.mobile || '');
    }
  }, [me]);

  if (!hold)
    return (
      <div className="container page">
        <Empty title={t('السلة فاضية', 'Your basket is empty')}>
          <Link className="btn btn-primary" to="/events">{t('تصفح الفعاليات', 'Browse events')}</Link>
        </Empty>
      </div>
    );

  const validate = () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = t('اكتب اسمك', 'Enter your name');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = t('بريد إلكتروني غير صحيح', 'Invalid email');
    if (!normalizeKuwaitMobile(mobile)) e.mobile = t('رقم كويتي من ٨ أرقام يبدأ بـ ٥ أو ٦ أو ٩ أو ٤', 'Kuwait number: 8 digits starting with 5, 6, 9 or 4');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const pay = async () => {
    if (!validate()) return;
    setBusy(true);
    setFailure(null);
    try {
      sessionStorage.setItem(`ebk.contact.${me!.id}`, JSON.stringify({ name, email, mobile }));
    } catch {
      /* storage unavailable — fine */
    }
    try {
      const order = await api<any>('/api/checkout', { method: 'POST', body: { holdId: hold.id, contact: { name, email, mobile }, method, demoScenario: scenario, idempotencyKey: idem.current } });
      if (order.status === 'confirmed') {
        forgetBasket();
        void reload();
      }
      if (order.status === 'payment_failed') idem.current = newIdempotencyKey(); // definitive failure → a new attempt may use a new key
      nav(`/orders/${order.reference}`);
    } catch (x) {
      const err = x as ApiError;
      // network error: the charge state is unknown → keep the SAME key so a retry cannot double charge
      setFailure({ code: err.code, retryable: err.code === 'network_error' });
      if (err.code === 'payment_in_progress' && err.details?.reference) nav(`/orders/${err.details.reference}`);
    } finally {
      setBusy(false);
    }
  };

  const methods: { id: Method; ar: string; en: string; icon: string }[] = [
    { id: 'knet', ar: 'كي نت', en: 'KNET', icon: '💳' },
    { id: 'apple_pay', ar: 'Apple Pay', en: 'Apple Pay', icon: '' },
    { id: 'card', ar: 'بطاقة ائتمان', en: 'Credit card', icon: '💳' },
  ];

  return (
    <div className="container page">
      <h1>{t('إتمام الحجز', 'Checkout')} <DemoTag /></h1>
      <div className="alert alert-warn" role="note" style={{ marginBottom: 16 }}>
        <strong>{t('دفع تجريبي — لن تتم معالجة أي دفع حقيقي.', 'Demo checkout — no real payment will be processed.')}</strong>
        <span className="small">{t('لا تدخل أي بيانات بطاقة حقيقية. هذه الصفحة لا تطلب أرقام بطاقات أصلاً.', 'Never enter real card details. This page never asks for card numbers.')}</span>
      </div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          {!me ? (
            <div className="card stack">
              <h2>{t('سجّل دخولك لإتمام الحجز', 'Sign in to complete your booking')}</h2>
              <p className="small muted">{t('كراسيك محجوزة لك مؤقتاً أثناء تسجيل الدخول.', 'Your seats stay held while you sign in.')}</p>
              <LoginForm compact />
            </div>
          ) : (
            <form className="card stack" onSubmit={(e) => { e.preventDefault(); void pay(); }} noValidate>
              <h2>{t('بيانات التواصل', 'Contact details')}</h2>
              <TextInput label={t('الاسم الكامل', 'Full name')} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="name" required />
              <TextInput label={t('البريد الإلكتروني', 'Email')} type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} autoComplete="email" required />
              <TextInput label={t('رقم الموبايل (الكويت)', 'Mobile (Kuwait)')} type="tel" dir="ltr" inputMode="tel" placeholder="+965 9XXX XXXX" value={mobile} onChange={(e) => setMobile(e.target.value)} error={errors.mobile} autoComplete="tel" required />
              <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend style={{ fontWeight: 600, marginBottom: 8 }}>{t('طريقة الدفع', 'Payment method')}</legend>
                <div className="choice">
                  {methods.map((m) => (
                    <label key={m.id}>
                      <input type="radio" name="method" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} />
                      <span>{m.icon} {t(m.ar, m.en)}</span>
                    </label>
                  ))}
                </div>
                <span className="tiny faint">{t('في النسخة الحقيقية ينتقل الدفع لصفحة مزوّد دفع مستضافة (KNET / Apple Pay / بطاقة) — لا نخزّن بيانات البطاقات.', 'In production, payment happens on a hosted provider page (KNET / Apple Pay / card) — we never store card data.')}</span>
              </fieldset>
              {DEMO_MODE && (<details className="card card-tight" style={{ background: 'var(--bg-2)' }}>
                <summary className="small" style={{ cursor: 'pointer' }}>{t('محاكي الدفع التجريبي (للاختبار)', 'Demo payment simulator (for testing)')}</summary>
                <div className="field" style={{ marginTop: 8 }}>
                  <label htmlFor="scenario">{t('نتيجة الدفع المحاكاة', 'Simulated outcome')}</label>
                  <select id="scenario" className="input" value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>
                    <option value="success">{t('نجاح', 'Success')}</option>
                    <option value="fail">{t('فشل الدفع', 'Payment failure')}</option>
                    <option value="delayed">{t('تأكيد متأخر (~٤ ثواني)', 'Delayed confirmation (~4s)')}</option>
                    <option value="duplicate_webhook">{t('إشعار مكرر من المزوّد', 'Duplicate provider webhook')}</option>
                    <option value="confirm_after_timeout">{t('انقطاع الاتصال بعد الخصم', 'Charged, then connection timeout')}</option>
                  </select>
                </div>
              </details>)}
              {failure && (
                <div className="alert alert-danger" role="alert">
                  <div className="spacer">
                    {errorText(failure.code)}
                    {failure.retryable && <div className="small">{t('ممكن الدفع تم أو لا — إعادة المحاولة آمنة ولن يتم الخصم مرتين.', 'The payment may or may not have gone through — retrying is safe and will not charge twice.')}</div>}
                  </div>
                </div>
              )}
              <button className="btn btn-primary btn-block" disabled={busy} style={{ minHeight: 52, fontSize: '1.05rem' }}>
                {busy ? t('جاري التحقق…', 'Processing…') : failure?.retryable ? t('إعادة المحاولة بأمان', 'Retry safely') : `${t('ادفع (تجريبي)', 'Pay (demo)')} ${money(hold.pricing.totalFils)}`}
              </button>
            </form>
          )}
        </div>

        <aside className="card stack" aria-labelledby="review">
          <h2 id="review">{t('مراجعة الطلب', 'Order review')}</h2>
          <div>
            <strong>{pick(hold.event, 'title')}</strong>
            <div className="small muted">{pick(hold.event, 'venue')} · {date(hold.event.starts_at)}{hold.event.label_ar ? ` · ${pick(hold.event, 'label')}` : ''}</div>
          </div>
          <div className="small">⏱ {t('الحجز المؤقت ينتهي خلال', 'Hold expires in')} <Countdown until={hold.expiresAt} /></div>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {hold.items.map((i) => (
                  <tr key={i.seat_code ?? i.category_code}>
                    <td>{i.seat_code ? <>{pick(i, 'section')} · {t('صف', 'Row')} {i.row_label} · {t('كرسي', 'Seat')} {i.seat_number}</> : <>{pick(i, 'category')} × <span className="num">{i.quantity}</span></>}<div className="tiny muted">{pick(i, 'category')}</div></td>
                    <td className="num" style={{ textAlign: 'end' }}>{money(i.price_fils * i.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row between small"><span className="muted">{t('المجموع الفرعي', 'Subtotal')}</span><span className="num">{money(hold.pricing.subtotalFils)}</span></div>
          <div className="row between small"><span className="muted">{t('رسوم الخدمة', 'Service fee')}</span><span className="num">{money(hold.pricing.serviceFeeFils)}</span></div>
          <hr className="divider" />
          <div className="row between"><strong>{t('الإجمالي', 'Total')}</strong><strong className="num" style={{ fontSize: '1.3rem', color: 'var(--gold-2)' }}>{money(hold.pricing.totalFils)}</strong></div>
          <p className="tiny faint">{t('الأسعار والرسوم يحسبها الخادم ولا يمكن تعديلها من المتصفح.', 'Prices and fees are calculated by the server and cannot be changed from the browser.')}</p>
        </aside>
      </div>
    </div>
  );
}

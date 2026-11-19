import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { normalizeKuwaitMobile } from '@ebooking/shared';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { api, ApiError } from '../../lib/api';
import { Loading, TextArea, TextInput } from '../../ui/components';
import { EMAIL_RE, errMessage } from './labels';
import type { Booth } from './model';

type Field = 'companyName' | 'contactName' | 'email' | 'mobile' | 'productCategory' | 'notes';
type FormState = Record<Field, string>;

const CATEGORY_SUGGESTIONS: [string, string][] = [
  ['أغذية ومشروبات', 'Food & beverages'],
  ['أزياء وإكسسوارات', 'Fashion & accessories'],
  ['حِرف يدوية', 'Handicrafts'],
  ['تجميل وعناية', 'Beauty & care'],
  ['تقنية وإلكترونيات', 'Tech & electronics'],
  ['ديكور منزلي', 'Home décor'],
  ['منتجات أطفال', 'Kids products'],
  ['خدمات', 'Services'],
];

export function BoothRequestForm({ exhibitionId, booth, onClose, onBoothUnavailable }: { exhibitionId: string; booth: Booth; onClose: () => void; onBoothUnavailable: () => void }) {
  const { t, lang, errorText } = useI18n();
  const { me, loading } = useAuth();
  const loc = useLocation();
  const [form, setForm] = useState<FormState>({ companyName: '', contactName: '', email: '', mobile: '', productCategory: '', notes: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<{ code: string; text: string } | null>(null);
  const [done, setDone] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // prefill from the signed-in profile without overwriting what the visitor typed
  useEffect(() => {
    if (!me) return;
    setForm((f) => ({ ...f, contactName: f.contactName || me.profile?.full_name || '', email: f.email || me.email || '', mobile: f.mobile || me.profile?.mobile || '' }));
  }, [me]);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (focusTick) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  const set = (k: Field) => (e: { target: { value: string } }) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const validate = (f: FormState) => {
    const e: Partial<Record<Field, string>> = {};
    const text = (k: Field, max: number) => {
      const v = f[k].trim();
      if (!v) e[k] = t('هذا الحقل مطلوب.', 'This field is required.');
      else if (v.length < 2) e[k] = t('أدخل حرفين على الأقل.', 'Enter at least 2 characters.');
      else if (v.length > max) e[k] = t(`الحد الأقصى للطول ${max}.`, `Maximum length is ${max}.`);
    };
    text('companyName', 150);
    text('contactName', 100);
    text('productCategory', 100);
    const email = f.email.trim();
    if (!email) e.email = t('هذا الحقل مطلوب.', 'This field is required.');
    else if (!EMAIL_RE.test(email) || email.length > 200) e.email = t('أدخل بريداً إلكترونياً صحيحاً.', 'Enter a valid email address.');
    if (!f.mobile.trim()) e.mobile = t('هذا الحقل مطلوب.', 'This field is required.');
    else if (!normalizeKuwaitMobile(f.mobile)) e.mobile = t('أدخل رقم جوال كويتي صحيح: ٨ أرقام يبدأ بـ 4 أو 5 أو 6 أو 9.', 'Enter a valid Kuwait mobile: 8 digits starting with 4, 5, 6 or 9.');
    if (f.notes.trim().length > 2000) e.notes = t('الحد الأقصى للملاحظات 2000 حرف.', 'Notes can be at most 2000 characters.');
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    const e = validate(form);
    setErrors(e);
    setServerError(null);
    if (Object.keys(e).length) {
      setFocusTick((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      await api<{ id: string; status: string }>('/api/exhibitions/requests', {
        method: 'POST',
        body: {
          exhibitionId,
          boothCode: booth.code,
          companyName: form.companyName.trim(),
          contactName: form.contactName.trim(),
          email: form.email.trim(),
          mobile: normalizeKuwaitMobile(form.mobile) ?? form.mobile.trim(),
          productCategory: form.productCategory.trim(),
          notes: form.notes.trim(),
        },
      });
      setDone(true);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'network_error';
      if (err instanceof ApiError && code === 'validation_error' && Array.isArray(err.details)) {
        const fe: Partial<Record<Field, string>> = {};
        for (const d of err.details as { path?: string; message?: string }[]) {
          const k = d.path as Field | undefined;
          if (k && k in form) fe[k] = d.message === 'invalid_kuwait_mobile' ? t('رقم الجوال غير صحيح.', 'Invalid mobile number.') : t('تحقق من هذا الحقل.', 'Please check this field.');
        }
        setErrors(fe);
        setFocusTick((n) => n + 1);
      }
      if (code === 'booth_not_available') onBoothUnavailable();
      setServerError({ code, text: errMessage(t, errorText, err) });
    } finally {
      setBusy(false);
    }
  };

  const nextUrl = `${loc.pathname}?booth=${encodeURIComponent(booth.code)}&request=1`;

  return (
    <section id="sv-request" className="card card-tight stack" aria-labelledby="sv-request-title">
      <div className="row between">
        <h2 id="sv-request-title" ref={headingRef} tabIndex={-1} style={{ fontSize: '1.15rem', margin: 0 }}>
          {t('طلب حجز البوث', 'Booth request')} <span className="num">{booth.code}</span>
        </h2>
        <button type="button" className="btn btn-ghost btn-sm icon-btn" onClick={onClose} aria-label={t('إغلاق نموذج الطلب', 'Close request form')}>
          ✕
        </button>
      </div>

      <div className="alert alert-info small" role="note">
        <span aria-hidden="true">ℹ</span>
        <div>
          {t(
            'هذا طلب وليس حجزاً: يراجعه المنظّم أولاً، ولا يُحجز البوث لك إلا بعد موافقته. سيتواصل معك المنظّم لتأكيد السعر والتفاصيل.',
            'This is a request, not a booking: the organizer reviews it first and nothing is booked until they approve. The organizer will contact you to confirm price and details.',
          )}
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : !me ? (
        <div className="stack" style={{ gap: 10 }}>
          <p className="muted small" style={{ margin: 0 }}>{t('سجّل دخولك لإرسال طلب حجز هذا البوث ومتابعة حالته من «حجوزاتي».', 'Sign in to send a request for this booth and track it under “My Bookings”.')}</p>
          <Link className="btn btn-primary btn-sm" to={`/login?next=${encodeURIComponent(nextUrl)}`}>
            {t('سجّل الدخول للمتابعة', 'Sign in to continue')}
          </Link>
        </div>
      ) : done ? (
        <div ref={doneRef} tabIndex={-1} className="alert alert-ok" role="status">
          <span aria-hidden="true">✓</span>
          <div className="stack" style={{ gap: 6 }}>
            <strong>{t(`تم إرسال طلبك للبوث ${booth.code}`, `Your request for booth ${booth.code} was sent`)}</strong>
            <span className="small">
              {t('حالة الطلب الآن «قيد المراجعة». لم يتم حجز أي شيء بعد — بانتظار موافقة المنظّم.', 'Its status is now “Pending”. Nothing is booked yet — it awaits the organizer’s approval.')}
            </span>
            <Link to="/bookings?tab=booths" className="small">
              {t('متابعة طلباتي', 'Track my requests')}
            </Link>
          </div>
        </div>
      ) : (
        <form ref={formRef} className="sv-form" onSubmit={submit} noValidate>
          <TextInput label={t('اسم الشركة / المشروع', 'Company / brand name')} name="companyName" autoComplete="organization" value={form.companyName} onChange={set('companyName')} error={errors.companyName} maxLength={150} required />
          <div className="grid grid-2">
            <TextInput label={t('اسم المسؤول', 'Contact name')} name="contactName" autoComplete="name" value={form.contactName} onChange={set('contactName')} error={errors.contactName} maxLength={100} required />
            <TextInput label={t('البريد الإلكتروني', 'Email')} name="email" type="email" autoComplete="email" inputMode="email" dir="ltr" value={form.email} onChange={set('email')} error={errors.email} maxLength={200} required />
          </div>
          <TextInput
            label={t('رقم الجوال (الكويت)', 'Mobile (Kuwait)')}
            name="mobile"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            dir="ltr"
            placeholder="9XXXXXXX"
            hint={t('٨ أرقام تبدأ بـ 4 أو 5 أو 6 أو 9 — رمز +965 اختياري.', '8 digits starting with 4, 5, 6 or 9 — the +965 prefix is optional.')}
            value={form.mobile}
            onChange={set('mobile')}
            error={errors.mobile}
            maxLength={20}
            required
          />
          <TextInput label={t('فئة المنتجات', 'Product category')} name="productCategory" list="sv-category-list" value={form.productCategory} onChange={set('productCategory')} error={errors.productCategory} maxLength={100} required />
          <datalist id="sv-category-list">
            {CATEGORY_SUGGESTIONS.map(([ar, en]) => (
              <option key={en} value={lang === 'ar' ? ar : en} />
            ))}
          </datalist>
          <TextArea label={t('ملاحظات (اختياري)', 'Notes (optional)')} name="notes" value={form.notes} onChange={set('notes')} error={errors.notes} maxLength={2000} rows={3} />
          {serverError && (
            <div className="alert alert-danger small" role="alert">
              <span aria-hidden="true">⚠</span>
              <div>
                {serverError.text}
                {serverError.code === 'auth_required' && (
                  <>
                    {' '}
                    <Link to={`/login?next=${encodeURIComponent(nextUrl)}`}>{t('تسجيل الدخول', 'Sign in')}</Link>
                  </>
                )}
                {serverError.code === 'request_already_pending' && (
                  <>
                    {' '}
                    <Link to="/bookings?tab=booths">{t('عرض طلباتي', 'View my requests')}</Link>
                  </>
                )}
              </div>
            </div>
          )}
          <div className="sv-actions">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? t('جاري الإرسال…', 'Sending…') : t('إرسال الطلب للمنظّم', 'Send request to organizer')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t('إلغاء', 'Cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

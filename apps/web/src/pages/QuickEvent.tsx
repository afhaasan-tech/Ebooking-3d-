/**
 * /quick-event — "Ebooking Quick Event": a managed, quote-based service for pop-up and seasonal events.
 * Guests can submit a request; signed-in users can also track requests and accept/decline quotations.
 */
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { normalizeKuwaitMobile, toAsciiDigits } from '@ebooking/shared';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/useApi';
import { api, ApiError } from '../lib/api';
import { Empty, ErrorBox, Loading, StatusBadge, TextArea, TextInput } from '../ui/components';

type T = (ar: string, en: string) => string;

const QE_CSS = `
.qe-hero { border-bottom: 1px solid var(--line-soft); background: radial-gradient(900px 420px at 80% 0%, rgba(212, 166, 74, 0.14), transparent 70%); }
.qe-hero-inner { display: grid; grid-template-columns: 1.25fr 0.75fr; gap: 32px; align-items: center; padding-block: 40px; }
@media (max-width: 860px) { .qe-hero-inner { grid-template-columns: 1fr; padding-block: 28px; } }
.qe-section { margin-top: var(--s7); scroll-margin-top: calc(var(--header-h) + 16px); }
.qe-section > h2 { margin-bottom: var(--s2); }
.qe-cards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 210px), 1fr)); }
.qe-card { background: var(--surface); border: 1px solid var(--line-soft); border-radius: var(--r2); padding: var(--s4); }
.qe-card h3 { font-size: 1rem; margin: 6px 0 4px; }
.qe-card p { margin: 0; color: var(--muted); font-size: 0.88rem; }
.qe-ico { font-size: 1.4rem; line-height: 1; }
.qe-steps { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); }
.qe-steps li { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: start; padding: 14px; border: 1px solid var(--line-soft); border-radius: var(--r2); background: var(--surface); }
.qe-steps strong { display: block; color: var(--ivory); }
.qe-steps span.d { font-size: 0.86rem; color: var(--muted); }
.qe-n { display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: #241c0e; border: 1px solid #5a4720; color: var(--gold-2); font-weight: 700; }
.qe-form { display: grid; gap: var(--s4); }
.qe-form fieldset { border: 1px solid var(--line-soft); border-radius: var(--r2); padding: var(--s4); margin: 0; display: grid; gap: var(--s3); min-width: 0; }
.qe-form legend { padding-inline: 6px; font-weight: 700; color: var(--ivory); }
.qe-group { border: 0 !important; padding: 0 !important; margin: 0; display: grid; gap: 8px; min-width: 0; }
.qe-group legend { padding: 0; font-weight: 600; font-size: 0.9rem; margin-bottom: 6px; }
.qe-group .choice label { align-items: flex-start; }
.qe-opt { display: grid; gap: 2px; }
.qe-opt small { color: var(--faint); font-weight: 400; }
.qe-file-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 0.88rem; }
.qe-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.qe-timeline li { display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--faint); padding-block: 3px; padding-inline: 3px 10px; border-radius: 999px; border: 1px solid var(--line-soft); background: var(--bg-2); }
.qe-timeline .dot { width: 20px; height: 20px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 0.7rem; font-weight: 700; background: var(--surface-2); color: var(--muted); }
.qe-timeline li.is-done { color: var(--text); }
.qe-timeline li.is-done .dot { background: #13241a; color: var(--ok); }
.qe-timeline li.is-current { border-color: var(--gold); color: var(--ivory); }
.qe-timeline li.is-current .dot { background: var(--gold); color: var(--gold-ink); }
.qe-timeline.is-off li { opacity: 0.5; }
.qe-quote .table-wrap { position: relative; }
.qe-quote { border: 1px solid var(--line-soft); border-radius: var(--r2); padding: var(--s3) var(--s4); background: var(--bg-2); display: grid; gap: var(--s3); }
.qe-quote.is-open { border-color: #5a4720; box-shadow: var(--shadow-gold); }
.qe-confirm { border: 1px dashed var(--gold); border-radius: var(--r2); padding: 12px; background: #1f1a0e; display: grid; gap: 8px; }
.qe-confirm:focus { outline: 2px solid var(--gold-2); outline-offset: 2px; }
.qe-ref { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 1.3rem; color: var(--gold-2); letter-spacing: 0.5px; }
`;

const SERVICES: { id: string; ar: string; en: string }[] = [
  { id: 'ticketing', ar: 'نظام التذاكر والبيع', en: 'Ticketing & sales' },
  { id: 'check_in_staff', ar: 'طاقم تسجيل الدخول', en: 'Check-in staff' },
  { id: '3d_venue_preview', ar: 'معاينة ثلاثية الأبعاد للمكان', en: '3D venue preview' },
  { id: 'exhibitor_management', ar: 'إدارة العارضين والبوثات', en: 'Exhibitor management' },
  { id: 'marketing_support', ar: 'دعم تسويقي', en: 'Marketing support' },
  { id: 'on_site_support', ar: 'دعم في موقع الفعالية', en: 'On-site support' },
];

const EVENT_TYPES: [string, string][] = [
  ['سوق شعبي / بازار', 'Pop-up market / bazaar'],
  ['معرض', 'Exhibition'],
  ['ورشة عمل', 'Workshop'],
  ['فعالية مجتمعية', 'Community event'],
  ['حفل أو عرض', 'Concert or show'],
  ['فعالية عائلية وأطفال', 'Family & kids event'],
  ['مؤتمر أو ندوة', 'Conference or talk'],
];

const EXTRA_ERRORS: Record<string, [string, string]> = {
  unsupported_file_type: ['نوع ملف المخطط غير مدعوم (PDF أو PNG أو JPG فقط).', 'Unsupported venue plan file type (PDF, PNG or JPG only).'],
  quote_not_found: ['عرض السعر غير موجود.', 'Quotation not found.'],
  quote_not_open: ['هذا العرض لم يعد مفتوحاً للرد. حدّثنا القائمة.', 'This quotation is no longer open for a response. The list has been refreshed.'],
  quote_expired: ['انتهت صلاحية هذا العرض. تواصل معنا لطلب عرض جديد.', 'This quotation has expired. Contact us to request a new one.'],
  auth_required: ['انتهت جلستك. سجّل دخولك مرة ثانية.', 'Your session has ended. Please sign in again.'],
};

function errMessage(t: T, errorText: (c: string) => string, e: unknown) {
  const code = e instanceof ApiError ? e.code : 'network_error';
  const m = EXTRA_ERRORS[code];
  return m ? t(m[0], m[1]) : errorText(code);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_EXT = /\.(pdf|png|jpe?g)$/i;
const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export default function QuickEvent() {
  const { t } = useI18n();
  const { me, loading } = useAuth();
  const loc = useLocation();
  const [refreshKey, setRefreshKey] = useState(0);

  const scrollToHash = () => {
    if (!loc.hash) return;
    const el = document.getElementById(decodeURIComponent(loc.hash.slice(1)));
    el?.scrollIntoView({ block: 'start' });
  };
  useEffect(scrollToHash, [loc.hash]);  

  const steps: [string, string, string, string][] = [
    ['تقديم الطلب', 'Submit your request', 'املأ النموذج أدناه بتفاصيل فعاليتك ومكانها.', 'Fill in the form below with your event and venue details.'],
    ['مراجعة الإدارة', 'Admin review', 'يراجع فريقنا الطلب وقد يتواصل معك لتفاصيل إضافية.', 'Our team reviews the request and may contact you for details.'],
    ['عرض سعر مخصص', 'Custom quotation', 'نرسل لك عرض سعر مفصّل حسب احتياجك.', 'You receive an itemized quotation tailored to your needs.'],
    ['القبول أو الرفض', 'Accept or decline', 'تقبل العرض أو ترفضه من «طلباتي» — بدون أي التزام قبل القبول.', 'Accept or decline it under “My requests” — no commitment before you accept.'],
    ['الإعداد', 'Configuration', 'نجهّز المخطط وأنواع التذاكر والسعة أو البوثات.', 'We configure the layout, ticket types, capacity or booths.'],
    ['المعاينة', 'Preview', 'تراجع الإعداد بنفسك، مع معاينة ثلاثية الأبعاد عند طلبها.', 'You review the setup yourself, with a 3D preview where requested.'],
    ['الاعتماد', 'Approval', 'لا يُنشر شيء قبل موافقتك النهائية.', 'Nothing goes live before your final approval.'],
    ['توزيع التذاكر', 'Ticket distribution', 'ننشر صفحة الفعالية ونوزّع التذاكر الرقمية.', 'We publish the event page and distribute digital tickets.'],
    ['المتابعة', 'Monitor', 'تتابع المبيعات وتسجيل الدخول أثناء الفعالية.', 'Follow sales and check-ins while the event runs.'],
  ];
  const audiences: [string, string, string, string, string][] = [
    ['🛍', 'المجمّعات التجارية', 'Shopping malls', 'فعاليات موسمية في الساحات والممرات، مثل المجمّعات والمرافق في الكويت.', 'Seasonal activations in atriums and concourses, e.g. shopping malls and venues in Kuwait.'],
    ['🏬', 'مراكز البيع بالتجزئة', 'Retail complexes', 'إطلاق منتجات وفعاليات داخل المتاجر أو أمامها.', 'Product launches and in-store or storefront events.'],
    ['🎪', 'الأسواق المؤقتة', 'Pop-up markets', 'بازارات وأسواق بأكشاك أو بوثات للعارضين.', 'Bazaars and markets with stalls or exhibitor booths.'],
    ['🤝', 'المنظمون المجتمعيون', 'Community organizers', 'فعاليات الأحياء والجمعيات والمبادرات التطوعية.', 'Neighbourhood, association and volunteer events.'],
    ['🎨', 'مشغّلو الورش', 'Workshop operators', 'ورش بجلسات محدودة العدد وتسجيل مسبق.', 'Workshops with limited-capacity sessions and pre-registration.'],
  ];
  const offers: [string, string, string, string, string][] = [
    ['🎟', 'تذاكر وبيع إلكتروني', 'Ticketing & online sales', 'مقاعد محجوزة أو دخول عام أو جلسات بمواعيد.', 'Reserved seats, general admission or timed sessions.'],
    ['🗺', 'مخطط ومعاينة ثلاثية الأبعاد', 'Layout & 3D preview', 'معاينة المكان للزوار والعارضين قبل الحجز.', 'Let visitors and exhibitors preview the space before booking.'],
    ['🧑‍💼', 'إدارة العارضين', 'Exhibitor management', 'طلبات البوثات وموافقات المنظّم في مكان واحد.', 'Booth requests and organizer approvals in one place.'],
    ['✅', 'تسجيل الدخول', 'Check-in', 'تذاكر رقمية برمز QR وطاقم عند الطلب.', 'Digital QR tickets, with staff on request.'],
  ];

  return (
    <div>
      <style>{QE_CSS}</style>
      <section className="qe-hero">
        <div className="container qe-hero-inner">
          <div className="stack">
            <span className="badge badge-gold" style={{ alignSelf: 'flex-start' }}>
              Ebooking Quick Event
            </span>
            <h1 style={{ margin: 0 }}>{t('فعاليتك القادمة، جاهزة للتذاكر خلال أيام', 'Your next event, ticket-ready in days')}</h1>
            <p className="muted" style={{ fontSize: '1.05rem', maxWidth: 620, margin: 0 }}>
              {t(
                'خدمة مُدارة للفعاليات المؤقتة والموسمية: ترسل طلبك، نراجعه ونرسل لك عرض سعر مخصص، ثم نجهّز التذاكر وتسجيل الدخول والمعاينة ثلاثية الأبعاد عند الحاجة — ولا يُنشر شيء بدون موافقتك.',
                'A managed service for pop-up and seasonal events: send a request, we review it and send a custom quotation, then we set up ticketing, check-in and a 3D preview where needed — nothing goes live without your approval.',
              )}
            </p>
            <div className="row">
              <a className="btn btn-primary" href="#request">
                {t('ابدأ طلبك', 'Start your request')}
              </a>
              {me && (
                <a className="btn" href="#mine">
                  {t('طلباتي', 'My requests')}
                </a>
              )}
            </div>
          </div>
          <aside className="card stack" aria-labelledby="qe-pricing">
            <h2 id="qe-pricing" style={{ fontSize: '1.15rem', margin: 0 }}>
              {t('التسعير', 'Pricing')}
            </h2>
            <p className="display" style={{ fontSize: '1.5rem', color: 'var(--gold-2)', margin: 0 }}>
              {t('السعر عند الطلب', 'Price on Request')}
            </p>
            <p className="muted small" style={{ margin: 0 }}>
              {t(
                'كل فعالية مختلفة، لذلك لا ننشر أسعاراً ثابتة. بعد مراجعة طلبك يصلك عرض سعر مخصص ومفصّل. إرسال الطلب مجاني ولا يُلزمك بشيء.',
                'Every event is different, so we do not publish fixed prices. After review you receive a custom, itemized quotation. Sending a request is free and does not commit you.',
              )}
            </p>
          </aside>
        </div>
      </section>

      <div className="container page" style={{ paddingTop: 'var(--s6)' }}>
        <section aria-labelledby="qe-who">
          <h2 id="qe-who">{t('لمن هذه الخدمة؟', 'Who is it for?')}</h2>
          <div className="qe-cards">
            {audiences.map(([icon, ar, en, dar, den]) => (
              <div key={en} className="qe-card">
                <span className="qe-ico" aria-hidden="true">
                  {icon}
                </span>
                <h3>{t(ar, en)}</h3>
                <p>{t(dar, den)}</p>
              </div>
            ))}
          </div>
          <p className="tiny faint" style={{ marginTop: 10 }}>
            {t('الأمثلة للتوضيح فقط ولا تعني وجود شراكة مع أي جهة.', 'Examples are illustrative only and do not imply any partnership.')}
          </p>
        </section>

        <section className="qe-section" aria-labelledby="qe-what">
          <h2 id="qe-what">{t('ماذا نقدّم؟', 'What the service does')}</h2>
          <div className="qe-cards">
            {offers.map(([icon, ar, en, dar, den]) => (
              <div key={en} className="qe-card">
                <span className="qe-ico" aria-hidden="true">
                  {icon}
                </span>
                <h3>{t(ar, en)}</h3>
                <p>{t(dar, den)}</p>
              </div>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            {t('يُحدَّد نطاق الخدمات النهائي في عرض السعر الخاص بك.', 'The final scope of services is set in your quotation.')}
          </p>
        </section>

        <section className="qe-section" aria-labelledby="qe-steps">
          <h2 id="qe-steps">{t('كيف تعمل؟ ٩ خطوات واضحة', 'How it works: 9 clear steps')}</h2>
          <ol className="qe-steps">
            {steps.map(([ar, en, dar, den], i) => (
              <li key={en}>
                <span className="qe-n" aria-hidden="true">
                  {i + 1}
                </span>
                <span>
                  <strong>{t(ar, en)}</strong>
                  <span className="d">{t(dar, den)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section id="request" className="qe-section" aria-labelledby="qe-form-title">
          <h2 id="qe-form-title">{t('اطلب Quick Event', 'Request a Quick Event')}</h2>
          <p className="muted small">
            {t('الحقول المعلَّمة بـ * مطلوبة. يمكنك الإرسال بدون تسجيل دخول، لكن متابعة الطلب من حسابك تتطلب تسجيل الدخول.', 'Fields marked * are required. You can submit without signing in, but tracking the request in your account requires signing in.')}
          </p>
          <QuickEventForm onSubmitted={() => setRefreshKey((k) => k + 1)} />
        </section>

        <section id="mine" className="qe-section" aria-labelledby="qe-mine-title">
          <h2 id="qe-mine-title">{t('طلباتي في Quick Event', 'My Quick Event requests')}</h2>
          {loading ? (
            <Loading />
          ) : me ? (
            <MyQuickEventRequests refreshKey={refreshKey} onLoaded={() => loc.hash === '#mine' && scrollToHash()} />
          ) : (
            <div className="card card-tight row between">
              <span className="muted small">{t('سجّل دخولك لمتابعة طلباتك والرد على عروض الأسعار.', 'Sign in to track your requests and respond to quotations.')}</span>
              <Link className="btn btn-sm" to={`/login?next=${encodeURIComponent('/quick-event#mine')}`}>
                {t('تسجيل الدخول', 'Sign in')}
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ───────────────────────── request form ─────────────────────────
type TextField = 'companyName' | 'contactName' | 'email' | 'mobile' | 'venueName' | 'eventType' | 'proposedDates' | 'expectedAttendance' | 'notes';
type ErrKey = TextField | 'admission' | 'seatingMode' | 'services' | 'file';

const EMPTY: Record<TextField, string> = { companyName: '', contactName: '', email: '', mobile: '', venueName: '', eventType: '', proposedDates: '', expectedAttendance: '', notes: '' };

function fmtSize(bytes: number, t: T) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} ${t('م.ب', 'MB')}` : `${Math.max(1, Math.round(bytes / 1024))} ${t('ك.ب', 'KB')}`;
}

/** The API stores only the name (≤ 200 chars); keep the extension when shortening. */
function safeFileName(name: string) {
  if (name.length <= 200) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  return name.slice(0, 200 - ext.length) + ext;
}

function QuickEventForm({ onSubmitted }: { onSubmitted: () => void }) {
  const { t, lang, errorText } = useI18n();
  const { me } = useAuth();
  const uid = useId();
  const fileId = `${uid}-file`;
  const [f, setF] = useState<Record<TextField, string>>(EMPTY);
  const [admission, setAdmission] = useState<'' | 'free' | 'paid'>('');
  const [seatingMode, setSeatingMode] = useState<'' | 'reserved' | 'general_admission' | 'exhibition_booths'>('');
  const [services, setServices] = useState<string[]>(['ticketing']);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<ErrKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!me) return;
    setF((x) => ({ ...x, contactName: x.contactName || me.profile?.full_name || '', email: x.email || me.email || '', mobile: x.mobile || me.profile?.mobile || '' }));
  }, [me]);
  useEffect(() => {
    if (focusTick) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);
  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  const clearErr = (k: ErrKey) => errors[k] && setErrors((e) => ({ ...e, [k]: undefined }));
  const set = (k: TextField) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setF((x) => ({ ...x, [k]: v }));
    clearErr(k);
  };

  const checkFile = (file: File): string | null => {
    if (!ALLOWED_EXT.test(file.name) || (file.type && !ALLOWED_MIME.includes(file.type))) return t('نوع الملف غير مدعوم. المسموح: PDF أو PNG أو JPG.', 'Unsupported file type. Allowed: PDF, PNG or JPG.');
    if (file.size > MAX_FILE_BYTES) return t('حجم الملف أكبر من 10 ميغابايت.', 'The file is larger than 10 MB.');
    if (file.size === 0) return t('الملف فارغ.', 'The file is empty.');
    return null;
  };
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) {
      setFile(null);
      clearErr('file');
      return;
    }
    const err = checkFile(picked);
    if (err) {
      setFile(null);
      setErrors((x) => ({ ...x, file: err }));
      e.target.value = '';
      return;
    }
    setFile(picked);
    clearErr('file');
  };
  const removeFile = () => {
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    clearErr('file');
    fileRef.current?.focus();
  };

  const parseAttendance = (s: string) => {
    const clean = toAsciiDigits(s).replace(/[\s,٬]/g, '');
    return /^\d+$/.test(clean) ? Number(clean) : NaN;
  };

  const validate = () => {
    const e: Partial<Record<ErrKey, string>> = {};
    const required = t('هذا الحقل مطلوب.', 'This field is required.');
    const text = (k: TextField, max: number) => {
      const v = f[k].trim();
      if (!v) e[k] = required;
      else if (v.length < 2) e[k] = t('أدخل حرفين على الأقل.', 'Enter at least 2 characters.');
      else if (v.length > max) e[k] = t(`الحد الأقصى للطول ${max}.`, `Maximum length is ${max}.`);
    };
    text('companyName', 150);
    text('contactName', 100);
    const email = f.email.trim();
    if (!email) e.email = required;
    else if (!EMAIL_RE.test(email) || email.length > 200) e.email = t('أدخل بريداً إلكترونياً صحيحاً.', 'Enter a valid email address.');
    if (!f.mobile.trim()) e.mobile = required;
    else if (!normalizeKuwaitMobile(f.mobile)) e.mobile = t('أدخل رقم جوال كويتي صحيح: ٨ أرقام يبدأ بـ 4 أو 5 أو 6 أو 9.', 'Enter a valid Kuwait mobile: 8 digits starting with 4, 5, 6 or 9.');
    text('venueName', 150);
    text('eventType', 80);
    text('proposedDates', 200);
    const n = parseAttendance(f.expectedAttendance);
    if (!f.expectedAttendance.trim()) e.expectedAttendance = required;
    else if (!Number.isInteger(n) || n < 1 || n > 1_000_000) e.expectedAttendance = t('أدخل عدداً صحيحاً بين 1 و 1,000,000.', 'Enter a whole number between 1 and 1,000,000.');
    if (!admission) e.admission = t('اختر نوع الدخول.', 'Choose the admission type.');
    if (!seatingMode) e.seatingMode = t('اختر طريقة الجلوس أو العرض.', 'Choose the seating / layout mode.');
    if (f.notes.trim().length > 2000) e.notes = t('الحد الأقصى للملاحظات 2000 حرف.', 'Notes can be at most 2000 characters.');
    if (file) {
      const fe = checkFile(file);
      if (fe) e.file = fe;
    }
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    const e = validate();
    setErrors(e);
    setServerError(null);
    if (Object.keys(e).length) {
      setFocusTick((x) => x + 1);
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ id: string; reference: string; status: string }>('/api/quick-events', {
        method: 'POST',
        body: {
          companyName: f.companyName.trim(),
          contactName: f.contactName.trim(),
          email: f.email.trim(),
          mobile: normalizeKuwaitMobile(f.mobile) ?? f.mobile.trim(),
          venueName: f.venueName.trim(),
          eventType: f.eventType.trim(),
          proposedDates: f.proposedDates.trim(),
          expectedAttendance: parseAttendance(f.expectedAttendance),
          admission,
          seatingMode,
          services,
          notes: f.notes.trim(),
          ...(file ? { venuePlanFileName: safeFileName(file.name) } : {}),
        },
      });
      setDone({ reference: r.reference });
      onSubmitted();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'validation_error' && Array.isArray(err.details)) {
        const fe: Partial<Record<ErrKey, string>> = {};
        for (const d of err.details as { path?: string; message?: string }[]) {
          const p = d.path === 'venuePlanFileName' ? 'file' : (d.path as ErrKey | undefined);
          if (p && (p in EMPTY || p === 'admission' || p === 'seatingMode' || p === 'services' || p === 'file')) fe[p] = d.message === 'invalid_kuwait_mobile' ? t('رقم الجوال غير صحيح.', 'Invalid mobile number.') : t('تحقق من هذا الحقل.', 'Please check this field.');
        }
        setErrors(fe);
        setFocusTick((x) => x + 1);
      }
      if (err instanceof ApiError && err.code === 'unsupported_file_type') setErrors((x) => ({ ...x, file: errMessage(t, errorText, err) }));
      setServerError(errMessage(t, errorText, err));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setF({ ...EMPTY, contactName: me?.profile?.full_name ?? '', email: me?.email ?? '', mobile: me?.profile?.mobile ?? '' });
    setAdmission('');
    setSeatingMode('');
    setServices(['ticketing']);
    setFile(null);
    setErrors({});
    setServerError(null);
    setDone(null);
    setCopied(false);
  };

  const copy = async () => {
    if (!done) return;
    try {
      await navigator.clipboard.writeText(done.reference);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (done) {
    return (
      <div ref={doneRef} tabIndex={-1} className="card stack" role="status" aria-labelledby={`${uid}-done`}>
        <h3 id={`${uid}-done`} style={{ margin: 0 }}>
          <span aria-hidden="true">✓ </span>
          {t('تم استلام طلبك', 'Request received')}
        </h3>
        <div className="row">
          <span className="muted small">{t('رقم المرجع:', 'Reference:')}</span>
          <span className="qe-ref num">{done.reference}</span>
          <button type="button" className="btn btn-sm" onClick={copy}>
            {copied ? t('تم النسخ ✓', 'Copied ✓') : t('نسخ', 'Copy')}
          </button>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {t(
            'سيراجع فريقنا طلبك ويتواصل معك بالبريد أو الجوال، ثم يصلك عرض سعر مخصص. لا يتم أي دفع أو التزام في هذه المرحلة.',
            'Our team will review your request and contact you by email or phone, then send a custom quotation. No payment or commitment at this stage.',
          )}
        </p>
        {me ? (
          <a className="small" href="#mine">
            {t('تابع حالة الطلب في «طلباتي» أدناه', 'Track its status under “My requests” below')}
          </a>
        ) : (
          <p className="small" style={{ margin: 0 }}>
            {t('احتفظ برقم المرجع. الطلبات المرسلة بدون تسجيل دخول لا تظهر في الحساب، وسيتواصل معك فريقنا مباشرة.', 'Keep this reference. Requests sent without signing in do not appear in an account; our team will contact you directly.')}
          </p>
        )}
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
            {t('إرسال طلب آخر', 'Send another request')}
          </button>
        </div>
      </div>
    );
  }

  const radio = (name: 'admission' | 'seatingMode', value: string, checked: boolean, onPick: () => void, label: string, hint?: string) => (
    <label key={value}>
      <input type="radio" name={`${uid}-${name}`} value={value} checked={checked} onChange={onPick} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${uid}-${name}-err` : undefined} />
      <span className="qe-opt">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );

  return (
    <form ref={formRef} className="qe-form" onSubmit={submit} noValidate>
      <fieldset>
        <legend>{t('بيانات التواصل', 'Your details')}</legend>
        <div className="grid grid-2">
          <TextInput label={t('اسم الشركة / الجهة *', 'Company / organization *')} name="companyName" autoComplete="organization" value={f.companyName} onChange={set('companyName')} error={errors.companyName} maxLength={150} />
          <TextInput label={t('اسم المسؤول *', 'Contact name *')} name="contactName" autoComplete="name" value={f.contactName} onChange={set('contactName')} error={errors.contactName} maxLength={100} />
          <TextInput label={t('البريد الإلكتروني *', 'Email *')} name="email" type="email" inputMode="email" autoComplete="email" dir="ltr" value={f.email} onChange={set('email')} error={errors.email} maxLength={200} />
          <TextInput
            label={t('رقم الجوال (الكويت) *', 'Mobile (Kuwait) *')}
            name="mobile"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            placeholder="9XXXXXXX"
            hint={t('٨ أرقام تبدأ بـ 4 أو 5 أو 6 أو 9 — رمز +965 اختياري.', '8 digits starting with 4, 5, 6 or 9 — the +965 prefix is optional.')}
            value={f.mobile}
            onChange={set('mobile')}
            error={errors.mobile}
            maxLength={20}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('تفاصيل الفعالية', 'Event details')}</legend>
        <div className="grid grid-2">
          <TextInput label={t('اسم المكان *', 'Venue name *')} name="venueName" hint={t('مثال: ساحة مجمّع تجاري أو قاعة أو مساحة خارجية في الكويت.', 'e.g. a shopping-mall atrium, a hall or an outdoor space in Kuwait.')} value={f.venueName} onChange={set('venueName')} error={errors.venueName} maxLength={150} />
          <TextInput label={t('نوع الفعالية *', 'Event type *')} name="eventType" list={`${uid}-types`} value={f.eventType} onChange={set('eventType')} error={errors.eventType} maxLength={80} />
          <TextInput label={t('التواريخ المقترحة *', 'Proposed dates *')} name="proposedDates" hint={t('مثال: ١٢–١٤ ديسمبر ٢٠٢٦، من ٤ إلى ١٠ مساءً', 'e.g. 12–14 Dec 2026, 4–10 pm')} value={f.proposedDates} onChange={set('proposedDates')} error={errors.proposedDates} maxLength={200} />
          <TextInput label={t('العدد المتوقع للحضور *', 'Expected attendance *')} name="expectedAttendance" inputMode="numeric" dir="ltr" placeholder="500" value={f.expectedAttendance} onChange={set('expectedAttendance')} error={errors.expectedAttendance} maxLength={9} />
        </div>
        <datalist id={`${uid}-types`}>
          {EVENT_TYPES.map(([ar, en]) => (
            <option key={en} value={lang === 'ar' ? ar : en} />
          ))}
        </datalist>
        <fieldset className="qe-group">
          <legend>{t('الدخول *', 'Admission *')}</legend>
          <div className="choice">
            {radio('admission', 'free', admission === 'free', () => (setAdmission('free'), clearErr('admission')), t('مجاني', 'Free'))}
            {radio('admission', 'paid', admission === 'paid', () => (setAdmission('paid'), clearErr('admission')), t('مدفوع', 'Paid'))}
          </div>
          {errors.admission && (
            <span id={`${uid}-admission-err`} className="error small" role="alert" style={{ color: 'var(--danger)' }}>
              {errors.admission}
            </span>
          )}
        </fieldset>
        <fieldset className="qe-group">
          <legend>{t('طريقة الجلوس / العرض *', 'Seating / layout *')}</legend>
          <div className="choice">
            {radio('seatingMode', 'reserved', seatingMode === 'reserved', () => (setSeatingMode('reserved'), clearErr('seatingMode')), t('مقاعد محجوزة', 'Reserved seating'), t('لكل تذكرة مقعد محدد', 'Each ticket has an assigned seat'))}
            {radio('seatingMode', 'general_admission', seatingMode === 'general_admission', () => (setSeatingMode('general_admission'), clearErr('seatingMode')), t('دخول عام', 'General admission'), t('سعة محددة بدون مقاعد مرقمة', 'Set capacity, unassigned'))}
            {radio('seatingMode', 'exhibition_booths', seatingMode === 'exhibition_booths', () => (setSeatingMode('exhibition_booths'), clearErr('seatingMode')), t('بوثات عارضين', 'Exhibition booths'), t('مساحات يطلبها العارضون', 'Spaces requested by exhibitors'))}
          </div>
          {errors.seatingMode && (
            <span id={`${uid}-seatingMode-err`} className="error small" role="alert" style={{ color: 'var(--danger)' }}>
              {errors.seatingMode}
            </span>
          )}
        </fieldset>
      </fieldset>

      <fieldset>
        <legend>{t('الخدمات المطلوبة', 'Required services')}</legend>
        <div className="choice">
          {SERVICES.map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={services.includes(s.id)}
                onChange={(e) => setServices((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))}
              />
              <span>{t(s.ar, s.en)}</span>
            </label>
          ))}
        </div>
        <span className="tiny faint">{t('اختر كل ما يناسبك — يتم تأكيد النطاق في عرض السعر.', 'Pick everything that applies — the scope is confirmed in the quotation.')}</span>
      </fieldset>

      <fieldset>
        <legend>{t('مخطط المكان والملاحظات', 'Venue plan & notes')}</legend>
        <div className="field">
          <label htmlFor={fileId}>{t('مخطط المكان (اختياري)', 'Venue plan (optional)')}</label>
          <input
            ref={fileRef}
            id={fileId}
            className="input"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            onChange={onFile}
            aria-invalid={!!errors.file}
            aria-describedby={`${fileId}-hint${errors.file ? ` ${fileId}-err` : ''}`}
          />
          <span id={`${fileId}-hint`} className="hint">
            {t(
              'PDF أو PNG أو JPG بحد أقصى 10 ميغابايت. ملاحظة: تخزين الملفات غير مفعّل بعد في هذه النسخة — نرسل اسم الملف فقط، وسيطلب منك فريقنا الملف عند المراجعة.',
              'PDF, PNG or JPG up to 10 MB. Note: file storage is not enabled yet in this version — only the file name is sent, and our team will ask you for the file during review.',
            )}
          </span>
          {file && (
            <span className="qe-file-row">
              <span aria-hidden="true">📎</span>
              <span dir="auto">{file.name}</span>
              <span className="faint num">({fmtSize(file.size, t)})</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={removeFile}>
                {t('إزالة الملف', 'Remove file')}
              </button>
            </span>
          )}
          {errors.file && (
            <span id={`${fileId}-err`} className="error" role="alert">
              {errors.file}
            </span>
          )}
        </div>
        <TextArea label={t('ملاحظات (اختياري)', 'Notes (optional)')} name="notes" value={f.notes} onChange={set('notes')} error={errors.notes} maxLength={2000} rows={4} hint={t('مثل: عدد البوثات، أنواع التذاكر، متطلبات خاصة.', 'e.g. number of booths, ticket types, special requirements.')} />
      </fieldset>

      {serverError && (
        <div className="alert alert-danger" role="alert">
          <span aria-hidden="true">⚠</span>
          <div>{serverError}</div>
        </div>
      )}
      <div className="row">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? t('جاري الإرسال…', 'Sending…') : t('إرسال الطلب', 'Send request')}
        </button>
        <span className="tiny faint">{t('إرسال الطلب مجاني ولا يُلزمك بشيء.', 'Sending a request is free and non-binding.')}</span>
      </div>
    </form>
  );
}

// ───────────────────────── my requests (also used by /bookings) ─────────────────────────
interface QuoteItem {
  description: string;
  amount_fils: number;
  quantity: number;
}
interface Quote {
  id: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
  total_fils: number;
  valid_until: string | null;
  notes: string | null;
  items: QuoteItem[] | null;
}
interface QeRow {
  id: string;
  reference: string;
  company_name: string;
  venue_name: string;
  event_type: string;
  status: string;
  created_at: string;
  quotes: Quote[] | null;
}

const QE_FLOW = ['submitted', 'under_review', 'quoted', 'quote_accepted', 'configuring', 'approved', 'live'] as const;
const QE_FLOW_LABEL: Record<(typeof QE_FLOW)[number], [string, string]> = {
  submitted: ['تم الإرسال', 'Submitted'],
  under_review: ['قيد المراجعة', 'Under review'],
  quoted: ['عرض السعر', 'Quoted'],
  quote_accepted: ['قبول العرض', 'Quote accepted'],
  configuring: ['الإعداد', 'Configuring'],
  approved: ['الاعتماد', 'Approved'],
  live: ['منشور', 'Live'],
};
const QE_NOTE: Record<string, [string, string]> = {
  submitted: ['تم استلام طلبك وبانتظار المراجعة.', 'We received your request; it is waiting for review.'],
  under_review: ['فريقنا يراجع طلبك وقد يتواصل معك لتفاصيل إضافية.', 'Our team is reviewing your request and may contact you for details.'],
  quoted: ['وصلك عرض سعر — راجعه ثم اقبله أو ارفضه.', 'You have a quotation — review it, then accept or decline.'],
  quote_accepted: ['قبلت العرض. سيبدأ فريقنا إعداد الفعالية ويتواصل معك.', 'You accepted the quotation. Our team will start configuring the event and contact you.'],
  quote_declined: ['رفضت العرض. يمكن لفريقنا إرسال عرض معدّل.', 'You declined the quotation. Our team can send a revised one.'],
  configuring: ['نجهّز الإعداد: المخطط وأنواع التذاكر والسعة.', 'We are configuring the layout, ticket types and capacity.'],
  approved: ['تم اعتماد الإعداد — نستعد للنشر وتوزيع التذاكر.', 'The setup is approved — getting ready to publish and distribute tickets.'],
  live: ['فعاليتك منشورة والتذاكر متاحة.', 'Your event is live and tickets are available.'],
  rejected: ['تعذّر قبول الطلب. تواصل مع الدعم لمزيد من التفاصيل.', 'The request could not be accepted. Contact support for details.'],
};

function QeTimeline({ status }: { status: string }) {
  const { t } = useI18n();
  const idx = status === 'quote_declined' ? QE_FLOW.indexOf('quoted') : QE_FLOW.indexOf(status as (typeof QE_FLOW)[number]);
  const off = status === 'rejected';
  return (
    <ol className={`qe-timeline${off ? ' is-off' : ''}`} aria-label={t('مراحل الطلب', 'Request progress')}>
      {QE_FLOW.map((s, i) => {
        const state = off || idx < 0 ? 'todo' : i < idx ? 'done' : i === idx ? 'current' : 'todo';
        const word = state === 'done' ? t('مكتملة', 'done') : state === 'current' ? t('المرحلة الحالية', 'current step') : t('لاحقاً', 'upcoming');
        return (
          <li key={s} className={`is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="dot" aria-hidden="true">
              {state === 'done' ? '✓' : i + 1}
            </span>
            {t(QE_FLOW_LABEL[s][0], QE_FLOW_LABEL[s][1])}
            <span className="sr-only">({word})</span>
          </li>
        );
      })}
    </ol>
  );
}

function QuoteCard({ requestId, q, onChanged }: { requestId: string; q: Quote; onChanged: () => void }) {
  const { t, money, date, errorText } = useI18n();
  const [confirm, setConfirm] = useState<null | 'accept' | 'decline'>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  useEffect(() => {
    if (confirm) confirmRef.current?.focus();
  }, [confirm]);

  const validUntil = q.valid_until ? q.valid_until.slice(0, 10) : null;
  // mirrors the server rule: a quote can be answered until the day after `valid_until`
  const expired = validUntil ? new Date(validUntil).getTime() + 86_400_000 < Date.now() : false;
  const open = q.status === 'sent' && !expired;
  const items = q.items ?? [];

  const decide = async () => {
    if (!confirm) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ status: string }>(`/api/quick-events/${requestId}/quotes/${q.id}/${confirm}`, { method: 'POST' });
      setMsg({ ok: true, text: r.status === 'accepted' ? t('تم قبول العرض. سيتواصل معك فريقنا لبدء الإعداد.', 'Quotation accepted. Our team will contact you to start the setup.') : t('تم رفض العرض.', 'Quotation declined.') });
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: errMessage(t, errorText, e) });
      if (e instanceof ApiError && ['quote_not_open', 'quote_expired', 'quote_not_found'].includes(e.code)) onChanged();
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <div className={`qe-quote${open ? ' is-open' : ''}`}>
      <div className="row between">
        <strong>{t('عرض سعر', 'Quotation')}</strong>
        <span className="row" style={{ gap: 6 }}>
          {expired && q.status === 'sent' ? <span className="badge">{t('منتهي', 'Expired')}</span> : <StatusBadge status={q.status} />}
          {validUntil && (
            <span className="tiny faint">
              {t('صالح حتى', 'Valid until')} {date(`${validUntil}T12:00:00Z`, { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </span>
      </div>
      {items.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">{t('بنود عرض السعر', 'Quotation items')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('البند', 'Item')}</th>
                <th scope="col">{t('الكمية', 'Qty')}</th>
                <th scope="col">{t('سعر الوحدة', 'Unit price')}</th>
                <th scope="col">{t('المجموع', 'Line total')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'normal' }}>{it.description}</td>
                  <td className="num">{it.quantity}</td>
                  <td>{money(it.amount_fils)}</td>
                  <td>{money(it.amount_fils * it.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row between">
        <span className="muted">{t('الإجمالي', 'Total')}</span>
        <strong style={{ color: 'var(--gold-2)', fontSize: '1.1rem' }}>{money(q.total_fils)}</strong>
      </div>
      {q.notes && <p className="small muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{q.notes}</p>}

      {open && !confirm && (
        <div className="row">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setConfirm('accept')}>
            {t('قبول العرض', 'Accept quotation')}
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirm('decline')}>
            {t('رفض العرض', 'Decline')}
          </button>
        </div>
      )}
      {open && confirm && (
        <div ref={confirmRef} tabIndex={-1} className="qe-confirm" role="group" aria-labelledby={`${uid}-confirm`}>
          <strong id={`${uid}-confirm`}>{confirm === 'accept' ? t(`تأكيد قبول عرض السعر بقيمة ${money(q.total_fils)}؟`, `Accept this quotation for ${money(q.total_fils)}?`) : t('تأكيد رفض عرض السعر؟', 'Decline this quotation?')}</strong>
          <span className="small muted">
            {confirm === 'accept'
              ? t('بالقبول يبدأ فريقنا إعداد فعاليتك. لا يتم أي دفع من هذه الصفحة، وسيتواصل معك الفريق بالخطوات التالية.', 'Accepting lets our team start configuring your event. No payment is taken on this page; the team will contact you with next steps.')
              : t('بعد الرفض يمكن لفريقنا إرسال عرض معدّل إذا رغبت.', 'After declining, our team can send a revised quotation if you wish.')}
          </span>
          <div className="row">
            <button type="button" className={confirm === 'accept' ? 'btn btn-primary btn-sm' : 'btn btn-danger btn-sm'} onClick={decide} disabled={busy}>
              {busy ? t('جاري التنفيذ…', 'Working…') : confirm === 'accept' ? t('نعم، أقبل العرض', 'Yes, accept') : t('نعم، أرفض العرض', 'Yes, decline')}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)} disabled={busy}>
              {t('تراجع', 'Cancel')}
            </button>
          </div>
        </div>
      )}
      {q.status === 'sent' && expired && <p className="tiny faint" style={{ margin: 0 }}>{t('انتهت صلاحية هذا العرض. تواصل معنا لطلب عرض جديد.', 'This quotation has expired. Contact us for a new one.')}</p>}
      {msg && (
        <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-danger'} small`} role={msg.ok ? 'status' : 'alert'}>
          <span aria-hidden="true">{msg.ok ? '✓' : '⚠'}</span>
          <div>{msg.text}</div>
        </div>
      )}
    </div>
  );
}

/** Signed-in list of the user's Quick Event requests with status timeline and quotations. */
export function MyQuickEventRequests({ refreshKey = 0, onLoaded, compact = false }: { refreshKey?: number; onLoaded?: () => void; compact?: boolean }) {
  const { t, date } = useI18n();
  const { data, error, loading, reload } = useApi<QeRow[]>('/api/quick-events/mine', [refreshKey]);
  const notified = useRef(false);
  useEffect(() => {
    if (data && !notified.current) {
      notified.current = true;
      onLoaded?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <div className="stack">
      <style>{QE_CSS}</style>
      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <Empty title={t('لا توجد طلبات بعد', 'No requests yet')}>
          <p>{t('أرسل طلبك الأول وسيظهر هنا مع حالته وعروض الأسعار.', 'Send your first request and it will appear here with its status and quotations.')}</p>
          {compact && (
            <Link className="btn btn-primary btn-sm" to="/quick-event#request">
              {t('اطلب Quick Event', 'Request a Quick Event')}
            </Link>
          )}
        </Empty>
      ) : (
        <>
          {error && <ErrorBox error={error} onRetry={reload} />}
          {data.map((r) => {
            const quotes = r.quotes ?? [];
            const note = QE_NOTE[r.status];
            return (
              <article key={r.id} className="card card-tight stack" aria-labelledby={`qe-row-${r.id}`}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <h3 id={`qe-row-${r.id}`} style={{ margin: 0 }}>
                      <span className="num">{r.reference}</span>
                    </h3>
                    <div className="small muted">
                      {r.company_name} · {r.venue_name} · {r.event_type}
                    </div>
                    <div className="tiny faint">
                      {t('أُرسل في', 'Submitted')} {date(r.created_at)}
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <QeTimeline status={r.status} />
                {note && <p className="small muted" style={{ margin: 0 }}>{t(note[0], note[1])}</p>}
                {quotes.length > 0 ? (
                  quotes.map((q) => <QuoteCard key={q.id} requestId={r.id} q={q} onChanged={reload} />)
                ) : r.status !== 'rejected' ? (
                  <p className="tiny faint" style={{ margin: 0 }}>{t('لا يوجد عرض سعر بعد — سيظهر هنا بعد المراجعة.', 'No quotation yet — it will appear here after review.')}</p>
                ) : null}
              </article>
            );
          })}
          <div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}>
              {loading ? t('جاري التحديث…', 'Refreshing…') : t('تحديث', 'Refresh')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

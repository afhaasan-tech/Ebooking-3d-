/**
 * /support — "Booking Recovery Assistant". The assistant only explains verified records from the server;
 * it cannot issue tickets, change payments or refund. Order lookups and cases require sign-in.
 */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toAsciiDigits } from '@ebooking/shared';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/useApi';
import { api, ApiError } from '../lib/api';
import { Empty, ErrorBox, Loading, StatusBadge, TextInput } from '../ui/components';
import { useReducedMotion } from './exhibition/webgl';

type T = (ar: string, en: string) => string;

const SP_CSS = `
.sp-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 340px); gap: var(--s4); align-items: start; }
@media (max-width: 900px) { .sp-layout { grid-template-columns: minmax(0, 1fr); } }
.sp-side { display: grid; gap: var(--s4); min-width: 0; }
.sp-chat { padding: 0; overflow: hidden; display: grid; }
.sp-chat-head { padding: 14px 16px; border-bottom: 1px solid var(--line-soft); display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.sp-log { height: min(52vh, 460px); min-height: 260px; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; background: var(--bg-2); }
.sp-msg { max-width: 86%; padding: 10px 14px; border-radius: 14px; line-height: 1.65; }
.sp-msg .txt { white-space: pre-wrap; overflow-wrap: anywhere; }
.sp-msg.user { align-self: flex-end; background: linear-gradient(180deg, #3a2f18, #2b2312); border: 1px solid #5a4720; color: var(--ivory); border-end-end-radius: 4px; }
.sp-msg.assistant { align-self: flex-start; background: var(--surface); border: 1px solid var(--line-soft); border-end-start-radius: 4px; }
.sp-msg.system { align-self: center; max-width: 94%; background: #1f110e; border: 1px solid #5a2f25; color: #f0a48f; font-size: 0.9rem; }
.sp-who { font-size: 0.72rem; color: var(--faint); margin-bottom: 4px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.sp-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.sp-tools { font-size: 0.72rem; color: var(--faint); margin-top: 6px; }
.sp-typing { align-self: flex-start; color: var(--muted); font-size: 0.85rem; }
.sp-compose { padding: 12px 16px 16px; border-top: 1px solid var(--line-soft); display: grid; gap: 10px; }
.sp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.sp-chip { border: 1px solid var(--line); background: var(--bg-2); color: var(--text); border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 0.85rem; cursor: pointer; min-height: 36px; text-align: start; }
.sp-chip:hover { border-color: var(--gold); color: var(--gold-2); }
.sp-chip:disabled { opacity: 0.5; cursor: not-allowed; }
.sp-compose-row { display: grid; grid-template-columns: minmax(0, 1fr) 200px; gap: 10px; align-items: start; }
@media (max-width: 640px) { .sp-compose-row { grid-template-columns: minmax(0, 1fr); } .sp-msg { max-width: 94%; } }
.sp-acc details { border: 1px solid var(--line-soft); border-radius: var(--r2); background: var(--surface); }
.sp-acc details + details { margin-top: 8px; }
.sp-acc summary { cursor: pointer; padding: 10px 14px; display: flex; gap: 10px; align-items: center; min-height: 44px; list-style: none; font-weight: 600; }
.sp-acc summary::-webkit-details-marker { display: none; }
.sp-acc summary::after { content: '+'; margin-inline-start: auto; color: var(--muted); font-weight: 700; }
.sp-acc details[open] summary::after { content: '−'; }
.sp-acc .body { padding: 0 14px 14px; color: var(--muted); font-size: 0.92rem; }
.sp-section { margin-top: var(--s7); }
.sp-section .table-wrap { position: relative; }
`;

interface AssistantAction {
  type: 'open_order' | 'open_case' | 'retry_payment' | 'view_tickets';
  ref?: string;
}
interface AssistantReply {
  reply: string;
  actions: AssistantAction[];
  toolCalls: string[];
  verified: boolean;
}
interface Msg {
  id: number;
  from: 'user' | 'assistant' | 'system';
  text: string;
  actions?: AssistantAction[];
  verified?: boolean;
  toolCalls?: string[];
  orderRef?: string;
  signIn?: boolean;
}
interface SupportCase {
  reference: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  order_ref: string | null;
}

const REF_RE = /^EBK-[A-Z0-9]{4,12}$/;
/** Accepts "ebk-ab12cd34", "EBK AB12CD34" or just "AB12CD34". */
function normalizeRef(s: string): string {
  const v = toAsciiDigits(s).toUpperCase().replace(/\s+/g, '');
  if (/^[A-Z0-9]{8}$/.test(v)) return `EBK-${v}`;
  const m = /^EBK-?([A-Z0-9]{4,12})$/.exec(v);
  return m ? `EBK-${m[1]}` : v;
}

const EXTRA_ERRORS: Record<string, [string, string]> = {
  assistant_budget_exceeded: ['وصلت للحد الأقصى من رسائل المساعد لهذه الساعة. حاول لاحقاً، أو افتح صفحة حجزك مباشرة.', 'You reached the assistant message limit for this hour. Try later, or open your order page directly.'],
  auth_required: ['انتهت جلستك. سجّل دخولك مرة ثانية للمتابعة.', 'Your session has ended. Please sign in again to continue.'],
  order_not_found: ['ما لقينا هذا الحجز على حسابك.', 'We could not find this order on your account.'],
};
function errMessage(t: T, errorText: (c: string) => string, e: unknown) {
  const code = e instanceof ApiError ? e.code : 'network_error';
  const m = EXTRA_ERRORS[code];
  return m ? t(m[0], m[1]) : errorText(code);
}

const TOOL_LABEL: Record<string, [string, string]> = {
  get_my_order: ['البحث عن حجزك', 'looked up your order'],
  verify_payment_status: ['التحقق من مزوّد الدفع', 'checked with the payment provider'],
  get_order_status: ['قراءة حالة الحجز', 'read the order status'],
  create_support_case: ['فتح طلب دعم', 'opened a support case'],
};

export default function Support() {
  const { t } = useI18n();
  const { me, loading } = useAuth();
  const [casesKey, setCasesKey] = useState(0);

  return (
    <div className="container page">
      <style>{SP_CSS}</style>
      <header className="stack" style={{ marginBottom: 'var(--s5)' }}>
        <span className="badge badge-gold" style={{ alignSelf: 'flex-start' }}>
          {t('الدعم', 'Support')}
        </span>
        <h1 style={{ margin: 0 }}>{t('مساعد استرجاع الحجوزات', 'Booking Recovery Assistant')}</h1>
        <p className="muted" style={{ maxWidth: 720, margin: 0 }}>
          {t(
            'انسحب المبلغ وما وصلتك التذكرة؟ الدفع معلّق؟ اسأل المساعد ليشرح لك حالة حجزك من سجلاتنا الموثّقة، ويوجّهك للخطوة الصحيحة.',
            'Charged but no ticket? Payment stuck? Ask the assistant to explain your booking status from our verified records and point you to the right next step.',
          )}
        </p>
      </header>

      {loading ? (
        <Loading />
      ) : me ? (
        <>
          <div className="sp-layout">
            <AssistantChat onCaseOpened={() => setCasesKey((k) => k + 1)} />
            <div className="sp-side">
              <OrderLookup />
              <div className="alert alert-info small" role="note">
                <span aria-hidden="true">🛡</span>
                <div>
                  {t(
                    'المساعد يشرح فقط السجلات الموثّقة لحسابك. لا يستطيع إصدار تذاكر أو تعديل المدفوعات أو تنفيذ استرجاع — وعند الحاجة يفتح لك طلب دعم يتابعه فريقنا.',
                    'The assistant only explains verified records on your account. It cannot issue tickets, change payments or refund — when needed it opens a support case for our team.',
                  )}
                </div>
              </div>
            </div>
          </div>
          <SupportCases refreshKey={casesKey} />
        </>
      ) : (
        <div className="card stack" style={{ maxWidth: 720 }}>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>{t('سجّل دخولك للبحث عن حجوزاتك', 'Sign in to look up your bookings')}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {t(
              'المساعد يقرأ حجوزاتك ومدفوعاتك الموثّقة فقط، لذلك نحتاج تسجيل الدخول للتأكد أن الحجز يخصك. لا نعرض بيانات أي حجز بدون تسجيل الدخول.',
              'The assistant reads only your own verified bookings and payments, so you need to sign in first. We never show booking details without signing in.',
            )}
          </p>
          <div>
            <Link className="btn btn-primary" to={`/login?next=${encodeURIComponent('/support')}`}>
              {t('تسجيل الدخول', 'Sign in')}
            </Link>
          </div>
        </div>
      )}

      <PaymentStatusExplainer />
    </div>
  );
}

// ───────────────────────── chat ─────────────────────────
function AssistantChat({ onCaseOpened }: { onCaseOpened: () => void }) {
  const { t, lang, errorText } = useI18n();
  const reduced = useReducedMotion();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [inputErr, setInputErr] = useState<string | null>(null);
  const [refErr, setRefErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [msgs, busy, reduced]);

  const push = (m: Omit<Msg, 'id'>) => setMsgs((cur) => [...cur, { ...m, id: nextId.current++ }]);

  const send = async (raw: string) => {
    if (busy) return;
    const message = raw.trim();
    if (!message) {
      setInputErr(t('اكتب رسالتك أولاً.', 'Type a message first.'));
      inputRef.current?.focus();
      return;
    }
    if (message.length > 1000) {
      setInputErr(t('الرسالة أطول من 1000 حرف.', 'The message is longer than 1000 characters.'));
      return;
    }
    let ref: string | undefined;
    if (orderRef.trim()) {
      const n = normalizeRef(orderRef);
      if (!REF_RE.test(n)) {
        setRefErr(t('صيغة رقم الحجز: EBK-XXXXXXXX', 'Order reference format: EBK-XXXXXXXX'));
        return;
      }
      ref = n;
      setOrderRef(n);
    }
    setInputErr(null);
    setRefErr(null);
    push({ from: 'user', text: message, orderRef: ref });
    setInput('');
    setBusy(true);
    try {
      const r = await api<AssistantReply>('/api/support/assistant', { method: 'POST', body: { message, ...(ref ? { orderRef: ref } : {}) } });
      const actions = Array.isArray(r.actions) ? r.actions : [];
      push({ from: 'assistant', text: r.reply, actions, verified: !!r.verified, toolCalls: Array.isArray(r.toolCalls) ? r.toolCalls : [] });
      if (actions.some((a) => a.type === 'open_case')) onCaseOpened();
    } catch (e) {
      push({ from: 'system', text: errMessage(t, errorText, e), signIn: e instanceof ApiError && e.status === 401 });
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  };

  const chips = [
    'انسحب المبلغ وما طلعت لي التذكرة!',
    "What's the status of my last booking?",
    'الدفع معلّق من فترة، شنو أسوي؟',
    'I want a refund for my booking',
  ];

  const actionEl = (a: AssistantAction, i: number) => {
    if (a.type === 'open_order' && a.ref)
      return (
        <Link key={i} className="btn btn-sm" to={`/orders/${encodeURIComponent(a.ref)}`}>
          {t('عرض الحجز', 'Open order')} <span className="num">{a.ref}</span>
        </Link>
      );
    if (a.type === 'retry_payment' && a.ref)
      return (
        <Link key={i} className="btn btn-primary btn-sm" to={`/orders/${encodeURIComponent(a.ref)}`}>
          {t('إعادة محاولة الدفع من صفحة الحجز', 'Retry payment on the order page')}
        </Link>
      );
    if (a.type === 'view_tickets')
      return (
        <Link key={i} className="btn btn-sm" to="/tickets">
          <span aria-hidden="true">🎟</span> {t('تذاكري', 'My tickets')}
        </Link>
      );
    if (a.type === 'open_case')
      return (
        <span key={i} className="badge badge-info">
          {t('طلب دعم', 'Support case')} <span className="num">{a.ref || '—'}</span>
        </span>
      );
    return null;
  };

  return (
    <section className="card sp-chat" aria-labelledby="sp-chat-title">
      <div className="sp-chat-head">
        <h2 id="sp-chat-title" style={{ margin: 0, fontSize: '1.15rem' }}>
          {t('المحادثة', 'Conversation')}
        </h2>
        <span className="tiny faint">{t('يرد بلغة رسالتك (عربي أو إنجليزي)', 'Replies in the language you write in')}</span>
      </div>

      <div ref={logRef} className="sp-log" role="log" aria-live="polite" aria-relevant="additions" aria-label={t('رسائل المحادثة', 'Conversation messages')} tabIndex={0}>
        <div className="sp-msg assistant">
          <div className="sp-who">{t('المساعد', 'Assistant')}</div>
          <div className="txt">
            {t(
              'مرحباً! أقدر أشرح لك حالة حجزك والدفع من سجلاتنا الموثّقة. اكتب مشكلتك، وأضف رقم الحجز إذا كان عندك.',
              'Hi! I can explain your booking and payment status from our verified records. Describe the issue and add your order reference if you have it.',
            )}
          </div>
        </div>
        {msgs.map((m) => (
          <div key={m.id} className={`sp-msg ${m.from}`}>
            <div className="sp-who">
              {m.from === 'user' ? t('أنت', 'You') : m.from === 'assistant' ? t('المساعد', 'Assistant') : t('تنبيه', 'Notice')}
              {m.orderRef && <span className="num">· {m.orderRef}</span>}
              {m.from === 'assistant' && (m.verified ? <span className="badge badge-ok">✓ {t('من سجلات موثّقة', 'From verified records')}</span> : <span className="badge">{t('معلومة عامة', 'General info')}</span>)}
            </div>
            <div className="txt" dir="auto">
              {m.text}
            </div>
            {m.signIn && (
              <div className="sp-actions">
                <Link className="btn btn-sm" to={`/login?next=${encodeURIComponent('/support')}`}>
                  {t('تسجيل الدخول', 'Sign in')}
                </Link>
              </div>
            )}
            {m.actions && m.actions.length > 0 && <div className="sp-actions">{m.actions.map(actionEl)}</div>}
            {m.toolCalls && m.toolCalls.length > 0 && (
              <div className="sp-tools">
                {t('ما تم التحقق منه: ', 'What I checked: ')}
                {m.toolCalls.map((c) => (TOOL_LABEL[c] ? (lang === 'ar' ? TOOL_LABEL[c][0] : TOOL_LABEL[c][1]) : c)).join(t('، ', ', '))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="sp-typing">
            {t('المساعد يتحقق من سجلاتك…', 'The assistant is checking your records…')}
          </div>
        )}
      </div>

      <form className="sp-compose" onSubmit={onSubmit} noValidate>
        <div className="sp-chips" role="group" aria-label={t('أمثلة جاهزة', 'Example questions')}>
          {chips.map((c) => (
            <button key={c} type="button" className="sp-chip" dir="auto" onClick={() => void send(c)} disabled={busy}>
              {c}
            </button>
          ))}
        </div>
        <div className="sp-compose-row">
          <div className="field">
            <label htmlFor="sp-message">{t('رسالتك', 'Your message')}</label>
            <textarea
              ref={inputRef}
              id="sp-message"
              className="input"
              rows={2}
              maxLength={1000}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (inputErr) setInputErr(null);
              }}
              onKeyDown={onKey}
              dir="auto"
              aria-invalid={!!inputErr}
              aria-describedby={`sp-message-hint${inputErr ? ' sp-message-err' : ''}`}
              style={{ minHeight: 64 }}
            />
            <span id="sp-message-hint" className="hint">
              {t('Enter للإرسال، Shift+Enter لسطر جديد.', 'Enter to send, Shift+Enter for a new line.')} <span className="num">{input.length}/1000</span>
            </span>
            {inputErr && (
              <span id="sp-message-err" className="error" role="alert">
                {inputErr}
              </span>
            )}
          </div>
          <TextInput
            label={t('رقم الحجز (اختياري)', 'Order reference (optional)')}
            value={orderRef}
            onChange={(e) => {
              setOrderRef(e.target.value);
              if (refErr) setRefErr(null);
            }}
            placeholder="EBK-XXXXXXXX"
            dir="ltr"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            error={refErr}
          />
        </div>
        <div className="row between">
          <span className="tiny faint">{t('لا تشارك كلمات المرور أو بيانات البطاقة في المحادثة.', 'Never share passwords or card details in the chat.')}</span>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? t('جاري الإرسال…', 'Sending…') : t('إرسال', 'Send')}
          </button>
        </div>
      </form>
    </section>
  );
}

// ───────────────────────── order lookup ─────────────────────────
function OrderLookup() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [ref, setRef] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = normalizeRef(ref);
    if (!REF_RE.test(n)) {
      setErr(t('أدخل رقم حجز بصيغة EBK-XXXXXXXX.', 'Enter a reference in the format EBK-XXXXXXXX.'));
      return;
    }
    nav(`/orders/${encodeURIComponent(n)}`);
  };
  return (
    <form className="card card-tight stack" onSubmit={submit} aria-labelledby="sp-lookup-title" noValidate>
      <h2 id="sp-lookup-title" style={{ margin: 0, fontSize: '1.1rem' }}>
        {t('البحث عن حجز', 'Look up an order')}
      </h2>
      <TextInput
        label={t('رقم الحجز', 'Order reference')}
        value={ref}
        onChange={(e) => {
          setRef(e.target.value);
          if (err) setErr(null);
        }}
        placeholder="EBK-XXXXXXXX"
        dir="ltr"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={20}
        hint={t('تجده في رسالة التأكيد أو في «حجوزاتي».', 'Find it in your confirmation or under “My Bookings”.')}
        error={err}
      />
      <div className="row">
        <button className="btn btn-primary btn-sm">{t('فتح الحجز', 'Open order')}</button>
        <Link className="btn btn-ghost btn-sm" to="/bookings">
          {t('حجوزاتي', 'My Bookings')}
        </Link>
      </div>
    </form>
  );
}

// ───────────────────────── cases ─────────────────────────
const CATEGORY: Record<string, [string, string]> = {
  general: ['عام', 'General'],
  payment: ['الدفع', 'Payment'],
  reconciliation: ['مطابقة الدفع', 'Reconciliation'],
  ticket: ['التذاكر', 'Tickets'],
  exhibition: ['المعارض', 'Exhibitions'],
  quick_event: ['Quick Event', 'Quick Event'],
};
const PRIORITY: Record<string, [string, string, string]> = {
  low: ['منخفضة', 'Low', ''],
  normal: ['عادية', 'Normal', 'badge-info'],
  high: ['مرتفعة', 'High', 'badge-warn'],
  urgent: ['عاجلة', 'Urgent', 'badge-danger'],
};

function SupportCases({ refreshKey }: { refreshKey: number }) {
  const { t, date } = useI18n();
  const { data, error, loading, reload } = useApi<SupportCase[]>('/api/support/cases', [refreshKey]);
  const label = (m: Record<string, [string, string, ...string[]]>, k: string) => (m[k] ? t(m[k][0], m[k][1]) : k);
  return (
    <section className="sp-section" aria-labelledby="sp-cases-title">
      <div className="row between">
        <h2 id="sp-cases-title" style={{ margin: 0 }}>
          {t('طلبات الدعم الخاصة بي', 'My support cases')}
        </h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}>
          {loading ? t('جاري التحديث…', 'Refreshing…') : t('تحديث', 'Refresh')}
        </button>
      </div>
      <div style={{ marginTop: 'var(--s3)' }}>
        {loading && !data ? (
          <Loading />
        ) : error && !data ? (
          <ErrorBox error={error} onRetry={reload} />
        ) : !data || data.length === 0 ? (
          <Empty title={t('لا توجد طلبات دعم', 'No support cases')}>{t('عندما يفتح المساعد أو فريقنا طلب دعم لك سيظهر هنا.', 'When the assistant or our team opens a case for you, it appears here.')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">{t('طلبات الدعم وحالتها', 'Support cases and their status')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('المرجع', 'Reference')}</th>
                  <th scope="col">{t('الموضوع', 'Subject')}</th>
                  <th scope="col">{t('الفئة', 'Category')}</th>
                  <th scope="col">{t('الأولوية', 'Priority')}</th>
                  <th scope="col">{t('الحالة', 'Status')}</th>
                  <th scope="col">{t('الحجز', 'Order')}</th>
                  <th scope="col">{t('التاريخ', 'Opened')}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.reference}>
                    <td className="num">{c.reference}</td>
                    <td style={{ whiteSpace: 'normal', minWidth: 160 }} dir="auto">
                      {c.subject}
                    </td>
                    <td>{label(CATEGORY, c.category)}</td>
                    <td>
                      <span className={`badge ${PRIORITY[c.priority]?.[2] ?? ''}`}>{label(PRIORITY, c.priority)}</span>
                    </td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td>
                      {c.order_ref ? (
                        <Link to={`/orders/${encodeURIComponent(c.order_ref)}`} className="num">
                          {c.order_ref}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{date(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ───────────────────────── payment status explainer ─────────────────────────
function PaymentStatusExplainer() {
  const { t } = useI18n();
  const items: { status: string; ar: string; en: string }[] = [
    {
      status: 'confirmed',
      ar: 'تحقق مزوّد الدفع من العملية وصدرت تذاكرك، وتجدها في «تذاكري». لا تحتاج أي إجراء آخر.',
      en: 'The payment provider verified the payment and your tickets were issued — find them in “My Tickets”. Nothing else is needed.',
    },
    {
      status: 'payment_processing',
      ar: 'ننتظر تأكيد مزوّد الدفع. لا تدفع مرة ثانية: إذا تأكد الدفع تصدر تذاكرك تلقائياً، وإذا فشل لا يوجد خصم متحقق منه. الحالة تتحدث تلقائياً.',
      en: 'We are waiting for the payment provider to confirm. Do not pay again: if the payment is confirmed your tickets are issued automatically, and if it fails there is no verified charge. The status updates automatically.',
    },
    {
      status: 'payment_failed',
      ar: 'أبلغنا مزوّد الدفع بفشل العملية، فلا يوجد خصم متحقق منه. يمكنك المحاولة مرة أخرى من صفحة الحجز ما دامت مدة حجز المقاعد سارية.',
      en: 'The payment provider reported the payment as failed, so there is no verified charge. You can retry from the order page while your seat hold is still active.',
    },
    {
      status: 'reconciliation_required',
      ar: 'وصلنا الدفع لكن تعذّر إصدار التذاكر (مثلاً انتهت مدة الحجز المؤقت). لا نصدر تذكرة غير صحيحة؛ يُفتح طلب دعم عاجل ويعرض عليك فريقنا مقاعد بديلة أو استرجاعاً كاملاً بعد التحقق.',
      en: 'We received the payment but could not issue the tickets (e.g. the seat hold had expired). We never issue an invalid ticket; an urgent support case is opened and our team offers alternative seats or a full refund after verification.',
    },
    {
      status: 'refunded',
      ar: 'تم استرجاع المبلغ وتأكيده من مزوّد الدفع. قد يستغرق ظهوره في حسابك بضعة أيام حسب البنك.',
      en: 'The amount was refunded and the refund is confirmed by the payment provider. It may take a few days to appear on your account, depending on your bank.',
    },
  ];
  return (
    <section className="sp-section" aria-labelledby="sp-explain-title">
      <h2 id="sp-explain-title">{t('ماذا تعني حالة الدفع؟', 'What does my payment status mean?')}</h2>
      <div className="alert alert-warn" role="note" style={{ marginBottom: 'var(--s4)' }}>
        <span aria-hidden="true">⚠</span>
        <div>
          <strong>{t('لا تدفع مرتين أثناء التحقق. ', 'Never pay twice while verification is pending. ')}</strong>
          {t('إذا كانت الحالة «قيد التحقق من الدفع»، انتظر تحديثها أو اسأل المساعد — الدفع المكرر يسبب خصماً إضافياً يحتاج استرجاعاً.', 'If the status is “Verifying payment”, wait for it to update or ask the assistant — a duplicate payment causes an extra charge that then needs a refund.')}
        </div>
      </div>
      <div className="sp-acc">
        {items.map((it) => (
          <details key={it.status}>
            <summary>
              <StatusBadge status={it.status} />
            </summary>
            <div className="body">{t(it.ar, it.en)}</div>
          </details>
        ))}
      </div>
    </section>
  );
}

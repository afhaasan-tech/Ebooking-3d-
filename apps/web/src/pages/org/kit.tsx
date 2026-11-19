/**
 * Shared building blocks for the organizer (/org) and platform admin (/admin) portals.
 *
 * Money stays integer fils end to end: KWD inputs are parsed from strings ("12.500" → 12500)
 * by the pure helpers in ./parse — never through floating point.
 */
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { DemoTag, Loading } from '../../ui/components';
import { bpsToPercent, shortId, toFils } from './parse';
import type { AuditRow } from './types';

export {
  bpsToPercent,
  filsToKwd,
  isEmail,
  kuwaitLocalToIso,
  kuwaitNowLocal,
  normalizeNumeric,
  parseIntStrict,
  parseKwd,
  parsePercentToBps,
  shortId,
  toFils,
} from './parse';

// ───────────────────────── formatting ─────────────────────────

const INT = new Intl.NumberFormat('en-US');

/** Render-safe formatters (never throw on unexpected API values). */
export function useFmt() {
  const { money, date } = useI18n();
  return useMemo(() => {
    const safeDate = (v: unknown, o?: Intl.DateTimeFormatOptions) => {
      if (v == null || v === '') return '—';
      const d = new Date(String(v));
      if (Number.isNaN(d.getTime())) return String(v);
      try {
        return date(d.toISOString(), o);
      } catch {
        return String(v);
      }
    };
    return {
      /** amounts (totals, fees): invalid → "—" */
      amount: (v: unknown) => {
        const n = toFils(v);
        return n == null ? '—' : money(n);
      },
      /** prices: null → "Price on Request" */
      price: (v: unknown) => {
        if (v == null) return money(null);
        const n = toFils(v);
        return n == null ? '—' : money(n);
      },
      int: (v: unknown) => {
        if (v == null) return '—';
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? INT.format(n) : '—';
      },
      when: (v: unknown) => safeDate(v),
      whenFull: (v: unknown) => safeDate(v, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      day: (v: unknown) => safeDate(v, { day: 'numeric', month: 'short', year: 'numeric' }),
      time: (v: unknown) => safeDate(v, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      pct: (bps: number | null | undefined) => (bps == null ? '—' : `${bpsToPercent(bps)}%`),
    };
  }, [money, date]);
}

const CATEGORY: Record<string, [string, string]> = {
  theatre: ['مسرح', 'Theatre'],
  concert: ['حفل موسيقي', 'Concert'],
  comedy: ['كوميديا', 'Comedy'],
  workshop: ['ورشة عمل', 'Workshop'],
  conference: ['مؤتمر', 'Conference'],
  family: ['عائلي', 'Family'],
  exhibition: ['معرض', 'Exhibition'],
};
const INVENTORY: Record<string, [string, string]> = {
  assigned_seat: ['مقاعد مرقّمة', 'Reserved seating'],
  general_admission: ['دخول عام', 'General admission'],
  exhibition_booth: ['بوثات معرض', 'Exhibition booths'],
  time_slot: ['جلسات بمواعيد', 'Timed sessions'],
};
const ROLE: Record<string, [string, string]> = { owner: ['مالك', 'Owner'], manager: ['مدير', 'Manager'], staff: ['موظف', 'Staff'] };
const PERF: Record<string, [string, string]> = {
  scheduled: ['مجدول', 'Scheduled'],
  on_sale: ['متاح للبيع', 'On sale'],
  sold_out: ['نفدت التذاكر', 'Sold out'],
  cancelled: ['ملغي', 'Cancelled'],
  ended: ['انتهى', 'Ended'],
};
const SEAT: Record<string, [string, string]> = { available: ['متاح', 'Available'], held: ['محجوز مؤقتاً', 'Held'], sold: ['مُباع', 'Sold'], blocked: ['مقفل', 'Blocked'] };

/** Localised labels for enum-like API values (unknown values fall back to a readable code). */
export function useLabels() {
  const { lang } = useI18n();
  return useMemo(() => {
    const from = (m: Record<string, [string, string]>) => (k: string | null | undefined) => {
      if (!k) return '—';
      const v = m[k];
      return v ? (lang === 'ar' ? v[0] : v[1]) : k.replace(/_/g, ' ');
    };
    return { category: from(CATEGORY), inventory: from(INVENTORY), role: from(ROLE), perf: from(PERF), seat: from(SEAT) };
  }, [lang]);
}

const TONES: Record<string, [string, string, string]> = {
  trial: ['فترة تجريبية', 'Trial', 'badge-info'],
  active: ['فعّال', 'Active', 'badge-ok'],
  past_due: ['متأخر السداد', 'Past due', 'badge-danger'],
  cancelled: ['ملغي', 'Cancelled', ''],
  suspended: ['موقوف', 'Suspended', 'badge-danger'],
  pending: ['قيد المراجعة', 'Pending', 'badge-warn'],
  low: ['منخفضة', 'Low', ''],
  normal: ['عادية', 'Normal', 'badge-info'],
  high: ['عالية', 'High', 'badge-warn'],
  urgent: ['عاجلة', 'Urgent', 'badge-danger'],
  owner: ['مالك', 'Owner', 'badge-gold'],
  manager: ['مدير', 'Manager', 'badge-info'],
  staff: ['موظف', 'Staff', ''],
};

/** Badge for subscription / organization / priority / role values (StatusBadge covers order-like statuses). */
export function ToneBadge({ value }: { value: string | null | undefined }) {
  const { lang } = useI18n();
  if (!value) return <span className="badge">—</span>;
  const s = TONES[value];
  return <span className={`badge ${s?.[2] ?? ''}`}>{s ? (lang === 'ar' ? s[0] : s[1]) : value.replace(/_/g, ' ')}</span>;
}

// ───────────────────────── errors & async state ─────────────────────────

const PORTAL_ERRORS: Record<string, [string, string]> = {
  booth_already_allocated: ['هذا البوث تم تخصيصه لعارض آخر.', 'This booth has already been allocated to another exhibitor.'],
  request_already_decided: ['تم البتّ في هذا الطلب مسبقاً. حدّثنا القائمة.', 'This request was already decided. The list has been refreshed.'],
  booth_not_available: ['البوث غير متاح حالياً، لذلك لا يمكن قبول الطلب.', 'The booth is not available, so the request cannot be approved.'],
  user_not_found: ['ما فيه حساب مسجّل بهذا البريد. اطلب من الشخص التسجيل أولاً ثم أضفه.', 'No account uses this email. Ask them to register first, then add them.'],
  event_not_found: ['الفعالية غير موجودة ضمن هذه المنظمة.', 'Event not found in this organization.'],
  category_not_found: ['فئة التذاكر غير موجودة.', 'Ticket category not found.'],
  booth_not_found: ['البوث غير موجود.', 'Booth not found.'],
  request_not_found: ['الطلب غير موجود.', 'Request not found.'],
  performance_not_found: ['العرض غير موجود.', 'Performance not found.'],
  exhibition_not_found: ['المعرض غير منشور بعد أو غير موجود.', 'The exhibition is not published yet or does not exist.'],
  order_not_found: ['الطلب غير موجود.', 'Order not found.'],
  case_not_found: ['حالة الدعم غير موجودة.', 'Support case not found.'],
  event_not_pending: ['الفعالية لم تعد بانتظار الموافقة (ربما تم البتّ فيها). حدّثنا القائمة.', 'This event is no longer pending approval. The list has been refreshed.'],
  invalid_transition: ['هذا التغيير غير مسموح من الحالة الحالية. حدّثنا القائمة.', 'That status change is not allowed from the current status. The list has been refreshed.'],
  no_verified_payment: ['ما فيه دفعة ناجحة مؤكدة لهذا الطلب.', 'There is no verified successful payment for this order.'],
  provider_status_not_verified: ['مزوّد الدفع لم يؤكد حالة الدفع، ولم يتم أي استرجاع.', 'The payment provider did not verify the payment; no refund was issued.'],
  refund_not_confirmed: ['مزوّد الدفع لم يؤكد الاسترجاع. لم يتغيّر شيء — حاول لاحقاً.', 'The provider did not confirm the refund. Nothing changed — try again later.'],
  internal_error: ['صار خطأ في الخادم. حاول مرة ثانية.', 'Server error. Please try again.'],
};

export function useErrorText() {
  const { lang, errorText } = useI18n();
  return useCallback(
    (e: ApiError | Error | null | undefined) => {
      if (!e) return '';
      const code = (e as ApiError).code ?? 'error';
      const m = PORTAL_ERRORS[code];
      return m ? (lang === 'ar' ? m[0] : m[1]) : errorText(code);
    },
    [lang, errorText],
  );
}

export function ApiErrorAlert({ error, onRetry }: { error: ApiError | Error | null | undefined; onRetry?: () => void }) {
  const { t } = useI18n();
  const text = useErrorText();
  const loc = useLocation();
  if (!error) return null;
  const signedOut = (error as ApiError).status === 401;
  return (
    <div className="alert alert-danger" role="alert">
      <span aria-hidden>⚠</span>
      <div className="spacer">{text(error)}</div>
      {signedOut && (
        <Link className="btn btn-sm" to={`/login?next=${encodeURIComponent(loc.pathname)}`}>
          {t('تسجيل الدخول', 'Sign in')}
        </Link>
      )}
      {onRetry && !signedOut && (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          {t('إعادة المحاولة', 'Retry')}
        </button>
      )}
    </div>
  );
}

/** Mutation helper: busy flag + typed ApiError. run() resolves to null on failure. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'network_error'));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);
  return { run, busy, error, setError };
}

export function RoleNotice({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="alert alert-info" role="note">
      <span aria-hidden>🔒</span>
      <div>{children ?? t('هذا القسم متاح لمالك المنظمة والمدراء فقط.', 'This section is available to the organization owner and managers only.')}</div>
    </div>
  );
}

export function DemoNotice({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="alert alert-warn" role="note">
      <DemoTag />
      <div>
        {children ??
          t(
            'بيانات تجريبية: كل الأرقام هنا ناتجة عن مبيعات تجريبية خيالية ولا تمثّل إيرادات حقيقية.',
            'Demo data: every figure here comes from fictional demo sales and does not represent real revenue.',
          )}
      </div>
    </div>
  );
}

export function Flash({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="alert alert-ok" role="status">
      <span aria-hidden>✓</span>
      <div className="spacer">{children}</div>
      {onClose && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label={t('إغلاق الرسالة', 'Dismiss message')}>
          ✕
        </button>
      )}
    </div>
  );
}

export interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/** Loading / error / 403 handling around a useApi() result. Stale data stays visible while refreshing. */
export function Async<T>({ state, children, forbidden }: { state: AsyncState<T>; children: (data: T) => ReactNode; forbidden?: ReactNode }) {
  const { t } = useI18n();
  if (state.data == null) {
    if (state.error) return state.error.status === 403 ? <RoleNotice>{forbidden}</RoleNotice> : <ApiErrorAlert error={state.error} onRetry={state.reload} />;
    return <Loading />;
  }
  return (
    <>
      {state.error && <ApiErrorAlert error={state.error} onRetry={state.reload} />}
      {state.loading && (
        <p className="tiny faint" role="status" style={{ margin: 0 }}>
          {t('جاري التحديث…', 'Updating…')}
        </p>
      )}
      {children(state.data)}
    </>
  );
}

export function RefreshButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  const { t } = useI18n();
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={onClick} disabled={busy}>
      <span aria-hidden>↻</span> {t('تحديث', 'Refresh')}
    </button>
  );
}

// ───────────────────────── layout pieces ─────────────────────────

/** Moves focus to an element (e.g. a heading with tabIndex={-1}) when a sub-view opens. */
export function useFocusOnMount<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (enabled) ref.current?.focus();
  }, [enabled]);
  return ref;
}

/**
 * WAI-ARIA tabs with manual activation: arrow keys move focus in the reading direction (RTL aware),
 * Home/End jump, Enter/Space opens the tab. Manual activation avoids loading every panel while
 * arrowing past it (and avoids the check-in scanner input stealing focus from the tab list).
 */
export function TabBar<K extends string>({ tabs, active, onChange, label, idPrefix }: { tabs: { key: K; label: string }[]; active: K; onChange: (k: K) => void; label: string; idPrefix: string }) {
  const { dir } = useI18n();
  const refs = useRef<Partial<Record<K, HTMLButtonElement | null>>>({});
  const listRef = useRef<HTMLDivElement>(null);

  // On narrow screens the tab strip scrolls horizontally: keep the selected tab visible
  // (e.g. a deep link to /org/checkin). Only the strip scrolls — never the page. Works in RTL too:
  // lowering scrollLeft always reveals content on the left.
  useEffect(() => {
    const list = listRef.current;
    const tab = refs.current[active];
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    const l = list.getBoundingClientRect();
    const r = tab.getBoundingClientRect();
    if (r.left < l.left) list.scrollLeft -= l.left - r.left + 24;
    else if (r.right > l.right) list.scrollLeft += r.right - l.right + 24;
  }, [active, dir]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const focused = tabs.findIndex((x) => refs.current[x.key] === document.activeElement);
    const i = focused >= 0 ? focused : Math.max(0, tabs.findIndex((x) => x.key === active));
    const next = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const prev = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    let n: number;
    if (e.key === next) n = (i + 1) % tabs.length;
    else if (e.key === prev) n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = tabs.length - 1;
    else return;
    e.preventDefault();
    refs.current[tabs[n].key]?.focus();
  };
  return (
    <div ref={listRef} className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((x) => (
        <button
          key={x.key}
          ref={(el) => {
            refs.current[x.key] = el;
          }}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${x.key}`}
          aria-selected={x.key === active}
          aria-controls={`${idPrefix}-panel`}
          tabIndex={x.key === active ? 0 : -1}
          onClick={() => onChange(x.key)}
        >
          {x.label}
        </button>
      ))}
    </div>
  );
}

export interface BarItem {
  key: string;
  label: string;
  value: number;
  display: string;
  sub?: string;
}

/** Accessible horizontal bars (pure CSS). Text carries the data; the bar itself is decorative. */
export function BarList({ title, items, empty, note }: { title: string; items: BarItem[]; empty: string; note?: string }) {
  const id = useId();
  const max = items.reduce((m, i) => Math.max(m, i.value), 0);
  return (
    <section className="card card-tight" aria-labelledby={id} style={{ minWidth: 0 }}>
      <h3 id={id}>{title}</h3>
      {note && <p className="tiny faint">{note}</p>}
      {items.length === 0 || max <= 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          {empty}
        </p>
      ) : (
        // minmax(0, 1fr): an implicit auto column would grow to the nowrap label and defeat the ellipsis
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
          {items.map((i) => {
            const pct = i.value > 0 ? Math.max(2, (i.value / max) * 100) : 0;
            return (
              <li key={i.key} style={{ minWidth: 0 }}>
                <div className="row between small" style={{ gap: 8, flexWrap: 'nowrap' }}>
                  <span title={i.label} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i.label}
                  </span>
                  <span className="num" style={{ flexShrink: 0 }}>
                    {i.display}
                  </span>
                </div>
                <div aria-hidden style={{ height: 8, marginTop: 4, background: 'var(--bg-2)', border: '1px solid var(--line-soft)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--gold)', borderRadius: 999 }} />
                </div>
                {i.sub && <div className="tiny faint">{i.sub}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Two-column definition list that wraps nicely on small screens. */
export function DL({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, max-content) minmax(0, 1fr)', gap: '6px 16px', margin: 0 }}>
      {items.map(([k, v], i) => (
        <Fragment key={i}>
          <dt className="muted small">{k}</dt>
          <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/**
 * Truncates a long single-line value inside a nowrap table cell. dir="auto" isolates free text
 * (e.g. an English company name ending in "?" or "." inside the Arabic UI) so punctuation stays put.
 */
export function Clip({ text, max = 280, ltr }: { text: string; max?: number; ltr?: boolean }) {
  return (
    <span title={text} dir={ltr ? 'ltr' : 'auto'} style={{ display: 'inline-block', maxWidth: max, overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom' }}>
      {text}
    </span>
  );
}

function compactJson(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && Object.keys(v as object).length === 0) return '';
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function AuditTable({ rows, showActor }: { rows: AuditRow[]; showActor?: boolean }) {
  const { t } = useI18n();
  const f = useFmt();
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="sr-only">{t('سجل التدقيق', 'Audit log')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('الوقت', 'Time')}</th>
            {showActor && <th scope="col">{t('المنفّذ', 'Actor')}</th>}
            <th scope="col">{t('الإجراء', 'Action')}</th>
            <th scope="col">{t('العنصر', 'Entity')}</th>
            <th scope="col">{t('المعرّف', 'ID')}</th>
            <th scope="col">{t('التفاصيل', 'Details')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const details = compactJson(r.details);
            return (
              <tr key={`${r.created_at}-${i}`}>
                <td>{f.whenFull(r.created_at)}</td>
                {showActor && <td>{r.actor ?? <span className="faint">{t('النظام', 'System')}</span>}</td>}
                <td>
                  <code className="kbd" dir="ltr">
                    {r.action}
                  </code>
                </td>
                <td dir="ltr" style={{ textAlign: 'start' }}>
                  {r.entity}
                </td>
                <td>
                  <span className="num tiny" title={r.entity_id ?? ''}>
                    {shortId(r.entity_id)}
                  </span>
                </td>
                <td className="tiny">{details ? <Clip text={details} max={360} ltr /> : <span className="faint">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Radio group styled with the shared `.choice` class. */
export function ChoiceGroup<V extends string>({ legend, name, value, onChange, options, hint }: { legend: string; name: string; value: V; onChange: (v: V) => void; options: { value: V; label: string }[]; hint?: string }) {
  const hintId = useId();
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} aria-describedby={hint ? hintId : undefined}>
      <legend style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--ivory)', marginBottom: 6, padding: 0 }}>{legend}</legend>
      <div className="choice">
        {options.map((o) => (
          <label key={o.value}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {hint && (
        <span id={hintId} className="tiny faint">
          {hint}
        </span>
      )}
    </fieldset>
  );
}

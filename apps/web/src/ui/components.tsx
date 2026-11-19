import { useId, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useI18n } from '../lib/i18n';
import { LoadingLogo } from './Logo';
import type { ApiError } from '../lib/api';

export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string | null; children: (id: string, describedBy?: string) => ReactNode; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  const describedBy = [hint ? `${fid}-hint` : '', error ? `${fid}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      {children(fid, describedBy)}
      {hint && <span id={`${fid}-hint`} className="hint">{hint}</span>}
      {error && <span id={`${fid}-err`} className="error" role="alert">{error}</span>}
    </div>
  );
}

export function TextInput({ label, hint, error, ...rest }: { label: string; hint?: string; error?: string | null } & InputHTMLAttributes<HTMLInputElement>) {
  return <Field label={label} hint={hint} error={error}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!error} className="input" {...rest} />}</Field>;
}

export function SelectInput({ label, hint, error, children, ...rest }: { label: string; hint?: string; error?: string | null; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return <Field label={label} hint={hint} error={error}>{(id, d) => <select id={id} aria-describedby={d} className="input" {...rest}>{children}</select>}</Field>;
}

export function TextArea({ label, hint, error, ...rest }: { label: string; hint?: string; error?: string | null } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <Field label={label} hint={hint} error={error}>{(id, d) => <textarea id={id} aria-describedby={d} className="input" {...rest} />}</Field>;
}

export function Loading({ label }: { label?: string }) {
  const { t } = useI18n();
  return <LoadingLogo label={label ?? t('جاري التحميل…', 'Loading…')} />;
}

export function ErrorBox({ error, onRetry }: { error: ApiError | Error | null; onRetry?: () => void }) {
  const { t, errorText } = useI18n();
  if (!error) return null;
  return (
    <div className="alert alert-danger" role="alert">
      <span aria-hidden>⚠</span>
      <div className="spacer">{errorText((error as ApiError).code ?? 'error')}</div>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>{t('إعادة المحاولة', 'Retry')}</button>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 48 }}>
      <h3>{title}</h3>
      <div className="muted">{children}</div>
    </div>
  );
}

export function DemoTag() {
  const { t } = useI18n();
  return <span className="badge badge-warn" title={t('بيانات تجريبية خيالية', 'Fictional demo data')}>{t('تجريبي', 'DEMO')}</span>;
}

const ORDER_STATUS: Record<string, [string, string, string]> = {
  confirmed: ['مؤكد', 'Confirmed', 'badge-ok'],
  payment_processing: ['قيد التحقق من الدفع', 'Verifying payment', 'badge-warn'],
  pending_payment: ['بانتظار الدفع', 'Awaiting payment', 'badge-warn'],
  payment_failed: ['فشل الدفع', 'Payment failed', 'badge-danger'],
  expired: ['منتهي', 'Expired', ''],
  reconciliation_required: ['يحتاج مراجعة', 'Needs reconciliation', 'badge-danger'],
  refunded: ['مسترجع', 'Refunded', 'badge-info'],
  cancelled: ['ملغي', 'Cancelled', ''],
  // generic statuses reused across booths / quotes / quick events
  pending: ['قيد المراجعة', 'Pending', 'badge-warn'],
  approved: ['مقبول', 'Approved', 'badge-ok'],
  rejected: ['مرفوض', 'Rejected', 'badge-danger'],
  withdrawn: ['مسحوب', 'Withdrawn', ''],
  submitted: ['مُرسل', 'Submitted', 'badge-info'],
  under_review: ['قيد المراجعة', 'Under review', 'badge-warn'],
  quoted: ['تم إرسال عرض سعر', 'Quoted', 'badge-gold'],
  quote_accepted: ['تم قبول العرض', 'Quote accepted', 'badge-ok'],
  quote_declined: ['تم رفض العرض', 'Quote declined', 'badge-danger'],
  configuring: ['قيد الإعداد', 'Configuring', 'badge-info'],
  live: ['منشور', 'Live', 'badge-ok'],
  sent: ['مُرسل', 'Sent', 'badge-gold'],
  accepted: ['مقبول', 'Accepted', 'badge-ok'],
  declined: ['مرفوض', 'Declined', 'badge-danger'],
  open: ['مفتوح', 'Open', 'badge-warn'],
  escalated: ['مُصعّد', 'Escalated', 'badge-danger'],
  resolved: ['محلول', 'Resolved', 'badge-ok'],
  published: ['منشور', 'Published', 'badge-ok'],
  pending_approval: ['بانتظار الموافقة', 'Pending approval', 'badge-warn'],
  draft: ['مسودة', 'Draft', ''],
  available: ['متاح', 'Available', 'badge-ok'],
  booked: ['محجوز', 'Booked', 'badge-danger'],
  held: ['محجوز مؤقتاً', 'Held', 'badge-warn'],
  unavailable: ['غير متاح', 'Unavailable', ''],
  trial: ['فترة تجريبية', 'Trial', 'badge-info'],
  active: ['فعّال', 'Active', 'badge-ok'],
  past_due: ['متأخر السداد', 'Past due', 'badge-danger'],
  suspended: ['موقوف', 'Suspended', 'badge-danger'],
  valid: ['صالحة (تجريبية)', 'Valid (demo)', 'badge-ok'],
  used: ['مستخدمة', 'Used', 'badge-info'],
  void: ['ملغاة', 'Void', 'badge-danger'],
};

export function StatusBadge({ status }: { status: string }) {
  const { lang } = useI18n();
  const s = ORDER_STATUS[status];
  return <span className={`badge ${s?.[2] ?? ''}`}>{s ? (lang === 'ar' ? s[0] : s[1]) : status}</span>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value num">{value}</div>
      {sub && <div className="tiny faint">{sub}</div>}
    </div>
  );
}

/** Decorative QR-style illustration for DEMO tickets (encodes nothing; not valid for admission). */
export function DemoQr({ seed, size = 120 }: { seed: string; size?: number }) {
  const n = 21;
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const cells: ReactNode[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const finder = (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
      let on: boolean;
      if (finder) {
        const fx = x >= n - 7 ? x - (n - 7) : x;
        const fy = y >= n - 7 ? y - (n - 7) : y;
        on = fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4);
      } else {
        h = Math.imul(h ^ (x * 31 + y), 16777619);
        on = (h >>> 7) % 2 === 0;
      }
      if (on) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
    }
  return (
    <svg width={size} height={size} viewBox={`-1 -1 ${n + 2} ${n + 2}`} role="img" aria-label="Decorative demo QR" style={{ background: '#f3ead8', borderRadius: 8 }}>
      <g fill="#121014">{cells}</g>
    </svg>
  );
}

import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { Empty, StatusBadge } from '../../ui/components';
import { ApiErrorAlert, Async, RefreshButton, ToneBadge, useAction, useFmt } from '../org/kit';
import type { SupportCase } from './types';

const CATEGORY: Record<string, [string, string]> = {
  general: ['عام', 'General'],
  payment: ['الدفع', 'Payment'],
  reconciliation: ['مطابقة الدفع', 'Reconciliation'],
  ticket: ['التذاكر', 'Tickets'],
  exhibition: ['المعارض', 'Exhibitions'],
  quick_event: ['Quick Event', 'Quick Event'],
};

/** Subjects the backend writes itself (services/booking.ts, ai/support.ts) — shown localized. */
const SYSTEM_SUBJECTS: Record<string, [string, string]> = {
  'Payment verified but seats could not be allocated': ['تأكد الدفع لكن تعذّر تخصيص المقاعد', 'Payment verified but seats could not be allocated'],
  'Duplicate successful charge detected — refund required after verification': ['خصم ناجح مكرر — يلزم الاسترجاع بعد التحقق', 'Duplicate successful charge detected — refund required after verification'],
  'Refund request': ['طلب استرجاع', 'Refund request'],
  'Payment verification delayed': ['تأخر التحقق من الدفع', 'Payment verification delayed'],
};

/** Outcomes of POST /api/admin/orders/:ref/retry-confirm → [ar, en, ok?] */
const RETRY: Record<string, [string, string, boolean]> = {
  confirmed: ['تم تخصيص المقاعد وتأكيد الطلب.', 'Seats allocated — the order is now confirmed.', true],
  already_confirmed: ['الطلب مؤكد مسبقاً.', 'The order was already confirmed.', true],
  reconciliation_required: ['ما زال تخصيص المقاعد غير ممكن (قد تكون بيعت). فكّر بالاسترجاع بعد التحقق.', 'Seats still cannot be allocated (they may have been sold). Consider a refund after verification.', false],
  not_confirmable: ['الطلب ملغي أو مسترجع ولا يمكن تأكيده.', 'The order is cancelled or refunded and cannot be confirmed.', false],
  payment_not_verified: ['لم يتم التحقق من الدفع بعد.', 'The payment has not been verified yet.', false],
  duplicate_charge_escalated: ['تم اكتشاف خصم مكرر وتصعيده — يحتاج استرجاعاً بعد التحقق.', 'A duplicate charge was detected and escalated — it needs a refund after verification.', false],
  payment_not_found: ['لم يتم العثور على الدفعة.', 'The payment was not found.', false],
};

export default function SupportCases() {
  const { t } = useI18n();
  const list = useApi<SupportCase[]>('/api/admin/support-cases');
  const [hideResolved, setHideResolved] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  // the outcome is shown above the list; bring it into view (actions may be far down the page)
  useEffect(() => {
    if (message) messageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [message]);

  return (
    <>
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t('الدعم والمطابقة', 'Support & reconciliation')}</h2>
        <RefreshButton onClick={list.reload} busy={list.loading} />
      </div>
      <div className="alert alert-info" role="note">
        <span aria-hidden>ℹ</span>
        <div className="small">
          {t(
            '«يحتاج مطابقة» يعني أن الدفع تأكد لكن المقاعد لم تُخصص. جرّب «إعادة التخصيص» أولاً؛ إذا ما زالت غير متاحة، استرجع المبلغ — الاسترجاع يتم فقط بعد التحقق من حالة الدفع لدى مزوّد الدفع (مزوّد تجريبي: لا تتحرك أموال حقيقية).',
            '“Needs reconciliation” means the payment succeeded but seats were not allocated. Try “Retry allocation” first; if seats are still unavailable, refund — refunds only run after the payment status is verified with the provider (demo provider: no real money moves).',
          )}
        </div>
      </div>

      <div aria-live="polite" ref={messageRef}>
        {message && (
          <div className={`alert ${message.ok ? 'alert-ok' : 'alert-warn'}`} role="status">
            <span aria-hidden>{message.ok ? '✓' : '⚠'}</span>
            <div className="spacer">{message.text}</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMessage(null)} aria-label={t('إغلاق الرسالة', 'Dismiss message')}>
              ✕
            </button>
          </div>
        )}
      </div>

      <label className="row small" style={{ gap: 8, cursor: 'pointer', width: 'fit-content' }}>
        <input type="checkbox" checked={hideResolved} onChange={(e) => setHideResolved(e.target.checked)} />
        {t('إخفاء الحالات المحلولة', 'Hide resolved cases')}
      </label>

      <Async state={list}>
        {(rows) => {
          const shown = hideResolved ? rows.filter((c) => c.status !== 'resolved') : rows;
          if (!rows.length) return <Empty title={t('لا توجد حالات دعم', 'No support cases')}>{t('الحالات المفتوحة من مساعد الدعم أو من المطابقة التلقائية تظهر هنا.', 'Cases opened by the support assistant or by automatic reconciliation appear here.')}</Empty>;
          if (!shown.length)
            return (
              <p className="muted" role="status">
                {t('كل الحالات محلولة.', 'All cases are resolved.')}
              </p>
            );
          return (
            <div className="stack">
              {shown.map((c) => (
                <CaseCard key={c.reference} c={c} onChanged={list.reload} onMessage={setMessage} />
              ))}
            </div>
          );
        }}
      </Async>
    </>
  );
}

function CaseCard({ c, onChanged, onMessage }: { c: SupportCase; onChanged: () => void; onMessage: (m: { ok: boolean; text: string } | null) => void }) {
  const { t, lang } = useI18n();
  const f = useFmt();
  const act = useAction();
  const [doing, setDoing] = useState<'retry' | 'refund' | 'resolve' | null>(null);
  const needsReconciliation = c.order_status === 'reconciliation_required' && !!c.order_ref;
  const cat = CATEGORY[c.category];
  const amount = c.total_fils != null ? f.amount(c.total_fils) : t('المبلغ المدفوع كاملاً', 'the full paid amount');

  const run = async <T,>(kind: 'retry' | 'refund' | 'resolve', fn: () => Promise<T>) => {
    onMessage(null);
    setDoing(kind);
    const r = await act.run(fn);
    setDoing(null);
    onChanged();
    return r;
  };

  const retry = async () => {
    const r = await run('retry', () => api<{ result: string }>(`/api/admin/orders/${encodeURIComponent(c.order_ref!)}/retry-confirm`, { method: 'POST' }));
    if (r) {
      const m = RETRY[r.result];
      onMessage(m ? { ok: m[2], text: `${c.order_ref}: ${lang === 'ar' ? m[0] : m[1]}` } : { ok: false, text: `${c.order_ref}: ${r.result}` });
    }
  };

  const refund = async () => {
    const ok = window.confirm(
      t(
        `استرجاع ${amount} للطلب ${c.order_ref}؟\n\nسيتم التحقق من حالة الدفع لدى مزوّد الدفع أولاً، ثم تُلغى التذاكر وتُعاد المقاعد للبيع. لا يمكن التراجع عن الاسترجاع.\n(مزوّد دفع تجريبي — لا تتحرك أموال حقيقية.)`,
        `Refund ${amount} for order ${c.order_ref}?\n\nThe payment status is verified with the provider first, then the tickets are voided and the seats released. A refund cannot be undone.\n(Demo payment provider — no real money moves.)`,
      ),
    );
    if (!ok) return;
    const r = await run('refund', () => api(`/api/admin/orders/${encodeURIComponent(c.order_ref!)}/refund`, { method: 'POST', body: { confirm: true } }));
    if (r) onMessage({ ok: true, text: t(`تم استرجاع ${amount} للطلب ${c.order_ref} وإغلاق حالة المطابقة.`, `Refunded ${amount} for order ${c.order_ref}; the reconciliation case was closed.`) });
  };

  const resolve = async () => {
    if (needsReconciliation && !window.confirm(t(`الطلب ${c.order_ref} ما زال يحتاج مطابقة. إغلاق الحالة على أي حال؟`, `Order ${c.order_ref} still needs reconciliation. Resolve the case anyway?`))) return;
    const r = await run('resolve', () => api(`/api/admin/support-cases/${encodeURIComponent(c.reference)}/resolve`, { method: 'POST' }));
    if (r) onMessage({ ok: true, text: t(`تم إغلاق الحالة ${c.reference}.`, `Case ${c.reference} resolved.`) });
  };

  return (
    <article className="card card-tight stack" aria-labelledby={`case-${c.reference}`} style={needsReconciliation ? { borderColor: '#5a4a20' } : undefined}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h3 id={`case-${c.reference}`} style={{ fontSize: '1.05rem', margin: 0 }}>
            {SYSTEM_SUBJECTS[c.subject] ? (lang === 'ar' ? SYSTEM_SUBJECTS[c.subject][0] : SYSTEM_SUBJECTS[c.subject][1]) : <bdi>{c.subject}</bdi>}
          </h3>
          <div className="small muted">
            <span className="num">{c.reference}</span> · {f.whenFull(c.created_at)} ·{' '}
            <span dir="ltr" style={{ overflowWrap: 'anywhere' }}>
              {c.email}
            </span>
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span className="badge">{cat ? (lang === 'ar' ? cat[0] : cat[1]) : c.category}</span>
          <ToneBadge value={c.priority} />
          <StatusBadge status={c.status} />
        </div>
      </div>

      {c.order_ref && (
        <div className="row small" style={{ gap: 8 }}>
          <span className="muted">{t('الطلب:', 'Order:')}</span>
          <span className="num">{c.order_ref}</span>
          {c.order_status && <StatusBadge status={c.order_status} />}
          {c.total_fils != null && (
            <span>
              {t('الإجمالي', 'Total')} <span className="num">{f.amount(c.total_fils)}</span>
            </span>
          )}
        </div>
      )}

      <ApiErrorAlert error={act.error} />

      {(needsReconciliation || c.status !== 'resolved') && (
        <div className="row">
          {needsReconciliation && (
            <>
              <button type="button" className="btn btn-sm btn-primary" onClick={retry} disabled={act.busy}>
                {doing === 'retry' ? t('جاري المحاولة…', 'Retrying…') : t('إعادة تخصيص المقاعد', 'Retry allocation')}
              </button>
              <button type="button" className="btn btn-sm btn-danger" onClick={refund} disabled={act.busy}>
                {doing === 'refund' ? t('جاري الاسترجاع…', 'Refunding…') : t(`استرجاع ${amount} بعد التحقق`, `Refund ${amount} after verification`)}
              </button>
            </>
          )}
          {c.status !== 'resolved' && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={resolve} disabled={act.busy}>
              {doing === 'resolve' ? t('جاري الإغلاق…', 'Resolving…') : t('إغلاق الحالة', 'Resolve case')}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

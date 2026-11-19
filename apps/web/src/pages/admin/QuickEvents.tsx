import { useState } from 'react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { Empty, SelectInput, StatusBadge } from '../../ui/components';
import { ApiErrorAlert, Async, DL, Flash, RefreshButton, useAction, useFmt } from '../org/kit';
import QuoteBuilder from './QuoteBuilder';
import type { QuickEventRequest, QuickEventStatus, Quote } from './types';

type Target = 'under_review' | 'rejected' | 'configuring' | 'approved' | 'live';

/** Status moves an admin may trigger (customer quote decisions happen on the customer side). */
const MOVES: Partial<Record<QuickEventStatus, Target[]>> = {
  submitted: ['under_review', 'rejected'],
  under_review: ['rejected'],
  quote_declined: ['rejected'],
  quote_accepted: ['configuring'],
  configuring: ['approved'],
  approved: ['live'],
};
const CAN_QUOTE: QuickEventStatus[] = ['under_review', 'quoted', 'quote_declined'];
const NEEDS_ACTION: QuickEventStatus[] = ['submitted', 'under_review', 'quote_declined', 'quote_accepted', 'configuring', 'approved'];
const ALL_STATUSES: QuickEventStatus[] = ['submitted', 'under_review', 'quoted', 'quote_accepted', 'quote_declined', 'configuring', 'approved', 'live', 'rejected'];

const MOVE_LABEL: Record<Target, [string, string]> = {
  under_review: ['بدء المراجعة', 'Start review'],
  rejected: ['رفض الطلب', 'Reject request'],
  configuring: ['بدء إعداد الفعالية', 'Start configuring'],
  approved: ['اعتماد الإعداد', 'Approve setup'],
  live: ['تفعيل الفعالية (Live)', 'Mark live'],
};

const NEXT_STEP: Record<QuickEventStatus, [string, string]> = {
  submitted: ['طلب جديد — ابدأ المراجعة أو ارفضه.', 'New request — start a review or reject it.'],
  under_review: ['قيد المراجعة — جهّز عرض سعر مخصص أو ارفض الطلب.', 'Under review — build a custom quote or reject the request.'],
  quoted: ['بانتظار قرار العميل على عرض السعر. تقدر ترسل عرضاً معدّلاً يحل محل العرض المفتوح.', 'Waiting for the customer to accept or decline. You can send a revised quote to replace the open one.'],
  quote_accepted: ['العميل قبل العرض — ابدأ إعداد الفعالية.', 'The customer accepted — start configuring the event.'],
  quote_declined: ['العميل رفض العرض — أرسل عرضاً معدّلاً أو أغلق الطلب.', 'The customer declined — send a revised quote or close the request.'],
  configuring: ['جاري إعداد الفعالية — اعتمد الإعداد عند الانتهاء.', 'Event being configured — approve the setup when done.'],
  approved: ['الإعداد معتمد — فعّل الفعالية عندما تكون جاهزة.', 'Setup approved — mark the event live when it is ready.'],
  live: ['الفعالية مفعّلة.', 'The event is live.'],
  rejected: ['الطلب مغلق (مرفوض).', 'Closed (rejected).'],
};

export default function QuickEvents() {
  const { t } = useI18n();
  const list = useApi<QuickEventRequest[]>('/api/admin/quick-events');
  const [filter, setFilter] = useState<'all' | 'action' | QuickEventStatus>('all');
  const [flash, setFlash] = useState<string | null>(null);

  return (
    <>
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t('طلبات Quick Event', 'Quick Event requests')}</h2>
        <RefreshButton onClick={list.reload} busy={list.loading} />
      </div>
      <div className="alert alert-info" role="note">
        <span aria-hidden>ℹ</span>
        <div className="small">
          {t(
            'كل طلب يُراجع يدوياً. الأسعار عروض مخصصة لكل طلب — ما فيه قائمة أسعار ثابتة — ولا يُنشر أي شيء تلقائياً: العميل يقبل العرض أولاً، ثم الإعداد، ثم الاعتماد، ثم التفعيل يدوياً.',
            'Every request is reviewed manually. Prices are custom quotes per request — there is no fixed price list — and nothing is published automatically: the customer accepts the quote, then you configure, approve and finally mark it live by hand.',
          )}
        </div>
      </div>
      {flash && <Flash onClose={() => setFlash(null)}>{flash}</Flash>}

      <div style={{ maxWidth: 360 }}>
        <SelectInput label={t('عرض', 'Show')} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">{t('كل الطلبات', 'All requests')}</option>
          <option value="action">{t('تحتاج إجراء من الإدارة', 'Needs admin action')}</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t('الحالة: ', 'Status: ')}
              {statusText(s, t)}
            </option>
          ))}
        </SelectInput>
      </div>

      <Async state={list}>
        {(rows) => {
          const shown = rows.filter((q) => (filter === 'all' ? true : filter === 'action' ? NEEDS_ACTION.includes(q.status) : q.status === filter));
          if (!rows.length) return <Empty title={t('لا توجد طلبات بعد', 'No requests yet')}>{t('الطلبات المقدّمة من صفحة Quick Event تظهر هنا.', 'Requests submitted from the Quick Event page appear here.')}</Empty>;
          if (!shown.length)
            return (
              <p className="muted" role="status">
                {t('لا توجد طلبات مطابقة.', 'No matching requests.')}
              </p>
            );
          return (
            <>
              <p className="small muted" role="status" style={{ margin: 0 }}>
                {t(`عدد الطلبات: ${shown.length}`, `${shown.length} requests`)}
              </p>
              {shown.map((q) => (
                <RequestCard
                  key={q.id}
                  q={q}
                  onChanged={list.reload}
                  onFlash={(m) => {
                    setFlash(m);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              ))}
            </>
          );
        }}
      </Async>
    </>
  );
}

function statusText(s: QuickEventStatus, t: (ar: string, en: string) => string): string {
  const m: Record<QuickEventStatus, [string, string]> = {
    submitted: ['مُرسل', 'Submitted'],
    under_review: ['قيد المراجعة', 'Under review'],
    quoted: ['تم إرسال عرض سعر', 'Quoted'],
    quote_accepted: ['تم قبول العرض', 'Quote accepted'],
    quote_declined: ['تم رفض العرض', 'Quote declined'],
    configuring: ['قيد الإعداد', 'Configuring'],
    approved: ['مقبول', 'Approved'],
    live: ['منشور', 'Live'],
    rejected: ['مرفوض', 'Rejected'],
  };
  return t(m[s][0], m[s][1]);
}

function servicesList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function RequestCard({ q, onChanged, onFlash }: { q: QuickEventRequest; onChanged: () => void; onFlash: (m: string) => void }) {
  const { t, lang, dir } = useI18n();
  const f = useFmt();
  const act = useAction();
  const [building, setBuilding] = useState(false);
  const moves = MOVES[q.status] ?? [];
  const canQuote = CAN_QUOTE.includes(q.status);
  const services = servicesList(q.services);
  const quotes = q.quotes ?? [];
  const headingId = `qe-${q.id}`;

  const move = async (to: Target) => {
    if (to === 'rejected' && !window.confirm(t(`رفض طلب ${q.reference} (${q.company_name})؟ هذا يغلق الطلب نهائياً.`, `Reject request ${q.reference} (${q.company_name})? This closes the request permanently.`))) return;
    if (to === 'live' && !window.confirm(t(`تفعيل ${q.reference}؟ تأكد أن الفعالية مُعدّة بالكامل.`, `Mark ${q.reference} live? Make sure the event is fully configured.`))) return;
    const r = await act.run(() => api(`/api/admin/quick-events/${q.id}/status`, { method: 'POST', body: { status: to } }));
    if (r) onFlash(t(`تم تحديث ${q.reference} إلى «${statusText(to, t)}».`, `${q.reference} moved to “${statusText(to, t)}”.`));
    onChanged(); // also refreshes after a 409 (someone else changed it)
  };

  return (
    <article className="card stack" aria-labelledby={headingId}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h3 id={headingId} style={{ margin: 0 }}>
            <bdi>{q.company_name}</bdi>
          </h3>
          <div className="small muted">
            <span className="num">{q.reference}</span> · {t('أُرسل', 'Submitted')} {f.whenFull(q.created_at)}
          </div>
        </div>
        <StatusBadge status={q.status} />
      </div>

      <div className="grid grid-2">
        <DL
          items={[
            [t('جهة التواصل', 'Contact'), <bdi>{q.contact_name}</bdi>],
            [
              t('البريد', 'Email'),
              <a href={`mailto:${q.email}`} dir="ltr">
                {q.email}
              </a>,
            ],
            [
              t('الجوال', 'Mobile'),
              <a href={`tel:${q.mobile}`} dir="ltr" className="num">
                {q.mobile}
              </a>,
            ],
            [t('المكان', 'Venue'), <bdi>{q.venue_name}</bdi>],
            [t('نوع الفعالية', 'Event type'), <bdi>{q.event_type}</bdi>],
            [t('التواريخ المقترحة', 'Proposed dates'), <bdi>{q.proposed_dates}</bdi>],
          ]}
        />
        <DL
          items={[
            [t('الحضور المتوقع', 'Expected attendance'), <span className="num">{f.int(q.expected_attendance)}</span>],
            [t('الدخول', 'Admission'), q.admission === 'free' ? t('مجاني', 'Free') : q.admission === 'paid' ? t('مدفوع', 'Paid') : q.admission],
            [
              t('نوع الجلوس', 'Seating'),
              q.seating_mode === 'reserved'
                ? t('مقاعد مرقّمة', 'Reserved seating')
                : q.seating_mode === 'general_admission'
                  ? t('دخول عام', 'General admission')
                  : q.seating_mode === 'exhibition_booths'
                    ? t('بوثات معرض', 'Exhibition booths')
                    : q.seating_mode,
            ],
            [
              t('الخدمات المطلوبة', 'Requested services'),
              services.length ? (
                <span className="row" style={{ gap: 6 }}>
                  {services.map((s) => (
                    <span key={s} className="badge">
                      {s.replace(/_/g, ' ')}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="faint">—</span>
              ),
            ],
            [t('مخطط المكان', 'Venue plan'), q.venue_plan_file_name ? <span dir="ltr">{q.venue_plan_file_name}</span> : <span className="faint">{t('لم يُرفق', 'Not attached')}</span>],
            [t('آخر تحديث', 'Last updated'), f.whenFull(q.updated_at)],
          ]}
        />
      </div>

      {q.notes && (
        <div>
          <div className="small muted">{t('ملاحظات العميل', 'Customer notes')}</div>
          <p dir="auto" style={{ whiteSpace: 'pre-line', margin: 0 }}>{q.notes}</p>
        </div>
      )}

      {quotes.length > 0 && <QuotesList quotes={quotes} />}

      <p className="small" style={{ margin: 0, color: 'var(--gold-2)' }}>
        <span aria-hidden>{dir === 'rtl' ? '← ' : '→ '}</span>
        {lang === 'ar' ? NEXT_STEP[q.status]?.[0] : NEXT_STEP[q.status]?.[1]}
      </p>

      <ApiErrorAlert error={act.error} />

      {(moves.length > 0 || canQuote) && !building && (
        <div className="row">
          {canQuote && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setBuilding(true)} disabled={act.busy}>
              {q.status === 'quoted' ? t('إرسال عرض معدّل', 'Send revised quote') : q.status === 'quote_declined' ? t('إرسال عرض جديد', 'Send a new quote') : t('إنشاء عرض سعر', 'Build quote')}
            </button>
          )}
          {moves.map((m) => (
            <button key={m} type="button" className={`btn btn-sm ${m === 'rejected' ? 'btn-danger' : canQuote ? '' : 'btn-primary'}`} onClick={() => move(m)} disabled={act.busy}>
              {t(MOVE_LABEL[m][0], MOVE_LABEL[m][1])}
            </button>
          ))}
        </div>
      )}

      {building && (
        <QuoteBuilder
          requestId={q.id}
          reference={q.reference}
          revising={q.status === 'quoted' /* only a 'sent' quote is open — the API expires it */}
          onCancel={() => setBuilding(false)}
          onSent={(totalFils) => {
            setBuilding(false);
            onFlash(t(`تم إرسال عرض سعر بقيمة ${f.amount(totalFils)} للطلب ${q.reference}. بانتظار قرار العميل.`, `Quote of ${f.amount(totalFils)} sent for ${q.reference}. Waiting for the customer’s decision.`));
            onChanged();
          }}
        />
      )}
    </article>
  );
}

function QuotesList({ quotes }: { quotes: Quote[] }) {
  const { t } = useI18n();
  const f = useFmt();
  return (
    <details>
      <summary className="small" style={{ cursor: 'pointer' }}>
        {t(`عروض الأسعار (${quotes.length})`, `Quotes (${quotes.length})`)}
      </summary>
      <div className="stack" style={{ marginTop: 8 }}>
        {[...quotes].reverse().map((qt) => (
          <div key={qt.id} className="card card-tight" style={{ background: 'var(--bg-2)' }}>
            <div className="row between">
              <span className="row" style={{ gap: 8 }}>
                <StatusBadge status={qt.status} />
                <span className="num" style={{ fontWeight: 700 }}>
                  {f.amount(qt.total_fils)}
                </span>
              </span>
              <span className="tiny muted">
                {t('أُنشئ', 'Created')} {f.day(qt.created_at)} · {t('صالح حتى', 'Valid until')} {f.day(qt.valid_until)}
              </span>
            </div>
            {qt.items && qt.items.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 8 }}>
                <table className="table">
                  <caption className="sr-only">{t('بنود عرض السعر', 'Quote items')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('الوصف', 'Description')}</th>
                      <th scope="col">{t('المبلغ', 'Amount')}</th>
                      <th scope="col">{t('الكمية', 'Qty')}</th>
                      <th scope="col">{t('الإجمالي', 'Total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qt.items.map((it, i) => (
                      <tr key={i}>
                        <td style={{ whiteSpace: 'normal' }}>{it.description}</td>
                        <td>
                          <span className="num">{f.amount(it.amount_fils)}</span>
                        </td>
                        <td>
                          <span className="num">{f.int(it.quantity)}</span>
                        </td>
                        <td>
                          <span className="num">{f.amount(it.amount_fils * it.quantity)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

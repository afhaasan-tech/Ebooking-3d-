import { useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { DemoTag, SelectInput, StatusBadge } from '../../ui/components';
import { Async, Clip, RefreshButton, useFmt } from './kit';
import type { OrgEvent, OrgOrder } from './types';

const STATUSES: [string, string, string][] = [
  ['confirmed', 'مؤكد', 'Confirmed'],
  ['payment_processing', 'قيد التحقق من الدفع', 'Verifying payment'],
  ['pending_payment', 'بانتظار الدفع', 'Awaiting payment'],
  ['payment_failed', 'فشل الدفع', 'Payment failed'],
  ['reconciliation_required', 'يحتاج مراجعة', 'Needs reconciliation'],
  ['refunded', 'مسترجع', 'Refunded'],
  ['expired', 'منتهي', 'Expired'],
  ['cancelled', 'ملغي', 'Cancelled'],
];

export default function Bookings({ orgId }: { orgId: string }) {
  const { t, pick } = useI18n();
  const events = useApi<OrgEvent[]>(`/api/org/${orgId}/events`);
  const [eventId, setEventId] = useState('');
  const [status, setStatus] = useState('');
  const qs = new URLSearchParams();
  if (eventId) qs.set('eventId', eventId);
  if (status) qs.set('status', status);
  const query = qs.toString();
  const orders = useApi<OrgOrder[]>(`/api/org/${orgId}/orders${query ? `?${query}` : ''}`);

  return (
    <>
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t('الحجوزات', 'Bookings')}</h2>
        <RefreshButton onClick={orders.reload} busy={orders.loading} />
      </div>

      <div className="grid grid-2" role="search" aria-label={t('تصفية الحجوزات', 'Filter bookings')}>
        <SelectInput label={t('الفعالية', 'Event')} value={eventId} onChange={(e) => setEventId(e.target.value)} disabled={!events.data}>
          <option value="">{t('كل الفعاليات', 'All events')}</option>
          {(events.data ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {pick(e, 'title')}
            </option>
          ))}
        </SelectInput>
        <SelectInput label={t('حالة الطلب', 'Order status')} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('كل الحالات', 'All statuses')}</option>
          {STATUSES.map(([v, ar, en]) => (
            <option key={v} value={v}>
              {t(ar, en)}
            </option>
          ))}
        </SelectInput>
      </div>

      <Async state={orders}>{(rows) => <OrdersTable rows={rows} filtered={!!query} />}</Async>
    </>
  );
}

function OrdersTable({ rows, filtered }: { rows: OrgOrder[]; filtered: boolean }) {
  const { t, pick } = useI18n();
  const f = useFmt();
  if (rows.length === 0) {
    return (
      <p className="muted" role="status">
        {filtered ? t('لا توجد حجوزات مطابقة للتصفية.', 'No bookings match these filters.') : t('لا توجد حجوزات بعد.', 'No bookings yet.')}
      </p>
    );
  }
  const seatsText = (seats: string | null) =>
    (seats ?? '')
      .split(', ')
      .filter(Boolean)
      .map((s) => {
        const ga = /^GA x(\d+)$/.exec(s);
        return ga ? t(`دخول عام × ${ga[1]}`, `General admission × ${ga[1]}`) : s;
      })
      .join(', ') || '—';

  return (
    <>
      <p className="small muted" role="status" style={{ margin: 0 }}>
        {t(`عدد الحجوزات المعروضة: ${f.int(rows.length)}`, `Showing ${f.int(rows.length)} bookings`)}
        {rows.length >= 200 && t(' (أحدث 200 حجز فقط)', ' (latest 200 only)')}
      </p>
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">{t('حجوزات المنظمة', "The organization's bookings")}</caption>
          <thead>
            <tr>
              <th scope="col">{t('المرجع', 'Reference')}</th>
              <th scope="col">{t('الفعالية', 'Event')}</th>
              <th scope="col">{t('موعد العرض', 'Performance')}</th>
              <th scope="col">{t('العميل', 'Customer')}</th>
              <th scope="col">{t('المقاعد / التذاكر', 'Seats / tickets')}</th>
              <th scope="col">{t('الإجمالي', 'Total')}</th>
              <th scope="col">{t('الحالة', 'Status')}</th>
              <th scope="col">{t('تاريخ الطلب', 'Ordered')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.reference}>
                <td>
                  <span className="num">{o.reference}</span> {o.demo && <DemoTag />}
                </td>
                <td>
                  <Clip text={pick(o, 'title')} max={240} />
                </td>
                <td>{f.when(o.starts_at)}</td>
                <td>
                  <Clip text={o.contact_name} max={180} />
                </td>
                <td>
                  <Clip text={seatsText(o.seats)} max={220} />
                </td>
                <td>
                  <span
                    className="num"
                    title={t(`التذاكر ${f.amount(o.subtotal_fils)} + رسوم الخدمة ${f.amount(o.service_fee_fils)}`, `Tickets ${f.amount(o.subtotal_fils)} + service fee ${f.amount(o.service_fee_fils)}`)}
                  >
                    {f.amount(o.total_fils)}
                  </span>
                  <div className="tiny faint">
                    {t('منها رسوم', 'incl. fee')} <span className="num">{f.amount(o.service_fee_fils)}</span>
                  </div>
                </td>
                <td>
                  <StatusBadge status={o.status} />
                </td>
                <td>{f.when(o.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

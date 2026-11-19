import { useI18n } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { DemoTag, Stat, StatusBadge } from '../../ui/components';
import { Async, BarList, Clip, DemoNotice, RefreshButton, toFils, useFmt } from './kit';
import type { DashboardData } from './types';

export default function Overview({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  const dash = useApi<DashboardData>(`/api/org/${orgId}/dashboard`);
  return (
    <>
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t('نظرة عامة', 'Overview')}</h2>
        <RefreshButton onClick={dash.reload} busy={dash.loading} />
      </div>
      <Async state={dash}>{(d) => <OverviewBody d={d} />}</Async>
    </>
  );
}

function TextValue({ children }: { children: string }) {
  return <span style={{ fontSize: '1.1rem', fontFamily: 'var(--font-ui)' }}>{children}</span>;
}

function OverviewBody({ d }: { d: DashboardData }) {
  const { t, pick, lang } = useI18n();
  const f = useFmt();
  const T = d.totals;
  const sold = d.tickets.sold;
  const checkedPct = sold > 0 ? Math.round((d.tickets.checked_in / sold) * 100) : null;
  // byCategory only carries the English event title; recover the Arabic one from byEvent.
  const arTitleByEn = new Map(d.byEvent.map((e) => [e.title_en, e.title_ar]));

  return (
    <>
      {d.demoData && <DemoNotice />}

      <section aria-labelledby="ov-revenue" className="stack">
        <h3 id="ov-revenue" style={{ margin: 0 }}>
          {t('المبيعات والإيرادات', 'Sales & revenue')}
        </h3>
        <div className="grid grid-4">
          <Stat
            label={t('إجمالي المبيعات (طلبات مؤكدة)', 'Gross sales (confirmed orders)')}
            value={f.amount(T.gross_fils)}
            sub={t(`${f.int(T.confirmed_orders)} طلب مؤكد · قبل رسوم الخدمة`, `${f.int(T.confirmed_orders)} confirmed orders · excl. service fees`)}
          />
          <Stat label={t('رسوم الخدمة (يدفعها العميل)', 'Service fees (paid by customers)')} value={f.amount(T.fees_fils)} />
          <Stat label={t('المبالغ المسترجعة', 'Refunds')} value={f.amount(T.refunds_fils)} sub={t('قيمة التذاكر في الطلبات المسترجعة', 'Ticket value of refunded orders')} />
          <Stat
            label={t('عمولة المنصة', 'Platform commission')}
            value={T.commissionConfigured ? f.amount(T.commissionFils) : <TextValue>{t('غير مُعدّة', 'Not configured')}</TextValue>}
            sub={
              T.commissionConfigured
                ? t(`بنسبة ${f.pct(d.subscription?.commission_bps)}`, `At ${f.pct(d.subscription?.commission_bps)}`)
                : t('لم يتم إعداد عمولة لخطتك بعد — السعر عند الطلب', 'Commission not configured for your plan yet — price on request')
            }
          />
          <Stat
            label={t('صافي المنظّم', 'Organizer net')}
            value={f.amount(T.netFils)}
            sub={T.commissionConfigured ? t('بعد خصم المسترجع والعمولة', 'After refunds and commission') : t('بعد خصم المسترجع — قبل العمولة (غير مُعدّة)', 'After refunds — before commission (not configured)')}
          />
        </div>
      </section>

      <section aria-labelledby="ov-tickets" className="stack">
        <h3 id="ov-tickets" style={{ margin: 0 }}>
          {t('التذاكر والحضور', 'Tickets & attendance')}
        </h3>
        <div className="grid grid-4">
          <Stat label={t('تذاكر مُصدرة', 'Tickets sold')} value={f.int(sold)} sub={t('باستثناء التذاكر الملغاة', 'Excluding void tickets')} />
          <Stat
            label={t('تم تسجيل حضورهم', 'Checked in')}
            value={f.int(d.tickets.checked_in)}
            sub={checkedPct != null ? t(`${checkedPct}% من التذاكر المُصدرة`, `${checkedPct}% of tickets sold`) : t('لا توجد تذاكر بعد', 'No tickets yet')}
          />
          <Stat
            label={t('مقاعد مرقّمة متاحة', 'Reserved seats available')}
            value={f.int(d.inventory.available)}
            sub={t(`من أصل ${f.int(d.inventory.total)} مقعد في كل العروض`, `Of ${f.int(d.inventory.total)} seats across all performances`)}
          />
          <Stat
            label={t('طلبات تحتاج مطابقة', 'Orders needing reconciliation')}
            value={f.int(T.reconciliation_orders)}
            sub={T.reconciliation_orders > 0 ? t('دفعات مؤكدة بانتظار مراجعة فريق المنصة', 'Verified payments awaiting platform review') : t('لا شيء معلّق', 'Nothing pending')}
          />
        </div>
      </section>

      <div className="grid grid-3">
        <BarList
          title={t('المبيعات حسب الفعالية', 'Sales by event')}
          empty={t('لا توجد مبيعات مؤكدة بعد.', 'No confirmed sales yet.')}
          items={d.byEvent.map((e) => ({
            key: e.id,
            label: pick(e, 'title'),
            value: toFils(e.gross_fils) ?? 0,
            display: f.amount(e.gross_fils),
            sub: t(`${f.int(e.tickets)} تذكرة`, `${f.int(e.tickets)} tickets`),
          }))}
        />
        <BarList
          title={t('المبيعات حسب فئة التذاكر', 'Sales by ticket category')}
          empty={t('لا توجد مبيعات مؤكدة بعد.', 'No confirmed sales yet.')}
          items={d.byCategory.map((c, i) => ({
            key: `${c.title_en}-${c.code}-${i}`,
            label: `${pick(c, 'name')} · ${lang === 'ar' ? (arTitleByEn.get(c.title_en) ?? c.title_en) : c.title_en}`,
            value: toFils(c.gross_fils) ?? 0,
            display: f.amount(c.gross_fils),
            sub: t(`${f.int(c.items)} بند في الطلبات`, `${f.int(c.items)} order lines`),
          }))}
        />
        <BarList
          title={t('المبيعات حسب العرض', 'Sales by performance')}
          empty={t('لا توجد مبيعات مؤكدة بعد.', 'No confirmed sales yet.')}
          items={d.byPerformance.map((p) => ({
            key: p.id,
            label: `${f.when(p.starts_at)} — ${pick(p, 'title')}`,
            value: toFils(p.gross_fils) ?? 0,
            display: f.amount(p.gross_fils),
            sub: t(`${f.int(p.orders)} طلب مؤكد`, `${f.int(p.orders)} confirmed orders`),
          }))}
        />
      </div>

      <section aria-labelledby="ov-recent" className="stack">
        <h3 id="ov-recent" style={{ margin: 0 }}>
          {t('آخر النشاطات', 'Recent activity')}
        </h3>
        {d.recent.length === 0 ? (
          <p className="muted">{t('لا توجد طلبات بعد.', 'No orders yet.')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">{t('آخر 12 طلباً', 'Latest 12 orders')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('المرجع', 'Reference')}</th>
                  <th scope="col">{t('الفعالية', 'Event')}</th>
                  <th scope="col">{t('البنود', 'Lines')}</th>
                  <th scope="col">{t('الإجمالي', 'Total')}</th>
                  <th scope="col">{t('الحالة', 'Status')}</th>
                  <th scope="col">{t('الوقت', 'Time')}</th>
                </tr>
              </thead>
              <tbody>
                {d.recent.map((r) => (
                  <tr key={r.reference}>
                    <td>
                      <span className="num">{r.reference}</span> {r.demo && <DemoTag />}
                    </td>
                    <td>
                      <Clip text={pick(r, 'title')} />
                    </td>
                    <td>
                      <span className="num">{f.int(r.items)}</span>
                    </td>
                    <td>
                      <span className="num">{f.amount(r.total_fils)}</span>
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td>{f.when(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { Stat } from '../../ui/components';
import { ApiErrorAlert, Async, Clip, DemoNotice, RefreshButton, ToneBadge, useFmt, type AsyncState } from '../org/kit';
import type { AdminOverview, Health } from './types';

export default function AdminOverviewTab() {
  const { t } = useI18n();
  const ov = useApi<AdminOverview>('/api/admin/overview');
  const health = useApi<Health>('/api/health');
  return (
    <>
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t('نظرة عامة على المنصة', 'Platform overview')}</h2>
        <RefreshButton
          onClick={() => {
            ov.reload();
            health.reload();
          }}
          busy={ov.loading || health.loading}
        />
      </div>
      <Async state={ov}>{(d) => <OverviewBody d={d} health={<HealthCard state={health} />} />}</Async>
    </>
  );
}

function OverviewBody({ d, health }: { d: AdminOverview; health: ReactNode }) {
  const { t, pick } = useI18n();
  const f = useFmt();
  const c = d.counts;
  const go = (to: string, ar: string, en: string) => (
    <Link to={to} className="small">
      {t(ar, en)}
    </Link>
  );

  return (
    <>
      {d.demoData && <DemoNotice>{t('بيانات تجريبية: كل المنظمات والطلبات والمبالغ هنا خيالية.', 'Demo data: every organization, order and amount here is fictional.')}</DemoNotice>}

      <div className="grid grid-4">
        <Stat label={t('المنظمات', 'Organizations')} value={f.int(c.organizations)} />
        <Stat label={t('فعاليات منشورة', 'Published events')} value={f.int(c.published_events)} />
        <Stat label={t('فعاليات بانتظار الموافقة', 'Events pending approval')} value={f.int(c.pending_events)} sub={c.pending_events > 0 ? go('/admin/approvals', 'راجعها الآن', 'Review now') : undefined} />
        <Stat label={t('طلبات Quick Event جديدة', 'New Quick Event requests')} value={f.int(c.new_quick_events)} sub={c.new_quick_events > 0 ? go('/admin/quick-events', 'افتح الطلبات', 'Open requests') : undefined} />
        <Stat label={t('طلبات مؤكدة', 'Confirmed orders')} value={f.int(c.confirmed_orders)} />
        <Stat label={t('رسوم الخدمة (طلبات مؤكدة)', 'Service fees (confirmed orders)')} value={f.amount(c.platform_fees_fils)} />
        <Stat label={t('طلبات تحتاج مطابقة', 'Orders needing reconciliation')} value={f.int(c.reconciliation)} sub={c.reconciliation > 0 ? go('/admin/support', 'افتح الدعم والمطابقة', 'Open support & reconciliation') : undefined} />
        <Stat label={t('دفعات بانتظار التحقق', 'Payments awaiting verification')} value={f.int(c.unverified_payments)} sub={t('حالة pending أو unknown', 'Status pending or unknown')} />
        <Stat label={t('حالات دعم مفتوحة', 'Open support cases')} value={f.int(c.open_cases)} sub={c.open_cases > 0 ? go('/admin/support', 'عرض الحالات', 'View cases') : undefined} />
      </div>

      {health}

      <section className="stack" aria-labelledby="adm-orgs">
        <h3 id="adm-orgs" style={{ margin: 0 }}>
          {t('المنظمات والاشتراكات', 'Organizations & subscriptions')}
        </h3>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">{t('المنظمات وخططها', 'Organizations and their plans')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('المنظمة', 'Organization')}</th>
                <th scope="col">{t('الحالة', 'Status')}</th>
                <th scope="col">{t('الخطة', 'Plan')}</th>
                <th scope="col">{t('الاشتراك', 'Subscription')}</th>
                <th scope="col">{t('نهاية الفترة', 'Period end')}</th>
                <th scope="col">{t('الفوترة', 'Billing')}</th>
                <th scope="col">{t('الفعاليات', 'Events')}</th>
              </tr>
            </thead>
            <tbody>
              {d.orgs.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Clip text={o.name} max={260} />
                  </td>
                  <td>
                    <ToneBadge value={o.status} />
                  </td>
                  <td>{o.plan ? <span className="num">{o.plan}</span> : <span className="faint">{t('بدون خطة', 'No plan')}</span>}</td>
                  <td>{o.sub_status ? <ToneBadge value={o.sub_status} /> : <span className="faint">—</span>}</td>
                  <td>{o.current_period_end ? f.day(o.current_period_end) : <span className="faint">—</span>}</td>
                  <td>{o.mock == null ? <span className="faint">—</span> : o.mock ? <span className="badge badge-warn">{t('تجريبية — بدون تحصيل', 'Demo — no charges')}</span> : <span className="badge badge-ok">{t('فعلية', 'Live')}</span>}</td>
                  <td>
                    <span className="num">{f.int(o.events)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack" aria-labelledby="adm-plans">
        <h3 id="adm-plans" style={{ margin: 0 }}>
          {t('خطط المنظّمين', 'Organizer plans')}
        </h3>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">{t('خطط الاشتراك وأسعارها', 'Subscription plans and prices')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('الخطة', 'Plan')}</th>
                <th scope="col">{t('الرسوم السنوية', 'Annual fee')}</th>
                <th scope="col">{t('العمولة', 'Commission')}</th>
                <th scope="col">{t('المزايا', 'Features')}</th>
              </tr>
            </thead>
            <tbody>
              {d.plans.map((p) => (
                <tr key={p.code}>
                  <td>
                    {pick(p, 'name')} <span className="num tiny faint">{p.code}</span>
                  </td>
                  <td>{p.annual_fee_fils == null ? <span className="faint">{t('السعر عند الطلب', 'Price on Request')}</span> : <span className="num">{f.amount(p.annual_fee_fils)}</span>}</td>
                  <td>{p.commission_bps == null ? <span className="faint">{t('غير مُعدّة', 'Not configured')}</span> : <span className="num">{f.pct(p.commission_bps)}</span>}</td>
                  <td>
                    <Features features={p.features} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {d.settings.length > 0 && (
        <section className="stack" aria-labelledby="adm-settings">
          <h3 id="adm-settings" style={{ margin: 0 }}>
            {t('إعدادات المنصة', 'Platform settings')}
          </h3>
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">{t('إعدادات المنصة (للقراءة فقط)', 'Platform settings (read-only)')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('المفتاح', 'Key')}</th>
                  <th scope="col">{t('القيمة', 'Value')}</th>
                </tr>
              </thead>
              <tbody>
                {d.settings.map((s) => (
                  <tr key={s.key}>
                    <td>
                      <code className="kbd" dir="ltr">
                        {s.key}
                      </code>
                    </td>
                    <td className="tiny">
                      <Clip text={safeJson(s.value)} max={520} ltr />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

const FEATURE_LABELS: Record<string, [string, string]> = {
  maxEvents: ['حد الفعاليات', 'Max events'],
  seatvision: ['SeatVision', 'SeatVision'],
  exhibitions: ['المعارض', 'Exhibitions'],
  customQuotes: ['عروض أسعار مخصصة', 'Custom quotes'],
};

function Features({ features }: { features: Record<string, unknown> | null }) {
  const { t, lang } = useI18n();
  const entries = Object.entries(features ?? {});
  if (!entries.length) return <span className="faint">—</span>;
  return (
    <span className="row" style={{ gap: 6 }}>
      {entries.map(([k, v]) => {
        const label = FEATURE_LABELS[k] ? (lang === 'ar' ? FEATURE_LABELS[k][0] : FEATURE_LABELS[k][1]) : k;
        const value = v === true ? '' : v === false ? t('لا', 'no') : v == null ? t('غير محدود', 'unlimited') : String(v);
        return (
          <span key={k} className="badge">
            {label}
            {value && `: ${value}`}
          </span>
        );
      })}
    </span>
  );
}

function HealthCard({ state }: { state: AsyncState<Health> }) {
  const { t } = useI18n();
  const f = useFmt();
  const h = state.data;
  return (
    <section className="card card-tight stack" aria-labelledby="adm-health">
      <div className="row between">
        <h3 id="adm-health" style={{ margin: 0 }}>
          {t('حالة النظام', 'System health')}
        </h3>
        {h ? <span className={`badge ${h.ok ? 'badge-ok' : 'badge-danger'}`}>{h.ok ? `✓ ${t('يعمل', 'Healthy')}` : `✕ ${t('مشكلة', 'Problem')}`}</span> : null}
      </div>
      {state.error && !h ? (
        <ApiErrorAlert error={state.error} onRetry={state.reload} />
      ) : !h ? (
        <p className="small muted" role="status" style={{ margin: 0 }}>
          {t('جاري الفحص…', 'Checking…')}
        </p>
      ) : (
        <div className="row small" style={{ gap: 8 }}>
          <span className="badge">
            {t('قاعدة البيانات', 'Database')}: <span className="num">{h.db}</span> · <span className="num">{f.int(h.dbLatencyMs)} ms</span>
          </span>
          <span className={`badge ${h.payments === 'demo' ? 'badge-warn' : 'badge-info'}`}>
            {t('الدفع', 'Payments')}: <span className="num">{h.payments}</span>
          </span>
          <span className="badge">
            {t('مساعد الذكاء الاصطناعي', 'AI assistant')}: <span className="num">{h.ai}</span>
          </span>
          {h.demoMode && <span className="badge badge-warn">{t('وضع تجريبي', 'Demo mode')}</span>}
        </div>
      )}
    </section>
  );
}

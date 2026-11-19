import { Link } from 'react-router-dom';
import { useI18n } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { Empty } from '../../ui/components';
import { Async, DL, ToneBadge, useFmt } from './kit';
import type { DashboardData } from './types';

export default function SubscriptionTab({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  const dash = useApi<DashboardData>(`/api/org/${orgId}/dashboard`);
  return (
    <>
      <h2 style={{ margin: 0 }}>{t('الاشتراك', 'Subscription')}</h2>
      <Async state={dash}>{(d) => <SubscriptionBody sub={d.subscription} />}</Async>
    </>
  );
}

function SubscriptionBody({ sub }: { sub: DashboardData['subscription'] }) {
  const { t, pick } = useI18n();
  const f = useFmt();

  if (!sub) {
    return (
      <Empty title={t('لا يوجد اشتراك فعّال', 'No active subscription')}>
        <p>{t('تواصل مع فريق المنصة لتفعيل خطة لمنظمتك.', 'Contact the platform team to activate a plan for your organization.')}</p>
        <Link className="btn" to="/support">
          {t('الدعم', 'Support')}
        </Link>
      </Empty>
    );
  }

  return (
    <>
      {sub.mock && (
        <div className="alert alert-warn" role="note">
          <span aria-hidden>ℹ</span>
          <div>{t('فوترة تجريبية — لا توجد أي رسوم حقيقية.', 'Demo billing — no real charges.')}</div>
        </div>
      )}
      <section className="card" aria-labelledby="sub-plan">
        <div className="row between" style={{ marginBottom: 12 }}>
          <h3 id="sub-plan" style={{ margin: 0 }}>
            {t('خطة', 'Plan')} {pick(sub, 'name')}
          </h3>
          <ToneBadge value={sub.status} />
        </div>
        <DL
          items={[
            [t('رمز الخطة', 'Plan code'), <span className="num">{sub.code}</span>],
            [t('الحالة', 'Status'), <ToneBadge value={sub.status} />],
            [sub.status === 'trial' ? t('تنتهي الفترة التجريبية في', 'Trial ends') : t('نهاية الفترة الحالية', 'Current period ends'), f.day(sub.current_period_end)],
            [t('الرسوم السنوية', 'Annual fee'), sub.annual_fee_fils == null ? t('السعر عند الطلب', 'Price on Request') : <span className="num">{f.amount(sub.annual_fee_fils)}</span>],
            [t('عمولة المنصة على التذاكر', 'Platform commission on tickets'), sub.commission_bps == null ? t('غير مُعدّة بعد', 'Not configured yet') : <span className="num">{f.pct(sub.commission_bps)}</span>],
            [t('الفوترة', 'Billing'), sub.mock ? t('تجريبية (بدون تحصيل)', 'Demo (nothing is charged)') : t('فعلية', 'Live')],
          ]}
        />
      </section>
      <p className="small muted" style={{ margin: 0 }}>
        {t(
          'أسعار الخطط والعمولات تُعتمد تجارياً مع فريق المنصة؛ ما لم تُعتمد تظهر «السعر عند الطلب». لتغيير الخطة تواصل مع الدعم.',
          'Plan prices and commissions are agreed commercially with the platform team; until then they show as “Price on Request”. Contact support to change plans.',
        )}
      </p>
    </>
  );
}

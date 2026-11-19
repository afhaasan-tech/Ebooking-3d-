import { useEffect } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { Empty, Loading } from '../../ui/components';
import { TabBar } from '../org/kit';
import AdminOverviewTab from './Overview';
import QuickEvents from './QuickEvents';
import Approvals from './Approvals';
import SupportCases from './Support';
import AdminAudit from './Audit';

type AdminTab = 'overview' | 'quick-events' | 'approvals' | 'support' | 'audit';

const TABS: { key: AdminTab; ar: string; en: string }[] = [
  { key: 'overview', ar: 'نظرة عامة', en: 'Overview' },
  { key: 'quick-events', ar: 'طلبات Quick Event', en: 'Quick Event requests' },
  { key: 'approvals', ar: 'موافقات الفعاليات', en: 'Event approvals' },
  { key: 'support', ar: 'الدعم والمطابقة', en: 'Support & reconciliation' },
  { key: 'audit', ar: 'سجل التدقيق', en: 'Audit' },
];

export default function AdminPortal() {
  const { t } = useI18n();
  const { me, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="container page">
        <Loading />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="container page">
        <Empty title={t('إدارة المنصة', 'Platform admin')}>
          <p>{t('سجّل دخولك بحساب مشرف المنصة للمتابعة.', 'Sign in with a platform administrator account to continue.')}</p>
          <Link className="btn btn-primary" to={`/login?next=${encodeURIComponent(loc.pathname)}`}>
            {t('تسجيل الدخول', 'Sign in')}
          </Link>
        </Empty>
      </div>
    );
  }

  if (me.platformRole !== 'platform_admin') {
    return (
      <div className="container page">
        <Empty title={t('غير مصرّح', 'Not authorized')}>
          <p>{t('هذه الصفحة مخصصة لفريق إدارة المنصة فقط.', 'This area is for platform administrators only.')}</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link className="btn" to="/">
              {t('الرئيسية', 'Home')}
            </Link>
            {me.organizations?.length > 0 && (
              <Link className="btn" to="/org">
                {t('بوابة المنظّم', 'Organizer portal')}
              </Link>
            )}
          </div>
        </Empty>
      </div>
    );
  }

  return <AdminWorkspace />;
}

function AdminWorkspace() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const params = useParams();
  const requested = (params['*'] ?? '').split('/')[0];
  const active: AdminTab = TABS.some((x) => x.key === requested) ? (requested as AdminTab) : 'overview';

  useEffect(() => {
    if (requested && requested !== active) navigate(`/admin/${active}`, { replace: true });
  }, [requested, active, navigate]);

  return (
    <div className="container page">
      <header style={{ marginBottom: 'var(--s5)' }}>
        <p className="small muted" style={{ margin: 0 }}>
          Ebooking Ticket
        </p>
        <h1 style={{ marginBottom: 0 }}>{t('إدارة المنصة', 'Platform admin')}</h1>
      </header>
      <TabBar tabs={TABS.map((x) => ({ key: x.key, label: t(x.ar, x.en) }))} active={active} onChange={(k) => navigate(`/admin/${k}`)} label={t('أقسام الإدارة', 'Admin sections')} idPrefix="admin" />
      <div role="tabpanel" id="admin-panel" aria-labelledby={`admin-tab-${active}`} className="stack" key={active}>
        {active === 'overview' && <AdminOverviewTab />}
        {active === 'quick-events' && <QuickEvents />}
        {active === 'approvals' && <Approvals />}
        {active === 'support' && <SupportCases />}
        {active === 'audit' && <AdminAudit />}
      </div>
    </div>
  );
}

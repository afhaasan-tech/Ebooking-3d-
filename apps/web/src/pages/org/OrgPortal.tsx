import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth, type Me } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { Empty, Loading, SelectInput } from '../../ui/components';
import { TabBar, ToneBadge, useLabels } from './kit';
import type { OrgRole } from './types';
import Overview from './Overview';
import EventsTab from './Events';
import Pricing from './Pricing';
import Bookings from './Bookings';
import Inventory from './Inventory';
import CheckIn from './CheckIn';
import Exhibitors from './Exhibitors';
import Staff from './Staff';
import SubscriptionTab from './Subscription';
import Audit from './Audit';

type TabKey = 'overview' | 'events' | 'pricing' | 'bookings' | 'inventory' | 'checkin' | 'exhibitors' | 'staff' | 'subscription' | 'audit';

/** Role gating mirrors the API: staff only see events (read) + check-in; audit is owner-only. */
const TABS: { key: TabKey; ar: string; en: string; roles: OrgRole[] }[] = [
  { key: 'overview', ar: 'نظرة عامة', en: 'Overview', roles: ['owner', 'manager'] },
  { key: 'events', ar: 'الفعاليات', en: 'Events', roles: ['owner', 'manager', 'staff'] },
  { key: 'pricing', ar: 'الأسعار', en: 'Pricing', roles: ['owner', 'manager'] },
  { key: 'bookings', ar: 'الحجوزات', en: 'Bookings', roles: ['owner', 'manager'] },
  { key: 'inventory', ar: 'مخزون المقاعد', en: 'Seat inventory', roles: ['owner', 'manager'] },
  { key: 'checkin', ar: 'تسجيل الحضور', en: 'Check-in', roles: ['owner', 'manager', 'staff'] },
  { key: 'exhibitors', ar: 'العارضون', en: 'Exhibitors', roles: ['owner', 'manager'] },
  { key: 'staff', ar: 'الفريق', en: 'Staff', roles: ['owner', 'manager'] },
  { key: 'subscription', ar: 'الاشتراك', en: 'Subscription', roles: ['owner', 'manager'] },
  { key: 'audit', ar: 'سجل التدقيق', en: 'Audit log', roles: ['owner'] },
];

const ORG_KEY = 'ebk.org';
function readStoredOrg(): string | null {
  try {
    return localStorage.getItem(ORG_KEY);
  } catch {
    return null;
  }
}
function storeOrg(id: string) {
  try {
    localStorage.setItem(ORG_KEY, id);
  } catch {
    /* storage unavailable — selection still works for this tab */
  }
}

export default function OrgPortal() {
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
        <Empty title={t('بوابة المنظّم', 'Organizer portal')}>
          <p>{t('سجّل دخولك للوصول إلى لوحة المنظّم وإدارة فعالياتك.', 'Sign in to open the organizer dashboard and manage your events.')}</p>
          <Link className="btn btn-primary" to={`/login?next=${encodeURIComponent(loc.pathname)}`}>
            {t('تسجيل الدخول', 'Sign in')}
          </Link>
        </Empty>
      </div>
    );
  }

  if (!me.organizations?.length) {
    return (
      <div className="container page">
        <Empty title={t('ما فيه منظمة مرتبطة بحسابك', 'No organization is linked to your account')}>
          <p>
            {t(
              'بوابة المنظّم مخصصة لفرق المنظّمين. إذا كنت تعمل مع منظّم، اطلب من مالك المنظمة يضيفك باستخدام بريدك:',
              'The organizer portal is for organizer teams. If you work with an organizer, ask the owner to add you using your email:',
            )}{' '}
            <strong dir="ltr">{me.email}</strong>
          </p>
          <p>{t('تبي تنظّم فعالية؟ قدّم طلب Quick Event وفريقنا يتواصل معك بعرض سعر مخصص.', 'Want to run an event? Submit a Quick Event request and our team will reply with a custom quote.')}</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link className="btn btn-primary" to="/quick-event">
              {t('طلب Quick Event', 'Request a Quick Event')}
            </Link>
            {me.platformRole === 'platform_admin' && (
              <Link className="btn" to="/admin">
                {t('لوحة إدارة المنصة', 'Platform admin console')}
              </Link>
            )}
          </div>
        </Empty>
      </div>
    );
  }

  return <OrgWorkspace orgs={me.organizations} />;
}

function OrgWorkspace({ orgs }: { orgs: Me['organizations'] }) {
  const { t } = useI18n();
  const labels = useLabels();
  const navigate = useNavigate();
  const params = useParams();
  const [orgId, setOrgId] = useState<string>(() => {
    const stored = readStoredOrg();
    return stored && orgs.some((o) => o.id === stored) ? stored : orgs[0].id;
  });
  const org = orgs.find((o) => o.id === orgId) ?? orgs[0];
  const role = org.role;
  const tabs = TABS.filter((x) => x.roles.includes(role));
  const defaultTab: TabKey = role === 'staff' ? 'checkin' : 'overview';
  const requested = (params['*'] ?? '').split('/')[0];
  const active: TabKey = tabs.some((x) => x.key === requested) ? (requested as TabKey) : defaultTab;

  // Unknown tab, or a tab this role cannot open (e.g. staff following an /org/overview link) → canonical URL.
  useEffect(() => {
    if (requested && requested !== active) navigate(`/org/${active}`, { replace: true });
  }, [requested, active, navigate]);

  const switchOrg = (id: string) => {
    setOrgId(id);
    storeOrg(id);
  };

  return (
    <div className="container page">
      <header className="row between" style={{ alignItems: 'flex-end', marginBottom: 'var(--s5)' }}>
        <div style={{ minWidth: 0 }}>
          <p className="small muted" style={{ margin: 0 }}>
            {t('بوابة المنظّم', 'Organizer portal')}
          </p>
          <h1 style={{ marginBottom: 6 }}>
            <bdi>{org.name}</bdi>
          </h1>
          <div className="row small muted" style={{ gap: 8 }}>
            <span>{t('صلاحيتك:', 'Your role:')}</span>
            <ToneBadge value={role} />
          </div>
        </div>
        {orgs.length > 1 && (
          <div style={{ width: 'min(100%, 380px)' }}>
            {/* role first: if a long name gets clipped, only the tail of the name is lost */}
            <SelectInput label={t('المنظمة', 'Organization')} value={org.id} onChange={(e) => switchOrg(e.target.value)}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {labels.role(o.role)} · {o.name}
                </option>
              ))}
            </SelectInput>
          </div>
        )}
      </header>

      <TabBar
        tabs={tabs.map((x) => ({ key: x.key, label: t(x.ar, x.en) }))}
        active={active}
        onChange={(k) => navigate(`/org/${k}`)}
        label={t('أقسام بوابة المنظّم', 'Organizer portal sections')}
        idPrefix="org"
      />

      <div role="tabpanel" id="org-panel" aria-labelledby={`org-tab-${active}`} className="stack" key={`${org.id}:${active}`}>
        <Panel tab={active} orgId={org.id} role={role} />
      </div>
    </div>
  );
}

function Panel({ tab, orgId, role }: { tab: TabKey; orgId: string; role: OrgRole }) {
  switch (tab) {
    case 'overview':
      return <Overview orgId={orgId} />;
    case 'events':
      return <EventsTab orgId={orgId} role={role} />;
    case 'pricing':
      return <Pricing orgId={orgId} />;
    case 'bookings':
      return <Bookings orgId={orgId} />;
    case 'inventory':
      return <Inventory orgId={orgId} />;
    case 'checkin':
      return <CheckIn orgId={orgId} />;
    case 'exhibitors':
      return <Exhibitors orgId={orgId} />;
    case 'staff':
      return <Staff orgId={orgId} role={role} />;
    case 'subscription':
      return <SubscriptionTab orgId={orgId} />;
    case 'audit':
      return <Audit orgId={orgId} />;
  }
}

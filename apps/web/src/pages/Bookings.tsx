/**
 * /bookings — "My Bookings": upcoming / past ticket orders, exhibition booth requests and Quick Event requests.
 */
import { useMemo, useRef, type KeyboardEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/useApi';
import { DemoTag, Empty, ErrorBox, Loading, StatusBadge } from '../ui/components';
import { MyQuickEventRequests } from './QuickEvent';

const BK_CSS = `
.bk-intro { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; justify-content: space-between; margin-bottom: var(--s4); }
.bk-panel:focus-visible { outline: 2px solid var(--gold-2); outline-offset: 4px; border-radius: 8px; }
.bk-table td { vertical-align: middle; }
.bk-panel .table-wrap { position: relative; }
.bk-title { display: inline-flex; flex-wrap: wrap; gap: 6px; align-items: center; white-space: normal; }
.bk-count { display: inline-grid; place-items: center; min-width: 22px; height: 20px; padding: 0 6px; margin-inline-start: 6px; border-radius: 999px; background: var(--bg-2); border: 1px solid var(--line); font-size: 0.72rem; color: var(--muted); }
@media (max-width: 640px) {
  .bk-table thead { display: none; }
  .bk-table, .bk-table tbody, .bk-table tr, .bk-table td { display: block; width: 100%; }
  .bk-table tr { border-bottom: 1px solid var(--line-soft); padding: 10px 12px; }
  .bk-table tr:last-child { border-bottom: 0; }
  .bk-table td { border: 0; padding: 4px 0; white-space: normal; display: flex; justify-content: space-between; align-items: center; gap: 12px; text-align: end; }
  .bk-table td::before { content: attr(data-label); color: var(--muted); font-size: 0.8rem; text-align: start; flex-shrink: 0; }
}
`;

type Tab = 'upcoming' | 'past' | 'booths' | 'quick';
const TABS: Tab[] = ['upcoming', 'past', 'booths', 'quick'];

interface OrderRow {
  id: string;
  reference: string;
  status: string;
  total_fils: number;
  created_at: string;
  demo: boolean;
  starts_at: string;
  title_ar: string;
  title_en: string;
  slug: string;
  inventory_type: string;
  ticket_count: number;
}

interface BoothRequestRow {
  id: string;
  status: string;
  created_at: string;
  decided_at: string | null;
  booth_code: string;
  width_m: number;
  depth_m: number;
  price_fils: number | null;
  title_ar: string;
  title_en: string;
  slug: string;
}

export default function Bookings() {
  const { t } = useI18n();
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!me) {
    return (
      <div className="container page">
        <h1>{t('حجوزاتي', 'My Bookings')}</h1>
        <Empty title={t('سجّل دخولك لعرض حجوزاتك', 'Sign in to see your bookings')}>
          <p>{t('حجوزات التذاكر وطلبات البوثات وطلبات Quick Event مرتبطة بحسابك.', 'Ticket orders, booth requests and Quick Event requests are linked to your account.')}</p>
          <Link className="btn btn-primary" to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`}>
            {t('تسجيل الدخول', 'Sign in')}
          </Link>
        </Empty>
      </div>
    );
  }
  return <BookingsView />;
}

function BookingsView() {
  const { t, dir } = useI18n();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = (TABS as string[]).includes(raw ?? '') ? (raw as Tab) : 'upcoming';
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  const orders = useApi<OrderRow[]>('/api/orders');
  const booths = useApi<BoothRequestRow[]>('/api/exhibitions/requests/mine');

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const list = orders.data ?? [];
    const time = (o: OrderRow) => new Date(o.starts_at).getTime();
    return {
      upcoming: list.filter((o) => time(o) >= now).sort((a, b) => time(a) - time(b)),
      past: list.filter((o) => time(o) < now).sort((a, b) => time(b) - time(a)),
    };
  }, [orders.data]);

  const setTab = (k: Tab, focus = false) => {
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set('tab', k);
        return n;
      },
      { replace: true },
    );
    if (focus) tabRefs.current[k]?.focus();
  };

  // WAI-ARIA tabs: arrows move (mirrored in RTL), Home/End jump; selection follows focus
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.indexOf(tab);
    const next = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const prev = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    let to: Tab | null = null;
    if (e.key === next) to = TABS[(i + 1) % TABS.length];
    else if (e.key === prev) to = TABS[(i - 1 + TABS.length) % TABS.length];
    else if (e.key === 'Home') to = TABS[0];
    else if (e.key === 'End') to = TABS[TABS.length - 1];
    if (to) {
      e.preventDefault();
      setTab(to, true);
    }
  };

  const label: Record<Tab, string> = {
    upcoming: t('القادمة', 'Upcoming'),
    past: t('السابقة', 'Past'),
    booths: t('طلبات البوثات', 'Booth requests'),
    quick: t('طلبات Quick Event', 'Quick Event requests'),
  };
  const count: Partial<Record<Tab, number>> = {
    upcoming: orders.data ? upcoming.length : undefined,
    past: orders.data ? past.length : undefined,
    booths: booths.data ? booths.data.length : undefined,
  };

  return (
    <div className="container page">
      <style>{BK_CSS}</style>
      <div className="bk-intro">
        <div>
          <h1 style={{ marginBottom: 4 }}>{t('حجوزاتي', 'My Bookings')}</h1>
          <p className="muted small" style={{ margin: 0 }}>
            {t('كل حجوزاتك وطلباتك في مكان واحد. التذاكر الصالحة تجدها في «تذاكري».', 'All your bookings and requests in one place. Valid tickets are in “My Tickets”.')}
          </p>
        </div>
        <div className="row">
          <Link className="btn btn-sm" to="/tickets">
            <span aria-hidden="true">🎟</span> {t('تذاكري', 'My Tickets')}
          </Link>
          <Link className="btn btn-ghost btn-sm" to="/support">
            {t('مشكلة في حجز؟', 'Problem with a booking?')}
          </Link>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label={t('أنواع الحجوزات', 'Booking types')} onKeyDown={onTabKey}>
        {TABS.map((k) => (
          <button
            key={k}
            ref={(el) => {
              tabRefs.current[k] = el;
            }}
            id={`bk-tab-${k}`}
            type="button"
            role="tab"
            aria-selected={tab === k}
            aria-controls={`bk-panel-${k}`}
            tabIndex={tab === k ? 0 : -1}
            onClick={() => setTab(k)}
          >
            {label[k]}
            {count[k] !== undefined && <span className="bk-count num">{count[k]}</span>}
          </button>
        ))}
      </div>

      <div id={`bk-panel-${tab}`} role="tabpanel" aria-labelledby={`bk-tab-${tab}`} tabIndex={0} className="bk-panel">
        {(tab === 'upcoming' || tab === 'past') &&
          (orders.loading && !orders.data ? (
            <Loading />
          ) : orders.error && !orders.data ? (
            <ErrorBox error={orders.error} onRetry={orders.reload} />
          ) : (
            <OrdersTable rows={tab === 'upcoming' ? upcoming : past} kind={tab} />
          ))}
        {tab === 'booths' &&
          (booths.loading && !booths.data ? <Loading /> : booths.error && !booths.data ? <ErrorBox error={booths.error} onRetry={booths.reload} /> : <BoothRequestsTable rows={booths.data ?? []} />)}
        {tab === 'quick' && (
          <div className="stack">
            <div className="row between">
              <p className="muted small" style={{ margin: 0 }}>
                {t('طلبات الفعاليات المُدارة وعروض الأسعار الخاصة بها.', 'Your managed-event requests and their quotations.')}
              </p>
              <Link className="btn btn-sm" to="/quick-event#request">
                {t('طلب جديد', 'New request')}
              </Link>
            </div>
            <MyQuickEventRequests compact />
          </div>
        )}
      </div>
    </div>
  );
}

function OrdersTable({ rows, kind }: { rows: OrderRow[]; kind: 'upcoming' | 'past' }) {
  const { t, pick, money, date } = useI18n();
  if (!rows.length) {
    return (
      <Empty title={kind === 'upcoming' ? t('لا توجد حجوزات قادمة', 'No upcoming bookings') : t('لا توجد حجوزات سابقة', 'No past bookings')}>
        {kind === 'upcoming' && (
          <>
            <p>{t('اكتشف الفعاليات واحجز مقعدك.', 'Discover events and book your seat.')}</p>
            <Link className="btn btn-primary" to="/events">
              {t('تصفح الفعاليات', 'Browse events')}
            </Link>
          </>
        )}
      </Empty>
    );
  }
  const cols = {
    event: t('الفعالية', 'Event'),
    date: t('الموعد', 'Date'),
    ref: t('رقم الحجز', 'Reference'),
    tickets: t('التذاكر', 'Tickets'),
    total: t('الإجمالي', 'Total'),
    status: t('الحالة', 'Status'),
  };
  return (
    <div className="table-wrap">
      <table className="table bk-table" role="table">
        <caption className="sr-only">{kind === 'upcoming' ? t('الحجوزات القادمة', 'Upcoming bookings') : t('الحجوزات السابقة', 'Past bookings')}</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">{cols.event}</th>
            <th scope="col" role="columnheader">{cols.date}</th>
            <th scope="col" role="columnheader">{cols.ref}</th>
            <th scope="col" role="columnheader">{cols.tickets}</th>
            <th scope="col" role="columnheader">{cols.total}</th>
            <th scope="col" role="columnheader">{cols.status}</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((o) => (
            <tr key={o.id} role="row">
              <td role="cell" data-label={cols.event}>
                <span className="bk-title">
                  <Link to={o.inventory_type === 'exhibition_booth' ? `/exhibitions/${o.slug}` : `/events/${o.slug}`}>{pick(o, 'title')}</Link>
                  {o.demo && <DemoTag />}
                </span>
              </td>
              <td role="cell" data-label={cols.date}>
                {date(o.starts_at)}
              </td>
              <td role="cell" data-label={cols.ref}>
                <Link to={`/orders/${encodeURIComponent(o.reference)}`} className="num">
                  {o.reference}
                </Link>
              </td>
              <td role="cell" data-label={cols.tickets}>
                <span className="num">{o.ticket_count}</span>
              </td>
              <td role="cell" data-label={cols.total}>
                {money(o.total_fils)}
              </td>
              <td role="cell" data-label={cols.status}>
                <StatusBadge status={o.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoothRequestsTable({ rows }: { rows: BoothRequestRow[] }) {
  const { t, pick, money, date } = useI18n();
  if (!rows.length) {
    return (
      <Empty title={t('لم ترسل أي طلب بوث', 'No booth requests yet')}>
        <p>{t('استكشف المعارض باستخدام SpaceVision واطلب البوث المناسب لك.', 'Explore exhibitions with SpaceVision and request the booth that suits you.')}</p>
        <Link className="btn btn-primary" to="/events?category=exhibition">
          {t('تصفح المعارض', 'Browse exhibitions')}
        </Link>
      </Empty>
    );
  }
  const cols = {
    exhibition: t('المعرض', 'Exhibition'),
    booth: t('البوث', 'Booth'),
    size: t('المقاس', 'Size'),
    price: t('السعر', 'Price'),
    sent: t('أُرسل', 'Submitted'),
    status: t('الحالة', 'Status'),
    decided: t('تاريخ القرار', 'Decided'),
  };
  const size = (r: BoothRequestRow) => `${Math.round(Number(r.width_m) * 10) / 10} × ${Math.round(Number(r.depth_m) * 10) / 10} ${t('م', 'm')}`;
  return (
    <div className="stack">
      <div className="alert alert-info small" role="note">
        <span aria-hidden="true">ℹ</span>
        <div>{t('الطلب «قيد المراجعة» ليس حجزاً — يُحجز البوث فقط بعد موافقة المنظّم.', 'A “Pending” request is not a booking — the booth is only allocated once the organizer approves.')}</div>
      </div>
      <div className="table-wrap">
        <table className="table bk-table" role="table">
          <caption className="sr-only">{t('طلبات حجز البوثات', 'Booth requests')}</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">{cols.exhibition}</th>
              <th scope="col" role="columnheader">{cols.booth}</th>
              <th scope="col" role="columnheader">{cols.size}</th>
              <th scope="col" role="columnheader">{cols.price}</th>
              <th scope="col" role="columnheader">{cols.sent}</th>
              <th scope="col" role="columnheader">{cols.status}</th>
              <th scope="col" role="columnheader">{cols.decided}</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rows.map((r) => (
              <tr key={r.id} role="row">
                <td role="cell" data-label={cols.exhibition}>
                  <span className="bk-title">
                    <Link to={`/exhibitions/${r.slug}`}>{pick(r, 'title')}</Link>
                  </span>
                </td>
                <td role="cell" data-label={cols.booth}>
                  <Link to={`/exhibitions/${r.slug}?booth=${encodeURIComponent(r.booth_code)}`} className="num">
                    {r.booth_code}
                  </Link>
                </td>
                <td role="cell" data-label={cols.size}>
                  <span className="num">{size(r)}</span>
                </td>
                <td role="cell" data-label={cols.price}>
                  {money(r.price_fils)}
                </td>
                <td role="cell" data-label={cols.sent}>
                  {date(r.created_at)}
                </td>
                <td role="cell" data-label={cols.status}>
                  {r.status === 'withdrawn' ? <span className="badge">{t('مسحوب', 'Withdrawn')}</span> : <StatusBadge status={r.status} />}
                </td>
                <td role="cell" data-label={cols.decided}>
                  {r.decided_at ? date(r.decided_at) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

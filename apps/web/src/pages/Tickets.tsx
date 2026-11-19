import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/useApi';
import { DemoQr, Empty, ErrorBox, Loading, StatusBadge } from '../ui/components';

export function TicketCard({ ticket, order }: { ticket: any; order: any }) {
  const { t, pick, date } = useI18n();
  const [show, setShow] = useState(false);
  const item = order.items.find((i: any) => i.id === ticket.order_item_id) ?? {};
  return (
    <article className="ticket-shape" aria-label={t('تذكرة تجريبية', 'Demo ticket')}>
      <div className="row" style={{ padding: 18, gap: 18, alignItems: 'stretch' }}>
        <div className="stack spacer" style={{ gap: 4, minWidth: 0 }}>
          <span className="badge badge-danger" style={{ alignSelf: 'flex-start' }}>{t('تذكرة تجريبية — غير صالحة للدخول', 'DEMO TICKET — NOT VALID FOR ENTRY')}</span>
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--ivory)' }}>{pick(order.event, 'title')}</strong>
          <span className="small muted">{pick(order.event, 'venue')}</span>
          <span className="small">{date(order.event.startsAt, { weekday: 'long', day: 'numeric', month: 'long' })} · {date(order.event.startsAt, { hour: '2-digit', minute: '2-digit' })}</span>
          {ticket.seat_code ? (
            <div className="row small" style={{ gap: 12 }}>
              <span>{t('القسم', 'Section')}: <strong>{pick(item, 'section')}</strong></span>
              <span>{t('صف', 'Row')}: <strong className="num">{item.row_label}</strong></span>
              <span>{t('كرسي', 'Seat')}: <strong className="num">{item.seat_number}</strong></span>
            </div>
          ) : (
            <span className="small">{pick(item, 'category')} · #{ticket.admission_index}</span>
          )}
          <span className="tiny muted">{t('رقم الحجز', 'Booking ref')}: <span className="num">{order.reference}</span> · <StatusBadge status={ticket.status} /></span>
        </div>
        <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
          <DemoQr seed={ticket.id} size={104} />
          <button className="btn btn-ghost btn-sm" onClick={() => setShow((v) => !v)} aria-expanded={show}>{t('رمز التحقق', 'Check-in code')}</button>
        </div>
      </div>
      {show && (
        <div style={{ padding: '0 18px 14px' }} className="tiny">
          <div className="muted">{t('رمز موقّع من الخادم لاختبار تسجيل الدخول في بوابة المنظّم (تجريبي). الرسم أعلاه زخرفي.', 'Server-signed code for testing check-in in the organizer portal (demo). The graphic above is decorative.')}</div>
          <code className="kbd" style={{ wordBreak: 'break-all', display: 'block', marginTop: 4 }} dir="ltr">{ticket.qr}</code>
          <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => navigator.clipboard?.writeText(ticket.qr)}>{t('نسخ', 'Copy')}</button>
        </div>
      )}
    </article>
  );
}

export default function Tickets() {
  const { t } = useI18n();
  const { me, loading: authLoading } = useAuth();
  const { data, error, loading, reload } = useApi<any[]>(me ? '/api/tickets' : null, [me?.id]);
  if (authLoading) return <Loading />;
  if (!me)
    return (
      <div className="container page">
        <Empty title={t('سجّل دخولك لعرض تذاكرك', 'Sign in to see your tickets')}>
          <Link className="btn btn-primary" to="/login?next=/tickets">{t('دخول', 'Sign in')}</Link>
        </Empty>
      </div>
    );
  return (
    <div className="container page stack">
      <h1>{t('تذاكري', 'My Tickets')}</h1>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data && data.length === 0 && (
        <Empty title={t('ما عندك تذاكر بعد', 'No tickets yet')}>
          <Link className="btn btn-primary" to="/events">{t('تصفح الفعاليات', 'Browse events')}</Link>
        </Empty>
      )}
      <div className="grid grid-2">
        {data?.flatMap((o) => o.tickets.map((tk: any) => <TicketCard key={tk.id} ticket={tk} order={o} />))}
      </div>
    </div>
  );
}

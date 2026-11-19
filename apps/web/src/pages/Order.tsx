import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { forgetBasket, useBasket } from '../lib/basket';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { DemoTag, ErrorBox, Loading, StatusBadge } from '../ui/components';
import { TicketCard } from './Tickets';

export default function Order() {
  const { ref } = useParams();
  const { t, pick, money, date } = useI18n();
  const { me, loading: authLoading } = useAuth();
  const { reload: reloadBasket } = useBasket();
  const { data: o, error, loading, setData, reload } = useApi<any>(me ? `/api/orders/${ref}` : null, [me?.id]);
  const [checking, setChecking] = useState(false);

  // poll while payment is being verified (not per frame; stops when resolved)
  useEffect(() => {
    if (o?.status !== 'payment_processing') return;
    const tm = setInterval(() => void reload(), 3000);
    return () => clearInterval(tm);
  }, [o?.status, reload]);

  useEffect(() => {
    if (o && o.status !== 'pending_payment' && o.status !== 'payment_failed') {
      forgetBasket();
      void reloadBasket();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o?.status]);

  if (authLoading) return <Loading />;
  if (!me)
    return (
      <div className="container page">
        <p>{t('سجّل دخولك لعرض الحجز.', 'Sign in to view this booking.')}</p>
        <Link className="btn btn-primary" to={`/login?next=/orders/${ref}`}>{t('دخول', 'Sign in')}</Link>
      </div>
    );
  if (loading && !o) return <Loading />;
  if (error) return <div className="container page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (!o) return null;

  const verify = async () => {
    setChecking(true);
    try {
      setData(await api(`/api/orders/${ref}/verify`, { method: 'POST' }));
    } finally {
      setChecking(false);
    }
  };

  const banners: Record<string, { cls: string; icon: string; title: string; body: string }> = {
    confirmed: { cls: 'alert-ok', icon: '✅', title: t('تم تأكيد حجزك!', 'Your booking is confirmed!'), body: t('الدفع تحقق منه مزوّد الدفع وتم إصدار تذاكرك التجريبية.', 'The payment was verified by the provider and your demo tickets were issued.') },
    payment_processing: { cls: 'alert-warn', icon: '⏳', title: t('جاري التحقق من الدفع…', 'Verifying your payment…'), body: t('لا تعيد الدفع. ننتظر تأكيداً موثّقاً من مزوّد الدفع وراح تتحدث الصفحة تلقائياً. إذا تم الخصم، تصدر تذاكرك بدون أي خصم إضافي.', 'Please do not pay again. We are waiting for verified confirmation from the provider; this page updates automatically. If you were charged, tickets are issued with no extra charge.') },
    payment_failed: { cls: 'alert-danger', icon: '✕', title: t('فشل الدفع', 'Payment failed'), body: t('المزوّد أكّد إن الدفع ما تم. كراسيك لسه محجوزة لك لفترة قصيرة — تقدر تحاول مرة ثانية.', 'The provider confirmed the payment did not go through. Your seats are still held briefly — you can try again.') },
    reconciliation_required: { cls: 'alert-danger', icon: '⚠', title: t('الدفع متحقق منه لكن يحتاج مراجعة', 'Payment verified — needs reconciliation'), body: t('وصلنا الدفع لكن الكراسي ما عادت متاحة بعد انتهاء مدة الحجز المؤقت. ما راح نصدر تذكرة غير صحيحة. فتحنا طلب دعم عاجل وراح نعرض عليك بديل أو استرجاع كامل.', 'We received your payment but the seats were no longer available after the hold expired. We will not issue an invalid ticket. An urgent support case is open; we will offer alternatives or a full refund.') },
    expired: { cls: '', icon: '⌛', title: t('انتهت مدة الطلب', 'Order expired'), body: t('ما فيه دفعة متحقق منها لهذا الطلب.', 'There is no verified payment for this order.') },
    refunded: { cls: 'alert-info', icon: '↩', title: t('تم الاسترجاع', 'Refunded'), body: t('تم استرجاع المبلغ وتأكيده من مزوّد الدفع.', 'The amount was refunded and confirmed by the provider.') },
  };
  const b = banners[o.status] ?? { cls: '', icon: 'ℹ', title: o.status, body: '' };

  return (
    <div className="container page stack">
      <div className="row between">
        <h1 style={{ margin: 0 }}>{t('الحجز', 'Booking')} <span className="num">{o.reference}</span></h1>
        <div className="row" style={{ gap: 6 }}><StatusBadge status={o.status} />{o.demo && <DemoTag />}</div>
      </div>
      <div className={`alert ${b.cls}`} role="status" aria-live="polite">
        <span aria-hidden style={{ fontSize: 22 }}>{b.icon}</span>
        <div className="spacer">
          <strong>{b.title}</strong>
          <div className="small">{b.body}</div>
          {o.supportCase && <div className="small" style={{ marginTop: 4 }}>{t('رقم طلب الدعم', 'Support case')}: <strong className="num">{o.supportCase.reference}</strong></div>}
        </div>
        {o.status === 'payment_processing' && <button className="btn btn-sm" onClick={() => void verify()} disabled={checking}>{checking ? '…' : t('تحقق الآن', 'Check now')}</button>}
        {o.status === 'payment_failed' && <Link className="btn btn-sm btn-primary" to="/checkout">{t('حاول مرة ثانية', 'Try again')}</Link>}
        {(o.status === 'reconciliation_required' || o.status === 'payment_processing') && <Link className="btn btn-sm" to="/support">{t('الدعم', 'Support')}</Link>}
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card stack">
          <h2>{pick(o.event, 'title')}</h2>
          <div className="muted small">{pick(o.event, 'venue')} · {date(o.event.startsAt)}</div>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {o.items.map((i: any) => (
                  <tr key={i.id}>
                    <td>{i.seat_code ? <>{pick(i, 'section')} · {t('صف', 'Row')} {i.row_label} · {t('كرسي', 'Seat')} {i.seat_number}</> : <>{pick(i, 'category')} × <span className="num">{i.quantity}</span></>}</td>
                    <td className="num" style={{ textAlign: 'end' }}>{money(i.unit_price_fils * i.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row between small"><span className="muted">{t('رسوم الخدمة', 'Service fee')}</span><span className="num">{money(o.serviceFeeFils)}</span></div>
          <div className="row between"><strong>{t('الإجمالي', 'Total')}</strong><strong className="num">{money(o.totalFils)}</strong></div>
          <details>
            <summary className="small muted" style={{ cursor: 'pointer' }}>{t('سجل محاولات الدفع', 'Payment attempts')}</summary>
            <ul className="small">{o.payments.map((p: any) => <li key={p.id}>{date(p.created_at)} · {p.method} · <StatusBadge status={p.status === 'succeeded' ? 'confirmed' : p.status === 'failed' ? 'payment_failed' : 'payment_processing'} /> <span className="num">{money(p.amount_fils)}</span></li>)}</ul>
          </details>
        </div>
        <div className="stack">
          {o.tickets.map((tk: any) => <TicketCard key={tk.id} ticket={tk} order={o} />)}
          {o.status === 'confirmed' && <Link className="btn" to="/tickets">{t('كل تذاكري', 'All my tickets')}</Link>}
        </div>
      </div>
    </div>
  );
}

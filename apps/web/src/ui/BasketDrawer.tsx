import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBasket } from '../lib/basket';
import { useI18n } from '../lib/i18n';

export function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  return <span className="num">{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>;
}

export function BasketDrawer() {
  const { hold, drawerOpen, setDrawerOpen, setSeats, clear, busy } = useBasket();
  const { t, pick, money, date } = useI18n();
  const nav = useNavigate();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, setDrawerOpen]);

  if (!drawerOpen) return null;
  const remove = async (seat: string) => {
    if (!hold) return;
    await setSeats(hold.performanceId, hold.items.filter((i) => i.seat_code !== seat).map((i) => i.seat_code));
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="basket-title">
        <header className="row between">
          <h2 id="basket-title" style={{ margin: 0 }}>{t('السلة', 'Basket')}</h2>
          <button ref={closeRef} className="btn btn-ghost icon-btn" onClick={() => setDrawerOpen(false)} aria-label={t('إغلاق', 'Close')}>✕</button>
        </header>
        <div className="body stack">
          {!hold ? (
            <p className="muted">{t('السلة فاضية. اختر كراسيك من خريطة المسرح.', 'Your basket is empty. Pick seats from the venue map.')}</p>
          ) : (
            <>
              <div className="card card-tight">
                <strong>{pick(hold.event, 'title')}</strong>
                <div className="small muted">{pick(hold.event, 'venue')} · {date(hold.event.starts_at)}</div>
                <div className="small" style={{ marginTop: 6 }}>
                  ⏱ {t('الكراسي محجوزة لك لمدة', 'Seats held for')} <Countdown until={hold.expiresAt} />
                </div>
              </div>
              {hold.items.map((i) => (
                <div key={i.seat_code ?? i.category_code} className="card card-tight row between">
                  <div>
                    {i.seat_code ? (
                      <>
                        <strong>{pick(i, 'section')}</strong>
                        <div className="small muted">{t('صف', 'Row')} {i.row_label} · {t('كرسي', 'Seat')} {i.seat_number} · {pick(i, 'category')}</div>
                        <div className="tiny faint">{t('تقييم الرؤية التقديري', 'Est. view score')} {i.view_score}/100</div>
                      </>
                    ) : (
                      <>
                        <strong>{pick(i, 'category')}</strong>
                        <div className="small muted">× <span className="num">{i.quantity}</span></div>
                      </>
                    )}
                  </div>
                  <div style={{ textAlign: 'end' }}>
                    <div className="num">{money(i.price_fils * i.quantity)}</div>
                    {i.seat_code && (
                      <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setDrawerOpen(false); nav(`/book/${hold.performanceId}?view=${encodeURIComponent(i.seat_code)}`); }}>{t('الإطلالة', 'View')}</button>
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => remove(i.seat_code)} aria-label={t(`إزالة ${i.seat_code}`, `Remove ${i.seat_code}`)}>{t('إزالة', 'Remove')}</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        {hold && (
          <footer className="stack">
            <div className="row between small"><span className="muted">{t('المجموع الفرعي', 'Subtotal')}</span><span className="num">{money(hold.pricing.subtotalFils)}</span></div>
            <div className="row between small">
              <span className="muted">{t('رسوم الخدمة', 'Service fee')} ({hold.pricing.serviceFeeBps / 100}% + {money(hold.pricing.serviceFeeFixedFils)} {t('للتذكرة', '/ticket')})</span>
              <span className="num">{money(hold.pricing.serviceFeeFils)}</span>
            </div>
            <div className="row between"><strong>{t('الإجمالي', 'Total')}</strong><strong className="num">{money(hold.pricing.totalFils)}</strong></div>
            <button className="btn btn-primary btn-block" onClick={() => { setDrawerOpen(false); nav('/checkout'); }}>{t('متابعة للدفع', 'Continue to checkout')}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => void clear()}>{t('تفريغ السلة', 'Empty basket')}</button>
          </footer>
        )}
      </aside>
    </>
  );
}

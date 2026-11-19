import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useBasket } from '../lib/basket';
import { Wordmark } from './Logo';
import { BasketDrawer } from './BasketDrawer';

export function Layout({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const { me, logout } = useAuth();
  const { hold, setDrawerOpen } = useBasket();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);

  const isOrg = (me?.organizations.length ?? 0) > 0;
  const count = hold?.pricing.ticketCount ?? 0;

  return (
    <>
      <a href="#main" className="skip-link">{t('تخطَّ إلى المحتوى', 'Skip to content')}</a>
      <div className="demo-banner" role="note">
        {t('نسخة تجريبية: جميع الفعاليات والأماكن والمدفوعات والتذاكر خيالية — لا يتم أي دفع حقيقي.', 'Demo build: all events, venues, payments and tickets are fictional — no real payment is processed.')}
      </div>
      <header className="site-header">
        <div className="container">
          <Link to="/" aria-label="Ebooking Ticket — home" style={{ textDecoration: 'none' }}>
            <Wordmark size={30} />
          </Link>
          <nav className={`nav ${open ? 'open' : ''}`} aria-label={t('القائمة الرئيسية', 'Main navigation')}>
            <NavLink to="/events">{t('الفعاليات', 'Events')}</NavLink>
            <NavLink to="/events?category=exhibition">{t('المعارض', 'Exhibitions')}</NavLink>
            <NavLink to="/quick-event">{t('Quick Event', 'Quick Event')}</NavLink>
            {me && <NavLink to="/tickets">{t('تذاكري', 'My Tickets')}</NavLink>}
            {me && <NavLink to="/bookings">{t('حجوزاتي', 'My Bookings')}</NavLink>}
            <NavLink to="/support">{t('الدعم', 'Support')}</NavLink>
            {isOrg && <NavLink to="/org">{t('بوابة المنظّم', 'Organizer')}</NavLink>}
            {me?.platformRole === 'platform_admin' && <NavLink to="/admin">{t('الإدارة', 'Admin')}</NavLink>}
          </nav>
          <div className="spacer" />
          <button className="btn btn-ghost btn-sm" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} aria-label={t('Switch to English', 'التبديل للعربية')}>
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
          <button className="btn btn-sm" onClick={() => setDrawerOpen(true)} aria-label={t(`السلة (${count})`, `Basket (${count})`)}>
            <span aria-hidden>🎟</span>
            <span className="num">{count}</span>
          </button>
          {me ? (
            <button className="btn btn-ghost btn-sm" onClick={logout} title={me.email}>{t('خروج', 'Sign out')}</button>
          ) : (
            <Link className="btn btn-sm" to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`}>{t('دخول', 'Sign in')}</Link>
          )}
          <button className="btn btn-ghost btn-sm menu-btn icon-btn" aria-expanded={open} aria-label={t('القائمة', 'Menu')} onClick={() => setOpen((v) => !v)}>☰</button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="site-footer">
        <div className="container row between">
          <span>© 2026 Ebooking Ticket — {t('منصة تجريبية في الكويت', 'Kuwait-first demo platform')}</span>
          <span>{t('الأسعار بالدينار الكويتي (د.ك) وتظهر الرسوم قبل الدفع.', 'Prices in KWD; fees are shown before payment.')}</span>
        </div>
      </footer>
      <BasketDrawer />
    </>
  );
}

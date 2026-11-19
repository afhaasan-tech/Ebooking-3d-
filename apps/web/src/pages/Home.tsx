import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { useApi } from '../lib/useApi';
import { ErrorBox } from '../ui/components';
import { EventCard, CATEGORY_LABEL } from '../ui/EventCard';
import { LogoMark } from '../ui/Logo';

export default function Home() {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const { data, error, loading, reload } = useApi<any[]>('/api/events');

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div className="stack">
            <span className="badge badge-gold" style={{ alignSelf: 'flex-start' }}>Ebooking SeatVision AI</span>
            <h1 className="display" style={{ fontSize: 'clamp(2rem, 5vw, 3.4rem)' }}>
              {t('شوف إطلالتك.', 'See your view.')}<br />
              <span style={{ color: 'var(--gold-2)' }}>{t('اختر كرسيك.', 'Choose your seat.')}</span><br />
              {t('احجز بثقة.', 'Book with confidence.')}
            </h1>
            <p className="muted" style={{ maxWidth: 560, fontSize: '1.05rem' }}>
              {t('قبل لا تدفع، اجلس افتراضياً بكرسيك في نموذج ثلاثي الأبعاد للمسرح، قارن بين الكراسي، وخلّ الاقتراح الذكي يلقى لك أحسن إطلالة ضمن ميزانيتك.', 'Before you pay, sit virtually in your seat in a 3D model of the venue, compare seats side by side, and let Smart Pick find the best view within your budget.')}
            </p>
            <form className="row" role="search" onSubmit={(e) => { e.preventDefault(); nav(`/events${q ? `?q=${encodeURIComponent(q)}` : ''}`); }} style={{ flexWrap: 'nowrap', maxWidth: 520 }}>
              <label htmlFor="home-q" className="sr-only">{t('ابحث عن فعالية', 'Search events')}</label>
              <input id="home-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث: مسرحية، حفلة، ورشة…', 'Search: play, concert, workshop…')} />
              <button className="btn btn-primary">{t('ابحث', 'Search')}</button>
            </form>
            <div className="row" style={{ gap: 6 }}>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <Link key={k} className="btn btn-sm" to={`/events?category=${k}`}>{v[2]} {lang === 'ar' ? v[0] : v[1]}</Link>
              ))}
            </div>
          </div>
          <div className="hero-visual" aria-hidden>
            <svg viewBox="0 0 400 300" style={{ width: '100%', height: 'auto' }}>
              <defs>
                <radialGradient id="spot" cx="50%" cy="0%" r="90%"><stop offset="0" stopColor="#e8c77c" stopOpacity="0.55" /><stop offset="1" stopColor="#e8c77c" stopOpacity="0" /></radialGradient>
              </defs>
              <path d="M200 0 L120 210 L280 210 Z" fill="url(#spot)" />
              <rect x="70" y="190" width="260" height="26" rx="4" fill="#4a3424" />
              <path d="M60 216 V110 a140 90 0 0 1 280 0 V216" fill="none" stroke="#d4a64a" strokeWidth="4" />
              {Array.from({ length: 5 }, (_, r) =>
                Array.from({ length: 11 - r }, (_, i) => {
                  const cx = 200 + (i - (10 - r) / 2) * (24 + r * 2);
                  const cy = 238 + r * 13;
                  const hot = r === 2 && i === 4;
                  return <rect key={`${r}-${i}`} x={cx - 7} y={cy - 5} width={14} height={9} rx={2} fill={hot ? '#ffe08a' : '#6f8f7d'} opacity={hot ? 1 : 0.55 + r * 0.06} />;
                }),
              )}
              <path d="M200 252 L200 214" stroke="#ffe08a" strokeDasharray="4 4" strokeWidth="2" />
              <circle cx="200" cy="200" r="4" fill="#ffe08a" />
            </svg>
            <div className="glass small" style={{ padding: '8px 12px', position: 'absolute', bottom: 12, insetInlineStart: 12 }}>
              <strong>VIP · C-5</strong> · <span className="num" style={{ color: 'var(--gold-2)' }}>94/100</span> {t('تقييم تقديري', 'est. score')}
            </div>
          </div>
        </div>
      </section>

      <div className="container page stack" style={{ paddingTop: 24 }}>
        <div className="row between">
          <h2 style={{ margin: 0 }}>{t('فعاليات مختارة', 'Featured events')}</h2>
          <Link to="/events">{t('كل الفعاليات ←', 'All events →')}</Link>
        </div>
        <ErrorBox error={error} onRetry={reload} />
        <div className="grid grid-3">
          {loading && !data && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 290 }} />)}
          {data?.slice(0, 6).map((e) => <EventCard key={e.id} e={e} />)}
        </div>

        <section className="grid grid-3" style={{ marginTop: 48 }} aria-label={t('كيف يشتغل SeatVision', 'How SeatVision works')}>
          {[
            ['🎯', t('إطلالة حقيقية من الكرسي', 'A real seat-level view'), t('الكاميرا تنتقل لمستوى عين شخص جالس في الكرسي نفسه وتتجه للمسرح — كل كرسي له منظوره.', 'The camera moves to seated eye height in that exact seat, facing the stage — every seat has its own view.')],
            ['📐', t('تقييم شفاف للرؤية', 'Transparent view score'), t('المسافة والزوايا والعوائق وارتفاع الصف محسوبة هندسياً بأوزان واضحة. تقدير، مو ضمان.', 'Distance, angles, obstructions and tier are computed geometrically with explicit weights. An estimate, not a guarantee.')],
            ['✨', t('اقتراح ذكي بالكويتي', 'Smart pick in your words'), t('"أبي ٤ كراسي يم بعض وبالنص" — نرجع لك كراسي متجاورة فعلاً ومتاحة وضمن ميزانيتك.', '"4 seats together in the centre" — we return genuinely adjacent, available seats within budget.')],
          ].map(([icon, title, body]) => (
            <div key={title} className="card">
              <div style={{ fontSize: 28 }}>{icon}</div>
              <h3>{title}</h3>
              <p className="muted small">{body}</p>
            </div>
          ))}
        </section>

        <section className="grid grid-2" style={{ marginTop: 32 }}>
          <div className="card" style={{ background: 'linear-gradient(135deg, #2a2230, #1c1820)' }}>
            <span className="badge badge-info">SpaceVision</span>
            <h3 style={{ marginTop: 8 }}>{t('للعارضين: احجز بوثك في المعرض', 'Exhibitors: request your booth')}</h3>
            <p className="muted small">{t('استكشف مخطط المعرض ثلاثي الأبعاد، قارن البوثات حسب الموقع والمساحة، وأرسل طلب حجز للمنظّم.', 'Explore the 3D floor plan, compare booths by position and size, and send a booking request to the organizer.')}</p>
            <Link className="btn" to="/exhibitions/small-business-expo">{t('استكشف المعرض التجريبي', 'Explore the demo expo')}</Link>
          </div>
          <div className="card" style={{ background: 'linear-gradient(135deg, #2b2410, #1c1820)' }}>
            <span className="badge badge-gold">Ebooking Quick Event</span>
            <h3 style={{ marginTop: 8 }}>{t('عندك فعالية مؤقتة في مول أو مكان عام؟', 'Running a pop-up event at a mall or venue?')}</h3>
            <p className="muted small">{t('أرسل طلبك، ونجهز لك عرض سعر مخصص ونظام تذاكر وتسجيل دخول خلال أيام.', 'Send a request and we prepare a custom quote, ticketing and check-in setup.')}</p>
            <Link className="btn btn-primary" to="/quick-event">{t('اطلب Quick Event', 'Request a Quick Event')}</Link>
          </div>
        </section>
        <div className="row" style={{ justifyContent: 'center', marginTop: 24, opacity: 0.6 }}><LogoMark size={28} /></div>
      </div>
      <style>{`
        .hero { border-bottom: 1px solid var(--line-soft); background: radial-gradient(800px 400px at 70% 0%, rgba(212,166,74,0.12), transparent 70%); }
        .hero-inner { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 32px; align-items: center; padding-block: 48px; }
        .hero-visual { position: relative; }
        @media (max-width: 860px) { .hero-inner { grid-template-columns: 1fr; padding-block: 28px; } .hero-visual { max-width: 420px; } }
      `}</style>
    </>
  );
}

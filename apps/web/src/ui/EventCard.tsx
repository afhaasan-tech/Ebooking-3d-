import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { DemoTag } from './components';

export const CATEGORY_LABEL: Record<string, [string, string, string]> = {
  theatre: ['مسرح', 'Theatre', '🎭'],
  concert: ['حفلات', 'Concerts', '🎶'],
  comedy: ['كوميديا', 'Comedy', '😂'],
  workshop: ['ورش عمل', 'Workshops', '🖋'],
  conference: ['مؤتمرات', 'Conferences', '🎤'],
  family: ['عائلي', 'Family', '👨‍👩‍👧'],
  exhibition: ['معارض', 'Exhibitions', '🏛'],
};

/** Original generated artwork per event: stage arch + spotlight in the event's accent colour. */
export function EventArt({ accent, category, height = 150 }: { accent: string; category: string; height?: number }) {
  const icon = CATEGORY_LABEL[category]?.[2] ?? '🎟';
  return (
    <div className="event-art" style={{ height, background: `radial-gradient(120% 90% at 50% 0%, ${accent}55 0%, #1a161d 60%)` }} aria-hidden>
      <svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <path d="M150 0 L95 150 L205 150 Z" fill={accent} opacity={0.12} />
        <path d="M60 150 V70 a90 60 0 0 1 180 0 V150" fill="none" stroke={accent} strokeOpacity={0.6} strokeWidth={3} />
        {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={40 + i * 28} cy={142} r={5} fill="#f3ead8" opacity={0.15 + (i % 3) * 0.1} />)}
      </svg>
      <span style={{ position: 'absolute', insetInlineStart: 14, bottom: 10, fontSize: 30 }}>{icon}</span>
    </div>
  );
}

export function EventCard({ e }: { e: any }) {
  const { t, pick, money, date, lang } = useI18n();
  const href = e.inventory_type === 'exhibition_booth' ? `/exhibitions/${e.slug}` : `/events/${e.slug}`;
  const cat = CATEGORY_LABEL[e.category];
  return (
    <Link to={href} className="card event-card">
      <EventArt accent={e.accent_color} category={e.category} />
      <div className="body">
        <div className="row" style={{ gap: 6 }}>
          <span className="badge">{cat ? (lang === 'ar' ? cat[0] : cat[1]) : e.category}</span>
          {e.demo && <DemoTag />}
          {e.inventory_type === 'assigned_seat' && <span className="badge badge-gold">SeatVision 3D</span>}
          {e.inventory_type === 'exhibition_booth' && <span className="badge badge-info">SpaceVision</span>}
        </div>
        <h3 style={{ margin: '4px 0 0' }}>{pick(e, 'title')}</h3>
        <div className="small muted">{pick(e, 'venue')}</div>
        <div className="spacer" />
        <div className="row between small">
          <span>{e.next_at ? date(e.next_at, { weekday: 'short', day: 'numeric', month: 'short' }) : t('قريباً', 'Coming soon')}</span>
          <strong className="num" style={{ color: 'var(--gold-2)' }}>
            {e.inventory_type === 'exhibition_booth' ? t('بوثات — السعر عند الطلب', 'Booths — Price on Request') : e.price_from != null ? `${t('من', 'From')} ${money(e.price_from)}` : ''}
          </strong>
        </div>
      </div>
    </Link>
  );
}

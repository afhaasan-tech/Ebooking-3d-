import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { useApi } from '../lib/useApi';
import { Empty, ErrorBox } from '../ui/components';
import { CATEGORY_LABEL, EventCard } from '../ui/EventCard';

export default function Events() {
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';
  const q = params.get('q') ?? '';
  const [text, setText] = useState(q);
  const [when, setWhen] = useState<'any' | 'week' | 'month'>('any');
  const path = `/api/events?${new URLSearchParams({ ...(category ? { category } : {}), ...(q ? { q } : {}) })}`;
  const { data, error, loading, reload } = useApi<any[]>(path);

  const filtered = useMemo(() => {
    if (!data) return [];
    const limit = when === 'week' ? 7 : when === 'month' ? 31 : Infinity;
    return data.filter((e) => e.upcoming > 0 && (limit === Infinity || (e.next_at && new Date(e.next_at).getTime() - Date.now() < limit * 86400000)));
  }, [data, when]);

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p);
  };

  return (
    <div className="container page stack">
      <h1>{category === 'exhibition' ? t('المعارض', 'Exhibitions') : t('اكتشف الفعاليات', 'Discover events')}</h1>
      <form className="row" role="search" onSubmit={(e) => { e.preventDefault(); set('q', text.trim()); }} style={{ flexWrap: 'nowrap', maxWidth: 560 }}>
        <label htmlFor="ev-q" className="sr-only">{t('بحث', 'Search')}</label>
        <input id="ev-q" className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('اسم الفعالية…', 'Event name…')} />
        <button className="btn">{t('بحث', 'Search')}</button>
      </form>
      <div className="row" role="group" aria-label={t('النوع', 'Type')} style={{ gap: 6 }}>
        <button className="btn btn-sm" aria-pressed={!category} onClick={() => set('category', '')}>{t('الكل', 'All')}</button>
        {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
          <button key={k} className="btn btn-sm" aria-pressed={category === k} style={category === k ? { borderColor: 'var(--gold)' } : undefined} onClick={() => set('category', k)}>
            {v[2]} {lang === 'ar' ? v[0] : v[1]}
          </button>
        ))}
      </div>
      <div className="row" role="group" aria-label={t('التاريخ', 'Date')} style={{ gap: 6 }}>
        {(['any', 'week', 'month'] as const).map((w) => (
          <button key={w} className="btn btn-sm btn-ghost" aria-pressed={when === w} style={when === w ? { color: 'var(--ivory)', borderColor: 'var(--line)' } : undefined} onClick={() => setWhen(w)}>
            {w === 'any' ? t('أي وقت', 'Any time') : w === 'week' ? t('هذا الأسبوع', 'This week') : t('هذا الشهر', 'This month')}
          </button>
        ))}
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="grid grid-3" aria-busy={loading}>
        {loading && !data && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 290 }} />)}
        {filtered.map((e) => <EventCard key={e.id} e={e} />)}
      </div>
      {!loading && data && filtered.length === 0 && <Empty title={t('ما فيه فعاليات مطابقة', 'No matching events')}>{t('جرّب نوعاً أو تاريخاً آخر.', 'Try another type or date.')}</Empty>}
    </div>
  );
}

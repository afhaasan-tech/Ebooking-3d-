import { useState, type CSSProperties } from 'react';
import { useI18n } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { Empty, SelectInput, Stat } from '../../ui/components';
import { Async, RefreshButton, useFmt, useLabels } from './kit';
import type { EventDetailData, InventorySeat, OrgEvent, SeatStatus } from './types';

const STATUSES: SeatStatus[] = ['available', 'held', 'sold', 'blocked'];

/** Status is shown by colour AND a distinct symbol (never colour alone). */
const SYMBOL: Record<SeatStatus, string> = { available: '○', held: '◐', sold: '●', blocked: '✕' };
const CELL: Record<SeatStatus, CSSProperties> = {
  available: { background: 'var(--seat-available)', color: '#0d1a12' },
  held: { background: 'var(--seat-held)', color: '#1a1408' },
  sold: { background: 'var(--seat-sold)', color: 'var(--ivory)' },
  blocked: { background: 'var(--seat-blocked)', color: 'var(--muted)', outline: '1px dashed #6a6270', outlineOffset: -1 },
};

function SeatCell({ status, title }: { status: SeatStatus; title?: string }) {
  return (
    <span
      title={title}
      style={{ ...(CELL[status] ?? CELL.blocked), display: 'inline-grid', placeItems: 'center', width: 18, height: 18, borderRadius: 4, fontSize: 11, lineHeight: 1, flexShrink: 0 }}
    >
      {SYMBOL[status] ?? '?'}
    </span>
  );
}

export default function Inventory({ orgId }: { orgId: string }) {
  const { t, pick } = useI18n();
  const events = useApi<OrgEvent[]>(`/api/org/${orgId}/events`);
  const [eventId, setEventId] = useState('');

  return (
    <>
      <h2 style={{ margin: 0 }}>{t('مخزون المقاعد', 'Seat inventory')}</h2>
      <Async state={events}>
        {(rows) => {
          const seated = rows.filter((e) => e.inventory_type === 'assigned_seat');
          if (!seated.length) {
            return (
              <Empty title={t('لا توجد فعاليات بمقاعد مرقّمة', 'No reserved-seating events')}>
                {t('مخزون المقاعد يخص الفعاليات ذات المقاعد المرقّمة فقط. سعة الدخول العام والجلسات تظهر في تفاصيل الفعالية.', 'Seat inventory applies to reserved-seating events only. General admission and session capacity are shown in the event details.')}
              </Empty>
            );
          }
          const selected = seated.some((e) => e.id === eventId) ? eventId : seated[0].id;
          return (
            <>
              <div style={{ maxWidth: 480 }}>
                <SelectInput label={t('الفعالية', 'Event')} value={selected} onChange={(e) => setEventId(e.target.value)}>
                  {seated.map((e) => (
                    <option key={e.id} value={e.id}>
                      {pick(e, 'title')}
                    </option>
                  ))}
                </SelectInput>
              </div>
              <PerformancePicker key={selected} orgId={orgId} eventId={selected} />
            </>
          );
        }}
      </Async>
    </>
  );
}

function PerformancePicker({ orgId, eventId }: { orgId: string; eventId: string }) {
  const { t, pick } = useI18n();
  const f = useFmt();
  const detail = useApi<EventDetailData>(`/api/org/${orgId}/events/${eventId}`);
  const [perfId, setPerfId] = useState('');
  return (
    <Async state={detail}>
      {(d) => {
        if (!d.performances.length) return <p className="muted">{t('لا توجد عروض لهذه الفعالية.', 'This event has no performances.')}</p>;
        const selected = d.performances.some((p) => p.id === perfId) ? perfId : d.performances[0].id;
        return (
          <>
            <div style={{ maxWidth: 480 }}>
              <SelectInput label={t('العرض', 'Performance')} value={selected} onChange={(e) => setPerfId(e.target.value)}>
                {d.performances.map((p) => {
                  const label = pick(p, 'label');
                  return (
                    <option key={p.id} value={p.id}>
                      {f.when(p.starts_at)}
                      {label ? ` — ${label}` : ''}
                    </option>
                  );
                })}
              </SelectInput>
            </div>
            <SeatGrid key={selected} orgId={orgId} performanceId={selected} />
          </>
        );
      }}
    </Async>
  );
}

function SeatGrid({ orgId, performanceId }: { orgId: string; performanceId: string }) {
  const inv = useApi<InventorySeat[]>(`/api/org/${orgId}/performances/${performanceId}/inventory`);
  const { t } = useI18n();
  return (
    <>
      <div className="row between">
        <h3 style={{ margin: 0 }}>{t('حالة المقاعد', 'Seat status')}</h3>
        <RefreshButton onClick={inv.reload} busy={inv.loading} />
      </div>
      <Async state={inv}>{(seats) => <SeatGridBody seats={seats} />}</Async>
    </>
  );
}

function SeatGridBody({ seats }: { seats: InventorySeat[] }) {
  const { t } = useI18n();
  const f = useFmt();
  const labels = useLabels();

  if (!seats.length) return <p className="muted">{t('لا يوجد مخزون مقاعد لهذا العرض.', 'No seat inventory for this performance.')}</p>;

  const counts: Record<SeatStatus, number> = { available: 0, held: 0, sold: 0, blocked: 0 };
  // section → row → seats (API order: section, row, seat number)
  const sections = new Map<string, Map<string, InventorySeat[]>>();
  for (const s of seats) {
    if (s.status in counts) counts[s.status] += 1;
    let rows = sections.get(s.section_code);
    if (!rows) {
      rows = new Map<string, InventorySeat[]>();
      sections.set(s.section_code, rows);
    }
    const row = rows.get(s.row_label);
    if (row) row.push(s);
    else rows.set(s.row_label, [s]);
  }

  const summarize = (list: InventorySeat[]) => {
    const c: Record<SeatStatus, number> = { available: 0, held: 0, sold: 0, blocked: 0 };
    for (const s of list) if (s.status in c) c[s.status] += 1;
    return STATUSES.filter((k) => c[k])
      .map((k) => `${labels.seat(k)} ${f.int(c[k])}`)
      .join(' · ');
  };

  return (
    <>
      <div className="grid grid-4">
        {STATUSES.map((s) => (
          <Stat key={s} label={labels.seat(s)} value={f.int(counts[s])} sub={t(`من أصل ${f.int(seats.length)}`, `of ${f.int(seats.length)}`)} />
        ))}
      </div>

      <div className="legend">
        <span className="sr-only">{t('دليل الرموز:', 'Key:')}</span>
        {STATUSES.map((s) => (
          <span key={s}>
            <span aria-hidden>
              <SeatCell status={s} />
            </span>
            {labels.seat(s)}
          </span>
        ))}
      </div>

      {[...sections].map(([section, rows]) => {
        const all = [...rows.values()].flat();
        return (
          <section key={section} className="card card-tight" aria-labelledby={`inv-sec-${section}`}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <h4 id={`inv-sec-${section}`} style={{ margin: 0, color: 'var(--ivory)' }}>
                {t('القسم', 'Section')} <span className="num">{section}</span>
              </h4>
              <span className="small muted">
                {summarize(all)} <span className="faint">({t('من', 'of')} {f.int(all.length)})</span>
              </span>
            </div>
            <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
              {[...rows].map(([row, list]) => {
                const notAvailable = STATUSES.filter((k) => k !== 'available')
                  .map((k) => {
                    const nums = list.filter((s) => s.status === k).map((s) => s.seat_number);
                    return nums.length ? `${labels.seat(k)}: ${nums.join(', ')}` : '';
                  })
                  .filter(Boolean)
                  .join('. ');
                return (
                  <div key={row} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, width: 'max-content' }}>
                    <span className="sr-only">
                      {t(`الصف ${row}: ${list.length} مقعد — ${summarize(list)}.`, `Row ${row}: ${list.length} seats — ${summarize(list)}.`)} {notAvailable && `${t('أرقام المقاعد', 'Seat numbers')} — ${notAvailable}.`}
                    </span>
                    <span aria-hidden className="num tiny muted" style={{ width: 26, textAlign: 'center', flexShrink: 0 }}>
                      {row}
                    </span>
                    <div aria-hidden style={{ display: 'flex', gap: 3 }}>
                      {list.map((s) => (
                        <SeatCell key={s.seat_code} status={s.status} title={`${s.seat_code} · ${labels.seat(s.status)} · ${s.category}`} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

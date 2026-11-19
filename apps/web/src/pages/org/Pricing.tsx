import { useId, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { Empty, SelectInput } from '../../ui/components';
import { Async, RefreshButton, filsToKwd, parseKwd, useAction, useErrorText, useFmt, useLabels } from './kit';
import type { EventDetailData, OrgEvent, TicketCategory } from './types';

const MAX_PRICE_FILS = 100_000_000; // API limit (100,000 KWD)

export default function Pricing({ orgId }: { orgId: string }) {
  const { t, pick } = useI18n();
  const labels = useLabels();
  const events = useApi<OrgEvent[]>(`/api/org/${orgId}/events`);
  const [eventId, setEventId] = useState('');

  return (
    <>
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t('أسعار التذاكر', 'Ticket pricing')}</h2>
        <RefreshButton onClick={events.reload} busy={events.loading} />
      </div>
      <div className="alert alert-info" role="note">
        <span aria-hidden>ℹ</span>
        <div className="small">
          {t(
            'الأسعار لكل فئة تذاكر وتُطبَّق على الحجوزات الجديدة فقط — الطلبات السابقة تحتفظ بالأسعار التي بيعت بها (لقطة وقت الشراء). أدخل المبلغ بالدينار بحد أقصى 3 خانات عشرية، و 0 يعني مجاني.',
            'Prices are per ticket category and apply to new bookings only — existing orders keep the prices they were sold at (snapshotted at purchase). Enter KWD with up to 3 decimals; 0 means free.',
          )}
        </div>
      </div>
      <Async state={events}>
        {(rows) => {
          const priceable = rows.filter((e) => e.inventory_type !== 'exhibition_booth');
          const hasExhibitions = rows.length > priceable.length;
          if (!priceable.length) {
            return (
              <Empty title={t('لا توجد فعاليات بتذاكر', 'No ticketed events')}>
                {hasExhibitions ? t('أسعار بوثات المعارض تُدار من قسم «العارضون».', 'Exhibition booth prices are managed in the Exhibitors tab.') : t('أنشئ فعالية أولاً من قسم «الفعاليات».', 'Create an event first from the Events tab.')}
              </Empty>
            );
          }
          const selected = priceable.some((e) => e.id === eventId) ? eventId : priceable[0].id;
          return (
            <>
              <div style={{ maxWidth: 480 }}>
                <SelectInput label={t('الفعالية', 'Event')} value={selected} onChange={(e) => setEventId(e.target.value)}>
                  {priceable.map((e) => (
                    <option key={e.id} value={e.id}>
                      {pick(e, 'title')} — {labels.inventory(e.inventory_type)}
                    </option>
                  ))}
                </SelectInput>
              </div>
              {hasExhibitions && (
                <p className="tiny faint" style={{ margin: 0 }}>
                  {t('أسعار بوثات المعارض تُدار من قسم «العارضون».', 'Exhibition booth prices are managed in the Exhibitors tab.')}
                </p>
              )}
              <CategoryPrices key={selected} orgId={orgId} eventId={selected} />
            </>
          );
        }}
      </Async>
    </>
  );
}

function CategoryPrices({ orgId, eventId }: { orgId: string; eventId: string }) {
  const { t } = useI18n();
  const detail = useApi<EventDetailData>(`/api/org/${orgId}/events/${eventId}`);
  const onSaved = (id: string, priceFils: number) =>
    detail.setData((d) => (d ? { ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, price_fils: priceFils } : c)) } : d));

  return (
    <Async state={detail}>
      {(d) =>
        d.categories.length === 0 ? (
          <p className="muted">{t('لا توجد فئات تذاكر لهذه الفعالية.', 'This event has no ticket categories.')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">{t('فئات التذاكر وتعديل الأسعار', 'Ticket categories and price editing')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('الفئة', 'Category')}</th>
                  <th scope="col">{t('الرمز', 'Code')}</th>
                  <th scope="col">{t('السعر الحالي', 'Current price')}</th>
                  <th scope="col">{t('السعر الجديد (د.ك)', 'New price (KWD)')}</th>
                </tr>
              </thead>
              <tbody>
                {d.categories.map((c) => (
                  <PriceRow key={c.id} orgId={orgId} cat={c} onSaved={onSaved} />
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </Async>
  );
}

function PriceRow({ orgId, cat, onSaved }: { orgId: string; cat: TicketCategory; onSaved: (id: string, priceFils: number) => void }) {
  const { t, pick } = useI18n();
  const f = useFmt();
  const errorText = useErrorText();
  const id = useId();
  const [value, setValue] = useState(filsToKwd(cat.price_fils));
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const act = useAction();
  const name = pick(cat, 'name');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    act.setError(null);
    const fils = parseKwd(value);
    if (fils == null || fils > MAX_PRICE_FILS) {
      setMsg({ kind: 'err', text: t('مبلغ غير صالح — مثال صحيح: 12.500 (الحد الأقصى 100,000).', 'Invalid amount — e.g. 12.500 (maximum 100,000).') });
      return;
    }
    if (fils === cat.price_fils) {
      setMsg({ kind: 'info', text: t('السعر لم يتغيّر.', 'Price unchanged.') });
      return;
    }
    setMsg(null);
    const r = await act.run(() => api<{ id: string; priceFils: number }>(`/api/org/${orgId}/categories/${cat.id}`, { method: 'PATCH', body: { priceFils: fils } }));
    if (r) {
      onSaved(cat.id, r.priceFils);
      setValue(filsToKwd(r.priceFils));
      setMsg({ kind: 'ok', text: t(`تم الحفظ: ${f.price(r.priceFils)}`, `Saved: ${f.price(r.priceFils)}`) });
    }
  };

  const shown = act.error ? { kind: 'err' as const, text: errorText(act.error) } : msg;
  const color = shown?.kind === 'err' ? 'var(--danger)' : shown?.kind === 'ok' ? 'var(--ok)' : 'var(--muted)';

  return (
    <tr>
      <th scope="row" style={{ fontWeight: 600, color: 'var(--ivory)' }}>
        <span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: cat.color, marginInlineEnd: 8 }} />
        {name}
      </th>
      <td>
        <span className="num">{cat.code}</span>
      </td>
      <td>
        <span className="num">{f.price(cat.price_fils)}</span>
      </td>
      <td>
        <form onSubmit={submit} noValidate className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
          <label htmlFor={id} className="sr-only">
            {t(`السعر الجديد لفئة ${name} بالدينار`, `New price for ${name} in KWD`)}
          </label>
          <input
            id={id}
            className="input"
            inputMode="decimal"
            dir="ltr"
            autoComplete="off"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setMsg(null);
              act.setError(null);
            }}
            aria-invalid={shown?.kind === 'err'}
            aria-describedby={shown ? `${id}-msg` : undefined}
            style={{ width: 130, minHeight: 38 }}
          />
          <button type="submit" className="btn btn-sm btn-primary" disabled={act.busy}>
            {act.busy ? t('جاري الحفظ…', 'Saving…') : t('حفظ', 'Save')}
          </button>
        </form>
        {shown && (
          <div id={`${id}-msg`} className="tiny" role={shown.kind === 'err' ? 'alert' : 'status'} style={{ color, whiteSpace: 'normal', maxWidth: 300, marginTop: 4 }}>
            {shown.kind === 'ok' ? '✓ ' : shown.kind === 'err' ? '⚠ ' : ''}
            {shown.text}
          </div>
        )}
      </td>
    </tr>
  );
}

import { useId, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { StatusBadge } from '../../ui/components';
import { ApiErrorAlert, Async, Clip, Flash, RefreshButton, filsToKwd, parseKwd, useAction, useErrorText, useFmt } from './kit';
import type { BoothRequest, OrgEvent, PublicBooth, PublicExhibition } from './types';

const MAX_BOOTH_FILS = 1_000_000_000; // API limit

export default function Exhibitors({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  const events = useApi<OrgEvent[]>(`/api/org/${orgId}/events`);
  return (
    <>
      <h2 style={{ margin: 0 }}>{t('العارضون والبوثات', 'Exhibitors & booths')}</h2>
      <BoothRequests orgId={orgId} />
      <section className="stack" aria-labelledby="ex-pricing">
        <h3 id="ex-pricing" style={{ margin: 0 }}>
          {t('أسعار البوثات', 'Booth prices')}
        </h3>
        <p className="small muted" style={{ margin: 0 }}>
          {t(
            'أدخل السعر بالدينار (حتى 3 خانات عشرية). اتركه فارغاً أو اختر «عند الطلب» ليظهر «السعر عند الطلب» ويُسعَّر البوث بعرض خاص.',
            'Enter the price in KWD (up to 3 decimals). Leave it empty or choose “On request” to show “Price on Request” and quote the booth individually.',
          )}
        </p>
        <Async state={events}>
          {(rows) => {
            const expos = rows.filter((e) => e.inventory_type === 'exhibition_booth');
            if (!expos.length) return <p className="muted">{t('لا توجد معارض لهذه المنظمة.', 'This organization has no exhibitions.')}</p>;
            return (
              <>
                {expos.map((e) => (
                  <BoothPricing key={e.id} orgId={orgId} event={e} />
                ))}
              </>
            );
          }}
        </Async>
      </section>
    </>
  );
}

function BoothRequests({ orgId }: { orgId: string }) {
  const { t, pick } = useI18n();
  const f = useFmt();
  const reqs = useApi<BoothRequest[]>(`/api/org/${orgId}/booth-requests`);
  const act = useAction();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const decide = async (r: BoothRequest, decision: 'approved' | 'rejected') => {
    const question =
      decision === 'approved'
        ? t(
            `الموافقة على طلب «${r.company_name}» للبوث ${r.booth_code}؟ سيتم حجز البوث ورفض أي طلبات معلّقة أخرى لنفس البوث تلقائياً.`,
            `Approve “${r.company_name}” for booth ${r.booth_code}? The booth will be booked and any other pending requests for it will be rejected automatically.`,
          )
        : t(`رفض طلب «${r.company_name}» للبوث ${r.booth_code}؟`, `Reject “${r.company_name}”'s request for booth ${r.booth_code}?`);
    if (!window.confirm(question)) return;
    setFlash(null);
    setPendingId(r.id);
    const res = await act.run(() => api(`/api/org/${orgId}/booth-requests/${r.id}/decision`, { method: 'POST', body: { decision } }));
    setPendingId(null);
    if (res) {
      setFlash(
        decision === 'approved'
          ? t(`تمت الموافقة: البوث ${r.booth_code} محجوز لـ «${r.company_name}».`, `Approved: booth ${r.booth_code} is booked for “${r.company_name}”.`)
          : t(`تم رفض طلب «${r.company_name}».`, `Rejected “${r.company_name}”'s request.`),
      );
    }
    // refresh in every case — a 409 means someone else decided first
    reqs.reload();
  };

  return (
    <section className="stack" aria-labelledby="ex-requests">
      <div className="row between">
        <h3 id="ex-requests" style={{ margin: 0 }}>
          {t('طلبات حجز البوثات', 'Booth booking requests')}
        </h3>
        <RefreshButton onClick={reqs.reload} busy={reqs.loading} />
      </div>
      {flash && <Flash onClose={() => setFlash(null)}>{flash}</Flash>}
      <ApiErrorAlert error={act.error} />
      <Async state={reqs}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="muted">{t('لا توجد طلبات من العارضين بعد.', 'No exhibitor requests yet.')}</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">{t('طلبات حجز البوثات', 'Booth booking requests')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('التاريخ', 'Date')}</th>
                    <th scope="col">{t('المعرض', 'Exhibition')}</th>
                    <th scope="col">{t('البوث', 'Booth')}</th>
                    <th scope="col">{t('الشركة', 'Company')}</th>
                    <th scope="col">{t('التواصل', 'Contact')}</th>
                    <th scope="col">{t('ملاحظات', 'Notes')}</th>
                    <th scope="col">{t('حالة الطلب', 'Request')}</th>
                    <th scope="col">{t('القرار', 'Decision')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{f.day(r.created_at)}</td>
                      <td>
                        <Clip text={pick(r, 'title')} max={200} />
                      </td>
                      <td>
                        <span className="num">{r.booth_code}</span>
                        <div className="tiny faint">
                          <span className="num">
                            {r.width_m}×{r.depth_m} m
                          </span>{' '}
                          · {f.price(r.price_fils)}
                        </div>
                        <StatusBadge status={r.booth_status} />
                      </td>
                      <td>
                        <Clip text={r.company_name} max={200} />
                        <div className="tiny faint">
                          <Clip text={r.product_category} max={200} />
                        </div>
                      </td>
                      <td>
                        <div>
                          <bdi>{r.contact_name}</bdi>
                        </div>
                        <div className="tiny">
                          <a href={`mailto:${r.email}`} dir="ltr">
                            {r.email}
                          </a>
                        </div>
                        <div className="tiny">
                          <a href={`tel:${r.mobile}`} dir="ltr" className="num">
                            {r.mobile}
                          </a>
                        </div>
                      </td>
                      <td className="small">{r.notes ? <Clip text={r.notes} max={220} /> : <span className="faint">—</span>}</td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td>
                        {r.status === 'pending' ? (
                          <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                            <button type="button" className="btn btn-sm btn-primary" disabled={pendingId !== null} onClick={() => decide(r, 'approved')} aria-label={t(`موافقة على طلب ${r.company_name}`, `Approve ${r.company_name}`)}>
                              {pendingId === r.id ? '…' : t('موافقة', 'Approve')}
                            </button>
                            <button type="button" className="btn btn-sm btn-danger" disabled={pendingId !== null} onClick={() => decide(r, 'rejected')} aria-label={t(`رفض طلب ${r.company_name}`, `Reject ${r.company_name}`)}>
                              {t('رفض', 'Reject')}
                            </button>
                          </div>
                        ) : (
                          <span className="faint small">{t('تم البتّ', 'Decided')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Async>
    </section>
  );
}

function BoothPricing({ orgId, event }: { orgId: string; event: OrgEvent }) {
  const { t, pick } = useI18n();
  const ex = useApi<PublicExhibition>(`/api/exhibitions/${encodeURIComponent(event.slug)}`);
  const onSaved = (b: { id: string; price_fils: number | null; status: string }) =>
    ex.setData((d) => (d ? { ...d, booths: d.booths.map((x) => (x.id === b.id ? { ...x, price_fils: b.price_fils, status: b.status } : x)) } : d));

  return (
    <div className="card card-tight stack">
      <h4 style={{ margin: 0, color: 'var(--ivory)' }}>{pick(event, 'title')}</h4>
      {ex.error?.status === 404 ? (
        <p className="muted small" style={{ margin: 0 }}>
          {t('قائمة البوثات تظهر هنا بعد نشر المعرض.', 'The booth list appears here once the exhibition is published.')}
        </p>
      ) : (
        <Async state={ex}>
          {(d) =>
            d.booths.length === 0 ? (
              <p className="muted small">{t('لا توجد بوثات.', 'No booths.')}</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">{t(`بوثات ${pick(event, 'title')}`, `Booths of ${pick(event, 'title')}`)}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('البوث', 'Booth')}</th>
                      <th scope="col">{t('المنطقة', 'Zone')}</th>
                      <th scope="col">{t('المساحة', 'Size')}</th>
                      <th scope="col">{t('الحالة', 'Status')}</th>
                      <th scope="col">{t('السعر الحالي', 'Current price')}</th>
                      <th scope="col">{t('تعديل السعر (د.ك)', 'Edit price (KWD)')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.booths.map((b) => (
                      <BoothRow key={b.id} orgId={orgId} booth={b} onSaved={onSaved} />
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </Async>
      )}
    </div>
  );
}

function BoothRow({ orgId, booth, onSaved }: { orgId: string; booth: PublicBooth; onSaved: (b: { id: string; price_fils: number | null; status: string }) => void }) {
  const { t } = useI18n();
  const f = useFmt();
  const errorText = useErrorText();
  const id = useId();
  const [value, setValue] = useState(filsToKwd(booth.price_fils));
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const act = useAction();

  const save = async (priceFils: number | null) => {
    act.setError(null);
    if (priceFils === booth.price_fils) {
      setMsg({ kind: 'info', text: t('السعر لم يتغيّر.', 'Price unchanged.') });
      return;
    }
    setMsg(null);
    const r = await act.run(() => api<{ id: string; price_fils: number | null; status: string }>(`/api/org/${orgId}/booths/${booth.id}`, { method: 'PATCH', body: { priceFils } }));
    if (r) {
      onSaved(r);
      setValue(filsToKwd(r.price_fils));
      setMsg({ kind: 'ok', text: t(`تم الحفظ: ${f.price(r.price_fils)}`, `Saved: ${f.price(r.price_fils)}`) });
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return void save(null);
    const fils = parseKwd(value);
    if (fils == null || fils > MAX_BOOTH_FILS) {
      act.setError(null);
      setMsg({ kind: 'err', text: t('مبلغ غير صالح — مثال صحيح: 250.000، أو اتركه فارغاً للسعر عند الطلب.', 'Invalid amount — e.g. 250.000, or leave empty for Price on Request.') });
      return;
    }
    void save(fils);
  };

  const shown = act.error ? { kind: 'err' as const, text: errorText(act.error) } : msg;
  const color = shown?.kind === 'err' ? 'var(--danger)' : shown?.kind === 'ok' ? 'var(--ok)' : 'var(--muted)';

  return (
    <tr>
      <th scope="row" style={{ color: 'var(--ivory)' }}>
        <span className="num">{booth.code}</span>
      </th>
      <td>{booth.zone}</td>
      <td>
        <span className="num">
          {booth.width}×{booth.depth} m
        </span>
      </td>
      <td>
        <StatusBadge status={booth.status} />
      </td>
      <td>
        <span className={booth.price_fils == null ? 'faint' : 'num'}>{f.price(booth.price_fils)}</span>
      </td>
      <td>
        <form onSubmit={submit} noValidate className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
          <label htmlFor={id} className="sr-only">
            {t(`سعر البوث ${booth.code} بالدينار`, `Price of booth ${booth.code} in KWD`)}
          </label>
          <input
            id={id}
            className="input"
            inputMode="decimal"
            dir="ltr"
            autoComplete="off"
            placeholder={t('عند الطلب', 'On request')}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setMsg(null);
              act.setError(null);
            }}
            aria-invalid={shown?.kind === 'err'}
            aria-describedby={shown ? `${id}-msg` : undefined}
            style={{ width: 120, minHeight: 38 }}
          />
          <button type="submit" className="btn btn-sm btn-primary" disabled={act.busy}>
            {t('حفظ', 'Save')}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={act.busy || booth.price_fils == null}
            onClick={() => void save(null)}
            title={t('إرجاع إلى «السعر عند الطلب»', 'Reset to “Price on Request”')}
            aria-label={t(`إرجاع سعر البوث ${booth.code} إلى «السعر عند الطلب»`, `Reset booth ${booth.code} to “Price on Request”`)}
          >
            {t('عند الطلب', 'On request')}
          </button>
        </form>
        {shown && (
          <div id={`${id}-msg`} className="tiny" role={shown.kind === 'err' ? 'alert' : 'status'} style={{ color, whiteSpace: 'normal', maxWidth: 320, marginTop: 4 }}>
            {shown.text}
          </div>
        )}
      </td>
    </tr>
  );
}

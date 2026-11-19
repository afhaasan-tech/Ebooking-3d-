import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { DemoTag, StatusBadge, TextArea, TextInput } from '../../ui/components';
import { ApiErrorAlert, Async, DL, Flash, bpsToPercent, parsePercentToBps, useAction, useFmt, useFocusOnMount, useLabels } from './kit';
import type { EventDetailData, Performance, SeatStatus } from './types';

export default function EventDetail({
  orgId,
  eventId,
  justCreated,
  onBack,
  onChanged,
}: {
  orgId: string;
  eventId: string;
  justCreated?: boolean;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { t, dir } = useI18n();
  const detail = useApi<EventDetailData>(`/api/org/${orgId}/events/${eventId}`);
  return (
    <>
      <div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <span aria-hidden>{dir === 'rtl' ? '→' : '←'}</span> {t('رجوع إلى الفعاليات', 'Back to events')}
        </button>
      </div>
      {justCreated && (
        <Flash>
          {t(
            'تم إنشاء الفعالية وإرسالها لموافقة فريق المنصة. حالتها الآن «بانتظار الموافقة» ولن تظهر للجمهور قبل الموافقة.',
            'Event created and submitted for platform approval. Its status is now “Pending approval” and it stays hidden from the public until approved.',
          )}
        </Flash>
      )}
      <Async state={detail}>
        {(d) => (
          <DetailBody
            d={d}
            orgId={orgId}
            onSaved={() => {
              detail.reload();
              onChanged();
            }}
          />
        )}
      </Async>
    </>
  );
}

const STATUS_NOTE: Record<string, [string, string, string]> = {
  pending_approval: ['بانتظار موافقة فريق المنصة — الفعالية غير ظاهرة للجمهور حتى تتم الموافقة.', 'Awaiting platform approval — hidden from the public until approved.', 'alert-warn'],
  draft: ['مسودة — غير ظاهرة للجمهور. عدّل ما يلزم ثم أعد إرسالها لموافقة فريق المنصة.', 'Draft — not visible to the public. Make any changes, then resubmit it for platform approval.', 'alert-info'],
  published: ['منشورة — ظاهرة للجمهور ومتاحة للحجز ضمن فترة البيع.', 'Published — visible to the public and bookable within its sales window.', 'alert-ok'],
  cancelled: ['ملغاة — غير متاحة للحجز.', 'Cancelled — not bookable.', 'alert-danger'],
};

function DetailBody({ d, orgId, onSaved }: { d: EventDetailData; orgId: string; onSaved: () => void }) {
  const { t, pick, lang } = useI18n();
  const f = useFmt();
  const labels = useLabels();
  const e = d.event;
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  const note = STATUS_NOTE[e.status];
  const publicPath = e.inventory_type === 'exhibition_booth' ? `/exhibitions/${e.slug}` : `/events/${e.slug}`;
  const description = pick(e, 'description');
  const submit = useAction();
  const resubmit = async () => {
    const r = await submit.run(() => api(`/api/org/${orgId}/events/${e.id}/submit`, { method: 'POST' }));
    if (r) onSaved();
  };

  return (
    <>
      <div className="stack">
        <h2 ref={headingRef} tabIndex={-1} style={{ marginBottom: 0 }}>
          {pick(e, 'title')}
        </h2>
        <div className="row" style={{ gap: 8 }}>
          <StatusBadge status={e.status} />
          {e.demo && <DemoTag />}
          <span className="small muted" lang={lang === 'ar' ? 'en' : 'ar'} dir={lang === 'ar' ? 'ltr' : 'rtl'}>
            {lang === 'ar' ? e.title_en : e.title_ar}
          </span>
        </div>
      </div>

      {note && (
        <div className={`alert ${note[2]}`} role="note">
          <div className="spacer">{lang === 'ar' ? note[0] : note[1]}</div>
          {e.status === 'draft' && (
            <button type="button" className="btn btn-sm btn-primary" disabled={submit.busy} onClick={() => void resubmit()}>
              {submit.busy ? '…' : t('إعادة الإرسال للموافقة', 'Resubmit for approval')}
            </button>
          )}
        </div>
      )}
      {submit.error && <ApiErrorAlert error={submit.error} />}

      <div className="grid grid-2">
        <section className="card card-tight" aria-labelledby="ev-info">
          <h3 id="ev-info">{t('معلومات الفعالية', 'Event information')}</h3>
          <DL
            items={[
              [t('التصنيف', 'Category'), labels.category(e.category)],
              [t('نوع الحجز', 'Inventory'), labels.inventory(e.inventory_type)],
              [
                t('رسوم الخدمة', 'Service fee'),
                <span key="fee">
                  <span className="num">{f.pct(e.service_fee_bps)}</span> + <span className="num">{f.amount(e.service_fee_fixed_fils)}</span> {t('لكل تذكرة (يدفعها العميل)', 'per ticket (paid by the customer)')}
                </span>,
              ],
              [t('الحد الأقصى للطلب', 'Max per order'), <span key="max" className="num">{f.int(e.max_per_order)}</span>],
              [t('تاريخ الإنشاء', 'Created'), f.whenFull(e.created_at)],
              [
                t('الصفحة العامة', 'Public page'),
                e.status === 'published' ? (
                  <Link key="link" to={publicPath}>
                    {t('عرض صفحة الفعالية', 'Open the event page')}
                  </Link>
                ) : (
                  <span key="nolink" className="faint">
                    {t('تظهر بعد النشر', 'Available once published')}
                  </span>
                ),
              ],
            ]}
          />
        </section>
        <section className="card card-tight" aria-labelledby="ev-desc">
          <h3 id="ev-desc">{t('الوصف', 'Description')}</h3>
          {description ? (
            <p dir="auto" style={{ whiteSpace: 'pre-line', margin: 0 }}>
              {description}
            </p>
          ) : (
            <p className="faint">{t('لا يوجد وصف.', 'No description.')}</p>
          )}
        </section>
      </div>

      <section className="stack" aria-labelledby="ev-cats">
        <h3 id="ev-cats" style={{ margin: 0 }}>
          {t('فئات التذاكر', 'Ticket categories')}
        </h3>
        {d.categories.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {e.inventory_type === 'exhibition_booth'
              ? t('المعارض تُسعَّر حسب البوث — أسعار البوثات من قسم «العارضون».', 'Exhibitions are priced per booth — manage booth prices in the Exhibitors tab.')
              : t('لا توجد فئات تذاكر.', 'No ticket categories.')}
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">{t('فئات التذاكر وأسعارها', 'Ticket categories and prices')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('الفئة', 'Category')}</th>
                    <th scope="col">{t('الرمز', 'Code')}</th>
                    <th scope="col">{t('السعر', 'Price')}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.categories.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: c.color, marginInlineEnd: 8 }} />
                        {pick(c, 'name')}
                      </td>
                      <td>
                        <span className="num">{c.code}</span>
                      </td>
                      <td>
                        <span className="num">{f.price(c.price_fils)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tiny faint" style={{ margin: 0 }}>
              {t('لتعديل الأسعار استخدم قسم «الأسعار».', 'To change prices, use the Pricing tab.')}
            </p>
          </>
        )}
      </section>

      <section className="stack" aria-labelledby="ev-perfs">
        <h3 id="ev-perfs" style={{ margin: 0 }}>
          {t('العروض والمخزون', 'Performances & inventory')}
        </h3>
        {d.performances.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {t('لا توجد عروض.', 'No performances.')}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">{t('العروض وحالة المخزون', 'Performances and inventory status')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('الموعد (بتوقيت الكويت)', 'Date (Kuwait time)')}</th>
                  <th scope="col">{t('الوصف', 'Label')}</th>
                  <th scope="col">{t('حالة البيع', 'Sales status')}</th>
                  <th scope="col">{t('المخزون', 'Inventory')}</th>
                </tr>
              </thead>
              <tbody>
                {d.performances.map((p) => (
                  <tr key={p.id}>
                    <td>{f.whenFull(p.starts_at)}</td>
                    <td>{pick(p, 'label') || <span className="faint">—</span>}</td>
                    <td>{labels.perf(p.status)}</td>
                    <td>
                      <PerfInventory p={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <EditEventForm orgId={orgId} ev={e} onSaved={onSaved} />
    </>
  );
}

const SEAT_ORDER: SeatStatus[] = ['available', 'held', 'sold', 'blocked'];

function PerfInventory({ p }: { p: Performance }) {
  const { t } = useI18n();
  const f = useFmt();
  const labels = useLabels();
  if (p.seat_status && Object.keys(p.seat_status).length) {
    const s = p.seat_status;
    const total = SEAT_ORDER.reduce((a, k) => a + (s[k] ?? 0), 0);
    return (
      <span className="small">
        {SEAT_ORDER.filter((k) => s[k])
          .map((k) => `${labels.seat(k)} ${f.int(s[k])}`)
          .join(' · ')}{' '}
        <span className="faint">
          ({t('من', 'of')} {f.int(total)})
        </span>
      </span>
    );
  }
  if (p.capacity?.length) {
    const c = p.capacity.reduce((a, x) => ({ capacity: a.capacity + x.capacity, held: a.held + x.held, sold: a.sold + x.sold }), { capacity: 0, held: 0, sold: 0 });
    return (
      <span className="small">
        {t('مُباع', 'Sold')} {f.int(c.sold)} / {f.int(c.capacity)} · {t('محجوز مؤقتاً', 'Held')} {f.int(c.held)} · {t('متاح', 'Available')} {f.int(Math.max(0, c.capacity - c.held - c.sold))}
      </span>
    );
  }
  return <span className="faint">—</span>;
}

function EditEventForm({ orgId, ev, onSaved }: { orgId: string; ev: EventDetailData['event']; onSaved: () => void }) {
  const { t } = useI18n();
  const [titleAr, setTitleAr] = useState(ev.title_ar);
  const [titleEn, setTitleEn] = useState(ev.title_en);
  const [descAr, setDescAr] = useState(ev.description_ar ?? '');
  const [descEn, setDescEn] = useState(ev.description_en ?? '');
  const [fee, setFee] = useState(bpsToPercent(ev.service_fee_bps));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<'saved' | 'unchanged' | null>(null);
  const act = useAction();
  /** Wraps a setter so editing a field clears its stale error and the last save message. */
  const edit = (key: string, setter: (v: string) => void) => (v: string) => {
    setter(v);
    setResult(null);
    if (errors[key]) setErrors(({ [key]: _drop, ...rest }) => rest);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setResult(null);
    const errs: Record<string, string> = {};
    const body: Record<string, unknown> = {};
    const ta = titleAr.trim();
    const te = titleEn.trim();
    if (ta.length < 3 || ta.length > 150) errs.titleAr = t('العنوان من 3 إلى 150 حرفاً.', 'Title must be 3–150 characters.');
    else if (ta !== ev.title_ar) body.titleAr = ta;
    if (te.length < 3 || te.length > 150) errs.titleEn = t('العنوان من 3 إلى 150 حرفاً.', 'Title must be 3–150 characters.');
    else if (te !== ev.title_en) body.titleEn = te;
    if (descAr.length > 2000) errs.descAr = t('الحد الأقصى 2000 حرف.', 'Maximum 2000 characters.');
    else if (descAr !== (ev.description_ar ?? '')) body.descriptionAr = descAr;
    if (descEn.length > 2000) errs.descEn = t('الحد الأقصى 2000 حرف.', 'Maximum 2000 characters.');
    else if (descEn !== (ev.description_en ?? '')) body.descriptionEn = descEn;
    const bps = parsePercentToBps(fee);
    if (bps == null || bps > 3000) errs.fee = t('أدخل نسبة من 0 إلى 30 (حتى خانتين عشريتين).', 'Enter a percentage from 0 to 30 (up to 2 decimals).');
    else if (bps !== ev.service_fee_bps) body.serviceFeeBps = bps;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (Object.keys(body).length === 0) {
      setResult('unchanged');
      return;
    }
    const r = await act.run(() => api(`/api/org/${orgId}/events/${ev.id}`, { method: 'PATCH', body }));
    if (r) {
      setResult('saved');
      onSaved();
    }
  };

  return (
    <section className="card" aria-labelledby="ev-edit">
      <h3 id="ev-edit">{t('تعديل أساسي', 'Basic edit')}</h3>
      <form onSubmit={submit} noValidate className="stack">
        {/* pairs in separate grids: .grid-2 auto-fits 3 columns on wide screens */}
        <div className="grid grid-2">
          <TextInput label={t('العنوان بالعربي', 'Arabic title')} value={titleAr} onChange={(e) => edit('titleAr', setTitleAr)(e.target.value)} error={errors.titleAr} dir="rtl" lang="ar" maxLength={150} required />
          <TextInput label={t('العنوان بالإنجليزي', 'English title')} value={titleEn} onChange={(e) => edit('titleEn', setTitleEn)(e.target.value)} error={errors.titleEn} dir="ltr" lang="en" maxLength={150} required />
        </div>
        <div className="grid grid-2">
          <TextArea label={t('الوصف بالعربي', 'Arabic description')} value={descAr} onChange={(e) => edit('descAr', setDescAr)(e.target.value)} error={errors.descAr} dir="rtl" lang="ar" maxLength={2000} />
          <TextArea label={t('الوصف بالإنجليزي', 'English description')} value={descEn} onChange={(e) => edit('descEn', setDescEn)(e.target.value)} error={errors.descEn} dir="ltr" lang="en" maxLength={2000} />
        </div>
        <div style={{ maxWidth: 320 }}>
          <TextInput
            label={t('نسبة رسوم الخدمة (%)', 'Service fee (%)')}
            hint={t('من 0 إلى 30. تُطبَّق على الطلبات الجديدة فقط؛ الطلبات السابقة تحتفظ برسومها.', 'From 0 to 30. Applies to new orders only; existing orders keep their fees.')}
            value={fee}
            onChange={(e) => edit('fee', setFee)(e.target.value)}
            error={errors.fee}
            inputMode="decimal"
            dir="ltr"
            autoComplete="off"
          />
        </div>
        <ApiErrorAlert error={act.error} />
        {result === 'saved' && <Flash>{t('تم حفظ التعديلات.', 'Changes saved.')}</Flash>}
        {result === 'unchanged' && (
          <p className="small muted" role="status" style={{ margin: 0 }}>
            {t('لا توجد تغييرات للحفظ.', 'There are no changes to save.')}
          </p>
        )}
        <div>
          <button type="submit" className="btn btn-primary" disabled={act.busy}>
            {act.busy ? t('جاري الحفظ…', 'Saving…') : t('حفظ التعديلات', 'Save changes')}
          </button>
        </div>
      </form>
    </section>
  );
}

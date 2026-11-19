import { useRef, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { SelectInput, TextArea, TextInput } from '../../ui/components';
import { ApiErrorAlert, ChoiceGroup, kuwaitLocalToIso, kuwaitNowLocal, parseIntStrict, parseKwd, useAction, useFmt, useFocusOnMount, useLabels } from './kit';

const CATEGORIES = ['theatre', 'concert', 'comedy', 'workshop', 'conference', 'family'] as const;
type Category = (typeof CATEGORIES)[number];
type Kind = 'general_admission' | 'time_slot';

const MAX_PRICE_FILS = 100_000_000; // API limit (100,000 KWD)

interface FormState {
  titleAr: string;
  titleEn: string;
  category: Category;
  inventoryType: Kind;
  capacity: string;
  price: string;
  startsAt: string;
  descriptionAr: string;
  descriptionEn: string;
}

export default function CreateEvent({ orgId, onCancel, onCreated }: { orgId: string; onCancel: () => void; onCreated: (id: string) => void }) {
  const { t, dir } = useI18n();
  const f = useFmt();
  const labels = useLabels();
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  const [s, setS] = useState<FormState>({
    titleAr: '',
    titleEn: '',
    category: 'theatre',
    inventoryType: 'general_admission',
    capacity: '',
    price: '',
    startsAt: '',
    descriptionAr: '',
    descriptionEn: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const act = useAction();
  const formRef = useRef<HTMLFormElement>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setS((p) => ({ ...p, [k]: v }));
    // editing a field clears its stale error (errors are re-checked on submit)
    setErrors((e) => {
      if (!e[k]) return e;
      const next = { ...e };
      delete next[k];
      return next;
    });
  };

  const priceFils = parseKwd(s.price);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Partial<Record<keyof FormState, string>> = {};
    const titleAr = s.titleAr.trim();
    const titleEn = s.titleEn.trim();
    if (titleAr.length < 3 || titleAr.length > 150) errs.titleAr = t('العنوان من 3 إلى 150 حرفاً.', 'Title must be 3–150 characters.');
    if (titleEn.length < 3 || titleEn.length > 150) errs.titleEn = t('العنوان من 3 إلى 150 حرفاً.', 'Title must be 3–150 characters.');
    else if (!/[A-Za-z]/.test(titleEn)) errs.titleEn = t('استخدم حروفاً إنجليزية (يُستخدم في رابط الفعالية).', 'Use English letters (it is used for the event link).');
    const capacity = parseIntStrict(s.capacity, 1, 20000);
    if (capacity == null) errs.capacity = t('أدخل عدداً صحيحاً من 1 إلى 20,000.', 'Enter a whole number from 1 to 20,000.');
    if (priceFils == null) errs.price = t('أدخل المبلغ بالدينار بحد أقصى 3 خانات عشرية، مثل 12.500 (أو 0 للمجاني).', 'Enter the amount in KWD with up to 3 decimals, e.g. 12.500 (or 0 for free).');
    else if (priceFils > MAX_PRICE_FILS) errs.price = t('الحد الأقصى 100,000 د.ك.', 'Maximum is KWD 100,000.');
    const startsAt = kuwaitLocalToIso(s.startsAt);
    if (!startsAt) errs.startsAt = t('اختر التاريخ والوقت.', 'Choose a date and time.');
    else if (new Date(startsAt).getTime() < Date.now() + 10 * 60_000) errs.startsAt = t('اختر موعداً في المستقبل (بعد 10 دقائق على الأقل).', 'Choose a future time (at least 10 minutes from now).');
    if (s.descriptionAr.length > 2000) errs.descriptionAr = t('الحد الأقصى 2000 حرف.', 'Maximum 2000 characters.');
    if (s.descriptionEn.length > 2000) errs.descriptionEn = t('الحد الأقصى 2000 حرف.', 'Maximum 2000 characters.');
    setErrors(errs);
    if (Object.keys(errs).length || capacity == null || priceFils == null || !startsAt) {
      const first = Object.keys(errs)[0];
      if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    const r = await act.run(() =>
      api<{ id: string; slug: string; status: string }>(`/api/org/${orgId}/events`, {
        method: 'POST',
        body: {
          titleAr,
          titleEn,
          category: s.category,
          inventoryType: s.inventoryType,
          capacity,
          priceFils,
          startsAt,
          descriptionAr: s.descriptionAr,
          descriptionEn: s.descriptionEn,
        },
      }),
    );
    if (r) onCreated(r.id);
  };

  return (
    <>
      <div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          <span aria-hidden>{dir === 'rtl' ? '→' : '←'}</span> {t('رجوع إلى الفعاليات', 'Back to events')}
        </button>
      </div>
      <h2 ref={headingRef} tabIndex={-1} style={{ margin: 0 }}>
        {t('إنشاء فعالية جديدة', 'Create a new event')}
      </h2>
      <div className="alert alert-info" role="note">
        <span aria-hidden>ℹ</span>
        <div className="small">
          <p style={{ margin: 0 }}>
            {t(
              'الفعالية الجديدة تُرسل لموافقة فريق المنصة بحالة «بانتظار الموافقة» — ما يُنشر شيء تلقائياً، ولا تظهر للجمهور قبل الموافقة.',
              'New events are submitted for platform approval with status “Pending approval” — nothing is published automatically, and the event stays hidden until approved.',
            )}
          </p>
          <p style={{ margin: '6px 0 0' }}>
            {t(
              'تُنشأ بعرض واحد في الموعد المختار، وفئة تذاكر واحدة «دخول عام»، في قاعة المجتمع التجريبية (مكان خيالي). رسوم الخدمة الافتراضية للمنصة تُطبَّق ويمكن تعديل نسبتها بعد الإنشاء.',
              'It is created with one performance at the chosen time, a single “General Admission” ticket category, at the Demo Community Hall (a fictional venue). The platform default service fee applies; you can adjust its percentage after creation.',
            )}
          </p>
        </div>
      </div>

      <form ref={formRef} onSubmit={submit} noValidate className="card stack">
        <div className="grid grid-2">
          <TextInput name="titleAr" label={t('العنوان بالعربي', 'Arabic title')} value={s.titleAr} onChange={(e) => set('titleAr', e.target.value)} error={errors.titleAr} dir="rtl" lang="ar" maxLength={150} required />
          <TextInput
            name="titleEn"
            label={t('العنوان بالإنجليزي', 'English title')}
            hint={t('يُستخدم لإنشاء رابط الفعالية.', 'Used to build the event link.')}
            value={s.titleEn}
            onChange={(e) => set('titleEn', e.target.value)}
            error={errors.titleEn}
            dir="ltr"
            lang="en"
            maxLength={150}
            required
          />
        </div>

        <div className="grid grid-2">
          <SelectInput name="category" label={t('التصنيف', 'Category')} value={s.category} onChange={(e) => set('category', e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {labels.category(c)}
              </option>
            ))}
          </SelectInput>
          <ChoiceGroup<Kind>
            legend={t('نوع الحجز', 'Booking type')}
            name="ce-kind"
            value={s.inventoryType}
            onChange={(v) => set('inventoryType', v)}
            options={[
              { value: 'general_admission', label: t('دخول عام (بدون مقاعد مرقّمة)', 'General admission (no assigned seats)') },
              { value: 'time_slot', label: t('جلسة بموعد محدد', 'Timed session') },
            ]}
          />
        </div>

        <div className="grid grid-2">
          <TextInput
            name="capacity"
            label={s.inventoryType === 'time_slot' ? t('السعة (عدد الأماكن في الجلسة)', 'Capacity (places in the session)') : t('السعة (عدد التذاكر)', 'Capacity (number of tickets)')}
            hint={t('من 1 إلى 20,000.', 'From 1 to 20,000.')}
            value={s.capacity}
            onChange={(e) => set('capacity', e.target.value)}
            error={errors.capacity}
            inputMode="numeric"
            dir="ltr"
            autoComplete="off"
            required
          />
          <TextInput
            name="price"
            label={t('سعر التذكرة (د.ك)', 'Ticket price (KWD)')}
            hint={priceFils != null && !errors.price ? t(`السعر: ${f.amount(priceFils)}`, `Price: ${f.amount(priceFils)}`) : t('حتى 3 خانات عشرية، مثل 12.500 — و 0 للمجاني.', 'Up to 3 decimals, e.g. 12.500 — 0 for free.')}
            value={s.price}
            onChange={(e) => set('price', e.target.value)}
            error={errors.price}
            inputMode="decimal"
            dir="ltr"
            placeholder="0.000"
            autoComplete="off"
            required
          />
        </div>

        <div style={{ maxWidth: 360 }}>
          <TextInput
            name="startsAt"
            type="datetime-local"
            label={t('تاريخ ووقت البداية (بتوقيت الكويت)', 'Start date & time (Kuwait time)')}
            hint={t('يتوقف البيع عند بداية العرض.', 'Sales close when the performance starts.')}
            value={s.startsAt}
            min={kuwaitNowLocal(10)}
            onChange={(e) => set('startsAt', e.target.value)}
            error={errors.startsAt}
            dir="ltr"
            required
          />
        </div>

        <div className="grid grid-2">
          <TextArea name="descriptionAr" label={t('الوصف بالعربي (اختياري)', 'Arabic description (optional)')} value={s.descriptionAr} onChange={(e) => set('descriptionAr', e.target.value)} error={errors.descriptionAr} dir="rtl" lang="ar" maxLength={2000} />
          <TextArea name="descriptionEn" label={t('الوصف بالإنجليزي (اختياري)', 'English description (optional)')} value={s.descriptionEn} onChange={(e) => set('descriptionEn', e.target.value)} error={errors.descriptionEn} dir="ltr" lang="en" maxLength={2000} />
        </div>

        <ApiErrorAlert error={act.error} />
        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={act.busy}>
            {act.busy ? t('جاري الإرسال…', 'Submitting…') : t('إنشاء وإرسال للموافقة', 'Create & submit for approval')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t('إلغاء', 'Cancel')}
          </button>
        </div>
      </form>
    </>
  );
}

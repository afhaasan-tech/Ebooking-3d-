import { useRef, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { TextArea, TextInput } from '../../ui/components';
import { ApiErrorAlert, parseIntStrict, parseKwd, useAction, useFmt } from '../org/kit';

const MAX_LINE_FILS = 1_000_000_000; // API limit per line amount
const MAX_LINES = 30;

interface Line {
  key: number;
  description: string;
  amount: string;
  quantity: string;
}

/**
 * Custom quote for one Quick Event request. Amounts are typed in KWD and converted to integer fils
 * by string parsing; the total is integer arithmetic (amountFils × quantity), recomputed live.
 */
export default function QuoteBuilder({
  requestId,
  reference,
  revising,
  onCancel,
  onSent,
}: {
  requestId: string;
  reference: string;
  revising: boolean;
  onCancel: () => void;
  onSent: (totalFils: number) => void;
}) {
  const { t } = useI18n();
  const f = useFmt();
  const nextKey = useRef(2);
  const [lines, setLines] = useState<Line[]>([{ key: 1, description: '', amount: '', quantity: '1' }]);
  const [validDays, setValidDays] = useState('14');
  const [notes, setNotes] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const act = useAction();

  const parsed = lines.map((l) => {
    const description = l.description.trim();
    const amountFils = parseKwd(l.amount);
    const quantity = parseIntStrict(l.quantity, 1, 10000);
    const descErr = description.length < 2 || description.length > 200 ? t('الوصف من 2 إلى 200 حرف.', 'Description must be 2–200 characters.') : null;
    const amountErr = amountFils == null ? t('مثال صحيح: 150.000', 'e.g. 150.000') : amountFils > MAX_LINE_FILS ? t('المبلغ أكبر من المسموح.', 'Amount is too large.') : null;
    const qtyErr = quantity == null ? t('عدد صحيح من 1 إلى 10,000.', 'Whole number from 1 to 10,000.') : null;
    const lineTotal = !amountErr && amountFils != null && quantity != null ? amountFils * quantity : null;
    return { description, amountFils, quantity, descErr, amountErr, qtyErr, lineTotal };
  });
  const total = parsed.reduce((a, p) => a + (p.lineTotal ?? 0), 0);
  const linesValid = parsed.every((p) => !p.descErr && !p.amountErr && !p.qtyErr);
  const days = parseIntStrict(validDays, 1, 90);
  const notesErr = notes.length > 2000 ? t('الحد الأقصى 2000 حرف.', 'Maximum 2000 characters.') : null;

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => (ls.length >= MAX_LINES ? ls : [...ls, { key: nextKey.current++, description: '', amount: '', quantity: '1' }]));
  const removeLine = (key: number) => setLines((ls) => (ls.length <= 1 ? ls : ls.filter((l) => l.key !== key)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (!linesValid || days == null || notesErr || !Number.isSafeInteger(total)) return;
    const ok = window.confirm(
      t(
        `إرسال عرض سعر بإجمالي ${f.amount(total)} للطلب ${reference}؟ سيرى العميل العرض ويقرر قبوله أو رفضه.${revising ? ' سيتم إنهاء العرض المفتوح الحالي.' : ''}`,
        `Send a quote totalling ${f.amount(total)} for request ${reference}? The customer will see it and decide to accept or decline.${revising ? ' The currently open quote will be expired.' : ''}`,
      ),
    );
    if (!ok) return;
    const r = await act.run(() =>
      api<{ id: string; totalFils: number; status: string }>(`/api/admin/quick-events/${requestId}/quotes`, {
        method: 'POST',
        body: {
          items: parsed.map((p) => ({ description: p.description, amountFils: p.amountFils as number, quantity: p.quantity as number })),
          validDays: days,
          notes,
        },
      }),
    );
    if (r) onSent(r.totalFils);
  };

  return (
    <form onSubmit={submit} noValidate className="card stack" aria-labelledby={`qb-${requestId}`} style={{ background: 'var(--bg-2)' }}>
      <h4 id={`qb-${requestId}`} style={{ margin: 0, color: 'var(--ivory)' }}>
        {revising ? t('عرض سعر معدّل', 'Revised quote') : t('عرض سعر جديد', 'New quote')} — <span className="num">{reference}</span>
      </h4>
      <p className="small muted" style={{ margin: 0 }}>
        {t(
          'الأسعار هنا عرض مخصص لهذا الطلب — ما فيه قائمة أسعار ثابتة. أدخل المبالغ بالدينار (حتى 3 خانات عشرية).',
          'Prices here are a custom quote for this request — there is no fixed price list. Enter amounts in KWD (up to 3 decimals).',
        )}
        {revising && ` ${t('إرسال عرض جديد يُنهي العرض المفتوح الحالي.', 'Sending a new quote expires the currently open one.')}`}
      </p>

      {lines.map((l, i) => {
        const p = parsed[i];
        return (
          <fieldset key={l.key} style={{ border: '1px solid var(--line-soft)', borderRadius: 'var(--r2)', padding: 'var(--s3)', margin: 0, minWidth: 0 }}>
            <legend className="small" style={{ padding: '0 6px', color: 'var(--muted)' }}>
              {t(`البند ${i + 1}`, `Item ${i + 1}`)}
            </legend>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', alignItems: 'start' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <TextInput label={t('الوصف', 'Description')} value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} error={showErrors ? p.descErr : null} maxLength={200} />
              </div>
              <TextInput label={t('المبلغ (د.ك)', 'Amount (KWD)')} value={l.amount} onChange={(e) => update(l.key, { amount: e.target.value })} error={showErrors ? p.amountErr : null} inputMode="decimal" dir="ltr" placeholder="0.000" autoComplete="off" />
              <TextInput label={t('الكمية', 'Quantity')} value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} error={showErrors ? p.qtyErr : null} inputMode="numeric" dir="ltr" autoComplete="off" />
              <div className="field">
                <span className="small muted">{t('إجمالي البند', 'Line total')}</span>
                <output className="num" style={{ paddingBlock: 10 }}>
                  {p.lineTotal == null ? '—' : f.amount(p.lineTotal)}
                </output>
              </div>
            </div>
            {lines.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLine(l.key)} aria-label={t(`حذف البند ${i + 1}`, `Remove item ${i + 1}`)}>
                ✕ {t('حذف البند', 'Remove item')}
              </button>
            )}
          </fieldset>
        );
      })}

      <div>
        <button type="button" className="btn btn-sm" onClick={addLine} disabled={lines.length >= MAX_LINES}>
          <span aria-hidden>＋</span> {t('إضافة بند', 'Add item')}
        </button>
      </div>

      <div className="grid grid-2">
        <TextInput
          label={t('صلاحية العرض (أيام)', 'Valid for (days)')}
          hint={t('من 1 إلى 90 يوماً.', 'From 1 to 90 days.')}
          value={validDays}
          onChange={(e) => setValidDays(e.target.value)}
          error={showErrors && days == null ? t('عدد أيام من 1 إلى 90.', 'Enter 1–90 days.') : null}
          inputMode="numeric"
          dir="ltr"
          autoComplete="off"
        />
        <TextArea label={t('ملاحظات للعميل (اختياري)', 'Notes for the customer (optional)')} value={notes} onChange={(e) => setNotes(e.target.value)} error={notesErr} maxLength={2000} />
      </div>

      <div className="row between" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
        <span className="small muted">{t('الإجمالي', 'Total')}</span>
        <output aria-live="polite" className="num" style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--ivory)' }}>
          {f.amount(total)}
        </output>
      </div>
      {!linesValid && showErrors && (
        <p className="small" role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
          {t('صحّح البنود المعلَّمة قبل الإرسال.', 'Fix the highlighted items before sending.')}
        </p>
      )}

      <ApiErrorAlert error={act.error} />
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={act.busy}>
          {act.busy ? t('جاري الإرسال…', 'Sending…') : t('إرسال العرض للعميل', 'Send quote to customer')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={act.busy}>
          {t('إلغاء', 'Cancel')}
        </button>
      </div>
    </form>
  );
}

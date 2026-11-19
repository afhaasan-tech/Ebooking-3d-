import { useId, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { DemoTag } from '../../ui/components';
import { useErrorText, useFmt } from './kit';
import type { CheckinResponse } from './types';

type Outcome = 'checked_in' | 'already_used' | 'void' | 'invalid_code' | 'not_for_this_organizer' | 'not_found' | 'error';

interface Scan {
  n: number;
  at: number;
  outcome: Outcome;
  tail: string;
  ticket?: CheckinResponse['ticket'];
  error?: ApiError;
}

const KNOWN: Outcome[] = ['checked_in', 'already_used', 'void', 'invalid_code', 'not_for_this_organizer', 'not_found'];

/** [ar title, en title, ar hint, en hint, alert class, symbol] */
const COPY: Record<Outcome, [string, string, string, string, string, string]> = {
  checked_in: ['تم تسجيل الحضور — اسمح بالدخول', 'Checked in — admit', 'التذكرة صالحة وتم استخدامها الآن.', 'The ticket is valid and has now been used.', 'alert-ok', '✓'],
  already_used: ['التذكرة مستخدمة مسبقاً — لا تسمح بالدخول', 'Already used — do not admit', 'تم تسجيل هذه التذكرة من قبل. راجع المشرف إذا لزم.', 'This ticket was scanned before. Escalate to a supervisor if needed.', 'alert-warn', '⚠'],
  void: ['تذكرة ملغاة — لا تسمح بالدخول', 'Void ticket — do not admit', 'التذكرة ملغاة (مثلاً بعد استرجاع المبلغ).', 'The ticket was voided (for example after a refund).', 'alert-danger', '✕'],
  invalid_code: ['رمز غير صالح', 'Invalid code', 'تأكد إن الرمز كامل ويبدأ بـ EBK1. ثم امسحه مرة ثانية.', 'Make sure the full code was captured (it starts with EBK1.) and scan again.', 'alert-danger', '✕'],
  not_for_this_organizer: ['التذكرة ليست لفعاليات هذا المنظّم', 'Ticket is not for this organizer', 'هذه التذكرة تخص منظّماً آخر — لا تسمح بالدخول.', 'This ticket belongs to another organizer — do not admit.', 'alert-danger', '✕'],
  not_found: ['التذكرة غير موجودة', 'Ticket not found', 'لم يتم العثور على التذكرة.', 'The ticket could not be found.', 'alert-danger', '✕'],
  error: ['لم تتم معالجة المسح', 'Scan not processed', '', '', 'alert-danger', '⚠'],
};

export default function CheckIn({ orgId }: { orgId: string }) {
  const { t, lang } = useI18n();
  const f = useFmt();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [scans, setScans] = useState<Scan[]>([]);
  const last = scans[0];

  // Scans are queued and verified one at a time, in order: a fast second scan typed while the first
  // is still being verified is never dropped or wiped, and results are shown in scan order.
  const queue = useRef<string[]>([]);
  const running = useRef(false);

  const record = (s: Omit<Scan, 'n' | 'at'>) => setScans((prev) => [{ ...s, n: ++counter.current, at: Date.now() }, ...prev].slice(0, 25));

  const drain = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    while (queue.current.length) {
      const c = queue.current.shift()!;
      const tail = c.length > 10 ? `…${c.slice(-6)}` : c;
      try {
        const r = await api<CheckinResponse>(`/api/org/${orgId}/checkin`, { method: 'POST', body: { code: c } });
        const outcome = (KNOWN as string[]).includes(r.result) ? (r.result as Outcome) : 'not_found';
        record({ outcome, tail, ticket: r.ticket });
      } catch (err) {
        record({ outcome: 'error', tail, error: err instanceof ApiError ? err : new ApiError(0, 'network_error') });
        // Not processed: put the code back (unless a new scan is already typed) so Enter retries it.
        setCode((cur) => cur || c);
        requestAnimationFrame(() => inputRef.current?.select());
      }
    }
    running.current = false;
    setBusy(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().slice(0, 200);
    inputRef.current?.focus();
    if (!c) return;
    setCode(''); // ready for the next scan immediately
    queue.current.push(c);
    void drain();
  };

  const admitted = scans.filter((s) => s.outcome === 'checked_in').length;
  const refused = scans.filter((s) => s.outcome !== 'checked_in' && s.outcome !== 'error').length;
  const arabicTyped = /\p{Script=Arabic}/u.test(code);

  return (
    <>
      <h2 style={{ margin: 0 }}>{t('تسجيل الحضور', 'Check-in')}</h2>
      <p className="muted small" style={{ margin: 0 }}>
        {t(
          'امسح رمز التذكرة بالماسح الضوئي أو الصقه ثم اضغط Enter. يبقى المؤشر في الحقل لمسح التذكرة التالية مباشرة.',
          'Scan the ticket code with a barcode/QR scanner or paste it, then press Enter. The cursor stays in the field so you can scan the next ticket right away.',
        )}
      </p>

      <form onSubmit={submit} className="card stack" noValidate>
        <div className="field">
          <label htmlFor={inputId}>{t('رمز التذكرة', 'Ticket code')}</label>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
            <input
              id={inputId}
              ref={inputRef}
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="EBK1.xxxxxxxx-xxxx-…"
              dir="ltr"
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              maxLength={200}
              aria-describedby={`${inputId}-hint`}
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: '1rem' }}
            />
            <button type="submit" className="btn btn-primary" disabled={!code.trim()}>
              {t('تحقق', 'Check in')}
            </button>
          </div>
          {busy && (
            <span className="hint" role="status">
              {t('جاري التحقق…', 'Checking…')}
            </span>
          )}
          <span id={`${inputId}-hint`} className="hint">
            {t('صيغة الرمز: EBK1.<رقم التذكرة>.<التوقيع>', 'Code format: EBK1.<ticket id>.<signature>')}
          </span>
          {arabicTyped && (
            <span className="error" role="alert">
              {t('الرمز فيه حروف عربية — غيّر لغة لوحة المفاتيح إلى الإنجليزية ثم امسح مرة ثانية.', 'The code contains Arabic letters — switch the keyboard layout to English and scan again.')}
            </span>
          )}
        </div>
      </form>

      <div aria-live="assertive" aria-atomic="true">
        {last && <ResultCard key={last.n} scan={last} />}
      </div>

      {scans.length > 0 && (
        <section className="stack" aria-labelledby="ci-log">
          <div className="row between">
            <h3 id="ci-log" style={{ margin: 0 }}>
              {t('سجل هذه الجلسة', 'This session')}
            </h3>
            <span className="small muted">
              {t('تم الإدخال:', 'Admitted:')} <span className="num">{f.int(admitted)}</span> · {t('مرفوض:', 'Refused:')} <span className="num">{f.int(refused)}</span>
            </span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">{t('آخر عمليات المسح في هذه الجلسة', 'Latest scans in this session')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('الوقت', 'Time')}</th>
                  <th scope="col">{t('النتيجة', 'Result')}</th>
                  <th scope="col">{t('التذكرة', 'Ticket')}</th>
                  <th scope="col">{t('الرمز', 'Code')}</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((s) => {
                  const c = COPY[s.outcome];
                  const tone = s.outcome === 'checked_in' ? 'badge-ok' : s.outcome === 'already_used' ? 'badge-warn' : 'badge-danger';
                  return (
                    <tr key={s.n}>
                      <td>{f.time(new Date(s.at).toISOString())}</td>
                      <td>
                        <span className={`badge ${tone}`}>
                          <span aria-hidden>{c[5]}</span> {lang === 'ar' ? c[0] : c[1]}
                        </span>
                      </td>
                      <td>{s.ticket ? <TicketLine ticket={s.ticket} /> : <span className="faint">—</span>}</td>
                      <td>
                        <span className="num tiny">{s.tail}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="tiny faint" style={{ margin: 0 }}>
        {t(
          'المسح بكاميرا الجوال ميزة قادمة. حالياً تعمل أجهزة المسح (USB/Bluetooth) التي تكتب الرمز وتضغط Enter، أو اللصق اليدوي.',
          'Camera scanning is a future enhancement. Today, USB/Bluetooth scanners that type the code and press Enter work, as does pasting.',
        )}
      </p>
    </>
  );
}

/** Keyed by scan number by the caller, so even an identical repeat result is re-announced. */
function ResultCard({ scan }: { scan: Scan }) {
  const { t, lang } = useI18n();
  const f = useFmt();
  const errorText = useErrorText();
  const c = COPY[scan.outcome];
  return (
    <div className={`alert ${c[4]}`} style={{ alignItems: 'center' }}>
      <span aria-hidden style={{ fontSize: '2rem', lineHeight: 1 }}>
        {c[5]}
      </span>
      <div className="spacer">
        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--ivory)' }}>{lang === 'ar' ? c[0] : c[1]}</div>
        <div className="small">{scan.outcome === 'error' ? `${errorText(scan.error)} ${t('امسح التذكرة مرة ثانية.', 'Scan the ticket again.')}` : lang === 'ar' ? c[2] : c[3]}</div>
        {scan.ticket && (
          <div className="small" style={{ marginTop: 4 }}>
            <TicketLine ticket={scan.ticket} />
          </div>
        )}
      </div>
      <span className="tiny faint" style={{ alignSelf: 'flex-start' }}>
        {t('مسح', 'Scan')} <span className="num">#{scan.n}</span> · {f.time(new Date(scan.at).toISOString())}
      </span>
    </div>
  );
}

function TicketLine({ ticket }: { ticket: NonNullable<CheckinResponse['ticket']> }) {
  const { t, pick } = useI18n();
  const f = useFmt();
  return (
    <span>
      {pick(ticket, 'title')} · {f.when(ticket.starts_at)} · {ticket.seat_code ? <span className="num">{ticket.seat_code}</span> : t('دخول عام', 'General admission')} {ticket.demo && <DemoTag />}
    </span>
  );
}

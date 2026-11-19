import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import type { ApiError } from '../lib/api';
import { TextInput } from '../ui/components';
import { DEMO_MODE } from '../lib/demo';

/** Local demo accounts (seeded test values — see README). Shown only for the local demo build. */
export const DEMO_ACCOUNTS = [
  { email: 'customer@demo.ebooking.test', ar: 'عميل', en: 'Customer' },
  { email: 'owner@gulfstage.demo.test', ar: 'مالك منظّم (Gulf Stage)', en: 'Organizer owner (Gulf Stage)' },
  { email: 'manager@gulfstage.demo.test', ar: 'مدير منظّم', en: 'Organizer manager' },
  { email: 'staff@gulfstage.demo.test', ar: 'موظف بوابة (تسجيل دخول فقط)', en: 'Event staff (check-in only)' },
  { email: 'owner@desertlights.demo.test', ar: 'منظّم آخر (Desert Lights)', en: 'Other organizer (Desert Lights)' },
  { email: 'admin@ebooking.demo.test', ar: 'مشرف المنصة', en: 'Platform admin' },
];
const DEMO_PW = 'Demo-Pass-2026';

export function LoginForm({ onDone, compact = false }: { onDone?: () => void; compact?: boolean }) {
  const { t, lang, errorText } = useI18n();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e?: React.FormEvent, override?: { email: string; password: string }) => {
    e?.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === 'up' && !override) await register(email, password, name);
      else await login(override?.email ?? email, override?.password ?? password);
      onDone?.();
    } catch (x) {
      setErr(errorText((x as ApiError).code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <form className="stack" onSubmit={submit} noValidate>
        {mode === 'up' && <TextInput label={t('الاسم', 'Full name')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} />}
        <TextInput label={t('البريد الإلكتروني', 'Email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required dir="ltr" />
        <TextInput label={t('كلمة المرور', 'Password')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required minLength={mode === 'up' ? 8 : 6} dir="ltr" hint={mode === 'up' ? t('٨ أحرف على الأقل', 'At least 8 characters') : undefined} />
        {err && <div className="alert alert-danger" role="alert">{err}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '…' : mode === 'in' ? t('دخول', 'Sign in') : t('إنشاء حساب', 'Create account')}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? t('ما عندك حساب؟ سجّل الحين', 'No account? Register') : t('عندك حساب؟ ادخل', 'Have an account? Sign in')}
        </button>
      </form>
      {DEMO_MODE && (<details open={!compact} className="card card-tight" style={{ background: 'var(--bg-2)' }}>
        <summary className="small" style={{ cursor: 'pointer' }}>{t('حسابات تجريبية (محلية فقط)', 'Demo accounts (local only)')}</summary>
        <div className="stack" style={{ marginTop: 8, gap: 6 }}>
          {DEMO_ACCOUNTS.map((a) => (
            <button key={a.email} type="button" className="btn btn-sm" style={{ justifyContent: 'space-between' }} disabled={busy} onClick={() => void submit(undefined, { email: a.email, password: DEMO_PW })}>
              <span>{lang === 'ar' ? a.ar : a.en}</span>
              <span className="tiny muted" dir="ltr">{a.email}</span>
            </button>
          ))}
        </div>
      </details>)}
    </div>
  );
}

export default function Login() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return (
    <div className="container page" style={{ maxWidth: 480 }}>
      <h1>{t('تسجيل الدخول', 'Sign in')}</h1>
      <p className="muted small">{t('التصفح متاح بدون حساب. نطلب الدخول فقط عند الدفع أو لعرض حجوزاتك.', 'Browsing needs no account. We only ask you to sign in at checkout or to view your bookings.')}</p>
      <div className="card">
        <LoginForm onDone={() => nav(safeNext, { replace: true })} />
      </div>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { SelectInput, TextInput } from '../../ui/components';
import { ApiErrorAlert, Async, Flash, RefreshButton, RoleNotice, ToneBadge, isEmail, useAction, useFmt, useLabels } from './kit';
import type { OrgRole, StaffMember } from './types';

export default function Staff({ orgId, role }: { orgId: string; role: OrgRole }) {
  const { t } = useI18n();
  const f = useFmt();
  const list = useApi<StaffMember[]>(`/api/org/${orgId}/staff`);
  const isOwner = role === 'owner';

  return (
    <>
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t('فريق المنظمة', 'Team')}</h2>
        <RefreshButton onClick={list.reload} busy={list.loading} />
      </div>

      <p className="small muted" style={{ margin: 0 }}>
        {t(
          'المدير: يدير الفعاليات والأسعار والحجوزات والعارضين. الموظف: يرى قائمة الفعاليات ويسجّل حضور التذاكر فقط — بدون أي بيانات مالية.',
          'Manager: runs events, pricing, bookings and exhibitors. Staff: sees the events list and checks tickets in only — no financial data.',
        )}
      </p>

      <Async state={list}>
        {(rows) => (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">{t('أعضاء فريق المنظمة', 'Organization team members')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('الاسم', 'Name')}</th>
                  <th scope="col">{t('البريد', 'Email')}</th>
                  <th scope="col">{t('الصلاحية', 'Role')}</th>
                  <th scope="col">{t('أضيف في', 'Added')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.email}>
                    <td>{m.full_name ? <bdi>{m.full_name}</bdi> : <span className="faint">—</span>}</td>
                    <td>
                      <span dir="ltr">{m.email}</span>
                    </td>
                    <td>
                      <ToneBadge value={m.role} />
                    </td>
                    <td>{f.day(m.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>

      {isOwner ? (
        <AddMember orgId={orgId} onAdded={list.reload} />
      ) : (
        <RoleNotice>{t('إضافة أعضاء للفريق متاحة لمالك المنظمة فقط.', 'Only the organization owner can add team members.')}</RoleNotice>
      )}
    </>
  );
}

function AddMember({ orgId, onAdded }: { orgId: string; onAdded: () => void }) {
  const { t } = useI18n();
  const labels = useLabels();
  const [email, setEmail] = useState('');
  const [memberRole, setMemberRole] = useState<'manager' | 'staff'>('staff');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const act = useAction();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setDone(null);
    const value = email.trim();
    if (!isEmail(value) || value.length > 200) {
      setError(t('أدخل بريداً إلكترونياً صحيحاً.', 'Enter a valid email address.'));
      return;
    }
    setError(null);
    const r = await act.run(() => api(`/api/org/${orgId}/staff`, { method: 'POST', body: { email: value, role: memberRole } }));
    if (r) {
      setDone(t(`تمت إضافة ${value} بصلاحية «${labels.role(memberRole)}».`, `${value} now has the “${labels.role(memberRole)}” role.`));
      setEmail('');
      onAdded();
    }
  };

  return (
    <section className="card" aria-labelledby="staff-add">
      <h3 id="staff-add">{t('إضافة عضو للفريق', 'Add a team member')}</h3>
      <p className="small muted">
        {t(
          'الشخص لازم يكون عنده حساب في Ebooking Ticket بنفس البريد. إذا كان عضواً مسبقاً تتحدث صلاحيته (صلاحية المالك لا تتغير).',
          'The person must already have an Ebooking Ticket account with this email. Existing members get their role updated (the owner’s role never changes).',
        )}
      </p>
      <form onSubmit={submit} noValidate className="stack">
        <div className="grid grid-2">
          <TextInput label={t('البريد الإلكتروني', 'Email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} dir="ltr" autoComplete="off" maxLength={200} required />
          <SelectInput label={t('الصلاحية', 'Role')} value={memberRole} onChange={(e) => setMemberRole(e.target.value as 'manager' | 'staff')}>
            <option value="staff">{t('موظف — تسجيل الحضور فقط', 'Staff — check-in only')}</option>
            <option value="manager">{t('مدير — إدارة الفعاليات والأسعار', 'Manager — events & pricing')}</option>
          </SelectInput>
        </div>
        <ApiErrorAlert error={act.error} />
        {done && <Flash onClose={() => setDone(null)}>{done}</Flash>}
        <div>
          <button type="submit" className="btn btn-primary" disabled={act.busy}>
            {act.busy ? t('جاري الإضافة…', 'Adding…') : t('إضافة', 'Add member')}
          </button>
        </div>
      </form>
    </section>
  );
}

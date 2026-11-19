import { useI18n } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { Async, AuditTable, RefreshButton } from './kit';
import type { AuditRow } from './types';

export default function Audit({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  const log = useApi<AuditRow[]>(`/api/org/${orgId}/audit`);
  return (
    <>
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t('سجل التدقيق', 'Audit log')}</h2>
        <RefreshButton onClick={log.reload} busy={log.loading} />
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {t('آخر 100 إجراء على منظمتك (إنشاء وتعديل الفعاليات، الأسعار، الفريق، تسجيل الحضور…). متاح للمالك فقط.', 'The latest 100 actions on your organization (events, prices, team, check-ins…). Owner only.')}
      </p>
      <Async state={log} forbidden={t('سجل التدقيق متاح لمالك المنظمة فقط.', 'The audit log is available to the organization owner only.')}>
        {(rows) => (rows.length === 0 ? <p className="muted">{t('لا توجد إجراءات مسجّلة بعد.', 'No actions recorded yet.')}</p> : <AuditTable rows={rows} />)}
      </Async>
    </>
  );
}

import { useI18n } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { Async, AuditTable, RefreshButton } from '../org/kit';
import type { AuditRow } from '../org/types';

export default function AdminAudit() {
  const { t } = useI18n();
  const log = useApi<AuditRow[]>('/api/admin/audit');
  return (
    <>
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t('سجل التدقيق', 'Audit log')}</h2>
        <RefreshButton onClick={log.reload} busy={log.loading} />
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {t('آخر 150 إجراء على مستوى المنصة. «النظام» يعني إجراءً تلقائياً (مثل تأكيد الدفع).', 'The latest 150 platform-wide actions. “System” means an automatic action (such as a payment confirmation).')}
      </p>
      <Async state={log}>{(rows) => (rows.length === 0 ? <p className="muted">{t('لا توجد إجراءات مسجّلة بعد.', 'No actions recorded yet.')}</p> : <AuditTable rows={rows} showActor />)}</Async>
    </>
  );
}

import { useState } from 'react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { Empty } from '../../ui/components';
import { ApiErrorAlert, Async, Clip, Flash, RefreshButton, useAction, useFmt, useLabels } from '../org/kit';
import type { AdminEvent } from './types';

export default function Approvals() {
  const { t, pick } = useI18n();
  const f = useFmt();
  const labels = useLabels();
  const list = useApi<AdminEvent[]>('/api/admin/events?status=pending_approval');
  const act = useAction();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const decide = async (e: AdminEvent, decision: 'published' | 'draft') => {
    const title = pick(e, 'title');
    const question =
      decision === 'published'
        ? t(`نشر «${title}» من ${e.organizer}؟ ستظهر الفعالية للجمهور وتصبح متاحة للحجز.`, `Publish “${title}” by ${e.organizer}? It becomes public and bookable.`)
        : t(`إرجاع «${title}» إلى مسودة؟ لن تُنشر، وتبقى مخفية عن الجمهور.`, `Return “${title}” to draft? It will not be published and stays hidden from the public.`);
    if (!window.confirm(question)) return;
    setFlash(null);
    setBusyId(e.id);
    const r = await act.run(() => api(`/api/admin/events/${e.id}/decision`, { method: 'POST', body: { decision } }));
    setBusyId(null);
    if (r) setFlash(decision === 'published' ? t(`تم نشر «${title}».`, `Published “${title}”.`) : t(`تمت إعادة «${title}» إلى مسودة.`, `Returned “${title}” to draft.`));
    list.reload(); // also after 409 event_not_pending
  };

  return (
    <>
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t('موافقات الفعاليات', 'Event approvals')}</h2>
        <RefreshButton onClick={list.reload} busy={list.loading} />
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {t(
          'فعاليات أنشأها المنظّمون وتنتظر المراجعة. لا شيء يُنشر تلقائياً — النشر يجعل الفعالية ظاهرة للجمهور ومتاحة للحجز.',
          'Events created by organizers, waiting for review. Nothing is published automatically — publishing makes an event public and bookable.',
        )}
      </p>
      {flash && <Flash onClose={() => setFlash(null)}>{flash}</Flash>}
      <ApiErrorAlert error={act.error} />
      <Async state={list}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty title={t('لا توجد فعاليات بانتظار الموافقة', 'No events pending approval')}>{t('كل شيء تمت مراجعته.', 'Everything has been reviewed.')}</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">{t('فعاليات بانتظار الموافقة', 'Events pending approval')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('الفعالية', 'Event')}</th>
                    <th scope="col">{t('المنظّم', 'Organizer')}</th>
                    <th scope="col">{t('التصنيف', 'Category')}</th>
                    <th scope="col">{t('نوع الحجز', 'Inventory')}</th>
                    <th scope="col">{t('أُرسلت', 'Submitted')}</th>
                    <th scope="col">{t('القرار', 'Decision')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <Clip text={pick(e, 'title')} max={300} />
                        <div className="tiny faint" dir="ltr" style={{ textAlign: 'start' }}>
                          {e.slug}
                        </div>
                      </td>
                      <td>
                        <Clip text={e.organizer} max={220} />
                      </td>
                      <td>{labels.category(e.category)}</td>
                      <td>{labels.inventory(e.inventory_type)}</td>
                      <td>{f.whenFull(e.created_at)}</td>
                      <td>
                        <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                          <button type="button" className="btn btn-sm btn-primary" disabled={busyId !== null} onClick={() => decide(e, 'published')} aria-label={t(`موافقة ونشر ${pick(e, 'title')}`, `Approve and publish ${pick(e, 'title')}`)}>
                            {busyId === e.id ? '…' : t('موافقة ونشر', 'Approve & publish')}
                          </button>
                          <button type="button" className="btn btn-sm" disabled={busyId !== null} onClick={() => decide(e, 'draft')} aria-label={t(`إرجاع ${pick(e, 'title')} إلى مسودة`, `Return ${pick(e, 'title')} to draft`)}>
                            {t('إرجاع لمسودة', 'Return to draft')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Async>
    </>
  );
}

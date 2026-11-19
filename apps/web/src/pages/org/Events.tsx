import { useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { DemoTag, Empty, StatusBadge } from '../../ui/components';
import { Async, Clip, RefreshButton, RoleNotice, useFmt, useFocusOnMount, useLabels, type AsyncState } from './kit';
import EventDetail from './EventDetail';
import CreateEvent from './CreateEvent';
import type { OrgEvent, OrgRole } from './types';

type View = { kind: 'list'; returned?: boolean } | { kind: 'detail'; id: string; created?: boolean } | { kind: 'create' };

export default function EventsTab({ orgId, role }: { orgId: string; role: OrgRole }) {
  const canManage = role !== 'staff';
  const list = useApi<OrgEvent[]>(`/api/org/${orgId}/events`);
  const [view, setView] = useState<View>({ kind: 'list' });
  const back = () => setView({ kind: 'list', returned: true });

  if (view.kind === 'create' && canManage) {
    return (
      <CreateEvent
        orgId={orgId}
        onCancel={back}
        onCreated={(id) => {
          list.reload();
          setView({ kind: 'detail', id, created: true });
        }}
      />
    );
  }
  if (view.kind === 'detail' && canManage) {
    return <EventDetail orgId={orgId} eventId={view.id} justCreated={view.created} onBack={back} onChanged={list.reload} />;
  }
  return <EventList list={list} canManage={canManage} focusHeading={view.kind === 'list' && !!view.returned} onOpen={(id) => setView({ kind: 'detail', id })} onCreate={() => setView({ kind: 'create' })} />;
}

function EventList({
  list,
  canManage,
  focusHeading,
  onOpen,
  onCreate,
}: {
  list: AsyncState<OrgEvent[]>;
  canManage: boolean;
  focusHeading: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const { t, pick } = useI18n();
  const f = useFmt();
  const labels = useLabels();
  const headingRef = useFocusOnMount<HTMLHeadingElement>(focusHeading);

  return (
    <>
      <div className="row between">
        <h2 ref={headingRef} tabIndex={-1} style={{ margin: 0 }}>
          {t('الفعاليات', 'Events')}
        </h2>
        <div className="row" style={{ gap: 8 }}>
          <RefreshButton onClick={list.reload} busy={list.loading} />
          {canManage && (
            <button type="button" className="btn btn-primary btn-sm" onClick={onCreate}>
              <span aria-hidden>＋</span> {t('إنشاء فعالية', 'Create event')}
            </button>
          )}
        </div>
      </div>

      {!canManage && (
        <RoleNotice>
          {t(
            'عرض فقط: تقدر تطّلع على قائمة الفعاليات وتسجّل حضور التذاكر من قسم «تسجيل الحضور». التفاصيل والتعديل للمالك والمدراء.',
            'Read-only: you can view the events list and check tickets in from the Check-in tab. Details and editing are for the owner and managers.',
          )}
        </RoleNotice>
      )}

      <Async state={list}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty title={t('ما فيه فعاليات بعد', 'No events yet')}>
              {canManage
                ? t('أنشئ أول فعالية، وراح تُرسل لموافقة فريق المنصة قبل نشرها.', 'Create your first event — it will be sent to the platform team for approval before it goes public.')
                : t('لم تُضف أي فعالية لهذه المنظمة بعد.', 'No events have been added for this organization yet.')}
            </Empty>
          ) : (
            <>
              {rows.some((e) => e.status === 'pending_approval') && (
                <p className="small muted" style={{ margin: 0 }}>
                  {t(
                    'الفعاليات «بانتظار الموافقة» يراجعها فريق المنصة قبل نشرها، ولا تظهر للجمهور حتى تتم الموافقة.',
                    'Events “Pending approval” are reviewed by the platform team and stay hidden from the public until approved.',
                  )}
                </p>
              )}
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">{t('فعاليات المنظمة', "The organization's events")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('الفعالية', 'Event')}</th>
                      <th scope="col">{t('التصنيف', 'Category')}</th>
                      <th scope="col">{t('نوع الحجز', 'Inventory')}</th>
                      <th scope="col">{t('الحالة', 'Status')}</th>
                      <th scope="col">{t('العروض', 'Performances')}</th>
                      {canManage && (
                        <th scope="col">
                          <span className="sr-only">{t('إجراءات', 'Actions')}</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <Clip text={pick(e, 'title')} max={320} /> {e.demo && <DemoTag />}
                        </td>
                        <td>{labels.category(e.category)}</td>
                        <td>{labels.inventory(e.inventory_type)}</td>
                        <td>
                          <StatusBadge status={e.status} />
                        </td>
                        <td>
                          <span className="num">{f.int(e.performances)}</span>
                        </td>
                        {canManage && (
                          <td>
                            <button type="button" className="btn btn-sm" onClick={() => onOpen(e.id)} aria-label={t(`عرض تفاصيل ${pick(e, 'title')}`, `View details of ${pick(e, 'title')}`)}>
                              {t('التفاصيل والتعديل', 'Details & edit')}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        }
      </Async>
    </>
  );
}

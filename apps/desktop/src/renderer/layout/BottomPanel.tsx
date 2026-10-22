import { CircleAlert, ScrollText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BottomView } from '@kestrel/shared';
import { EmptyState } from '../components/EmptyState';
import { IconButton } from '../components/IconButton';
import { Tabs } from '../components/Tabs';
import { TerminalView } from '../features/terminal';
import { setPanelOpen } from '../stores/layout';
import { useSettingsStore } from '../stores/settings';

const viewIds: readonly BottomView[] = ['terminal', 'logs', 'problems'];

export function BottomPanel() {
  const { t } = useTranslation();
  const layout = useSettingsStore((state) => state.settings.layout);
  const update = useSettingsStore((state) => state.update);

  return (
    <section className="panel-fill">
      <Tabs
        label={t('bottom.label')}
        idPrefix="bottom"
        items={viewIds.map((id) => ({ id, label: t(`bottom.${id}`) }))}
        value={layout.bottomView}
        onChange={(view) => {
          void update({ layout: { ...layout, bottomView: view } });
        }}
        actions={
          <IconButton
            size="sm"
            icon={X}
            label={t('layout.closeBottom')}
            onClick={() => {
              setPanelOpen('bottom', false);
            }}
          />
        }
      >
        {layout.bottomView === 'terminal' && <TerminalView />}
        {layout.bottomView === 'logs' && (
          <EmptyState
            icon={ScrollText}
            title={t('bottom.logsEmptyTitle')}
            description={t('bottom.logsEmptyText')}
          />
        )}
        {layout.bottomView === 'problems' && (
          <EmptyState
            icon={CircleAlert}
            title={t('bottom.problemsEmptyTitle')}
            description={t('bottom.problemsEmptyText')}
          />
        )}
      </Tabs>
    </section>
  );
}

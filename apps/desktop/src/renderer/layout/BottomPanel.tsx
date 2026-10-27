import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BottomView } from '@kestrel/shared';
import { IconButton } from '../components/IconButton';
import { Tabs } from '../components/Tabs';
import { DockerOutput } from '../features/docker';
import { TerminalView } from '../features/terminal';
import { ProblemsView } from '../features/lsp';
import { countProblems, useLspStore } from '../stores/lsp';
import { setPanelOpen } from '../stores/layout';
import { LogsView } from './LogsView';
import { useSettingsStore } from '../stores/settings';

const viewIds: readonly BottomView[] = ['terminal', 'logs', 'docker', 'problems'];

export function BottomPanel() {
  const { t } = useTranslation();
  const layout = useSettingsStore((state) => state.settings.layout);
  const update = useSettingsStore((state) => state.update);
  const diagnostics = useLspStore((state) => state.diagnostics);
  const problems = countProblems(diagnostics);
  const problemCount = problems.errors + problems.warnings;

  return (
    <section className="panel-fill">
      <Tabs
        label={t('bottom.label')}
        idPrefix="bottom"
        items={viewIds.map((id) => ({
          id,
          label:
            id === 'problems' && problemCount > 0
              ? t('bottom.problemsCount', { count: problemCount })
              : t(`bottom.${id}`),
        }))}
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
        {layout.bottomView === 'logs' && <LogsView />}
        {layout.bottomView === 'docker' && <DockerOutput />}
        {layout.bottomView === 'problems' && <ProblemsView />}
      </Tabs>
    </section>
  );
}

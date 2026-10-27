import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { bottomViews, orderedVisible } from '@kestrel/shared';
import { IconButton } from '../components/IconButton';
import { Tabs } from '../components/Tabs';
import { DockerOutput } from '../features/docker';
import { TerminalView } from '../features/terminal';
import { ProblemsView } from '../features/lsp';
import { countProblems, useLspStore } from '../stores/lsp';
import { setPanelOpen } from '../stores/layout';
import { LogsView } from './LogsView';
import { useSettingsStore } from '../stores/settings';

export function BottomPanel() {
  const { t } = useTranslation();
  const layout = useSettingsStore((state) => state.settings.layout);
  const update = useSettingsStore((state) => state.update);
  const tabs = useSettingsStore((state) => state.settings.workbench.bottomTabs);
  const viewIds = orderedVisible(bottomViews, tabs.order, tabs.hidden);
  // A hidden tab cannot stay selected.
  const current = viewIds.includes(layout.bottomView)
    ? layout.bottomView
    : (viewIds[0] ?? 'terminal');
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
        value={current}
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
        {current === 'terminal' && <TerminalView />}
        {current === 'logs' && <LogsView />}
        {current === 'docker' && <DockerOutput />}
        {current === 'problems' && <ProblemsView />}
      </Tabs>
    </section>
  );
}

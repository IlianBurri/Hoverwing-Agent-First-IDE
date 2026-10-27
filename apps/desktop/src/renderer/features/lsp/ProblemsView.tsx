import { CircleAlert, CircleCheck, Info, Lightbulb, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Diagnostic, DiagnosticSeverity } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { sortedProblems, useLspStore } from '../../stores/lsp';
import { useTrustStore } from '../../stores/trust';
import { openFile } from '../editor';
import { trustProject } from '../trust';
import { openLspServers } from './actions';
import styles from './ProblemsView.module.css';

const icons: Record<DiagnosticSeverity, LucideIcon> = {
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
  hint: Lightbulb,
};

function reveal(path: string, diagnostic: Diagnostic): void {
  const { start, end } = diagnostic.range;
  void openFile(path, {
    line: start.line + 1,
    column: start.character,
    length: end.line === start.line ? end.character - start.character : 0,
  });
}

/** Bottom panel "Problems": diagnostics of all files, grouped by file. */
export function ProblemsView() {
  const { t } = useTranslation();
  const diagnostics = useLspStore((state) => state.diagnostics);
  const trusted = useTrustStore((state) => state.trusted);

  if (diagnostics.size === 0) {
    return (
      <EmptyState
        icon={trusted === false ? CircleAlert : CircleCheck}
        title={t('bottom.problemsEmptyTitle')}
        description={trusted === false ? t('lsp.problemsUntrusted') : t('bottom.problemsEmptyText')}
      >
        {trusted === false ? (
          <Button onClick={() => void trustProject()}>{t('trust.grant')}</Button>
        ) : (
          <Button variant="ghost" onClick={openLspServers}>
            {t('lsp.servers')}
          </Button>
        )}
      </EmptyState>
    );
  }

  return (
    <div className={styles['root']} role="region" aria-label={t('bottom.problems')}>
      {sortedProblems(diagnostics).map((file) => (
        <section key={file.path} className={styles['file']} aria-label={file.path}>
          <h3 className={styles['path']}>
            {file.path}
            <span className={styles['count']}>{file.diagnostics.length}</span>
          </h3>
          <ul className={styles['list']}>
            {file.diagnostics.map((diagnostic, index) => {
              const Icon = icons[diagnostic.severity];
              return (
                <li key={String(index)}>
                  <button
                    type="button"
                    className={styles['item']}
                    onClick={() => {
                      reveal(file.path, diagnostic);
                    }}
                  >
                    <span
                      className={`${styles['severity'] ?? ''} ${styles[diagnostic.severity] ?? ''}`}
                    >
                      <Icon size={14} aria-hidden="true" />
                      <span className={styles['severityText']}>
                        {t(`lsp.severity.${diagnostic.severity}`)}
                      </span>
                    </span>
                    <span className={styles['message']}>{diagnostic.message}</span>
                    <span className={styles['meta']}>
                      {[diagnostic.source, diagnostic.code].filter(Boolean).join(' ')}{' '}
                      {t('lsp.position', {
                        line: diagnostic.range.start.line + 1,
                        column: diagnostic.range.start.character + 1,
                      })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

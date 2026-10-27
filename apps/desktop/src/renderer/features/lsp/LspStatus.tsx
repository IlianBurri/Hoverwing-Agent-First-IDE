import { Braces, CircleAlert, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { countProblems, useLspStore } from '../../stores/lsp';
import { openLspServers, showProblems } from './actions';

interface LspStatusProps {
  buttonClassName?: string | undefined;
  warningClassName?: string | undefined;
}

/** Status bar: problem counts and language servers that need attention. */
export function LspStatus({ buttonClassName, warningClassName }: LspStatusProps) {
  const { t } = useTranslation();
  const diagnostics = useLspStore((state) => state.diagnostics);
  const statuses = useLspStore((state) => state.statuses);
  const { errors, warnings } = countProblems(diagnostics);
  const notable = statuses.filter((status) => status.state !== 'ready');

  return (
    <>
      {notable.map((status) => (
        <button
          key={status.serverId}
          type="button"
          className={`${buttonClassName ?? ''} ${status.state === 'starting' ? '' : (warningClassName ?? '')}`}
          title={t(`lsp.stateHint.${status.state}`)}
          onClick={openLspServers}
        >
          {status.state === 'starting' ? (
            <LoaderCircle size={14} aria-hidden="true" />
          ) : (
            <Braces size={14} aria-hidden="true" />
          )}
          {t('lsp.serverState', { name: status.name, state: t(`lsp.state.${status.state}`) })}
        </button>
      ))}
      <button
        type="button"
        className={buttonClassName}
        title={t('lsp.showProblems')}
        aria-label={t('lsp.problemsLabel', { errors, warnings })}
        onClick={showProblems}
      >
        <CircleAlert size={14} aria-hidden="true" />
        {errors}
        <TriangleAlert size={14} aria-hidden="true" />
        {warnings}
      </button>
    </>
  );
}

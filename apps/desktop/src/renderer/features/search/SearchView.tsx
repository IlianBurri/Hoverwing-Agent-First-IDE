import { useEffect, useId, useRef } from 'react';
import {
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Ellipsis,
  Regex,
  Replace,
  ReplaceAll,
  Search,
  WholeWord,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { baseName, parentPath } from '@kestrel/shared';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { StatusMessage } from '../../components/StatusMessage';
import { PanelHeader } from '../../layout/PanelHeader';
import { countMatches, useSearchStore } from '../../stores/search';
import { useWorkspaceStore } from '../../stores/workspace';
import { openFile } from '../editor';
import { iconForEntry } from '../workspace/fileIcon';
import { replaceAll, runSearch, setOptions, toggleCollapsed } from './actions';
import { previewParts } from './preview';
import styles from './SearchView.module.css';

export function SearchView() {
  const { t } = useTranslation();
  const workspace = useWorkspaceStore((state) => state.info);
  const state = useSearchStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const queryId = useId();
  const replaceId = useId();
  const includeId = useId();
  const excludeId = useId();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [state.focusRequest]);

  if (!workspace) {
    return (
      <>
        <PanelHeader id="sidebar-title" title={t('sidebar.search.title')} />
        <EmptyState
          icon={Search}
          title={t('sidebar.search.emptyTitle')}
          description={t('sidebar.search.emptyText')}
        />
      </>
    );
  }

  const { options, result } = state;
  const matchCount = countMatches(result);
  const replacement = state.showReplace ? state.replacement : null;

  return (
    <>
      <PanelHeader id="sidebar-title" title={t('sidebar.search.title')} />
      <div className={styles['form']}>
        <div className={styles['row']}>
          <IconButton
            size="sm"
            icon={state.showReplace ? ChevronDown : ChevronRight}
            label={t('search.toggleReplace')}
            pressed={state.showReplace}
            onClick={() => {
              useSearchStore.setState({ showReplace: !state.showReplace });
            }}
          />
          <div className={styles['field']}>
            <label htmlFor={queryId} className="visually-hidden">
              {t('search.query')}
            </label>
            <input
              ref={inputRef}
              id={queryId}
              className={styles['input']}
              placeholder={t('search.query')}
              value={options.query}
              spellCheck={false}
              aria-invalid={state.status === 'error'}
              onChange={(event) => {
                setOptions({ query: event.target.value });
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void runSearch();
              }}
            />
            <div className={styles['toggles']}>
              <IconButton
                size="sm"
                icon={CaseSensitive}
                label={t('search.caseSensitive')}
                pressed={options.caseSensitive}
                onClick={() => {
                  setOptions({ caseSensitive: !options.caseSensitive });
                }}
              />
              <IconButton
                size="sm"
                icon={WholeWord}
                label={t('search.wholeWord')}
                pressed={options.wholeWord}
                onClick={() => {
                  setOptions({ wholeWord: !options.wholeWord });
                }}
              />
              <IconButton
                size="sm"
                icon={Regex}
                label={t('search.regex')}
                pressed={options.isRegex}
                onClick={() => {
                  setOptions({ isRegex: !options.isRegex });
                }}
              />
            </div>
          </div>
        </div>

        {state.showReplace && (
          <div className={styles['row']}>
            <span className={styles['spacer']} />
            <div className={styles['field']}>
              <label htmlFor={replaceId} className="visually-hidden">
                {t('search.replacement')}
              </label>
              <input
                id={replaceId}
                className={styles['input']}
                placeholder={t('search.replacement')}
                value={state.replacement}
                spellCheck={false}
                onChange={(event) => {
                  useSearchStore.setState({ replacement: event.target.value });
                }}
              />
              <div className={styles['toggles']}>
                <IconButton
                  size="sm"
                  icon={ReplaceAll}
                  label={t('search.replaceAll')}
                  disabled={matchCount === 0}
                  onClick={() => void replaceAll()}
                />
              </div>
            </div>
          </div>
        )}

        <div className={styles['row']}>
          <span className={styles['spacer']} />
          <IconButton
            size="sm"
            icon={Ellipsis}
            label={t('search.toggleDetails')}
            pressed={state.showDetails}
            onClick={() => {
              useSearchStore.setState({ showDetails: !state.showDetails });
            }}
          />
        </div>
        {state.showDetails && (
          <div className={styles['details']}>
            <label htmlFor={includeId}>{t('search.include')}</label>
            <input
              id={includeId}
              className={styles['input']}
              placeholder="src/**, *.ts"
              value={options.include}
              spellCheck={false}
              onChange={(event) => {
                setOptions({ include: event.target.value });
              }}
            />
            <label htmlFor={excludeId}>{t('search.exclude')}</label>
            <input
              id={excludeId}
              className={styles['input']}
              placeholder="*.test.ts"
              value={options.exclude}
              spellCheck={false}
              onChange={(event) => {
                setOptions({ exclude: event.target.value });
              }}
            />
          </div>
        )}
      </div>

      <div className={styles['summary']} role="status" aria-live="polite">
        {state.status === 'searching' && t('search.searching')}
        {state.status === 'done' &&
          (matchCount === 0
            ? t('search.noResults')
            : t('search.summary', { count: matchCount, files: result?.files.length ?? 0 }))}
      </div>
      {state.status === 'error' && state.error && (
        <div className={styles['notice']}>
          <StatusMessage kind="error">{state.error}</StatusMessage>
        </div>
      )}
      {result?.truncated && (
        <div className={styles['notice']}>
          <StatusMessage kind="warning">{t('search.truncated')}</StatusMessage>
        </div>
      )}

      <ul className={styles['results']} aria-label={t('search.results')}>
        {result?.files.map((file) => {
          const collapsed = state.collapsed.has(file.path);
          const name = baseName(file.path);
          const Icon = iconForEntry(
            { name, path: file.path, kind: 'file', symlink: false, heavy: false },
            false,
          );
          return (
            <li key={file.path}>
              <div className={styles['fileRow']}>
                <button
                  type="button"
                  className={styles['fileButton']}
                  aria-expanded={!collapsed}
                  title={file.path}
                  onClick={() => {
                    toggleCollapsed(file.path);
                  }}
                >
                  {collapsed ? (
                    <ChevronRight size={14} aria-hidden="true" />
                  ) : (
                    <ChevronDown size={14} aria-hidden="true" />
                  )}
                  <Icon size={14} aria-hidden="true" />
                  <span className={styles['fileName']}>{name}</span>
                  <span className={styles['fileDir']}>{parentPath(file.path)}</span>
                  <span className={styles['count']}>{file.matches.length}</span>
                </button>
                {state.showReplace && (
                  <IconButton
                    size="sm"
                    icon={Replace}
                    label={t('search.replaceInFile', { name })}
                    onClick={() => void replaceAll(file.path)}
                  />
                )}
              </div>
              {!collapsed && (
                <ul className={styles['matches']}>
                  {file.matches.map((match) => {
                    const parts = previewParts(match, options, replacement);
                    return (
                      <li key={`${String(match.line)}:${String(match.column)}`}>
                        <button
                          type="button"
                          className={styles['matchButton']}
                          aria-label={t('search.matchLabel', {
                            line: match.line,
                            text: match.preview.trim(),
                          })}
                          onClick={() =>
                            void openFile(file.path, {
                              line: match.line,
                              column: match.column,
                              length: match.length,
                            })
                          }
                        >
                          <span className={styles['line']}>{match.line}</span>
                          <span className={styles['preview']}>
                            {parts.before}
                            <mark
                              className={
                                parts.replacement === null ? styles['hit'] : styles['removed']
                              }
                            >
                              {parts.match}
                            </mark>
                            {parts.replacement !== null && (
                              <ins className={styles['added']}>{parts.replacement}</ins>
                            )}
                            {parts.after}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {state.status === 'idle' && (
        <EmptyState
          icon={Search}
          title={t('search.idleTitle')}
          description={t('search.idleText')}
        />
      )}
      {state.status === 'error' && !state.error && (
        <EmptyState icon={CircleAlert} title={t('search.failed')} description="" />
      )}
    </>
  );
}

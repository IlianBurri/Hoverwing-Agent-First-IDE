import { useId } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FileText,
  FolderGit2,
  GitBranch,
  GitBranchPlus,
  Minus,
  Plus,
  RefreshCw,
  RefreshCcwDot,
  Undo2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GitFile } from '@kestrel/shared';
import { baseName, parentPath } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { StatusMessage } from '../../components/StatusMessage';
import { PanelHeader } from '../../layout/PanelHeader';
import { decorationOf, groupFiles, useGitStore } from '../../stores/git';
import { useTrustStore } from '../../stores/trust';
import { useWorkspaceStore } from '../../stores/workspace';
import { openFile } from '../editor';
import { showGitHub } from '../github';
import { trustProject } from '../trust';
import {
  checkout,
  commit,
  createBranch,
  discard,
  fetch,
  initRepository,
  openGitDiff,
  pull,
  push,
  refreshGit,
  stage,
  unstage,
} from './actions';
import styles from './GitView.module.css';

type Section = 'conflicts' | 'staged' | 'changes' | 'untracked';

function FileRow({ file, section }: { file: GitFile; section: Section }) {
  const { t } = useTranslation();
  const busy = useGitStore((state) => state.busy);
  const trusted = useTrustStore((state) => state.trusted === true);
  const staged = section === 'staged';
  // Each section shows its side of the change (staged or work tree).
  const decoration = decorationOf(staged ? { ...file, unstaged: null } : { ...file, staged: null });
  const kind = staged ? file.staged : file.unstaged;
  const name = baseName(file.path);
  const folder = parentPath(file.path);
  const deleted = kind === 'deleted';

  return (
    <li className={styles['row']}>
      <button
        type="button"
        className={styles['file']}
        title={t('git.showDiffOf', { path: file.path })}
        onClick={() => void openGitDiff(file.path, staged)}
      >
        <span className={styles['name']}>{name}</span>
        {folder && <span className={styles['folder']}>{folder}</span>}
      </button>
      <span className={styles['actions']}>
        {!deleted && (
          <IconButton
            size="sm"
            icon={FileText}
            label={t('git.openFile', { name })}
            onClick={() => void openFile(file.path)}
          />
        )}
        {(section === 'changes' || section === 'untracked') && (
          <IconButton
            size="sm"
            icon={Undo2}
            label={t('git.discardName', { name })}
            disabled={busy || !trusted}
            onClick={() => void discard([file.path], section === 'untracked' ? 1 : 0)}
          />
        )}
        {staged ? (
          <IconButton
            size="sm"
            icon={Minus}
            label={t('git.unstageName', { name })}
            disabled={busy || !trusted}
            onClick={() => void unstage([file.path])}
          />
        ) : (
          <IconButton
            size="sm"
            icon={Plus}
            label={t('git.stageName', { name })}
            disabled={busy || !trusted}
            onClick={() => void stage([file.path])}
          />
        )}
      </span>
      <span
        className={`${styles['badge'] ?? ''} ${styles[decoration?.kind ?? 'modified'] ?? ''}`}
        title={t(`git.kind.${file.conflict ? 'conflict' : (kind ?? 'modified')}`)}
        aria-label={t(`git.kind.${file.conflict ? 'conflict' : (kind ?? 'modified')}`)}
      >
        {decoration?.letter}
      </span>
    </li>
  );
}

function FileSection({ section, files }: { section: Section; files: GitFile[] }) {
  const { t } = useTranslation();
  const busy = useGitStore((state) => state.busy);
  const trusted = useTrustStore((state) => state.trusted === true);
  if (files.length === 0) return null;
  const paths = files.map((file) => file.path);
  return (
    <section className={styles['section']} aria-label={t(`git.section.${section}`)}>
      <div className={styles['sectionHeader']}>
        <h3 className={styles['heading']}>
          {t(`git.section.${section}`)} <span className={styles['count']}>{files.length}</span>
        </h3>
        <span className={styles['actions']}>
          {(section === 'changes' || section === 'untracked') && (
            <IconButton
              size="sm"
              icon={Undo2}
              label={t('git.discardAll')}
              disabled={busy || !trusted}
              onClick={() => void discard(paths, section === 'untracked' ? paths.length : 0)}
            />
          )}
          {section === 'staged' ? (
            <IconButton
              size="sm"
              icon={Minus}
              label={t('git.unstageAll')}
              disabled={busy || !trusted}
              onClick={() => void unstage(paths)}
            />
          ) : (
            <IconButton
              size="sm"
              icon={Plus}
              label={t('git.stageAll')}
              disabled={busy || !trusted}
              onClick={() => void stage(paths)}
            />
          )}
        </span>
      </div>
      <ul className={styles['list']}>
        {files.map((file) => (
          <FileRow key={file.path} file={file} section={section} />
        ))}
      </ul>
    </section>
  );
}

function BranchBar() {
  const { t } = useTranslation();
  const status = useGitStore((state) => state.status);
  const branches = useGitStore((state) => state.branches);
  const busy = useGitStore((state) => state.busy);
  const trusted = useTrustStore((state) => state.trusted === true);
  const selectId = useId();
  if (status?.state !== 'repo') return null;
  const current = status.branch ?? '';
  return (
    <div className={styles['branchBar']}>
      <label htmlFor={selectId} className={styles['branchLabel']}>
        <GitBranch size={14} aria-hidden="true" />
        <span className="visually-hidden">{t('git.branch')}</span>
      </label>
      <select
        id={selectId}
        className={styles['select']}
        value={current}
        disabled={busy || !trusted}
        onChange={(event) => void checkout(event.target.value)}
      >
        {status.branch === null && (
          <option value="">{t('git.detached', { head: status.head ?? '' })}</option>
        )}
        {branches.map((branch) => (
          <option key={branch.name} value={branch.name}>
            {branch.remoteOnly ? t('git.remoteBranch', { name: branch.name }) : branch.name}
          </option>
        ))}
      </select>
      <IconButton
        size="sm"
        icon={GitBranchPlus}
        label={t('git.newBranch')}
        disabled={busy || !trusted}
        onClick={() => void createBranch()}
      />
      {(status.ahead > 0 || status.behind > 0) && (
        <span className={styles['sync']} aria-label={t('git.syncState', status)}>
          ↑{status.ahead} ↓{status.behind}
        </span>
      )}
    </div>
  );
}

function CommitBox({ stagedCount }: { stagedCount: number }) {
  const { t } = useTranslation();
  const message = useGitStore((state) => state.message);
  const busy = useGitStore((state) => state.busy);
  const trusted = useTrustStore((state) => state.trusted === true);
  const inputId = useId();
  const canCommit = trusted && !busy && stagedCount > 0 && message.trim() !== '';
  return (
    <div className={styles['commit']}>
      <label htmlFor={inputId} className="visually-hidden">
        {t('git.message')}
      </label>
      <textarea
        id={inputId}
        className={styles['message']}
        rows={3}
        value={message}
        placeholder={t('git.messagePlaceholder')}
        disabled={!trusted}
        onChange={(event) => {
          useGitStore.setState({ message: event.target.value });
        }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && canCommit) {
            event.preventDefault();
            void commit();
          }
        }}
      />
      <Button variant="primary" disabled={!canCommit} onClick={() => void commit()}>
        {t('git.commitCount', { count: stagedCount })}
      </Button>
    </div>
  );
}

/** Sidebar view "Git": branch, commit, and the changed files. */
export function GitView() {
  const { t } = useTranslation();
  const workspace = useWorkspaceStore((state) => state.info);
  const status = useGitStore((state) => state.status);
  const busy = useGitStore((state) => state.busy);
  const trusted = useTrustStore((state) => state.trusted);
  const repo = status?.state === 'repo' ? status : null;

  const header = (
    <PanelHeader
      id="sidebar-title"
      title={t('git.title')}
      actions={
        <>
          {repo && (
            <>
              <IconButton
                size="sm"
                icon={RefreshCcwDot}
                label={t('git.fetch')}
                disabled={busy || trusted !== true}
                onClick={() => void fetch()}
              />
              <IconButton
                size="sm"
                icon={ArrowDownToLine}
                label={t('git.pull')}
                disabled={busy || trusted !== true}
                onClick={() => void pull()}
              />
              <IconButton
                size="sm"
                icon={ArrowUpFromLine}
                label={t('git.push')}
                disabled={busy || trusted !== true || repo.branch === null}
                onClick={() => void push()}
              />
            </>
          )}
          <IconButton size="sm" icon={FolderGit2} label={t('github.open')} onClick={showGitHub} />
          <IconButton
            size="sm"
            icon={RefreshCw}
            label={t('git.refresh')}
            onClick={() => void refreshGit()}
          />
        </>
      }
    />
  );

  if (!workspace) {
    return (
      <>
        {header}
        <EmptyState
          icon={GitBranch}
          title={t('git.noFolderTitle')}
          description={t('git.noFolderText')}
        />
      </>
    );
  }
  if (status?.state === 'unavailable') {
    return (
      <>
        {header}
        <EmptyState
          icon={GitBranch}
          title={t('git.missingTitle')}
          description={t('git.missingText')}
        />
      </>
    );
  }
  if (status?.state === 'noRepo') {
    return (
      <>
        {header}
        <EmptyState icon={GitBranch} title={t('git.noRepoTitle')} description={t('git.noRepoText')}>
          {trusted === true ? (
            <Button disabled={busy} onClick={() => void initRepository()}>
              {t('git.init')}
            </Button>
          ) : (
            <Button onClick={() => void trustProject()}>{t('trust.grant')}</Button>
          )}
        </EmptyState>
      </>
    );
  }
  if (!repo) {
    return (
      <>
        {header}
        <p className={styles['muted']}>{t('git.loading')}</p>
      </>
    );
  }

  const groups = groupFiles(repo.files);
  const empty = repo.files.length === 0;
  return (
    <>
      {header}
      <div className={styles['root']} aria-busy={busy}>
        {trusted === false && (
          <div className={styles['notice']}>
            <StatusMessage kind="warning">{t('git.readOnly')}</StatusMessage>
            <Button onClick={() => void trustProject()}>{t('trust.grant')}</Button>
          </div>
        )}
        {repo.nested && <p className={styles['muted']}>{t('git.nested')}</p>}
        <BranchBar />
        <CommitBox stagedCount={groups.staged.length} />
        {empty ? (
          <p className={styles['muted']}>{t('git.clean')}</p>
        ) : (
          <>
            <FileSection section="conflicts" files={groups.conflicts} />
            <FileSection section="staged" files={groups.staged} />
            <FileSection section="changes" files={groups.changes} />
            <FileSection section="untracked" files={groups.untracked} />
          </>
        )}
      </div>
    </>
  );
}

import { useEffect, useId, useState } from 'react';
import { Copy, ExternalLink, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GitHubDeviceCode, GitHubRepo, GitHubStatus } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Modal } from '../../components/Modal';
import { StatusMessage } from '../../components/StatusMessage';
import { useGitHubStore } from '../../stores/github';
import { closeModal } from '../../stores/modals';
import {
  cancelGitHubSignIn,
  cloneGitHubRepo,
  copyUserCode,
  loadGitHubRepos,
  openVerificationPage,
  signInToGitHub,
  signOutOfGitHub,
} from './actions';
import styles from './GitHubDialog.module.css';

function SignInProgress({ signIn }: { signIn: GitHubDeviceCode }) {
  const { t } = useTranslation();
  return (
    <div className={styles['signIn']}>
      <p>{t('github.enterCode')}</p>
      <div className={styles['code']}>
        <output aria-label={t('github.code')}>{signIn.userCode}</output>
        <IconButton
          size="sm"
          icon={Copy}
          label={t('github.copyCode')}
          onClick={() => void copyUserCode(signIn.userCode)}
        />
      </div>
      <div className={styles['row']}>
        <Button onClick={() => void openVerificationPage(signIn.verificationUri)}>
          <ExternalLink size={14} aria-hidden="true" />
          {t('github.openPage')}
        </Button>
        <Button variant="ghost" onClick={() => void cancelGitHubSignIn()}>
          {t('dialog.cancel')}
        </Button>
      </div>
      <p className={styles['hint']}>{t('github.waiting')}</p>
    </div>
  );
}

function SignedOut({ status }: { status: GitHubStatus }) {
  const { t } = useTranslation();
  return (
    <div className={styles['signIn']}>
      {status.signInError && (
        <StatusMessage kind="error">{t(`github.signInError.${status.signInError}`)}</StatusMessage>
      )}
      <p>{t('github.signInText')}</p>
      <div className={styles['row']}>
        <Button variant="primary" onClick={() => void signInToGitHub()}>
          {t('github.signIn')}
        </Button>
      </div>
      <p className={styles['hint']}>{t('github.tokenHint')}</p>
    </div>
  );
}

function RepoItem({ repo }: { repo: GitHubRepo }) {
  const { t } = useTranslation();
  const cloning = useGitHubStore((state) => state.cloning);
  return (
    <li className={styles['repo']} aria-label={repo.fullName}>
      <div className={styles['repoText']}>
        <span className={styles['repoName']}>
          {repo.private && <Lock size={12} aria-label={t('github.private')} />}
          {repo.fullName}
          {repo.archived && <span className={styles['tag']}>{t('github.archived')}</span>}
        </span>
        {repo.description && <span className={styles['description']}>{repo.description}</span>}
      </div>
      <Button
        disabled={cloning !== null}
        aria-label={t('github.cloneRepo', { name: repo.fullName })}
        onClick={() =>
          void cloneGitHubRepo(repo.fullName).then((opened) => {
            if (opened) closeModal();
          })
        }
      >
        {cloning === repo.fullName ? t('github.cloning') : t('github.clone')}
      </Button>
    </li>
  );
}

function Repositories() {
  const { t } = useTranslation();
  const searchId = useId();
  const { repos, loadingRepos } = useGitHubStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (repos === null) void loadGitHubRepos();
    // Loaded once per dialog; "Refresh" reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needle = query.trim().toLowerCase();
  const shown = (repos ?? []).filter(
    (repo) =>
      needle === '' ||
      repo.fullName.toLowerCase().includes(needle) ||
      (repo.description ?? '').toLowerCase().includes(needle),
  );
  return (
    <div className={styles['repos']}>
      <div className={styles['row']}>
        <label htmlFor={searchId} className="visually-hidden">
          {t('github.search')}
        </label>
        <input
          id={searchId}
          type="search"
          className={styles['search']}
          placeholder={t('github.search')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <Button variant="ghost" disabled={loadingRepos} onClick={() => void loadGitHubRepos()}>
          {t('github.refresh')}
        </Button>
      </div>
      {loadingRepos && repos === null ? (
        <p className={styles['hint']}>{t('github.loading')}</p>
      ) : shown.length === 0 ? (
        <p className={styles['hint']}>{t('github.noRepos')}</p>
      ) : (
        <ul className={styles['list']} aria-label={t('github.repos')}>
          {shown.map((repo) => (
            <RepoItem key={repo.fullName} repo={repo} />
          ))}
        </ul>
      )}
      <p className={styles['hint']}>{t('github.cloneHint')}</p>
    </div>
  );
}

/** GitHub account and its repositories (clone and open). */
export function GitHubDialog() {
  const { t } = useTranslation();
  const status = useGitHubStore((state) => state.status);
  return (
    <Modal title={t('github.title')} size="lg" onClose={closeModal}>
      {status === null ? null : !status.configured ? (
        <StatusMessage kind="info">{t('github.notConfigured')}</StatusMessage>
      ) : status.signIn ? (
        <SignInProgress signIn={status.signIn} />
      ) : !status.user ? (
        <SignedOut status={status} />
      ) : (
        <>
          <div className={styles['account']}>
            <span>
              {t('github.signedInAs', { login: status.user.login })}
              {status.user.name && ` (${status.user.name})`}
            </span>
            <Button variant="ghost" onClick={() => void signOutOfGitHub()}>
              {t('github.signOut')}
            </Button>
          </div>
          <Repositories />
        </>
      )}
    </Modal>
  );
}

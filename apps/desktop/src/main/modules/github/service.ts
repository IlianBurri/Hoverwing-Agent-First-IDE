import { z } from 'zod';
import { githubUserSchema } from '@kestrel/shared';
import type { GitHubDeviceCode, GitHubRepo, GitHubStatus, GitHubUser } from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import { readJsonFile, writeJsonFile } from '../../lib/jsonFile';
import type { SecretStore } from '../secrets';
import { TokenRejectedError, fetchRepos, fetchUser } from './api';
import { SignInError, abortableSleep, pollForToken, requestDeviceCode } from './deviceFlow';
import type { FetchFn } from './deviceFlow';
import { GITHUB_SCOPES } from './endpoints';
import type { GitHubEndpoints } from './endpoints';

export const TOKEN_KEY = 'github:token';

export interface GitHubServiceDeps {
  endpoints: GitHubEndpoints;
  fetch: FetchFn;
  secrets: Pick<SecretStore, 'get' | 'set'>;
  /** userData/github.json: the account name (not secret). */
  accountFile: string;
  /** Opens GitHub's code page in the user's browser. */
  openExternal: (url: string) => Promise<void>;
  onChanged: (status: GitHubStatus) => void;
  log: (line: string) => void;
  /** Wait between polls (tests pass a fast one). */
  sleep?: typeof abortableSleep;
}

const accountSchema = z.object({ user: githubUserSchema.nullable() });

/**
 * The GitHub account: device-flow sign-in, the token in the secret store
 * (never sent to the renderer or logged) and the user's repositories.
 */
export class GitHubService {
  private user: GitHubUser | null | undefined;
  private signIn: GitHubDeviceCode | null = null;
  private signInError: GitHubStatus['signInError'] = null;
  private abort: AbortController | null = null;

  constructor(private readonly deps: GitHubServiceDeps) {}

  private get configured(): boolean {
    return this.deps.endpoints.clientId !== '';
  }

  /** The token for git and the API; null when signed out. */
  token(): Promise<string | null> {
    return this.deps.secrets.get(TOKEN_KEY);
  }

  async status(): Promise<GitHubStatus> {
    if (this.user === undefined) {
      this.user = (await readJsonFile(this.deps.accountFile, accountSchema, { user: null })).user;
    }
    const signedIn = this.user !== null && (await this.token()) !== null;
    return {
      configured: this.configured,
      user: signedIn ? this.user : null,
      signIn: this.signIn,
      signInError: this.signInError,
    };
  }

  private async changed(): Promise<void> {
    this.deps.onChanged(await this.status());
  }

  /** Starts the device flow; the result arrives as a status change. */
  async startSignIn(): Promise<GitHubDeviceCode> {
    if (!this.configured) {
      throw new UserError('github_not_configured', 'GitHub sign-in is not set up in this build.');
    }
    this.cancelSignIn();
    let code;
    try {
      code = await requestDeviceCode(this.deps.fetch, this.deps.endpoints, GITHUB_SCOPES);
    } catch (error) {
      this.deps.log(`GitHub sign-in could not start: ${String(error)}`);
      throw new UserError('github_failed', 'GitHub is not reachable.');
    }
    // Only GitHub's own page is opened, whatever the answer says.
    const verificationUri = code.verificationUri.startsWith(`${this.deps.endpoints.web}/`)
      ? code.verificationUri
      : `${this.deps.endpoints.web}/login/device`;
    const abort = new AbortController();
    this.abort = abort;
    const signIn = {
      userCode: code.userCode,
      verificationUri,
      expiresAt: Date.now() + code.expiresIn * 1000,
    };
    this.signIn = signIn;
    this.signInError = null;
    await this.changed();
    await this.deps.openExternal(verificationUri).catch(() => undefined);

    void pollForToken(this.deps.fetch, this.deps.endpoints, code, abort.signal, {
      sleep: this.deps.sleep ?? abortableSleep,
    })
      .then(async (token) => {
        const user = await fetchUser(this.deps.fetch, this.deps.endpoints.api, token);
        if (abort.signal.aborted) return;
        await this.deps.secrets.set(TOKEN_KEY, token);
        await writeJsonFile(this.deps.accountFile, { user });
        this.user = user;
        this.deps.log(`Signed in to GitHub as ${user.login}.`);
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        const reason = error instanceof SignInError ? error.reason : 'failed';
        if (reason !== 'cancelled') this.signInError = reason;
        this.deps.log(`GitHub sign-in ended: ${reason}.`);
      })
      .finally(() => {
        if (this.abort !== abort) return;
        this.abort = null;
        this.signIn = null;
        void this.changed();
      });
    return signIn;
  }

  cancelSignIn(): void {
    const abort = this.abort;
    if (!abort) return;
    this.abort = null;
    this.signIn = null;
    abort.abort();
    void this.changed();
  }

  /** Forgets the token and the account (the token can be revoked on GitHub). */
  async signOut(): Promise<void> {
    this.cancelSignIn();
    await this.deps.secrets.set(TOKEN_KEY, null);
    await writeJsonFile(this.deps.accountFile, { user: null });
    this.user = null;
    this.signInError = null;
    await this.changed();
  }

  private async requireToken(): Promise<string> {
    const token = await this.token();
    if (!token) throw new UserError('github_auth', 'Not signed in to GitHub.');
    return token;
  }

  async repos(): Promise<GitHubRepo[]> {
    const token = await this.requireToken();
    try {
      return await fetchRepos(this.deps.fetch, this.deps.endpoints.api, token);
    } catch (error) {
      if (error instanceof TokenRejectedError) {
        // Revoked or expired on GitHub's side: sign in again.
        await this.signOut();
        throw new UserError('github_auth', 'GitHub rejected the sign-in.');
      }
      this.deps.log(`GitHub repositories could not be listed: ${String(error)}`);
      throw new UserError('github_failed', 'GitHub is not reachable.');
    }
  }

  /** Clone URL of a repository; always on the GitHub host, never with credentials. */
  cloneUrl(fullName: string): string {
    return `${this.deps.endpoints.web}/${fullName}.git`;
  }

  dispose(): void {
    this.abort?.abort();
    this.abort = null;
  }
}

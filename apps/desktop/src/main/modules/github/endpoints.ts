/**
 * Client id of Hoverwing's GitHub OAuth App (device flow enabled). It is public
 * by design: the device flow needs no client secret. Empty = sign-in is off.
 * How to register the app: docs/github-sign-in.md.
 */
export const GITHUB_CLIENT_ID = '';

/** Scopes: `repo` to clone and push private repositories, `read:user` for the name. */
export const GITHUB_SCOPES = 'repo read:user';

export interface GitHubEndpoints {
  clientId: string;
  /** github.com: device flow and git over HTTPS. */
  web: string;
  /** api.github.com: user and repositories. */
  api: string;
}

/** The real GitHub, or a fake one for tests (KESTREL_GITHUB_*). */
export function githubEndpoints(
  env: Readonly<Record<string, string | undefined>>,
): GitHubEndpoints {
  return {
    clientId: env['KESTREL_GITHUB_CLIENT_ID'] ?? GITHUB_CLIENT_ID,
    web: (env['KESTREL_GITHUB_URL'] ?? 'https://github.com').replace(/\/+$/, ''),
    api: (env['KESTREL_GITHUB_API_URL'] ?? 'https://api.github.com').replace(/\/+$/, ''),
  };
}

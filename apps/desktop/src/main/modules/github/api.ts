import { z } from 'zod';
import { githubRepoNameSchema } from '@kestrel/shared';
import type { GitHubRepo, GitHubUser } from '@kestrel/shared';
import type { FetchFn } from './deviceFlow';

/** At most this many pages of 100 repositories are listed. */
const MAX_PAGES = 10;

/** The token was revoked or expired: the user has to sign in again. */
export class TokenRejectedError extends Error {
  constructor() {
    super('GitHub rejected the token.');
  }
}

const userSchema = z.object({ login: z.string(), name: z.string().nullable().optional() });

const repoSchema = z.object({
  full_name: z.string(),
  description: z.string().nullable(),
  private: z.boolean(),
  fork: z.boolean(),
  archived: z.boolean().optional(),
  updated_at: z.string(),
});

async function get(fetchFn: FetchFn, url: string, token: string): Promise<unknown> {
  const response = await fetchFn(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'Kestrel',
    },
  });
  if (response.status === 401) throw new TokenRejectedError();
  if (!response.ok) throw new Error(`GitHub API answered ${String(response.status)}.`);
  return response.json();
}

export async function fetchUser(fetchFn: FetchFn, api: string, token: string): Promise<GitHubUser> {
  const user = userSchema.parse(await get(fetchFn, `${api}/user`, token));
  return { login: user.login, name: user.name ?? null };
}

/** The user's own, collaborator and organization repositories, recently updated first. */
export async function fetchRepos(
  fetchFn: FetchFn,
  api: string,
  token: string,
): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${api}/user/repos?per_page=100&sort=updated&page=${String(page)}`;
    const items = z.array(z.unknown()).parse(await get(fetchFn, url, token));
    for (const item of items) {
      const parsed = repoSchema.safeParse(item);
      if (!parsed.success || !githubRepoNameSchema.safeParse(parsed.data.full_name).success)
        continue;
      repos.push({
        fullName: parsed.data.full_name,
        description: parsed.data.description,
        private: parsed.data.private,
        fork: parsed.data.fork,
        archived: parsed.data.archived ?? false,
        updatedAt: parsed.data.updated_at,
      });
    }
    if (items.length < 100) break;
  }
  return repos;
}

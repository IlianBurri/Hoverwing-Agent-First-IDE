import { createHash } from 'node:crypto';

/** Label on every image and container Hoverwing creates. */
export const SANDBOX_LABEL = 'dev.kestrel.sandbox';

/** Tools agents expect besides Node (git for diffs/commits, rg for search). */
export const DEFAULT_SANDBOX_PACKAGES: readonly string[] = ['git', 'ripgrep', 'ca-certificates'];

/** Debian package names only, so nothing else ends up in the RUN line. */
export function isValidPackageName(name: string): boolean {
  return /^[a-z0-9][a-z0-9+.-]{0,99}$/.test(name);
}

/**
 * The sandbox image: a Debian-based Node image plus a few tools, and home
 * and cache folders any user id can write (the agent runs as the host user).
 */
export const SANDBOX_DOCKERFILE = `ARG BASE_IMAGE
FROM \${BASE_IMAGE}
ARG PACKAGES
RUN if [ -n "$PACKAGES" ]; then \\
      apt-get update \\
      && apt-get install -y --no-install-recommends $PACKAGES \\
      && rm -rf /var/lib/apt/lists/*; \\
    fi
RUN mkdir -p /home/kestrel /cache/npm /workspace \\
    && chmod 1777 /home/kestrel /cache/npm
`;

/** The tag changes whenever the recipe or the base image changes. */
export function sandboxImageTag(baseImage: string, packages: readonly string[]): string {
  const hash = createHash('sha256')
    .update(JSON.stringify([SANDBOX_DOCKERFILE, baseImage, [...packages]]))
    .digest('hex')
    .slice(0, 12);
  return `kestrel-sandbox:${hash}`;
}

import { z } from 'zod';
import type { GitHubEndpoints } from './endpoints';

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export type SignInFailure = 'expired' | 'denied' | 'failed' | 'cancelled';

export class SignInError extends Error {
  constructor(readonly reason: SignInFailure) {
    super(`GitHub sign-in ended: ${reason}`);
  }
}

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  /** Seconds until the code expires. */
  expiresIn: number;
  /** Seconds between polls. */
  interval: number;
}

const deviceCodeSchema = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.string(),
  expires_in: z.number(),
  interval: z.number(),
});

const tokenSchema = z.union([
  z.object({ access_token: z.string().min(1) }),
  z.object({ error: z.string(), interval: z.number().optional() }),
]);

async function postForm(
  fetchFn: FetchFn,
  url: string,
  form: Record<string, string>,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form).toString(),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new SignInError('failed');
  return response.json();
}

/** Step 1: GitHub hands out a code the user enters on its website. */
export async function requestDeviceCode(
  fetchFn: FetchFn,
  endpoints: GitHubEndpoints,
  scope: string,
): Promise<DeviceCode> {
  const parsed = deviceCodeSchema.safeParse(
    await postForm(fetchFn, `${endpoints.web}/login/device/code`, {
      client_id: endpoints.clientId,
      scope,
    }),
  );
  if (!parsed.success) throw new SignInError('failed');
  const data = parsed.data;
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in,
    interval: data.interval,
  };
}

/** Waits `ms`, or rejects once `signal` aborts. */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new SignInError('cancelled'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new SignInError('cancelled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Step 2: asks GitHub for the token until the user approved the code,
 * respecting `slow_down`. Rejects with a SignInError otherwise.
 */
export async function pollForToken(
  fetchFn: FetchFn,
  endpoints: GitHubEndpoints,
  code: DeviceCode,
  signal: AbortSignal,
  options: { now?: () => number; sleep?: typeof abortableSleep } = {},
): Promise<string> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? abortableSleep;
  const deadline = now() + code.expiresIn * 1000;
  let interval = Math.max(code.interval, 1);
  for (;;) {
    await sleep(interval * 1000, signal);
    if (now() > deadline) throw new SignInError('expired');
    let body: unknown;
    try {
      body = await postForm(
        fetchFn,
        `${endpoints.web}/login/oauth/access_token`,
        {
          client_id: endpoints.clientId,
          device_code: code.deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        },
        signal,
      );
    } catch (error) {
      if (signal.aborted) throw new SignInError('cancelled');
      throw error instanceof SignInError ? error : new SignInError('failed');
    }
    const parsed = tokenSchema.safeParse(body);
    if (!parsed.success) throw new SignInError('failed');
    if ('access_token' in parsed.data) return parsed.data.access_token;
    switch (parsed.data.error) {
      case 'authorization_pending':
        break;
      case 'slow_down':
        interval = parsed.data.interval ?? interval + 5;
        break;
      case 'expired_token':
        throw new SignInError('expired');
      case 'access_denied':
        throw new SignInError('denied');
      default:
        throw new SignInError('failed');
    }
  }
}

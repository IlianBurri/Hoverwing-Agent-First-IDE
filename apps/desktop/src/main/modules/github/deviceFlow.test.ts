import { describe, expect, it } from 'vitest';
import { SignInError, pollForToken, requestDeviceCode } from './deviceFlow';
import type { FetchFn } from './deviceFlow';

const endpoints = { clientId: 'client-1', web: 'https://gh.test', api: 'https://api.gh.test' };

/** Answers each POST with the next body of `answers` and records the forms. */
function fakeFetch(answers: unknown[]) {
  const forms: { url: string; form: Record<string, string> }[] = [];
  const fetchFn: FetchFn = (url, init) => {
    forms.push({
      url,
      form: Object.fromEntries(new URLSearchParams(typeof init.body === 'string' ? init.body : '')),
    });
    return Promise.resolve(Response.json(answers.shift() ?? { error: 'unexpected' }));
  };
  return { fetchFn, forms };
}

const code = {
  deviceCode: 'dev',
  userCode: 'ABCD-1234',
  verificationUri: '',
  expiresIn: 900,
  interval: 5,
};

describe('device flow', () => {
  it('requests a device code with the client id and scopes', async () => {
    const { fetchFn, forms } = fakeFetch([
      {
        device_code: 'dev',
        user_code: 'ABCD-1234',
        verification_uri: 'https://gh.test/login/device',
        expires_in: 900,
        interval: 5,
      },
    ]);
    await expect(requestDeviceCode(fetchFn, endpoints, 'repo read:user')).resolves.toEqual({
      deviceCode: 'dev',
      userCode: 'ABCD-1234',
      verificationUri: 'https://gh.test/login/device',
      expiresIn: 900,
      interval: 5,
    });
    expect(forms[0]).toEqual({
      url: 'https://gh.test/login/device/code',
      form: { client_id: 'client-1', scope: 'repo read:user' },
    });
  });

  it('polls until approved and slows down when asked', async () => {
    const waits: number[] = [];
    const { fetchFn, forms } = fakeFetch([
      { error: 'authorization_pending' },
      { error: 'slow_down', interval: 10 },
      { access_token: 'gho_secret' },
    ]);
    const token = await pollForToken(fetchFn, endpoints, code, new AbortController().signal, {
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });
    expect(token).toBe('gho_secret');
    expect(waits).toEqual([5000, 5000, 10_000]);
    expect(forms[0]?.form).toEqual({
      client_id: 'client-1',
      device_code: 'dev',
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
  });

  it.each([
    [{ error: 'expired_token' }, 'expired'],
    [{ error: 'access_denied' }, 'denied'],
    [{ error: 'device_flow_disabled' }, 'failed'],
    [{ nonsense: true }, 'failed'],
  ])('ends with a reason for %j', async (answer, reason) => {
    const { fetchFn } = fakeFetch([answer]);
    await expect(
      pollForToken(fetchFn, endpoints, code, new AbortController().signal, {
        sleep: () => Promise.resolve(),
      }),
    ).rejects.toMatchObject({ reason });
  });

  it('stops after the code expired and when cancelled', async () => {
    let now = 0;
    const { fetchFn } = fakeFetch([{ error: 'authorization_pending' }]);
    await expect(
      pollForToken(fetchFn, endpoints, code, new AbortController().signal, {
        now: () => now,
        sleep: () => {
          now += 1_000_000;
          return Promise.resolve();
        },
      }),
    ).rejects.toMatchObject({ reason: 'expired' });

    const abort = new AbortController();
    abort.abort();
    await expect(pollForToken(fetchFn, endpoints, code, abort.signal)).rejects.toBeInstanceOf(
      SignInError,
    );
  });
});

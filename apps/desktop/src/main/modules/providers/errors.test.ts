import { APIConnectionError, APIUserAbortError } from 'openai';
import { describe, expect, it } from 'vitest';
import { classifyModelError, shouldFallback } from './errors';
import { withFallback } from './fallback';
import { httpError } from './testing';

describe('classifyModelError', () => {
  it('maps HTTP status codes to kinds', () => {
    expect(classifyModelError(httpError(401)).kind).toBe('auth');
    expect(classifyModelError(httpError(402)).kind).toBe('auth');
    expect(classifyModelError(httpError(404)).kind).toBe('modelMissing');
    expect(classifyModelError(httpError(400)).kind).toBe('badRequest');
    expect(classifyModelError(httpError(503)).kind).toBe('server');
  });

  it('reads the retry-after header of rate limits', () => {
    expect(classifyModelError(httpError(429, { 'retry-after': '7' }))).toEqual({
      kind: 'rateLimited',
      retryAfter: 7,
    });
    expect(classifyModelError(httpError(429))).toEqual({ kind: 'rateLimited', retryAfter: null });
  });

  it('recognizes connection problems and cancellation', () => {
    expect(classifyModelError(new APIConnectionError({ message: 'down' })).kind).toBe(
      'unreachable',
    );
    expect(classifyModelError(new APIUserAbortError()).kind).toBe('cancelled');
    expect(classifyModelError(new DOMException('x', 'AbortError')).kind).toBe('cancelled');
    expect(classifyModelError(new Error('?')).kind).toBe('unknown');
  });

  it('falls back only where another model can help', () => {
    expect(shouldFallback({ kind: 'rateLimited', retryAfter: null })).toBe(true);
    expect(shouldFallback({ kind: 'modelMissing', retryAfter: null })).toBe(true);
    expect(shouldFallback({ kind: 'auth', retryAfter: null })).toBe(false);
  });
});

describe('withFallback', () => {
  it('tries the next model after a rate limit and reports it', async () => {
    const fallbacks: string[] = [];
    const result = await withFallback(
      ['free-a', 'free-b'],
      (model) => (model === 'free-a' ? Promise.reject(httpError(429)) : Promise.resolve('ok')),
      (from, to, error) => fallbacks.push(`${from}->${to}:${error.kind}`),
    );
    expect(result).toEqual({ model: 'free-b', result: 'ok' });
    expect(fallbacks).toEqual(['free-a->free-b:rateLimited']);
  });

  it('stops at errors another model cannot fix', async () => {
    const tried: string[] = [];
    await expect(
      withFallback(['a', 'b'], (model) => {
        tried.push(model);
        return Promise.reject(httpError(401));
      }),
    ).rejects.toMatchObject({ error: { kind: 'auth' } });
    expect(tried).toEqual(['a']);
  });

  it('reports the last error when every model fails', async () => {
    await expect(
      withFallback(['a', 'b'], () => Promise.reject(httpError(429, { 'retry-after': '3' }))),
    ).rejects.toMatchObject({ error: { kind: 'rateLimited', retryAfter: 3 } });
  });
});

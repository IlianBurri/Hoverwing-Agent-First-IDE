import { APIConnectionError, APIError, APIUserAbortError } from 'openai';
import type { ModelError, ModelErrorKind } from '@kestrel/shared';
import { UserError } from '../../ipc/errors';

/** A failed model request, already classified. Never carries the provider's text. */
export class ModelRequestError extends Error {
  constructor(readonly error: ModelError) {
    super(`Model request failed: ${error.kind}`);
    this.name = 'ModelRequestError';
  }
}

function retryAfter(headers: Headers | undefined): number | null {
  const value = headers?.get('retry-after');
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds));
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, Math.round((date - Date.now()) / 1000));
}

function kindForStatus(status: number): ModelErrorKind {
  if (status === 401 || status === 402 || status === 403) return 'auth';
  if (status === 429) return 'rateLimited';
  if (status === 404) return 'modelMissing';
  if (status === 400 || status === 422) return 'badRequest';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** Turns whatever a request threw into a kind the UI can explain. */
export function classifyModelError(error: unknown): ModelError {
  if (error instanceof ModelRequestError) return error.error;
  if (error instanceof APIUserAbortError) return { kind: 'cancelled', retryAfter: null };
  if (error instanceof Error && error.name === 'AbortError') {
    return { kind: 'cancelled', retryAfter: null };
  }
  if (error instanceof APIConnectionError) return { kind: 'unreachable', retryAfter: null };
  if (error instanceof APIError && typeof error.status === 'number') {
    const kind = kindForStatus(error.status);
    const headers: unknown = error.headers;
    return {
      kind,
      retryAfter: kind === 'rateLimited' && headers instanceof Headers ? retryAfter(headers) : null,
    };
  }
  return { kind: 'unknown', retryAfter: null };
}

/** Errors where the next model of the list may still work. */
export function shouldFallback(error: ModelError): boolean {
  return error.kind === 'rateLimited' || error.kind === 'modelMissing' || error.kind === 'server';
}

/** For request/response channels (e.g. "test connection"). */
export function toProviderUserError(error: ModelError): UserError {
  switch (error.kind) {
    case 'unreachable':
      return new UserError('provider_unreachable', 'The provider is not reachable.');
    case 'auth':
      return new UserError('provider_auth', 'The provider refused the API key.');
    case 'rateLimited':
      return new UserError('provider_rate_limited', 'Rate limit reached.');
    case 'modelMissing':
      return new UserError('provider_model_missing', 'Model or endpoint not found.');
    default:
      return new UserError('provider_failed', `Provider request failed: ${error.kind}`);
  }
}

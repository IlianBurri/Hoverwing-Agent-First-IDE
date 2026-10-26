import type { ModelError } from '@kestrel/shared';
import { ModelRequestError, classifyModelError, shouldFallback } from './errors';

/**
 * Tries the models in order. Rate limits, missing models and server errors
 * move on to the next model (reported via `onFallback`); anything else, or
 * the last model failing, throws a ModelRequestError.
 */
export async function withFallback<T>(
  models: readonly string[],
  attempt: (model: string) => Promise<T>,
  onFallback: (from: string, to: string, error: ModelError) => void = () => undefined,
  /** False once output was shown (a stream must not restart with another model). */
  canFallback: () => boolean = () => true,
): Promise<{ model: string; result: T }> {
  for (const [index, model] of models.entries()) {
    try {
      return { model, result: await attempt(model) };
    } catch (error) {
      const classified = classifyModelError(error);
      const next = models[index + 1];
      if (next === undefined || !shouldFallback(classified) || !canFallback()) {
        throw new ModelRequestError(classified);
      }
      onFallback(model, next, classified);
    }
  }
  throw new ModelRequestError({ kind: 'modelMissing', retryAfter: null });
}

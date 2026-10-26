import { APIError } from 'openai';
import type { ChatTurn, ModelClient } from './client';

/** An HTTP error as the SDK throws it, e.g. httpError(429, { 'retry-after': '7' }). */
export function httpError(status: number, headers: Record<string, string> = {}): APIError {
  return APIError.generate(status, undefined, `HTTP ${String(status)}`, new Headers(headers));
}

export interface FakeModelCall {
  kind: 'chat' | 'streamChat' | 'complete';
  model: string;
  messages?: ChatTurn[];
  prompt?: string;
  suffix?: string;
}

/**
 * A scripted model client for unit tests. `answer` returns the text for a
 * call, or throws to simulate an error.
 */
export function fakeModelClient(answer: (call: FakeModelCall) => string): ModelClient & {
  calls: FakeModelCall[];
} {
  const calls: FakeModelCall[] = [];
  const run = (call: FakeModelCall, signal: AbortSignal): string => {
    calls.push(call);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return answer(call);
  };
  return {
    calls,
    listModels: () => Promise.resolve(['b-model', 'a-model']),
    streamChat: ({ model, messages, signal }, onDelta) => {
      try {
        const text = run({ kind: 'streamChat', model, messages }, signal);
        // Deliver word by word, like a real stream.
        for (const part of text.split(/(?<= )/)) onDelta(part);
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
    chat: ({ model, messages, signal }) => {
      try {
        return Promise.resolve(run({ kind: 'chat', model, messages }, signal));
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
    complete: ({ model, prompt, suffix, signal }) => {
      try {
        return Promise.resolve(run({ kind: 'complete', model, prompt, suffix }, signal));
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
  };
}

export function memorySecrets() {
  const values = new Map<string, string>();
  return {
    values,
    get: (key: string) => Promise.resolve(values.get(key) ?? null),
    set: (key: string, value: string | null) => {
      if (value === null) values.delete(key);
      else values.set(key, value);
      return Promise.resolve();
    },
    has: (key: string) => Promise.resolve(values.has(key)),
  };
}

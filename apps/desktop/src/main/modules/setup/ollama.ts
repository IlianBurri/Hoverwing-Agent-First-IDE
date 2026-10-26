import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { byteReader } from '../../lib/bytes';
import { findInPath } from './hardware';

export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';

const versionSchema = z.object({ version: z.string() });
const tagsSchema = z.object({ models: z.array(z.object({ name: z.string() })) });
const pullLineSchema = z.object({
  status: z.string().optional(),
  digest: z.string().optional(),
  total: z.number().optional(),
  completed: z.number().optional(),
  error: z.string().optional(),
});
const generateSchema = z.object({ eval_count: z.number(), eval_duration: z.number() });

export class OllamaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OllamaError';
  }
}

/** The parts of Ollama's own HTTP API the setup assistant needs. */
export interface OllamaApi {
  readonly baseUrl: string;
  version(): Promise<string | null>;
  models(): Promise<string[]>;
  pull(
    model: string,
    onProgress: (completed: number, total: number) => void,
    signal: AbortSignal,
  ): Promise<void>;
  /** Generates a fixed text; returns tokens per second of the generation. */
  measure(model: string, signal: AbortSignal): Promise<number>;
}

const BENCHMARK_PROMPT =
  'Write a TypeScript function that returns the n-th Fibonacci number, with a short comment.';

export function ollamaApi(baseUrl: string, fetchImpl: typeof fetch = fetch): OllamaApi {
  const url = (path: string) => `${baseUrl.replace(/\/$/, '')}${path}`;
  const getJson = async <T>(path: string, schema: z.ZodType<T>): Promise<T> => {
    const response = await fetchImpl(url(path), { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new OllamaError(`HTTP ${String(response.status)}`);
    return schema.parse(await response.json());
  };

  return {
    baseUrl,
    async version() {
      try {
        return (await getJson('/api/version', versionSchema)).version;
      } catch {
        return null;
      }
    },
    async models() {
      return (await getJson('/api/tags', tagsSchema)).models.map((model) => model.name);
    },
    async pull(model, onProgress, signal) {
      const response = await fetchImpl(url('/api/pull'), {
        method: 'POST',
        body: JSON.stringify({ model, stream: true }),
        signal,
      });
      if (!response.ok || !response.body) {
        throw new OllamaError(`Pull failed: HTTP ${String(response.status)}`);
      }
      // One JSON object per line; layers (digests) are downloaded one after another.
      const layers = new Map<string, { completed: number; total: number }>();
      const decoder = new TextDecoder();
      let buffer = '';
      const reader = byteReader(response.body);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const parsed = pullLineSchema.safeParse(JSON.parse(line));
          if (!parsed.success) continue;
          if (parsed.data.error) throw new OllamaError(parsed.data.error);
          const { digest, total, completed } = parsed.data;
          if (digest && total) layers.set(digest, { total, completed: completed ?? 0 });
          let sum = 0;
          let all = 0;
          for (const layer of layers.values()) {
            sum += layer.completed;
            all += layer.total;
          }
          onProgress(sum, all);
        }
      }
    },
    async measure(model, signal) {
      const response = await fetchImpl(url('/api/generate'), {
        method: 'POST',
        body: JSON.stringify({
          model,
          prompt: BENCHMARK_PROMPT,
          stream: false,
          options: { num_predict: 128, temperature: 0 },
        }),
        signal,
      });
      if (!response.ok) throw new OllamaError(`HTTP ${String(response.status)}`);
      const result = generateSchema.parse(await response.json());
      // Durations are in nanoseconds; loading the model is not counted.
      return result.eval_duration > 0 ? result.eval_count / (result.eval_duration / 1e9) : 0;
    },
  };
}

/** Where the Ollama program usually is, besides PATH. */
export function ollamaInstallPaths(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform === 'win32') {
    const local = env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local');
    return [join(local, 'Programs', 'Ollama', 'ollama.exe')];
  }
  if (platform === 'darwin') {
    return ['/Applications/Ollama.app', '/usr/local/bin/ollama', '/opt/homebrew/bin/ollama'];
  }
  return ['/usr/local/bin/ollama', '/usr/bin/ollama'];
}

export async function isOllamaInstalled(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  exists: (path: string) => Promise<boolean>,
): Promise<boolean> {
  if (await findInPath('ollama', platform, env, exists)) return true;
  for (const path of ollamaInstallPaths(platform, env)) if (await exists(path)) return true;
  return false;
}

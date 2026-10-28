import OpenAI from 'openai';

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface RequestOptions {
  model: string;
  signal: AbortSignal;
  maxTokens?: number;
  temperature?: number;
  /** OpenAI's `reasoning_effort` (also understood by Ollama for thinking models). */
  reasoningEffort?: 'low' | 'medium' | 'high';
  stop?: string[];
  /** Ask for a JSON object (OpenAI "json_object" mode; Ollama supports it too). */
  json?: boolean;
}

/** The few things Kestrel asks a model endpoint (injectable for tests). */
export interface ModelClient {
  listModels(signal: AbortSignal): Promise<string[]>;
  /** Streams a chat answer; resolves when it is complete. */
  streamChat(
    options: RequestOptions & { messages: ChatTurn[] },
    onDelta: (text: string) => void,
  ): Promise<void>;
  /** A short, non-streamed chat answer (completion without FIM). */
  chat(options: RequestOptions & { messages: ChatTurn[] }): Promise<string>;
  /** Fill-in-the-middle via /completions with a suffix. */
  complete(options: RequestOptions & { prompt: string; suffix: string }): Promise<string>;
}

export interface Endpoint {
  baseUrl: string;
  apiKey: string | null;
}

export type CreateModelClient = (endpoint: Endpoint) => ModelClient;

/** A client for any OpenAI-compatible endpoint (OpenRouter, Ollama, llama.cpp …). */
export function openAiClient({ baseUrl, apiKey }: Endpoint): ModelClient {
  const client = new OpenAI({
    baseURL: baseUrl,
    // Local servers need no key, but the SDK insists on one.
    apiKey: apiKey ?? 'no-key',
    // Never pick up OPENAI_* variables from the environment: they belong
    // to the user's shell, not to the provider configured here.
    organization: null,
    project: null,
    adminAPIKey: null,
    webhookSecret: null,
    // Fallback models are tried instead of waiting for retries.
    maxRetries: 0,
    timeout: 120_000,
  });

  return {
    async listModels(signal) {
      const page = await client.models.list({ signal });
      return page.data.map((model) => model.id);
    },
    async streamChat(
      { model, messages, signal, maxTokens, temperature, reasoningEffort },
      onDelta,
    ) {
      const stream = await client.chat.completions.create(
        {
          model,
          messages,
          stream: true,
          // max_tokens, not max_completion_tokens: local servers (Ollama,
          // llama.cpp) and most compatible endpoints only know the old name.
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
          ...(temperature === undefined ? {} : { temperature }),
          ...(reasoningEffort === undefined ? {} : { reasoning_effort: reasoningEffort }),
        },
        { signal },
      );
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta.content;
        if (text) onDelta(text);
      }
    },
    async chat({ model, messages, signal, maxTokens, temperature, stop, json }) {
      const response = await client.chat.completions.create(
        {
          model,
          messages,
          // eslint-disable-next-line @typescript-eslint/no-deprecated -- see streamChat
          ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
          ...(temperature === undefined ? {} : { temperature }),
          ...(stop === undefined ? {} : { stop }),
          ...(json ? { response_format: { type: 'json_object' as const } } : {}),
        },
        { signal },
      );
      return response.choices[0]?.message.content ?? '';
    },
    async complete({ model, prompt, suffix, signal, maxTokens, temperature, stop }) {
      const response = await client.completions.create(
        {
          model,
          prompt,
          suffix,
          ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
          ...(temperature === undefined ? {} : { temperature }),
          ...(stop === undefined ? {} : { stop }),
        },
        { signal },
      );
      return response.choices[0]?.text ?? '';
    },
  };
}

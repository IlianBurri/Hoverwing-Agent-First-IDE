import { join } from 'node:path';
import { rateSpeed } from '@kestrel/shared';
import type {
  BenchmarkResult,
  HardwareInfo,
  InstallPlan,
  ModelCatalog,
  ModelPurpose,
  OllamaStatus,
  ProviderConfig,
  SetupProgress,
  Settings,
} from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import type { ProviderService } from '../providers';
import type { CatalogStore } from './catalog';
import type { OllamaApi } from './ollama';

export interface SetupServiceDeps {
  detectHardware: () => Promise<HardwareInfo>;
  catalog: Pick<CatalogStore, 'get' | 'update'>;
  ollama: OllamaApi;
  isOllamaInstalled: () => Promise<boolean>;
  installPlan: () => Promise<InstallPlan | null>;
  download: (
    plan: InstallPlan,
    destination: string,
    onProgress: (completed: number, total: number) => void,
    signal: AbortSignal,
  ) => Promise<void>;
  /** Asks natively, then starts the downloaded installer; false if declined. */
  launchInstaller: (ownerId: number, plan: InstallPlan, file: string) => Promise<boolean>;
  providers: Pick<ProviderService, 'list' | 'save'>;
  settings: {
    get: () => Settings;
    update: (patch: Partial<Settings>) => Promise<unknown>;
  };
  downloadsDir: string;
  progress: (ownerId: number, progress: SetupProgress) => void;
}

/** Id of the provider the assistant creates for the local Ollama. */
export const LOCAL_PROVIDER_ID = 'ollama-local';

interface Task {
  ownerId: number;
  controller: AbortController;
}

/** The setup assistant: hardware, catalog, Ollama install, model downloads. */
export class SetupService {
  private hardwareInfo: Promise<HardwareInfo> | null = null;
  private readonly tasks = new Map<string, Task>();

  constructor(private readonly deps: SetupServiceDeps) {}

  hardware(): Promise<HardwareInfo> {
    this.hardwareInfo ??= this.deps.detectHardware().catch((error: unknown) => {
      this.hardwareInfo = null;
      throw error;
    });
    return this.hardwareInfo;
  }

  catalog(): Promise<ModelCatalog> {
    return this.deps.catalog.get();
  }

  updateCatalog(): Promise<{ updated: boolean; catalog: ModelCatalog }> {
    return this.deps.catalog.update();
  }

  async ollamaStatus(): Promise<OllamaStatus> {
    const [version, installed] = await Promise.all([
      this.deps.ollama.version(),
      this.deps.isOllamaInstalled(),
    ]);
    const models = version ? await this.deps.ollama.models().catch(() => []) : [];
    return { installed: installed || version !== null, running: version !== null, version, models };
  }

  installPlan(): Promise<InstallPlan | null> {
    return this.deps.installPlan();
  }

  /** Runs a cancellable task and reports its progress as setup:progress. */
  private async track(
    ownerId: number,
    taskId: string,
    run: (report: (completed: number, total: number) => void, signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    const controller = new AbortController();
    this.tasks.set(taskId, { ownerId, controller });
    let last = { completed: 0, total: 0 };
    let lastSent = 0;
    const send = (status: SetupProgress['status']) => {
      this.deps.progress(ownerId, { taskId, status, ...last });
    };
    try {
      await run((completed, total) => {
        last = { completed, total };
        // At most ~10 updates per second.
        const now = Date.now();
        if (now - lastSent >= 100) {
          lastSent = now;
          send('running');
        }
      }, controller.signal);
      send('done');
    } catch (error) {
      send(controller.signal.aborted ? 'cancelled' : 'failed');
      if (!controller.signal.aborted) throw error;
    } finally {
      this.tasks.delete(taskId);
    }
  }

  async installOllama(ownerId: number, taskId: string): Promise<{ started: boolean }> {
    const plan = await this.deps.installPlan();
    if (!plan) throw new UserError('ollama_unavailable', 'No installer for this system.');
    const file = join(this.deps.downloadsDir, plan.fileName);
    const outcome = { cancelled: false };
    await this.track(ownerId, taskId, async (report, signal) => {
      signal.addEventListener('abort', () => {
        outcome.cancelled = true;
      });
      await this.deps.download(plan, file, report, signal);
    });
    if (outcome.cancelled) return { started: false };
    return { started: await this.deps.launchInstaller(ownerId, plan, file) };
  }

  async pullModel(ownerId: number, taskId: string, model: string): Promise<void> {
    if ((await this.deps.ollama.version()) === null) {
      throw new UserError('ollama_unavailable', 'Ollama is not running.');
    }
    await this.track(ownerId, taskId, (report, signal) =>
      this.deps.ollama.pull(model, report, signal),
    );
  }

  cancel(ownerId: number, taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task?.ownerId === ownerId) task.controller.abort();
  }

  release(ownerId: number): void {
    for (const task of this.tasks.values()) {
      if (task.ownerId === ownerId) task.controller.abort();
    }
  }

  async benchmark(model: string, purpose: ModelPurpose): Promise<BenchmarkResult> {
    if ((await this.deps.ollama.version()) === null) {
      throw new UserError('ollama_unavailable', 'Ollama is not running.');
    }
    const signal = AbortSignal.timeout(180_000);
    let tokensPerSecond: number;
    try {
      tokensPerSecond = await this.deps.ollama.measure(model, signal);
    } catch {
      throw new UserError('ollama_unavailable', 'The speed test failed.');
    }
    return { model, tokensPerSecond, rating: rateSpeed(purpose, tokensPerSecond) };
  }

  /** Adds (or updates) the local Ollama provider and uses its models. */
  async apply(choice: { completion: string | null; chat: string | null }): Promise<void> {
    const models = [...new Set([choice.chat, choice.completion].filter((model) => model !== null))];
    const settings = this.deps.settings.get();
    if (models.length > 0) {
      const existing = (await this.deps.providers.list()).find(
        (provider) => provider.id === LOCAL_PROVIDER_ID,
      );
      const config: ProviderConfig = {
        id: LOCAL_PROVIDER_ID,
        name: existing?.name ?? 'Ollama',
        template: 'ollama',
        baseUrl: `${this.deps.ollama.baseUrl.replace(/\/$/, '')}/v1`,
        models: [...new Set([...models, ...(existing?.models ?? [])])].slice(0, 10),
      };
      await this.deps.providers.save(config);
    }
    await this.deps.settings.update({
      setupDone: true,
      ...(choice.chat ? { chatModel: { providerId: LOCAL_PROVIDER_ID, model: choice.chat } } : {}),
      ...(choice.completion
        ? {
            completion: {
              ...settings.completion,
              enabled: true,
              model: { providerId: LOCAL_PROVIDER_ID, model: choice.completion },
            },
          }
        : {}),
    });
  }
}

import { create } from 'zustand';
import type {
  BenchmarkResult,
  HardwareInfo,
  InstallPlan,
  ModelCatalog,
  OllamaStatus,
  SetupProgress,
} from '@kestrel/shared';

interface SetupState {
  hardware: HardwareInfo | null;
  hardwareFailed: boolean;
  catalog: ModelCatalog | null;
  ollama: OllamaStatus | null;
  /** undefined = not loaded yet; null = no automatic install on this system. */
  plan: InstallPlan | null | undefined;
  installTask: string | null;
  installStarted: boolean;
  /** Running or finished downloads: model -> task id. */
  pulls: Readonly<Record<string, string>>;
  progress: Readonly<Record<string, SetupProgress>>;
  benchmarks: Readonly<Record<string, BenchmarkResult>>;
  benchmarking: boolean;
}

export const initialSetupState: SetupState = {
  hardware: null,
  hardwareFailed: false,
  catalog: null,
  ollama: null,
  plan: undefined,
  installTask: null,
  installStarted: false,
  pulls: {},
  progress: {},
  benchmarks: {},
  benchmarking: false,
};

export const useSetupStore = create<SetupState>()(() => initialSetupState);

export function applySetupProgress(progress: SetupProgress): void {
  useSetupStore.setState((state) => ({
    progress: { ...state.progress, [progress.taskId]: progress },
  }));
}

export { CatalogStore, defaultCatalog } from './catalog';
export { createSetupHandlers } from './handlers';
export { detectHardware, pathExists } from './hardware';
export type { SystemInfo } from './hardware';
export { downloadVerified, ollamaInstallPlan } from './installer';
export { DEFAULT_OLLAMA_URL, isOllamaInstalled, ollamaApi } from './ollama';
export { LOCAL_PROVIDER_ID, SetupService } from './service';

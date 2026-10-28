/** Variables that belong to Hoverwing/Electron and must not leak into child processes. */
const internalVariables = [
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ATTACH_CONSOLE',
  'ELECTRON_RENDERER_URL',
  'KESTREL_USER_DATA_DIR',
  'KESTREL_SANDBOX_PACKAGES',
  'CHROME_DESKTOP',
];

/** A copy of the environment without Hoverwing-internal variables. */
export function childEnv(
  base: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined && !internalVariables.includes(key)) env[key] = value;
  }
  return env;
}

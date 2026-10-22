export interface ShellCommand {
  file: string;
  args: string[];
}

/** The user's default shell, as the OS terminal would start it. */
export function defaultShell(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
): ShellCommand {
  if (platform === 'win32') {
    return { file: 'powershell.exe', args: ['-NoLogo'] };
  }
  const file = env['SHELL'] ?? (platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  // macOS terminals start login shells, so PATH from ~/.zprofile etc. applies.
  return { file, args: platform === 'darwin' ? ['-l'] : [] };
}

/** Variables that belong to Kestrel/Electron and must not leak into shells. */
const internalVariables = [
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ATTACH_CONSOLE',
  'ELECTRON_RENDERER_URL',
  'KESTREL_USER_DATA_DIR',
  'CHROME_DESKTOP',
];

export function terminalEnv(
  base: Readonly<Record<string, string | undefined>>,
  version: string,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined && !internalVariables.includes(key)) env[key] = value;
  }
  env['TERM'] = 'xterm-256color';
  env['COLORTERM'] = 'truecolor';
  env['TERM_PROGRAM'] = 'Kestrel';
  env['TERM_PROGRAM_VERSION'] = version;
  // Without a locale many tools fall back to ASCII and break umlauts.
  env['LANG'] ??= 'en_US.UTF-8';
  return env;
}

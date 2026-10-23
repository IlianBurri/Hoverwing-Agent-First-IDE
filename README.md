# Kestrel

Kestrel is an agent-first desktop IDE. It does not ship its own AI. You bring your
own agent (e.g. Claude Code via the Agent Client Protocol), your own API key or a
local model, and Kestrel makes working with it visible, safe and easy to undo.

> Status: **phase 2 done** – workspace, editor, search, terminal, plus agents via
> the Agent Client Protocol with permissions, checkpoints and diff review. The
> agent sandbox (Docker) follows in phase 3. See [`SPEC.md`](SPEC.md) for the
> full specification and roadmap.

## What works today

- **Workbench:** resizable panels (sidebar, editor, bottom panel, agent panel), custom
  title bar, dark/light/system theme, German and English. Layout is remembered.
- **Command palette** (`Ctrl/Cmd+K` or `Ctrl/Cmd+Shift+P`): every action, with
  shortcuts that can be overridden in the settings file.
- **Files:** open a folder, virtualized file tree (10,000+ files), create, rename (F2),
  move (drag and drop), delete to the system trash (with confirmation). Changes made
  outside Kestrel show up automatically.
- **Editor:** Monaco with tabs, syntax highlighting, find/replace in the file, unsaved
  markers, `Ctrl/Cmd+S`. If a file changes on disk while you have unsaved edits,
  Kestrel asks instead of overwriting.
- **Project search** (`Ctrl/Cmd+Shift+F`): ripgrep-powered, respects `.gitignore`,
  case/word/regex options, include/exclude globs, replace with preview.
- **Terminal** (`` Ctrl+` ``): several terminals with your default shell, started in
  the project folder.

- **Agents** (ACP): start your own agent (templates for Claude Code and Gemini
  CLI) in the project folder. Streaming answers, plan, tool calls, stop button,
  resume earlier sessions. Log in inside the agent itself – Kestrel never
  handles your credentials.
- **Permissions:** every risky agent action asks first (allow once / always for
  this project / deny). Secret files (`.env`, keys, `.ssh` …) are always blocked
  for access through Kestrel. Every decision is logged (bottom panel → Logs).
- **Checkpoints:** before every agent turn, the project state is saved in a
  separate git repository in the app data folder (your own `.git` is never
  touched). Jump back to any checkpoint, completely or per file.
- **Diff review:** agent changes are listed for review; accept or reject per
  file or per section. Rejected changes leave the file exactly as it was.

## Requirements

- Node.js ≥ 22.12 (see `.nvmrc`)
- pnpm 10 (`corepack enable` picks the version pinned in `package.json`)
- Git (for checkpoints)
- **Linux only:** a C/C++ toolchain and Python 3 (`build-essential`, `python3`) –
  `node-pty` is compiled during install. macOS and Windows use prebuilt binaries.
- Headless Linux (E2E tests): `xvfb-run`

## Setup

```bash
pnpm install
pnpm dev
```

If Electron fails to download during `pnpm install` (flaky network), run it again
or trigger the download manually:

```bash
node node_modules/electron/install.js
```

## Commands

| Command          | What it does                                     |
| ---------------- | ------------------------------------------------ |
| `pnpm dev`       | Start the app with hot reload                    |
| `pnpm build`     | Build main, preload and renderer into `out/`     |
| `pnpm lint`      | ESLint (type-aware, `any` is an error)           |
| `pnpm typecheck` | TypeScript in all packages                       |
| `pnpm test`      | Unit tests (Vitest)                              |
| `pnpm test:e2e`  | Build, then E2E tests with Playwright + Electron |
| `pnpm format`    | Format everything with Prettier                  |

On a Linux machine without a display use `xvfb-run -a pnpm test:e2e`.

## Keyboard shortcuts

`Mod` is `Cmd` on macOS and `Ctrl` elsewhere.

| Shortcut                         | Action                        |
| -------------------------------- | ----------------------------- |
| `Mod+K`, `Mod+Shift+P`           | Command palette               |
| `Mod+O`                          | Open folder                   |
| `Mod+B` / `Mod+J`                | Toggle sidebar / bottom panel |
| `Mod+Alt+B`                      | Toggle agent panel            |
| `Mod+Shift+E` / `Mod+Shift+F`    | Files / project search        |
| `Mod+S`, `Mod+Alt+S`             | Save, save all                |
| `Mod+W`, `Ctrl+Tab`              | Close tab, next tab           |
| `` Ctrl+` `` / ``Ctrl+Shift+` `` | Show terminal / new terminal  |

Inside a terminal on Windows/Linux, `Ctrl+<letter>` goes to the shell (e.g. `Ctrl+C`,
`Ctrl+R`); use `Ctrl+Shift+P` for the palette there. Copy with `Ctrl+Shift+C`.

Shortcuts can be changed in `settings.json` in the app data folder:
`"keybindings": { "view.toggleSidebar": "Mod+Shift+B" }` (empty string disables one).

## Project structure

```
apps/desktop/          Electron app
  src/main/            Main process: windows, security, IPC, modules
    modules/           app, settings, workspace, search, terminal
  src/preload/         Minimal typed bridge (window.kestrel)
  src/renderer/        React UI
    layout/            App shell, title/activity/status bar, panels
    features/          commands, workspace, editor, search, terminal, agent
    components/        Reusable UI (dialogs, tabs, menus, buttons …)
    stores/            Zustand stores
    design/            Design tokens and themes
  e2e/                 Playwright tests against the built app
packages/shared/       Code shared by all processes (IPC contract, schemas)
```

## Security model (short)

- The renderer is sandboxed, context-isolated and has no Node.js access.
- It talks to the main process through one typed `invoke` function. Every channel
  is declared with zod schemas in `packages/shared/src/ipc/channels/` and every
  request is validated in the main process.
- File paths from the UI are always relative to the open folder; the main process
  rejects anything outside it (including symlinks that point outside).
- A strict Content-Security-Policy is applied (Monaco is bundled locally, no CDN);
  navigation and new windows are blocked.

## Note on trademarks

Kestrel is an independent project. It supports Claude Code via the Agent
Client Protocol but is not affiliated with or endorsed by Anthropic.

## License

[MIT](LICENSE)

# Kestrel

Kestrel is an agent-first desktop IDE. It does not ship its own AI. You bring your
own agent (e.g. Claude Code via the Agent Client Protocol), your own API key or a
local model, and Kestrel makes working with it visible, safe and easy to undo.

> Status: **phase 7 done** – workspace, editor, search, terminal, agents via the
> Agent Client Protocol with permissions, checkpoints and diff review, an
> optional Docker sandbox for agents, a Docker panel, an integrated browser the
> agent can inspect, an MCP manager, model providers with a built-in chat and
> inline autocompletion. See [`SPEC.md`](SPEC.md) for the full specification
> and roadmap.

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
- **Agent sandbox (Docker):** per agent, “Run in the Docker sandbox” starts the
  agent in a container that sees only the project (secret files such as `.env`
  are covered with an empty file, `.ssh`/`.aws`/`.gnupg` folders with an empty
  tmpfs) and its own home volume – not your home folder or other files. The
  container has a read-only root file system, no capabilities, memory/CPU
  limits, and runs as your user on Linux. A badge always shows whether an agent
  runs in the sandbox or directly on the system. Log in to the agent in a
  sandbox terminal (Manage agents → “Log in in the sandbox terminal”); the login
  stays in the agent's Docker volume and Kestrel never reads it.
- **Integrated browser** (`Mod+Shift+O`): browser tabs next to your files,
  address bar (`localhost:3000` works), back/forward/reload, DevTools. Pages run
  in their own session (own cookies, no access to Kestrel, all permission
  requests such as camera or location denied, only http/https). Docker ports
  and `localhost` links in the terminal open here. Command “Clear browser data”.
- **Browser tools for agents:** Kestrel gives every agent session its own MCP
  server with `browser_list_tabs`, `browser_screenshot`, `browser_console`,
  `browser_network_errors` and `browser_open`. Each read asks for permission
  (per site, “always allow” possible); opening pages has its own permission.
  Web content reaches the agent clearly marked as untrusted data. Works for
  sandboxed agents too.
- **MCP manager** (sidebar “MCP”): add MCP servers – local (command, arguments,
  environment) or remote (URL, headers) – globally or for the project, or import
  them from the project's `.mcp.json`. Test the connection, see the tools,
  switch servers and single tools on/off and set a level per tool (allow / ask /
  deny). Kestrel connects to the servers itself and passes the enabled tools to
  the agent (as `<server>__<tool>`), so every call goes through the permission
  system and the audit log, and results reach the agent marked as untrusted.
  New local commands need a confirmation in a system dialog; secrets live in
  the system keychain. Local servers run on your system, so they are not given
  to sandboxed agents unless you allow it. OAuth logins are not supported yet.
- **Models** (sidebar “Models”): add OpenAI-compatible providers – templates
  for OpenRouter, Ollama and llama.cpp, or any endpoint. Each provider has a
  model list: the first is used, the others are fallbacks when it hits a rate
  limit or is unavailable. API keys live only in the system keychain (and are
  removed when the address changes). Free models show a hint that prompts may
  be used for training. “Test connection” lists the endpoint's models.
- **Chat** (right panel → “Chat”): a simple chat with the chosen model,
  streamed, with stop button and earlier chats. It has no access to your
  files – attach the current file or selection with the paperclip (secret
  files such as `.env` are refused).
- **Autocompletion:** ghost-text suggestions while typing (`Tab` accepts),
  from a model of your choice – ideally a small local one. Uses
  fill-in-the-middle when the endpoint supports it, can be switched off per
  language, and toggled from the status bar or the command palette. Never
  sends secret files.
- **Docker panel** (`Mod+Shift+D`): containers (state, ports, start/stop/
  restart, live logs, remove with confirmation), images (size, remove) and the
  project's Dockerfiles with “Build” (live output). Click a published port to
  open `http://localhost:<port>` in the integrated browser. Filter “Only this project” shows Compose projects and containers
  with a mounted folder inside the project. The status bar counts running
  containers.

## Requirements

- Node.js ≥ 22.12 (see `.nvmrc`)
- pnpm 10 (`corepack enable` picks the version pinned in `package.json`)
- Git (for checkpoints)
- Docker (optional, for the agent sandbox): Docker Desktop on macOS/Windows,
  Docker Engine on Linux (your user in the `docker` group). Colima and Rancher
  Desktop work too. The sandbox image is built from a Debian-based Node image
  (`node:22-bookworm-slim` by default; a mirror can be set in Manage agents).
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

Tests against a real Docker daemon are opt-in:

```bash
KESTREL_DOCKER_TESTS=1 pnpm test                  # sandbox integration test
KESTREL_E2E_DOCKER=1 xvfb-run -a pnpm test:e2e    # agent in a real container
# optional: KESTREL_SANDBOX_BASE_IMAGE / KESTREL_E2E_SANDBOX_BASE_IMAGE=<mirror>,
#           KESTREL_SANDBOX_PACKAGES="" where apt cannot reach Debian
```

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
| `Mod+Shift+D`                    | Docker panel                  |
| `Mod+Shift+O`                    | New browser tab               |

Inside a terminal on Windows/Linux, `Ctrl+<letter>` goes to the shell (e.g. `Ctrl+C`,
`Ctrl+R`); use `Ctrl+Shift+P` for the palette there. Copy with `Ctrl+Shift+C`.

Shortcuts can be changed in `settings.json` in the app data folder:
`"keybindings": { "view.toggleSidebar": "Mod+Shift+B" }` (empty string disables one).

## Project structure

```
apps/desktop/          Electron app
  src/main/            Main process: windows, security, IPC, modules
    modules/           app, settings, workspace, search, terminal, permissions,
                       checkpoints, agent, review, docker, sandbox
  src/preload/         Minimal typed bridge (window.kestrel)
  src/renderer/        React UI
    layout/            App shell, title/activity/status bar, panels
    features/          commands, workspace, editor, search, terminal, agent,
                       permissions, checkpoints, review, sandbox
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
- Sandboxed agents get only their own configured variables (and proxy
  settings), never your environment. Note: like anything passed to Docker, these
  values are visible to users who can run `docker inspect`. Secret files created
  after the agent started are not covered until the next start.

## Note on trademarks

Kestrel is an independent project. It supports Claude Code via the Agent
Client Protocol but is not affiliated with or endorsed by Anthropic.

## License

[MIT](LICENSE)

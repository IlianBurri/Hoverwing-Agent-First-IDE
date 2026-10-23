# CLAUDE.md

Guidance for working on Kestrel. Read `SPEC.md` for the product spec and phases.

## Current phase

Phases 0 (foundation), 1 (layout, palette, workspace, Monaco, search, terminal)
and 2 (permissions, agents via ACP, checkpoints, diff review) are done. Next:
phase 3 (agent sandbox in a Docker container). Every phase: present a plan, wait for OK, implement in
small commits, keep lint/typecheck/tests green, update this file.

## Commands

```bash
pnpm install          # install (re-run if the Electron download fails)
pnpm dev              # run the app
pnpm lint             # eslint, must be clean (pre-commit hook enforces it)
pnpm typecheck        # tsc in all packages
pnpm test             # vitest unit tests
pnpm test:e2e         # build + playwright electron tests
xvfb-run -a pnpm test:e2e   # headless Linux / cloud containers
pnpm format           # prettier
```

Running as root (containers): Chromium needs `--no-sandbox`; the E2E launcher
adds it automatically and the app then skips `app.enableSandbox()`.
`node-pty` is compiled on Linux during install (needs build tools); it is listed
in `onlyBuiltDependencies` in `pnpm-workspace.yaml`.

## Architecture rules

- **Processes:** main = Node, files, processes, secrets. preload = only the typed
  bridge (`invoke` + `on`). renderer = UI only, no Node, no `fs`.
- **IPC channels:** one file per module in `packages/shared/src/ipc/channels/`,
  merged in `contract.ts`. Each channel has a zod `request` and `response` schema;
  main->renderer events have a payload schema. Shared domain schemas live in
  `packages/shared/src/schemas/`.
- **IPC handlers:** each main module exports `create<Module>Handlers(...)` typed as
  `ModuleHandlers<'module'>`; `src/main/index.ts` only composes them (the
  `IpcHandlers` type enforces that every channel has a handler). Requests are
  validated in `ipc/dispatch.ts`; handlers never see unvalidated input.
- **Errors:** handlers throw `UserError(code, message)` for things the user should
  see (codes in `IpcErrorCode`, translated in `errors.code.*`); Node fs errors
  (ENOENT, EEXIST, …) are mapped automatically. Everything else becomes a generic
  `internal` error; details are only logged in main. Never send paths or system
  details to the renderer in error messages.
- **Channel names:** `module:action` in camelCase, e.g. `workspace:readDir`. No
  generic channels like "run command". `terminal:write` is keyboard input for a
  shell the same window created (owner check in `TerminalManager`) – agents must
  never get access to it.
- **Workspace paths:** renderer and main exchange paths relative to the workspace
  root with `/` separators (`""` = root). Main resolves every path with
  `resolveInWorkspace` (rejects `..`, absolute paths, symlinks leaving the root).
  Only folders from the native dialog or the recent list can be opened.
- **Per-window state in main:** workspace, search and terminals are keyed by
  `webContents.id` and released when the window closes or reloads.
- **Modules:** `src/main/modules/<name>/index.ts` is the public interface. Do not
  import another module's internals. Keep Electron-free logic in plain functions
  or classes with injected dependencies so it is unit-testable without Electron.
- **Renderer:** `layout/` app shell, `components/` reusable UI, `features/<name>/`
  one folder per feature (view, actions, commands), `stores/` Zustand stores,
  `design/` tokens and themes, `i18n/` texts, `lib/` small helpers.
- **Permissions:** every risky agent action calls `PermissionService.check`
  (or `denies` for writes held for review). Policy is in
  `packages/shared/src/schemas/permissions.ts`: secret files are always denied,
  deny beats allow, otherwise ask. Rules and the audit log live in the app data
  folder (never in the project, so agents cannot edit them); "always allow"
  stores an exact-target project rule. Logged targets are passed through
  `lib/redact.ts`.
- **Agents (ACP):** `modules/agent`. `AgentRuntime` is the ACP _client_ (stable
  v1 of `@agentclientprotocol/sdk`): it answers `session/request_permission`,
  `fs/read_text_file`, `fs/write_text_file` (no `terminal/*`), translates
  `session/update` into Kestrel's own `AgentEvent`s (`translate.ts`) – the
  renderer never sees ACP. Transport is injected: `spawnTransport` (child
  process) or `inProcessTransport` (unit tests). Agent configs live in
  `agents.json`; a new command line must be confirmed in a native main-process
  dialog (fingerprint stored), so a compromised renderer cannot start arbitrary
  programs. Secret env values: `SecretStore` (safeStorage; memory-only without a
  keychain). Kestrel never handles Claude credentials.
- **Checkpoints:** `modules/checkpoints` uses a shadow git dir in app data with
  the project as work tree and an isolated git config; the project's own `.git`
  is never touched. Heavy folders and secret files are excluded. One checkpoint
  is created before every agent turn; restoring saves the current state first.
- **Diff review:** `modules/review`. With `reviewChanges`, ACP writes are held
  (disk unchanged, agent reads the held version); after each turn, files the
  agent changed itself are collected from the turn checkpoint ("applied").
  Resolving keeps selected hunks (`hunks.ts`, `diff` package) and refuses to
  overwrite files that changed meanwhile (`review_conflict`).
- **Commands:** every user action is a `Command` registered by its feature
  (`register<Feature>Commands`), with an i18n title, optional default keybinding(s)
  (`Mod+…`, overridable via `settings.keybindings`) and a `when` condition. One
  window-level listener runs them; in a terminal, `Ctrl+<letter>` goes to the shell.
- **Dialogs/toasts:** use `prompt`, `confirm`, `choose` (stores/dialogs) and
  `notify` (stores/toasts). Destructive actions always confirm, with the safe
  option focused.
- **Editor:** Monaco is lazy-loaded and bundled locally (no CDN). One editor
  instance, one model per open file (`features/editor/monaco/models.ts`). Disk is
  the source of truth: saves send `expectedMtimeMs`; a mismatch means "changed
  outside" and the user decides.
- **Security (non-negotiable):** do not weaken `hardenedWebPreferences`, the CSP
  in `security.ts`, `lockNavigation`, the permission handlers or the path guard
  without an explicit decision by the user. Secrets are never logged or sent to
  the renderer.

## Conventions

- TypeScript strict, no `any`, no unchecked casts except documented ones.
- Code, names and comments in English. UI text only via i18n (`de.json`,
  `en.json`, same keys; a unit test enforces it; keys are type-checked). Use
  `_one`/`_other` suffixes for plurals.
- Styling: CSS Modules + design tokens (`var(--space-4)`, `var(--accent)`). No raw
  colors or pixel values in components; add a token in `design/tokens.css` if
  needed. Status = color + icon + text.
- Accessibility: keyboard reachable, `:focus-visible` ring, ARIA roles/labels,
  WCAG AA contrast. Respect `prefers-reduced-motion` (tokens handle durations).
  Collapsed panels hide their content with `hidden` (state stays mounted).
- Tests: `*.test.ts(x)` next to the code (Vitest; add
  `// @vitest-environment jsdom` for DOM tests). E2E in `apps/desktop/e2e`:
  `launchApp()` uses a fresh user-data dir and English; `stubOpenDialog`,
  `stubTrash` and `stubMessageBox` replace native UI. Agent tests use the
  scripted ACP agent `e2e/fixtures/mock-agent.mjs` (configured with
  `configureMockAgent`); prompts like `hello`, `edit <path> <text>`,
  `direct <path> <text>`, `twohunks <path>`, `secret`, `run <cmd>`, `slow`
  trigger fixed behaviour. A failing test restarts the worker (and the app),
  so later tests in the file fail as follow-ups – fix the first failure first.
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
- Branding: never use "Claude"/"Anthropic" in product name or logo. A factual
  "supports Claude Code" is fine.

## Versions (checked 2026-10-22)

Electron 45, electron-vite 6 (Vite 8 / Rolldown: use `rolldownOptions`),
React 19.3, TypeScript 6.0 (not 7: typescript-eslint supports `<6.1`), zod 4,
Zustand 5, Vitest 5, Playwright 1.64, ESLint 10, react-resizable-panels 4
(numbers = px, strings = %), cmdk 1.1, @tanstack/react-virtual 3,
monaco-editor 0.57 (imports via `monaco-editor/<path>`, TS API under
`monaco.typescript`), @xterm/xterm 6, node-pty 1.1, @parcel/watcher 2.6,
@vscode/ripgrep 1.18 (binary via npm platform package, no download).

@agentclientprotocol/sdk 2.0.1 (stable v1 entry point; API: `client()`,
`onRequest`, `connect(stream)`, `ndJsonStream`; no request timeout option),
diff 9, react-markdown 10 + remark-gfm 4. Agent templates: Claude Code via
`npx -y @agentclientprotocol/claude-agent-acp@0.94.0`, Gemini CLI via
`npx -y @google/gemini-cli@0.65.0 --experimental-acp` (the `@zed-industries/*`
package names are deprecated). Checkpoints need system `git`.

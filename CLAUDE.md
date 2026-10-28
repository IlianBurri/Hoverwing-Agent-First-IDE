# CLAUDE.md

Guidance for working on Kestrel. Read `SPEC.md` for the product spec and phases.

## Current phase

Phases 0 (foundation), 1 (layout, palette, workspace, Monaco, search, terminal),
2 (permissions, agents via ACP, checkpoints, diff review), 3 (agent sandbox in
Docker), 4 (Docker panel), 5 (integrated browser + agent browser tools), 6
(MCP manager), 7 (model providers, simple chat, autocompletion), 8 (setup
assistant: hardware detection, model catalog, Ollama install) and 9 (project
trust, language servers, Git panel) are done, plus installers for
Windows/macOS/Linux with auto-update, and parallel agents (stage A: up to 4
agent tabs per window in the same folder; stage B, isolated copies, is open).
All phases of SPEC.md are done; new work follows the same flow: present a
plan, wait for OK, implement in small commits, keep lint/typecheck/tests
green, update this file.

Windows: unit and E2E tests run on Windows too (PowerShell is the default
shell, so terminal tests pick commands per platform; E2E uses 2 workers and a
60 s timeout there). Checkpoints use an empty config file instead of
`os.devNull` on Windows (`emptyGitConfig()`), which git rejects as `\\.\nul`.
Programs are looked up with `lib/which.ts` (`findProgram`, PATHEXT-aware).

## Packaging (installable app)

- `pnpm --filter @kestrel/desktop package:win|package:mac|package:linux` →
  `apps/desktop/release/` (`Kestrel-Setup-<version>.exe`, `.dmg`, `.AppImage`).
  NSIS is not one-click: folder choice, desktop + start-menu shortcut, app data
  kept on uninstall. Version = `apps/desktop/package.json` `version`.
- Release: push a tag `v<version>` → the Release workflow builds all three on
  their runners (Windows also runs `e2e/packaged.spec.ts` against
  `release/win-unpacked`) and attaches installers + `latest*.yml` to the GitHub
  release ("Run workflow" = artifacts only). macOS signing is used when the
  `MAC_CSC_*` / `APPLE_*` secrets exist.
- Windows signing (`docs/code-signing.md`): SignPath Foundation (free for
  OSS) once the variable `SIGNPATH_ORGANIZATION_ID` + secret
  `SIGNPATH_API_TOKEN` exist: sign `win-unpacked/Kestrel.exe` → NSIS via
  `--prepackaged` (leaves the exe untouched) → sign installer →
  `scripts/update-win-feed.mjs` recomputes sha512/size/blockmap in
  `latest.yml`. Artifact configs in `.signpath/`. Otherwise `WIN_CSC_*`.
  The README "Code signing policy" section and `PRIVACY.md` are SignPath
  requirements: update them when roles or network connections change.
- Auto-update: `modules/updates` wraps electron-updater (`autoDownload` and
  `autoInstallOnAppQuit` off: the user clicks in the status bar). Feed =
  `publish` in `electron-builder.yml` (GitHub). Only in the packaged app and
  while `settings.checkForUpdates`; macOS needs a signed build. A private repo
  makes the check fail quietly (logged).
- README screenshots (2880×1800 via CDP device emulation, also under xvfb): run `e2e/screenshots.spec.ts` with
  `KESTREL_SCREENSHOTS=1` (after `pnpm build`); it uses
  `e2e/fixtures/demo-agent.mjs` and a demo project and writes `docs/images/`.
- `dependencies` of the desktop app = only what main loads at runtime (the
  rest is bundled by Vite and lives in `devDependencies`, keeping the
  installer small). Platform packages of ripgrep/watcher are listed in
  `optionalDependencies`, otherwise electron-builder leaves them out and the
  app crashes on start. `npmRebuild: false` (N-API prebuilds, no toolchain).
- Binaries started from main must use `app.asar.unpacked` paths
  (`unpackedPath()` in `modules/search/search.ts`).
- Icon: `apps/desktop/build/icon.png`, rendered from the mark by
  `npx electron scripts/make-icon.mjs`.
- Open: SignPath application (until then SmartScreen warns "unknown
  publisher"); macOS notarization needs the paid Apple Developer Program
  (until then: _System Settings → Privacy & Security → Open Anyway_).

## Commands

```bash
pnpm install          # install (re-run if the Electron download fails)
pnpm dev              # run the app
pnpm lint             # eslint, must be clean (pre-commit hook enforces it)
pnpm typecheck        # tsc in all packages
pnpm test             # vitest unit tests
pnpm test:e2e         # build + playwright electron tests
xvfb-run -a pnpm test:e2e   # headless Linux / cloud containers
KESTREL_DOCKER_TESTS=1 pnpm test               # + sandbox integration test (Docker)
KESTREL_E2E_DOCKER=1 xvfb-run -a pnpm test:e2e # + agent in a real container
pnpm format           # prettier
```

Running as root (containers): Chromium needs `--no-sandbox`; the E2E launcher
adds it automatically and the app then skips `app.enableSandbox()`.
`node-pty` is compiled on Linux during install (needs build tools); it is listed
in `onlyBuiltDependencies` in `pnpm-workspace.yaml`.

Cloud containers: start Docker with `(dockerd > /tmp/dockerd.log 2>&1 &)`.
Docker Hub may rate-limit (429) and apt cannot reach Debian through the proxy,
so use `KESTREL_SANDBOX_BASE_IMAGE` / `KESTREL_E2E_SANDBOX_BASE_IMAGE` =
`mirror.gcr.io/library/node:22-bookworm-slim` and `KESTREL_SANDBOX_PACKAGES=""`.

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
  Parallel agents: `AgentService` keeps up to `MAX_AGENT_SLOTS` (4) runtimes
  per window, keyed by a renderer-chosen `slotId` (every agent channel and
  event carries it; `agent:slots` lists them, `agent:close` forgets one). The
  renderer shows one tab per slot (`AgentTabs`). Session ids of different
  agents may collide, so permission questions (`slotId` in the request,
  `cancel(ownerId, slotId)`) and review locks (`ChangeAuthor.key` =
  `<ownerId>:<slotId>`) are keyed by slot. All agents share the project folder
  (no isolated copies yet).
- **Checkpoints:** `modules/checkpoints` uses a shadow git dir in app data with
  the project as work tree and an isolated git config; the project's own `.git`
  is never touched. Heavy folders and secret files are excluded. One checkpoint
  is created before every agent turn; restoring saves the current state first.
- **Diff review:** `modules/review`. With `reviewChanges`, ACP writes are held
  (disk unchanged, agent reads the held version); after each turn, files the
  agent changed itself are collected from the turn checkpoint ("applied").
  Resolving keeps selected hunks (`hunks.ts`, `diff` package) and refuses to
  overwrite files that changed meanwhile (`review_conflict`). A held change
  locks its file for other agents (`lockedBy`; their write fails with a
  message to the agent, `agent_conflict`), and each change lists the agents
  that made it. Changes collected from a turn checkpoint can include files a
  parallel agent wrote directly in the same period. Restoring a checkpoint
  while agents work asks first and stops them.
- **Sandbox:** `modules/docker` wraps dockerode behind the small `DockerApi`
  interface (no Docker CLI needed; socket auto-detection incl. Docker Desktop,
  Colima, Rancher). `modules/sandbox`: `plan.ts` (pure) builds the
  `ContainerSpec` – project bind-mounted at the same path (`/workspace` on
  Windows; runtime keeps `agentRoot` vs. host `root`), secret files covered by
  an empty read-only file, secret dirs by a tmpfs (`scan.ts`), home = volume
  `kestrel-home-<agentId>`, npm cache volume, read-only rootfs, `CapDrop ALL`,
  `no-new-privileges`, limits, host uid:gid on Linux, AutoRemove, labels
  `dev.kestrel.sandbox*` (orphans of this user-data dir are removed on start).
  Containers get only the agent's own env plus proxy variables. The image
  (`kestrel-sandbox:<hash>`) is built from an inline Dockerfile on first use;
  output goes to `sandbox:log`. A sandboxed agent never falls back to running
  directly; the approval fingerprint includes `sandbox.enabled`.
- **Docker panel:** `DockerPanelService` (`modules/docker/panel.ts`) on the same
  `DockerApi`: overview (containers marked `inProject` via compose working dir
  or bind mount, `sandbox` via label), start/stop/restart/remove, Docker event
  stream -> debounced `docker:changed`, log streams and builds per window
  (`docker:output` / `docker:streamEnded`, released with the window; closing a
  build aborts it). Builds only from Dockerfiles inside the project (path
  guard + Dockerfile name), context = the Dockerfile's folder, `.dockerignore`
  honoured. Docker's error text goes to Logs › Docker (`sandbox:log`), the UI
  gets `docker_conflict` / `docker_failed`. Agents have no access to it. Use
  `fakeDockerApi()` (`modules/docker/testing.ts`) in unit tests.
- **Browser:** `modules/browser`. `BrowserManager` keeps one `WebContentsView`
  per browser tab inside its window (renderer sends bounds via
  `browser:setBounds`; `null` hides it). The view is native and sits above the
  HTML, so every overlay (Modal, ContextMenu, dialogs, palette) calls
  `useOverlay()` (`stores/overlays.ts`) and the page hides while any is open.
  Session `persist:kestrel-browser`: no preload, sandbox, all permission
  requests denied, navigation/redirects limited to http(s)
  (`isAllowedBrowserUrl`), popups become `browser:openTab`. `PageCollector`
  gathers console + network errors via `webContents.debugger` (CDP). Browser
  web contents are skipped by the per-window release in `index.ts`.
- **Agent tools (MCP host):** `modules/mcpHost`. `McpHost` serves Kestrel's MCP
  server "kestrel" (`@modelcontextprotocol/sdk`, streamable HTTP, stateless
  JSON mode, a new `McpServer` per request) on 127.0.0.1 with a per-session
  bearer token; `AgentRuntime` passes it in `session/new` (`deps.mcp`), as
  `http` if the agent supports it, else via the stdio bridge script
  (`bridge.ts`, written to userData/mcp; run with Electron as Node, or in the
  container from `/opt/kestrel/…`). Sandboxed agents use
  `host.docker.internal` (`extraHosts` host-gateway; on Linux McpHost also
  listens on the Docker bridge gateway). Tools (`tools.ts`) check
  `browser` (read, target = origin) or `browser.control` (open) and wrap web
  content with `untrusted()`. The SDK's transport types need a documented
  `as unknown as Transport` cast (exactOptionalPropertyTypes).
- **MCP manager:** `modules/mcp`. `McpConfigStore` (userData/mcp: servers.json,
  projects/<key>.json, approved.json) – never in the project. New stdio command
  lines need the native confirm (`serverFingerprint`), checked again before
  connecting. Secrets (env/headers) in `SecretStore` under
  `mcp:<scope-key>/<id>:<name>`. `McpService` connects via `connectMcp` (SDK
  Client; stdio or streamable HTTP; errors mapped to plain words, stderr to
  `mcp:log`), pools connections, and builds proxied `ToolDefinition`s for
  `McpHost` (`<id>__<tool>`, only enabled servers/tools; local servers only for
  sandboxed agents with `sandboxAccess`). Each call: `check('mcp.tool',
'<id>/<tool>')`; tool levels are plain permission rules (allow/deny, "ask" =
  no rule). Results wrapped with `externalData()`. Import parses `.mcp.json`
  (`importFile.ts`, nothing executed). The browser loads pages only after CDP
  recording is enabled (`tab.ready`, max 1 s) so first requests are captured.
- **Model providers:** `modules/providers`. All model traffic runs in main
  (the renderer's CSP stays `connect-src 'self'`). `ProviderConfigStore`
  (userData/providers.json); API keys in `SecretStore` under `provider:<id>`,
  removed when the provider's `baseUrl` changes (a key never goes to another
  address). `ModelClient` (injectable; `openAiClient` wraps the `openai` SDK
  with explicit `organization/project/adminAPIKey/webhookSecret: null` and
  `maxRetries: 0`, so no `OPENAI_*` env variable leaks in). `withFallback`
  tries the provider's other models on rate limit / missing model / 5xx;
  `classifyModelError` turns errors into `ModelErrorKind`s (no provider text
  reaches the UI). Use `fakeModelClient()` / `httpError()`
  (`providers/testing.ts`) in unit tests.
- **Chat:** `modules/chat`. No tools, no file access: the model sees only the
  conversation and files the user attached (`<attached-file>` blocks, marked
  as data; secret paths refused in main and renderer). For Ollama providers
  (`template: 'ollama'`) the system prompt names the answering model as an
  open-source model running locally via Ollama (`localModelIdentity`), so
  small models stop claiming to be a Microsoft/OpenAI assistant. One stream per window
  (`chat:event`), chats in userData/chats. The renderer picks the id of a new
  chat so events can never arrive before it knows it. Settings
  `chatModel` = provider + model.
- **Completion:** `modules/completion` + `features/editor/monaco/inlineCompletion.ts`
  (Monaco inline completions, 250 ms debounce, cancel → `completion:cancel`).
  Main runs only the newest request per window, 10 s timeout; FIM via
  `/completions` with `suffix`, `fim: 'auto'` falls back to a chat prompt
  and remembers endpoints without FIM. Never for secret files or
  `disabledLanguages`. Features needing editor content without importing
  Monaco use `features/editor/snapshot.ts`.
- **Setup assistant:** `modules/setup` + `features/setup`. Hardware via
  `systeminformation` behind the `SystemInfo` interface (detected once per
  start, ~6 s on Windows); backend guess in `detectBackend`. Model catalog =
  JSON (`catalog.default.json`, newer downloaded version in userData wins);
  `recommendModels`/`rateSpeed` are pure (shared). Ollama via its own API
  (`ollamaApi`, URL from `KESTREL_OLLAMA_URL` for tests). Installer: latest
  official GitHub release, SHA-256 from the asset `digest`, only
  allowlisted hosts (`DOWNLOAD_HOSTS`), deleted on mismatch, started only
  after a native confirm; no automatic install on Linux. The assistant opens
  while `settings.setupDone` is false; E2E `createUserDataDir()` writes
  `setupDone: true` unless `{ firstStart: true }`.
- **Project trust:** `modules/trust` (`TrustStore`, userData/trust.json, real
  paths). Granting = native confirm in main (`trust:grant`); `trust:changed`
  goes to the project's windows. Untrusted = restricted mode (status bar badge):
  no language servers, Git read-only. Anything that can run project code
  (tsserver plugins, git hooks/filters) must check trust.
- **Language servers:** `modules/lsp`. `LspConfigStore` (userData/lsp/
  servers.json: overrides of `BUILTIN_SERVERS` + custom servers, approved
  command-line fingerprints). `LspService` keeps one server per window and
  config, started lazily on `lsp:open` (trusted + native confirm + program
  found, else state `declined`/`missing`), restarts crashes (max 3), stops on
  trust revoke. `LspClient` (vscode-jsonrpc over stdio) declares
  `CLIENT_CAPABILITIES` (publishDiagnostics is needed or tsserver sends none)
  and refuses `workspace/applyEdit`. Documents are the editor models, synced as
  full text (`features/editor/monaco/lsp.ts`: debounced, flushed before each
  request, Monaco cancel -> `lsp:cancel`); secret files are never opened.
  `convert.ts` maps LSP results; targets outside the project are dropped.
  While tsserver is ready, Monaco's own TS features are switched off
  (`setModeConfiguration`). Diagnostics -> markers, Problems tab, status bar;
  agents get them via the MCP tool `get_diagnostics` (`file.read`).
- **Git panel:** `modules/git` (system git via `runGitProcess`; non-zero exit
  is a result, only ENOENT rejects). `GitService` serializes commands per
  repo, parses `status --porcelain=v2 -z` (`status.ts`), works for projects
  inside a bigger repo (`--show-prefix`). Untrusted reads add
  `core.fsmonitor=false` and empty all `filter.<driver>.*` (a test proves no
  filter runs); writes throw `not_trusted`. Paths go via
  `--pathspec-from-file=- --pathspec-file-nul` with `--literal-pathspecs`;
  untracked files are discarded to the trash. English messages
  (`LC_MESSAGES=C`) so `classifyGitError` can map them; raw output goes to
  Logs › Git (`redact` hides URL credentials). Watches HEAD/index/refs plus
  workspace changes -> debounced `git:changed`. Agents have no access.
- **Commands:** every user action is a `Command` registered by its feature
  (`register<Feature>Commands`), with an i18n title, optional default keybinding(s)
  (`Mod+…`, overridable via `settings.keybindings`) and a `when` condition. One
  window-level listener runs them; in a terminal, `Ctrl+<letter>` goes to the shell.
- **Toolbar:** `features/toolbar`. `settings.toolbar` = command ids shown as
  buttons in the title bar (default `git.pull`, `git.push`, max 30); any
  registered command can be added (dialog `toolbar.customize`, context menu).
  Unknown ids are skipped; unavailable commands are disabled. `when` is not
  reactive, so `Toolbar` subscribes to the stores most conditions read.
- **Workbench layout:** `settings.workbench` (`schemas/workbench.ts`): sides of
  sidebar/agent panel (sidebar outermost, `mainPanelOrder`), open panels,
  order/hidden entries of activity bar (follows the sidebar's side), bottom
  tabs (min. 1 visible) and status bar. Panels are keyed and re-ordered, not
  rebuilt, so terminals/editors survive a side change (E2E proves it). Open
  state is applied one frame after mount/re-order (`applyPanelState`) and
  saved debounced. Profiles: shipped `builtinProfiles` (only "Standard"
  resets everything; the others change open panels/views) plus up to 20
  saved ones in `settings.layoutProfiles`, each a `layout.profile.<id>`
  command. The restricted-mode badge can never be hidden. Stage 3 (a model
  proposing layouts) should produce exactly this schema.
- **Layout with AI:** `modules/layoutAssistant` (`layout:propose`). The chat
  model gets the layout schema in words (`prompt.ts`), the current layout and
  the renderer's command list (id + title) – no files. Answers are untrusted:
  `extractJson` → `layoutProposalSchema` (partial) → `mergeProposal` (unknown
  command ids dropped, one bottom tab stays) → full schemas; one correction
  round, then `layout_invalid` (not a provider fallback). JSON mode via
  `json: true` (`response_format`). The renderer shows `describeChanges` in
  words; nothing changes before "Apply"; "Undo" restores the previous state
  (`features/layout/ai.ts`). E2E: `fake-openai.ts` answers the layout prompt.
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
  `direct <path> <text>`, `twohunks <path>`, `secret`, `run <cmd>`, `slow`,
  `peek <path>`, `whoami`, `mcp <tool> [arg]` (calls Kestrel's MCP server;
  `MOCK_MCP_STDIO=1` uses the stdio bridge; a JSON argument is passed as tool
  arguments) trigger fixed behaviour. `e2e/fixtures/test-mcp-server.mjs` is a
  test MCP server (stdio, or `--http` with a bearer token) with `echo`,
  `injection`, `fail`, `whoami`. Setup tests use `startFakeOllama()`
  (`e2e/fake-ollama.ts`). Model tests use `startFakeOpenAi()`
  (`e2e/fake-openai.ts`: `busy-model` always 429, streamed `Echo: …` chat,
  `slow` for stopping, FIM answers `42`). Language server tests use
  `e2e/fixtures/fake-lsp.mjs` (ERROR/WARN lines -> diagnostics, completion
  `fakeCompletion`, hover, definition incl. one outside the project, `CRASH`
  exits); E2E writes `lsp/servers.json` and `trust.json` into the user-data dir.
  Git E2E uses a real repo plus a local bare remote. Browser
  tests use `startTestSite()` (`e2e/browser-helpers.ts`). Sandbox E2E bundles the mock
  agent into the project (`bundleMockAgent`, via Vite) because the container
  only sees the project. A failing test restarts the worker (and the app),
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
diff 9, react-markdown 10 + remark-gfm 4, dockerode 5.0.1 (+ @types/dockerode
4.0.2; `buildImage` takes `{ context, src }`, build errors arrive as JSON lines,
`docker.modem.demuxStream` splits stdout/stderr), @modelcontextprotocol/sdk
1.32.1 (imports via `@modelcontextprotocol/sdk/server/mcp.js` etc.). Agent templates: Claude Code via
`npx -y @agentclientprotocol/claude-agent-acp@0.94.0`, Gemini CLI via
`npx -y @google/gemini-cli@0.65.0 --experimental-acp` (the `@zed-industries/*`
package names are deprecated). Checkpoints need system `git`.

systeminformation 5.33.16, electron-builder 26.15, electron-updater 6.8.10
(checked 2026-10-26; 6.8.11+ were days old, so not taken yet).
Ollama release v0.40.11 assets carry `digest: sha256:…` in the GitHub API.

vscode-jsonrpc 9.0.3 + vscode-languageserver-protocol 3.18.4 (types only;
checked 2026-10-27, 10.0.0/3.18.5 were days old). TypeScript template:
`npx -y -p typescript-language-server@6.0.2 -p typescript@6.0.3
typescript-language-server --stdio`. Git ≥ 2.31 (`--path-format`,
`--pathspec-from-file`).

openai 7.43.0 (checked 2026-10-26; Node ≥ 22; reads `OPENAI_*` env defaults
unless options are passed explicitly; `max_tokens` is marked deprecated but
kept on purpose for Ollama/llama.cpp compatibility).

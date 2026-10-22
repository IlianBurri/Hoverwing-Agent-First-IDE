# CLAUDE.md

Guidance for working on Kestrel. Read `SPEC.md` for the product spec and phases.

## Current phase

Phase 0 (foundation) is done. Next: phase 1 (layout, command palette, workspace,
Monaco, terminal). Every phase: present a plan, wait for OK, implement in small
commits, keep lint/typecheck/tests green, update this file.

## Commands

```bash
pnpm install          # install (re-run if the Electron download fails)
pnpm dev              # run the app
pnpm lint             # eslint, must be clean
pnpm typecheck        # tsc in all packages
pnpm test             # vitest unit tests
pnpm test:e2e         # build + playwright electron tests
xvfb-run -a pnpm test:e2e   # headless Linux / cloud containers
pnpm format           # prettier
```

Running as root (containers): Chromium needs `--no-sandbox`; the E2E launcher
adds it automatically and the app then skips `app.enableSandbox()`.

## Architecture rules

- **Processes:** main = Node, files, processes, secrets. preload = only the typed
  bridge. renderer = UI only, no Node, no `fs`.
- **IPC:** every channel lives in `packages/shared/src/ipc/contract.ts` with a zod
  `request` and `response` schema. Main registers one handler per channel in
  `src/main/index.ts` (the `IpcHandlers` type enforces completeness). Requests are
  validated in `src/main/ipc/dispatch.ts`; handlers never see unvalidated input.
  Results are `IpcResult<T>` (`{ ok, data } | { ok: false, error }`), never thrown.
  No generic channels like "run command".
- **Channel names:** `module:action` in camelCase, e.g. `workspace:readDir`.
- **Modules:** `src/main/modules/<name>/index.ts` is the public interface. Do not
  import another module's internals. Keep Electron-free logic in plain functions
  so it is unit-testable without Electron.
- **Renderer:** `components/` reusable UI, `features/<name>/` one folder per
  feature, `stores/` Zustand stores, `design/` tokens and themes, `i18n/` texts.
- **Security (non-negotiable):** do not weaken `hardenedWebPreferences`, the CSP
  in `security.ts`, or `lockNavigation` without an explicit decision by the user.
  Secrets are never logged or sent to the renderer; IPC errors return generic
  messages.

## Conventions

- TypeScript strict, no `any`, no unchecked casts except documented ones.
- Code, names and comments in English. UI text only via i18n (`de.json`,
  `en.json`, same keys; a unit test enforces it).
- Styling: CSS Modules + design tokens (`var(--space-4)`, `var(--accent)`). No raw
  colors or pixel values in components. Status = color + icon + text.
- Accessibility: keyboard reachable, `:focus-visible` ring, ARIA roles/labels,
  WCAG AA contrast. Respect `prefers-reduced-motion` (tokens handle durations).
- Tests: `*.test.ts(x)` next to the code (Vitest; add
  `// @vitest-environment jsdom` for DOM tests). E2E in `apps/desktop/e2e`.
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
- Branding: never use "Claude"/"Anthropic" in product name or logo. A factual
  "supports Claude Code" is fine.

## Versions (checked 2026-10-22)

Electron 45, electron-vite 6 (Vite 8 / Rolldown: use `rolldownOptions`),
React 19.3, TypeScript 6.0 (not 7: typescript-eslint supports `<6.1`), zod 4,
Zustand 5, Vitest 5, Playwright 1.64, ESLint 10.

Renamed packages to use later: ACP SDK = `@agentclientprotocol/sdk`, Claude Code
adapter = `@agentclientprotocol/claude-agent-acp` (the `@zed-industries/*`
names are deprecated).

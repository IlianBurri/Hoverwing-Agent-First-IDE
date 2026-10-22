# Kestrel

Kestrel is an agent-first desktop IDE. It does not ship its own AI. You bring your
own agent (e.g. Claude Code via the Agent Client Protocol), your own API key or a
local model, and Kestrel makes working with it visible, safe and easy to undo.

> Status: **phase 0** (project foundation). The window shows a design token
> showcase; the actual IDE layout follows in phase 1. See [`SPEC.md`](SPEC.md)
> for the full specification and roadmap.

## Requirements

- Node.js ≥ 22.12 (see `.nvmrc`)
- pnpm 10 (`corepack enable` picks the version pinned in `package.json`)
- Linux only, for E2E tests in a headless environment: `xvfb-run`

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

## Project structure

```
apps/desktop/          Electron app
  src/main/            Main process: windows, security, IPC, modules
  src/preload/         Minimal typed bridge (window.kestrel)
  src/renderer/        React UI: design tokens, components, features, i18n
  e2e/                 Playwright tests against the built app
packages/shared/       Code shared by all processes (IPC contract)
```

## Security model (short)

- The renderer is sandboxed, context-isolated and has no Node.js access.
- It talks to the main process through one typed `invoke` function. Every
  channel is declared in `packages/shared/src/ipc/contract.ts` and every
  request is validated with zod in the main process.
- A strict Content-Security-Policy is applied; navigation and new windows are
  blocked.

## Note on trademarks

Kestrel is an independent project. It supports Claude Code via the Agent
Client Protocol but is not affiliated with or endorsed by Anthropic.

## License

[MIT](LICENSE)

# Contributing to Kestrel

Thanks for helping! Kestrel is a young project, so every bug report, idea and
small fix makes a real difference.

## Ways to help

- **Try it and tell us what happened.** Install a [release](https://github.com/IlianBurri/Kestrel-Agen-Harness-IDE/releases),
  open a real project, start your agent and work with it for a while. Then
  open a [first-impressions issue](https://github.com/IlianBurri/Kestrel-Agen-Harness-IDE/issues/new?template=feedback.yml).
  "I did not understand X" is as valuable as a crash report.
- **Report bugs** with the [bug template](https://github.com/IlianBurri/Kestrel-Agen-Harness-IDE/issues/new?template=bug.yml).
  _Logs_ in the bottom panel (Agent, Git, MCP, Docker …) usually show what went
  wrong; please remove anything private before pasting.
- **Fix something small.** Issues labelled
  [`good first issue`](https://github.com/IlianBurri/Kestrel-Agen-Harness-IDE/labels/good%20first%20issue)
  are scoped and explained. Comment on the issue before you start, so nobody
  works on the same thing twice.
- **Translate.** UI texts live in `apps/desktop/src/renderer/i18n/locales/`
  (English and German today). A new language is a new JSON file with the same
  keys.

Security problems: please do not open a public issue; use
[GitHub's private vulnerability reporting](https://github.com/IlianBurri/Kestrel-Agen-Harness-IDE/security/advisories/new).

## Set up

You need Node.js ≥ 22.12, pnpm 10 (`corepack enable`) and Git. On Linux,
`node-pty` is compiled during install (`build-essential`, `python3`).

```bash
pnpm install
pnpm dev
```

Before you open a pull request:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e   # on headless Linux: xvfb-run -a pnpm test:e2e
```

## How the code is organized

- `apps/desktop/src/main/` – Electron main process: files, processes, agents,
  git, secrets. One folder per module in `modules/`.
- `apps/desktop/src/renderer/` – the React UI (no Node, no file access).
- `packages/shared/` – the typed IPC contract (zod schemas) used by both.

[`CLAUDE.md`](CLAUDE.md) describes the architecture rules in detail: how IPC
channels are defined, how permissions work and what must never be weakened.
Read the part about the module you touch.

## Pull requests

- Small and focused: one fix or feature per pull request.
- Tests next to the code (`*.test.ts`) and, for UI changes, an E2E test in
  `apps/desktop/e2e/`.
- UI texts only through i18n, in English **and** German (a test checks that
  both have the same keys). If you do not speak German, add the English text
  in both files and say so – we will translate it.
- Styling with CSS Modules and the design tokens, no raw colors or pixel values.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

By contributing you agree that your work is published under the
[MIT license](LICENSE).

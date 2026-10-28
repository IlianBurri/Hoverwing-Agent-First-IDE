# Code signing

| System  | How                                                       | Cost            |
| ------- | --------------------------------------------------------- | --------------- |
| Windows | [SignPath Foundation](https://signpath.org) (open source) | free (declined) |
| macOS   | Apple Developer Program (Developer ID + notarization)     | 99 USD per year |
| Linux   | not needed (AppImage)                                     | –               |

Without macOS signing, the app is ad-hoc signed only: Gatekeeper blocks the
first start (_System Settings → Privacy & Security → Open Anyway_) and
auto-update does not work there.

## Windows with the SignPath Foundation

**Status (2026-10-28):** the application was declined for now. The Foundation
wants visible public adoption first (stars, forks, contributors, outside
articles or discussions); reapplying later is welcome. Until then the Windows
builds are unsigned; the workflow below stays ready. Paid alternatives: a
SignPath subscription, an open-source code signing certificate (e.g. Certum,
via `WIN_CSC_*`), or Azure Trusted Signing.

The certificate belongs to the SignPath Foundation, so Windows shows
"SignPath Foundation" as the publisher. SmartScreen can still warn for the
first releases until the certificate has gained reputation.

### 1. Before applying

- Turn on two-factor authentication for every GitHub account with write
  access (SignPath requires MFA for the repository and for SignPath).
- The README has the **Code signing policy** section (roles, privacy) and
  [PRIVACY.md](../PRIVACY.md); the release notes link to both. Keep the roles
  up to date when people join.
- Conditions: <https://signpath.org/terms>.

### 2. Apply

Form: <https://signpath.org/apply>. Repository
`https://github.com/IlianBurri/hoverwing`, license MIT, build
system GitHub Actions (`.github/workflows/release.yml`), artifacts: the NSIS
installer and the app executable.

### 3. After approval: set up the SignPath project

1. In SignPath, open the project (slug `kestrel`, or set the repository
   variable `SIGNPATH_PROJECT_SLUG`) and link the GitHub repository as
   trusted build system.
2. Add two artifact configurations with the slugs `app` and `installer` and
   paste the XML from [`.signpath/artifact-configurations/`](../.signpath/artifact-configurations).
3. Signing policies: `test-signing` (manual "Run workflow") and
   `release-signing` (tags, approved by hand).
4. Create a CI user / API token with submitter rights for both policies.

### 4. Configure GitHub

_Settings → Secrets and variables → Actions:_

| Kind     | Name                       | Value                       |
| -------- | -------------------------- | --------------------------- |
| Secret   | `SIGNPATH_API_TOKEN`       | the API token               |
| Variable | `SIGNPATH_ORGANIZATION_ID` | the organization ID         |
| Variable | `SIGNPATH_PROJECT_SLUG`    | only if it is not `kestrel` |

As soon as `SIGNPATH_ORGANIZATION_ID` exists, the Windows job of the Release
workflow:

1. builds `release/win-unpacked` and has `Hoverwing.exe` signed,
2. builds the installer around the signed app (`--prepackaged`, the exe stays
   untouched),
3. has the installer signed,
4. recomputes SHA-512, size and blockmap in `latest.yml`
   (`apps/desktop/scripts/update-win-feed.mjs`) – otherwise installed apps
   would reject the update,
5. fails if a signature is not valid, then runs the smoke test.

### 5. First test

Run the Release workflow by hand ("Run workflow", uses `test-signing`) and
check the "Check the signatures" step. If SignPath rejects the product
version, compare it with the file properties of the exe (the app reports
four parts, e.g. `0.8.1.0`, the installer three) and adjust the XML.

Not signed: the uninstaller inside the installer (it is created during the
NSIS build, which SignPath cannot hook into) and upstream binaries.

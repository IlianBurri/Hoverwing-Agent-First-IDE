# GitHub sign-in: registering the OAuth App

Kestrel signs in to GitHub with the OAuth **device flow**: the app shows a
code, the user enters it on github.com, and Kestrel receives a token. The
device flow needs only a **client id**, which is public by design – there is
no client secret in the app.

Until a client id is built in, the GitHub dialog says "not set up in this
build" and nothing contacts GitHub.

## One-time setup (maintainer)

1. On GitHub: _Settings → Developer settings → OAuth Apps → New OAuth App_
   (or under an organization: _Organization settings → Developer settings_).
2. Fill in:
   - **Application name:** `Kestrel`
   - **Homepage URL:** the project site (e.g. `https://ilianburri.github.io/Kestrel-Agen-Harness-IDE/`)
   - **Authorization callback URL:** the same URL (required by the form, not
     used by the device flow)
3. Tick **Enable Device Flow** and click _Register application_.
4. Copy the **Client ID** (starts with `Ov23…` or `Iv1.…`) into
   `GITHUB_CLIENT_ID` in `apps/desktop/src/main/modules/github/endpoints.ts`
   and commit it. Do **not** generate a client secret; it is not needed.

Optional: upload the Kestrel icon as the app logo, so users recognize it on
GitHub's authorization page.

## What the app asks for

Scopes `repo` (clone, pull and push private repositories) and `read:user`
(account name). `repo` is broad; GitHub's OAuth Apps have no narrower scope
that allows pushing to private repositories. A GitHub App with per-repository
permissions would be narrower but needs more setup for users.

## How the token is used

- Stored in the system keychain (`SecretStore`, key `github:token`), never sent
  to the renderer, logged or written into a project.
- API calls: `api.github.com/user` and `/user/repos`.
- git: for clone, fetch, pull and push, Kestrel passes a credential helper for
  `https://github.com` through `GIT_CONFIG_*` environment variables plus a
  one-off key; the helper asks Kestrel's main process over `127.0.0.1` and
  gets the token only for that host and only while the git command runs.
- Sign-out deletes the token. Users can revoke it on GitHub under
  _Settings → Applications → Authorized OAuth Apps_.

## Tests

`KESTREL_GITHUB_CLIENT_ID`, `KESTREL_GITHUB_URL` and `KESTREL_GITHUB_API_URL`
point the app at `e2e/fake-github.ts`.

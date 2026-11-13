# Security

## Scope

Lunar Mission Navigator is a static, client-only Next.js export for the NASA Space Apps
Challenge 2026. It has no backend, accounts, database, cookies, analytics, or runtime
network requests. All computation happens in the browser, and the deployed artifact is
the `out/` directory.

The illumination and visibility numbers are geometric estimates. They are not a
landing-safety, power, or link-budget analysis; see `backend/METHOD.md` and the in-app
"Limits" panel.

## Secrets

No credentials are committed. Development SSH keys live outside this repository, in
`.ssh/` at the workspace root rather than in `repo/`. The hosting project id in
`.openai/hosting.json` is an identifier, not a secret; deploy credentials are held by
the hosting account and are never written to the repository.

## Reporting

For non-sensitive reports, open an issue:
https://github.com/truffleloaf/NASA/issues

For anything sensitive, contact the repository owner through GitHub instead of posting
details publicly.

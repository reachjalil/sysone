# sysone public client

This repository is the MIT-licensed integration layer only. Keep engine runtime,
provider credentials, administration, storage, studio and application source in the
separate private project. Never copy that repository wholesale into this one.

Preserve bounded requests, redirect rejection, consumer scope and honest uncertainty.
Do not add automatic retries or a provider key to the client. The explicitly opted-in
`sysone computer` companion may act only inside its dedicated browser session. Keep
its actions separate from the ordinary advice-only MCP/API client. Preserve observed
node IDs, isolated observation state, freshness checks, explicit caller actions and
cleanup of only its own temporary profile. Opt-in `--desktop` adds read-only macOS AX observation of an explicitly named app.
Keep native permission checks non-prompting; do not capture unrelated apps, post
input events or expose native IDs as browser action targets. Jev never receives raw pixels or executes
model-generated selectors, coordinates, scripts or text.
Public contract changes must remain compatible with the private engine.
Run pnpm test and inspect npm pack --dry-run before publishing. Do not contact other tasks.

Cloud CLI login uses the existing engine-resource OAuth authorization with S256 PKCE, state and issuer verification, a temporary loopback callback and private atomic credential storage. Preserve explicit consent, scope/expiry checks, rotation/revocation, target precedence and no inference retries. Credentials must never enter stdout/MCP output or the repository.

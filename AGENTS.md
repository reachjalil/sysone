# sysone public client

This repository is the MIT-licensed integration layer only. Keep engine runtime,
provider credentials, administration, storage, studio and application source in the
separate private project. Never copy that repository wholesale into this one.

Preserve bounded requests, redirect rejection, consumer scope and honest uncertainty.
Do not add automatic retries, action execution or a provider key to the client.
Public contract changes must remain compatible with the private engine.
Run pnpm test and inspect npm pack --dry-run before publishing. Do not contact other tasks.

# sysone

The open-source integration package for [System One Engine](https://systemoneengine.com):
a small HTTP client, a local MCP bridge and an agent skill for bounded evaluations.

The System One Engine application and studio are **private-source software**, maintained
separately. This repository contains the public integration layer. It does not contain
the engine, provider implementation, studio, usage database or administrator routes.
It does not install or launch an engine. Obtain access to a running engine and a scoped
consumer credential from its owner before making requests.

## Install

```sh
npm install sysone
```

Node 22.18+ is required. Your provider key stays with the engine; this client needs
only its URL and a scoped consumer token.

```js
import { createClient } from 'sysone/client';

const engine = createClient({
  url: process.env.SYSONE_URL,
  token: process.env.SYSONE_TOKEN,
});
console.log(await engine.capabilities());
const result = await engine.run('decide', {
  state: 'The support agent issued a full refund.',
  questions: { refunded: { type: 'boolean', instructions: 'Was a refund issued?' } },
});
```

Use a loopback HTTP origin for local engines or HTTPS for hosted engines. Redirects
are rejected so credentials cannot follow an unexpected destination. Requests have
bounded time and response size. The caller controls cancellation and retries.

## CLI and MCP

```sh
# With SYSONE_URL and SYSONE_TOKEN already set in your environment:
npx sysone status
npx sysone mcp

# Or use a private JSON file containing {"url":"...","token":"..."}:
npx sysone mcp --connection /private/path/agent.json
```

A client can launch the stdio MCP bridge with command `npx` and arguments
`["-y", "sysone", "mcp", "--connection", "/private/path/agent.json"]`.
The bridge exposes `sysone_status`, `sysone_decide`, `sysone_logs`, `sysone_tree` and
`sysone_dialogue`. Each request uses the credential's services and remaining limits.

If no explicit connection or environment pair is supplied, the CLI reads
`~/.config/systemoneengine/agent.json`. It never reads a provider credential or
administrator token. Avoid putting tokens directly in command-line arguments.

The engine also exposes Streamable HTTP MCP at `/mcp`; clients that support it can
connect directly with their supported bearer/OAuth setup. This stdio bridge does
not run an OAuth login flow. Hosted web clients cannot directly reach loopback.

## Agent skill

The reusable [`sysone` skill](skills/sysone/SKILL.md) explains when to offload bounded
classification, log triage, taxonomy selection and dialogue timing. Copy that skill
folder into your harness's supported skills directory and configure the MCP bridge.

Keep planning, synthesis and ambiguous judgments with the reasoning model. Selected
IDs are proposals, not action authority. Preserve unknown confidence and measure the
full workflow before claiming cost or latency savings. An extra model call can cost
more than a direct deterministic check.

## Services

| Service | Purpose |
| --- | --- |
| `decide` | Boolean probabilities, finite choices and rubric scores |
| `logs` | Confidence-aware log triage; retain original logs |
| `tree` | Bounded taxonomy selection with escalation |
| `dialogue` | Recommend eligible prerecorded cues, silence or fallback |

Public input schemas are exported from `sysone`. Examples are in `examples/`.
Jev and provider calls happen in the engine, not this client.

## Development

```sh
pnpm install --frozen-lockfile
pnpm test
```

MIT licensed. The private engine's licensing and availability are separate.

# sysone

The open-source integration package for [System One Engine](https://systemoneengine.com):
a small HTTP client, a local MCP bridge and an agent skill for bounded evaluations.

The System One Engine application and studio are **private-source software**, maintained
separately. This repository contains the public integration layer. It does not contain
the engine, provider implementation, studio, usage database or administrator routes.
The launcher downloads a version-pinned, SHA-256 verified compiled application
runtime under its separate preview license. Application source stays private.

## Start the app

```sh
npx sysone
```

One command starts the local engine and opens Studio. Add your Vercel AI Gateway
key in **Settings**, try a pattern from **Library**, then create a scoped agent
connection in **Connections**. The app owns its server; no separate server command
or source checkout is required. Keep the terminal running; Ctrl+C stops the engine.
A second launch reuses a matching engine and opens its Studio.

Node 22.18+ and internet access for the first download are required. The runtime is
cached under `~/.cache/systemoneengine`; private settings live under
`~/.config/systemoneengine`. Startup makes no inference request. Provider usage
requires your own Gateway account. The preview has no System One subscription fee.

Use `npx sysone app --no-open` without a browser, or `--port 4320 --home /private/path`
for an isolated instance. Existing engines are reused only when the owner token
matches. No background daemon is installed.

## Use the SDK

```sh
npm install sysone
```

Node 22.18+ is required. Your provider key stays with the engine; this client needs
only its URL and a scoped consumer token. `engine.patterns()` discovers editable recipes.

```js
import { createClient } from 'sysone/client';

const engine = createClient({
  url: process.env.SYSONE_URL,
  token: process.env.SYSONE_TOKEN,
});
console.log(await engine.capabilities());
const result = await engine.runPattern({
  pattern: 'palette-match',
  state: 'A calm dark workspace with one restrained accent.',
  candidates: {
    slate: 'Dark slate, pale text, restrained blue accent',
    festival: 'Bright yellow, magenta and saturated orange',
  },
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
The bridge exposes `sysone_status`, `sysone_patterns`, `sysone_run`, `sysone_decide`, `sysone_logs`, `sysone_tree` and
`sysone_dialogue`. Each request uses the credential's services and remaining limits.

If no explicit connection or environment pair is supplied, the CLI reads
`~/.config/systemoneengine/agent.json`. It never reads a provider credential or
administrator token. Avoid putting tokens directly in command-line arguments.

The engine also exposes Streamable HTTP MCP at `/mcp`; clients that support it can
connect directly with their supported bearer/OAuth setup. This stdio bridge does
not run an OAuth login flow. Hosted web clients cannot directly reach loopback.

## Let an agent use Jev

1. Call `sysone_patterns` with `{"query":"palette"}` to find a recipe.
2. Call `sysone_run` with `pattern`, `state` and the required `candidates`.
3. Read the answers, usage and recipe policy. Keep an uncertain decision with the calling agent.

The library has 30 recipes, including item matching, source selection, citation
checks and diagnostic tests. Selection recipes require your own ID-to-description
map. The engine adds a `review` choice when no candidate fits. Other decision
recipes use fixed questions and need only `pattern` and `state`. Use
`sysone_patterns` with an `id` to inspect those questions first. Tree, logs and
dialogue use their separate service tools. `sysone_decide` accepts custom questions.

Examples and research confidence are documented in [System One Bench](https://systemoneengine.com/bench/).
Confidence ratings describe the evidence behind a use case, not calibrated model probabilities.

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

MIT licensed. The compiled application runtime is distributed under its separate preview license.

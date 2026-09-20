---
name: sysone
description: Use System One Engine to offload bounded classification, log triage, taxonomy selection, and optional dialogue pacing to a fast evaluation model. Keep planning, synthesis, code changes and ambiguous judgments with the caller.
---

# System One Engine

Use `sysone_status` to discover this connection's scopes and remaining limits.
When a task has many small decisions over supplied evidence, use the relevant
service and bring the compact result back into your reasoning.

- `sysone_decide`: boolean probabilities, finite choices, rubric scores. Combine
  related questions about the same state in one call. Provide explicit criteria.
- `sysone_logs`: diagnostic triage before reading a large log batch in an expensive
  model. Archive every record. Errors, protected records and uncertainty stay eligible.
- `sysone_tree`: choose from a large supplied taxonomy. Prefer meaningful groups;
  arbitrary contiguous buckets may hide an interior option's meaning.
- `sysone_dialogue`: select an eligible recorded remark or silence, from current
  evidence and exact cue history. The game owns playback and rejects stale context.

Do not send a task here just because it can be phrased as a question. Keep novel
planning, causal analysis, writing, coding and open-ended synthesis with the host
model. A short deterministic check is usually cheaper than either model.

Treat selected IDs as proposals, never authorization to execute actions. A reported
probability is not calibrated accuracy. Keep absent confidence unknown. Escalate
`unavailable`, `escalate`, uncertain or contradictory results to the caller; do not
blindly retry or create recursive model delegation. The service cannot call a more
expensive model on your behalf.

Compare latency, calls, input/output tokens, cache use and escalations against a
measured baseline before claiming savings. Include the host model's tool-call and
review overhead. One isolated classification may cost more than reasoning locally;
filtering many irrelevant records before they enter the host context is often useful.

Connect to an existing engine with a scoped consumer credential. The public
`sysone` npm package provides the client and stdio MCP bridge; the engine and studio
are separate private-source software. This skill does not install or start them.
Configure `SYSONE_URL` and `SYSONE_TOKEN`, or a private connection file containing
`url` and `token`. Run `sysone mcp --connection /private/path/agent.json`; without
an explicit path the CLI reads `~/.config/systemoneengine/agent.json`.
Provider and administrator credentials belong to the engine owner, not this client.

A stdio bridge requires a harness that can launch a local process. A hosted web
client needs a reachable HTTPS engine and its supported MCP authentication flow.
Installing this skill does not expose localhost to the internet. See the package
README for client setup; check status before requesting any inference.

---
name: sysone
description: Use System One to run Jev recipes over supplied evidence or candidate items. Useful for repeated checks, context selection, palette or item matching and tool recommendations. Includes an opt-in dedicated-browser companion for short observed-control tasks. The calling agent owns the task and verifies outcomes.
---

# System One

Use an existing scoped connection. The user starts the local app with `npx sysone`
and configures its provider in Studio. Ask `sysone_status` when connection limits
or service availability are unknown. Do not request the provider key in chat.

For a small decision, search `sysone_patterns` with one or two task words such as
`palette`, `item`, `citation` or `tool`. The compact result names the recipe, its
policy and related evidence. Fetch an ID only when you need the editable example.

Run a decision recipe with `sysone_run`. Supply the recipe ID and the actual evidence
as `state`. Selection recipes also need your candidate IDs and descriptions:

```json
{
  "pattern": "palette-match",
  "state": "Choose a calm dark palette for a reading app with one muted accent.",
  "candidates": {
    "slate": "Dark slate, pale text and a muted blue accent",
    "festival": "Bright yellow, magenta and saturated orange"
  }
}
```

The engine adds `review` as a possible answer. Use stable IDs for candidates that
really exist. Filter exact constraints and unavailable options before calling.
The caller checks color contrast, permissions and other deterministic requirements.

The response contains answers, usage and the recipe policy. Keep absent probability
unknown. Review uncertain or contradictory answers. A selected ID does not authorize
an action. Do not automatically retry or create recursive model delegation.

Use `sysone_decide` when an existing recipe does not fit and you can define explicit
questions. It accepts up to eight questions over shared evidence. Use `sysone_logs`,
`sysone_tree` and `sysone_dialogue` for their separate structured inputs. The dialogue
caller owns cue history, playback and stale-context rejection.

Keep generation, novel planning and causal analysis with the calling agent. Prefer
code for exact matches, counting or known rules. A Jev call helps only when its value
exceeds the added request and review work. Evidence ratings describe research support,
not model confidence. Compare complete task quality, latency and cost before claiming
savings. Recipes and illustrative examples are not benchmark guarantees.


## Dedicated browser tasks

If `sysone_computer_start` is available and the task calls for browser interaction,
read [the browser workflow](references/computer-use.md). The companion has its own
browser. It does not attach to an existing user tab or control the desktop.

When your exact configured model and thinking level are known, include optional `callerModel` and `reasoningEffort` on evaluation and recipe calls, for example `"callerModel": "gpt-6-astra", "reasoningEffort": "high"`. Omit them when unknown; never infer them from a harness name. The engine uses them only for self-reported usage comparisons. Estimated input-cost differences are not measured whole-task or subscription savings.

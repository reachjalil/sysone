# Let Jev choose the next browser action

An agent can ask System One to fill a small preview form, set a filter, or choose a
visible item that matches a description. The agent supplies the task and any exact
text. Jev chooses from controls the companion has just read. The companion returns
screenshots to the agent, which checks the result.

## Connect

Create a scoped connection with the `decide` service in your local Studio or invited
cloud workspace. Store the URL and token in a private connection file. The helper
needs this consumer token, not the Vercel provider key.

```json
{
  "mcpServers": {
    "system-one-computer": {
      "command": "npx",
      "args": ["-y", "sysone@0.6.0", "computer", "--connection", "/private/path/agent.json"]
    }
  }
}
```

This is a common stdio MCP configuration shape. Follow your client's configuration
location and schema. The MCP SDK integration is tested; individual desktop clients
have not all been verified. Cloud web chats cannot start a local process through a
remote MCP URL. A remote browser or desktop relay is not included in this release.

The ordinary seven System One tools remain available. The companion adds:

| Tool | What it does |
| --- | --- |
| `sysone_computer_start` | Opens its own visible Chrome session at one origin |
| `sysone_computer_observe` | Returns a JPEG and bounded visible controls with a fresh observation ID |
| `sysone_computer_decide` | Batches the next operation and compatible targets into one Jev evaluation |
| `sysone_computer_act` | Executes one chosen action against the observed node |
| `sysone_computer_run` | Repeats bounded decisions and actions, then returns the trace and final image |
| `sysone_computer_close` | Cancels an active run, closes its browser and removes its temporary profile |

## Example sequence

Start at the application's URL, then observe it. On a page with a `Project name`
field, a native `Mode` dropdown with a `light` value and a `Save preview` button,
this is a bounded run input:

```json
{
  "goal": "Save a preview named Alpha in light mode. Stop once the saved preview is visible.",
  "maxSteps": 6,
  "minimumProbability": 0.8,
  "allowedOperations": ["type", "select", "click", "wait"],
  "fields": [{"name": "Project name", "text": "Alpha"}],
  "selections": [{"name": "Mode", "option": "light"}]
}
```

Use the exact labels and values from your own observation. This example is not an
instruction to submit a form outside the user's task. A probability threshold stops
uncertain proposals; it is not a calibrated accuracy guarantee.

The result includes `actionsExecuted`, each proposal and engine receipt metadata,
the stopping reason, and the final screenshot. `verified` is always false. The
calling agent must check the requested state, using an independent read when available.

## Supported patterns

- Match the next visible control to a short task description.
- Fill caller-supplied text and choose an observed native dropdown option.
- Select a checkbox, tab or button, then inspect the resulting page state.
- Scroll the main document to reveal another control.
- Stop on a loading, incomplete or unsupported state and return to the main agent.
- Delegate several routine steps in one tool call and review the final image.

The first version supports common visible HTML controls on one origin. It does not
implement the full accessibility naming algorithm. Frames, shadow roots, canvas,
uploads, passwords, new windows, nested scrolling and arbitrary keyboard widgets
are unsupported. Sites that require trusted hardware events may reject these actions.

## Data and limits

The helper starts a fresh temporary profile. It never reads an existing Chrome
profile, downloads a file or accepts arbitrary JavaScript, selectors or coordinates
from Jev. Before acting, it checks the current visible state, original node identity,
link/form destinations and whether another element covers the target. A state change
stops the action. These checks do not establish that a model chose the right action.

Screenshots are MCP image content for the calling agent. The engine receives the
goal, up to 40 control descriptions, current visible text and recent actions. It
receives no pixels. The main agent supplies exact field values; there is no hidden
text-writing model. Do not use this helper on data your configured engine should
not receive. Credentials stay in the connection file and never enter tool results.

Each session is limited to ten minutes and 150 observations. A run has at most 12
steps and 90 seconds. There are no automatic request retries. Closing the session
cancels the run and affects only that session's temporary browser.

## Research and measurement

The design draws on [Browser Use's indexed-control experiment](https://github.com/browser-use/jev-ultrafast/tree/1231850a0bf1a0c0341fe408ef1668dbbfdfac46)
and [Aaron Levin's OCR and accessibility experiment](https://github.com/awlevin/typesafe-computer-use/tree/cc7b5066ae1a07b5e3182e8f87a9b5b6dfdcffc1).
This is an independent TypeScript implementation. Those projects' timings are not
System One measurements. See [System One Bench](https://github.com/reachjalil/system-one-bench)
for the sources, confidence ratings and complete-task test plan.

Saving host-agent turns is an architectural opportunity. To establish savings,
compare final task success, provider usage, observation time, retries, escalations
and host review against the same task without the companion. A known deterministic
script is a necessary baseline. Fixed chat subscriptions do not become cheaper just
because a task sends fewer tokens.

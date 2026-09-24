# Let Jev choose the next browser action

An agent can ask System One to fill a small preview form, set a filter, or choose a
visible item that matches a description. The agent supplies the task and any exact
text. Jev chooses from controls the companion has just read. The companion returns
screenshots to the agent, which checks the result.

## Check the setup

Run `sysone computer doctor` before adding the MCP server. It checks Node, the browser
executable, temporary-profile creation, Chrome accessibility and a screenshot of its
own local test page. It needs no engine token and makes no model call. Set
`SYSONE_CHROME_PATH` if Chrome is installed outside the usual locations.

| Requirement | Dedicated browser | Optional Mac observation |
| --- | --- | --- |
| Node 22.18+ | Required | Required |
| Chrome or Chromium | Required | Not used by native AX |
| Scoped connection with `decide` | For model decisions | For separate model advice |
| Apple Command Line Tools | Not required | Required to compile the small Swift helper |
| macOS Accessibility permission | Not required | Required for reading another app's AX tree |
| Screen Recording permission | Not required | Not required for AX-only reading |

On Linux, install your distribution's browser runtime dependencies. Keep Chrome's
sandbox enabled. A visible session also needs a graphical desktop. The SDK can run
headless; the normal MCP companion opens a visible browser.

## Connect

Create a scoped connection with the `decide` service in your local Studio or invited
cloud workspace. Store the URL and token in a private connection file. The helper
needs this consumer token, not the Vercel provider key.

```json
{
  "mcpServers": {
    "system-one-computer": {
      "command": "npx",
      "args": ["-y", "sysone@0.7.0", "computer", "--connection", "/private/path/agent.json"]
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
| `sysone_computer_doctor` | Checks local setup without spending an evaluation |
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

The browser supports visible HTML controls and open shadow roots on one origin.
Chrome supplies computed accessibility names, roles, descriptions, field states and
named group context, bound to the same retained DOM nodes. Frames, closed shadow roots, canvas,
uploads, passwords, new windows, nested scrolling and arbitrary keyboard widgets
are unsupported. Sites that require trusted hardware events may reject these actions.

## Data and limits

The helper starts a fresh temporary profile. It never reads an existing Chrome
profile, downloads a file or accepts arbitrary JavaScript, selectors or coordinates
from Jev. Before acting, it checks the current visible state, original node identity,
link/form destinations and whether another element covers the target. A state change
stops the action. These checks do not establish that a model chose the right action.

Screenshots are MCP image content for the calling agent. The engine receives the
goal, up to 40 control descriptions, current visible text, status messages and recent
actions. Each independent question receives current field values, required/invalid
flags and exact comparisons with caller-supplied values. Code computes those facts.
The helper traverses at most 6,000 DOM elements and 64 open roots; truncation is explicit.
If Chrome accessibility is unavailable, the observation marks the DOM fallback.
If accessibility changes after capture, the old observation cannot authorize a step. It
receives no pixels. The main agent supplies exact field values; there is no hidden
text-writing model. Do not use this helper on data your configured engine should
not receive. Credentials stay in the connection file and never enter tool results.

Each session is limited to ten minutes and 150 observations. A run has at most 12
steps and 90 seconds. There are no automatic request retries. Closing the session
cancels the run and affects only that session's temporary browser.

## Optional native Mac accessibility

Add `--desktop` to the MCP command to expose `sysone_desktop_observe`. Run
`sysone computer doctor --desktop` from the same terminal or agent host first.
The helper compiles into a private user cache using Apple's Command Line Tools.
If those tools are missing, install them with `xcode-select --install`.

The setup check reports Accessibility and Screen Recording permission separately.
It does not open a permission prompt or change a setting. For AX reading, enable the
responsible terminal or agent host, or the helper if macOS lists it, in System Settings
under Privacy & Security > Accessibility. Restart that host and rerun the check.
Permission for one launching host does not establish permission for another.

Request one application explicitly:

```json
{"bundleId":"com.apple.TextEdit"}
```

The adapter reads that running application's focused window only, with node, depth,
IPC and total-time bounds. It omits secure text fields and returns observed roles,
labels, values, states, action capabilities and bounds. The returned text is untrusted
application data. Pass only relevant candidates to `sysone_decide`, including a
`review` choice. Native IDs are snapshot descriptions, never browser action targets.

Native observation is experimental. The September 20 Mac fixture check compiled the
helper and confirmed permission, but returned `focused_window_unavailable`; successful
native control extraction is not yet verified here. A permission result does not prove that an app
exposes usable controls. An absent or invalid focused window returns an error rather
than walking the application menu or the whole desktop. This adapter does not capture
native screenshots, perform desktop actions or implement OCR. Browser screenshots
continue to go to the calling agent.

## What the model needs

[TypeSafe's state documentation](https://docs.typesafe.ai/concepts/state) says Jev
accepts text, and each question evaluates the shared state independently. This is why
we send computed labels and values to every head and return screenshots to the caller.
[Its Jev 1.13 guidance](https://docs.typesafe.ai/model-jaggedness/jev-1.13) recommends
literal conditions, filtered context and code for exact arithmetic. Our choices use
observed IDs, explicit `review`/`none` options and computed form facts. These are
implementation choices informed by that guidance, not a guarantee of model accuracy.

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

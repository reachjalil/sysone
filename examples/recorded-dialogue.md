# Choose one recorded reaction or silence

The Infinite Parable uses this integration pattern for optional narration. The
public example is a small host-side consumer, not the game's private director.
It calls the existing dialogue service and does not need the recipe-running API.

A player looks at a reading lamp while a waiting remark is queued. Give System One
both eligible recordings in one request. The game still owns which remarks are
eligible, whether the scene is current and when audio can start.

```js
import { createClient } from 'sysone/client';
import { recommendRecordedReaction } from './recorded-dialogue.mjs';

const engine = createClient({
  url: process.env.SYSONE_URL,
  token: process.env.SYSONE_TOKEN,
});
const snapshot = {
  contextId: 'run-1:reading-room:revision-4',
  room: 'reading-room',
  trigger: 'queued-optional-reactions',
  elapsedSeconds: 60,
  silenceSeconds: 8,
  completedCues: [],
  recentCues: [],
  facts: {
    lampOn: false,
    dialogueCandidate0: 'lamp: The player is looking at the unlit reading lamp.',
    dialogueCandidate1: 'wait: The player has remained idle for 55 active seconds.',
  },
  candidates: [
    { id: 'lamp', text: 'The switch is on the base of the reading lamp.' },
    { id: 'wait', text: 'Take your time.' },
  ],
};

// These are the consuming host's existing lifecycle owners.
const decision = await recommendRecordedReaction(engine, snapshot, {
  isCurrent: id => !game.paused && game.narrationContextId === id,
  signal: game.sceneAbortSignal,
});
// Give the proposal to your existing director. Recheck eligibility when playback
// starts. Fallback restores authored ordering; silence completes no recording.
game.narration.acceptProposal(decision, snapshot.contextId);
```

`game` above represents your application's existing state and narration API. It is
not a sysone export. The helper never executes an action or creates a speech queue.
Use one request at a time per narration lane and abort it when the context changes.
Essential story dialogue should bypass this optional choice entirely.

Keep the scoped `dialogue` credential on your server or desktop main process. The
renderer does not need the provider key or consumer token. A probability threshold
is a policy, not measured calibration. Test silence, unknown IDs, cancellation,
provider failure and changed scenes before enabling the feature.

The Parable development run is documented in
[System One Bench](https://github.com/reachjalil/system-one-bench/tree/main/findings/dialogue-selection).
Its conservative results do not establish a better listening experience or savings.

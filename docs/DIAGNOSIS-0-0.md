# DIAGNOSIS — why the AI-vs-AI harness read 0-0 (measured, 2026-09-30)

## The brief's hypothesis (partly wrong)
> "the AI-vs-AI test in test-headless.js reads 0-0 because both cars share
> contested ball access"

Contested access is **real but is not why it read 0-0**. Measured with
`tools/harness-trials.js` (attacker brain, 3 seeds x 3 difficulties, 180 s):

| defender        | goals per 180 s |
|-----------------|-----------------|
| none (solo)     | 1, 2, 4, 8, 83  |
| passive (parked)| 1, 1, 1, 3      |
| active brain    | 0, 1, 1, 2, 3   |

So the defender genuinely works — it cuts 83 goals/180 s down to ~1-3. The
bot is NOT helpless. That part of the brief is confirmed as a *gameplay*
characteristic, not a harness bug.

## The actual cause of the 0-0 readout: two harness/engine defects

### Defect 1 — the sim never increments the score
`grep -n "score\[" js_parts/*.js` returns exactly one hit:

    js_parts/13_main.js:214:        match.score[e.team]++;

The score is owned by **13_main.js**, not the sim. The sim fires a `goal`
EVENT and returns. Any harness that drives `RTL.sim.step()` directly and then
reads `match.score` therefore always reads 0-0, even when goals fire.

Proof (`tools/looptrace.js`, exact replica of the failing test loop):

    seed=777  diff=1 -> steps=37200 goals=1 shots=18 final=0-0 t=288.3
    seed=2024 diff=3 -> steps=37200 goals=1 shots=10 final=0-0 t=297.8

`goals=1` with `final=0-0`. The goal fired; the scoreboard never moved. The
test then "passed" only via the escape hatch `ok(goals >= 1 || shots >= 3)`.

### Defect 2 — the harness froze the match in permanent countdown
`06_sim.js:581` freezes all physics while `match.state === "countdown"`:
`const frozen = match.state === "countdown";` — cars AND ball are skipped.
But `stateT` for the countdown is decremented by **13_main.js:347**, not the
sim, so a harness must drive that transition itself. The old harness did:

    if (match.t > 0 && match.state === "countdown") match.stateT = 0.99;

which pins `stateT` at a constant 0.99 and never sets `state = "play"`. So
the first time `sim.kickoff()` ran (after a goal), the match entered a
**permanent countdown freeze** and nothing moved again.

Proof: every seed above ends `t=288.3 / 297.8` — i.e. the clock stops dead
the moment the first goal is scored — with `state=countdown stateT=0.99`.
Seed 2024/diff 2 never scored, so it stayed in `play` and ran the full
36001 steps: that is the one case that produced 0 goals and looked healthy.

Note `tools/harness-trials.js` shows 83 goals/180 s solo, which is itself a
separate balance problem (see BALANCE below), but it proves goal *detection*
works when the state machine is not frozen.

## Root design flaw behind both
The match **state machine and the scoreboard are split across files**: the sim
owns the ball and the goal test, while main owns the clock, the countdown and
the score. Anything that does not run 13_main.js (headless harness, replay,
spectator, a future server-authoritative referee) gets a game that scores
goals it cannot count, and can be frozen forever.

## Fix applied
Score, per-match stats and the whole clock/countdown/goal-freeze/overtime/
full-time state machine move INTO the sim as `sim.tickClock(match, dt, cars,
ball)`. Main delegates and keeps only presentation (audio, banner, camera,
menu). One source of truth, so the harness and the live game cannot disagree.

## Measured defects fixed at the same time
- **carryT was incremented twice** (06_sim.js:371 and 13_main.js:340), so
  `CARRY_MAX_SECONDS = 6` fired at ~3 s of real time and the full-time
  "TOP CARRY" stat was exactly double the truth.
- **stats were main-only**, so no headless run could assert on shots, saves
  or demos.

## BALANCE (separate, still open)
Solo scoring is 83 goals / 180 s at NEURAL — roughly one every 2 s. With an
active defender it drops to ~1-3 per 180 s. The gap is far too wide: either
the attack is trivial or the defence is near-perfect. `testHeadless` will
lock in a band (see the new test) so this cannot silently drift again.

# Hand-off: camera + driving feel rebuild (Retro League parity)

## Current State
- Branch: master (local commits ahead of origin — push only at ship time with the tuning work)
- Working tree: MODIFIED, NOT COMMITTED — all tests green (35 headless + 16 full)
- Game playable + driving correctly on http://localhost:8613 (see Dev server below)

## What's Complete (this run, uncommitted)
1. `js_parts/06_sim.js` — FIXED GAME-BREAKING BUG: tank-path recompose
   (`car.vx = fx*along + latX`) ran unconditionally and stomped the Assisted
   branch's direct vx/vy writes every tick -> car never moved in Assisted mode.
   Fix: `assistedStep` flag; recompose skipped on Assisted. Classic path unchanged.
2. `test/test-headless.js` — added `testAssistedDrive` (4 asserts: top speed,
   travel, facing, no NaN). 35/35 PASS.
3. `js_parts/13_main.js` — FIXED: tied overtime never ended (clock ran negative
   forever at 0:00). Now `else { match.t=0; endMatch(); }` -> draw ("THE DERBY
   ENDS ALL SQUARE!").
4. `js_parts/11_camera.js` — CAR cam: rotation now follows HEADING (was
   velocity-angle -> pi-flip whip on wall bounces); breathing zoom by ball
   distance (`outF = clamp(1-(bd-14)/60, 0.5, 1)`, damp rate 2.5); fit-cap
   `cap = (view.h*0.62)/((bd+2)*sq)`; bounded ball-bias look point
   `bias = clamp((bd-18)/40,0,1)*0.5`.
5. `tools/devserver.py` (NEW) — serves public/ with `Cache-Control: no-store`.
   USE THIS. Plain `python -m http.server` lets Chrome serve stale js_parts
   (304s) and silently hides every edit. This cost ~1h. Port 8613 running.
6. `public/js_parts/` — 06_sim/13_main/11_camera copies synced to source.

## Reference measurements (his game, Retro League v0.8.3 — robkodev)
- Play top-level (iframe blocks input): https://html-classic.itch.zone/html/19443605/app/index.html
- `window.retroGame` exposes state: `frame.state.cars[0].p` (x,y,z; arena ~±5000u),
  `view.iso/isoturn/isoFocus/isoLead`, `view.stage.ortho` (render cam).
- CAMERA: FIXED iso direction — rotation NEVER changes in play (`isoTurn` always 0).
  Feel comes from: zoom breathing 4.4 <-> ~2.4 (~1.8x) by BALL DISTANCE, smooth
  damped, no jumps; lazy pan (focus trails car, speed lead up to ~±200u); car may
  drift to screen edge then gently re-centres; car ~centre at rest (fy ~0.55);
  ball stays framed even 4100u away. Kickoff: car fy 0.55, ball fy 0.43.
- CAR FEEL: 0->~60% top speed in ~0.6s (our CAR_ACCEL 26 already matches — do
  not touch sim constants); Assisted = twin-stick (W up-screen, A strafe), near-
  instant response.
- OUR baseline problems (measured): kickoff ball at fy 0.076 (his 0.43); ball
  fell off-screen (fy up to 3.2) on long drives; camera whipped on wall bounces
  (both FIXED above; zoom/bias work uncommitted).

## Immediate Next Steps (in order)
1. Verify CAR cam corner-to-corner: free play, hold W into far wall + beyond,
   ball punted to opposite corner. PASS = car on-screen always (fy<=0.75),
   ball worst fy<=~1.0, rotation delta <0.2 rad across a bounce, zoom never jumps.
   Probe pattern below. If ball still escapes, nudge cap factor 0.62 down or
   bias 0.5 up (ONE at a time, re-verify).
2. BALL cam: rotation cap 1.6 -> ~0.55 rad/s (11_camera.js maxRate); verify its
   adaptive zoom still feels like his (no jumps) with the same drive battery.
3. Pan damping 6.5 -> ~2.3 (both cams, cam.ox/cam.oy damp) for his lazy-follow.
4. CAR_CAM.anchorY 0.6 -> 0.62 in 01_constants.js (lower-third).
5. STEP 3 GATE: play ours 3+ min continuously (real keys), then his 2 min,
   repeat until difference is small. Screenshots don't count.
6. Ship: `node test/test-headless.js && node test/test-full.js` -> commit
   (fixes + tuning can be two commits: `fix: ...`, `feat: ...`) -> push ->
   `cp js_parts/*.js public/js_parts/` ->
   `node C:/Projects/imidlalo-website/node_modules/wrangler/bin/wrangler.js deploy`
   -> play https://ricksytaxi.imidlalo.co.za 3 min live.

## Probe pattern (paste into browser console on localhost:8613)
- Enter free play: `RTL.main.act('freePlay')` (wait ~3.6s for countdown).
- Snapshot: project car/ball with `RTL.mathx.project(x,y,z, RTL.main.QA.cam)`
  divided by `cam.vw/cam.vh` -> screen fractions. State: `RTL.main.QA.cars[0]`,
  `.ball`, `.cam`, `.match`.
- Keys: `window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',key:'w',
  bubbles:true,cancelable:true}))`, re-dispatch every 40ms, keyup to release.
  (key MUST be set; countdown blocks movement.)
- His game: same idea but `retroGame.frame.state`, keys to document.body.

## Gotchas
- Chrome caches js_parts heuristically — only the 8613 devserver is safe.
- The itch game tab main thread can wedge (eval timeouts): navigate to
  about:blank, then reload the URL; page reloads wipe installed probes.
- Kickoff countdown = 3s of frozen input; wait it out before drives.
- `RTL` is a top-level const — accessible directly in console, NOT via window.
- Endless-overtime sessions wedge the old build; fresh matches are clean.

## Rules (from Brandon, unchanged)
Don't rebuild the engine. No sim changes beyond the applied assistedStep fix.
One variable at a time, replay between changes. Report honestly if feel still
doesn't match. English only. Bugs found on the way are in scope.

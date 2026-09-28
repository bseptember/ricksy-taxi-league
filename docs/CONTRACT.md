# RICKSY TAXI LEAGUE — module contract (all agents read this, nobody edits it)

## What this game is
Isometric retro pixel car-soccer (Rocket-League-inspired, 100% original code/art/audio).
You drive a minibus taxi, hit the ball into the opponent's goal. 5:00 match, first to
more goals at 0:00 wins; golden goal in overtime.
Theme: Mzansi taxis play car soccer. Blue = AMANDLA FC (player), Orange = IBHOKISI FC (AI).
South-African flavor: crowd chants "shooo!", minibus taxis, kasi pitch, load-shedding
floodlight flicker on some kickoffs. NO crime/violence themes — keep it family-friendly.

## Fixed conventions (DO NOT DEVIATE)
- No build step, no npm, no framework. Plain ES2020. Files load in order (see index.html).
- Every js file attaches to ONE global namespace object `RTL` (defined in 01_constants.js):
  `RTL.fx`, `RTL.mathx`, `RTL.spr`, `RTL.render`, `RTL.world`, `RTL.sim`, `RTL.ai`,
  `RTL.events`, `RTL.audio`, `RTL.input`, `RTL.camera`, `RTL.ui`, `RTL.main`.
- Units: 1 world unit = 1 metre. Pitch: X in [0,68], Y in [0,105] (football size).
  Z = height above ground, Z>=0. Goal: at Y=0 and Y=105, mouth X in [30.66,37.34] (6.68m
  wide centered), crossbar Z = 2.44. Ball radius 0.35. Car footprint 4.2 x 1.9 x 1.5.
- Physics at fixed dt = 1/120 s. Rendering interpolated between last two sim states.
- iso projection (02_math.js `RTL.mathx.iso()`): world (x,y,z) -> screen. ONLY the mathx
  version may be used by renderer/sprites/camera modules.
- RNG: every stochastic system takes an `rng` function parameter. The match runs with
  `RTL.mathx.rngFrom(seed)` so replays/tests are deterministic.
- Persistence: ONLY via `RTL.main.save()` / `RTL.main.load()` (localStorage key
  `ricksy_taxi_league_v1`). Modules never touch localStorage directly.
- Audio: ONLY via `RTL.audio.play(name)` / `RTL.audio.music(state)`. Fire-and-forget.
  All audio calls must be wrapped in try/catch inside audio.js (never break gameplay).
- Text/language: English (Latin alphabet) only, everywhere.

## Entity shapes (frozen)
```js
// Car
{ id:'P1'|'AI', team:'blue'|'orange', x,y, z:0, vx,vy, vz,
  heading,            // radians, 0 = +X direction
  angVel,
  boost:0..100,       // starts 34 (RTL.C.START_BOOST)
  boostHeld:false, jumping:false, jumpT:0, airTime:0, canJump:true, canFlip:true,
  flip:{active:false,t:0,dx:0,dy:0}, carrying:false, carryCd:0,
  demo:{active:false,t:0}, respawnT:0, onGround:true, wheelspin:0 }
// Ball
{ x,y, z, vx,vy,vz, spin:0, lastTouch:null /*'P1'|'AI'|null*/, guides:[] }
// Match
{ mode:'free'|'match', score:{blue:0,orange:0}, t:300 /*seconds remaining*/,
  state:'countdown'|'play'|'goal'|'over', stateT, overtime:false, seed, kickoffFor:'blue' }
```

## Module ownership map (files and what they may define)
| File | Owner | May read | Must provide |
|---|---|---|---|
| 01_constants.js | me | — | `RTL`, `RTL.C` (all tunables), version |
| 02_math.js | me | 01 | `RTL.mathx` (vec, iso, rngFrom, clamp, lerp, angles, easing) |
| 03_sprites.js | agent A2 | 01,02 | `RTL.spr` — bake() -> offscreen canvases; draw(ctx,name,x,y,opts) |
| 04_audio.js | agent A3 | 01 | `RTL.audio` — init() on first gesture, play(name), music(state), muted |
| 05_world.js | me | 01,02 | pitch geometry, walls, goals, floodlights, crowd seeds, `RTL.world` |
| 06_sim.js | agent A1 | 01,02,05 | `RTL.sim.step(state, inputs, dt, rng)` pure; car/ball/carry/flip/demo physics; goal/wall/bounds events pushed to `state.events` |
| 07_ai.js | agent A3 | 01,02,05,06(types only) | `RTL.ai.think(matchState, cars, ball, difficulty, rng, dt) -> {throttle,steer,boost,jump,shoot,carry,brake}` per tick, stateless |
| 08_events.js | agent A3 | 01,02 | `RTL.events` — pure processors for goal/kickoff/demo/streak; kickoff pose builder |
| 09_render.js | agent A2 | 01,02,03,05 | `RTL.render.drawScene(ctx, view)` — view = {cars, ball, t, camera, fx[], guides, lights} |
| 10_input.js | me | 01 | keyboard+mouse+touch -> `RTL.input.state` snapshot {throttle,steer,boost,jump,shoot,carry,brake,camToggle...} |
| 11_camera.js | me | 01,02 | `RTL.camera.update(cam, target, ball, dt)` + cam presets CAR/BALL/TUNNEL |
| 12_ui.js | me | 01,02,03 | HUD, menus, touch UI, toasts (DOM-free, canvas-drawn) |
| 13_main.js | me | all | boot, loop with fixed-dt accumulator, state machine, save/load, match flow |

## Interfaces between agents (call signatures — frozen)
```js
// 06_sim.js (A1)
RTL.sim.step(match, cars, ball, inputs, dt, rng) // mutates cars+ball, advances match
//   inputs: { P1:{throttle:-1..1, steer:-1..1, boost:bool, jump:bool(edge-detected inside),
//            shoot:bool, carry:bool, brake:bool}, AI:{...same} }
//   pushes to match.events: {type:'goal',team,speed}|{type:'kickoff'}|{type:'save'}|
//   {type:'wallbang',x,y}|{type:'demo',victim,by}|{type:'carry',who}|{type:'whistle'}
RTL.sim.kickoff(match, cars, ball) // reset poses per kickoffFor
RTL.sim.shootBall(car, ball)      // used by sim internally; exposed for tests

// 03_sprites.js (A2)
RTL.spr.bake()            // call once after fonts/images ready; idempotent
RTL.spr.draw(ctx, name, x, y, opts) // name e.g. 'taxi_blue','taxi_orange','ball',
//   'goal_blue','goal_orange','crowd','floodlight','tree','billboard_taxi',
//   'billboard_fontooweb','billboard_airtime','billboard_nandoz','billboard_spaza',
//   'billboard_shisanyama','cone','bench',' robot_p2p'... opts: {frame, flip, scale, tint}
RTL.spr.shadow(ctx, name, x, y, scale) // ground shadow blob

// 04_audio.js (A3)
RTL.audio.init()                       // first user gesture
RTL.audio.play(name)                   // 'kick','wall','goal','whistle','boost','jump',
                                       // 'demo','save','chant','ui','countdown','coin'
RTL.audio.music(state)                 // 'menu'|'match'|'tense'|'none'
RTL.audio.setMuted(bool); RTL.audio.muted

// 07_ai.js (A3)
RTL.ai.think(match, cars, ball, diff /*0..3*/, rng, dt) -> input object (same shape as P1)

// 08_events.js (A3)
RTL.events.goal(match, team, speed) -> {banner, freezeS, chantLevel}
RTL.events.kickoffPose(match) -> {cars:[{id,x,y,heading}...], ball:{x,y}}
RTL.events.describe(streak) -> string   // 'BANGER!' 'SHOOO!' 'TBAGRA!' style hype text

// 09_render.js (A2)
RTL.render.drawScene(ctx, view)   // full scene incl. pitch, stands, cars, ball, fx
RTL.render.pickSizes(w, h, dpr)   // returns {pixelScale, canvasW, canvasH} crisp pixel sizing
```

## Non-negotiables
1. NO copied assets/code from robkodev's Retro League. Same *genre mechanics* only.
2. All art procedural pixel art (string-map sprites baked to offscreen canvas).
3. All audio Web Audio synthesis, zero files, all calls safe (try/catch inside 04).
4. 60fps on a mid phone: single canvas, no per-frame allocations in hot paths,
   no shadowBlur, object pools for fx particles.
5. Touch-first layout (mobile-first): thumb zones, camera button reachable, safe-area
   insets respected; desktop keyboard/mouse equally first-class.
6. Ball guides (landing marker + trail) ON by default (that's the OG's best feature).
7. Every feature must survive headless sim: tests/test-headless.mjs imports js_parts
   via a tiny loader and runs sim-only scenarios (no canvas, no audio, no DOM).

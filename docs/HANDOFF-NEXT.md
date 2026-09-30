# HANDOFF PROMPT — Ricksy Taxi League (paste into a new session)

---

**You are continuing work on a commercial-quality browser game.** Repo
`C:/Projects/ricksy-taxi-league`, live at `https://ricksytaxi.imidlalo.co.za`
(Cloudflare Pages, free tier, static site, no build step, no npm, no framework,
plain ES2020 modules loaded in order from `index.html`). A South African
township-themed isometric car-soccer game — minibus taxis versus a football.
Reto-styled, mobile-first, single canvas.

**MANDATE: work continuously and autonomously until I manually stop you. Never
declare the game "done" while meaningful improvements remain. Commit working
changes regularly and immediately continue to the next cycle. Treat the goal as
published-commercial quality while staying free and inside
Cloudflare/imidlalo.co.za limits. Priorities in order: gameplay correctness →
visual quality → assets → audio → gameplay feel → retention → UX → performance →
accessibility → mobile → production hygiene.

**Verify everything with real tool output before you claim it done. A
plausible-looking screenshot or a passing assertion you did not run does not
count. If you cannot verify, say so explicitly.**

---

## 0. WHERE WE ACTUALLY ARE (verified 2026-09-30, read this first)

Branch `fix/sim-owns-scoreboard-and-clock`, commit `d7c2ab5`, working tree clean.
Tests: **40 headless + 16 full + 32 audio = 88 green.**

Shipped and verified this session: the sim now owns the scoreboard, clock and
per-match stats. Read `docs/DIAGNOSIS-0-0.md` for the full measured write-up.

**The single most important thing to understand about the last bug:** the
AI-vs-AI test read 0-0 for three *separate* reasons, and the accepted
explanation ("both cars share contested ball access") was **wrong**. Proof from
`tools/harness-trials.js`, same attacking brain, 3 seeds x 3 difficulties:

| defender        | goals per 180 s |
|-----------------|-----------------|
| none (solo)     | 1, 2, 4, 8, 83  |
| passive (parked)| 1, 1, 1, 3      |
| active brain    | 0, 1, 1, 2, 3   |

The defence works. The harness was blind, because the score lived in
`13_main.js` and the harness drove the sim directly. **Lesson for every future
bug: instrument first, measure, and do not accept a plausible story — the
measured number is the only evidence.**

The three real defects were: (1) the sim never incremented the score, (2) the
harness pinned countdown `stateT` at 0.99 so the first kickoff froze the match
forever, (3) the assertion was `goals >= 1 || shots >= 3` — a shots-only escape
hatch that let a fully goalless match report green. All three are now fixed and
the test asserts the scoreboard agrees with the goal events.

---

## 1. GRAPHICS — raise the bar to Retro League, then beat it

Reference game: **https://robkodev.itch.io/retro-league** (robkodev, by the
same author whose feel the project is chasing). Screenshots on that page show
what "sell-worthy" actually looks like. The comparison that matters:

| | Retro League (0.6.0) | Ricksy Taxi League today |
|---|---|---|
| Camera | shows goal, stands, crowd, and a large slice of pitch | **shows a sliver of pitch; no stands or crowd visible in play** |
| Pitch | mow stripes, painted box/arc lines, corner flags, worn turf | 4 flat green bands, white lines only |
| Stands | full tiered bowl, orange/red seating, dense speckled crowd, lit | not visible in gameplay at all |
| Goals | thick frame, visible netting, reads at distance | thin, barely present |
| Lighting | night sky, floodlight pools on turf, glow on the ball | flat daylight, no light pools |
| Vehicle | readable at speed, clear facing, team colour + shape | detailed AI vans (good) but tiny and low-contrast on green |
| Ball | large, glossy, high contrast, trail reads well | 10 px, low contrast against turf |

### 1.1 THE CAMERA IS THE #1 GRAPHICS BUG — measured, not guessed

Live measurement on the deployed game (canvas 1264x625, `CAR` cam):

```
zoom                    14.79
visible world           85.5 m wide x 51.5 m tall
pitch is               68 m x 105 m
percent of pitch shown  126% wide, 49% tall
car on screen           62 px
ball on screen          10 px
```

**You are zoomed in far enough that half the pitch's length is off-screen and
the stands never enter the frame.** That single number is why the game reads as
"small diorama" and why Brandon has said *"the graphics suck"* repeatedly.
Compare: a car-soccer screenshot only reads as a stadium if the goal, the
touched box and a bank of crowd are all visible.

Fix direction: raise `C.CAR_CAM.zoom` enough to bring both a goal line and the
near stands into frame; keep the player car comfortably in the lower third
(`anchorY` already 0.62). Do **not** re-tune the camera without a failing
measurement first — one variable, replay, numeric gate. The prior camera work
fixed wobble with rate caps and a zoom floor; do not regress that. Test the
drive battery: free play, hold W into the far wall and past it, punt the ball to
the opposite corner. Gate = car always on screen, ball worst-case in frame, no
zoom jumps.

### 1.2 Art is oversized and over budget — measured

`public/art/` is now **4.8 MB** (4818 KB), total `public/` **5.7 MB**. The
agreed budget in `docs/HANDOFF.md` is ~1.8 MB art and **under ~4 MB total**.
**We are already over budget before shipping.** Decoded texture is the real
problem, because these are decoded to RGBA the moment they load:

```
sky_sunset.png   1792x1024   79 KB  ->   7.0 MB decoded
menu_bg.png      1024x1024  174 KB  ->   4.0 MB decoded
taxi_blue.png     932x821   623 KB  ->   2.9 MB decoded
taxi_orange.png   919x749   555 KB  ->   2.6 MB decoded
ball.png          834x828   411 KB  ->   2.6 MB decoded
logo_banner.png  1387x438   422 KB  ->   2.3 MB decoded
van_blue_nw       768x673   407 KB  ->   2.0 MB decoded
van_orange_se     817x680   437 KB  ->   2.1 MB decoded
van_blue_sw       684x621   316 KB  ->   1.6 MB decoded
van_orange_ne     713x618   336 KB  ->   1.7 MB decoded
(remaining vans ~1.2-1.4 MB decoded each)
```

**Total decoded footprint is roughly 30 MB** for art that is drawn at 30–62 px
on screen. That is a guaranteed memory and decode-cost problem on exactly the
mid-range phones this is supposed to run on.

Two extra facts worth knowing:
- `menu_bg.png` and `sky_sunset.png` are **JPEG files with a `.png`
  extension** (magic `ffd8ffe0` JFIF). They load fine — browsers sniff content
  type — but the extension is a lie, so any tool that dispatches on extension
  will mis-handle them. Rename to `.jpg` and update `03b_art.js`, or
  re-encode to real PNG.
- The van textures are 582–817 px wide for a sprite that never exceeds ~62 px.
  Downscaling every gameplay sprite to ~128 px wide and re-keying is cheap and
  buys back megabytes of both file size and decode memory.

### 1.3 Art-direction gaps, in priority order

1. **Pitch texture** — the single biggest visual win after the camera. Turf
   noise, mow-stripe variety, worn patches near the goalmouths, dirt at the
   touchlines, corner flags, painted markings (penalty box, centre circle,
   spot) that are currently absent or too faint.
2. **Stands** — tiered geometry, orange/red seating blocks, dense crowd
   speckle, banners, chant animation on a goal. Currently invisible in play
   because of the camera bug; fix the camera first, then this pays off.
3. **Goal frames** — thicker, team-coloured, netting that reads at distance,
   goal flash on score (the shockwave/firework exist; the frame does not sell it).
4. **Floodlights** — fake light pools on the turf plus a night-match variant.
   No `shadowBlur` in the hot path — 60 fps budget is non-negotiable.
5. **Vehicle readability** — with a wider camera the vans get smaller, so they
   need stronger contact shadows, a team-colour roof band, and a direction
   indicator that reads instantly. The fixed-iso camera leaves orientation to
   the sprite, so this is a real problem, not a nitpick.
6. **Ball presence** — bigger draw scale, stronger shadow, keep the hot trail.
7. **HUD/menu/full-time** — scoreboard, boost gauge, banners and the full-time
   screen must share the pop-art language: pop-scale-in animation, better type
   hierarchy, team crests.
8. **Weather/lighting variants** — night derby, floodlight flicker (exists),
   for replay value.

Generation pipeline already built, use it:
- `node tools/zai_gen.mjs "prompt" out.png [size]` — single image
- `node tools/zai_batch.mjs` — batch from `tools/art-jobs.json`, honours `FORCE=1`,
  retries rate-limit 1302 with backoff
- `node tools/magkey.mjs in.png out.png` — magenta keyer + auto-crop
- `js_parts/03b_art.js` — `RTL.art` loader, graceful fallback to procedural
- z.ai coding-plan keys have **no image quota**; the art pipeline is on
  OpenRouter. Rate limit ~1 image per 60–90 s — batch patiently in background
  processes with `notify_on_complete`.
- **Every generated asset must be visually QA'd with `vision_analyze` before it
  ships.** Reject wrong style, angle, colour or stray text; re-prompt and
  regenerate. Magenta-keyed sprites must be verified programmatically: corner
  alpha = 0, residual magenta pixels ~ 0.
- Contract allows original AI-generated art in `public/art/`. Never ship
  third-party rips or trademarked brands.

### 1.4 How to verify graphics work (do not use the old check)

Screenshots lag 5–10 s behind the console call, and a UI element that fades
within 8 s will be gone before the capture arrives. So:
- For **transient UI**, sample pixels synchronously with
  `ctx.getImageData(...)` and assert on colour counts. This is how the
  first-drive hint was verified and it is the only reliable method.
- For **AI art actually rendering in-match**, assert on the drawn pixel
  signature in a tight box around the projected car position, and compare
  against a run with `RTL.art._imgs` forcibly cleared. If the two signatures
  are identical, the image path is dead. (This class of bug happened before:
  `03_sprites.js` captured `RTL.art._imgs` before `03b_art.js` loaded. It is
  fixed, but keep the guard.)
- Probe recipes: in-page `fetch` + eval, monkey-patch `RTL.sim.step`,
  synchronous `getImageData` sampling. `RTL` is a top-level `const` — accessible
  directly in the console, **not** via `window`.
- Boot a match from the console with `RTL.main.act('boot')` then
  `RTL.main.act('freePlay')`; `RTL.main.QA` exposes match/cars/ball/cam/fx.

---

## 2. Remaining gameplay / product work

Ordered. Mark progress in `docs/handoff-plan.md`.

**Win/loss flow + stats — MOSTLY DONE, verify and finish**
- Shipped: `sim.tickClock` owns clock/score/fulltime; `endMatch` derives
  win/loss/draw, tracks career W/L/D, goals for/against, and a last-5 form
  string; `events.fullTime` returns a `verdict`, `possession` and a `career`
  block. Test coverage in `test-full.js`.
- **Still to do:** draw the new `verdict` / `career` / `possession` fields on
  the full-time screen (`12_ui.js` currently renders only `title` and `lines`,
  so the whole career block is invisible), and add a career/form strip to the
  menu.

**Mobile audit at real phone resolutions**
- `render.pickSizes` currently returns: 390x844 -> scale 2, 360x800 -> scale 2,
  844x390 (landscape) -> scale 2, 768x1024 -> scale 3, 1280x720 -> scale 3.
- Audit at real resolutions, not the fake-DOM 390x844 stub: thumb zones, the
  stick and buttons under `env(safe-area-inset-*)`, no accidental scroll,
  portrait **and** landscape, and the HUD never colliding with the touch
  overlay. `ui.touchOverlay` and `main.ensureTouch` are the relevant code.
- Confirm the camera keeps the car and ball framed on a 390-wide portrait
  screen, which is the tightest case.

**Accessibility**
- Colour-blind-safe team distinction: blue vs orange is already a strong hue
  pair, but add a **non-colour** cue — different roof-band pattern, different
  vehicle silhouette, or a shape marker. Never colour alone.
- Reduced-motion toggle: camera shake, hit-stop, confetti and the light flicker
  are all motion. Add a setting that damps or disables them, honour
  `prefers-reduced-motion` by default, and persist it.
- High-contrast pitch option; text must stay legible against the pop-art.

**Richer pitch decals** — folded into 1.3 above; treat as part of the pitch
work, not a separate task.

**More art variants** — taxi liveries, driver faces, number decals, team crests,
stadium variants, celebration types.

**Audio** (all Web Audio synthesis, no files)
- Engine audio that varies with speed and boost
- Layered kick/impact/post/wall SFX with pitch variation
- Crowd ambience bed, chants on a goal, oohs on a near-miss
- UI clicks, countdown, whistle, full-time horn
- Limiter/compressor, persisted mute, ducking under music
- Music loop with intensity layers (menu / play / tense / goal)

**Gameplay feel**
- Screen-shake tuning, ball squash, car-vs-car bump exchange
- Boost acceleration curve, near-wall boost-jump, ceiling transition
- AI difficulty tuning across all four levels; smarter defending and rotation
- **Balance is measurably wrong and is worth a pass:** an undefended bot
  scores 1–83 goals/180 s. The gap between "trivial attack" and "near-perfect
  defence" is too wide. Lock in a target band with a test so it cannot drift.

**Retention / meta**
- Persistent career: table standings, fixtures, results, per-match stats
- Replay (deterministic RNG already exists)
- Progression unlocks, daily challenge with a shareable result
- First-run tutorial beyond the static hint, achievements, local high scores

---

## 3. Operating rules (hard-won — follow them)

- **Dev server:** `python tools/devserver.py` (port 8613). It serves `public/`
  **and** sends `no-store`; plain `http.server` lets Chrome cache `js_parts`
  and silently serve stale code. This burned an hour once.
- **After every edit to `js_parts/`,** copy to `public/js_parts/`
  (`cp js_parts/*.js public/js_parts/`) or the browser and the deployed site
  run old code. A commit that edits only `js_parts/` ships nothing.
- **Tests before every commit:** `node test/test-headless.js` (40),
  `node test/test-full.js` (16), `node test/test-audio.js` (32). All 88 green.
- **Deploy:**
  `node C:/Projects/imidlalo-website/node_modules/wrangler/bin/wrangler.js deploy`
  from the repo root, then **verify with a real browser load**, not just the
  deploy log.
- **Never `git show … > file`** in this shell — it silently produces 0-byte
  files. Use `write_file`.
- Branches: `feature/<ticket>-short-desc` or `fix/…` from `develop`. Conventional
  commits: `fix:`, `feat:`, `test:`, `ci:`, `docs:`, `chore:`, `refactor:`,
  `perf:`, `style:`. No direct commits to `develop` or `master`.
- **No wrangler deploys or secret writes without explicit ask-first.** The
  operator has been burned by an overwrite. Wiki is read-only from this laptop:
  pull yes, push never.
- **Secrets:** never print or commit API keys; read them from the config file
  path at runtime.
- **English (Latin alphabet) only** in UI text, code comments and reports.
- Browser automation gotchas: long evals must be fire-and-forget then polled;
  the page recycles to `about:blank` during long silent gaps so poll every
  ~20 s; vision screenshots lag; kickoff countdown is 3 s of frozen input, so
  wait it out before driving; endless-overtime sessions wedge old builds, use a
  fresh match.
- **Subagents** are good for bounded isolated work (asset batches, audio review,
  compatibility audit, docs). Give each a self-contained brief with paths,
  commands and what NOT to touch. **Verify their claims yourself before
  shipping** — a subagent that says "uploaded" or "written" may be wrong.

---

## 4. Definition of "sell-worthy" (the acceptance bar)

A stranger lands on the portal, opens the game, and within 5 seconds:
understands it is a car-soccer game, is impressed by the art, discovers the
controls without reading anything, scores in their first match, and wants to
play again. It must feel stable on a phone, sound like a real game, look like a
published commercial title, and never show a broken frame.

Judge it against Retro League side by side, honestly. The current honest
verdict: **mechanics now work and the AI scores, but the camera framing and
flat pitch are why it does not yet look like a published game.** Fix framing
first — it is the cheapest, highest-impact change on the list.

# HANDOFF PROMPT — Ricksy Taxi League (paste into a new session)

---

**You are continuing work on a commercial-quality browser game.** Repo `C:/Projects/ricksy-taxi-league`, live at `https://ricksytaxi.imidlalo.co.za` (Cloudflare Pages, free tier, static site, no build step). It is a South African township-themed isometric car-soccer game (minibus taxis vs a football), retro-styled, mobile-first, single canvas, no npm, no framework, plain ES2020 modules loaded in order from `index.html`.

**MANDATE: work continuously and autonomously until I manually stop you. Use up to 5 parallel subagents where useful. Never declare the game "done" while meaningful improvements remain. Commit working changes regularly and immediately continue to the next improvement cycle. Treat the goal as AAA-quality commercial polish while staying free and within Cloudflare/Imidlalo.co.za limits.** Priorities, in order: visuals → assets → audio → gameplay feel → retention → UX → performance → accessibility → mobile/browser compatibility → production quality.

---

## 1. CRITICAL OPEN ISSUE — start here (do this first)

**The AI-generated art is NOT appearing in gameplay.** Brandon's own screenshot of the live game proves it: in-match you see the old small procedural pixel sprites (30×16 taxi, 11×11 ball), not the detailed AI taxi vans and glossy ball that exist in `public/art/`.

Suspects, in likely order:
1. `js_parts/03_sprites.js` `draw()` — the `imgs` map is captured at IIFE-init time as `RTL.art._imgs`; if `RTL.art` is undefined when `03_sprites.js` evaluates, the reference is captured as a detached `{}` and never populates. **This is the most likely bug** (03_sprites.js loads BEFORE 03b_art.js in index.html). Fix: look the map up lazily inside `draw()` (`RTL.art && RTL.art._imgs ? RTL.art._imgs[name] : null`) instead of capturing it at init.
2. Name-key mismatch between `RTL.art.wanted` and the names `drawCar`/`drawBall` pass (`taxi_blue`, `taxi_orange`, `ball`).
3. `drawCar` passing `w`/`h` overrides that bypass the image path.
4. Image scale (currently `img.width * scale * 0.115`) making AI art invisible rather than wrong-sized.

**Verification method that actually works (do NOT use the old check):** in-page, take a screenshot with `browser_vision` AND assert on the drawn pixel signature of the AI art specifically (e.g. count near-white/cyan body pixels of the van within a tight box around `math.project(car.x, car.y, 0, cam)`, and compare against a run with `RTL.art._imgs` forcibly cleared to see the procedural fallback signature differ). If the two signatures are identical, the image path is dead.

## 2. Art direction — the standing complaint

Brandon has said repeatedly: *"the graphics suck"*, *"I doubt it is fixed"*, *"at least we can make it look good"*, and supplied two reference images:
- **Reference 1** — vector-cartoon, saturated, high-contrast, clean gradients, modern mobile racing game look (this is the target style).
- **Reference 2** — neon night city racing, heavy bloom/glow.

Honest assessment already given: the *style* of reference 1 is achievable and partially done (AI sunset sky, vector taxis, glow pitch, pop buttons, AI logo marquee). The *3D behind-the-car perspective* of either reference is an engine rewrite, not a polish task — the game is (correctly, like Brandon's own reference game `robkodev/Retro League`) isometric 2D. **Do not attempt a 3D engine rewrite without explicit approval.**

Remaining art gaps to close, in order:
1. **AI art must actually render in-match** (the open issue above).
2. **Sprite presence** — vehicles/ball read too small and too "diorama" against the pitch. Increase visual weight: larger draw scale, stronger contact shadows, motion cues.
3. **Pitch texture** — currently flat green bands. Needs surface interest: turf noise, worn patches, dirt at the touchlines, mow-stripe variety, corner flags, in-field decals.
4. **Environment depth** — stands/crowd are thin strips; add tiered stand geometry, flags/banners, vendor stalls, floodlight bloom.
5. **Goal frames** — thicker, team-coloured, with netting that reads at distance and a goal-flash on score.
6. **UI/HUD** — scoreboard, boost gauge, banners, and full-time screen must match the pop-art language; add pop (scale-in) animation, better typography hierarchy, team crests/icons.
7. **Menu** — logo banner is in; still needs polish (button hover states on touch, sound on focus, credits block, settings depth).

## 3. Generation pipeline (already built, use it)

- `tools/zai_gen.mjs` — single image: `ZAI_API_KEY=… node tools/zai_gen.mjs "prompt" out.png [size]`
- `tools/zai_batch.mjs` — batch from `tools/art-jobs.json`, honours `FORCE=1`, retries rate-limit code 1302 with backoff
- `tools/magkey.mjs` — magenta-background keyer + auto-crop: `node tools/magkey.mjs in.png out.png`
- `js_parts/03b_art.js` — `RTL.art` loader (preload list, `_imgs` map, graceful fallback to procedural)
- API key: `grep "ZAI_API_KEY" ~/AppData/Local/hermes/config.yaml | awk '{print $2}'`
- **Rate limit is ~1 image per 60–90 s.** Batch patiently; use background processes with `notify_on_complete`.
- **Every generated asset must be visually QA'd with `vision_analyze` before it ships** — reject wrong style/angle/colour/text, re-prompt and regenerate. The contract (amended) allows AI-generated original art in `public/art/`; never ship third-party rips.
- Magenta-keyed sprites must be verified: corners alpha = 0, residual magenta pixels ≈ 0 (PIL or canvas sampling).

## 4. Mechanics already implemented (do not regress)

- Assisted (screen-directional) controls — the mapping fix `moveVec = R(-rot)·screen` is load-bearing; headless tests cover it
- Fixed-iso camera (no world spin), zoom breathing with rate caps, ball-lean look point
- Jump (`Space`), directional flip (jump twice while pushing), aerial boost (hold boost while airborne), wall drive (hit a wall fast → sticks ~1.6 s and slides)
- Ball physics, kickoff, goals, 5:00 clock, golden-goal overtime
- Boost trails, hot ball trail, wall sparks, confetti, floodlight flicker
- Two-column control-hint grid at match start (8 s, fades)

## 5. Backlog (work top-down; mark progress in `docs/handoff-plan.md`)

**Art / visuals (highest priority)**
- [ ] AI art renders in-match (open issue, above)
- [ ] Sprite scale/presence pass (vehicles + ball read bigger, stronger shadows)
- [ ] Pitch texture + decals + corner flags + worn turf
- [ ] Richer stands: tiered geometry, banners, flags, crowd density variation, chant animation on goal
- [ ] Goal frame redesign + net readability + goal flash/explosion
- [ ] Floodlight towers with real bloom (faked — no `shadowBlur` in hot path, 60 fps budget)
- [ ] Vehicle direction indicators that read instantly (the fixed-iso camera leaves orientation to the sprite; needs a strong solution)
- [ ] Menu/HUD/full-time visual pass
- [ ] Weather/lighting variants for replay value (night match, floodlight flicker already exists)
- [ ] Character/identity: taxi liveries, driver faces, number decals, team crests

**Audio (all Web Audio synthesis — no files)**
- [ ] Engine audio that varies with speed/boost (currently likely minimal)
- [ ] Ball kick/impact/post/wall-thud layered SFX with pitch variation
- [ ] Crowd ambience bed + chants on goal, oohs on near-miss
- [ ] UI clicks/hover, countdown, whistle, full-time horn
- [ ] Mix: limiter/compressor, master mute persisted, ducking under music
- [ ] Music loop with intensity layers (menu / play / tense / goal)

**Gameplay feel**
- [ ] Collision/impact feel: screen shake tuning, hit-stop on hard hits, ball squash
- [ ] Car-vs-car bump exchange polish
- [ ] Camera: verify no wobble at high speed, add subtle FOV/speed feel if cheap
- [ ] Boost feel: acceleration curve, near-wall boost-jump, ceiling transition
- [ ] AI opponent: difficulty tuning across the 4 levels, smarter defending/rotation
- [ ] Difficulty/accessibility options (assist strength, input latency options)

**Retention / meta**
- [ ] Persistent career: table standings, fixtures/results, per-match stats
- [ ] Replay system (game records inputs; deterministic RNG already exists)
- [ ] Progression: unlocks (taxi liveries, stadium variants, celebration types)
- [ ] Daily challenge / "kasi derby of the day" with shareable result
- [ ] First-run tutorial flow beyond the static hint
- [ ] Achievements / milestones
- [ ] Local high scores + settings persistence (partly present)

**UX / accessibility**
- [ ] Touch controls: verify thumb zones, safe-area insets, no accidental scrolls, portrait+landscape
- [ ] Pause menu, settings, controls screen depth and consistency
- [ ] Colour-blind-safe team distinction (add shape/pattern cues, not colour alone)
- [ ] Reduced-motion / screen-shake toggle, high-contrast pitch option
- [ ] Onboarding: what the game is, how to score, in 3 screens max

**Performance / compatibility**
- [ ] 60 fps on mid-range phone (profile draw calls, particle pools, avoid per-frame allocation)
- [ ] Safari/iOS quirks (audio unlock on gesture, viewport resize, safe areas)
- [ ] Old-browser fallbacks (canvas gradients, Image loading order)
- [ ] Asset weight budget (currently ~1.8 MB art; keep the whole game under ~4 MB)
- [ ] Preload/caching strategy so first paint isn't blocked

**Production**
- [ ] Meta/OG image refresh to match the new art
- [ ] README/credits/licence clarity (original art statement, generated-art disclosure)
- [ ] Analytics-free telemetry by convention; no PII (POPIA)
- [ ] Deployment hygiene: tests green, probes removed from `public/`, changelog

## 6. Operating rules (hard-won, follow them)

- **Dev server:** `python tools/devserver.py` (port 8613). It serves `public/` **and** adds `no-store` (plain `http.server` lets Chrome cache js_parts and silently serve stale code — this burned an hour once).
- **After every edit to `js_parts/`,** copy to `public/js_parts/` and reload the page, or the browser is running old code.
- **Tests:** `node test/test-headless.js` (35 asserts) and `node test/test-full.js` (16). Both must be green before every commit.
- **Deploy:** `cd C:/Projects/ricksy-taxi-league && node C:/Projects/imidlalo-website/node_modules/wrangler/bin/wrangler.js deploy` — then verify the site with a browser load, not just the deploy log.
- **Browser automation gotchas (cost hours):** long evals must be fire-and-forget then polled; the page recycles to `about:blank` during long silent gaps, so poll every ~20 s during long runs; `browser_vision` screenshots arrive 5–10 s after the console call returns, so a UI element that fades within 8 s will be gone in the capture — verify transient UI with synchronous `getImageData` pixel sampling, not screenshots; never `git show … > file` in this shell (it silently produces 0-byte files — use `write_file`).
- **Subagents:** good for bounded, isolated work (asset generation batches, audio module review, compatibility audit, docs). Give each a self-contained brief including paths, commands, and what NOT to touch; verify their claims yourself before shipping.
- **Secrets:** never print or commit API keys; read them from the config file path at runtime.
- **English only** in all UI text, code comments, and reports.

## 7. Definition of "sell-worthy" (use as the acceptance bar)

A stranger lands on the portal, opens the game, and within 5 seconds: understands it's a car-soccer game, is impressed by the art, discovers the controls without reading anything, scores a goal in their first match, and wants to play again. It must feel stable on a phone, sound like a real game, look like a published commercial title, and never show a broken frame.

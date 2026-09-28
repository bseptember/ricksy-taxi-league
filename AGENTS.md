# AI Operating Manual — ricksy-taxi-league

Permanent behavioural rules for any AI coding assistant working in this repo.

## Session initialization

- Read this file, `README.md`, and `docs/CONTRACT.md` (the frozen module contract).
- Inspect recent commits: `git log --oneline -10`.

**The implementation is the source of truth.** When docs and code disagree, trust
the code and fix the docs.

## Architecture invariants (do not break)

1. **No build step.** Plain ES2020 files in `js_parts/` loaded in numeric order by
   `public/index.html`. No npm, no bundler, no framework.
2. **One namespace.** Every module attaches to the global `RTL` object
   (`RTL.sim`, `RTL.ai`, `RTL.render`, ...). No import/export syntax.
3. **The contract is frozen.** Entity shapes and module APIs live in
   `docs/CONTRACT.md`. Changing a signature = deliberate contract version bump,
   documented in that file, plus test updates.
4. **Sim is pure.** `06_sim.js` may only use `RTL.C`, `RTL.mathx`, `RTL.world`.
   No DOM, canvas, audio, localStorage, or clock access. The match CLOCK belongs
   to `13_main.js` (sim never touches `match.t`).
5. **Audio can never break gameplay.** Every entry point in `04_audio.js` is
   try/catch'd; audio failures are silent no-ops. Keep it that way.
6. **Persistence only via `RTL.main.save()/load()`** (localStorage key in
   `C.SAVE_KEY`). Modules never touch localStorage directly.
7. **Determinism.** All stochastic code takes an `rng` function parameter. Match
   replays in the test harness depend on this.
8. **English (Latin alphabet) only** in code, comments, UI copy, and docs.

## Dev loop

```bash
cd /c/Projects/ricksy-taxi-league
node test/test-headless.js   # must be 31 PASS / 0 FAIL
node test/test-full.js       # must be 16 PASS / 0 FAIL
cp js_parts/*.js public/js_parts/   # sync before browser testing
```

Serve `public/` with any static server for browser checks. The headless tests
must pass BEFORE any commit; if you changed physics/AI behaviour, extend the
headless tests to cover it.

## Sprite/render rules

- Sprites are string maps in `03_sprites.js`; palette chars map through `PAL`.
  `sprScale(cam, k)` converts metres→pixel scale — do not hardcode pixel sizes
  in render; derive from camera zoom so zoom changes stay coherent.
- `09_render.js` draws NO text (UI module owns all text).
- Performance: no ctx.shadowBlur, no per-frame allocations in hot loops.

## Git

- Commits: `<type>: <imperative summary>` (feat/fix/test/docs/chore/refactor/perf/style).
- This repo deploys straight from its default branch via wrangler — treat every
  commit as deployable.

## Deploy

```bash
node C:/Projects/imidlalo-website/node_modules/wrangler/bin/wrangler.js deploy
```

Custom domain lives in `wrangler.jsonc` (`ricksytaxi.imidlalo.co.za`). After
deploy, verify the live URL loads and the OG image resolves.

## Security

- No secrets, keys, tokens, or hardcoded credentials (the repo has none and
  should never gain any — it's a static client-only game).
- No external runtime requests (fonts self-hosted, no CDNs).

## Before claiming done

- Both test suites green.
- Browser check: menu → match → drive → score → full time (at minimum, boot + drive).
- `public/js_parts/` synced with `js_parts/`.
- No secrets in staged files.

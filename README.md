# Ricksy Taxi League

Retro pixel isometric car-soccer, Mzansi style. Drive a minibus taxi, carry the
ball on the roof, bang goals in the 5-minute kasi derby.
**Live at [ricksytaxi.imidlalo.co.za](https://ricksytaxi.imidlalo.co.za)** — part of the
[iMidlalo](https://imidlalo.co.za) arcade.

100% original code, pixel art and audio. Inspired by the car-soccer genre
(Rocket League, and robkodev's itch.io Retro League for the assisted-control
idea) — no assets or code copied from either.

## Play

| Action | Desktop | Mobile |
|---|---|---|
| Drive | W/S or Up/Down | left stick |
| Steer | A/D or Left/Right | left stick |
| Jump / double-jump / flip | SPACE (tap, tap again) | JUMP button |
| Boost | SHIFT or Left Mouse | BOOST button |
| Shoot | F | SHOT button |
| Carry the ball | C (hold) | CARRY button |
| **Camera: CAR / BALL / TUNNEL** | **B** | CAM button |
| Pause | P or ESC | II button |

Match: 5:00, AMANDLA FC (you, blue) vs IBHOKISI FC (AI, orange) in four
difficulties — RELAXED, CASUAL, SHARP, NEURAL. Golden goal in overtime.
Free Play mode for an open pitch.

## Tech

- Zero build step, zero npm, zero asset files. 13 plain ES2020 modules in
  `js_parts/`, loaded in order by `public/index.html`, one shared `RTL` namespace.
- Fixed-timestep simulation (120 Hz) + rAF rendering with camera damping.
- All sprites are hand-authored string-map pixel art baked to offscreen canvases.
- All audio is Web Audio synthesis (14 SFX + generative music states).
- Deterministic matches via seeded mulberry32 RNG — the headless harness replays them.
- No backend, no tracking, no external requests at runtime (font is self-hosted).

## Dev

```bash
# serve public/ on any static server, e.g.
cd public && python -m http.server 8124

# run all tests (node, no browser needed)
node test/test-headless.js   # physics/AI/match sim: 31 tests
node test/test-full.js       # sprites/render/camera/audio smoke: 16 tests
```

After editing `js_parts/*.js`, copy to `public/js_parts/` (deploy serves `public/`).

## Deploy

Cloudflare Worker static assets, custom domain in `wrangler.jsonc`:

```bash
node C:/Projects/imidlalo-website/node_modules/wrangler/bin/wrangler.js deploy
```

## Docs

- [DESIGN.md](DESIGN.md) — game design: feel, mechanics, theme, tuning tables.
- [AGENTS.md](AGENTS.md) — operating manual for AI assistants working in this repo.
- [docs/CONTRACT.md](docs/CONTRACT.md) — frozen module contract (entity shapes, APIs).

# RICKSY TAXI LEAGUE — design document

## Fantasy & feel

Saturday morning in the kasi. Two minibus taxis, one ball, one pitch, and the
whole street watching from the stands. The feel target is **arcade boxy momentum**:
taxis are heavy but snappy, the ball is light and bouncy, and every kickoff is a
scramble. Sessions are short — one 5-minute derby — and the Assisted control mode
means a first-time player is scoring carry-shots within a minute.

## The OG feature set this game mirrors (mechanics-equivalent, original implementation)

- Isometric retro pixel pitch, 5:00 match clock, blue vs orange.
- **Two control philosophies**: ASSISTED (the car helps you aim, carry and fly —
  touch always plays this) and CLASSIC (full manual, tank-style, no aids).
- **Carry**: hold C near the ball to balance it on the roof; the longer you carry,
  the harder the shot fires. The signature "I'm cooking" moment.
- **Shot** (F): tap to pop the ball goalward when close; from a carry it becomes a
  aimed strike with power scaling 18→34 m/s.
- **Boost** starting at 34/100, pads on the pitch (small +12, big full refill).
- **Jump / double-jump / flip** (SPACE chain): flips give a 13 m/s impulse.
- **Ball guides** (on by default): pulsing landing marker + trail — readable for
  beginners, information for pros.
- **Cameras**: CAR (default, follows heading with look-ahead), BALL (camera sits
  opposite the ball — the Rocket League classic), TUNNEL (high wide tactical view).
  Cycle with B.
- Free play (open pitch) and 1v1 match vs AI.

## What we added that the OG doesn't have (Mzansi identity)

- Minibus taxis instead of RC cars; AMANDLA FC vs IBHOKISI FC.
- SA hype copy: SHOOO! / BANGER! / TBAGRA! banners on hard shots.
- Load-shedding floodlight flicker on some kickoffs (deterministic per seed).
- Fake-SA advertising boards: Sipho's Spaza, Lazarus Shisanyama, Fontooweb,
  Airtime 4 Less, Nandoz Flame Grill.
- Generative amapiano-adjacent menu music, driving match loop, tense overtime loop.
- Family-friendly by design: no crime/violence framing anywhere.

## Tuning tables (all in `js_parts/01_constants.js`)

| Car | Value |
|---|---|
| Max speed / boost max | 24 / 34 m/s |
| Accel (+boost) | 26 (+20) m/s² |
| Turn rate low→top speed | 2.6→1.35 rad/s |
| Jump / double-jump | 8.2 / 6.4 m/s up |
| Flip impulse | 13 m/s, 0.65 s |
| Boost burn | 33/s |
| Carry range / hold / max | 2.6 m / roof height 1.9 m / 6 s then pop |

| Ball | Value |
|---|---|
| Radius / gravity | 0.35 m / 22 m/s² |
| Bounce (vertical/wall) | 0.62 / 0.72 |
| Drag / roll friction | 0.30/s / 0.62 retained |
| Max sane speed | 46 m/s |

| AI difficulty | noise | speed cap | boost | aerial | flip |
|---|---|---|---|---|---|
| RELAXED (BOET) | ±7 m | 55% | no | no | no |
| CASUAL (TSHAMI) | ±3 m | 75% | yes | no | no |
| SHARP (BRA H) | ±1.2 m | 92% | yes | yes | no |
| NEURAL (UMNUZ) | ±0.3 m | 100% | yes | yes | yes |

## Match flow

`menu → matchSetup (difficulty + control style) → countdown 3-2-1 → play →
GOAL (2.6 s freeze + banner + chant) → kickoff … → FULL TIME (or GOLDEN GOAL in
overtime) → stats screen (shots / top carry / demos / saves) → rematch or menu`.

## Camera maths

`11_camera.js`: camera position = look-point − offset, look-point damped at
6.5/s. CAR cam looks 4.5 m ahead of the car's velocity direction (anchor 58%
screen height); BALL cam sits on the line from ball through car at 15.5 m
(anchor 52%); TUNNEL locks a 46 m high orbit. Zoom = preset × (canvas width /
1264) − up to 18% speed zoom-out. Screen shake 0.4 s on goals, 0.3 s on demos.

## Performance budget (target: 60 fps on a mid phone)

- Single canvas, integer pixel scaling, `imageSmoothingEnabled = false`.
- No `shadowBlur`, no per-frame allocations in the render hot path (scratch
  objects reused), fx particles pooled (220 cap), ball trail fixed at 22 points.
- AI thinks at 30 Hz, sim runs fixed 120 Hz with ≤8 catch-up steps per frame.
- Audio is fully synthesized (no decode), music scheduler runs on setInterval.

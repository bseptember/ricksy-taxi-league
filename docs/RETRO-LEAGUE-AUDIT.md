# RETRO LEAGUE — FEATURE AUDIT (from live play, 28 Sep 2026)
Source: played https://robkodev.itch.io/retro-league (v0.8.3) — every tab, match, mechanic.

## RENDER / CAMERA
- 2.5D: flat pixel sprites, FIXED isometric camera (never rotates in his base game).
- World drawn on one canvas; ~14 canvases total (layers).
- Ball has a ground shadow; height simulated (ball scales up when airborne).
- Ball leaves a dashed trail when it moves fast. Cars leave tyre skid marks.
- Direction ARROWS above cars: blue arrow = you, orange arrow = AI (huge readability aid).
- Big THROW-STYLE ring shadow under the ball when airborne.
- Pitch: FIFA-proportioned, mow stripes, full markings (circle, boxes, spots).
- Goal: NET drawn diagonally (isometric), net squares big and readable; frame at both ends.
- Crowd: multicolour pixel crowd in stands around the whole pitch.
- Boost pads: small cones/pads scattered in a grid; picked up = refill.
- Pixel size setting: Fine/Classic/Chunky (render scale).

## HUD (in match)
- Top-centre scoreboard: [BLUE 0] [4:50] [ORANGE 0] + labels underneath: YOU / CASUAL / BOT.
- Bottom-right: circular BOOST gauge "33 BST" (ring style, number inside).
- Bottom-left (free play): "SHOT READY — Tap F to shoot" hint panel.
- Top-right (free play): "SERVE A BALL" panel with 4 options:
  ↑ Carry 1 · ↓ High 3 · ← Pass 2 · → In front 4
- Scoreboard label under score: "YOU" vs "BOT" + difficulty name (CASUAL etc).
- Footer: version, credits, input mode, key hints (P pause · M sound).

## SETTINGS (exact)
- Sound: ON toggle · Effects: ON toggle
- Ball guides: ON toggle (landing marker — ON by default)
- Unlimited boost in Free play: ON toggle
- Sound effects slider · Music slider
- On-screen controls: OFF toggle (mobile)
- Stick deadzone slider · Stick sensitivity slider
- Pixel size: Fine / Classic / Chunky

## CONTROLS (exact, keyboard; controller also supported)
- Move up W/UP · Move down S/DOWN · Move left A/LEFT · Move right D/RIGHT
- Jump SPACE/RMB · Shot F · Carry C · Boost LMB · Fly G · Brake V
- Rebindable ("Select an action, then press a key") + Reset keys button
- Controller tab with full gamepad mapping

## GAME MODES
- Free play (open pitch, Enter) — ball server, unlimited boost option
- Play match: 1v1 vs AI
  - MATCH: Casual (Unrated) · Relaxed AI · Neural AI · Ranked (AI rating 1000, saved)
- Play online (experimental, 1v1)

## CONTROL STYLES
- ASSISTED (experimental): "Push where you want to go. Touch always plays this."
  "The car helps you aim, carry and fly." Directional movement (W = up-screen etc.).
- CLASSIC: "Full control · tank steering, no aids."

## MECHANICS (observed live)
- Assisted move: car moves in screen directions (like twin-stick), NOT tank rotate.
- JUMP: hop; can chain.
- FLY (G): assisted aerial — car flies toward the ball, consumes boost (33→13 observed).
- CARRY (C): ball latches and rides the roof; then F shoots it (shot speed from carry).
- SHOT (F): also a tap-shot when ball near (front cone) without carry.
- SERVE modes (free play): Carry 1 / Pass 2 / High 3 / In front 4 — ball served to you
  in different ways to practise.
- Boost: starts 33; pads on pitch refill; unlimited toggle in free play.
- Goals: NET crossings detected with GOAL! banner + "BLUE SCORES · 50 KM/H" speed line.
- Ball trails + skid marks; confetti/blast particles on goals.
- Full time, rematch flow; ranked rating saved locally.

## WHAT OUR BUILD ALREADY HAS (parity)
[x] 2.5D fixed iso, pixel sprites, ball shadow, height sim
[x] Boost pads, 33 start, boost gauge
[x] Carry + shot, jump, walls, goals, AI (4 diffs), 5:00 matches, overtime
[x] Ball guides (landing marker), free play + match, sound/music toggles
[x] Scoreboard, touch controls

## GAPS TO IMPLEMENT (this task)
1. ASSISTED screen-directional controls (W = up-screen ALWAYS, not car-relative).
   Classic = tank steering (car-relative). Toggle in menu. (We have this backwards:
   our "steer" is tank-style in both.) — THE BIG FEEL FIX.
2. FLY key (G): assisted fly toward ball, boost-consuming.
3. Direction arrows above both cars (blue/orange triangles).
4. Ball dash-trail + car skid marks.
5. SERVE panel in free play (Carry 1/High 3/Pass 2/In front 4).
6. "Unlimited boost in Free play" setting.
7. Settings: pixel size Fine/Classic/Chunky; deadzone+sensitivity sliders; rebindable keys (can defer rebind).
8. HUD: circular boost gauge; YOU/CASUAL/BOT labels under scoreboard; "SHOT READY" hint.
9. Goal banner with speed line ("BLUE SCORES · 50 KM/H").
10. Ball dash-trail on fast movement (separate from landing guide).

## CAMERA (the son's request — AFTER like-for-like)
- Ball cam: world rotates so ball is up-screen (implemented, limited-rate).
- Car cam: world rotates so car heading is up-screen (implemented).
- Base game (like-for-like stage): FIXED iso, no rotation.

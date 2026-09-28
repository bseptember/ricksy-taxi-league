/* ==========================================================================
   RICKSY TAXI LEAGUE — 05_world.js
   Pitch geometry: bounds, walls (boards), goals, floodlights, crowd seeds.
   Pure data + geometry queries. No drawing (render owns that), no physics.
   ========================================================================== */
"use strict";

RTL.world = (function (C, m) {
  /* Blue defends y=0 goal, attacks y=105. Orange the reverse.
     Goal mouth centred on x=34. */
  const GOAL_HALF = C.GOAL_WIDTH / 2;
  const GOAL_CX = C.PITCH_W / 2;

  /** goal key for the goal a team ATTACKS (scores in). */
  function attackGoal(team) { return team === "blue" ? { y: C.PITCH_H, side: "orange" } : { y: 0, side: "blue" }; }
  /** goal key a team DEFENDS. */
  function defendGoal(team) { return team === "blue" ? { y: 0, side: "blue" } : { y: C.PITCH_H, side: "orange" }; }

  /** Is the ball centre fully across a goal line inside the mouth? team = attacking team. */
  function isInsideGoal(x, y, z, team) {
    if (Math.abs(x - GOAL_CX) > GOAL_HALF - C.BALL_RADIUS) return false;
    if (z > C.GOAL_HEIGHT - C.BALL_RADIUS * 0.5) return false;
    if (team === "blue") return y >= C.PITCH_H;
    return y <= 0;
  }

  /** Clamp an entity circle to the pitch boards. Returns {hitWall, nx, ny} with
      normal pointing back into play. Goals mouths are OPEN (no wall inside mouth
      below crossbar height so the ball can enter; above crossbar it's walled). */
  function clampToPitch(x, y, z, r) {
    let hit = false, nx = 0, ny = 0;
    const inGoalMouthX = Math.abs(x - GOAL_CX) < GOAL_HALF;

    // side walls (X)
    if (x - r < 0) { x = r; nx = 1; hit = true; }
    else if (x + r > C.PITCH_W) { x = C.PITCH_W - r; nx = -1; hit = true; }

    // end walls (Y) — solid unless within goal mouth and below crossbar
    const belowBar = z < C.GOAL_HEIGHT;
    if (y - r < 0) {
      if (inGoalMouthX && belowBar) { /* open: goal mouth (deep run handled by sim goal check) */ }
      else { y = r; ny = 1; hit = true; }
    } else if (y + r > C.PITCH_H) {
      if (inGoalMouthX && belowBar) { /* open */ }
      else { y = C.PITCH_H - r; ny = -1; hit = true; }
    }
    return { x, y, hitWall: hit, nx, ny };
  }

  /** boost pad positions (small pads on a grid, 6 big pads mid-symmetry) */
  function boostPads() {
    const pads = [];
    const small = [
      [12, 18], [22, 30], [46, 30], [56, 18], [12, 87], [22, 75], [46, 75], [56, 87],
      [34, 26], [34, 79], [10, 52.5], [58, 52.5],
    ];
    small.forEach(([x, y]) => pads.push({ x, y, big: false, active: true, t: 0 }));
    const big = [[34, 14], [34, 91], [20, 52.5], [48, 52.5], [34, 52.5], [8, 30], [60, 75]];
    big.forEach(([x, y]) => pads.push({ x, y, big: true, active: true, t: 0 }));
    return pads;
  }

  /** decorative props (deterministic) — floodlights, billboards, trees, cones */
  function props() {
    const props = [];
    // floodlight towers at 4 corners
    [[-6, -6], [C.PITCH_W + 6, -6], [-6, C.PITCH_H + 6], [C.PITCH_W + 6, C.PITCH_H + 6]]
      .forEach(([x, y], i) => props.push({ kind: "floodlight", x, y, id: i }));
    // billboards along both touchlines (ad boards) — 3 per side, spaced
    const bb = C.BILLBOARDS;
    for (let i = 0; i < 3; i++) {
      props.push({ kind: "billboard", name: bb[i % bb.length].name, x: 14 + i * 18, y: -1.8, id: i });
      props.push({ kind: "billboard", name: bb[(i + 3) % bb.length].name, x: 14 + i * 18, y: C.PITCH_H + 1.8, id: i + 6 });
    }
    // trees + benches + cones around the outside
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? -1 : 1;
      const x = 4 + m.hash(i * 7 + 1) * (C.PITCH_W - 8);
      const y = side < 0 ? -9 - m.hash(i * 13) * 8 : C.PITCH_H + 9 + m.hash(i * 13) * 8;
      props.push({ kind: "tree", x, y, id: 20 + i, v: m.hash(i * 3) });
    }
    [[4, 30], [4, 75], [64, 30], [64, 75]].forEach(([x, y], i) =>
      props.push({ kind: "bench", x, y, id: 40 + i }));
    [[2, 10], [66, 10], [2, 95], [66, 95]].forEach(([x, y], i) =>
      props.push({ kind: "cone", x, y, id: 50 + i }));
    return props;
  }

  /** crowd: deterministic seat pattern for the renderer (rows of colour indices) */
  function crowdPattern() {
    const rows = [];
    for (let r = 0; r < 26; r++) {
      const row = [];
      for (let s = 0; s < 120; s++) {
        const h = m.hash(r * 131 + s * 7);
        row.push(Math.floor(h * C.COLORS.crowd.length));
      }
      rows.push(row);
    }
    return rows;
  }

  return { GOAL_CX, GOAL_HALF, attackGoal, defendGoal, isInsideGoal, clampToPitch, boostPads, props, crowdPattern };
})(RTL.C, RTL.mathx);

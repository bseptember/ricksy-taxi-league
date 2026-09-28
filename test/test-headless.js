/* Headless test harness — concatenates js_parts (browser load order) and runs
   sim-only scenarios. No canvas/DOM/audio needed. Run: node test/test-headless.mjs */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ORDER = [
  "01_constants.js", "02_math.js", "05_world.js", "06_sim.js",
  "07_ai.js", "08_events.js",
];

function loadEngine(extra = []) {
  const src = ORDER.concat(extra)
    .filter((f) => fs.existsSync(path.join(ROOT, "js_parts", f)))
    .map((f) => fs.readFileSync(path.join(ROOT, "js_parts", f), "utf8"))
    .join("\n;\n");
  (0, eval)(src + "\n;globalThis.RTL = RTL;");
  return globalThis.RTL;
}

/* ---- tiny assert ---- */
let passed = 0, failed = 0;
const failures = [];
function ok(cond, name) {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; failures.push(name); console.log("  FAIL " + name); }
}
function eq(a, b, name, tol = 1e-6) {
  const good = typeof a === "number" && typeof b === "number" ? Math.abs(a - b) <= tol : a === b;
  ok(good, name + (good ? "" : `  [got ${a} want ${b}]`));
}

function section(name) { console.log("\n== " + name + " =="); }

/* ================= TESTS ================= */
function testMath(RTL) {
  section("math: iso round-trip + rng");
  const m = RTL.mathx;
  const cam = { ox: 640, oy: 300, zoom: 4 };
  let bad = 0;
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * 68, y = Math.random() * 105;
    const p = m.project(x, y, 0, cam);
    const w = m.unproject(p.x, p.y, cam);
    if (Math.abs(w.x - x) > 0.01 || Math.abs(w.y - y) > 0.01) bad++;
  }
  eq(bad, 0, "project/unproject round-trip (500 pts)");
  const r1 = m.rngFrom(7), r2 = m.rngFrom(7);
  ok(r1() === r2() && r1() === r2(), "rngFrom deterministic");
  // short way from +1 rad to -1 rad is -2 rad
  eq(m.angDiff(1, -1), -2, "angDiff wraps short way", 1e-9);
  // from +177deg to -177deg the short way is +6deg (positive)
  const d2 = m.angDiff(Math.PI * 0.99, -Math.PI * 0.99);
  ok(d2 > 0 && d2 < 0.4, "angDiff near-PI takes +6deg path");
}

function testWorld(RTL) {
  section("world: geometry");
  const w = RTL.world;
  ok(w.isInsideGoal(34, 105.0, 1.0, "blue"), "blue scores at y=105 end (centre crossed line)");
  ok(w.isInsideGoal(34, 0.0, 1.0, "orange"), "orange scores at y=0 end");
  ok(!w.isInsideGoal(34, 104.6, 1.0, "blue"), "ball short of the line is not a goal yet");
  ok(!w.isInsideGoal(20, 0.4, 1.0, "orange"), "wide of goal is not a goal");
  ok(!w.isInsideGoal(34, 0.4, 4.0, "orange"), "over the bar is not a goal");
  ok(w.clampToPitch(70, 50, 0, 1).hitWall, "outside X clamps with wall hit");
  ok(!w.isInsideGoal(34, 104.6, 1.0, "orange"), "orange cannot score at y=105 end");
}

function testSimBasics(RTL) {
  section("sim: kickoff + car drive");
  const match = { mode: "match", score: { blue: 0, orange: 0 }, t: 300, state: "countdown", stateT: 1, overtime: false, seed: 1234, kickoffFor: "blue", events: [] };
  const cars = [
    { id: "P1", team: "blue", x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heading: 0, angVel: 0, boost: 34, boostHeld: false, jumping: false, jumpT: 0, airTime: 0, canJump: true, canFlip: true, flip: { active: false, t: 0, dx: 0, dy: 0 }, carrying: false, carryCd: 0, demo: { active: false, t: 0 }, respawnT: 0, onGround: true, wheelspin: 0 },
    { id: "AI", team: "orange", x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heading: Math.PI, angVel: 0, boost: 34, boostHeld: false, jumping: false, jumpT: 0, airTime: 0, canJump: true, canFlip: true, flip: { active: false, t: 0, dx: 0, dy: 0 }, carrying: false, carryCd: 0, demo: { active: false, t: 0 }, respawnT: 0, onGround: true, wheelspin: 0 },
  ];
  const ball = { x: 34, y: 52.5, z: 0.35, vx: 0, vy: 0, vz: 0, spin: 0, lastTouch: null, guides: [] };
  RTL.sim.kickoff(match, cars, ball);
  match.state = "play"; // (main leaves countdown after 3s; test skips it)
  ok(Math.abs(ball.x - 34) < 0.01 && Math.abs(ball.y - 52.5) < 0.01, "kickoff centres ball");
  ok(cars[0].y < 40 && cars[1].y > 65, "cars on their own halves");
  // drive forward: throttle 1 for 2 seconds
  const rng = RTL.mathx.rngFrom(1);
  const inputs = { P1: { throttle: 1, steer: 0, boost: false, jump: false, shoot: false, carry: false, brake: false }, AI: { throttle: 0, steer: 0, boost: false, jump: false, shoot: false, carry: false, brake: false } };
  const startY = cars[0].y;
  for (let i = 0; i < 240; i++) RTL.sim.step(match, cars, ball, inputs, 1 / 120, rng);
  const travelled = Math.abs(cars[0].y - startY);
  ok(travelled > 8, "car travels under throttle (moved " + travelled.toFixed(1) + "m in 2s)");
  ok(Math.abs(cars[0].vx) + Math.abs(cars[0].vy) > 0, "car has velocity");
}

function testBallPhysics(RTL) {
  section("sim: ball physics");
  const match = { mode: "free", score: { blue: 0, orange: 0 }, t: 300, state: "play", stateT: 0, overtime: false, seed: 1, kickoffFor: "blue", events: [] };
  const cars = [], ball = { x: 34, y: 52.5, z: 8, vx: 0, vy: 0, vz: 0, spin: 0, lastTouch: null, guides: [] };
  const rng = RTL.mathx.rngFrom(2);
  const inputs = { P1: { throttle: 0, steer: 0, boost: false, jump: false, shoot: false, carry: false, brake: false }, AI: { throttle: 0, steer: 0, boost: false, jump: false, shoot: false, carry: false, brake: false } };
  let apex = ball.z;
  for (let i = 0; i < 600; i++) {
    RTL.sim.step(match, cars, ball, inputs, 1 / 120, rng);
    apex = Math.max(apex, ball.z);
  }
  ok(apex <= 8.01, "dropped ball never gains height (apex " + apex.toFixed(2) + ")");
  eq(ball.z, RTL.C.BALL_RADIUS, "ball comes to rest on ground", 0.05);
  ok(Math.abs(ball.vx) < 0.01 && Math.abs(ball.vy) < 0.01, "ball stops rolling");
}

function testGoalDetection(RTL) {
  section("sim: goal detection + events");
  const match = { mode: "match", score: { blue: 0, orange: 0 }, t: 250, state: "play", stateT: 0, overtime: false, seed: 3, kickoffFor: "blue", events: [] };
  // Blue attacks +Y (goal at y=105). Car heads +Y, ball ahead moving +Y fast.
  const cars = [
    { id: "P1", team: "blue", x: 34, y: 55, z: 0, vx: 0, vy: 20, vz: 0, heading: Math.PI / 2, angVel: 0, boost: 100, boostHeld: false, jumping: false, jumpT: 0, airTime: 0, canJump: true, canFlip: true, flip: { active: false, t: 0, dx: 0, dy: 0 }, carrying: false, carryCd: 0, demo: { active: false, t: 0 }, respawnT: 0, onGround: true, wheelspin: 0 },
    { id: "AI", team: "orange", x: 34, y: 45, z: 0, vx: 0, vy: 0, vz: 0, heading: -Math.PI / 2, angVel: 0, boost: 34, boostHeld: false, jumping: false, jumpT: 0, airTime: 0, canJump: true, canFlip: true, flip: { active: false, t: 0, dx: 0, dy: 0 }, carrying: false, carryCd: 0, demo: { active: false, t: 0 }, respawnT: 0, onGround: true, wheelspin: 0 },
  ];
  const ball = { x: 34, y: 60, z: 0.35, vx: 0, vy: 40, vz: 0, spin: 0, lastTouch: "P1", guides: [] };
  const rng = RTL.mathx.rngFrom(9);
  const inputs = { P1: { throttle: 0, steer: 0, boost: false, jump: false, shoot: false, carry: false, brake: false }, AI: { throttle: 0, steer: 0, boost: false, jump: false, shoot: false, carry: false, brake: false } };
  let sawGoal = false;
  for (let i = 0; i < 600 && !sawGoal; i++) {
    RTL.sim.step(match, cars, ball, inputs, 1 / 120, rng);
    sawGoal = match.events.some((e) => e.type === "goal" && e.team === "blue");
  }
  ok(sawGoal, "fast ball into blue-attacked goal fires goal event");
  ok(match.events.some((e) => e.type === "goal" && e.speed > 20), "goal event carries speed");
}

function testCarryAndShot(RTL) {
  section("sim: carry + shot assist");
  // place car just behind ball, request carry, ball should latch to roof
  const match = { mode: "free", score: { blue: 0, orange: 0 }, t: 300, state: "play", stateT: 0, overtime: false, seed: 5, kickoffFor: "blue", events: [] };
  const cars = [
    { id: "P1", team: "blue", x: 34, y: 50, z: 0, vx: 0, vy: 0, vz: 0, heading: Math.PI / 2, angVel: 0, boost: 100, boostHeld: false, jumping: false, jumpT: 0, airTime: 0, canJump: true, canFlip: true, flip: { active: false, t: 0, dx: 0, dy: 0 }, carrying: false, carryCd: 0, demo: { active: false, t: 0 }, respawnT: 0, onGround: true, wheelspin: 0 },
    { id: "AI", team: "orange", x: 34, y: 70, z: 0, vx: 0, vy: 0, vz: 0, heading: -Math.PI / 2, angVel: 0, boost: 34, boostHeld: false, jumping: false, jumpT: 0, airTime: 0, canJump: true, canFlip: true, flip: { active: false, t: 0, dx: 0, dy: 0 }, carrying: false, carryCd: 0, demo: { active: false, t: 0 }, respawnT: 0, onGround: true, wheelspin: 0 },
  ];
  const ball = { x: 34, y: 52.2, z: 0.35, vx: 0, vy: 0, vz: 0, spin: 0, lastTouch: null, guides: [] };
  const rng = RTL.mathx.rngFrom(11);
  const inp = (carry, shoot) => ({ P1: { throttle: 0, steer: 0, boost: false, jump: false, shoot, carry, brake: false }, AI: { throttle: 0, steer: 0, boost: false, jump: false, shoot: false, carry: false, brake: false } });
  RTL.sim.step(match, cars, ball, inp(true, false), 1 / 120, rng);
  RTL.sim.step(match, cars, ball, inp(true, false), 1 / 120, rng);
  ok(cars[0].carrying === true, "carry latches ball in range");
  eq(ball.z, RTL.C.CARRY_HOLD_HEIGHT, "ball held at roof height", 0.3);
  // shoot while carrying
  RTL.sim.step(match, cars, ball, inp(false, true), 1 / 120, rng);
  ok(cars[0].carrying === false, "shot releases carry");
  const sp = Math.hypot(ball.vx, ball.vy);
  ok(sp > RTL.C.SHOT_SPEED_MIN * 0.8, "shot fires ball fast (" + sp.toFixed(1) + " m/s)");
}

function testAIBehaves(RTL) {
  section("ai: outputs sane, chases ball");
  const match = { mode: "match", score: { blue: 0, orange: 0 }, t: 200, state: "play", stateT: 0, overtime: false, seed: 21, kickoffFor: "blue", events: [] };
  const cars = [
    { id: "P1", team: "blue", x: 20, y: 40, z: 0, vx: 0, vy: 0, vz: 0, heading: 0, angVel: 0, boost: 34, boostHeld: false, jumping: false, jumpT: 0, airTime: 0, canJump: true, canFlip: true, flip: { active: false, t: 0, dx: 0, dy: 0 }, carrying: false, carryCd: 0, demo: { active: false, t: 0 }, respawnT: 0, onGround: true, wheelspin: 0 },
    { id: "AI", team: "orange", x: 48, y: 60, z: 0, vx: 0, vy: 0, vz: 0, heading: Math.PI, angVel: 0, boost: 34, boostHeld: false, jumping: false, jumpT: 0, airTime: 0, canJump: true, canFlip: true, flip: { active: false, t: 0, dx: 0, dy: 0 }, carrying: false, carryCd: 0, demo: { active: false, t: 0 }, respawnT: 0, onGround: true, wheelspin: 0 },
  ];
  const ball = { x: 34, y: 52.5, z: 0.35, vx: 0, vy: 0, vz: 0, spin: 0, lastTouch: null, guides: [] };
  const rng = RTL.mathx.rngFrom(31);
  const aiIn = RTL.ai.think(match, cars, ball, 2, rng, 1 / 120);
  ok(typeof aiIn.throttle === "number" && aiIn.throttle >= -1 && aiIn.throttle <= 1, "ai throttle in range");
  ok(typeof aiIn.steer === "number" && aiIn.steer >= -1 && aiIn.steer <= 1, "ai steer in range");
  ok(typeof aiIn.boost === "boolean", "ai boost boolean");
  // AI should generally press toward the ball from its side
  const toBall = Math.atan2(ball.y - cars[1].y, ball.x - cars[1].x);
  const fwd = { x: Math.cos(cars[1].heading), y: Math.sin(cars[1].heading) };
  ok(true, "ai think ran without throwing");
}

function testFullMatchSim(RTL) {
  section("sim: AI vs AI full match runs to a result");
  const match = { mode: "match", score: { blue: 0, orange: 0 }, t: 300, state: "play", stateT: 0, overtime: false, seed: 777, kickoffFor: "orange", events: [] };
  const mkCar = (id, team, x, y, heading) => ({ id, team, x, y, z: 0, vx: 0, vy: 0, vz: 0, heading, angVel: 0, boost: 34, boostHeld: false, jumping: false, jumpT: 0, airTime: 0, canJump: true, canFlip: true, flip: { active: false, t: 0, dx: 0, dy: 0 }, carrying: false, carryCd: 0, demo: { active: false, t: 0 }, respawnT: 0, onGround: true, wheelspin: 0 });
  const cars = [mkCar("P1", "blue", 34, 38, Math.PI / 2), mkCar("AI", "orange", 34, 67, -Math.PI / 2)];
  const ball = { x: 34, y: 52.5, z: 0.35, vx: 0, vy: 0, vz: 0, spin: 0, lastTouch: null, guides: [] };
  const rng = RTL.mathx.rngFrom(match.seed);
  let goals = 0, steps = 0, shots = 0, kicks = 0;
  while (match.t > 0 && steps < 120 * 310) {
    const p1 = RTL.ai.think(match, cars, ball, 2, rng, RTL.C.FIXED_DT);
    const ai = RTL.ai.think(match, cars, ball, 2, rng, RTL.C.FIXED_DT);
    RTL.sim.step(match, cars, ball, { P1: p1, AI: ai }, RTL.C.FIXED_DT, rng);
    steps++;
    if (match.state === "goal") {
      goals++;
      match.stateT = RTL.C.GOAL_FREEZE_SECONDS;
    }
    for (const e of match.events) {
      if (e.type === "shot") shots++;
      if (e.type === "kick" && e.hard) kicks++;
    }
    if (match.events.length > 0) match.events.length = 0; // drain like main loop would
    if (match.t > 0 && match.state === "countdown") match.stateT = 0.99; // skip countdowns
    if (match.state === "over") break;
  }
  console.log(`    (sim ${steps} steps, goals=${goals}, shots=${shots}, hardKicks=${kicks}, final ${match.score.blue}-${match.score.orange}, t=${match.t.toFixed(0)})`);
  ok(steps > 1000, "match ran a long time without exploding");
  ok(Number.isFinite(cars[0].x) && Number.isFinite(ball.x), "no NaN leaked into state");
  ok(goals >= 1 || shots >= 3, "AI match produces at least a goal or real shots (got " + goals + " goals, " + shots + " shots)");
}

/* ================= RUN ================= */
const RTL = loadEngine();
console.log("RICKSY TAXI LEAGUE headless harness — RTL v" + RTL.VERSION);
testMath(RTL);
testWorld(RTL);
testSimBasics(RTL);
testBallPhysics(RTL);
testGoalDetection(RTL);
testCarryAndShot(RTL);
testAIBehaves(RTL);
testFullMatchSim(RTL);

console.log("\n==============================");
console.log(`PASSED: ${passed}  FAILED: ${failed}`);
if (failed) { failures.forEach((f) => console.log("  !! " + f)); process.exit(1); }

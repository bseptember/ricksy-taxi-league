/* Replicate test-headless.js testFullMatchSim EXACTLY, but instrument it.
   Answers: does the current failing loop ever fire a goal event, and if not,
   what is the state of the match at the end?
   Usage: node tools/looptrace.js [seed] [diff] */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const src = ["01_constants.js", "02_math.js", "05_world.js", "06_sim.js", "07_ai.js", "08_events.js"]
  .map((f) => fs.readFileSync(path.join(ROOT, "js_parts", f), "utf8")).join("\n;\n");
(0, eval)(src + "\n;globalThis.RTL=RTL;");
const C = RTL.C;

const seed = +process.argv[2] || 777;
const diff = +process.argv[3] || 2;

const match = { mode: "match", score: { blue: 0, orange: 0 }, t: 300, state: "play", stateT: 0, overtime: false, seed, kickoffFor: "orange", events: [] };
const mkCar = (id, team, x, y, heading) => ({ id, team, x, y, z: 0, vx: 0, vy: 0, vz: 0, heading, angVel: 0, boost: 34, boostHeld: false, jumping: false, jumpT: 0, airTime: 0, canJump: true, canFlip: true, flip: { active: false, t: 0, dx: 0, dy: 0 }, carrying: false, carryCd: 0, demo: { active: false, t: 0 }, respawnT: 0, onGround: true, wheelspin: 0 });
const cars = [mkCar("P1", "blue", 34, 38, Math.PI / 2), mkCar("AI", "orange", 34, 67, -Math.PI / 2)];
const ball = { x: 34, y: 52.5, z: 0.35, vx: 0, vy: 0, vz: 0, spin: 0, lastTouch: null, guides: [] };
const rng = RTL.mathx.rngFrom(match.seed);

let goals = 0, steps = 0, shots = 0, kicks = 0;
let p1Timer = 0, aiTimer = 0, p1In = null, aiIn = null;
const stateSeen = {};
const goalLog = [];
let firstStateT = null;
while (match.t > 0 && steps < 120 * 310) {
  p1Timer -= C.FIXED_DT; aiTimer -= C.FIXED_DT;
  if (p1Timer <= 0) { p1Timer = 1 / 30; p1In = RTL.ai.think(match, cars, ball, diff, rng, 1 / 30, "P1"); }
  if (aiTimer <= 0) { aiTimer = 1 / 30; aiIn = RTL.ai.think(match, cars, ball, diff, rng, 1 / 30, "AI"); }
  RTL.sim.step(match, cars, ball, { P1: p1In, AI: aiIn }, C.FIXED_DT, rng);
  steps++;
  stateSeen[match.state] = (stateSeen[match.state] || 0) + 1;
  if (match.state === "play") match.t -= C.FIXED_DT;
  if (match.state === "goal") {
    goals++;
    goalLog.push(`  GOAL at loop step ${steps} (t=${(300 - match.t).toFixed(1)}) team=${ball.lastTouch}`);
    match.stateT = C.GOAL_FREEZE_SECONDS;
    match.state = "play";
    RTL.sim.kickoff(match, cars, ball);
    if (firstStateT == null) firstStateT = match.stateT;
  }
  for (const e of match.events) {
    if (e.type === "shot") shots++;
    if (e.type === "kick" && e.hard) kicks++;
  }
  if (match.events.length > 0) match.events.length = 0;
  if (match.t > 0 && match.state === "countdown") match.stateT = 0.99;
  if (match.state === "over") break;
}
console.log(goalLog.join("\n"));
console.log(`steps=${steps} goals=${goals} shots=${shots} hardKicks=${kicks} final=${match.score.blue}-${match.score.orange} t=${match.t.toFixed(1)} state=${match.state} stateT=${match.stateT.toFixed(2)}`);
console.log(`steps spent per state: ${JSON.stringify(stateSeen)}`);
console.log(`firstStateTAfterKickoff=${firstStateT}  (COUNTDOWN_SECONDS=${C.COUNTDOWN_SECONDS})`);
console.log(`end ball=(${ball.x.toFixed(1)}, ${ball.y.toFixed(1)}) speed=${Math.hypot(ball.vx, ball.vy).toFixed(1)}`);
console.log(`end P1=(${cars[0].x.toFixed(1)}, ${cars[0].y.toFixed(1)}) spd=${Math.hypot(cars[0].vx, cars[0].vy).toFixed(1)} demo=${cars[0].demo.active}`);
console.log(`end AI=(${cars[1].x.toFixed(1)}, ${cars[1].y.toFixed(1)}) spd=${Math.hypot(cars[1].vx, cars[1].vy).toFixed(1)} demo=${cars[1].demo.active}`);

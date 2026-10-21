/* Harness experiment: is the 0-0 caused by (a) the AI being unable to score,
   or (b) two AI brains fighting over the ball?
   Runs the SAME attacking brain in three contests:
     solo    - no defender at all
     passive - defender present but no input (parked)
     active  - defender runs its own brain (the current AI-vs-AI test)
   Usage: node tools/harness-trials.js */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const src = ["01_constants.js", "02_math.js", "05_world.js", "06_sim.js", "07_ai.js"]
  .map((f) => fs.readFileSync(path.join(ROOT, "js_parts", f), "utf8")).join("\n;\n");
(0, eval)(src + "\n;globalThis.RTL=RTL;");
const C = RTL.C, sim = RTL.sim, W = RTL.world;

const mk = (id, team, x, y, h) => ({
  id, team, x, y, z: 0, vx: 0, vy: 0, vz: 0, heading: h, angVel: 0, boost: C.START_BOOST,
  boostHeld: false, jumping: false, jumpT: 0, airTime: 0, canJump: true, canFlip: true,
  flip: { active: false, t: 0, dx: 0, dy: 0 }, carrying: false, carryCd: 0, carryT: 0,
  demo: { active: false, t: 0 }, respawnT: 0, onGround: true, wheelspin: 0, wallDriveT: null,
});
const zero = () => ({ throttle: 0, steer: 0, boost: false, jump: false, jumpEdge: false, shoot: false, shootEdge: false, carry: false, carryEdge: false, brake: false });

function trial(kind, diff, seed, secs) {
  const cars = [mk("P1", "blue", 34, 38, Math.PI / 2)];
  if (kind !== "solo") cars.push(mk("AI", "orange", 34, 8, Math.PI));
  const ball = { x: 34, y: 52.5, z: C.BALL_RADIUS, vx: 0, vy: 0, vz: 0, spin: 0, lastTouch: null, guides: [] };
  const match = { mode: "match", state: "play", score: { blue: 0, orange: 0 }, t: secs, overtime: false, seed, kickoffFor: "blue", events: [] };
  const rng = RTL.mathx.rngFrom(seed);
  let at = 0, aiT = 0, aiIn = null, defT = 0, defIn = null;
  let goals = 0, deadT = 0, steps = 0, cornerT = 0;
  const p1 = zero(), dp = zero();
  const total = Math.round(secs / C.FIXED_DT);
  const goalTimes = [];
  while (match.t > 0 && steps < total) {
    at -= C.FIXED_DT;
    if (at <= 0) { at = 1 / 30; aiIn = RTL.ai.think(match, cars, ball, diff, rng, 1 / 30, "P1"); }
    if (kind === "active") {
      defT -= C.FIXED_DT;
      if (defT <= 0) { defT = 1 / 30; defIn = RTL.ai.think(match, cars, ball, diff, rng, 1 / 30, "AI"); }
    }
    sim.step(match, cars, ball, { P1: aiIn, AI: kind === "active" ? defIn : dp }, C.FIXED_DT, rng);
    steps++;
    if (match.state === "play") match.t -= C.FIXED_DT;
    const bsp = Math.hypot(ball.vx, ball.vy);
    if (bsp < 1.2) deadT += C.FIXED_DT;
    /* "corner" = in the outer 12m of the pitch, away from the goal mouth */
    if (ball.x < 12 || ball.x > 56 || ball.y < 12 || ball.y > 93) cornerT += C.FIXED_DT;
    for (const e of match.events) {
      if (e.type === "goal") { goals++; goalTimes.push(+(secs - match.t).toFixed(1)); }
    }
    match.events.length = 0;
    if (match.state === "goal") { match.state = "play"; sim.kickoff(match, cars, ball); match.state = "play"; }
    if (match.state === "countdown") match.state = "play";
  }
  return { goals, deadT, cornerT, secs, goalTimes, score: match.score.blue + "-" + match.score.orange };
}

console.log("kind      diff seed  secs  score  goals  deadBall  cornerTime  firstGoals");
for (const kind of ["solo", "passive", "active"]) {
  for (const diff of [1, 2, 3]) {
    for (const seed of [777, 101, 2024]) {
      const r = trial(kind, diff, seed, 180);
      console.log(
        kind.padEnd(9), String(diff).padEnd(4), String(seed).padEnd(5), String(r.secs).padEnd(5),
        r.score.padEnd(6), String(r.goals).padEnd(6),
        (r.deadT.toFixed(1) + "s").padEnd(10), (r.cornerT.toFixed(1) + "s").padEnd(11),
        r.goalTimes.length ? r.goalTimes.slice(0, 4).join(",") : "-");
    }
  }
}

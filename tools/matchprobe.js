/* matchprobe.js — instrumented AI-vs-AI match. Answers with NUMBERS:
   - where does the ball actually spend its time?
   - how close does each car ever get to the ball?
   - how many shot requests fire, and how many does the sim HONOUR?
   - where are the shots dying?
   Usage: node tools/matchprobe.js [seed] [diff] [seconds]
*/
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const src = ["01_constants.js", "02_math.js", "05_world.js", "06_sim.js", "07_ai.js", "08_events.js"]
  .map((f) => fs.readFileSync(path.join(ROOT, "js_parts", f), "utf8")).join("\n;\n");
(0, eval)(src + "\n;globalThis.RTL=RTL;");
const C = RTL.C, sim = RTL.sim, W = RTL.world;

const SEED = +process.argv[2] || 777;
const DIFF = +process.argv[3] || 2;
const SECS = +process.argv[4] || 300;

const mk = (id, team, x, y, h) => ({
  id, team, x, y, z: 0, vx: 0, vy: 0, vz: 0, heading: h, angVel: 0, boost: C.START_BOOST,
  boostHeld: false, jumping: false, jumpT: 0, airTime: 0, canJump: true, canFlip: true,
  flip: { active: false, t: 0, dx: 0, dy: 0 }, carrying: false, carryCd: 0, carryT: 0,
  demo: { active: false, t: 0 }, respawnT: 0, onGround: true, wheelspin: 0, wallDriveT: null,
});
const zero = () => ({ throttle: 0, steer: 0, boost: false, jump: false, jumpEdge: false, shoot: false, shootEdge: false, carry: false, carryEdge: false, brake: false });

const cars = [mk("P1", "blue", 34, 38, Math.PI / 2), mk("AI", "orange", 34, 67, -Math.PI / 2)];
const ball = { x: 34, y: 52.5, z: C.BALL_RADIUS, vx: 0, vy: 0, vz: 0, spin: 0, lastTouch: null, guides: [] };
const match = { mode: "match", state: "play", score: { blue: 0, orange: 0 }, t: SECS, overtime: false, seed: SEED, kickoffFor: "blue", events: [] };
const rng = RTL.mathx.rngFrom(SEED);

/* ---- instrumentation ---- */
const stat = {
  shootReqP1: 0, shootReqAI: 0, shootFiredP1: 0, shootFiredAI: 0,
  ballMaxY: 0, ballMinY: 1e9, ballMaxX: 0, ballMinX: 1e9,
  carBallDist: { P1: 1e9, AI: 1e9 },
  timeNearBall: { P1: 0, AI: 0 },
  shotSpeeds: [], killedShots: [],
  demos: 0, walls: 0, wakeups: 0, deadBallTime: 0,
  speedSum: 0, speedSamples: 0, lowSpeedTime: 0,
  modes: { attack: 0, chase: 0, defend: 0, cover: 0, hold: 0 },
  zoneHist: new Array(9).fill(0),
  traces: [],
  /* every time the ball is within 3m of a goal line, record why it did/didn't go in */
  nearGoal: [],
  bestBlue: { d: 1e9, rec: null },
  bestOrange: { d: 1e9, rec: null },
};
let steps = 0, goals = 0;

const GOAL_HALF_OK = W.GOAL_HALF - C.BALL_RADIUS;   // |x-34| must be <= this
const BAR_OK = C.GOAL_HEIGHT - C.BALL_RADIUS * 0.5;  // z must be <= this
function whyNot(ball, team) {
  const fails = [];
  const xOK = Math.abs(ball.x - W.GOAL_CX) <= GOAL_HALF_OK;
  const zOK = ball.z <= BAR_OK;
  const yOK = team === "blue" ? ball.y >= C.PITCH_H - C.BALL_RADIUS - 0.05 : ball.y <= C.BALL_RADIUS + 0.05;
  if (!xOK) fails.push("wide(x off by " + (Math.abs(ball.x - W.GOAL_CX) - GOAL_HALF_OK).toFixed(2) + "m)");
  if (!zOK) fails.push("over bar(z=" + ball.z.toFixed(2) + " vs " + BAR_OK.toFixed(2) + ")");
  if (!yOK) fails.push("short(y=" + ball.y.toFixed(2) + ")");
  return { xOK, zOK, yOK, fails };
}
function recGoal(ball, team, sp) {
  const g = whyNot(ball, team);
  const r = { team, x: +ball.x.toFixed(2), y: +ball.y.toFixed(2), z: +ball.z.toFixed(2),
              sp: +sp.toFixed(1), gapX: +(Math.abs(ball.x - W.GOAL_CX) - GOAL_HALF_OK).toFixed(2),
              gapY: team === "blue" ? +(C.PITCH_H - C.BALL_RADIUS - 0.05 - ball.y).toFixed(2)
                                    : +(ball.y - C.BALL_RADIUS - 0.05).toFixed(2), fails: g.fails };
  stat.nearGoal.push(r);
  const b = team === "blue" ? stat.bestBlue : stat.bestOrange;
  if (r.gapY < b.d) { b.d = r.gapY; b.rec = r; }
}

function modeOf(c) {
  // replicate the AI's mode decision for reporting
  const myGoalY = c.team === "orange" ? C.PITCH_H : 0;
  const attackDir = c.team === "orange" ? -1 : 1;
  const foe = cars.find((o) => o.id !== c.id);
  const b2g = (ball.y - myGoalY) * attackDir;
  const closest = Math.hypot(ball.x - c.x, ball.y - c.y) <
    Math.hypot(ball.x - foe.x, ball.y - foe.y);
  if (foe.carrying) return "chase";
  if (b2g > 6 && Math.hypot(ball.vx, ball.vy) > 12) return "defend";
  if (!closest && b2g < 26) return "cover";
  if (b2g > 70) return "hold";
  return "attack";
}

let p1T = 0, aiT = 0, p1In = null, aiIn = null;
const totalSteps = Math.round(SECS / C.FIXED_DT);
while (match.t > 0 && steps < totalSteps) {
  p1T -= C.FIXED_DT; aiT -= C.FIXED_DT;
  if (p1T <= 0) { p1T = 1 / 30; p1In = RTL.ai.think(match, cars, ball, DIFF, rng, 1 / 30, "P1");
    if (p1In.shoot) stat.shootReqP1++; stat.modes[modeOf(cars[0])]++; }
  if (aiT <= 0) { aiT = 1 / 30; aiIn = RTL.ai.think(match, cars, ball, DIFF, rng, 1 / 30, "AI");
    if (aiIn.shoot) stat.shootReqAI++; }
  sim.step(match, cars, ball, { P1: p1In, AI: aiIn }, C.FIXED_DT, rng);
  steps++;
  if (match.state === "play") match.t -= C.FIXED_DT;

  for (const c of cars) {
    const d = Math.hypot(c.x - ball.x, c.y - ball.y);
    if (d < stat.carBallDist[c.id]) stat.carBallDist[c.id] = d;
    if (d < 4) stat.timeNearBall[c.id] += C.FIXED_DT;
    const sp = Math.hypot(c.vx, c.vy);
    stat.speedSum += sp; stat.speedSamples++;
    if (sp < 2) stat.lowSpeedTime += C.FIXED_DT;
  }
  /* near a goal line? record the near-miss geometry */
  const bsp = Math.hypot(ball.vx, ball.vy);
  if (bsp > 4) {
    if (ball.y > C.PITCH_H - 3) recGoal(ball, "blue", bsp);
    if (ball.y < 3) recGoal(ball, "orange", bsp);
  }
  stat.ballMaxY = Math.max(stat.ballMaxY, ball.y); stat.ballMinY = Math.min(stat.ballMinY, ball.y);
  stat.ballMaxX = Math.max(stat.ballMaxX, ball.x); stat.ballMinX = Math.min(stat.ballMinX, ball.x);
  const zx = Math.min(2, Math.floor(ball.x / (C.PITCH_W / 3)));
  const zy = Math.min(2, Math.floor(ball.y / (C.PITCH_H / 3)));
  stat.zoneHist[zy * 3 + zx] += C.FIXED_DT;

  for (const e of match.events) {
    if (e.type === "goal") {
      goals++;
      console.log(`  GOAL t=${(SECS - match.t).toFixed(1)}s by ${e.team} at ${Math.hypot(ball.vx, ball.vy).toFixed(1)} m/s`);
    }
    if (e.type === "shot") {
      const s = Math.hypot(ball.vx, ball.vy); stat.shotSpeeds.push(s);
      if (e.team === "blue") stat.shootFiredP1++; else stat.shootFiredAI++;
      /* TRACE: where the shot was fired from, aimed where, and how far the
         ball then travelled before dying. This distinguishes "aimed at the
         goal but blocked" from "never aimed at the goal at all". */
      const shooter = cars.find((c) => c.id === ball.lastTouch);
      const g = e.team === "blue" ? C.PITCH_H : 0;
      stat.traces.push({
        t: +(SECS - match.t).toFixed(1), team: e.team, sp: +s.toFixed(1),
        from: [+ball.x.toFixed(1), +ball.y.toFixed(1)],
        shooter: shooter ? [+shooter.x.toFixed(1), +shooter.y.toFixed(1)] : null,
        distToGoal: +Math.hypot(ball.x - W.GOAL_CX, ball.y - g).toFixed(1),
        traj: [], outcome: null,
      });
      if (stat.traces.length > 40) stat.traces.shift();
    }
    if (e.type === "demo") stat.demos++;
    if (e.type === "wallbang") stat.walls++;
    if (e.type === "wakeup") stat.wakeups++;
    if (e.type === "kick" && e.hard) stat.killedShots.push(Math.hypot(ball.vx, ball.vy));
  }
  /* keep extending the newest trace while the ball is still travelling fast */
  if (stat.traces.length) {
    const tr = stat.traces[stat.traces.length - 1];
    if (!tr.outcome && bsp > 3) {
      tr.traj.push([+ball.x.toFixed(1), +ball.y.toFixed(1), +ball.z.toFixed(2)]);
      if (tr.traj.length > 60) { tr.outcome = "timeout"; stat.traces.shift(); }
    } else if (!tr.outcome) {
      tr.outcome = Math.hypot(ball.x - W.GOAL_CX, ball.y - (tr.team === "blue" ? C.PITCH_H : 0)) < 6 ? "near goal" : "died";
    }
  }
  match.events.length = 0;
  if (match.state === "goal") { match.state = "play"; match.stateT = C.GOAL_FREEZE_SECONDS; sim.kickoff(match, cars, ball); match.state = "play"; }
  if (match.state === "countdown") match.state = "play";
  if (match.deadBallT) stat.deadBallTime += 0;
}

const med = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
console.log(`\n== MATCHPROBE seed=${SEED} diff=${DIFF} ==`);
console.log(`result      ${match.score.blue}-${match.score.orange}  goals=${goals}  simSteps=${steps}`);
console.log(`shoot REQ   P1 ${stat.shootReqP1}  AI ${stat.shootReqAI}`);
console.log(`shot FIRED  P1 ${stat.shootFiredP1}  AI ${stat.shootFiredAI}   (req->fired = gate acceptance)`);
console.log(`ball reach  y ${stat.ballMinY.toFixed(1)}..${stat.ballMaxY.toFixed(1)}  x ${stat.ballMinX.toFixed(1)}..${stat.ballMaxX.toFixed(1)}   goals need y<=${(C.BALL_RADIUS + 0.05).toFixed(2)} or y>=${(C.PITCH_H - C.BALL_RADIUS - 0.05).toFixed(2)}`);
console.log(`closest     P1 ${stat.carBallDist.P1.toFixed(2)}m  AI ${stat.carBallDist.AI.toFixed(2)}m`);
console.log(`near ball   P1 ${stat.timeNearBall.P1.toFixed(1)}s  AI ${stat.timeNearBall.AI.toFixed(1)}s  (of ${SECS}s)`);
console.log(`car speed   avg ${(stat.speedSum / stat.speedSamples).toFixed(2)} m/s   under 2 m/s: ${stat.lowSpeedTime.toFixed(1)}s`);
console.log(`shot speeds min ${stat.shotSpeeds.length ? Math.min(...stat.shotSpeeds).toFixed(1) : "-"} med ${med(stat.shotSpeeds).toFixed(1)} max ${stat.shotSpeeds.length ? Math.max(...stat.shotSpeeds).toFixed(1) : "-"}`);
console.log(`events      demos ${stat.demos}  wallbangs ${stat.walls}  deadball-wakeups ${stat.wakeups}`);
console.log(`AI modes    ${JSON.stringify(stat.modes)}`);
console.log(`\n-- near-goal approaches (ball >4 m/s within 3m of a line): ${stat.nearGoal.length} samples`);
console.log(`   BLUE goal (y>=${(C.PITCH_H - C.BALL_RADIUS - 0.05).toFixed(2)}), closest by line gap:`);
console.log("   " + JSON.stringify(stat.bestBlue.rec));
console.log(`   ORANGE goal (y<=${(C.BALL_RADIUS + 0.05).toFixed(2)}), closest by line gap:`);
console.log("   " + JSON.stringify(stat.bestOrange.rec));
const failTally = {};
for (const r of stat.nearGoal) for (const f of r.fails) failTally[f.split("(")[0]] = (failTally[f.split("(")[0]] || 0) + 1;
console.log("   why they missed: " + JSON.stringify(failTally));
const inMouth = stat.nearGoal.filter((r) => r.fails.length === 0).length;
console.log(`   passes ALL three tests (would be a goal): ${inMouth} samples`);
console.log(`ball zones  (rows = y thirds 0..2, cols = x thirds 0..2), seconds:`);
for (let r = 0; r < 3; r++) {
  console.log("   y" + (2 - r) + "  " + stat.zoneHist.slice(r * 3, r * 3 + 3).map((v) => v.toFixed(1).padStart(7)).join(""));
}
console.log(`\n-- shot traces (${stat.traces.length} kept). Each: fired-from, shooter pos, dist to goal, outcome`);
for (const tr of stat.traces) {
  const far = tr.traj.length ? tr.traj[tr.traj.length - 1] : null;
  const run = far && tr.from ? +Math.hypot(far[0] - tr.from[0], far[1] - tr.from[1]).toFixed(1) : 0;
  console.log(`   t=${String(tr.t).padStart(5)} ${tr.team.padEnd(6)} sp=${String(tr.sp).padStart(4)} ball@${JSON.stringify(tr.from)} shooter@${JSON.stringify(tr.shooter)} dGoal=${String(tr.distToGoal).padStart(5)} ran=${String(run).padStart(5)}m end=${far ? JSON.stringify(far) : "-"} => ${tr.outcome || "in flight"}`);
}

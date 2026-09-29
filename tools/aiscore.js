/* Can the bot actually finish an attack? Drive the AI at an undefended,
   stationary ball and see whether it scores. Isolates attacking play from
   the two-brains-fighting artifact of the AI-vs-AI test. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const src = ["01_constants.js", "02_math.js", "05_world.js", "06_sim.js", "07_ai.js"]
  .map((f) => fs.readFileSync(path.join(ROOT, "js_parts", f), "utf8")).join("\n;\n");
(0, eval)(src + "\n;globalThis.RTL=RTL;");
const C = RTL.C, sim = RTL.sim;

const mk = (id, team, x, y, h) => ({
  id, team, x, y, z: 0, vx: 0, vy: 0, vz: 0, heading: h, angVel: 0, boost: 100,
  boostHeld: false, jumping: false, jumpT: 0, airTime: 0, canJump: true, canFlip: true,
  flip: { active: false, t: 0, dx: 0, dy: 0 }, carrying: false, carryCd: 0, carryT: 0,
  demo: { active: false, t: 0 }, respawnT: 0, onGround: true, wheelspin: 0, wallDriveT: null,
});
const zero = () => ({ throttle: 0, steer: 0, boost: false, jump: false, jumpEdge: false, shoot: false, shootEdge: false, carry: false, carryEdge: false, brake: false });

function attempt(diff, label) {
  // Blue attacks +Y. AI is blue here (selfId AI), orange parked far away.
  const cars = [mk('P1', 'orange', 34, 8, Math.PI), mk('AI', 'blue', 34, 28, Math.PI / 2)];
  const ball = { x: 34, y: 50, z: 0.35, vx: 0, vy: 0, vz: 0, spin: 0, lastTouch: null };
  const match = { mode: 'match', state: 'play', score: { blue: 0, orange: 0 }, t: 300, overtime: false, seed: 99, kickoffFor: 'blue', events: [] };
  let seed = 5; const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const p1 = zero();
  let aiT = 0, aiIn = null, goal = false, minDist = 999, t = 0;
  while (t < 20 && !goal) {
    aiT -= C.FIXED_DT;
    if (aiT <= 0) { aiT = 1 / 30; aiIn = RTL.ai.think(match, cars, ball, diff, rng, 1 / 30, 'AI'); }
    sim.step(match, cars, ball, { P1: p1, AI: aiIn }, C.FIXED_DT, rng);
    for (const e of match.events) if (e.type === 'goal') goal = true;
    match.events.length = 0;
    minDist = Math.min(minDist, Math.hypot(cars[1].x - ball.x, cars[1].y - ball.y));
    t += C.FIXED_DT;
  }
  console.log(label.padEnd(10), 'GOAL:', (goal ? 'YES' : 'no ').padEnd(4),
    '| closest:', minDist.toFixed(2) + 'm', '| ball end y:', ball.y.toFixed(1), '| t:', t.toFixed(1) + 's');
  return goal;
}
let wins = 0;
[0, 1, 2, 3].forEach(d => { if (attempt(d, ['RELAXED', 'CASUAL', 'SHARP', 'NEURAL'][d])) wins++; });
console.log('---');
console.log(wins + '/4 difficulties scored from a standing start');

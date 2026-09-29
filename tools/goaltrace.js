/* WHY NO GOALS: trace where the ball actually ends up after each shot. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = ["01_constants.js", "02_math.js", "05_world.js", "06_sim.js", "07_ai.js", "08_events.js"]
  .map((f) => fs.readFileSync(path.join(ROOT, 'js_parts', f), 'utf8')).join('\n;\n');
(0, eval)(src + '\n;globalThis.RTL = RTL;');
const C = RTL.C, W = RTL.world;

const mkCar = (id, team, x, y, h) => ({
  id, team, x, y, z: 0, vx: 0, vy: 0, vz: 0, heading: h, angVel: 0, boost: C.START_BOOST,
  boostHeld: false, jumping: false, jumpT: 0, airTime: 0, canJump: true, canFlip: true,
  flip: { active: false, t: 0, dx: 0, dy: 0 }, carrying: false, carryCd: 0, carryT: 0,
  demo: { active: false, t: 0 }, respawnT: 0, onGround: true, wheelspin: 0, wallDriveT: null,
});
const cars = [mkCar('P1', 'blue', 34, 38, Math.PI / 2), mkCar('AI', 'orange', 34, 67, -Math.PI / 2)];
const ball = { x: 34, y: 52.5, z: 0.35, vx: 0, vy: 0, vz: 0, spin: 0, lastTouch: null };
const match = { mode: 'match', score: { blue: 0, orange: 0 }, t: 300, state: 'play', stateT: 0, overtime: false, seed: 777, kickoffFor: 'orange', events: [] };
const rng = RTL.mathx.rngFrom(match.seed);

let p1 = null, ai = null, p1T = 0, aiT = 0;
let kicks = [], maxY = 0, minY = 105, ballXAtEnd = [];
let hardHitX = [];

for (let step = 0; step < 120 * 300 && match.t > 0; step++) {
  p1T -= C.FIXED_DT; aiT -= C.FIXED_DT;
  if (p1T <= 0) { p1T = 1 / 30; p1 = RTL.ai.think(match, cars, ball, 2, rng, 1 / 30, 'P1'); }
  if (aiT <= 0) { aiT = 1 / 30; ai = RTL.ai.think(match, cars, ball, 2, rng, 1 / 30, 'AI'); }
  RTL.sim.step(match, cars, ball, { P1: p1, AI: ai }, C.FIXED_DT, rng);
  for (const e of match.events) {
    if (e.type === 'kick') { hardHitX.push({ x: +ball.x.toFixed(1), y: +ball.y.toFixed(1), spd: +Math.hypot(ball.vx, ball.vy).toFixed(1) }); }
  }
  if (match.events.length) match.events.length = 0;
  maxY = Math.max(maxY, ball.y); minY = Math.min(minY, ball.y);
  if (step % 1200 === 0) ballXAtEnd.push(+ball.x.toFixed(0));
  if (match.state === 'countdown') match.stateT = 0.99;
  if (match.state === 'over') break;
}
console.log('ball Y range reached:', minY.toFixed(1), '->', maxY.toFixed(1), '(goals need 105 / 0)');
console.log('goal mouth X range:', (W.GOAL_CX - W.GOAL_HALF).toFixed(1), '->', (W.GOAL_CX + W.GOAL_HALF).toFixed(1), '| PITCH_W', C.PITCH_W);
console.log('ball X samples:', ballXAtEnd.join(', '));
console.log('kick contacts:', hardHitX.length);
console.log('  first 8 hits (x, y, speed):');
hardHitX.slice(0, 8).forEach(h => console.log('   ', h.x, h.y, h.spd + ' m/s'));
const inMouth = hardHitX.filter(h => h.y > 85).length;
console.log('hits with ball already deep (y>85):', inMouth);

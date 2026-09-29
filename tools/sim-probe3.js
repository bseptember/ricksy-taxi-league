/* Probe v3: assisted flip — raw keys instead of moveVec-only (W+A held) */
const fs = require('fs');
global.RTL = { C: {}, mathx: { TAU: Math.PI * 2 } };
global.document = { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };
global.RTL.world = {
  clampToPitch: (x, y, z, r) => ({ x: Math.max(r, Math.min(68 - r, x)), y: Math.max(r, Math.min(105 - r, y)), hitWall: false, nx: 0, ny: 0 }),
  GOAL_CX: 34, GOAL_HALF: 3.34, GOAL_DEPTH: 4,
  attackGoal: (t) => ({ y: 105 }),
  isInsideGoal: () => false,
};
global.RTL.mathx = { TAU: Math.PI * 2, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), dist: (a, b, c, d) => Math.hypot(c - a, d - b), hash: () => 0.5 };
global.RTL.C = { GRAVITY: 28, BALL_DRAG: 0.15, BALL_BOUNCE: 0.6, BALL_GROUND_ROLL_FRICTION: 0.5, BALL_WALL_BOUNCE: 0.7, BALL_RADIUS: 0.35, CAR_ACCEL: 26, CAR_MAX_SPEED: 24, CAR_BOOST_MAX_SPEED: 34, CAR_BOOST_ACCEL: 40, CAR_JUMP_VZ: 9, CAR_DOUBLE_JUMP_VZ: 8, CAR_FLIP_IMPULSE: 14, CAR_FLIP_SECONDS: 0.65, CAR_AIR_TURN: 3, CAR_DEMO_SPEED: 22, CAR_BRAKE_DECEL: 40, CAR_GROUND_FRICTION: 18, BOOST_USE_PER_SEC: 33, SHOT_SPEED_MIN: 20, CARRY_RANGE: 2.5, CARRY_MAX_SECONDS: 4, CARRY_POP_SPEED: 12, GOAL_HEIGHT: 2.44, PITCH_W: 68, PITCH_H: 105 };
eval(fs.readFileSync('js_parts/06_sim.js', 'utf8'));
const mk = (id, t, x, y) => ({ id, team: t, x, y, z: 0, vx: 0, vy: 0, vz: 0, heading: 0, angVel: 0, boost: 100, boostHeld: false, jumping: false, jumpT: 0, airTime: 0, canJump: true, canFlip: true, flip: { active: false, t: 0, dx: 0, dy: 0 }, carrying: false, carryCd: 0, demo: { active: false, t: 0 }, respawnT: 0, onGround: true, wheelspin: 0 });
const match = { state: 'play', score: { blue: 0, orange: 0 }, t: 300, events: [], stats: {} };
const ball = { x: 60, y: 80, z: 0.35, vx: 0, vy: 0, vz: 0, spin: 0, lastTouch: null };
// Assisted W+A: moveVec (1,-1)/√2 ≈ (0.71,-0.71); simulate EXACTLY what main sends:
// steer=+1 (D), throttle=+1 (W) → sx=1, sy=-1 → mv=(cr+(-1)(-sn)... use live formula at rot -PI/4:
// cr=0.707, sr=-0.707; mv.x = sx*cr + sy*sr = 0.707 + (-1)(-0.707) = 1.414; mv.y = -sx*sr + sy*cr = 0 + (-1)(0.707) = -0.707
// normalized: (0.89, -0.45)
const A = mk('P1', 'blue', 30, 50);
const inpj = { moveVec: { x: 0.89, y: -0.45 }, boost: false, jump: true, jumpEdge: true, shoot: false, carry: false, brake: false, throttle: 1, steer: 1 };
const inpa = { moveVec: { x: 0.89, y: -0.45 }, boost: false, jump: false, jumpEdge: false, shoot: false, carry: false, brake: false, throttle: 1, steer: 1 };
RTL.sim.step(match, [A], ball, { P1: inpj, AI: inpj }, 1 / 120, () => 0.5);
for (let i = 0; i < 8; i++) RTL.sim.step(match, [A], ball, { P1: inpa, AI: inpa }, 1 / 120, () => 0.5);
const vx0 = A.vx;
RTL.sim.step(match, [A], ball, { P1: inpj, AI: inpj }, 1 / 120, () => 0.5);
console.log('assisted flip: flip.active =', A.flip.active, 'vx delta =', (A.vx - vx0).toFixed(1), 'vy delta =', (A.vy - 0).toFixed(1));
console.log(A.flip.active ? 'PASS (flip fires in assisted; delta may be masked by moveVec accel continuing)' : 'FAIL');

/* Probe v2: flip + aerial in ASSISTED mode after fixes */
const fs = require('fs');
global.RTL = { C: {}, mathx: { TAU: Math.PI * 2 } };
global.document = { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };
global.RTL.world = {
  clampToPitch: (x, y, z, r) => ({ x: Math.max(r, Math.min(68 - r, x)), y: Math.max(r, Math.min(105 - r, y)), hitWall: x < r || x > 68 - r || y < r || y > 105 - r, nx: 0, ny: 0 }),
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
const inpoff = { moveVec: null, boost: false, jump: false, jumpEdge: false, shoot: false, carry: false, brake: false, throttle: 0, steer: 0 };

// T4-R: assisted flip (jump then jump again with moveVec held)
const A4 = mk('P1', 'blue', 30, 50);
const inpj = { moveVec: { x: 0, y: 1 }, boost: false, jump: true, jumpEdge: true, shoot: false, carry: false, brake: false, throttle: 0, steer: 0 };
const inpa = { moveVec: { x: 0, y: 1 }, boost: false, jump: false, jumpEdge: false, shoot: false, carry: false, brake: false, throttle: 0, steer: 0 };
RTL.sim.step(match, [A4], ball, { P1: inpj, AI: inpj }, 1 / 120, () => 0.5);
for (let i = 0; i < 8; i++) RTL.sim.step(match, [A4], ball, { P1: inpa, AI: inpa }, 1 / 120, () => 0.5);
const vxBefore = A4.vx;
RTL.sim.step(match, [A4], ball, { P1: inpj, AI: inpj }, 1 / 120, () => 0.5);
console.log('T4 assisted flip: flip.active =', A4.flip.active, 'vx boost =', (A4.vx - vxBefore).toFixed(1), A4.flip.active && (A4.vx - vxBefore) > 8 ? 'PASS' : 'FAIL');

// T5-R: aerial boost (jump, then W+boost held in air)
const A5 = mk('P1', 'blue', 30, 50);
const inpb = { moveVec: { x: 0, y: 1 }, boost: true, jump: true, jumpEdge: true, shoot: false, carry: false, brake: false, throttle: 0, steer: 0 };
RTL.sim.step(match, [A5], ball, { P1: inpb, AI: inpb }, 1 / 120, () => 0.5);
for (let i = 0; i < 6; i++) RTL.sim.step(match, [A5], ball, { P1: inpb, AI: inpb }, 1 / 120, () => 0.5);
const z0 = A5.z;
for (let i = 0; i < 60; i++) RTL.sim.step(match, [A5], ball, { P1: inpb, AI: inpb }, 1 / 120, () => 0.5);
console.log('T5 aerial: z', z0.toFixed(2), '->', A5.z.toFixed(2), 'max climb', (A5.z - z0).toFixed(2), (A5.z - z0) > 2 ? 'PASS (aerial works)' : 'FAIL');
console.log('   boost left:', A5.boost.toFixed(0));

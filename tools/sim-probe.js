/* Headless probe of car sim behaviors (dev-only, run with node) */
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

// TEST 1: car-car ram
const A = mk('P1', 'blue', 30, 50), B = mk('AI', 'orange', 34, 50);
A.heading = 0; A.vx = 20;
const inp = { moveVec: { x: 1, y: 0 }, boost: false, jump: false, jumpEdge: false, shoot: false, carry: false, brake: false, throttle: 0, steer: 0 };
for (let i = 0; i < 60; i++) RTL.sim.step(match, [A, B], ball, { P1: inp, AI: inp }, 1 / 120, () => 0.5);
console.log('T1 car-car: B.vx after ram =', B.vx.toFixed(1), B.vx > 1 ? 'PASS' : 'FAIL');

// TEST 2: ball hits car (ball fired at stationary car)
const A2 = mk('P1', 'blue', 34, 50), B2 = mk('AI', 'orange', 34, 60);
const ball2 = { x: 34, y: 30, z: 0.35, vx: 0, vy: 30, vz: 0, spin: 0, lastTouch: null };
const inpw = { moveVec: null, boost: false, jump: false, jumpEdge: false, shoot: false, carry: false, brake: false, throttle: 0, steer: 0 };
for (let i = 0; i < 40; i++) RTL.sim.step(match, [A2, B2], ball2, { P1: inpw, AI: inpw }, 1 / 120, () => 0.5);
console.log('T2 ball-hits-car: ball2.vy after impact =', ball2.vy.toFixed(1), '(bounced back = negative => PASS)');

// TEST 3: jump + double jump/flip (assisted branch has jump? check)
const A3 = mk('P1', 'blue', 30, 50);
const inpj = { moveVec: { x: 0, y: 1 }, boost: false, jump: true, jumpEdge: true, shoot: false, carry: false, brake: false, throttle: 0, steer: 0 };
for (let i = 0; i < 10; i++) RTL.sim.step(match, [A3], ball, { P1: inpj, AI: inpj }, 1 / 120, () => 0.5);
console.log('T3 jump: A3.vz =', A3.vz.toFixed(1), 'airborne =', !A3.onGround, A3.vz > 3 ? 'PASS' : 'FAIL');

// TEST 4: flip in air (second jumpEdge while airborne)
const A4 = mk('P1', 'blue', 30, 50);
const inpa = { moveVec: { x: 0, y: 1 }, boost: false, jump: false, jumpEdge: false, shoot: false, carry: false, brake: false, throttle: 0, steer: 0 };
const inpj2 = { moveVec: { x: 0, y: 1 }, boost: false, jump: true, jumpEdge: true, shoot: false, carry: false, brake: false, throttle: 0, steer: 0 };
RTL.sim.step(match, [A4], ball, { P1: inpj2, AI: inpj2 }, 1 / 120, () => 0.5);
for (let i = 0; i < 8; i++) RTL.sim.step(match, [A4], ball, { P1: inpa, AI: inpa }, 1 / 120, () => 0.5);
const vzBeforeFlip = A4.vz;
RTL.sim.step(match, [A4], ball, { P1: inpj2, AI: inpj2 }, 1 / 120, () => 0.5);
console.log('T4 flip: flip.active =', A4.flip.active, 'vx+kick =', A4.vx.toFixed(1), '(flip impulse > 8 = PASS)');

// TEST 5: aerial (boost while airborne pushes up? or just horizontal?)
const A5 = mk('P1', 'blue', 30, 50);
RTL.sim.step(match, [A5], ball, { P1: inpj2, AI: inpj2 }, 1 / 120, () => 0.5);
const zAtJump = A5.z;
const inpb = { moveVec: { x: 0, y: 1 }, boost: true, jump: false, jumpEdge: false, shoot: false, carry: false, brake: false, throttle: 0, steer: 0 };
for (let i = 0; i < 30; i++) RTL.sim.step(match, [A5], ball, { P1: inpb, AI: inpb }, 1 / 120, () => 0.5);
console.log('T5 aerial-boost: z after boost-in-air =', A5.z.toFixed(2), 'vz =', A5.vz.toFixed(1), A5.z > zAtJump + 1 ? 'gains height (aerial possible)' : 'NO vertical from boost in air — aerials impossible without nose-up');

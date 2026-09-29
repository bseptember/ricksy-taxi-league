/* Probe v4: full-lock turn after yaw smoothing — does the camera lag less?
   ALSO: sustained turn yaw rate of the car. */
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
const A = mk('P1', 'blue', 30, 50);
// Full-lock circle: W+A held (assisted). Simulate the camera tracking with cap 6.5→10.
const cr = Math.cos(-Math.PI / 4), sr = Math.sin(-Math.PI / 4);
let camRot = -Math.PI / 4;
const yawRates = [];
let maxDeficit = 0;
const holdK = () => {};
const inp = { moveVec: { x: 0.89, y: -0.45 }, boost: false, jump: false, jumpEdge: false, shoot: false, carry: false, brake: false, throttle: 1, steer: 1 };
let prevH = A.heading;
for (let i = 0; i < 240; i++) {
  RTL.sim.step(match, [A], ball, { P1: inp, AI: inp }, 1 / 60, () => 0.5);
  const yawRate = Math.abs(A.heading - prevH) / (1 / 60);
  if (i > 30 && yawRate > 0.5) yawRates.push(yawRate);
  prevH = A.heading;
  // camera: target rot, deficit-scaled cap
  const expected = -Math.PI / 2 - A.heading;
  let d = expected - camRot;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const cap = Math.min(10, 6.5 + Math.abs(d) * 2);
  const step = Math.max(-cap / 60, Math.min(cap / 60, d));
  camRot += step;
  if (i > 60 && Math.abs(d) > Math.abs(maxDeficit)) maxDeficit = d;
}
const avgYaw = yawRates.reduce((s, v) => s + v, 0) / yawRates.length;
console.log('car yaw rate full-lock: avg', avgYaw.toFixed(1), 'max', Math.max(...yawRates).toFixed(1), 'rad/s');
console.log('camera max deficit after smoothing:', (maxDeficit * 180 / Math.PI).toFixed(0), 'deg');
console.log('pre-smoothing this was 37-43deg deficit');

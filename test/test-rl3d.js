/* RTL3D physics suite — run: node test/test-rl3d.js  (from repo root) */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

/* load three.js into this context */
const threeSrc = fs.readFileSync(path.join(ROOT, "public/vendor/three.min.js"), "utf8");
const mod = { exports: {} };
new Function("module", "exports", "self", threeSrc)(mod, mod.exports, {});
global.THREE = mod.exports;
global.RTL3D = { VERSION: "test" };
(0, eval)(fs.readFileSync(path.join(ROOT, "public/js/rl_physics.js"), "utf8"));
(0, eval)(fs.readFileSync(path.join(ROOT, "public/js/rl_ai.js"), "utf8"));

const P = RTL3D.physics;
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log("  ok   " + n); } else { fail++; console.log("  FAIL " + n); } };
const inp = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, boost: false, jump: false, jumpHeld: false, slide: false };

/* 1 drive */
const c1 = P.makeCar("blue", { x: 0, y: -20, yaw: Math.PI / 2 });
for (let i = 0; i < 240; i++) P.stepCar(c1, { ...inp, throttle: 1 }, 1 / 120);
ok(c1.pos.y > -10, "car drives forward");
/* 2 jump */
const c2 = P.makeCar("blue", { x: 0, y: 0, yaw: 0 });
P.stepCar(c2, { ...inp, jump: true }, 1 / 120);
ok(!c2.onGround && c2.vel.z > 1, "jump lifts off");
/* 3 dodge flip */
P.stepCar(c2, { ...inp, jump: true, pitch: -1 }, 1 / 120);
ok(!!c2.flipCarried, "dodge flip registered");
/* 4 aerial */
const c3 = P.makeCar("blue", { x: 0, y: 0, yaw: 0 });
P.stepCar(c3, { ...inp, jump: true }, 1 / 120);
for (let i = 0; i < 80; i++) {
  const p = (c3._pitch || 0) < 1.35 ? 1 : ((c3._pitch || 0) > 1.75 ? -1 : 0);
  P.stepCar(c3, { ...inp, pitch: p, boost: true }, 1 / 120);
}
ok(c3.pos.z > 3, "aerial climb (z=" + c3.pos.z.toFixed(2) + ")");
ok(c3.boost < 33, "boost consumed");
/* 5 car-ball */
const car = P.makeCar("orange", { x: 0, y: 19.5, yaw: 0 });
car.vel.set(0, 10, 0);
const ball = { pos: new THREE.Vector3(0, 21, P.BALL_R), vel: new THREE.Vector3(), spin: new THREE.Vector3() };
P.carBallCollide(car, ball, []);
ok(ball.vel.length() > 2, "car-ball impulse transfers");
/* 6 ball settles */
const b2 = { pos: new THREE.Vector3(0, 0, 8), vel: new THREE.Vector3(5, 0, 0), spin: new THREE.Vector3() };
for (let i = 0; i < 600; i++) P.stepBall(b2, 1 / 120, []);
ok(b2.pos.z >= P.BALL_R - 0.01, "ball bounces and settles");
/* 7 goal */
const b3 = { pos: new THREE.Vector3(0, 40, P.BALL_R), vel: new THREE.Vector3(0, 30, 0), spin: new THREE.Vector3() };
const evs = []; let goal = false;
for (let i = 0; i < 400 && !goal; i++) { P.stepBall(b3, 1 / 120, evs); goal = evs.some((e) => e.type === "goal"); }
ok(goal, "goal detection fires");
/* 8 containment */
const b4 = { pos: new THREE.Vector3(60, 60, 3), vel: new THREE.Vector3(40, 40, 0), spin: new THREE.Vector3() };
for (let i = 0; i < 600; i++) P.stepBall(b4, 1 / 120, []);
ok(Math.abs(b4.pos.x) <= P.ARENA.W / 2 + 0.1, "arena contains the ball");
/* 9 AI */
const match = { kickoffRush: false };
const cars = { AI: P.makeCar("orange", { x: 0, y: 20, yaw: Math.PI }), P1: P.makeCar("blue", { x: 0, y: -20, yaw: 0 }) };
const bb = { pos: new THREE.Vector3(0, 0, 1), vel: new THREE.Vector3() };
let aiOK = true;
for (let d = 0; d < 4; d++) {
  const o = RTL3D.ai.think(match, cars, bb, d, Math.random, 1 / 30);
  if (typeof o.throttle !== "number" || typeof o.boost !== "boolean") aiOK = false;
}
ok(aiOK, "AI valid across difficulties");
/* 10 demo */
const a = P.makeCar("blue", { x: 0, y: -2.0, yaw: Math.PI / 2 });
const v = P.makeCar("orange", { x: 0, y: -0.5, yaw: -Math.PI / 2 });
a.vel.set(0, 23, 0);
P.carCarCollide(a, v, []);
ok(v.demoT > 0, "supersonic demolition");

/* full random AI-vs-AI smoke: nothing NaNs over 60s */
const m2 = { kickoffRush: false, screen: "play" };
const cs = { AI: P.makeCar("orange", { x: 5, y: 20, yaw: Math.PI }), P1: P.makeCar("blue", { x: -5, y: -20, yaw: 0 }) };
const bl = { pos: new THREE.Vector3(0, 0, P.BALL_R + 4), vel: new THREE.Vector3(2, -3, 0), spin: new THREE.Vector3() };
let clean = true;
for (let i = 0; i < 60 * 120; i++) {
  const i1 = RTL3D.ai.think(m2, cs, bl, 3, Math.random, 1 / 120);
  const i2 = RTL3D.ai.think(m2, cs, bl, 3, Math.random, 1 / 120);
  P.stepCar(cs.P1, i1, 1 / 120);
  P.stepCar(cs.AI, i2, 1 / 120);
  P.carCarCollide(cs.P1, cs.AI, []);
  P.carBallCollide(cs.P1, bl, []);
  P.carBallCollide(cs.AI, bl, []);
  P.stepBall(bl, 1 / 120, []);
  if (!Number.isFinite(bl.pos.x + bl.pos.y + bl.pos.z + cs.P1.pos.x + cs.AI.pos.x)) { clean = false; break; }
}
ok(clean, "60s AI-vs-AI chaos: no NaN, no escape");

console.log("=====================");
console.log("PASS: " + pass + "  FAIL: " + fail);
process.exit(fail ? 1 : 0);

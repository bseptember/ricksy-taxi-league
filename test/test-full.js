/* Full-stack node smoke test: loads ALL js_parts with a fake DOM/canvas and
   asserts bake + drawScene + camera + main-module construction. */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const FILES = [
  "01_constants.js", "02_math.js", "03_sprites.js", "04_audio.js",
  "05_world.js", "06_sim.js", "07_ai.js", "08_events.js",
  "09_render.js", "10_input.js", "11_camera.js", "12_ui.js",
];

/* ---- fake 2D context (no-ops, records calls) ---- */
function fakeCtx() {
  const calls = { drawImage: 0, fillRect: 0, path: 0, fillText: 0 };
  return new Proxy({ _calls: calls }, {
    get(t, prop) {
      if (prop === "_calls") return t._calls;
      if (prop === "canvas") return { width: 800, height: 600 };
      return (...args) => {
        if (prop === "drawImage") t._calls.drawImage++;
        if (prop === "fillRect") t._calls.fillRect++;
        if (prop === "fillText") t._calls.fillText++;
        if (prop === "beginPath" || prop === "fill" || prop === "stroke") t._calls.path++;
        if (prop === "createLinearGradient") return { addColorStop() {} };
        if (prop === "measureText") return { width: 10 };
        return undefined;
      };
    },
    set() { return true; },
  });
}

/* ---- minimal DOM stub ---- */
const listeners = {};
global.window = {
  addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); },
  removeEventListener: () => {},
  devicePixelRatio: 2,
  innerWidth: 390, innerHeight: 844,
  matchMedia: () => ({ matches: false }),
  dispatchEvent: () => {},
  AudioContext: undefined,
};
global.document = {
  createElement: (tag) => {
    if (tag === "canvas") {
      return { width: 0, height: 0, getContext: () => fakeCtx() };
    }
    return {
      style: {}, dataset: {},
      addEventListener: () => {}, appendChild: () => {},
      querySelector: () => null, querySelectorAll: () => [],
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }),
    };
  },
  getElementById: () => ({
    width: 800, height: 600, style: {},
    getContext: () => fakeCtx(),
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  }),
  addEventListener: () => {},
  querySelector: () => null,
  readyState: "loading",
  body: { appendChild: () => {} },
  hidden: false,
};
global.localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {},
};
global.requestAnimationFrame = () => 0;

let passed = 0, failed = 0;
const ok = (c, n) => { if (c) { passed++; console.log("  PASS " + n); } else { failed++; console.log("  FAIL " + n); } };

const src = FILES.map((f) => fs.readFileSync(path.join(ROOT, "js_parts", f), "utf8")).join("\n;\n");
(0, eval)(src + "\n;globalThis.RTL = RTL;");

const RTL = globalThis.RTL;
console.log("Loaded RTL v" + RTL.VERSION + " with modules:", Object.keys(RTL).join(", "));

/* ---- sprites bake with fake canvas ---- */
RTL.spr._makeCanvas = (w, h) => ({ width: w, height: h, getContext: () => fakeCtx() });
RTL.spr.bake();
ok(RTL.spr._cache.taxi_blue && RTL.spr._cache.taxi_blue.length === 1, "taxi_blue baked");
ok(RTL.spr._cache.ball.length === 4, "ball has 4 frames");
ok(RTL.spr._cache.billboard_shisanyama, "shisanyama billboard baked");

/* ---- drawScene with fake ctx ---- */
const ctx = fakeCtx();
const world = RTL.world;
const cars = [
  { id: "P1", team: "blue", x: 34, y: 40, z: 0, vx: 0, vy: 0, vz: 0, heading: 1.5, angVel: 0, boost: 50, boostHeld: false, jumping: false, jumpT: 0, airTime: 0, canJump: true, canFlip: true, flip: { active: false, t: 0, dx: 0, dy: 0 }, carrying: false, carryCd: 0, demo: { active: false, t: 0 }, respawnT: 0, onGround: true, wheelspin: 0 },
  { id: "AI", team: "orange", x: 34, y: 65, z: 0, vx: 0, vy: 0, vz: 0, heading: -1.5, angVel: 0, boost: 50, boostHeld: false, jumping: false, jumpT: 0, airTime: 0, canJump: true, canFlip: true, flip: { active: false, t: 0, dx: 0, dy: 0 }, carrying: true, carryCd: 0, demo: { active: false, t: 0 }, respawnT: 0, onGround: true, wheelspin: 0 },
];
const ball = { x: 34, y: 52.5, z: 2, vx: 0, vy: 0, vz: 0, spin: 0, lastTouch: null, guides: [] };
const view = {
  w: 800, h: 600, cam: { ox: 400, oy: 300, zoom: 4, mode: "CAR" },
  cars, ball, match: { state: "play", score: { blue: 1, orange: 0 }, t: 100 },
  fx: [{ kind: "spark", x: 34, y: 52, z: 1, life: 1, t: 0.2 }],
  camera: { mode: "CAR" }, lightFlicker: 0.7, time: 1.2,
  guides: { active: true, landX: 40, landY: 70, landT: 0.8 },
  trail: [{ x: 34, y: 50, z: 2 }],
  pads: world.boostPads(),
};
let threw = false;
try { RTL.render.drawScene(ctx, view); } catch (e) { threw = true; console.log(e); }
ok(!threw, "drawScene runs without throwing");
ok(ctx._calls.drawImage > 10, "drawScene painted sprites (drawImage x" + ctx._calls.drawImage + ")");

/* ---- pickSizes ---- */
const ps = RTL.render.pickSizes(390, 844, 3);
ok(ps.pixelScale >= 1 && ps.cssW <= 390, "pickSizes mobile sane: " + JSON.stringify(ps));

/* ---- camera ---- */
const cam = { ox: 0, oy: 0, zoom: 4, mode: "CAR", shakeT: 0, shakeAmp: 0 };
RTL.camera.update(cam, cars[0], ball, 0.016, { w: 800, h: 600 });
ok(Number.isFinite(cam.ox) && Number.isFinite(cam.oy) && cam.ready, "CAR cam update finite");
RTL.camera.setMode(cam, "BALL");
RTL.camera.update(cam, cars[0], ball, 0.016, { w: 800, h: 600 });
ok(Number.isFinite(cam.ox) && cam.mode === "BALL", "BALL cam update finite");
RTL.camera.toggle(cam);
ok(cam.mode === "TUNNEL", "toggle cycles to TUNNEL");

/* ---- events ---- */
const g = RTL.events.goal({ score: {} }, "blue", 28);
ok(g.banner === "GOAL!" && g.freezeS > 0, "goal event info");
ok(RTL.events.describe(31) === "TBAGRA!" && RTL.events.describe(9) === "", "describe hype strings");
const ft = RTL.events.fullTime({ overtime: true, score: { blue: 2, orange: 1 }, stats: { shotsBlue: 5, shotsOrange: 3, carryMaxBlue: 4.2, carryMaxOrange: 1.1, demosBlue: 1, demosOrange: 0, savesBlue: 0, savesOrange: 2 } });
ok(ft.title === "GOLDEN GOAL!" && ft.lines.some((l) => l.indexOf("SHOTS 5 - 3") >= 0), "fullTime stats lines");

/* ---- audio no-op safety in node ---- */
let aThrew = false;
try {
  RTL.audio.init(); RTL.audio.play("kick"); RTL.audio.music("match");
  RTL.audio.setMuted(true); RTL.audio.update(0.1); RTL.audio.setMuted(false);
} catch (e) { aThrew = true; console.log(e); }
ok(!aThrew, "audio safe no-ops in node");

/* ---- input module shape ---- */
ok(typeof RTL.input.sample === "function" && typeof RTL.input.attach === "function", "input API present");
const snap = RTL.input.sample({});
ok(typeof snap.throttle === "number", "input sample returns snapshot");

/* ---- ui shape ---- */
ok(typeof RTL.ui.hud === "function" && typeof RTL.ui.drawMenu === "function", "ui API present");

console.log("\n==============================");
console.log(`PASSED: ${passed}  FAILED: ${failed}`);
if (failed) process.exit(1);

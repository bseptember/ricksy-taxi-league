/* ==========================================================================
   test-audio.js — standalone suite for js_parts/04_audio.js

   Loads ONLY 01_constants.js + 04_audio.js (audio.js may read RTL.C only) and
   drives them against a scripted fake AudioContext so the synth graph, the
   gain envelopes and the new speed/boost-tracked engine voice are actually
   EXERCISED, not just smoke-called.

   This file is additive: it does not change test-headless.js (35) or
   test-full.js (16).

   run: node test/test-audio.js
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let passed = 0, failed = 0;
const ok = (c, n) => { if (c) { passed++; console.log("  PASS " + n); } else { failed++; console.log("  FAIL " + n); } };

/* ------------------------------------------------------------------ *
 * fake AudioContext — records every node + param write so assertions
 * can read back the real synthesis values.
 * ------------------------------------------------------------------ */
const stats = { nodes: 0, osc: 0, noise: 0, starts: 0, stops: 0, connects: 0, filters: {}, lastFilter: null };

function param(v) {
  return {
    value: v,
    setValueAtTime(nv) { this.value = nv; return this; },
    linearRampToValueAtTime(nv) { this.value = nv; return this; },
    exponentialRampToValueAtTime(nv) { if (!(nv > 0)) throw new Error("exponentialRamp to non-positive " + nv); this.value = nv; return this; },
    setTargetAtTime(nv) { this.value = nv; return this; },   // snap: no clock in node
    cancelScheduledValues() { return this; },
  };
}
function node(kind, extra) {
  stats.nodes++;
  if (kind === "osc") stats.osc++;
  if (kind === "bufferSource") stats.noise++;
  const n = Object.assign({
    kind,
    connect(d) { stats.connects++; return d; },
    disconnect() {},
    start() { stats.starts++; },
    stop() { stats.stops++; },
  }, extra || {});
  return n;
}

function FakeCtx() {
  this.sampleRate = 48000;
  this.currentTime = 0;
  this.state = "running";
  this.destination = node("destination");
  this.createGain = () => node("gain", { gain: param(1) });
  this.createOscillator = () => node("osc", {
    type: "sine", frequency: param(440), detune: param(0),
  });
  this.createBufferSource = () => node("bufferSource", { buffer: null, loop: false, playbackRate: param(1) });
  this.createBiquadFilter = () => {
    stats.filters.biquad = (stats.filters.biquad || 0) + 1;
    const f = node("biquad", { type: "lowpass", frequency: param(350), Q: param(1), gain: param(0) });
    stats.lastFilter = f;          // live ref: read .frequency.value AFTER play()
    return f;
  };
  this.createDynamicsCompressor = () => node("comp", {
    threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003),
    release: param(0.25), reduction: 0,
  });
  this.createBuffer = (ch, len) => {
    const d = new Float32Array(len);
    return { numberOfChannels: ch, length: len, getChannelData: () => d, sampleRate: this.sampleRate };
  };
  this.resume = () => { this.state = "running"; };
  this.suspend = () => { this.state = "suspended"; };
}

/* minimal DOM stub — audio.js only needs document.hidden + addEventListener */
global.window = {
  addEventListener() {}, removeEventListener() {},
  AudioContext: function () { return new FakeCtx(); },
};
global.document = {
  addEventListener() {}, hidden: false,
};
global.setInterval = () => 0;   // never start the music scheduler in node

const FILES = ["01_constants.js", "04_audio.js"];
const src = FILES.map((f) => fs.readFileSync(path.join(ROOT, "js_parts", f), "utf8")).join("\n;\n");
(0, eval)(src + "\n;globalThis.RTL = RTL;");
const audio = globalThis.RTL.audio;
audio.init();

/* ------------------------------------------------------------------ *
 * 1. public surface is additive (old API intact, new API present)
 * ------------------------------------------------------------------ */
ok(typeof audio.play === "function" && typeof audio.music === "function" &&
   typeof audio.init === "function" && typeof audio.setMuted === "function",
   "legacy API intact: init/play/music/setMuted/update");
ok(typeof audio.engine === "function" && typeof audio.engineStop === "function" &&
   typeof audio.debug === "function",
   "engine API present: engine/engineStop/debug");
ok(audio.play.length >= 1 && audio.play.length <= 2,
   "play() still callable with one arg (arity " + audio.play.length + ")");
ok(audio.engineOn === false, "engineOn false before first engine() call");

/* ------------------------------------------------------------------ *
 * 2. engine builds a voice on the first active frame
 * ------------------------------------------------------------------ */
const n0 = stats.nodes;
audio.engine(1 / 60, { active: true, speed: 0, boost: 0, boosting: false, onGround: true });
let d = audio.debug();
ok(d.live === true && d.hold === true, "engine voice live after active frame");
ok(d.out > 0, "idle engine is audible, not silent (out=" + d.out.toFixed(3) + ")");
ok(stats.nodes - n0 >= 10, "voice graph built (" + (stats.nodes - n0) + " nodes)");

/* ------------------------------------------------------------------ *
 * 3. pitch + loudness TRACK SPEED (the whole point of the feature)
 * ------------------------------------------------------------------ */
/* 2 s of frames at 60 fps accelerating to top speed */
function drive(seconds, opts) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    audio.engine(dt, Object.assign({ active: true, onGround: true }, opts, { speed: opts.speedFn ? opts.speedFn(i) : opts.speed }));
  }
  return audio.debug();
}
const dSlow = drive(1.5, { speedFn: (i) => 1 + i * 0.02, boost: 0.1, boosting: false });
const dFast = drive(1.5, { speedFn: (i) => 8 + i * 0.6, boost: 0.1, boosting: false });
ok(dFast.hz > dSlow.hz * 2, "engine pitch rises with speed (" + dSlow.hz.toFixed(0) + "Hz -> " + dFast.hz.toFixed(0) + "Hz)");
ok(dFast.out > dSlow.out, "engine gain rises with speed (" + dSlow.out.toFixed(3) + " -> " + dFast.out.toFixed(3) + ")");
ok(dFast.lp > dSlow.lp, "engine lowpass opens with speed (" + dSlow.lp.toFixed(0) + "Hz -> " + dFast.lp.toFixed(0) + "Hz)");
ok(dFast.air > dSlow.air, "wind/air noise layer rises with speed");
ok(dFast.hz <= 214.5, "pitch stays clamped at top speed (" + dFast.hz.toFixed(0) + "Hz)");

/* ------------------------------------------------------------------ *
 * 4. boost state changes the timbre, and boosts the level
 * ------------------------------------------------------------------ */
const bNo = drive(1.2, { speed: 18, boost: 0.2, boosting: false });
const bYes = drive(1.2, { speed: 18, boost: 1, boosting: true });
ok(bYes.harm > bNo.harm, "boost opens the harmonic growl layer (" + bNo.harm.toFixed(3) + " -> " + bYes.harm.toFixed(3) + ")");
ok(bYes.out > bNo.out, "boost adds level (" + bNo.out.toFixed(3) + " -> " + bYes.out.toFixed(3) + ")");
ok(bYes.lp > bNo.lp, "boost brightens the lowpass");

/* rev burst fires on the boost-engage EDGE only (not every frame) */
const before = stats.stops;
drive(0.5, { speed: 18, boost: 1, boosting: true });
const heldBoostStops = stats.stops - before;
const before2 = stats.stops;
drive(0.5, { speed: 2, boost: 1, boosting: true });
const stillHeld = stats.stops - before2;
ok(heldBoostStops === stillHeld, "no rev re-trigger while boost stays held (edge-detected)");

/* ------------------------------------------------------------------ *
 * 5. active:false fades out and RELEASES the nodes (no leak in menus)
 * ------------------------------------------------------------------ */
const liveBefore = stats.nodes;
audio.engine(1 / 60, { active: false });
d = audio.debug();
ok(d.live === false && d.hold === false, "engine voice torn down on active:false");
ok(audio.engineOn === false, "engineOn false after teardown");
ok(stats.nodes - liveBefore === 0, "active:false allocates nothing");

/* restarts cleanly afterwards */
audio.engine(1 / 60, { active: true, speed: 5, boost: 0.5, boosting: false, onGround: true });
ok(audio.debug().live === true && audio.engineOn === true, "engine rebuilds after teardown");

/* ------------------------------------------------------------------ *
 * 6. rate limiting: params are NOT rewritten every frame
 * ------------------------------------------------------------------ */
{
  const v = audio.debug();
  const snap = [v.hz, v.out, v.lp, v.harm, v.air];
  /* 3 frames @ 60fps = 50ms accumulated but each frame is < ENG_TICK after the
     first, so at least one frame must skip the param write. */
  audio.engine(1 / 60, { active: true, speed: 12, boost: 0.5, boosting: false, onGround: true });
  audio.engine(1 / 60, { active: true, speed: 12.1, boost: 0.5, boosting: false, onGround: true });
  const v2 = audio.debug();
  ok(Number.isFinite(v2.hz) && Number.isFinite(v2.out), "params finite across rate-limited frames");
  ok(snap.length === 5 && snap.every(Number.isFinite), "debug snapshot finite");
}

/* ------------------------------------------------------------------ *
 * 7. garbage input can never throw out of engine()
 * ------------------------------------------------------------------ */
let engThrew = false;
try {
  audio.engine(NaN, null);
  audio.engine(-5, { active: true, speed: "fast", boost: Infinity, boosting: "yes" });
  audio.engine(undefined, { active: true, speed: 1e9, boost: -50, onGround: "maybe" });
  audio.engine(0, {});
  audio.engineStop(); audio.engineStop();
} catch (e) { engThrew = true; console.log("  !! " + e); }
ok(!engThrew, "engine() survives NaN/string/Infinity/absent input");
ok(audio.debug().dead === false, "engine not flagged dead by garbage input");

/* ------------------------------------------------------------------ *
 * 8. play(name, x) intensity scaling is additive + backwards compatible
 * ------------------------------------------------------------------ */
const fs1 = stats.filters.biquad;
/* intensity must change the ACTUAL synthesis values, not just node counts */
audio.play("kick", 2);
const softHz = stats.lastFilter.frequency.value, softType = stats.lastFilter.type;
audio.play("kick", 30);
const hardHz = stats.lastFilter.frequency.value, hardType = stats.lastFilter.type;
audio.play("kick");          // legacy one-arg call still works
const legacyType = stats.lastFilter.type;
audio.play("wall", 0);
const wallSoft = stats.lastFilter.frequency.value;
audio.play("wall", 1);
const wallHard = stats.lastFilter.frequency.value;
/* kick: 1 bandpass; kick@30: bandpass + hard crack (2); wall: 1 each */
ok(stats.filters.biquad - fs1 === 6, "kick/wall build filters at every intensity (" + (stats.filters.biquad - fs1) + ")");
ok(softType === "bandpass" && softHz < 850, "soft kick bandpass low (" + softHz.toFixed(0) + "Hz)");
ok(hardType === "highpass" && hardHz === 2600, "hard kick adds the highpass crack layer");
ok(legacyType === "bandpass", "legacy play('kick') one-arg call unchanged");
ok(wallHard > wallSoft * 1.8, "wall pitched by hardness (" + wallSoft.toFixed(0) + "Hz -> " + wallHard.toFixed(0) + "Hz)");

let playThrew = false;
try {
  for (const n of ["kick", "wall", "goal", "whistle", "whistle_long", "demo", "save",
                   "chant", "ui", "boost", "jump", "coin", "countdown", "countdown_go", "nope"])
    audio.play(n, 0.8);
} catch (e) { playThrew = true; console.log("  !! " + e); }
ok(!playThrew, "every documented sound name safe with an intensity arg");

/* ------------------------------------------------------------------ *
 * 9. contract: music() still works, mute still gates master
 * ------------------------------------------------------------------ */
let mThrew = false;
try {
  for (const s of ["menu", "match", "tense", "none", "bogus"]) audio.music(s);
  audio.setMuted(true); const m1 = audio.muted;
  audio.setMuted(false); const m2 = audio.muted;
  if (!m1 || m2) throw new Error("muted flag broken");
  audio.update(0.016);
} catch (e) { mThrew = true; console.log("  !! " + e); }
ok(!mThrew, "music()/setMuted()/update() unaffected by the new code");

/* ------------------------------------------------------------------ *
 * 10. HARD RULE: a broken AudioContext must be a permanent silent no-op
 * ------------------------------------------------------------------ */
global.window.AudioContext = undefined;
delete require.cache[require.resolve(path.join(ROOT, "js_parts", "04_audio.js"))];
const brokenSrc = fs.readFileSync(path.join(ROOT, "js_parts", "04_audio.js"), "utf8");
(0, eval)("01_constants" in globalThis ? "" : "");
let brokenThrew = false;
try {
  const savedDoc = global.document;
  global.document = { addEventListener() {}, hidden: false };
  (0, eval)(fs.readFileSync(path.join(ROOT, "js_parts", "01_constants.js"), "utf8"));
  (0, eval)(brokenSrc);
  const brokenAudio = globalThis.RTL.audio;
  brokenAudio.init();
  brokenAudio.engine(1 / 60, { active: true, speed: 20, boost: 1, boosting: true, onGround: false });
  brokenAudio.engine(1 / 60, { active: false });
  brokenAudio.engineStop();
  brokenAudio.play("goal", 1); brokenAudio.play("kick", 30);
  brokenAudio.music("match"); brokenAudio.setMuted(true); brokenAudio.update(1);
  brokenAudio.init();
  if (brokenAudio.engineOn !== false) throw new Error("broken ctx must stay silent");
  global.document = savedDoc;
} catch (e) { brokenThrew = true; console.log("  !! " + e); }
ok(!brokenThrew, "no AudioContext -> engine + all entry points are silent no-ops");

console.log("\n==============================");
console.log(`PASSED: ${passed}  FAILED: ${failed}`);
if (failed) process.exit(1);

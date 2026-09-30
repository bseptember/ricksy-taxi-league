/* ==========================================================================
   RICKSY TAXI LEAGUE — 04_audio.js
   Web Audio synthesis: 14 SFX + 3 generative music states. ZERO files.
   HARD RULE: every entry point try/catch'd — audio can never break gameplay.
   ========================================================================== */
"use strict";

RTL.audio = (function (C) {
  let ac = null;          // AudioContext
  let master = null;
  let comp = null;
  let noiseBuf = null;
  let broken = false;     // context failed -> permanent no-op
  let musicState = "none";
  let schedTimer = null;
  let nextBeat = 0;       // next scheduled note time
  let beatNo = 0;
  let muted = false;
  let lastBoost = 0;

  const now = () => { try { return ac ? ac.currentTime : 0; } catch (e) { return 0; } };

  /* small local math — audio.js may only READ RTL.C, so it deliberately does
     not pull RTL.mathx (module load order + purity of the audio surface). */
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
  /** frame-rate independent exponential approach */
  function damp(cur, tgt, rate, dt) { return cur + (tgt - cur) * (1 - Math.exp(-rate * dt)); }

  function init() {
    if (ac || broken) { resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { broken = true; return; }
      ac = new AC();
      comp = ac.createDynamicsCompressor();
      master = ac.createGain();
      master.gain.value = 0.5;
      comp.connect(master);
      master.connect(ac.destination);
      /* shared noise buffer (1s white noise) */
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      /* music scheduler runs always; gated by musicState */
      nextBeat = ac.currentTime + 0.1;
      schedTimer = setInterval(schedule, 100);
      document.addEventListener("visibilitychange", () => {
        try {
          if (document.hidden) { if (ac) ac.suspend(); }
          else resume();
        } catch (e) { /* */ }
      });
    } catch (e) {
      broken = true; ac = null;
    }
  }

  function resume() {
    try { if (ac && ac.state === "suspended") ac.resume(); } catch (e) { /* */ }
  }

  /* ---------- tiny synth helpers ---------- */
  function env(gainNode, t0, a, peak, dec) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
  }
  function osc(type, f0, t0, dur, peak, f1, dest) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    env(g, t0, 0.008, peak, dur);
    o.connect(g); g.connect(dest || comp);
    o.start(t0); o.stop(t0 + dur + 0.1);
  }
  function noise(t0, dur, peak, filterType, freq, q) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = filterType || "bandpass";
    f.frequency.value = freq || 1200;
    f.Q.value = q || 0.8;
    const g = ac.createGain();
    env(g, t0, 0.005, peak, dur);
    src.connect(f); f.connect(g); g.connect(comp);
    src.start(t0); src.stop(t0 + dur + 0.1);
  }

  /* ---------- SFX ----------
     play(name, x) — `x` is an OPTIONAL 0..1-normalised-by-the-caller intensity
     (or a raw magnitude the case clamps itself). Backwards compatible: every
     existing `play("kick")` call behaves as before. `kick`/`wall` scale with it
     so a 5 km/h nudge and a 90 km/h banger do not sound identical. */
  function play(name, x) {
    try {
      if (!ac || broken) return;
      resume();
      const t = now() + 0.01;
      switch (name) {
        case "kick": {
          /* x = ball speed in m/s (sim only reports {hard:bool}, so callers may
             pass Math.hypot(ball.vx,ball.vy) when draining the event).
             No arg = legacy mid-strength hit; explicit 0 = a feather touch. */
          const k = typeof x === "number" && isFinite(x) ? clamp01(x / 30) : 0.5;
          noise(t, 0.06 + 0.05 * k, 0.22 + 0.32 * k, "bandpass", 700 + 1500 * k, 1.1);
          osc("triangle", 1250 + 900 * k, t, 0.035, 0.05 + 0.11 * k);
          osc("sine", 130 + 45 * k, t, 0.1 + 0.06 * k, 0.26 + 0.34 * k, 52);
          if (k > 0.7) noise(t + 0.004, 0.11, 0.14 * k, "highpass", 2600);
          break;
        }
        case "wall": {
          const w = typeof x === "number" && isFinite(x) ? clamp01(x) : 0.45;
          noise(t, 0.04 + 0.04 * w, 0.14 + 0.28 * w, "highpass", 2200 + 2600 * w);
          osc("triangle", 180 + 120 * w, t, 0.05, 0.1 + 0.16 * w, 70);
          break;
        }
        case "goal": {
          /* vuvuzela-ish chord, pitch bends up */
          for (const [f, p] of [[220, 0.22], [277, 0.18], [330, 0.16]]) {
            osc("sawtooth", f, t, 0.85, p, f * 1.06);
          }
          /* crowd swell */
          noise(t, 1.6, 0.35, "bandpass", 700, 0.5);
          noise(t + 0.15, 1.3, 0.25, "bandpass", 1600, 0.4);
          break;
        }
        case "whistle":
          osc("square", 2200, t, 0.09, 0.14);
          osc("square", 2200, t + 0.14, 0.09, 0.14);
          break;
        case "whistle_long":
          osc("square", 2200, t, 0.16, 0.16);
          osc("square", 2200, t + 0.22, 0.16, 0.16);
          osc("square", 2200, t + 0.44, 0.5, 0.16);
          break;
        case "demo":
          noise(t, 0.4, 0.6, "lowpass", 900);
          osc("sine", 200, t, 0.4, 0.7, 40);
          break;
        case "save":
          osc("square", 660, t, 0.08, 0.16);
          osc("square", 990, t + 0.09, 0.12, 0.16);
          break;
        case "chant":
          noise(t, 0.5, 0.4, "bandpass", 500, 0.6);
          noise(t + 0.55, 0.35, 0.55, "bandpass", 800, 0.6);
          break;
        case "ui":
          osc("square", 880, t, 0.06, 0.12);
          break;
        case "boost":
          if (t - lastBoost > 1 / 6) {
            noise(t, 0.1, 0.14, "highpass", 2500);
            lastBoost = t;
          }
          break;
        case "jump":
          osc("square", 300, t, 0.12, 0.14, 600);
          break;
        case "coin":
          osc("square", 660, t, 0.05, 0.12);
          osc("square", 880, t + 0.05, 0.05, 0.12);
          osc("square", 1320, t + 0.1, 0.06, 0.12);
          break;
        case "countdown":
          osc("sine", 440, t, 0.1, 0.25);
          break;
        case "countdown_go":
          osc("sine", 880, t, 0.25, 0.3);
          break;
      }
    } catch (e) { /* never break gameplay */ }
  }

  /* ======================================================================
     PLAYER ENGINE VOICE — the game's one continuous sound source.
     The sim/camera are silent: without this the game is a slideshow with
     occasional beeps. This is a single always-running synth voice whose
     pitch, brightness and loudness track the player's car speed and boost
     state, so acceleration, top speed and boosting are all *audible*.

     WIRING (13_main.js frame loop, once per rendered frame — see 13_main):
         audio.engine(dt, {
           active:    S.screen === "playing" && !S.paused,
           speed:     Math.hypot(car.vx, car.vy),   // m/s
           boost:     car.boost / C.MAX_BOOST,      // 0..1 remaining
           boosting:  car.boostHeld,                // bool, for the rev burst
           onGround:  car.onGround,
         });
     `active:false` fades the voice out and releases every node, so menus,
     pause and full-time cost zero audio CPU.

     COST: 5 oscillators + 1 looped noise source, built ONCE and reused;
     params are only touched at ~25 Hz via setTargetAtTime (no zipper noise,
     no per-frame node churn — keeps the "60fps on a mid phone" invariant).
     SAFETY: every entry point is try/catch'd; a single throw sets
     ENG.dead and the voice is permanently off. Audio can never break
     gameplay (AGENTS.md invariant 5).
     ====================================================================== */
  const ENG = {
    v: null,       // live voice node refs, or null when torn down
    dead: false,   // a throw happened -> permanently disabled
    hold: false,   // caller wants the engine audible
    sp: 0,         // smoothed speed 0..1
    bst: 0,        // smoothed boost 0..1
    air: 0,        // smoothed airborne 0..1
    acc: 0,        // param-write accumulator
    revCd: 0,      // rev-burst cooldown (s)
  };
  const ENG_IDLE_HZ = 54;   // Hz at a standstill
  const ENG_TOP_HZ = 214;   // Hz flat out
  const ENG_SPAN = 26;      // m/s that maps to full throttle (sim tops ~24)
  const ENG_TICK = 0.04;    // param writes at 25 Hz

  function buildEngine() {
    const t = ac.currentTime;
    const out = ac.createGain(); out.gain.value = 0;
    /* body: detuned saw + square through a lowpass that opens with revs */
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 620; lp.Q.value = 0.7;
    const bodyG = ac.createGain(); bodyG.gain.value = 0.5;
    const o1 = ac.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = ENG_IDLE_HZ;
    const o2 = ac.createOscillator(); o2.type = "square"; o2.frequency.value = ENG_IDLE_HZ * 2;
    o2.detune.value = 7;
    const sub = ac.createOscillator(); sub.type = "sine"; sub.frequency.value = ENG_IDLE_HZ * 0.5;
    const subG = ac.createGain(); subG.gain.value = 0.55;
    /* boost harmonic layer (3rd) — the "it caught air" growl */
    const o3 = ac.createOscillator(); o3.type = "square"; o3.frequency.value = ENG_IDLE_HZ * 3;
    const harmG = ac.createGain(); harmG.gain.value = 0;
    /* wind/air: looped noise, bandpass opens with speed */
    const airSrc = ac.createBufferSource(); airSrc.buffer = noiseBuf; airSrc.loop = true;
    const airF = ac.createBiquadFilter(); airF.type = "bandpass"; airF.frequency.value = 700; airF.Q.value = 1.2;
    const airG = ac.createGain(); airG.gain.value = 0;
    /* idle rumble: slow LFO on the voice gain so a parked taxi still lives */
    const lfo = ac.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 5.5;
    const lfoG = ac.createGain(); lfoG.gain.value = 0.012;

    o1.connect(bodyG); o2.connect(bodyG); bodyG.connect(lp);
    sub.connect(subG); subG.connect(lp);
    o3.connect(harmG); harmG.connect(lp);
    airSrc.connect(airF); airF.connect(airG); airG.connect(lp);
    lp.connect(out);
    lfo.connect(lfoG); lfoG.connect(out.gain);
    out.connect(comp);
    for (const o of [o1, o2, o3, sub, lfo]) o.start(t);
    airSrc.start(t);
    return { out, lp, o1, o2, o3, sub, harmG, airF, airG, airSrc, lfo, lfoG };
  }

  /** ramp the voice out and release every node it owns */
  function killEngine() {
    const v = ENG.v; ENG.v = null;
    try {
      if (!v || !ac) return;
      const t = ac.currentTime;
      try { v.out.gain.cancelScheduledValues(t); v.out.gain.setTargetAtTime(0, t, 0.04); } catch (e) { /* */ }
      const stopAt = t + 0.4;
      for (const o of [v.o1, v.o2, v.o3, v.sub, v.lfo, v.airSrc]) { try { o.stop(stopAt); } catch (e) { /* */ } }
      try { v.lfoG.disconnect(); v.out.disconnect(); } catch (e) { /* */ }
    } catch (e) { /* */ }
  }

  /** push the current smoothed state onto the live voice */
  function applyEngine() {
    const v = ENG.v;
    if (!v) return;
    const t = ac.currentTime;
    const sp = ENG.sp, bs = ENG.bst, air = ENG.air;
    /* exponential pitch map: reads like a gearbox, not a siren */
    const hz = ENG_IDLE_HZ * Math.pow(ENG_TOP_HZ / ENG_IDLE_HZ, sp);
    const lvl = ENG.hold ? 0.055 + 0.115 * sp + 0.05 * bs : 0;
    v.o1.frequency.setTargetAtTime(hz, t, 0.045);
    v.o2.frequency.setTargetAtTime(hz * 2, t, 0.045);
    v.o3.frequency.setTargetAtTime(hz * 3, t, 0.045);
    v.sub.frequency.setTargetAtTime(hz * 0.5, t, 0.06);
    v.lp.frequency.setTargetAtTime(620 + 2100 * sp + 1400 * bs, t, 0.06);
    v.harmG.gain.setTargetAtTime(0.05 + 0.2 * bs, t, 0.05);
    v.airF.frequency.setTargetAtTime(600 + 2600 * sp, t, 0.08);
    v.airG.gain.setTargetAtTime(0.02 + 0.1 * sp * sp + 0.09 * bs + 0.03 * air, t, 0.08);
    v.lfoG.gain.setTargetAtTime(0.012 * (1 - 0.75 * sp), t, 0.1);
    v.out.gain.setTargetAtTime(lvl, t, ENG.hold ? 0.06 : 0.05);
  }

  /** one-shot "rev up" chirp + hiss when the boost actually engages */
  function revBurst() {
    try {
      if (!ENG.v || !ac) return;
      const t = ac.currentTime;
      const f0 = Math.max(30, ENG_IDLE_HZ * Math.pow(ENG_TOP_HZ / ENG_IDLE_HZ, ENG.sp) * 0.9);
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.7, t + 0.22);
      env(g, t, 0.02, 0.09, 0.24);
      o.connect(g); g.connect(comp);
      o.start(t); o.stop(t + 0.36);
      const n = ac.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
      const nf = ac.createBiquadFilter(); nf.type = "highpass"; nf.frequency.value = 2200;
      const ng = ac.createGain(); env(ng, t, 0.01, 0.07, 0.2);
      n.connect(nf); nf.connect(ng); ng.connect(comp);
      n.start(t); n.stop(t + 0.32);
    } catch (e) { /* the rev is cosmetic */ }
  }

  /** per-frame entry point. opts: {active, speed, boost, boosting, onGround} */
  function engine(dt, o) {
    try {
      if (ENG.dead || broken) return;
      const p = o || {};
      const d = num(dt) > 0 ? Math.min(num(dt), 0.25) : 1 / 60;
      /* no context yet (or it died) -> stay silent, remember nothing */
      if (!ac || !comp || !noiseBuf) { ENG.hold = false; return; }
      if (p.active === false) {           /* explicit off: fade + release */
        ENG.hold = false; ENG.sp = 0; ENG.bst = 0; ENG.air = 0; ENG.acc = 0;
        if (ENG.v) { killEngine(); }
        return;
      }
      ENG.hold = true;
      /* first frame writes params immediately (ENG.acc pre-loaded past the
         25 Hz gate) so the voice never starts with a silent 50 ms gap */
      if (!ENG.v) { ENG.v = buildEngine(); ENG.acc = ENG_TICK; }
      /* boost-engage edge -> rev chirp (checked every frame, not rate-limited) */
      const bsT = clamp01(num(p.boost)) || (p.boosting ? 1 : 0);
      ENG.revCd -= d;
      if (bsT > 0.5 && ENG.bst <= 0.5 && ENG.revCd <= 0) { revBurst(); ENG.revCd = 0.5; }
      /* smooth toward targets, then write params at 25 Hz */
      ENG.acc += d;
      if (ENG.acc < ENG_TICK) return;
      const sdt = ENG.acc; ENG.acc = 0;
      const spT = clamp01(num(p.speed) / ENG_SPAN);
      ENG.sp = damp(ENG.sp, spT, spT > ENG.sp ? 5.5 : 3.2, sdt);
      ENG.bst = damp(ENG.bst, bsT, bsT > ENG.bst ? 9 : 4.5, sdt);
      ENG.air = damp(ENG.air, p.onGround === false ? 1 : 0, 4, sdt);
      applyEngine();
    } catch (e) { ENG.dead = true; ENG.v = null; }
  }

  /** hard stop (menu quit / match end / teardown) */
  function engineStop() {
    try { ENG.hold = false; ENG.sp = 0; ENG.bst = 0; ENG.air = 0; killEngine(); }
    catch (e) { ENG.dead = true; ENG.v = null; }
  }

  /* QA/debug handle (same style as RTL.spr._cache) — read-only snapshot of
     the live voice. Returns zeroes when the engine is not running. */
  function debug() {
    const v = ENG.v;
    return {
      live: !!v, hold: ENG.hold, dead: ENG.dead,
      sp: ENG.sp, bst: ENG.bst, air: ENG.air,
      hz: v ? v.o1.frequency.value : 0,
      out: v ? v.out.gain.value : 0,
      lp: v ? v.lp.frequency.value : 0,
      harm: v ? v.harmG.gain.value : 0,
      air: v ? v.airG.gain.value : 0,
    };
  }

  /* ---------- music: generative A-minor pentatonic ---------- */
  const PENTA = [220, 261.6, 293.7, 329.6, 392, 440]; // A minor pentatonic-ish
  function schedule() {
    try {
      if (!ac || broken || musicState === "none" || muted) return;
      if (ac.state !== "running") return;
      const bpm = musicState === "tense" ? 140 : musicState === "match" ? 128 : 96;
      const beat = 60 / bpm / 2; // 8th notes
      while (nextBeat < ac.currentTime + 0.25) {
        const t = nextBeat;
        const b = beatNo++;
        if (musicState === "menu") {
          /* laid-back plucks */
          if (b % 2 === 0) {
            const n = PENTA[Math.floor(Math.random() * PENTA.length)] * (Math.random() < 0.2 ? 2 : 1);
            osc("triangle", n, t, 0.5, 0.07);
          }
          if (b % 8 === 0) osc("sine", 110, t, 0.9, 0.09);
        } else if (musicState === "match") {
          /* driving bass + hats */
          if (b % 2 === 0) osc("sawtooth", b % 8 === 4 ? 146.8 : 110, t, 0.16, 0.12);
          noise(t, 0.03, b % 2 ? 0.05 : 0.08, "highpass", 6000);
          if (b % 4 === 2 && Math.random() < 0.7) {
            osc("triangle", PENTA[Math.floor(Math.random() * PENTA.length)], t, 0.2, 0.05);
          }
        } else if (musicState === "tense") {
          /* faster + tremolo drone */
          if (b % 2 === 0) osc("sawtooth", b % 8 < 4 ? 110 : 116.5, t, 0.14, 0.13);
          noise(t, 0.03, 0.09, "highpass", 6500);
          if (b % 8 === 0) {
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = "sawtooth"; o.frequency.value = 220;
            const lfo = ac.createOscillator(), lg = ac.createGain();
            lfo.frequency.value = 7; lg.gain.value = 0.04;
            lfo.connect(lg); lg.connect(g.gain);
            g.gain.value = 0.05;
            o.connect(g); g.connect(comp);
            o.start(t); o.stop(t + 1.1);
            lfo.start(t); lfo.stop(t + 1.1);
          }
        }
        nextBeat += beat;
      }
    } catch (e) { /* */ }
  }

  function music(state) {
    try {
      musicState = state;
      if (ac) nextBeat = Math.max(nextBeat, ac.currentTime + 0.05);
    } catch (e) { /* */ }
  }
  function setMuted(v) {
    muted = !!v;
    try { if (master) master.gain.value = muted ? 0 : 0.5; } catch (e) { /* */ }
  }
  function update(dt) { /* scheduler runs on setInterval; nothing needed */ }

  return {
    init, play, music, setMuted, update,
    /* engine voice (speed/boost tracked) — additive, nothing above removed */
    engine, engineStop, debug,
    get muted() { return muted; },
    get engineOn() { return ENG.v !== null && ENG.hold; },
  };
})(RTL.C);

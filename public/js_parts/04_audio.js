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

  /* ---------- SFX ---------- */
  function play(name) {
    try {
      if (!ac || broken) return;
      resume();
      const t = now() + 0.01;
      switch (name) {
        case "kick":
          noise(t, 0.08, 0.5, "bandpass", 900, 1);
          osc("sine", 140, t, 0.12, 0.6, 60);
          break;
        case "wall":
          noise(t, 0.05, 0.3, "highpass", 3000);
          break;
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
    get muted() { return muted; },
  };
})(RTL.C);

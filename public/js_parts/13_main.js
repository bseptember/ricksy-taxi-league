/* ==========================================================================
   RICKSY TAXI LEAGUE — 13_main.js
   Boot, game loop (fixed-dt sim + rAF render), match state machine,
   boost pads, fx pool, ball guides, camera + audio + UI wiring, save/load.
   ========================================================================== */
"use strict";

RTL.main = (function (C, m, W, sim, ai, events, audio, input, cam, ui, render) {
  /* ---------------- persistent ---------------- */
  function save() {
    try {
      localStorage.setItem(C.SAVE_KEY, JSON.stringify({
        muted: audio.muted, guides: S.guides, defaultCam: S.defaultCam,
        difficulty: S.difficulty, assisted: S.assisted,
        stats: S.stats, forceTouch: S.forceTouch,
      }));
    } catch (e) { /* private mode etc. */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(C.SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      S.guides = !!d.guides;
      S.defaultCam = C.CAMS.indexOf(d.defaultCam) >= 0 ? d.defaultCam : "CAR";
      S.difficulty = m.clamp(d.difficulty | 0, 0, 3);
      S.assisted = d.assisted !== false;
      S.stats = d.stats || S.stats;
      S.forceTouch = !!d.forceTouch;
      if (d.muted) audio.setMuted(true);
    } catch (e) { /* corrupt save = ignore */ }
  }

  /* ---------------- session state ---------------- */
  const S = {
    screen: "boot",         // boot|menu|matchSetup|settings|controls|playing|fulltime
    paused: false,
    guides: true,
    defaultCam: "CAR",
    difficulty: 1,
    assisted: true,
    forceTouch: false,
    stats: { played: 0, wins: 0, goals: 0 },
    banner: null,           // {text, sub, t, total, big, color}
    countdown: null,        // '3'|'2'|'1'|'GO!'
    touchMode: false,
    focus: null,
    focusItems: [],
    lightFlicker: 1,
  };

  const match = {
    mode: "match", score: { blue: 0, orange: 0 }, t: C.MATCH_SECONDS,
    state: "countdown", stateT: 0, overtime: false, overtimeGoal: false,
    seed: (Math.random() * 1e9) | 0, kickoffFor: "blue", events: [],
    stats: {},
  };
  const cars = [
    mkCar("P1", "blue"), mkCar("AI", "orange"),
  ];
  function mkCar(id, team) {
    return { id, team, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heading: 0, angVel: 0,
      boost: C.START_BOOST, boostHeld: false, jumping: false, jumpT: 0, airTime: 0,
      canJump: true, canFlip: true, flip: { active: false, t: 0, dx: 0, dy: 0 },
      carrying: false, carryCd: 0, carryT: 0,
      demo: { active: false, t: 0 }, respawnT: 0, onGround: true, wheelspin: 0 };
  }
  const ball = { x: 34, y: 52.5, z: C.BALL_RADIUS, vx: 0, vy: 0, vz: 0, spin: 0,
    lastTouch: null, guides: [] };

  const camState = { ox: 0, oy: 0, zoom: 1, mode: S.defaultCam, shakeT: 0, shakeAmp: 0, vw: 800, vh: 600 };
  let pads = W.boostPads();
  const fx = [];            // pooled particles
  const trail = [];
  let rng = m.rngFrom(match.seed);
  let acc = 0, lastT = 0, timeNow = 0;
  let aiTimer = 0, aiInput = freshInput();
  function freshInput() {
    return { throttle: 0, steer: 0, boost: false, jump: false, jumpEdge: false,
      shoot: false, shootEdge: false, carry: false, carryEdge: false,
      brake: false, fly: false };
  }
  const inputs = { P1: freshInput(), AI: freshInput() };

  /* ---------------- canvas ---------------- */
  let canvas = null, ctx = null, dpr = 1, viewW = 800, viewH = 600, pixelScale = 3;

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    const pick = render.pickSizes(w, h, dpr);
    pixelScale = pick.pixelScale;
    viewW = w; viewH = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    camState.vw = canvas.width; camState.vh = canvas.height;
    ctx.imageSmoothingEnabled = false;
  }

  /* ---------------- fx pool ---------------- */
  function spawnFx(kind, x, y, z, n) {
    for (let i = 0; i < n; i++) {
      if (fx.length >= C.FX_POOL) fx.shift();
      fx.push({
        kind, x, y, z,
        vx: (rng() * 2 - 1) * 6, vy: (rng() * 2 - 1) * 6, vz: rng() * 7 + 2,
        life: kind === "confetti" ? 1.6 : 0.5 + rng() * 0.3, t: 0,
      });
    }
  }
  function stepFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i];
      p.t += dt;
      if (p.t >= p.life) { fx.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.z += p.vz * dt; p.vz -= 14 * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.4; }
    }
  }

  /* ---------------- ball landing guide ---------------- */
  const guide = { landX: 0, landY: 0, landT: 0, active: false };
  function computeGuide() {
    guide.active = false;
    if (!S.guides || ball.z <= C.BALL_RADIUS + 0.05) return;
    /* ballistic prediction with drag+bounce, up to 3s */
    let x = ball.x, y = ball.y, z = ball.z, vx = ball.vx, vy = ball.vy, vz = ball.vz;
    const dt = 1 / 60;
    for (let t = 0; t < 3; t += dt) {
      vz -= C.GRAVITY * dt;
      x += vx * dt; y += vy * dt; z += vz * dt;
      const cl = W.clampToPitch(x, y, z, C.BALL_RADIUS);
      x = cl.x; y = cl.y;
      if (cl.hitWall) { vx *= -C.BALL_WALL_BOUNCE; vy *= -C.BALL_WALL_BOUNCE; }
      if (z <= C.BALL_RADIUS) {
        guide.landX = x; guide.landY = y; guide.landT = t; guide.active = true;
        return;
      }
    }
    guide.landX = x; guide.landY = y; guide.landT = 3; guide.active = true;
  }

  /* ---------------- match flow ---------------- */
  function startMatch(mode) {
    match.mode = mode;
    match.score.blue = 0; match.score.orange = 0;
    match.t = C.MATCH_SECONDS;
    match.overtime = false; match.overtimeGoal = false;
    match.seed = (Math.random() * 1e9) | 0;
    match.kickoffFor = "blue";
    match.stats = { shotsBlue: 0, shotsOrange: 0, carryMaxBlue: 0, carryMaxOrange: 0, demosBlue: 0, demosOrange: 0, savesBlue: 0, savesOrange: 0 };
    rng = m.rngFrom(match.seed);
    pads = W.boostPads();
    fx.length = 0; trail.length = 0;
    camState.mode = S.defaultCam;
    doKickoff(true);
    S.screen = "playing"; S.paused = false;
    S.banner = null; S.countdown = null;
    audio.music("match");
  }

  function doKickoff(first) {
    sim.kickoff(match, cars, ball);
    /* align cars to events.kickoffPose formation (heading + variety) */
    const pose = events.kickoffPose(match);
    for (const p of pose.cars) {
      const car = cars.find((c) => c.id === p.id);
      if (car) { car.x = p.x; car.y = p.y; car.heading = p.heading; }
    }
    ball.x = pose.ball.x; ball.y = pose.ball.y;
    ball.z = C.BALL_RADIUS; ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.lastTouch = null;
    trail.length = 0;
    guide.active = false;
    if (!first) audio.play("whistle");
    /* load-shedding flicker on some kickoffs (deterministic per seed) */
    S.lightFlicker = (Math.floor(m.hash(match.seed) * 3) === 0) ? 0.55 : 1;
    cam.snap(camState, cars[0], ball, 1 / 60, { w: canvas.width, h: canvas.height });
  }

  function endMatch() {
    match.state = "over";
    S.screen = "fulltime";
    S.stats.played++;
    if (match.score.blue > match.score.orange) S.stats.wins++;
    S.stats.goals += match.score.blue;
    ui.fullTime = events.fullTime(match);
    save();
    audio.music("menu");
    audio.play("whistle_long");
  }

  /* ---------------- per-frame event drain ---------------- */
  function drainEvents() {
    for (const e of match.events) {
      if (e.type === "goal") {
        match.score[e.team]++;
        const info = events.goal(match, e.team, e.speed);
        S.banner = { text: "GOAL!", sub: info.sub + "  " + events.describe(e.speed),
          t: info.freezeS, total: info.freezeS, big: true,
          color: e.team === "blue" ? C.COLORS.blue : C.COLORS.orange };
        audio.play("goal");
        if (e.speed >= 25) audio.play("chant");
        camState.shakeT = 0.4; camState.shakeAmp = 7;
        spawnFx("confetti", ball.x, ball.y, 2, 26);
        if (match.overtime) match.overtimeGoal = true;
      } else if (e.type === "wallbang") {
        audio.play("wall");
        spawnFx("spark", e.x, e.y, 0.6, e.hard ? 8 : 3);
      } else if (e.type === "demo") {
        audio.play("demo");
        camState.shakeT = 0.3; camState.shakeAmp = 5;
        const v = cars.find((c) => c.id === e.victim);
        if (v) spawnFx("smoke", v.x, v.y, 1, 14);
        match.stats[e.by === "P1" ? "demosBlue" : "demosOrange"]++;
      } else if (e.type === "save") {
        audio.play("save");
        S.banner = { text: "WHAT A SAVE!", sub: "", t: 1.2, total: 1.2, big: false, color: C.COLORS.good };
        match.stats[e.team === "blue" ? "savesBlue" : "savesOrange"]++;
      } else if (e.type === "shot") {
        match.stats[e.team === "blue" ? "shotsBlue" : "shotsOrange"]++;
      } else if (e.type === "kickoff") {
        /* main drives kickoffs */
      }
    }
    match.events.length = 0;
  }

  /* ---------------- boost pads (main-owned) ---------------- */
  function stepPads(dt) {
    for (const p of pads) {
      if (!p.active) { p.t -= dt; if (p.t <= 0) p.active = true; continue; }
      for (const car of cars) {
        if (car.demo.active) continue;
        const d2 = m.dist2(car.x, car.y, p.x, p.y);
        const r = p.big ? 2.2 : 1.6;
        if (d2 < r * r && car.boost < C.MAX_BOOST) {
          car.boost = Math.min(C.MAX_BOOST, car.boost + (p.big ? 100 : 12));
          p.active = false; p.t = p.big ? 10 : 4;
          if (car.id === "P1") audio.play("coin");
        }
      }
    }
  }

  /* ---------------- assisted fly (G key / fly input) ---------------- */
  function stepFly(car, inp, dt) {
    if (!S.assisted || !inp.fly || car.onGround || car.demo.active) return;
    const dx = ball.x - car.x, dy = ball.y - car.y, dz = ball.z - car.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    if (l > 26) return;
    const a = C.FLY_BOOST_AIR_ACCEL * dt / l;
    car.vx += dx * a; car.vy += dy * a;
    if (dz > 0.5) car.vz += Math.min(10, dz) * dt * 8;
  }

  /* ---------------- SIM step (fixed dt) ---------------- */
  function simTick(dt) {
    /* build P1 input */
    const p1 = inputs.P1;
    input.sample(p1);
    /* AI thinks at 30 Hz */
    aiTimer -= dt;
    if (aiTimer <= 0) {
      aiTimer = 1 / 30;
      const think = ai.think(match, cars, ball, S.difficulty, rng, 1 / 30);
      inputs.AI.throttle = think.throttle; inputs.AI.steer = think.steer;
      inputs.AI.boost = !!think.boost; inputs.AI.jumpEdge = !!think.jump;
      inputs.AI.shootEdge = !!think.shoot; inputs.AI.carryEdge = !!think.carry;
      inputs.AI.brake = !!think.brake;
    }
    /* stats: carry time + shots */
    for (const car of cars) {
      if (car.carrying) {
        car.carryT += dt;
        const key = car.id === "P1" ? "carryMaxBlue" : "carryMaxOrange";
        match.stats[key] = Math.max(match.stats[key] || 0, car.carryT);
      } else car.carryT = 0;
    }

    if (match.state === "countdown") {
      match.stateT -= dt;
      const n = Math.ceil(match.stateT);
      S.countdown = n >= 3 ? "3" : n === 2 ? "2" : n === 1 ? "1" : "GO!";
      if (match.stateT <= 0) {
        match.state = "play";
        S.countdown = null;
        audio.play("countdown_go");
      } else if (n !== S._lastCount) {
        S._lastCount = n;
        audio.play("countdown");
      }
      sim.step(match, cars, ball, { P1: p1, AI: inputs.AI }, dt, rng); // idle physics
    } else if (match.state === "play") {
      match.t -= dt;
      if (match.t <= 0) {
        if (match.score.blue !== match.score.orange) {
          match.t = 0;
          endMatch();
          return;
        }
        if (!match.overtime) {
          match.overtime = true;
          match.t = C.OVERTIME_SECONDS;
          audio.music("tense");
          audio.play("whistle");
          match.events.push({ type: "whistle" });
        }
      }
      sim.step(match, cars, ball, { P1: p1, AI: inputs.AI }, dt, rng);
      stepFly(cars[0], p1, dt);
    } else if (match.state === "goal") {
      match.stateT -= dt;
      if (S.banner) S.banner.t -= dt;
      if (match.overtimeGoal) {
        /* golden goal: straight to full time after freeze */
        if (match.stateT <= 0) { endMatch(); return; }
      } else if (match.stateT <= 0) {
        S.banner = null;
        doKickoff(false);
      }
      sim.step(match, cars, ball, { P1: p1, AI: inputs.AI }, dt, rng); // frozen-ish
    }
    stepPads(dt);
    drainEvents();
  }

  /* ---------------- menu actions ---------------- */
  function act(a) {
    audio.init();
    if (a === "playMatch") { audio.play("ui"); S.screen = "matchSetup"; S.focus = "kickoff"; }
    else if (a === "freePlay") { audio.play("ui"); startMatch("free"); }
    else if (a === "settings") { audio.play("ui"); S.screen = "settings"; }
    else if (a === "controls") { audio.play("ui"); S.screen = "controls"; }
    else if (a === "menu") { audio.play("ui"); S.screen = "menu"; }
    else if (a.indexOf("diff:") === 0) { S.difficulty = +a.slice(5); audio.play("ui"); }
    else if (a === "assisted") { S.assisted = true; audio.play("ui"); save(); }
    else if (a === "classic") { S.assisted = false; audio.play("ui"); save(); }
    else if (a === "kickoff") { audio.play("ui"); startMatch("match"); }
    else if (a === "toggleSound") { audio.setMuted(!audio.muted); audio.play("ui"); save(); }
    else if (a === "toggleGuides") { S.guides = !S.guides; audio.play("ui"); save(); }
    else if (a === "cycleCam") {
      const i = (C.CAMS.indexOf(S.defaultCam) + 1) % C.CAMS.length;
      S.defaultCam = C.CAMS[i]; audio.play("ui"); save();
    }
    else if (a === "toggleTouch") { S.forceTouch = !S.forceTouch; audio.play("ui"); save(); }
    else if (a === "resume") { S.paused = false; audio.play("ui"); }
    else if (a === "restartMatch") { audio.play("ui"); startMatch(match.mode); }
    else if (a === "quit") { audio.play("ui"); S.paused = false; S.screen = "menu"; audio.music("menu"); }
    else if (a === "rematch") { audio.play("ui"); startMatch("match"); }
    else if (a === "boot") {
      audio.init();
      audio.music("menu");
      S.screen = "menu";
    }
  }

  /* ---------------- pointer for menus ---------------- */
  let hitRegions = [];
  const hit = {
    add(x, y, w, h, action, focusId) {
      hitRegions.push({ x, y, w, h, action, focusId });
      if (focusId) S.focusItems.push(focusId);
    },
  };
  function onPointer(e) {
    if (S.screen === "boot") return;
    if (S.screen === "playing" && !S.paused) return;
    const r = canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left) * dpr, cy = (e.clientY - r.top) * dpr;
    for (const hreg of hitRegions) {
      if (cx >= hreg.x && cx <= hreg.x + hreg.w && cy >= hreg.y && cy <= hreg.y + hreg.h) {
        if (hreg.focusId) S.focus = hreg.focusId;
        act(hreg.action);
        return;
      }
    }
  }
  function menuKeys(e) {
    if (S.screen === "playing") return false;
    if (e.code === "Enter") {
      const map = {
        boot: "boot", menu: S.focus === "freePlay" ? "freePlay" : "playMatch",
        matchSetup: "kickoff", fulltime: "rematch",
        settings: "toggleSound", paused: "resume",
      };
      if (S.screen === "menu" && S.focus) act(S.focus);
      else if (map[S.screen]) act(map[S.screen]);
      return true;
    }
    if (e.code === "ArrowDown" || e.code === "ArrowUp") {
      const items = S.focusItems;
      if (items.length) {
        let i = items.indexOf(S.focus);
        i = e.code === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        S.focus = items[i];
        audio.play("ui");
      }
      return true;
    }
    return false;
  }

  /* ---------------- touch overlay ---------------- */
  let touchEl = null;
  function ensureTouch() {
    const want = S.forceTouch || ("ontouchstart" in window && window.matchMedia("(pointer: coarse)").matches);
    S.touchMode = want;
    if (want && !touchEl) {
      touchEl = ui.touchOverlay(document.body, true);
      input.bindTouch(touchEl);
      /* cam + pause buttons route to intents */
      touchEl.querySelector('[data-btn="cam"]').addEventListener("touchstart", (e) => {
        e.preventDefault(); input.state.camToggle = true;
      }, { passive: false });
      touchEl.querySelector('[data-btn="pause"]').addEventListener("touchstart", (e) => {
        e.preventDefault(); input.state.pauseToggle = true;
      }, { passive: false });
    } else if (touchEl) {
      touchEl.style.display = want ? "block" : "none";
    }
  }

  /* ---------------- main loop ---------------- */
  function frame(t) {
    requestAnimationFrame(frame);
    if (!ctx) return;
    const dt = Math.min((t - lastT) / 1000 || 0.016, 0.1);
    lastT = t; timeNow += dt;

    /* global intents */
    const st = input.state;
    if (st.muteToggle) { st.muteToggle = false; audio.setMuted(!audio.muted); save(); }
    if (S.screen === "playing") {
      if (st.pauseToggle) { st.pauseToggle = false; S.paused = !S.paused; audio.play("ui"); audio.music(S.paused ? "menu" : match.overtime ? "tense" : "match"); }
      if (st.restart && S.paused) { st.restart = false; startMatch(match.mode); }
      if (st.camToggle) {
        st.camToggle = false;
        if (cam.toggle(camState)) audio.play("ui");
      }
    } else {
      st.pauseToggle = false; st.camToggle = false;
    }

    ensureTouch();

    /* menus process clicks (regions from last frame) */
    if (S.screen !== "playing" || S.paused) hitRegions = [], S.focusItems = [];

    if (S.screen === "playing" && !S.paused) {
      /* fixed-dt accumulator */
      acc += dt;
      let steps = 0;
      while (acc >= C.FIXED_DT && steps < 8) {
        simTick(C.FIXED_DT);
        acc -= C.FIXED_DT; steps++;
        if (S.screen !== "playing") break; // match ended inside tick
      }
      stepFx(dt);
      computeGuide();
      /* ball trail */
      trail.push({ x: ball.x, y: ball.y, z: ball.z });
      if (trail.length > C.TRAIL_LENGTH) trail.shift();
      /* camera */
      cam.update(camState, cars[0], ball, dt, { w: canvas.width, h: canvas.height });
      /* light flicker eases back to 1 */
      S.lightFlicker = m.damp(S.lightFlicker, 1, 0.5, dt);
    } else if (S.screen !== "playing") {
      /* menu idle scene: slow orbit around centre */
      camState.mode = "TUNNEL";
      const ang = timeNow * 0.08;
      const zoomMenu = Math.max(10, canvas.width / 110);
      const cxw = 34 + Math.cos(ang) * 26, cyw = 52.5 + Math.sin(ang) * 26;
      const iv = m.iso(cxw, cyw, 0);
      camState.zoom = m.damp(camState.zoom, zoomMenu, 2, dt);
      camState.ox = m.damp(camState.ox, canvas.width / 2 - iv.u * camState.zoom, 2, dt);
      camState.oy = m.damp(camState.oy, canvas.height * 0.52 - iv.v * camState.zoom, 2, dt);
      stepFx(dt);
      if (S.banner) S.banner.t -= dt;
    } else {
      /* paused: nothing simulates */
    }

    draw();
  }

  function draw() {
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.imageSmoothingEnabled = false;
    render.drawScene(ctx, {
      w, h, cam: camState,
      cars, ball, match, fx,
      playerCar: cars[0],
      camera: { mode: camState.mode },
      lightFlicker: S.lightFlicker,
      time: timeNow,
      guides: guide.active ? guide : null,
      trail,
      pads,
    });
    if (S.screen === "playing") {
      ui.hud(ctx, { w, h, match, time: timeNow, cam: camState, playerCar: cars[0], touchMode: S.touchMode }, S);
      ui.countdown(ctx, { w, h, time: timeNow }, S.countdown);
      ui.banner(ctx, { w, h }, S.banner);
    } else {
      /* dim + menu */
      ui.drawMenu(ctx, { w, h, time: timeNow }, S, hit);
      if (S.screen === "boot") {
        ui.textShadow(ctx, "TAP OR PRESS ANY KEY", w / 2, h * 0.82, Math.max(10, w / 34), C.COLORS.accent, "center");
      }
    }
    if (S.paused && S.screen === "playing") {
      ui.drawMenu(ctx, { w, h, time: timeNow }, Object.assign({}, S, { screen: "paused" }), hit);
    }
  }

  /* ---------------- boot ---------------- */
  function boot() {
    load();
    camState.mode = S.defaultCam;
    canvas = document.getElementById("game");
    ctx = canvas.getContext("2d");
    RTL.spr.bake();
    resize();
    input.attach(canvas);
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", () => setTimeout(resize, 120));
    canvas.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", (e) => {
      if (S.screen === "boot") { act("boot"); return; }
      if (!menuKeys(e)) { /* gameplay keys handled by input */ }
    });
    /* first gesture anywhere unlocks audio */
    const unlock = () => { audio.init(); };
    window.addEventListener("pointerdown", unlock, { once: true });
    /* pause on hide */
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && S.screen === "playing" && !S.paused) {
        S.paused = true;
      }
    });
    /* demo cars idling in menu background */
    sim.kickoff(match, cars, ball);
    audio.music("none");
    try { window.dispatchEvent(new Event("rtl:booted")); } catch (e) { /* old browsers */ }
    requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(frame); });
  }

  /* QA/debug handle (harmless in prod, used by automated verification) */
  const QA = { get match() { return match; }, get cars() { return cars; }, get ball() { return ball; }, get cam() { return camState; }, get ui() { return S; }, startMatch, act };

  if (typeof document !== "undefined") {
    const start = () => boot();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }

  return { boot, startMatch, act, QA, S };
})(RTL.C, RTL.mathx, RTL.world, RTL.sim, RTL.ai, RTL.events,
     RTL.audio, RTL.input, RTL.camera, RTL.ui, RTL.render);

/* ==========================================================================
   RTL3D — rl_game.js
   Three.js scene + game loop: arena (RL-dimensions, retro-flat-lit), taxi
   cars built from boxes, big ball, boost pads, RL cameras (ball cam / car
   cam with smooth swing), match flow (5:00, goals, kickoff countdown,
   overtime golden goal), HUD, boost pads respawn, demos + respawns.
   Controls: WASD drive, SPACE jump/flip, SHIFT/LMB boost, R air-roll,
   B ball-cam toggle, P pause. Touch: stick + buttons.
   ========================================================================== */
"use strict";

RTL3D.game = (function () {
  const P = RTL3D.physics, A = P.ARENA;

  /* ---------------- state ---------------- */
  const S = {
    screen: "menu",          // menu | countdown | play | goal | over
    score: { blue: 0, orange: 0 }, t: 300, stateT: 0,
    overtime: false, overtimeGoal: false,
    ballCam: true, paused: false, muted: false,
    difficulty: 2, countdown: 3,
    events: [], pads: [], stats: { shotsB: 0, shotsO: 0, demosB: 0, demosO: 0 },
  };
  let cars = {}, ball = null;
  let scene, camera, renderer, carMesh = {}, ballMesh;
  let keys = {}, mouseDown = false;
  let lastT = 0, acc = 0, timeNow = 0, aiT = 0;
  let rngSeed = 12345;
  const canvas3d = () => document.getElementById("game3d");

  /* ---------------- arena build ---------------- */
  function buildArena() {
    const g = new THREE.Group();
    // pitch
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(A.W, A.H),
      new THREE.MeshLambertMaterial({ color: 0x2f8f3f })
    );
    pitch.rotation.x = -Math.PI / 2;
    g.add(pitch);
    // mow stripes
    for (let i = 0; i < 10; i += 2) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(A.W, A.H / 10),
        new THREE.MeshLambertMaterial({ color: 0x2a8238 })
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.y = -A.H / 2 + (i + 0.5) * A.H / 10;
      stripe.position.z = 0.01;
      g.add(stripe);
    }
    // lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0xe8f4e0 });
    const mkLine = (pts) => {
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      g.add(new THREE.Line(geo, lineMat));
    };
    const y2 = A.H / 2, x2 = A.W / 2, z = 0.02;
    mkLine([new THREE.Vector3(-x2, -y2, z), new THREE.Vector3(x2, -y2, z)]);
    mkLine([new THREE.Vector3(x2, -y2, z), new THREE.Vector3(x2, y2, z)]);
    mkLine([new THREE.Vector3(x2, y2, z), new THREE.Vector3(-x2, y2, z)]);
    mkLine([new THREE.Vector3(-x2, y2, z), new THREE.Vector3(-x2, -y2, z)]);
    mkLine([new THREE.Vector3(-x2, 0, z), new THREE.Vector3(x2, 0, z)]);
    // centre circle
    const circPts = [];
    for (let i = 0; i <= 32; i++) {
      const a = i / 32 * Math.PI * 2;
      circPts.push(new THREE.Vector3(Math.cos(a) * 9.15, Math.sin(a) * 9.15, z));
    }
    mkLine(circPts);

    // walls (semi-transparent so cameras can see through when outside)
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x1c2a3a, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    const mkWall = (w, h, x, y, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
      m.position.set(x, y, h / 2);
      m.rotation.z = ry || 0;
      if (Math.abs(x) > Math.abs(y)) m.rotation.y = Math.PI / 2;
      g.add(m);
    };
    mkWall(A.H, A.HEIGHT, x2, 0); mkWall(A.H, A.HEIGHT, -x2, 0);
    // end walls split around goal mouth
    const sideW = (A.W - A.GOAL_W) / 2;
    for (const s of [1, -1]) {
      mkWall(sideW, A.HEIGHT, -(A.GOAL_W / 2 + sideW / 2), s * y2, 0);
      mkWall(sideW, A.HEIGHT, (A.GOAL_W / 2 + sideW / 2), s * y2, 0);
      // goal frame + net box
      const goalMat = new THREE.MeshLambertMaterial({ color: 0xf0f0e8, transparent: true, opacity: 0.5 });
      const net = new THREE.Mesh(new THREE.BoxGeometry(A.GOAL_W, A.GOAL_DEPTH, A.GOAL_H), goalMat);
      net.position.set(0, s * (y2 + A.GOAL_DEPTH / 2), A.GOAL_H / 2);
      g.add(net);
    }
    // ceiling
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(A.W, A.H), wallMat);
    ceil.position.z = A.HEIGHT;
    ceil.rotation.x = Math.PI / 2;
    g.add(ceil);
    // corner ramps (visual cylinders quarter)
    for (const sx of [1, -1]) for (const sy of [1, -1]) {
      const ramp = new THREE.Mesh(
        new THREE.CylinderGeometry(A.CORNER_R, A.CORNER_R, A.HEIGHT, 12, 1, true, 0, Math.PI / 2),
        wallMat
      );
      ramp.position.set(sx * (x2 - A.CORNER_R * 0.42), sy * (y2 - A.CORNER_R * 0.29), A.HEIGHT / 2);
      g.add(ramp);
    }
    // floodlight poles for flavour
    for (const sx of [1, -1]) for (const sy of [1, -1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 26, 6), new THREE.MeshLambertMaterial({ color: 0x8fa8c8 }));
      pole.position.set(sx * (x2 + 3), sy * (y2 + 3), 13);
      g.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(4, 1.4, 0.8), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
      lamp.position.set(sx * (x2 + 3), sy * (y2 + 3), 26);
      g.add(lamp);
    }
    return g;
  }

  /* ---------------- cars + ball meshes (boxy taxi) ---------------- */
  function buildTaxi(team) {
    const grp = new THREE.Group();
    const bodyCol = team === "blue" ? 0x2f7fe0 : 0xf07818;
    const roofCol = team === "blue" ? 0x8fd0ff : 0xffd090;
    const body = new THREE.Mesh(new THREE.BoxGeometry(P.CAR.W, P.CAR.L, P.CAR.H), new THREE.MeshLambertMaterial({ color: bodyCol }));
    grp.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(P.CAR.W * 0.85, P.CAR.L * 0.45, 0.42), new THREE.MeshLambertMaterial({ color: roofCol }));
    cabin.position.set(0, -0.1, P.CAR.H / 2 + 0.2);
    grp.add(cabin);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(P.CAR.W + 0.02, 0.3, 0.06), new THREE.MeshBasicMaterial({ color: 0xffd60a }));
    stripe.position.set(0, 0.2, -P.CAR.H / 2 + 0.12);
    grp.add(stripe);
    // wheels
    const wg = new THREE.CylinderGeometry(0.26, 0.26, 0.22, 10);
    const wm = new THREE.MeshLambertMaterial({ color: 0x20242c });
    for (const [wx, wy] of [[-0.75, 0.75], [0.75, 0.75], [-0.75, -0.75], [0.75, -0.75]]) {
      const wheel = new THREE.Mesh(wg, wm);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, wy, -P.CAR.H / 2);
      grp.add(wheel);
    }
    // boost flame (hidden by default)
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 8), new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.9 }));
    flame.rotation.x = Math.PI / 2;
    flame.position.set(0, -P.CAR.L / 2 - 0.55, 0);
    flame.visible = false;
    grp.add(flame);
    grp.userData.flame = flame;
    return grp;
  }
  function buildBall() {
    const geo = new THREE.IcosahedronGeometry(P.BALL_R, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xf2ede2, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    // dark patch vertices (retro look)
    return mesh;
  }

  /* ---------------- boost pads ---------------- */
  function buildPads() {
    S.pads = [];
    const defs = [];
    for (const [x, y, big] of [
      [0, -A.H / 2 + 12, 1], [0, A.H / 2 - 12, 1],
      [-A.W / 2 + 8, 0, 1], [A.W / 2 - 8, 0, 1],
      [0, 0, 1],
      [-18, -22, 0], [18, -22, 0], [-18, 22, 0], [18, 22, 0],
      [-30, 0, 0], [30, 0, 0], [0, -34, 0], [0, 34, 0],
    ]) defs.push({ x, y, big: !!big });
    for (const d of defs) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(d.big ? 1.6 : 0.9, d.big ? 1.6 : 0.9, 0.15, 12),
        new THREE.MeshBasicMaterial({ color: d.big ? 0xff9f1c : 0xffd60a })
      );
      mesh.position.set(d.x, d.y, 0.08);
      scene.add(mesh);
      S.pads.push({ x: d.x, y: d.y, big: d.big, mesh, active: true, t: 0 });
    }
  }

  /* ---------------- cameras ---------------- */
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), initialized: false };
  function updateCamera(dt) {
    const me = cars.P1;
    if (!me) return;
    let targetPos, lookAt;
    if (S.ballCam && ball) {
      // camera behind car along car->ball axis, ball framed ahead
      const dir = new THREE.Vector3().subVectors(me.pos, ball.pos); // ball->car
      dir.z = 0;
      if (dir.lengthSq() < 0.01) dir.set(Math.cos(me.yaw), Math.sin(me.yaw), 0);
      dir.normalize();
      const back = 7.5 + Math.min(4, me.pos.distanceTo(ball.pos) * 0.12);
      targetPos = me.pos.clone().addScaledVector(dir, back).add(new THREE.Vector3(0, 0, 3.1));
      lookAt = ball.pos.clone();
    } else {
      // car cam: behind car heading
      const fwd = new THREE.Vector3(Math.cos(me.yaw), Math.sin(me.yaw), 0);
      targetPos = me.pos.clone().addScaledVector(fwd, -8.2).add(new THREE.Vector3(0, 0, 3.3));
      lookAt = me.pos.clone().addScaledVector(fwd, 6).add(new THREE.Vector3(0, 0, 1));
    }
    if (!cam.initialized) { cam.pos.copy(targetPos); cam.initialized = true; }
    const rate = 1 - Math.exp(-6 * dt);
    cam.pos.lerp(targetPos, rate);
    cam.look.lerp(lookAt, 1 - Math.exp(-9 * dt));
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);
    // keep camera inside arena-ish (above ground, below ceiling)
    camera.position.z = Math.max(1.2, Math.min(A.HEIGHT - 0.5, camera.position.z));
  }

  /* ---------------- input ---------------- */
  function playerInput() {
    const inp = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, boost: false, jump: false, jumpHeld: false, slide: false };
    if (keys.KeyW || keys.ArrowUp) inp.throttle += 1;
    if (keys.KeyS || keys.ArrowDown) inp.throttle -= 1;
    if (keys.KeyA || keys.ArrowLeft) inp.steer -= 1;
    if (keys.KeyD || keys.ArrowRight) inp.steer += 1;
    inp.yaw = inp.steer; inp.pitch = -inp.throttle;
    if (keys.KeyQ) inp.roll = 1;
    if (keys.KeyE) inp.roll = -1;
    if (keys.ShiftLeft || keys.ShiftRight || mouseDown) inp.boost = true;
    if (touch.btn.boost) inp.boost = true;
    if (touch.stick.on) {
      inp.throttle = -touch.stick.dy; inp.steer = touch.stick.dx;
      inp.yaw = touch.stick.dx; inp.pitch = -touch.stick.dy;
    }
    if (keys.Space || touch.btn.jump) {
      if (!S._jumpWas) inp.jump = true;
      inp.jumpHeld = true;
    }
    S._jumpWas = !!(keys.Space || touch.btn.jump);
    if (keys.Space && (keys.KeyA || keys.KeyQ)) inp.roll += keys.KeyE ? 0 : -1;
    return inp;
  }
  const touch = { stick: { on: false, dx: 0, dy: 0 }, btn: { jump: false, boost: false, drift: false } };

  /* ---------------- match flow ---------------- */
  function kickoff() {
    const yBack = A.H / 2 - 26;
    cars.P1.pos.set(-2.5, -yBack, P.CAR.REST_Z); cars.P1.yaw = -Math.PI / 2 + Math.PI; // face +y
    cars.P1.yaw = Math.atan2(A.H / 2 - cars.P1.pos.y, 0 - cars.P1.pos.x) - Math.PI / 2 + Math.PI / 2;
    cars.P1.yaw = Math.atan2(0 - cars.P1.pos.y, 0 - cars.P1.pos.x) * 0 + Math.PI / 2 * 0 + (Math.PI / 2) * 0 + 0;
    cars.P1.yaw = Math.PI / 2 * 0 + (Math.atan2(0 - cars.P1.pos.y, 0 - cars.P1.pos.x));
    cars.P1.vel.set(0, 0, 0); cars.P1.onGround = true; cars.P1.hasJump = true; cars.P1.hasFlip = true;
    cars.P1.demoT = 0; cars.P1.boost = 33.3; cars.P1._pitch = 0; cars.P1._roll = 0;
    cars.P1.basis = P.basisFromYaw(cars.P1.yaw);
    cars.AI.pos.set(2.5, yBack, P.CAR.REST_Z);
    cars.AI.yaw = Math.atan2(0 - cars.AI.pos.y, 0 - cars.AI.pos.x);
    cars.AI.vel.set(0, 0, 0); cars.AI.onGround = true; cars.AI.hasJump = true; cars.AI.hasFlip = true;
    cars.AI.demoT = 0; cars.AI.boost = 33.3; cars.AI._pitch = 0; cars.AI._roll = 0;
    cars.AI.basis = P.basisFromYaw(cars.AI.yaw);
    ball.pos.set(0, 0, P.BALL_R + 6); ball.vel.set(0, 0, 0);
    S.kickoffRush = true;
    S.screen = "countdown"; S.stateT = 3; S.countdown = 3;
    cam.initialized = false;
  }

  function onGoal(team) {
    S.score[team]++;
    S.screen = "goal"; S.stateT = 2.8;
    S.goalBanner = { team, t: 2.8 };
    if (S.overtime) S.overtimeGoal = true;
    try { audioGoal(); } catch (e) {}
  }

  /* ---------------- audio (tiny synth, reuse from RTL if present) ---------------- */
  let actx = null;
  function beep(freq, dur, type, vol, slide) {
    try {
      if (S.muted) return;
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || "square"; o.frequency.value = freq;
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, actx.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.1, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (e) {}
  }
  function audioGoal() { beep(220, 0.7, "sawtooth", 0.16, 240); setTimeout(() => beep(330, 0.5, "sawtooth", 0.14), 120); }

  /* ---------------- loop ---------------- */
  function step(dt) {
    // pads
    for (const p of S.pads) {
      if (!p.active) { p.t -= dt; if (p.t <= 0) { p.active = true; p.mesh.visible = true; } continue; }
      for (const key of ["P1", "AI"]) {
        const c = cars[key];
        if (c.demoT > 0 || c.boost >= 100) continue;
        const dx = c.pos.x - p.x, dy = c.pos.y - p.y;
        if (dx * dx + dy * dy < (p.big ? 4 : 2.5) && Math.abs(c.pos.z) < 2) {
          c.boost = Math.min(100, c.boost + (p.big ? 100 : 12));
          p.active = false; p.t = p.big ? 10 : 4; p.mesh.visible = false;
          if (key === "P1") beep(880, 0.07, "square", 0.08);
        }
      }
    }

    const frozen = S.screen !== "play";
    const pIn = frozen ? { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, boost: false, jump: false, jumpHeld: false } : playerInput();
    let aIn = pIn;
    if (!frozen) {
      aiT -= dt;
      if (aiT <= 0) { aiT = 1 / 30; S._aiIn = RTL3D.ai.think(S, cars, ball, S.difficulty, Math.random, 1 / 30); }
      aIn = S._aiIn || pIn;
    } else {
      aIn = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, boost: false, jump: false, jumpHeld: false };
    }
    P.stepCar(cars.P1, pIn, dt);
    P.stepCar(cars.AI, aIn, dt);
    P.carCarCollide(cars.P1, cars.AI, S.events);
    P.carBallCollide(cars.P1, ball, S.events);
    P.carBallCollide(cars.AI, ball, S.events);
    P.stepBall(ball, dt, frozen ? null : S.events);

    // drain events
    for (const e of S.events) {
      if (e.type === "goal" && S.screen === "play") onGoal(e.team);
      else if (e.type === "kick" && e.team === "P1" && e.hard) beep(160, 0.1, "square", 0.12, 80);
      else if (e.type === "demo") beep(90, 0.4, "sawtooth", 0.18, 40);
      if (e.type === "demo") { if (e.by === "P1") S.stats.demosB++; else S.stats.demosO++; }
    }
    S.events.length = 0;

    // match clock
    if (S.screen === "play") {
      S.t -= dt;
      if (S.t <= 0) {
        if (S.score.blue !== S.score.orange) gameOver();
        else if (!S.overtime) { S.overtime = true; S.t = 60; beep(2200, 0.3, "square", 0.1); }
      }
    } else if (S.screen === "countdown") {
      S.stateT -= dt;
      const n = Math.ceil(S.stateT);
      if (n !== S.countdown && n >= 0) { S.countdown = n; beep(n === 0 ? 880 : 440, n === 0 ? 0.25 : 0.1, "sine", 0.12); }
      if (S.stateT <= 0) { S.screen = "play"; S.kickoffRush = false; }
    } else if (S.screen === "goal") {
      S.stateT -= dt;
      if (S.overtimeGoal && S.stateT <= 0) gameOver();
      else if (S.stateT <= 0) kickoff();
    }

    // respawn demoed cars
    for (const key of ["P1", "AI"]) {
      const c = cars[key];
      if (c.demoT <= 0 && c._wasDemo) {
        const side = key === "P1" ? -1 : 1;
        c.pos.set(0, side * (A.H / 2 - 12), P.CAR.REST_Z);
        c.yaw = key === "P1" ? Math.PI / 2 : -Math.PI / 2;
        c.vel.set(0, 0, 0); c.basis = P.basisFromYaw(c.yaw); c.boost = 33.3;
        c._wasDemo = false; cam.initialized = false;
      }
      if (c.demoT > 0) c._wasDemo = true;
    }
  }

  function gameOver() {
    S.screen = "over"; S.stateT = 0;
    try { beep(2200, 0.15, "square", 0.12); setTimeout(() => beep(2200, 0.4, "square", 0.12), 250); } catch (e) {}
    showOver();
  }

  function syncMeshes(dt) {
    for (const key of ["P1", "AI"]) {
      const c = cars[key], m = carMesh[key];
      m.visible = c.demoT <= 0;
      m.position.copy(c.pos);
      m.rotation.set(-(c._pitch || 0), 0, -(c._roll || 0));
      m.rotation.order = "YXZ";
      m.rotation.y = -c.yaw + Math.PI / 2;
      m.rotation.x = -(c._pitch || 0);
      m.rotation.z = (c._roll || 0);
      m.userData.flame.visible = c.boosting;
      if (m.userData.flame.visible) {
        m.userData.flame.scale.setScalar(0.8 + Math.random() * 0.5);
      }
    }
    ballMesh.position.copy(ball.pos);
    ballMesh.rotation.x += ball.vel.z * dt * 0.5;
    ballMesh.rotation.y += (ball.vel.x + ball.vel.y) * dt * 0.3;
    // pads pulse
    const pulse = 1 + 0.15 * Math.sin(timeNow * 6);
    for (const p of S.pads) if (p.active) p.mesh.scale.setScalar(pulse);
  }

  function drawHud() {
    const el = document.getElementById("hud");
    if (!el) return;
    const mm = Math.max(0, Math.floor(S.t / 60)), ss = Math.max(0, Math.floor(S.t % 60));
    let html = '<div id="scoreboard"><span class="blue">' + S.score.blue + '</span><span class="clock">' +
      (S.overtime ? "+" : "") + mm + ":" + (ss < 10 ? "0" : "") + ss + '</span><span class="orange">' + S.score.orange + '</span></div>';
    html += '<div id="boostwrap"><div id="boostbar" style="width:' + Math.round(cars.P1.boost) + '%"></div><span id="boostnum">' + Math.round(cars.P1.boost) + '</span></div>';
    html += '<div id="camchip">' + (S.ballCam ? "BALL CAM" : "CAR CAM") + ' [B]</div>';
    if (S.screen === "countdown") html += '<div id="countdown">' + (S.countdown > 0 ? S.countdown : "GO!") + '</div>';
    if (S.screen === "goal" && S.goalBanner) {
      html += '<div id="goalbanner" class="' + S.goalBanner.team + '">' + (S.goalBanner.team === "blue" ? "AMANDLA FC SCORES!" : "IBHOKISI FC SCORES!") + '</div>';
    }
    el.innerHTML = html;
  }

  /* ---------------- screens ---------------- */
  function showMenu() {
    document.getElementById("menu").style.display = "flex";
    document.getElementById("over").style.display = "none";
  }
  function hideMenu() { document.getElementById("menu").style.display = "none"; }
  function showOver() {
    const win = S.score.blue > S.score.orange ? "YOU WIN THE DERBY!" : S.score.blue < S.score.orange ? "IBHOKISI FC WINS" : "ALL SQUARE";
    document.getElementById("over-title").textContent = S.overtime ? "GOLDEN GOAL! " + win : "FULL TIME — " + win;
    document.getElementById("over-stats").textContent =
      "GOALS " + S.score.blue + " - " + S.score.orange + "   DEMOS " + S.stats.demosB + " - " + S.stats.demosO;
    document.getElementById("over").style.display = "flex";
  }

  function startMatch() {
    S.score.blue = 0; S.score.orange = 0; S.t = 300; S.overtime = false; S.overtimeGoal = false;
    S.stats = { shotsB: 0, shotsO: 0, demosB: 0, demosO: 0 };
    for (const p of S.pads) { p.active = true; p.mesh.visible = true; }
    hideMenu();
    document.getElementById("over").style.display = "none";
    kickoff();
  }

  /* ---------------- boot ---------------- */
  function boot() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas3d(), antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x120e26);
    scene.fog = new THREE.Fog(0x120e26, 120, 260);
    camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 400);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xfff2d0, 0.9);
    sun.position.set(30, 40, 60);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.3);
    fill.position.set(-40, -30, 30);
    scene.add(fill);

    scene.add(buildArena());
    cars = { P1: P.makeCar("blue", { x: 0, y: -20, yaw: Math.PI / 2 }), AI: P.makeCar("orange", { x: 0, y: 20, yaw: -Math.PI / 2 }) };
    carMesh.P1 = buildTaxi("blue"); carMesh.AI = buildTaxi("orange");
    scene.add(carMesh.P1); scene.add(carMesh.AI);
    ball = { pos: new THREE.Vector3(0, 0, P.BALL_R), vel: new THREE.Vector3(), spin: new THREE.Vector3(), lastTouch: null };
    ballMesh = buildBall();
    scene.add(ballMesh);
    buildPads();

    // resize
    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", resize);
    resize();

    // input
    window.addEventListener("keydown", (e) => {
      keys[e.code] = true;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      if (e.code === "KeyB") { S.ballCam = !S.ballCam; cam.initialized = false; beep(660, 0.05, "square", 0.08); }
      if (e.code === "KeyP" || e.code === "Escape") S.paused = !S.paused;
      if (S.screen === "over" && (e.code === "Enter" || e.code === "Space")) startMatch();
      if (S.screen === "menu" && e.code === "Enter") startMatch();
    });
    window.addEventListener("keyup", (e) => { keys[e.code] = false; });
    canvas3d().addEventListener("mousedown", () => { mouseDown = true; unlockAudio(); });
    window.addEventListener("mouseup", () => { mouseDown = false; });
    canvas3d().addEventListener("contextmenu", (e) => e.preventDefault());

    // touch controls
    bindTouch();

    // menu buttons
    document.querySelectorAll("[data-diff]").forEach((b) => {
      b.addEventListener("click", () => {
        S.difficulty = +b.dataset.diff;
        document.querySelectorAll("[data-diff]").forEach((x) => x.classList.remove("sel"));
        b.classList.add("sel");
        beep(880, 0.05, "square", 0.08);
      });
    });
    document.getElementById("btn-play").addEventListener("click", () => { unlockAudio(); startMatch(); });

    showMenu();
    requestAnimationFrame(loop);
  }

  function unlockAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) {} }

  function bindTouch() {
    const el = document.getElementById("touch");
    if (!el) return;
    const stick = document.getElementById("t-stick");
    const knob = document.getElementById("t-knob");
    let stickId = null;
    stick.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      stickId = t.identifier; touch.stick.on = true; unlockAudio();
      e.preventDefault();
    }, { passive: false });
    stick.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        const r = stick.getBoundingClientRect();
        let dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
        let dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        touch.stick.dx = dx; touch.stick.dy = dy;
        knob.style.transform = "translate(" + dx * 34 + "px," + dy * 34 + "px)";
      }
      e.preventDefault();
    }, { passive: false });
    const sEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { stickId = null; touch.stick.on = false; touch.stick.dx = 0; touch.stick.dy = 0; knob.style.transform = ""; }
      }
      e.preventDefault();
    };
    stick.addEventListener("touchend", sEnd, { passive: false });
    stick.addEventListener("touchcancel", sEnd, { passive: false });

    const bindBtn = (id, prop) => {
      const b = document.getElementById(id);
      if (!b) return;
      b.addEventListener("touchstart", (e) => { touch.btn[prop] = true; unlockAudio(); e.preventDefault(); }, { passive: false });
      b.addEventListener("touchend", (e) => { touch.btn[prop] = false; e.preventDefault(); }, { passive: false });
      b.addEventListener("touchcancel", (e) => { touch.btn[prop] = false; e.preventDefault(); }, { passive: false });
    };
    bindBtn("t-jump", "jump");
    bindBtn("t-boost", "boost");
    const camB = document.getElementById("t-cam");
    if (camB) camB.addEventListener("touchstart", (e) => { S.ballCam = !S.ballCam; cam.initialized = false; e.preventDefault(); }, { passive: false });
    const pauseB = document.getElementById("t-pause");
    if (pauseB) pauseB.addEventListener("touchstart", (e) => { S.paused = !S.paused; e.preventDefault(); }, { passive: false });
  }

  /* ---------------- main loop ---------------- */
  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min((t - lastT) / 1000 || 0.016, 0.1);
    lastT = t; timeNow += dt;
    if (!S.paused && S.screen !== "over" && S.screen !== "menu") {
      acc += dt;
      const h = 1 / 120;
      let n = 0;
      while (acc >= h && n < 8) { step(h); acc -= h; n++; }
    } else if (S.screen === "menu") {
      // idle spin around arena
      const a = timeNow * 0.15;
      camera.position.set(Math.cos(a) * 60, Math.sin(a) * 60, 28);
      camera.lookAt(0, 0, 0);
    }
    if (S.screen !== "menu") {
      syncMeshes(dt);
      if (!S.paused) updateCamera(dt);
      drawHud();
    }
    renderer.render(scene, camera);
  }

  return { boot, S };
})();

/* boot when ready */
if (typeof document !== "undefined") {
  const start = () => { try { RTL3D.game.boot(); } catch (e) { console.error(e); const d = document.getElementById("splash"); if (d) d.textContent = "Failed to start: " + e.message; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
}

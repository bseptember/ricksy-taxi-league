/* ==========================================================================
   RICKSY TAXI LEAGUE — 06_sim.js
   Car-soccer physics: cars (drive/jump/flip/boost/carry/demo), ball
   (gravity/drag/bounce), collisions, walls, goals. Pure sim, fixed dt.
   NOTE: the match CLOCK is owned by 13_main (sim never touches match.t).
   ASSISTED vs CLASSIC: inp.moveX/moveY (screen-space -1..1) present =>
   Assisted mode: car accelerates in SCREEN direction (up-screen = -Y world
   pre-rotation... actually world-space move vector supplied by main which
   accounts for camera rotation). moveVec overrides throttle/steer.
   ========================================================================== */
"use strict";

RTL.sim = (function (C, m, W) {
  const R = C.BALL_RADIUS;

  /* ---------- helpers ---------- */
  function pushEvent(match, e) {
    if (!match.events) match.events = [];
    match.events.push(e);
  }
  function carRadius() { return 1.9; }

  function resetCarPose(car, x, y, heading) {
    car.x = x; car.y = y; car.z = 0;
    car.vx = 0; car.vy = 0; car.vz = 0;
    car.heading = heading; car.angVel = 0;
    car.boost = C.START_BOOST; car.boostHeld = false;
    car.jumping = false; car.jumpT = 0; car.airTime = 0;
    car.canJump = true; car.canFlip = true;
    car.flip.active = false; car.flip.t = 0; car.flip.dx = 0; car.flip.dy = 0;
    car.carrying = false; car.carryCd = 0; car.carryT = 0;
    car.demo.active = false; car.demo.t = 0; car.respawnT = 0;
    car.onGround = true; car.wheelspin = 0;
  }

  /** kickoff poses: blue attacks +Y (goal at y=105), orange attacks -Y. */
  function kickoff(match, cars, ball) {
    for (const car of cars) {
      if (car.team === "blue") resetCarPose(car, 34, 38, Math.PI / 2);
      else resetCarPose(car, 34, 67, -Math.PI / 2);
    }
    ball.x = 34; ball.y = 52.5; ball.z = R;
    ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.spin = 0; ball.lastTouch = null;
    if (ball.guides) ball.guides.length = 0;
    match.state = "countdown";
    match.stateT = C.COUNTDOWN_SECONDS;
    pushEvent(match, { type: "kickoff" });
  }

  /* ---------- car physics ---------- */
  function stepCar(car, inp, dt, opponent, ball, match, rng) {
    /* demolished: frozen, waiting to respawn */
    if (car.demo.active) {
      car.demo.t -= dt;
      car.respawnT -= dt;
      if (car.demo.t <= 0 && car.respawnT <= 0) {
        const defY = car.team === "blue" ? 30 : 75;
        resetCarPose(car, 20 + rng() * 28, defY, car.team === "blue" ? Math.PI / 2 : -Math.PI / 2);
      }
      return;
    }

    car.carryCd = Math.max(0, car.carryCd - dt);
    car.boostHeld = !!(inp.boost && car.boost > 0);

    /* edge-or-level: main/tests may pass shootEdge/jumpEdge latches OR raw
       level bools (AI output). Prefer the edge when the field is present. */
    const shootDown = inp.shootEdge !== undefined ? !!inp.shootEdge : !!inp.shoot;
    const jumpDown = inp.jumpEdge !== undefined ? !!inp.jumpEdge : !!inp.jump;
    let shotThisStep = false;

    const fx = Math.cos(car.heading), fy = Math.sin(car.heading);
    let along = car.vx * fx + car.vy * fy;             // signed forward speed
    let latX = car.vx - fx * along, latY = car.vy - fy * along;
    /* ASSISTED branches write vx/vy directly; the tank recompose below must
       not stomp them (it rebuilds from the PRE-step along/lat snapshot). */
    let assistedStep = false;

    if (car.onGround) {
      /* --- ASSISTED (moveVec): screen-directional, "push where you want to go" --- */
      if (inp.moveVec) {
        assistedStep = true;
        const mvx = inp.moveVec.x, mvy = inp.moveVec.y;
        const ml = Math.hypot(mvx, mvy);
        if (ml > 0.05) {
          const nx = mvx / ml, ny = mvy / ml;
          const wantSpeed = (inp.boost && car.boost > 0 ? C.CAR_BOOST_MAX_SPEED : C.CAR_MAX_SPEED) * Math.min(1, ml);
          // accelerate velocity toward the desired direction
          car.vx += nx * C.CAR_ACCEL * dt;
          car.vy += ny * C.CAR_ACCEL * dt;
          // face movement direction — SMOOTHED (racing feel): the nose swings
          // toward the move direction at up to ~7 rad/s instead of snapping
          // instantly. Instant facing made the car yaw at 8-35 rad/s (spin
          // frames), which no chase camera can track — the root cause of the
          // 37-43deg camera lag in full-lock turns. A smoothed nose keeps the
          // car readable, gives drift character, and drops max yaw rate below
          // the camera's tracking speed.
          const targetH = Math.atan2(ny, nx);
          let dh = targetH - car.heading;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          const yawCap = 7 * dt;
          car.heading += Math.max(-yawCap, Math.min(yawCap, dh));
          // clamp speed
          const sp2 = Math.hypot(car.vx, car.vy);
          if (sp2 > wantSpeed) { car.vx = car.vx / sp2 * wantSpeed; car.vy = car.vy / sp2 * wantSpeed; }
        } else {
          // coast
          const dec = C.CAR_GROUND_FRICTION * dt;
          const sp2 = Math.hypot(car.vx, car.vy);
          if (sp2 <= dec) { car.vx = 0; car.vy = 0; }
          else { car.vx -= car.vx / sp2 * dec; car.vy -= car.vy / sp2 * dec; }
        }
        if (inp.boost && car.boost > 0) {
          car.boost = Math.max(0, car.boost - C.BOOST_USE_PER_SEC * dt);
          car.boostHeld = true;
          car.vx += Math.cos(car.heading) * C.CAR_BOOST_ACCEL * dt;
          car.vy += Math.sin(car.heading) * C.CAR_BOOST_ACCEL * dt;
        } else car.boostHeld = false;
        car.wheelspin += Math.hypot(car.vx, car.vy) * dt * 2.2;

        if (jumpDown && car.canJump) {
          car.vz = C.CAR_JUMP_VZ;
          car.onGround = false; car.z = 0.05;
          car.canJump = false; car.jumping = true; car.jumpT = 0;
          pushEvent(match, { type: "jump", who: car.id });
        }
      } else {
      /* --- CLASSIC: tank steering --- */
      const fwdSpeed = car.vx * fx + car.vy * fy;

      /* --- engine / brake / coast --- */
      const boosting = car.boostHeld;
      if (inp.brake) {
        const dec = C.CAR_BRAKE_DECEL * dt;
        if (Math.abs(along) <= dec) along = 0; else along -= Math.sign(along) * dec;
      } else {
        const maxSp = boosting ? C.CAR_BOOST_MAX_SPEED : C.CAR_MAX_SPEED;
        if (inp.throttle > 0.05) {
          along += (C.CAR_ACCEL + (boosting ? C.CAR_BOOST_ACCEL : 0)) * inp.throttle * dt;
        } else if (inp.throttle < -0.05) {
          if (along > 1) along += C.CAR_BRAKE_DECEL * inp.throttle * dt;  // braking from forward
          else along = Math.max(along + C.CAR_ACCEL * 0.6 * inp.throttle * dt, -9); // reverse
        } else {
          const dec = C.CAR_GROUND_FRICTION * dt;
          if (Math.abs(along) <= dec) along = 0; else along -= Math.sign(along) * dec;
        }
        along = m.clamp(along, -10, maxSp);
      }
      if (boosting) car.boost = Math.max(0, car.boost - C.BOOST_USE_PER_SEC * dt);

      /* --- lateral grip --- */
      const grip = Math.max(0, 1 - C.CAR_LATERAL_GRIP * dt);
      latX *= grip; latY *= grip;

      car.wheelspin += along * dt * 2.2;

      /* --- jump --- */
      if (jumpDown && car.canJump) {
        car.vz = C.CAR_JUMP_VZ;
        car.onGround = false; car.z = 0.05;
        car.canJump = false; car.jumping = true; car.jumpT = 0;
        pushEvent(match, { type: "jump", who: car.id });
      }
      } // end CLASSIC branch
    } else {
      /* --- airborne --- */
      car.airTime += dt;
      car.jumping = false;
      /* Assisted in air: steer velocity toward stick direction (air control) */
      if (inp.moveVec) {
        assistedStep = true;
        const mvx = inp.moveVec.x, mvy = inp.moveVec.y;
        const ml = Math.hypot(mvx, mvy);
        if (ml > 0.05) {
          car.vx += (mvx / ml) * C.CAR_ACCEL * 0.28 * dt;
          car.vy += (mvy / ml) * C.CAR_ACCEL * 0.28 * dt;
          car.heading = Math.atan2(mvy, mvx);
        }
      }
      car.heading += inp.steer * C.CAR_AIR_TURN * dt;
      /* small forward air accel */
      if (inp.throttle > 0.05) {
        const a = C.CAR_ACCEL * 0.28 * dt;
        car.vx += fx * a; car.vy += fy * a;
      }
      /* double-jump / flip — works for BOTH control schemes: CLASSIC uses
         throttle/steer; ASSISTED uses the moveVec screen direction so flip
         direction matches where the player is pushing. */
      if (jumpDown && car.canFlip) {
        car.canFlip = false;
        let dirX, dirY;
        if (inp.moveVec) {
          dirX = inp.moveVec.x; dirY = inp.moveVec.y;
        } else {
          dirX = fx * inp.throttle + fy * inp.steer;
          dirY = fy * inp.throttle - fx * inp.steer;
        }
        const dl = Math.hypot(dirX, dirY);
        if (dl > 0.2) {
          car.flip.active = true; car.flip.t = C.CAR_FLIP_SECONDS;
          car.flip.dx = dirX / dl; car.flip.dy = dirY / dl;
          car.vx += car.flip.dx * C.CAR_FLIP_IMPULSE;
          car.vy += car.flip.dy * C.CAR_FLIP_IMPULSE;
          car.vz = Math.max(car.vz, 2.5);
        } else {
          car.vz = C.CAR_DOUBLE_JUMP_VZ; // plain double jump
        }
      }
      /* aerial boost (Rocket-League style): holding boost + pointing up in
         the air accelerates the car along its NOSE direction including
         upward component. In assisted/2D the "up" input (W = screen-up =
         moveVec.y<0) pitches the nose up; boost then gains height. This is
         what makes aerials possible: jump, tilt nose skyward, hold boost. */
      if (inp.boost && car.boost > 0 && !car.onGround && inp.moveVec) {
        car.boost = Math.max(0, car.boost - C.BOOST_USE_PER_SEC * dt);
        car.boostHeld = true;
        /* assisted 2D: W (up-screen) while airborne = climb */
        car.vz += C.CAR_BOOST_ACCEL * 0.55 * dt;
      } else if (!inp.boost) car.boostHeld = false;
      if (car.flip.active) {
        car.flip.t -= dt;
        car.angVel = 14; // visual spin
        if (car.flip.t <= 0) { car.flip.active = false; car.angVel = 0; }
      }
    }

    /* recompose horizontal velocity (tank path only — Assisted writes vx/vy
       directly and must keep them) */
    if (!assistedStep) {
      car.vx = fx * along + latX;
      car.vy = fy * along + latY;
    }

    /* --- gravity + integrate --- */
    car.vz -= C.GRAVITY * dt;
    car.x += car.vx * dt; car.y += car.vy * dt; car.z += car.vz * dt;

    /* --- ground --- */
    if (car.z <= 0) {
      car.z = 0;
      if (!car.onGround) {
        car.onGround = true; car.canJump = true; car.canFlip = true;
        car.airTime = 0; car.angVel = 0;
        car.flip.active = false;
        car.vz = 0;
      }
    } else {
      car.onGround = false;
    }

    /* --- walls (cars) — WALL DRIVE (Rocket-League style): if the car hits a
       wall while moving fast (>= 60% max speed), it sticks to the wall and
       can drive along it for up to ~1.6s before gravity peels it off. While
       stuck, steering input slides the car ALONG the wall instead of away
       from it. Slow contact = plain bounce (old behavior). */
    const cl = W.clampToPitch(car.x, car.y, 0, carRadius());
    const speedNow = Math.hypot(car.vx, car.vy);
    if (cl.hitWall) {
      car.x = cl.x; car.y = cl.y;
      const fast = speedNow >= C.CAR_MAX_SPEED * 0.6;
      if (fast && car.wallDriveT == null) car.wallDriveT = 0;
      if (car.wallDriveT != null && car.wallDriveT < 1.6) {
        /* stick: keep z pinned slightly up the wall, no bounce */
        car.wallDriveT += dt;
        car.z = Math.max(car.z, 0.4);
        car.onGround = false;           // airborne physics while on wall
        /* damp the into-wall velocity, keep along-wall velocity */
        if (cl.nx !== 0) car.vx *= 0.55;
        if (cl.ny !== 0) car.vy *= 0.55;
        /* moveVec input slides along the wall (tangential) */
        if (inp.moveVec) {
          const tx = cl.nx !== 0 ? 0 : 1, ty = cl.ny !== 0 ? 0 : 1;
          const slide = (inp.moveVec.x * tx + inp.moveVec.y * ty);
          if (cl.nx !== 0) car.vx = -cl.nx * Math.abs(car.vx) * 0.9 + 0; // hug
          if (cl.ny !== 0) car.vy = -cl.ny * Math.abs(car.vy) * 0.9 + 0;
          car.vx += (cl.nx !== 0 ? 0 : slide * C.CAR_ACCEL * dt);
          car.vy += (cl.ny !== 0 ? 0 : slide * C.CAR_ACCEL * dt);
        }
      } else {
        if (cl.nx !== 0) car.vx *= -0.3;
        if (cl.ny !== 0) car.vy *= -0.3;
        car.wallDriveT = null;
      }
    } else if (car.wallDriveT != null) {
      car.wallDriveT = null;
    }

    /* --- shoot BEFORE carry-ride (so a carried ball can be fired this step) --- */
    if (shootDown && !shotThisStep && !car.demo.active) {
      shotThisStep = true;
      if (car.carrying) {
        simShoot(car, ball, match);
      } else {
        /* tap shot: pop the ball if close in front cone */
        const dx = ball.x - car.x, dy = ball.y - car.y;
        const d = Math.hypot(dx, dy);
        const fdot = (dx / (d || 1)) * fx + (dy / (d || 1)) * fy;
        if (d < 3.2 && fdot > 0.5) {
          const g = W.attackGoal(car.team);
          const gx = W.GOAL_CX, gy = g.y;
          let ax = gx - ball.x, ay = gy - ball.y;
          const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
          const sp = C.SHOT_SPEED_MIN * 0.8;
          ball.vx = ax * sp + car.vx * 0.4;
          ball.vy = ay * sp + car.vy * 0.4;
          ball.vz = 3;
          ball.lastTouch = car.id;
          pushEvent(match, { type: "shot", team: car.team });
          pushEvent(match, { type: "kick", who: car.id, hard: false });
        }
      }
    }

    /* --- carry latch --- */
    if (inp.carry && !car.carrying && car.carryCd <= 0 && ball && !car.demo.active) {
      const noseX = car.x + fx * 2.2, noseY = car.y + fy * 2.2;
      const d = m.dist(noseX, noseY, ball.x, ball.y);
      if (d < C.CARRY_RANGE && ball.z < 1.4) {
        car.carrying = true; car.carryT = 0;
        ball.lastTouch = car.id;
        pushEvent(match, { type: "carry", who: car.id });
      }
    }
    if (car.carrying) {
      /* drop conditions: released button, cooldown expiry */
      car.carryT += dt;
      if (!inp.carry || car.carryT >= C.CARRY_MAX_SECONDS || car.z > 0.4) {
        releaseCarry(car, ball, C.CARRY_POP_SPEED * 0.6);
      } else {
        /* ball rides the roof */
        ball.x = car.x + fx * 2.0;
        ball.y = car.y + fy * 2.0;
        ball.z = C.CARRY_HOLD_HEIGHT;
        ball.vx = car.vx; ball.vy = car.vy; ball.vz = 0;
        ball.lastTouch = car.id;
      }
    }

    /* --- demolition check (mutual) --- */
    if (opponent && !opponent.demo.active && opponent.id > car.id) { // handle once per pair
      const dx = opponent.x - car.x, dy = opponent.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 2.4) {
        const rel = Math.hypot(car.vx - opponent.vx, car.vy - opponent.vy);
        /* attacker = the faster one moving toward the other */
        const carToOpp = (car.vx * dx + car.vy * dy) / (d || 1);
        const oppToCar = -(opponent.vx * dx + opponent.vy * dy) / (d || 1);
        if (carToOpp > C.CAR_DEMO_SPEED * 0.85 && carToOpp > oppToCar) {
          demolish(match, opponent, car.id);
        } else if (oppToCar > C.CAR_DEMO_SPEED * 0.85 && oppToCar > carToOpp) {
          demolish(match, car, opponent.id);
        } else {
          /* bump: exchange momentum along normal */
          const nx = dx / (d || 1), ny = dy / (d || 1);
          const p = (car.vx - opponent.vx) * nx + (car.vy - opponent.vy) * ny;
          if (p < 0) {
            car.vx -= nx * p * 0.7; car.vy -= ny * p * 0.7;
            opponent.vx += nx * p * 0.7; opponent.vy += ny * p * 0.7;
          }
          const sep = (2.4 - d) / 2;
          car.x -= nx * sep; car.y -= ny * sep;
          opponent.x += nx * sep; opponent.y += ny * sep;
        }
      }
    }
  }

  function demolish(match, victim, by) {
    victim.demo.active = true;
    victim.demo.t = C.CAR_DEMO_SECONDS;
    victim.respawnT = C.CAR_RESPAWN_SECONDS;
    victim.carrying = false;
    pushEvent(match, { type: "demo", victim: victim.id, by });
  }

  function releaseCarry(car, ball, speed) {
    const fx = Math.cos(car.heading), fy = Math.sin(car.heading);
    car.carrying = false;
    car.carryCd = C.CARRY_COOLDOWN;
    ball.vx = fx * speed + car.vx * 0.5;
    ball.vy = fy * speed + car.vy * 0.5;
    ball.vz = 2;
  }

  /** contract API: shoot from carry — aimed at the attacking goal */
  function simShoot(car, ball, match) {
    const g = W.attackGoal(car.team);
    const gx = W.GOAL_CX + (m.hash(car.carryT * 977) - 0.5) * 2.5; // slight aim variety
    const gy = g.y;
    let ax = gx - ball.x, ay = gy - ball.y;
    const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
    const t = m.clamp(car.carryT / C.CARRY_MAX_SECONDS, 0, 1);
    const sp = m.lerp(C.SHOT_SPEED_MIN, C.SHOT_SPEED_MAX, t);
    car.carrying = false;
    car.carryCd = C.CARRY_COOLDOWN;
    ball.vx = ax * sp; ball.vy = ay * sp; ball.vz = 1.2;
    ball.z = Math.max(ball.z, C.CARRY_HOLD_HEIGHT * 0.8);
    ball.lastTouch = car.id;
    pushEvent(match, { type: "shot", team: car.team });
    pushEvent(match, { type: "kick", who: car.id, hard: true });
  }

  /* ---------- ball physics ---------- */
  function stepBall(ball, dt, match, cars) {
    if (ball.z > R || Math.abs(ball.vz) > 0.5) {
      ball.vz -= C.GRAVITY * dt;
    }
    /* drag */
    const drag = Math.max(0, 1 - C.BALL_DRAG * dt);
    ball.vx *= drag; ball.vy *= drag;

    ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.z += ball.vz * dt;

    /* ground */
    if (ball.z <= R) {
      ball.z = R;
      if (ball.vz < -1.5) {
        ball.vz = -ball.vz * C.BALL_BOUNCE;
      } else {
        ball.vz = 0;
        const roll = Math.max(0, 1 - (1 - C.BALL_GROUND_ROLL_FRICTION) * dt * 3);
        ball.vx *= roll; ball.vy *= roll;
      }
    }

    /* walls */
    const sp = Math.hypot(ball.vx, ball.vy);
    const cl = W.clampToPitch(ball.x, ball.y, ball.z, R);
    if (cl.hitWall) {
      ball.x = cl.x; ball.y = cl.y;
      ball.vx = -ball.vx * C.BALL_WALL_BOUNCE * (cl.nx !== 0 ? 1 : 0) + ball.vx * (cl.nx !== 0 ? 0 : 1);
      ball.vy = -ball.vy * C.BALL_WALL_BOUNCE * (cl.ny !== 0 ? 1 : 0) + ball.vy * (cl.ny !== 0 ? 0 : 1);
      if (sp > 8) pushEvent(match, { type: "wallbang", x: ball.x, y: ball.y, hard: sp > 22 });
    }

    /* car-ball collisions (sphere approx per car: centre circle + nose circle) */
    for (const car of cars) {
      if (car.demo.active) continue;
      const fx = Math.cos(car.heading), fy = Math.sin(car.heading);
      /* pick nearest of centre / nose contact points */
      const cx = car.x, cy = car.y;
      const nx = car.x + fx * 2.2, ny = car.y + fy * 2.2;
      const dC = m.dist(cx, cy, ball.x, ball.y);
      const dN = m.dist(nx, ny, ball.x, ball.y);
      let px_, py_, d;
      if (dN < dC) { px_ = nx; py_ = ny; d = dN; } else { px_ = cx; py_ = cy; d = dC; }
      const radSum = (dN < dC ? 1.5 : 2.1) + R;
      if (d < radSum && Math.abs(ball.z - (car.z + 0.7)) < 2.0) {
        let nxn = (ball.x - px_) / (d || 1), nyn = (ball.y - py_) / (d || 1);
        /* separate */
        ball.x = px_ + nxn * radSum;
        ball.y = py_ + nyn * radSum;
        /* impulse: car velocity along normal drives the ball */
        const cvn = car.vx * nxn + car.vy * nyn;
        const bvn = ball.vx * nxn + ball.vy * nyn;
        if (cvn > bvn - 0.5) {
          const j = Math.max(0, cvn - bvn) * 1.15 + 2.2;
          ball.vx += nxn * j + car.vx * 0.25;
          ball.vy += nyn * j + car.vy * 0.25;
          if (car.vz > 1 || ball.z > 1) ball.vz += Math.max(1.5, car.vz * 0.5);
          ball.lastTouch = car.id;
          const impact = Math.hypot(ball.vx, ball.vy);
          pushEvent(match, { type: "kick", who: car.id, hard: impact > 24 });
          if (impact > 30) pushEvent(match, { type: "shot", team: car.team });
        }
        /* dodge: carrying car loses the ball on hard contact */
        if (car.carrying && Math.abs(cvn - bvn) > 6) releaseCarry(car, ball, 3);
      }
    }

    /* spin decay */
    ball.spin *= Math.max(0, 1 - dt);

    /* goal detection (only live play) */
    if (match.state === "play") {
      for (const team of ["blue", "orange"]) {
        if (W.isInsideGoal(ball.x, ball.y, ball.z, team)) {
          const speed = Math.hypot(ball.vx, ball.vy);
          pushEvent(match, { type: "goal", team, speed });
          if (match.overtime) match.overtimeGoal = true;
          match.state = "goal";
          match.stateT = C.GOAL_FREEZE_SECONDS;
          return;
        }
      }
    }
  }

  /* ---------- main step (contract API) ---------- */
  function step(match, cars, ball, inputs, dt, rng) {
    const p1 = cars[0] && inputs.P1 ? inputs.P1 : null;
    const p2 = inputs.AI || null;
    const car1 = cars.find((c) => c.id === "P1");
    const car2 = cars.find((c) => c.id === "AI");

    const frozen = match.state === "countdown";
    if (!frozen) {
      if (car1) stepCar(car1, p1 || {}, dt, car2, ball, match, rng);
      if (car2) stepCar(car2, p2 || {}, dt, car1, ball, match, rng);
    }
    if (!frozen) stepBall(ball, dt, match, cars);
  }

  return { step, kickoff, shootBall: simShoot, releaseCarry };
})(RTL.C, RTL.mathx, RTL.world);

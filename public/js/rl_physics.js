/* ==========================================================================
   RTL3D — rl_physics.js
   Rocket-League-style 3D physics, hand-rolled (no cannon/ammo needed):
   - Car as an oriented box on a plane: position vec3, yaw+pitch+roll (basis
     matrix), velocity vec3, angular velocity vec3 (local).
   - Ground drive: forward accel, braking, coast friction, lateral grip,
     speed-sensitive yaw steering.
   - Jump: impulse along car UP. Double jump or DODGE FLIP within window
     (flip = torque + directional impulse, cancels vertical velocity partially).
   - Boost: supersonic cap, air control (pitch/yaw torques), aerials work.
   - Ball: sphere vs ground/walls/ceiling + car-box collision via 8 corners.
   - Arena: RL-standard-ish 8192x10240uu scaled 1uu=1cm -> metres/10.
   Units: 1 unit = 1 decimetre-ish (car ~2.4 long). Gravity tuned for game feel.
   ========================================================================== */
"use strict";

RTL3D.physics = (function () {
  const V = THREE.Vector3;
  const ARENA = {
    W: 81.92, H: 102.4, HEIGHT: 20.44,        // field extents (x, y, z up)
    GOAL_W: 17.86, GOAL_H: 6.4, GOAL_DEPTH: 8.8,
    CORNER_R: 11.52,                           // rounded corner radius
  };
  const BALL_R = 0.927;                        // RL ball ~92.75mm * 10 scale
  const CAR = { L: 2.38, W: 1.6, H: 0.76, REST_Z: 0.38 };

  /* tuning (scaled from RL known values, x0.1) */
  const T = {
    GRAVITY: 6.5,
    DRIVE_ACCEL: 18, BRAKE: 35, COAST: 5.25,
    MAX_SPEED: 23, MAX_DRIVE: 14.1, MAX_BOOST_SPEED: 23,
    BOOST_ACCEL: 10.5 + 6.5, BOOST_CONSUME: 33.3,
    JUMP_IMPULSE: 2.9, JUMP_HOLD_ACCEL: 14, JUMP_HOLD_MAX: 0.2,
    DODGE_IMPULSE: 5.5, FLIP_TORQUE: 9,
    AIR_PITCH_TORQUE: 9, AIR_YAW_TORQUE: 9, AIR_ROLL_TORQUE: 12,
    STICKINESS: 25,                    // downforce keeping wheels grounded
    GROUND_YAW_RATE: 2.6, GROUND_YAW_HI: 1.4,
    LAT_GRIP: 10, REVERSE_MAX: 4.2,
    BALL_GRAVITY: 6.5 * 0.92, BALL_BOUNCE_GROUND: 0.6, BALL_BOUNCE_WALL: 0.6,
    BALL_MAX: 60, CAR_BALL_HIT: 1.35,   // velocity transfer factor
    DEMO_SPEED: 21, DEMO_RESPAWN: 3,
  };

  /* ---------- small helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function makeCar(team, spawn) {
    return {
      team, pos: new V(spawn.x, spawn.y, CAR.REST_Z),
      vel: new V(), angLocal: new V(),           // local ang vel (pitch,yaw,roll)
      yaw: spawn.yaw, basis: basisFromYaw(spawn.yaw),
      onGround: true, hasJump: true, hasFlip: true, jumpHoldT: 0,
      flipCarried: null, flipTimer: 0,
      boost: 33.3, boosting: false, supersonic: false,
      demoT: 0, wheelspin: 0,
    };
  }
  function basisFromYaw(yaw) {
    return new V(Math.cos(yaw), Math.sin(yaw), 0); // forward vector
  }
  function carUp(c) {
    // full 3D orientation from accumulated air-control angles.
    // forward = yaw rotated by pitch; up = perpendicular.
    const pitch = c._pitch || 0, roll = c._roll || 0;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fwd = c.basis; // yaw flat
    const forward = new V(fwd.x * cp, fwd.y * cp, sp); // pitched forward
    const worldUp = new V(0, 0, 1);
    const right = new V().crossVectors(forward, worldUp);
    if (right.lengthSq() < 1e-6) right.set(-fwd.y, fwd.x, 0);
    right.normalize();
    const up = new V().crossVectors(right, forward).normalize();
    // roll around forward
    const rightR = right.clone().multiplyScalar(Math.cos(roll)).addScaledVector(up, Math.sin(roll));
    const upR = up.clone().multiplyScalar(Math.cos(roll)).addScaledVector(right, -Math.sin(roll));
    c._fwd3d = forward;
    return upR.clone().lerp(upR, 0); // return rolled up
  }

  /* ---------- input shape ----------
     {throttle -1..1, steer -1..1, pitch -1..1, yaw -1..1, roll -1..1,
      boost, jump(edge), jumpHeld, slide}                                  */

  function stepCar(c, inp, dt) {
    if (c.demoT > 0) { c.demoT -= dt; return; }

    const fwd = c.basis;
    const fwdFlat = new V(fwd.x, fwd.y, 0).normalize();
    const right = new V().crossVectors(fwdFlat, new V(0, 0, 1)).normalize();
    const up = carUp(c);          // also computes c._fwd3d (pitched forward)
    const fwd3d = c._fwd3d || fwd;

    if (c.onGround) {
      /* --- grounded driving --- */
      const fwdSpeed = c.vel.dot(fwdFlat);
      let accel = 0;
      if (inp.throttle > 0) {
        accel = fwdSpeed < 0 ? T.BRAKE : (fwdSpeed < T.MAX_DRIVE ? T.DRIVE_ACCEL : 0);
      } else if (inp.throttle < 0) {
        accel = fwdSpeed > 0 ? -T.BRAKE : (fwdSpeed > -T.REVERSE_MAX ? -T.DRIVE_ACCEL * 0.8 : 0);
      } else {
        // coast
        accel = -Math.sign(fwdSpeed) * Math.min(T.COAST, Math.abs(fwdSpeed) / dt);
      }
      c.vel.addScaledVector(fwdFlat, accel * dt);

      // boost on ground
      if (inp.boost && c.boost > 0) {
        c.vel.addScaledVector(fwdFlat, T.BOOST_ACCEL * dt);
        c.boost = Math.max(0, c.boost - T.BOOST_CONSUME * dt);
        c.boosting = true;
      } else c.boosting = false;

      // steering yaw rate, speed-sensitive
      const sp = c.vel.length();
      const yawRate = inp.slide ? T.GROUND_YAW_HI * 1.3
        : (T.GROUND_YAW_RATE + (T.GROUND_YAW_HI - T.GROUND_YAW_RATE) * clamp(sp / T.MAX_DRIVE, 0, 1));
      const dir = fwdSpeed >= -0.5 ? 1 : -1;
      c.yaw -= inp.steer * yawRate * dt * dir;
      c.basis = basisFromYaw(c.yaw);

      // lateral grip (kill sideways velocity, powerslide reduces)
      const latV = c.vel.dot(right) * (inp.slide ? 2.5 : T.LAT_GRIP) * dt;
      c.vel.addScaledVector(right, -latV);

      // clamp ground speed
      const cap = c.boosting ? T.MAX_BOOST_SPEED : T.MAX_DRIVE;
      const h = new V(c.vel.x, c.vel.y, 0);
      if (h.length() > cap) { h.setLength(cap); c.vel.x = h.x; c.vel.y = h.y; }

      /* --- jump --- */
      if (inp.jump && c.hasJump) {
        c.vel.addScaledVector(new V(0, 0, 1), T.JUMP_IMPULSE);
        c.hasJump = false; c.onGround = false;
        c.jumpHoldT = 0; c._pitch = 0; c._roll = 0;
      }
      c.wheelspin += fwdSpeed * dt;
    } else {
      /* --- airborne --- */
      // jump-hold extra impulse
      if (inp.jumpHeld && c.jumpHoldT < T.JUMP_HOLD_MAX && !c.hasFlipUsed) {
        c.vel.z += T.JUMP_HOLD_ACCEL * dt;
        c.jumpHoldT += dt;
      }
      // boost in air (aerials) — along the PITCHED forward, so pointing the
      // nose up and boosting climbs, exactly like RL
      if (inp.boost && c.boost > 0) {
        c.vel.addScaledVector(fwd3d, T.BOOST_ACCEL * dt);
        c.boost = Math.max(0, c.boost - T.BOOST_CONSUME * dt);
        c.boosting = true;
      } else c.boosting = false;

      // dodge flip (second jump with stick direction)
      if (inp.jump && c.hasFlip) {
        const dx = inp.yaw || inp.steer || 0, dy = inp.pitch || inp.throttle || 0;
        if (Math.abs(dx) + Math.abs(dy) > 0.3) {
          // directional dodge: impulse in car-local direction
          const imp = new V()
            .addScaledVector(fwdFlat, dy)
            .addScaledVector(right, dx)
            .normalize()
            .multiplyScalar(T.DODGE_IMPULSE);
          c.vel.add(imp);
          c.vel.z = Math.max(c.vel.z * 0.3, c.vel.z); // flip cancels some vert
          c.flipCarried = { dx, dy, t: 0.65 };
          c.hasFlip = false;
        } else {
          // double jump straight up
          c.vel.addScaledVector(new V(0, 0, 1), T.JUMP_IMPULSE * 0.95);
          c.hasFlip = false;
        }
      }

      // air control torques -> integrate car orientation (pitch/yaw/roll)
      // torque tapers off as nose approaches vertical, so holding pitch-up
      // stabilises the nose around 90deg instead of looping over it
      const pTarget = (c._pitch || 0);
      const pAuth = Math.max(0.25, 1 - Math.abs(Math.sin(pTarget))); // less authority near vertical
      c._pitch = pTarget + (inp.pitch || 0) * T.AIR_PITCH_TORQUE * dt * pAuth;
      c._yawAir = (c._yawAir || 0) + (inp.yaw || inp.steer || 0) * T.AIR_YAW_TORQUE * dt;
      c._roll = (c._roll || 0) + (inp.roll || 0) * T.AIR_ROLL_TORQUE * dt;

      // yaw rotation from air steer
      c.yaw -= (inp.yaw || inp.steer || 0) * T.AIR_YAW_TORQUE * 0.6 * dt;
      c.basis = basisFromYaw(c.yaw);

      // flip animation torque: fast pitch rotation while flip active
      if (c.flipCarried) {
        c.flipCarried.t -= dt;
        c._pitch += c.flipCarried.dy * T.FLIP_TORQUE * dt;
        c._roll += c.flipCarried.dx * T.FLIP_TORQUE * 0.8 * dt;
        if (c.flipCarried.t <= 0) c.flipCarried = null;
      }
    }

    /* gravity */
    c.vel.z -= T.GRAVITY * dt;
    /* extra stickiness when grounded low */
    if (c.onGround && c.vel.z < 1) c.vel.z = 0;

    /* integrate */
    c.pos.addScaledVector(c.vel, dt);

    /* --- ground contact --- */
    if (c.pos.z < CAR.REST_Z) {
      c.pos.z = CAR.REST_Z;
      if (c.vel.z < -1) c.vel.z = -c.vel.z * 0.1;
      else c.vel.z = 0;
      const wasAir = !c.onGround;
      c.onGround = true;
      c.hasJump = true; c.hasFlip = true; c.hasFlipUsed = false;
      c.jumpHoldT = 0;
      // land: level out orientation smoothly
      if (wasAir) { c._pitch = (c._pitch || 0) * 0.3; c._roll = (c._roll || 0) * 0.3; }
    } else if (c.pos.z > CAR.REST_Z + 0.05) {
      c.onGround = false;
    }

    /* --- walls --- */
    wallCollide(c, CAR.W / 2);

    /* supersonic flag */
    c.supersonic = c.vel.length() > 0.92 * T.MAX_BOOST_SPEED;
  }

  function wallCollide(body, radius) {
    const A = ARENA;
    let hit = null;
    const inGoalX = Math.abs(body.pos.x) < A.GOAL_W / 2 - 0.4;
    // side walls x
    if (body.pos.x > A.W / 2 - radius) { body.pos.x = A.W / 2 - radius; hit = hit || new V(); hit.x = -1; }
    else if (body.pos.x < -A.W / 2 + radius) { body.pos.x = -A.W / 2 + radius; hit = hit || new V(); hit.x = 1; }
    // end walls y (open in goal mouth)
    if (body.pos.y > A.H / 2 - radius && !(inGoalX && body.pos.z < A.GOAL_H)) {
      body.pos.y = A.H / 2 - radius; hit = hit || new V(); hit.y = -1;
    } else if (body.pos.y < -A.H / 2 + radius && !(inGoalX && body.pos.z < A.GOAL_H)) {
      body.pos.y = -A.H / 2 + radius; hit = hit || new V(); hit.y = 1;
    }
    // ceiling
    if (body.pos.z > A.HEIGHT - radius) { body.pos.z = A.HEIGHT - radius; hit = hit || new V(); hit.z = -1; }
    // corner cuts (45-degree ramps approximation)
    const over = Math.max(0, Math.hypot(body.pos.x, body.pos.y) - (Math.hypot(A.W / 2, A.H / 2) - A.CORNER_R));
    if (over > 0) {
      const nx = body.pos.x / (Math.hypot(body.pos.x, body.pos.y) || 1);
      const ny = body.pos.y / (Math.hypot(body.pos.x, body.pos.y) || 1);
      body.pos.x -= nx * over; body.pos.y -= ny * over;
      hit = hit || new V(); hit.x -= nx; hit.y -= ny;
    }
    if (hit && body.vel) {
      const n = hit.clone().normalize();
      const vn = body.vel.dot(n);
      if (vn < 0) body.vel.addScaledVector(n, -vn * 0.5); // bounce
    }
    return hit;
  }

  function stepBall(b, dt, events) {
    b.vel.z -= T.BALL_GRAVITY * dt;
    const drag = Math.max(0, 1 - 0.03 * dt * 60 * dt);
    b.vel.multiplyScalar(1 - 0.028 * dt);
    b.pos.addScaledVector(b.vel, dt);

    // ground
    if (b.pos.z < BALL_R) {
      b.pos.z = BALL_R;
      if (b.vel.z < -0.5) { b.vel.z = -b.vel.z * T.BALL_BOUNCE_GROUND; }
      else b.vel.z = 0;
      b.vel.x *= (1 - 0.4 * dt); b.vel.y *= (1 - 0.4 * dt); // rolling friction
    }
    const wh = wallCollide(b, BALL_R);
    if (wh && b.vel.length() > 8 && events) events.push({ type: "wall", pos: b.pos.clone() });

    // goal detection (crossing y = +-H/2 inside mouth)
    if (events) {
      const A = ARENA;
      if (Math.abs(b.pos.x) < A.GOAL_W / 2 - BALL_R && b.pos.z < A.GOAL_H - BALL_R * 0.3) {
        if (b.pos.y > A.H / 2 + BALL_R) events.push({ type: "goal", team: "blue", speed: b.vel.length(), pos: b.pos.clone() });
        else if (b.pos.y < -A.H / 2 - BALL_R) events.push({ type: "goal", team: "orange", speed: b.vel.length(), pos: b.pos.clone() });
      }
    }
    if (b.vel.length() > T.BALL_MAX) b.vel.setLength(T.BALL_MAX);
    b.spin.multiplyScalar(1 - 0.1 * dt);
  }

  /* ---------- car-ball: sphere vs oriented box corners ---------- */
  const _corner = new V();
  function carBallCollide(car, ball, events) {
    if (car.demoT > 0) return;
    const fwd = car.basis;
    const right = new V().crossVectors(fwd, new V(0, 0, 1)).normalize();
    const up = carUp(car);
    const hl = CAR.L / 2, hw = CAR.W / 2, hh = CAR.H / 2;
    let best = null, bestD = Infinity;
    for (let i = 0; i < 8; i++) {
      _corner.copy(car.pos)
        .addScaledVector(fwd, (i & 1 ? hl : -hl))
        .addScaledVector(right, (i & 2 ? hw : -hw))
        .addScaledVector(up, (i & 4 ? hh : -hh));
      const d = _corner.distanceToSquared(ball.pos);
      if (d < bestD) { bestD = d; best = _corner; }
    }
    // also centre as contact
    const dCentre = car.pos.distanceToSquared(ball.pos);
    if (dCentre < bestD) { bestD = dCentre; best = car.pos; }

    const dist = Math.sqrt(bestD);
    const minDist = BALL_R + 0.62;   // generous RL-style hitbox (car is a taxi!)
    if (dist < minDist && dist > 0.0001) {
      const n = new V().subVectors(ball.pos, best).divideScalar(dist);
      // push ball out
      ball.pos.copy(best).addScaledVector(n, minDist);
      // impulse: relative velocity along normal + car velocity transfer
      const relN = ball.vel.dot(n) - car.vel.dot(n);
      const carSpeed = car.vel.length();
      if (relN < 0 || true) {
        const power = Math.max(0, -relN) * 0.65 + carSpeed * 0.45 + 2.2;
        ball.vel.addScaledVector(n, power);
        ball.vel.addScaledVector(car.vel, 0.3);
        // dodging into the ball = power hit
        if (car.flipCarried) { ball.vel.addScaledVector(n, 4); }
        ball.lastTouch = car.team;
        if (events) {
          events.push({ type: "kick", team: car.team, hard: power > 12, pos: ball.pos.clone() });
          // demolition: supersonic centre hit
          const toBall = new V().subVectors(ball.pos, car.pos).normalize();
          if (carSpeed > T.DEMO_SPEED && car.vel.dot(toBall) > 0.8 * carSpeed) {
            // only demo the OTHER car, handled in cars-cars below
          }
        }
      }
    }
  }

  function carCarCollide(a, b, events) {
    if (a.demoT > 0 || b.demoT > 0) return;
    const d = a.pos.distanceTo(b.pos);
    if (d < 2.6 && d > 0.001) {
      const n = new V().subVectors(b.pos, a.pos).divideScalar(d);
      const rel = a.vel.dot(n) - b.vel.dot(n);
      if (rel > 0) {
        // demolition FIRST: supersonic contact demos before the bump bleeds speed
        const aFast0 = a.vel.length(), bFast0 = b.vel.length();
        const aToward = a.vel.dot(n) / (aFast0 || 1) > 0.7;
        const bToward = -b.vel.dot(n) / (bFast0 || 1) > 0.7;
        if (aFast0 > T.DEMO_SPEED && aToward) {
          b.demoT = T.DEMO_RESPAWN; if (events) events.push({ type: "demo", victim: b.team, by: a.team, pos: b.pos.clone() });
        } else if (bFast0 > T.DEMO_SPEED && bToward) {
          a.demoT = T.DEMO_RESPAWN; if (events) events.push({ type: "demo", victim: a.team, by: b.team, pos: a.pos.clone() });
        }
        // bump
        b.vel.addScaledVector(n, rel * 0.6);
        a.vel.addScaledVector(n, -rel * 0.6);
      }
      // separate
      const push = (2.6 - d) / 2;
      a.pos.addScaledVector(n, -push); b.pos.addScaledVector(n, push);
    }
  }

  return { ARENA, BALL_R, CAR, T, makeCar, stepCar, stepBall, carBallCollide, carCarCollide, wallCollide, carUp, basisFromYaw };
})();

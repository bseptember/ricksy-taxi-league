/* ==========================================================================
   RTL3D — rl_ai.js
   Rocket-League-style opponent: kickoff rush, ball chase with approach
   alignment (hit ball toward goal), defensive rotations, aerial jumps when
   ball is above, boost management, difficulty-scaled reaction.
   Stateless per think(); outputs same input shape as the player's.
   ========================================================================== */
"use strict";

RTL3D.ai = (function () {
  const P = RTL3D.physics;
  const A = P.ARENA;

  const DIFF = [
    { reaction: 0.45, speed: 0.6, aerial: false, dodge: false, boostUse: false, jitter: 9 },
    { reaction: 0.25, speed: 0.78, aerial: false, dodge: false, boostUse: true, jitter: 4 },
    { reaction: 0.12, speed: 0.92, aerial: true, dodge: true, boostUse: true, jitter: 1.5 },
    { reaction: 0.04, speed: 1.0, aerial: true, dodge: true, boostUse: true, jitter: 0.4 },
  ];

  function think(match, cars, ball, diff, rng, dt) {
    const out = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, boost: false, jump: false, jumpHeld: false, slide: false };
    const me = cars.AI, foe = cars.P1;
    if (!me || me.demoT > 0) return out;
    const t = DIFF[Math.max(0, Math.min(3, diff | 0))];

    /* reaction delay: aim at where the ball WAS */
    if (!think._last || !think._t) { think._last = { x: 0, y: 0, z: 0 }; think._t = 0; }
    think._t += dt;
    if (think._t >= t.reaction) {
      think._aim = { x: ball.pos.x + (rng() - 0.5) * t.jitter, y: ball.pos.y + (rng() - 0.5) * t.jitter, z: ball.pos.z };
      think._t = 0;
    }
    const aim = think._aim || { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z };

    const myGoalY = me.team === "orange" ? A.H / 2 : -A.H / 2;
    const atkGoalY = -myGoalY;

    /* pick target: intercept between ball and a point lined up with the goal */
    const toGoal = { x: 0 - aim.x, y: atkGoalY - aim.y };
    const gl = Math.hypot(toGoal.x, toGoal.y) || 1;
    // approach point = ball offset opposite the goal direction (hit through)
    const approach = { x: aim.x - (toGoal.x / gl) * 1.6, y: aim.y - (toGoal.y / gl) * 1.6 };

    /* defence: if ball is deep in my half and I'm not goal-side, hurry back */
    const ballThreat = (myGoalY > 0 ? ball.pos.y : -ball.pos.y) > A.H * 0.25;
    const iAmGoalside = (myGoalY > 0) === (me.pos.y > ball.pos.y);
    let tx = approach.x, ty = approach.y;
    if (ballThreat && !iAmGoalside && ball.vel.y * Math.sign(myGoalY) > 4) {
      tx = ball.pos.x * 0.5; ty = myGoalY * 0.72;
    }

    /* steer toward (tx,ty) */
    const dx = tx - me.pos.x, dy = ty - me.pos.y;
    const want = Math.atan2(dy, dx);
    let dAng = want - me.yaw;
    while (dAng > Math.PI) dAng -= 2 * Math.PI;
    while (dAng < -Math.PI) dAng += 2 * Math.PI;
    out.steer = Math.max(-1, Math.min(1, -dAng / 0.5));
    out.throttle = Math.abs(dAng) > 2.3 ? -0.6 : 1 * t.speed;

    /* boost when lined up and needing speed */
    const dist = Math.hypot(dx, dy);
    if (t.boostUse && Math.abs(dAng) < 0.25 && dist > 10 && me.boost > 5) out.boost = true;

    /* jump: ball above and close -> single/double jump; dodge into ball for power */
    const ballDist = me.pos.distanceTo(ball.pos);
    const ballAbove = ball.pos.z - me.pos.z;
    if (ballDist < 4.2 && ballAbove > 1.1 && ballAbove < 4.5 && t.aerial) {
      out.jump = true;
      out.jumpHeld = ballAbove > 2.2;
      if (t.dodge && ballDist < 2.6) {
        // dodge into the ball
        const toBall = Math.atan2(ball.pos.y - me.pos.y, ball.pos.x - me.pos.x);
        let fd = toBall - me.yaw;
        while (fd > Math.PI) fd -= 2 * Math.PI;
        while (fd < -Math.PI) fd += 2 * Math.PI;
        out.pitch = -Math.cos(fd); out.yaw = Math.sin(fd); // local dodge dir
        out.jump = true;
      }
    } else if (t.dodge && ballDist < 3.0 && me.onGround && Math.abs(dAng) < 0.3 && me.vel.length() > 12) {
      // flip shot from the ground edge
      out.jump = true;
      out.pitch = -1; // forward flip
    }

    /* kickoff: full send */
    if (match.kickoffRush) {
      out.throttle = 1; out.boost = t.boostUse && me.boost > 0;
    }

    /* avoid own goal: never drive into my own goal mouth chasing */
    if (Math.abs(me.pos.y) > A.H / 2 - 6 && Math.sign(me.pos.y) === Math.sign(myGoalY) && Math.abs(me.pos.x) < A.GOAL_W / 2) {
      out.throttle = -1;
    }

    return out;
  }

  return { think };
})();

/* ==========================================================================
   RICKSY TAXI LEAGUE — 07_ai.js
   Opponent brain. Stateless, difficulty-scaled. Output = same input shape
   the sim consumes (throttle/steer levels, jump/shoot/carry treated as
   edges by sim via jumpEdge-or-level fallback).
   ========================================================================== */
"use strict";

RTL.ai = (function (C, m, W) {
  /** difficulty tuning table: 0 relaxed .. 3 neural
   *  hesitate was a FREEZE PROBABILITY re-rolled at 30Hz: at 0.35 the RELAXED
   *  bot was frozen 50.8% of the match (1-(1-0.35/60)^30) — a brick, not a
   *  difficulty setting. Rescaled to real handicaps (8.4% / 4.3% / 1.4% / 0%). */
  const TUNE = [
    { noise: 7.0, speed: 0.62, hesitate: 0.06, boost: false, aerial: false, flip: false, reaction: 0.55 },
    { noise: 3.0, speed: 0.80, hesitate: 0.03, boost: true, aerial: false, flip: false, reaction: 0.33 },
    { noise: 1.2, speed: 0.92, hesitate: 0.01, boost: true, aerial: true, flip: false, reaction: 0.2 },
    { noise: 0.3, speed: 1.0, hesitate: 0.0, boost: true, aerial: true, flip: true, reaction: 0.1 },
  ];

  /**
   * think() — pure. match/cars/ball read-only.
   * Returns {throttle,steer,boost,jump,shoot,carry,brake}
   *
   * selfId: which car this brain is driving. It USED to be hardcoded to "AI",
   * which meant both cars could never be driven by the same brain — every
   * "AI vs AI" harness ran two cars onto the same target, so they collided
   * instead of one finishing. Passing "P1" makes the headless suite a real
   * two-sided match.
   */
  function think(match, cars, ball, diff, rng, dt, selfId) {
    const out = { throttle: 0, steer: 0, boost: false, jump: false, shoot: false, carry: false, brake: false };
    const id = selfId || "AI";
    const me = cars.find((c) => c.id === id);
    const foe = cars.find((c) => c.id !== id);
    if (!me || me.demo.active) return out;

    const t = TUNE[m.clamp(diff | 0, 0, 3)];

    /* hesitation: low-diff AI freezes briefly at random */
    if (t.hesitate > 0 && rng() < t.hesitate * dt * 2) return out;

    /* perceived ball (noise scaled by difficulty) */
    const bx = ball.x + (rng() * 2 - 1) * t.noise;
    const by = ball.y + (rng() * 2 - 1) * t.noise;

    const myGoalY = me.team === "orange" ? C.PITCH_H : 0;
    const atkGoalY = me.team === "orange" ? 0 : C.PITCH_H;
    const attackDir = me.team === "orange" ? -1 : 1;

    /* ------- choose target point ------- */
    let tx = bx, ty = by;
    let mode = "attack";

    /* CRITICAL FIX: the sign here made `ballToMyGoal` <= 0 across the whole
       pitch, so `mode = "defend"` below was unreachable — the bot had no
       defence at all and matches were goalless. attackDir is +1 when the bot
       attacks +Y, so the ball sits "toward my goal" when (ball.y - myGoalY)
       has the same sign as attackDir. */
    const ballToMyGoal = (ball.y - myGoalY) * attackDir; // >0 = ball heading to my goal
    const iAmClosest = Math.hypot(ball.x - me.x, ball.y - me.y)
                     < Math.hypot(ball.x - (foe ? foe.x : ball.x + 99), ball.y - (foe ? foe.y : ball.y + 99));

    /* carrying foe -> chase the foe */
    if (foe && foe.carrying) mode = "chase";
    /* defence: ball moving toward my goal fast, and I'm goal-side or can get there */
    else if (ballToMyGoal > 6 && Math.hypot(ball.vx, ball.vy) > 12) {
      mode = "defend";
      /* stand 6m goal-side of the ball, between ball and goal centre */
      ty = ball.y + attackDir * 6;
      tx = ball.x + (W.GOAL_CX - ball.x) * 0.25;
    }
    /* ball in my half and foe closer -> cover between ball and goal */
    else if (!iAmClosest && (ball.y - myGoalY) * attackDir < 26) {
      mode = "cover";
      ty = (ball.y + myGoalY) / 2;
      tx = ball.x * 0.6 + W.GOAL_CX * 0.4;
    }
    /* ball deep in enemy half, I'm not involved -> hold midfield */
    else if ((ball.y - myGoalY) * attackDir > 70) {
      mode = "hold";
      ty = myGoalY + attackDir * 62;
      tx = W.GOAL_CX + (me.x - W.GOAL_CX) * 0.5;
    }

    /* kick-chase: aim slightly behind the ball to hit through it toward goal */
    if (mode === "attack" || mode === "chase") {
      const gx = W.GOAL_CX, gy = atkGoalY;
      const toGoalX = gx - bx, toGoalY = gy - by;
      const gl = Math.hypot(toGoalX, toGoalY) || 1;
      /* INTERCEPTION: lead the ball instead of chasing its present position.
         Solve for the time the ball reaches the goal-ish line, then aim at
         where it WILL be. Without this the bot always trails the ball and
         arrives on the wrong side. */
      const bv = Math.hypot(ball.vx, ball.vy);
      let aimX = bx, aimY = by;
      if (bv > 3) {
        /* dist is computed in the steering block below, so use the raw gap */
        const gap = Math.hypot(bx - me.x, by - me.y);
        const tLead = m.clamp(gap / Math.max(6, t.speed * C.CAR_MAX_SPEED), 0, 1.2);
        aimX = m.clamp(ball.x + ball.vx * tLead * 0.8, 1, C.PITCH_W - 1);
        aimY = m.clamp(ball.y + ball.vy * tLead * 0.8, 1, C.PITCH_H - 1);
      }
      const tgx = gx - aimX, tgy = gy - aimY;
      const gl2 = Math.hypot(tgx, tgy) || 1;
      tx = aimX - (tgx / gl2) * 1.2;
      ty = aimY - (tgy / gl2) * 1.2;
    }

    /* DEAD-BALL CONTEST. Measured live: with the ball parked in a corner the
       bot idled at 0.5 m/s and never touched it — the chase target was the
       "1.2m behind the ball" point, so driving there never produced a
       contact. When the ball is basically stationary, aim AT it instead, so
       the bot actually goes and knocks it back into play. */
    const ballStill = Math.hypot(ball.vx, ball.vy) < 1.2;
    if (ballStill && (mode === "attack" || mode === "chase" || mode === "cover")) {
      tx = bx; ty = by;
    }

    /* ------- steering -------
       was: out.steer = clamp(diffAng / 0.5, -1, 1) — this SATURATES at
       |diffAng| >= 0.5 rad, so the bot held full lock for 1232 of 1440 think
       calls in a measured match, swerving back and forth without ever
       converging. Widen the deadband, scale down, and add a yaw-rate damper
       that opposes the current rotation so it settles instead of oscillating. */
    const dx = tx - me.x, dy = ty - me.y;
    const dist = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx);
    const diffAng = m.angDiff(me.heading, want);
    const deadband = 0.18;
    const mag = Math.abs(diffAng) <= deadband ? 0 : (Math.abs(diffAng) - deadband) / 0.9;
    let steerCmd = m.clamp(Math.sign(diffAng) * mag, -1, 1);
    /* damp against existing yaw so the bot settles instead of sawing */
    const yaw = me.angVel || 0;
    steerCmd = m.clamp(steerCmd - m.clamp(yaw * 1.2, -0.5, 0.5), -1, 1);
    out.steer = steerCmd;
    out.throttle = 1 * t.speed;

    /* reverse when target is behind and close */
    if (Math.abs(diffAng) > 2.2 && dist < 12) {
      out.throttle = -0.8 * t.speed;
      out.steer = -out.steer;
      out.brake = false;
    }
    /* brake when flying past the target misaligned */
    const mySpeed = Math.hypot(me.vx, me.vy);
    if (Math.abs(diffAng) > 1.2 && mySpeed > 14 && dist < 14) out.brake = true;

    /* ------- boost ------- */
    if (t.boost && Math.abs(diffAng) < 0.3 && dist > 8 && me.boost > 10) out.boost = true;

    /* ------- shoot ------- */
    const ballAhead = (ball.x - me.x) * Math.cos(me.heading) + (ball.y - me.y) * Math.sin(me.heading);
    const ballDist = m.dist(me.x, me.y, ball.x, ball.y);
    if (mode === "attack" && ballDist < 20) {
      const gAng = Math.atan2(atkGoalY - ball.y, W.GOAL_CX - ball.x);
      const myToBall = Math.atan2(ball.y - me.y, ball.x - me.x);
      /* Strike gate. The old test compared the car->ball bearing with the
         ball->goal bearing and demanded < 0.42 rad — but a car that is
         correctly positioned BEHIND the ball is necessarily at ~PI rad from
         the ball->goal line, so the gate could almost never be satisfied and
         the bot never converted. The real questions are: is the ball on its
         way to goal from where I am, and am I lined up to hit it through? */
      const ballOnLine = Math.abs(m.angDiff(myToBall, gAng)) < 0.9;   // ball is goal-ward
      const carBehind = Math.abs(m.angDiff(me.heading, gAng)) < 0.6;  // I'm aiming at it
      /* Range MUST match the sim's tap-shot gate (06_sim.js: d < 3.2), or the
         request is silently dropped. Measured: the bot asked to shoot at
         3.68-3.90m and the sim threw every one away — 3 requests, 0 balls
         launched. Keep this number in sync with TAP_SHOT_RANGE. */
      if (ballAhead > 0 && (carBehind || ballOnLine) && ballDist < C.TAP_SHOT_RANGE) {
        out.shoot = true;   /* clearance beats own-goal risk at close range */
      }
    }

    /* emergency clear: ball near my goal and I'm goal-side */
    if (Math.abs(ball.y - myGoalY) < 12 && (me.y - myGoalY) * attackDir > 0 && ballDist < 4.2) {
      out.shoot = true;
    }

    /* ------- carry ------- */
    if (mode === "attack" && ballDist < 3.2 && ballAhead > 0.5 && ball.z < 1.2 && me.carryCd <= 0) {
      /* carry when I have space ahead toward goal */
      const space = (atkGoalY - me.y) * attackDir;
      if (space > 12 && Math.abs(diffAng) < 0.7) out.carry = true;
    }
    /* release carry with a shot when in range */
    if (me.carrying) {
      const goalDist = m.dist(me.x, me.y, W.GOAL_CX, atkGoalY);
      out.carry = goalDist > 22;      // keep carrying until close
      out.shoot = goalDist <= 22;     // then bang it
      out.boost = out.carry && me.boost > 20;
    }

    /* ------- aerial / flip (high diff) ------- */
    if (t.aerial && ball.z > 1.2 && ball.z < 3.5 && ballDist < 5 && Math.abs(diffAng) < 0.6) {
      out.jump = true;
    }
    if (t.flip && ballDist < 3.2 && ballAhead > 1 && Math.abs(diffAng) < 0.25 && mySpeed > 14 && me.onGround && rng() < 0.3) {
      out.jump = true; // flip into the ball for power (sim treats second jump as flip)
    }

    /* kickoff special: full send */
    if (match.state === "countdown") {
      out.throttle = t.speed;
      out.steer = 0;
    }

    return out;
  }

  return { think };
})(RTL.C, RTL.mathx, RTL.world);

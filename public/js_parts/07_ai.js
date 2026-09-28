/* ==========================================================================
   RICKSY TAXI LEAGUE — 07_ai.js
   Opponent brain. Stateless, difficulty-scaled. Output = same input shape
   the sim consumes (throttle/steer levels, jump/shoot/carry treated as
   edges by sim via jumpEdge-or-level fallback).
   ========================================================================== */
"use strict";

RTL.ai = (function (C, m, W) {
  /** difficulty tuning table: 0 relaxed .. 3 neural */
  const TUNE = [
    { noise: 7.0, speed: 0.55, hesitate: 0.35, boost: false, aerial: false, flip: false, reaction: 0.55 },
    { noise: 3.0, speed: 0.75, hesitate: 0.16, boost: true, aerial: false, flip: false, reaction: 0.33 },
    { noise: 1.2, speed: 0.92, hesitate: 0.05, boost: true, aerial: true, flip: false, reaction: 0.2 },
    { noise: 0.3, speed: 1.0, hesitate: 0.0, boost: true, aerial: true, flip: true, reaction: 0.1 },
  ];

  /**
   * think() — pure. match/cars/ball read-only.
   * Returns {throttle,steer,boost,jump,shoot,carry,brake}
   */
  function think(match, cars, ball, diff, rng, dt) {
    const out = { throttle: 0, steer: 0, boost: false, jump: false, shoot: false, carry: false, brake: false };
    const me = cars.find((c) => c.id === "AI");
    const foe = cars.find((c) => c.id === "P1");
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

    const ballToMyGoal = (myGoalY - ball.y) * attackDir; // >0 = ball heading to my goal
    const iAmClosest = Math.abs(ball.y - me.y) < Math.abs(ball.y - (foe ? foe.y : ball.y));

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
      tx = bx - (toGoalX / gl) * 1.2;
      ty = by - (toGoalY / gl) * 1.2;
    }

    /* ------- steering ------- */
    const dx = tx - me.x, dy = ty - me.y;
    const dist = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx);
    const diffAng = m.angDiff(me.heading, want);
    out.steer = m.clamp(diffAng / 0.5, -1, 1);
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
    if (mode === "attack" && ballDist < 16) {
      const gAng = Math.atan2(atkGoalY - ball.y, W.GOAL_CX - ball.x);
      const myToBall = Math.atan2(ball.y - me.y, ball.x - me.x);
      const aligned = Math.abs(m.angDiff(myToBall, gAng)) < 0.45;
      /* don't shoot toward my own goal; clear to the side instead */
      const facingOwnGoal = Math.abs(m.angDiff(me.heading, Math.atan2(myGoalY - me.y, W.GOAL_CX - me.x))) < 0.9;
      if (ballAhead > 0 && aligned && dist < 16 && ballDist < 3.6) {
        if (!facingOwnGoal) out.shoot = true;
        else out.shoot = true; /* clearance beats own-goal risk at close range */
      }
    }

    /* emergency clear: ball near my goal and I'm goal-side */
    if (Math.abs(ball.y - myGoalY) < 9 && (me.y - myGoalY) * attackDir > 0 && ballDist < 3.4) {
      out.shoot = true;
    }

    /* ------- carry ------- */
    if (mode === "attack" && ballDist < 2.6 && ballAhead > 0.5 && ball.z < 1.2 && me.carryCd <= 0) {
      /* carry when I have space ahead toward goal */
      const space = (atkGoalY - me.y) * attackDir;
      if (space > 18 && Math.abs(diffAng) < 0.5) out.carry = true;
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

/* ==========================================================================
   RICKSY TAXI LEAGUE — 11_camera.js  (v2: Rocket-League-style chase cams)
   CAR cam: camera locked behind the car's heading, forward = up-screen,
            car sits low in frame, look-ahead at speed.
   BALL cam: camera on the ball→car axis (ball "up" the screen, car at the
             bottom), like RL ball cam. Adaptive zoom keeps far balls on screen.
   TUNNEL: high tactical iso (classic view).
   The renderer honours cam.rot (world yaw) and cam.sq (vertical squash = pitch).
   ========================================================================== */
"use strict";

RTL.camera = (function (C, m) {
  let switchCd = 0;

  function preset(modeName) {
    if (modeName === "BALL") return C.BALL_CAM;
    if (modeName === "TUNNEL") return C.TUNNEL_CAM;
    return C.CAR_CAM;
  }

  function update(cam, target, ball, dt, view) {
    switchCd = Math.max(0, switchCd - dt);
    const p = preset(cam.mode);
    let rot, sq = p.sq || 0.5, lookX, lookY, lookZ, anchorY;
    const spd = Math.hypot(target.vx, target.vy);

    if (cam.mode === "BALL" && ball) {
      /* camera yaw = along the ball→car axis so the ball is centred horizontally */
      const dx = target.x - ball.x, dy = target.y - ball.y;
      if (Math.hypot(dx, dy) > 0.5) cam._yaw = Math.atan2(dy, dx);
      rot = Math.PI / 2 - (cam._yaw || 0);
      /* adaptive zoom: pull out when the ball is far so it stays framed
         (CAR cam does the same via its fit-cap; the old 0.62 floor pinned
         zoom at long range and pushed the ball 500px off the top edge —
         measured fy -0.836 at ball-car 84u). Cap 0.72 (was 0.78): the old
         factor EXCEEDED the 0.76 anchor, so the ball's offset alone was
         78% of screen height while only 76% was available above the car —
         ball sat ~35px off the top edge at mid-range (measured). 0.72
         ball sat ~35px off the top edge at mid-range (measured). 0.70
         (was 0.72): still ~13% cap-tracking lag while ball-car distance
         grows fast (measured 1.7 zoom-units at bd 43-60u) — 0.70 leaves
         settled margin for it (predicted worst fy ~ -0.03, measured
         -0.077 with 0.72). */
      const bl = Math.max(6, Math.hypot(ball.x - target.x, ball.y - target.y));
      const cap = (view.h * 0.70) / (bl * sq);
      const adapt = m.clamp(view.w / (p.refW || 1264), 0.55, 1.6);
      const tz = Math.min(p.zoom * adapt, cap);
      cam.zoom = m.damp(cam.zoom || tz, tz, 4, dt);
      lookX = target.x; lookY = target.y; lookZ = target.z;
      anchorY = view.h * (p.anchorY || 0.76);
    } else if (cam.mode === "TUNNEL") {
      rot = (p.rot != null) ? p.rot : -Math.PI / 4;
      const adapt = m.clamp(view.w / (p.refW || 1264), 0.55, 1.6);
      cam.zoom = m.damp(cam.zoom || p.zoom * adapt, p.zoom * adapt, 3, dt);
      lookX = ball ? (target.x + ball.x) / 2 : target.x;
      lookY = ball ? (target.y + ball.y) / 2 : target.y;
      lookZ = 0;
      anchorY = view.h * 0.52;
    } else {
      /* CAR cam: the car's HEADING is up-screen (not velocity — a wall bounce
         reverses velocity and would whip the camera; heading is continuous) */
      const hd = target.heading;
      rot = -Math.PI / 2 - hd;
      const la = (p.lookAhead || 5) * m.clamp(spd / 18, 0, 1.4);
      /* ball-bias: lean the look point toward a far ball so both stay framed.
         ALIGNED-BY-DISTANCE (not additive): the old additive vector (look-ahead
         + bias) over-shot when the ball was far AHEAD — look point landed
         ~22u in front and the car settled at fy 1.15 (measured 3-min gate,
         20% of a window off-frame). Here the look point always sits ON the
         car→ball line at lean·bd: lean 0.55 with the ball behind (needs a
         big lean), easing to 0.30 when the ball is dead ahead (additive's
         failure mode), so the car keeps bottom-third room at any range. */
      let bx = 0, by = 0, bdl = 0;
      if (ball) {
        const bdx = ball.x - target.x, bdy = ball.y - target.y;
        bdl = Math.hypot(bdx, bdy);
        if (bdl > 0.5) {
          const fx = Math.cos(hd), fy = Math.sin(hd);
          const behind = (bdx * fx + bdy * fy) / bdl; // +1 behind, -1 ahead
          const lean = 0.55 + (0.30 - 0.55) * m.clamp((-behind + 1) / 2, 0, 1);
          const k = m.clamp((bdl - 6) / 18, 0, 1) * lean;
          bx = bdx * k; by = bdy * k;
        }
      }
      lookX = target.x + Math.cos(hd) * la + bx;
      lookY = target.y + Math.sin(hd) * la + by;
      lookZ = 1 + Math.min(2, target.z);
      anchorY = view.h * (p.anchorY || 0.6);
      const adapt = m.clamp(view.w / (p.refW || 1264), 0.55, 1.6);
      /* breathing zoom: pull out gently as the BALL gets far so it stays on
         screen (his game: zoom eases out with ball distance, never jumps);
         hard cap guarantees car + ball both fit at corner-to-corner range.
         0.55 (was 0.62): measured steady-state miss ball fy ~1.05 at
         bd ~20 driving-away geometry; 0.55 lands every case <= ~0.97
         settled with car >= ~0.13 fy. */
      const bd = ball ? bdl : 0;
      const outF = m.clamp(1 - (bd - 14) / 60, 0.5, 1);
      const cap = (view.h * 0.55) / ((bd + 2) * sq);
      const tz = Math.min(
        p.zoom * adapt * outF * (1 - m.clamp((spd - 20) / 60, 0, 0.1)),
        cap
      );
      cam.zoom = m.damp(cam.zoom || tz, tz, 4, dt);
    }

    cam.sq = sq;
    /* LIMITED-RATE rotation: the world view can never whip around. This is
       what makes ball cam usable — it swings smoothly, like RL's.
       BALL base 0.55 (was 1.6): reference game's camera never rotates; a
       slow swing reads calm. But a hard 0.55 cap cannot track circling the
       ball (axis sweeps ~1.2 rad/s at speed) -> rotation lagged unboundedly
       and the ball left the frame for seconds (measured 50 samples off,
       fy -0.22..1.22). So: error-adaptive like the pan — calm near target,
       fast catch-up on large deficits. */
    let dRot = rot - (cam.rot != null ? cam.rot : rot);
    while (dRot > Math.PI) dRot -= Math.PI * 2;
    while (dRot < -Math.PI) dRot += Math.PI * 2;
    const maxRate = cam.mode === "BALL"
      ? m.clamp(0.55 + Math.abs(dRot) * 4, 0.55, 4)
      : 2.8;  // rad/s cap
    /* flip deadzone: a sustained car spin can outrun the cap and leave the
       view a half-turn behind (measured: rot wound to 133 rad, car off-frame
       for tens of seconds while unwinding at 2.8 rad/s). Near-full-reversal
       error resolves 3x faster instead of lingering backwards. */
    const rate = Math.abs(dRot) > Math.PI * 0.75 ? maxRate * 3 : maxRate;
    const step = Math.max(-rate * dt, Math.min(rate * dt, dRot));
    cam.rot = (cam.rot != null ? cam.rot : rot) + step;

    /* pan so the look point lands at the screen anchor. Damping is
       error-adaptive: lazy for small drift (his game's soft follow), but
       catches up quickly when the framing error is large (ball escaping the
       frame while the bias ramps) — soft-zone/hard-zone chase-cam behavior. */
    const c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    const rx = lookX * c - lookY * s;
    const ry = (lookX * s + lookY * c) * sq - lookZ;
    const ptx = view.w / 2 - rx * cam.zoom, pty = anchorY - ry * cam.zoom;
    const perr = Math.max(Math.abs(ptx - (cam.ox || 0)), Math.abs(pty - (cam.oy || 0)));
    /* 0.18 window (was 0.28): with lazy base 2.3 the soft zone let the pan
       trail too far before catch-up engaged -> ball fy 1.196 for ~1.5s on
       boosted away-drives (measured). 0.18*h engages catch-up sooner; the
       soft-zone rate itself is untouched (the lazy feel lives there). */
    const big = m.clamp(perr / (view.h * 0.18), 0, 1);
    const panRate = C.PAN_DAMP + 40 * big * big;
    cam.ox = m.damp(cam.ox || 0, ptx, panRate, dt);
    cam.oy = m.damp(cam.oy || 0, pty, panRate, dt);

    /* shake */
    if (cam.shakeT > 0) {
      cam.shakeT -= dt;
      const a = cam.shakeAmp * (cam.shakeT / 0.4);
      cam.ox += (Math.random() * 2 - 1) * a;
      cam.oy += (Math.random() * 2 - 1) * a;
    }
    cam.ready = true;
  }

  /** hard snap (kickoff/mode change): one big-dt update ≈ teleport */
  function snap(cam, target, ball, dt0, view) {
    update(cam, target, ball, 1, view || { w: cam.vw || 800, h: cam.vh || 600 });
  }

  function toggle(cam) {
    if (switchCd > 0) return false;
    const i = C.CAMS.indexOf(cam.mode);
    cam.mode = C.CAMS[(i + 1) % C.CAMS.length];
    switchCd = C.CAM_SWITCH_COOLDOWN;
    return true;
  }

  function setMode(cam, name) {
    if (C.CAMS.indexOf(name) < 0) return false;
    cam.mode = name;
    return true;
  }

  return { update, snap, toggle, setMode };
})(RTL.C, RTL.mathx);

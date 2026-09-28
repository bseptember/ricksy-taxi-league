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
      /* adaptive zoom: MILDER — pull out only slightly when the ball is far,
         keep the pitch big and readable (the camera pans to follow instead) */
      const bl = Math.max(6, Math.hypot(ball.x - target.x, ball.y - target.y));
      const cap = (view.h * 0.78) / (bl * sq);
      const adapt = m.clamp(view.w / (p.refW || 1264), 0.55, 1.6);
      const tz = Math.max(Math.min(p.zoom * adapt, cap), p.zoom * adapt * 0.62);
      cam.zoom = m.damp(cam.zoom || tz, tz, 3, dt);
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
      /* ball-bias: lean the look point toward a far ball (bounded, smooth via
         the ox/oy damp below) so it stays framed at long range */
      let bx = 0, by = 0, bdl = 0;
      if (ball) {
        const bdx = ball.x - target.x, bdy = ball.y - target.y;
        bdl = Math.hypot(bdx, bdy);
        const bias = m.clamp((bdl - 18) / 40, 0, 1) * 0.5;
        bx = bdx * bias; by = bdy * bias;
      }
      lookX = target.x + Math.cos(hd) * la + bx;
      lookY = target.y + Math.sin(hd) * la + by;
      lookZ = 1 + Math.min(2, target.z);
      anchorY = view.h * (p.anchorY || 0.6);
      const adapt = m.clamp(view.w / (p.refW || 1264), 0.55, 1.6);
      /* breathing zoom: pull out gently as the BALL gets far so it stays on
         screen (his game: zoom eases out with ball distance, never jumps);
         hard cap guarantees car + ball both fit at corner-to-corner range */
      const bd = ball ? bdl : 0;
      const outF = m.clamp(1 - (bd - 14) / 60, 0.5, 1);
      const cap = (view.h * 0.62) / ((bd + 2) * sq);
      const tz = Math.min(
        p.zoom * adapt * outF * (1 - m.clamp((spd - 20) / 60, 0, 0.1)),
        cap
      );
      cam.zoom = m.damp(cam.zoom || tz, tz, 2.5, dt);
    }

    cam.sq = sq;
    /* LIMITED-RATE rotation: the world view can never whip around. This is
       what makes ball cam usable — it swings smoothly, like RL's. */
    let dRot = rot - (cam.rot != null ? cam.rot : rot);
    while (dRot > Math.PI) dRot -= Math.PI * 2;
    while (dRot < -Math.PI) dRot += Math.PI * 2;
    const maxRate = cam.mode === "BALL" ? 1.6 : 2.8;  // rad/s cap
    const step = Math.max(-maxRate * dt, Math.min(maxRate * dt, dRot));
    cam.rot = (cam.rot != null ? cam.rot : rot) + step;

    /* pan so the look point lands at the screen anchor */
    const c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    const rx = lookX * c - lookY * s;
    const ry = (lookX * s + lookY * c) * sq - lookZ;
    cam.ox = m.damp(cam.ox || 0, view.w / 2 - rx * cam.zoom, 6.5, dt);
    cam.oy = m.damp(cam.oy || 0, anchorY - ry * cam.zoom, 6.5, dt);

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

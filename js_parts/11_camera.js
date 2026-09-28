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
      /* adaptive zoom: pull out when the ball is far so it stays in frame */
      const bl = Math.max(6, Math.hypot(ball.x - target.x, ball.y - target.y));
      const cap = (view.h * 0.78) / (bl * sq);
      const adapt = m.clamp(view.w / (p.refW || 1264), 0.55, 1.6);
      const tz = Math.min(p.zoom * adapt, cap);
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
      /* CAR cam: forward direction is up-screen */
      const hd = spd > 2 ? Math.atan2(target.vy, target.vx) : target.heading;
      rot = -Math.PI / 2 - hd;
      const la = (p.lookAhead || 5) * m.clamp(spd / 18, 0, 1.4);
      lookX = target.x + Math.cos(hd) * la;
      lookY = target.y + Math.sin(hd) * la;
      lookZ = 1 + Math.min(2, target.z);
      anchorY = view.h * (p.anchorY || 0.6);
      const adapt = m.clamp(view.w / (p.refW || 1264), 0.55, 1.6);
      const tz = p.zoom * adapt * (1 - m.clamp((spd - 20) / 60, 0, 0.18));
      cam.zoom = m.damp(cam.zoom || tz, tz, 4, dt);
    }

    cam.sq = sq;
    cam.rot = m.angDamp(cam.rot != null ? cam.rot : rot, rot, 4.5, dt);

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

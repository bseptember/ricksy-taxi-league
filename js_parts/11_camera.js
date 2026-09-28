/* ==========================================================================
   RICKSY TAXI LEAGUE — 11_camera.js
   CAR cam (follow car heading + look-ahead), BALL cam (always frames ball),
   TUNNEL cam (high wide tactical). Smooth damping, zoom by speed.
   ========================================================================== */
"use strict";

RTL.camera = (function (C, m) {
  const mode = { current: "CAR" }; // holds current mode; single source of truth
  let switchCd = 0;

  function preset(modeName) {
    if (modeName === "BALL") return C.BALL_CAM;
    if (modeName === "TUNNEL") return C.TUNNEL_CAM;
    return C.CAR_CAM;
  }

  /** Which team attacks +Y? blue attacks y=105 (+Y). Return signed attack dir. */
  function attackDir(team) { return team === "blue" ? 1 : -1; }

  /**
   * Update camera. cam = {ox, oy, zoom, mode, shakeT, shakeAmp}
   * target = player car; ball = ball; dt seconds.
   */
  function update(cam, target, ball, dt, view) {
    switchCd = Math.max(0, switchCd - dt);
    const p = preset(cam.mode);
    let look = null;

    if (cam.mode === "BALL" && ball) {
      /* ball cam: camera sits opposite the ball relative to the car, so the
         ball stays centre-screen. Look target = ball. */
      const dx = ball.x - target.x, dy = ball.y - target.y;
      const bl = Math.hypot(dx, dy) || 1;
      const bx = target.x - (dx / bl) * p.dist;
      const by = target.y - (dy / bl) * p.dist;
      look = { x: ball.x, y: ball.y, z: Math.max(1.2, ball.z) };
      cam.tx = bx; cam.ty = by;
    } else {
      /* car cam: look ahead of the car along its velocity/heading */
      const sp = Math.hypot(target.vx, target.vy);
      const la = p.lookAhead * m.clamp(sp / 18, 0, 1.4);
      const hd = sp > 2 ? Math.atan2(target.vy, target.vx) : target.heading;
      look = {
        x: target.x + Math.cos(hd) * la,
        y: target.y + Math.sin(hd) * la,
        z: 1.0 + Math.min(2, target.z),
      };
      cam.tx = target.x - Math.cos(hd) * p.dist;
      cam.ty = target.y - Math.sin(hd) * p.dist;
    }

    /* iso screen anchor: project look point, offset so it sits above centre */
    const pr = m.iso(look.x, look.y, look.z);
    cam.zoom = p.zoom * (cam.mode === "TUNNEL" ? 1 : 1);
    const targetZoom = p.zoom * (1 - m.clamp((Math.hypot(target.vx, target.vy) - 20) / 60, 0, 0.18));
    cam.zoom = m.damp(cam.zoom, targetZoom, 4, dt);

    /* we want the LOOK point to appear at screen anchor (centre, 58% height for
       car cam so more pitch ahead is visible) */
    const anchorX = view.w / 2;
    const anchorY = view.h * (cam.mode === "BALL" ? 0.52 : 0.58);
    const sx = pr.u * cam.zoom, sy = pr.v * cam.zoom;
    cam.ox = m.damp(cam.ox, anchorX - sx, 6.5, dt);
    cam.oy = m.damp(cam.oy, anchorY - sy, 6.5, dt);

    /* shake */
    if (cam.shakeT > 0) {
      cam.shakeT -= dt;
      const a = cam.shakeAmp * (cam.shakeT / 0.4);
      cam.ox += (Math.random() * 2 - 1) * a;
      cam.oy += (Math.random() * 2 - 1) * a;
    }
    cam.ready = true;
  }

  /** hard snap (kickoff/mode change) */
  function snap(cam, target, ball, dt0) {
    const dt = 1 / 60;
    cam.ox = cam.ox || 0; cam.oy = cam.oy || 0; cam.zoom = cam.zoom || preset(cam.mode).zoom;
    /* teleport by running update with aggressive damping: emulate by direct set */
    const before = { ox: cam.ox, oy: cam.oy };
    update(cam, target, ball, 0.0001, { w: cam.vw || 800, h: cam.vh || 600 });
    cam.ox = m.damp(before.ox, cam.ox, 60, 1); // jump most of the way
    cam.oy = m.damp(before.oy, cam.oy, 60, 1);
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

  return { update, snap, toggle, setMode, mode };
})(RTL.C, RTL.mathx);

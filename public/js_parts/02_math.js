/* ==========================================================================
   RICKSY TAXI LEAGUE — 02_math.js
   Pure math helpers, isometric projection, seeded RNG. No DOM, no RTL deps.
   ========================================================================== */
"use strict";

RTL.mathx = (function () {
  const TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function damp(a, b, rate, dt) { return lerp(a, b, 1 - Math.exp(-rate * dt)); }
  function mod(a, n) { return ((a % n) + n) % n; }

  /** shortest signed angular difference b - a, result in (-PI, PI] */
  function angDiff(a, b) {
    let d = mod(b - a + Math.PI, TAU) - Math.PI;
    return d;
  }
  function angLerp(a, b, t) { return a + angDiff(a, b) * t; }
  function angDamp(a, b, rate, dt) { return angLerp(a, b, 1 - Math.exp(-rate * dt)); }

  function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
  function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }
  function dist3(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /** mulberry32 seeded RNG factory — deterministic matches for tests/replays */
  function rngFrom(seed) {
    let s = seed >>> 0;
    return function rng() {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---- Isometric projection ----
     World: x across pitch (0..68), y along length (0..105), z up.
     Screen: standard 2:1 iso (dimetric). rotate -45°, squash y by 0.5, z straight up.
     The camera owns offset+zoom; iso() is pure world->iso-units.               */
  const ISO_COS = Math.cos(-Math.PI / 4);
  const ISO_SIN = Math.sin(-Math.PI / 4);
  const ISO_Y_SQUASH = 0.5;

  /** world (x,y,z) -> iso units (u,v). u = right, v = DOWN on screen. */
  function iso(x, y, z) {
    const rx = x * ISO_COS - y * ISO_SIN;
    const ry = x * ISO_SIN + y * ISO_COS;
    return { u: rx, v: ry * ISO_Y_SQUASH - z };
  }

  /** convenience: full transform incl. camera. cam = {ox, oy, zoom, rot?, sq?}.
      rot = world yaw (RL chase cams rotate with the car/ball axis);
      defaults reproduce the classic -45deg iso look. */
  function project(x, y, z, cam, out) {
    const rot = cam && cam.rot != null ? cam.rot : -Math.PI / 4;
    const sq = cam && cam.sq != null ? cam.sq : ISO_Y_SQUASH;
    const c = Math.cos(rot), s = Math.sin(rot);
    const rx = x * c - y * s;
    const ry = x * s + y * c;
    const zm = cam ? cam.zoom : 1;
    const sx = (cam ? cam.ox : 0) + rx * zm;
    const sy = (cam ? cam.oy : 0) + ry * sq * zm - z * zm;
    if (out) { out.x = sx; out.y = sy; return out; }
    return { x: sx, y: sy };
  }

  /** screen -> ground plane (z=0) world coords (for touch aiming / debug clicks).
      Inverse of iso() at z=0: forward is rx = x·c + y·s, ry = -x·s + y·c (c=s=√2/2,
      then v = ry·0.5). Invert the rotation, then unsquash. */
  function unproject(sx, sy, cam) {
    const u = (sx - cam.ox) / cam.zoom;
    const v = (sy - cam.oy) / cam.zoom;
    const ry = v / ISO_Y_SQUASH;
    const rx = u;
    const c = ISO_COS, s = -ISO_SIN; // cos45, sin45
    return { x: rx * c - ry * s, y: rx * s + ry * c };
  }

  /* ---- easing ---- */
  function easeOutCubic(t) { const u = 1 - t; return 1 - u * u * u; }
  function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function easeOutBack(t) { const c = 1.70158; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; }

  /** deterministic pseudo-random from integer (for crowd/cosmetics) */
  function hash(n) {
    n = Math.imul(n ^ 0x9E3779B9, 0x85EBCA6B);
    n = Math.imul(n ^ (n >>> 13), 0xC2B2AE35);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  return {
    TAU, clamp, lerp, damp, mod, angDiff, angLerp, angDamp,
    dist, dist2, dist3, rngFrom, iso, project, unproject,
    easeOutCubic, easeInOutQuad, easeOutBack, hash,
  };
})();

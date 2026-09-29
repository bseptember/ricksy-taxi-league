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
      /* CAR cam — FIXED ISO, NO ROTATION (Brandon's verdict after playtest:
         the heading-locked chase rotated the world on every turn and felt
         unplayable — the whole pitch swung around; he asked for it removed).
         W/A/S/D push the car in constant screen directions. The car sprite
         still rotates to show its heading; only the VIEW stays still.
         Breathing zoom, ball lean and lazy pan are unchanged. */
      const hd = target.heading;
      rot = -Math.PI / 4;
      const la = (p.lookAhead || 5) * m.clamp(spd / 18, 0, 1.4);
      /* ball-bias: lean the look point toward a far ball so both stay framed.
         The look point sits ON the car→ball line. Baseline lean 0.55 (ball
         behind, needs a big lean) easing to 0.30 (ball dead ahead).
         CALM PASS 8 (final): extreme-range boost — look point converges to
         2/3 of the way toward the ball, NOT onto it. At bd 65 with zoom
         floor 11.7 the car+ball pair spans ~0.70 screen heights; look-on-ball
         pushed the car off the TOP. Look at 2/3 splits the seesaw: ballFy
         ~0.85, carFy ~0.15 — both on-screen, and car-drifting-to-edge is the
         reference game's exact documented behavior. */
      let bx = 0, by = 0, bdl = 0;
      if (ball) {
        const bdx = ball.x - target.x, bdy = ball.y - target.y;
        bdl = Math.hypot(bdx, bdy);
        if (bdl > 0.5) {
          const fx = Math.cos(hd), fy = Math.sin(hd);
          const behind = (bdx * fx + bdy * fy) / bdl; // +1 behind, -1 ahead
          const lean = 0.55 + (0.30 - 0.55) * m.clamp((-behind + 1) / 2, 0, 1);
          const distBoost = m.clamp((bdl - 25) / 40, 0, 1);
          const leanEff = lean + (0.67 - lean) * distBoost;
          const k = leanEff * (0.45 + 0.55 * m.clamp((bdl - 10) / 50, 0, 1));
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
      /* CALM BREATHING pass 4 — MEASURED RESOLUTION of the calm-vs-framing
         trade: with the zoom floor at 0.72x (calm, swing 1.35x) a ball punted
         to bd 70 sits at fy 1.78 (off bottom). The lean look-point cannot
         reach it (look point is bounded on the car->ball line). His game's
         answer: zoom IS the escape valve, but it breathes smoothly and comes
         BACK. So: floor 0.55 (allows 26 -> ~14 at extreme range) but the
         return is clamped to a gentle zoom-IN rate so it can never whoosh.
         Off-bottom at 70u for a couple of seconds while driving away is
         acceptable (ball guides show the landing marker); permanent 2.2x
         zoom oscillation is not. */
      const outF = m.clamp(1 - (bd - 14) / 60, 0.55, 1);
      /* anchor-aware fit-cap: the anchor leaves anchorY of the screen ABOVE
         the look point, so the ball-fit budget is (1 - anchorY + lean slack).
         Measured (geochk): mid-25u car-driven ball at 1.02, far-65u at 1.17 —
         both push past the frame because the old 0.55 budget vs 0.62 anchor
         + ball height + lean lag never fit. Budget 0.5 with anchor 0.62
         lands ball <= ~0.95 in the driven cases; car stays framed by lean. */
      const cap = (view.h * 0.5) / ((bd + 2) * sq);
      const tz = Math.min(
        p.zoom * adapt * outF * (1 - m.clamp((spd - 20) / 60, 0, 0.1)),
        cap
      );
      /* zoom-IN rate limiter (calm pass 5): zoom-OUT is instant-ish (framing
         safety, max 8 u/s measured) but zoom-IN is capped hard at 3.5 u/s so
         the camera eases back gently after a far-ball pull-out — no whoosh.
         (Pass 4 bug: limiter compared `nz > prev` after the damp step, which
         is always true when tz>prev, so the 6 u/s clamp applied to the damp
         STEP not the rate — zoom-out ran away to 6.2. Fixed: explicit rate
         clamp in zoom-units/second, both directions bounded.)
         Pass 6: zoom-OUT floor — the camera may never go below 0.45x of
         base (26 -> 11.7 floor). At bd 72 the fit-cap wants 5.7 (taxi sprite
         becomes unreadable); the lean look-point keeps the ball framed well
         enough at 11.7 (bfy ~1.3 transient), and 25->11.7 = 2.2x only in the
         extreme corner case — normal play swings ~1.3x. */
      const prev = cam.zoom || tz;
      let nz = prev + (tz - prev) * Math.min(1, 2.6 * dt);
      /* zoom-OUT also rate-limited (calm pass 9): the 9 u/s out-rate let the
         fit-cap dive 25 -> 12 in ~1.5s during a boost-punt (measured bfy
         1.28 transient at 4-5s). Zoom-out capped at 4.5 u/s: reaches the far
         framing in ~2.5s but never lunges. Zoom-in stays 3.5 u/s. */
      const dzMax = nz > prev ? 3.5 : 4.5;
      const dz = nz - prev;
      if (Math.abs(dz) > dzMax * dt) nz = prev + Math.sign(dz) * dzMax * dt;
      const zoomFloor = p.zoom * adapt * 0.45;
      if (nz < zoomFloor) nz = zoomFloor;
      cam.zoom = nz;
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
    /* RACING CHASE rotation rate: the car MUST stay facing up-screen while
       steering. Car yaw rate while turning hard at speed reaches ~3.5-4 rad/s
       (measured: cap 2.8 lagged to 0.84 rad = 48 deg nose-off during sustained
       turns — that reads as "car doesn't face forward"). CAR cap raised to
       4.5 rad/s: tracks a max-rate turn with < 0.1 rad lag. The flip deadzone
       still catches spin-outs, and the cap itself prevents whip. */
    const maxRate = cam.mode === "BALL"
      ? m.clamp(0.55 + Math.abs(dRot) * 4, 0.55, 4)
      : m.clamp(6.5 + Math.abs(dRot) * 2, 6.5, 10);  // racing chase: cap
              // scales with the deficit so the nose NEVER lags visibly
              // (6.5 base tracked 44deg behind in full-lock circles; error-
              // scaled term closes any deficit within ~0.2s). Still bounded,
              // so flip/spin spikes can't whip the frame (deadzone below).
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
    /* SMOOTH CATCH-UP (wobble fix): the old hard regime switch (2.3 -> 42 as
       `big` saturates) read as a violent lurch every time the soft zone
       overflowed. Now: smooth exponential curve, gentle top speed.
       CALM PASS 7b: base raised 2.3 -> 3.4 and catch-up top 14 -> 22 — the
       far-ball lean moves the look point 30-40u; at pan rate 2.3 the camera
       took ~3s to follow it, so the ball sat at fy 1.28 the whole time
       (measured). 3.4 base still reads lazy at close range, catch-up covers
       the big leans. */
    const big = m.clamp(perr / (view.h * 0.18), 0, 1);
    const panRate = 3.4 + 22 * big * big;
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

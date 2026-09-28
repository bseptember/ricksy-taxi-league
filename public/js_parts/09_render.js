/* ==========================================================================
   RICKSY TAXI LEAGUE — 09_render.js
   Iso scene renderer: sky, township skyline, stands, pitch, goals, pads,
   depth-sorted props/entities, ball + guides + trail, fx, floodlight overlay.
   No text. Integer pixel scaling. No per-frame allocations in hot paths.
   ========================================================================== */
"use strict";

RTL.render = (function (C, m, W, S) {
  let crowd = null;       // crowdPattern cached
  let props = null;       // world props cached
  let padList = null;     // boost pads cached

  function ensure() {
    if (!props) { props = W.props(); crowd = W.crowdPattern(); padList = W.boostPads(); }
  }

  /** pixel scale: derived from camera zoom so art stays chunky-consistent */
  function pickSizes(w, h, dpr) {
    const minSide = Math.min(w, h);
    let pixelScale = 3;
    if (minSide < 480) pixelScale = 2;
    if (minSide > 1100) pixelScale = 4;
    return { cssW: w, cssH: h, pixelScale };
  }

  /* ---------- scratch ---------- */
  const s1 = { x: 0, y: 0 };

  /** sprite scale: zoom is screen px per metre. A sprite of P px representing
      M metres wide needs scale = M*0.707*zoom/P. Callers pass k = M*0.707/P. */
  function sprScale(cam, k) {
    return Math.max(1, Math.round(cam.zoom * (k || 0.12)));
  }

  /* ================= scene pieces ================= */

  function drawSky(ctx, view) {
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, C.COLORS.sky);
    g.addColorStop(0.6, C.COLORS.skyLow);
    g.addColorStop(1, "#4a1f66");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);

    /* sun/moon */
    const sx = view.w * 0.78, sy = view.h * 0.12;
    ctx.fillStyle = "rgba(255,214,10,.9)";
    ctx.beginPath(); ctx.arc(sx, sy, 26, 0, m.TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,159,28,.35)";
    ctx.beginPath(); ctx.arc(sx, sy, 40, 0, m.TAU); ctx.fill();
  }

  function drawSkyline(ctx, view) {
    /* distant township roofs silhouette above the far touchline */
    const baseV = m.iso(0, 0, 0);
    const baseY = view.cam.oy + baseV.v * view.cam.zoom;
    const y0 = Math.min(baseY - 40, view.h * 0.42);
    ctx.fillStyle = "#241539";
    for (let i = -1; i < 24; i++) {
      const bw = 60 + ((i * 53) % 70);
      const bh = 26 + ((i * 71) % 60);
      const bx = ((i * 140) % (view.w + 200)) - 100;
      ctx.fillRect(bx, y0 - bh, bw, bh);
    }
    /* window dots */
    ctx.fillStyle = "rgba(245,197,66,.4)";
    for (let i = 0; i < 40; i++) {
      const wx = ((i * 197) % (view.w + 100)) - 50;
      const wy = y0 - 20 - ((i * 113) % 50);
      ctx.fillRect(wx, wy, 3, 4);
    }
  }

  function drawStands(ctx, view) {
    ensure();
    /* crowd strips along top edge (behind pitch) and bottom (in front, drawn later) */
    const cam = view.cam;
    const chant = view.match && view.match.state === "goal" ? 1 : 0;
    const frame = chant ? Math.floor(view.time * 8) % 2 : 0;
    /* far side (y=0 touchline) stands: rows going away from pitch */
    for (let row = 5; row >= 0; row--) {
      const wy = -6 - row * 4.2;
      const pA = m.project(-14, wy, 2 + row * 1.2, cam, s1);
      const pB = m.project(C.PITCH_W + 14, wy, 2 + row * 1.2, cam, s1);
      const rowW = pB.x - pA.x;
      if (rowW <= 0) continue;
      const strip = S._cache.crowd_row;
      if (!strip) break;
      const cv = strip[frame % strip.length];
      const th = cv.height * 2;
      /* dark stand backfill so the strip reads as a full stand */
      ctx.fillStyle = "#171226";
      ctx.fillRect(Math.round(pA.x), Math.round(pA.y - th * 1.9), rowW, th * 1.9);
      /* tile the strip at natural pixel size so it stays crisp */
      const tiles = Math.max(1, Math.round(rowW / (cv.width * 2)));
      const tw = rowW / tiles;
      for (let i = 0; i < tiles; i++) {
        ctx.drawImage(cv, Math.round(pA.x + i * tw), Math.round(pA.y - th), Math.ceil(tw) + 1, th);
      }
    }
    /* near side rows drawn after pitch (in drawFront) */
  }

  function drawFrontStands(ctx, view) {
    const cam = view.cam;
    const chant = view.match && view.match.state === "goal" ? 1 : 0;
    const frame = chant ? Math.floor(view.time * 8) % 2 : 0;
    for (let row = 0; row < 3; row++) {
      const wy = C.PITCH_H + 8 + row * 4.2;
      const pA = m.project(-14, wy, 2 + (2 - row) * 1.2, cam, s1);
      const pB = m.project(C.PITCH_W + 14, wy, 2 + (2 - row) * 1.2, cam, s1);
      const rowW = pB.x - pA.x;
      if (rowW <= 0) continue;
      const strip = S._cache.crowd_row;
      if (!strip) break;
      const cv = strip[frame % strip.length];
      const th = cv.height * 2;
      ctx.fillStyle = "#171226";
      ctx.fillRect(Math.round(pA.x), Math.round(pA.y - th * 1.9), rowW, th * 1.9);
      const tiles = Math.max(1, Math.round(rowW / (cv.width * 2)));
      const tw = rowW / tiles;
      for (let i = 0; i < tiles; i++) {
        ctx.drawImage(cv, Math.round(pA.x + i * tw), Math.round(pA.y - th), Math.ceil(tw) + 1, th);
      }
    }
  }

  function drawPitch(ctx, view) {
    const cam = view.cam;
    /* grass base diamond */
    ctx.fillStyle = C.COLORS.grassA;
    const corners = [
      m.project(0, 0, 0, cam), m.project(C.PITCH_W, 0, 0, cam),
      m.project(C.PITCH_W, C.PITCH_H, 0, cam), m.project(0, C.PITCH_H, 0, cam),
    ];
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fill();

    /* mow stripes (10 bands along Y) */
    ctx.fillStyle = C.COLORS.grassB;
    const band = C.PITCH_H / 10;
    for (let b = 0; b < 10; b += 2) {
      const y0 = b * band, y1 = (b + 1) * band;
      const c0 = m.project(0, y0, 0, cam), c1 = m.project(C.PITCH_W, y0, 0, cam);
      const c2 = m.project(C.PITCH_W, y1, 0, cam), c3 = m.project(0, y1, 0, cam);
      ctx.beginPath();
      ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y);
      ctx.closePath(); ctx.fill();
    }

    /* lines */
    ctx.strokeStyle = C.COLORS.grassLine;
    ctx.lineWidth = Math.max(2, cam.zoom * 0.35);
    const line = (ax, ay, bx2, by2) => {
      const p1 = m.project(ax, ay, 0, cam), p2 = m.project(bx2, by2, 0, cam);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    };
    line(0.3, 0.3, C.PITCH_W - 0.3, 0.3);
    line(C.PITCH_W - 0.3, 0.3, C.PITCH_W - 0.3, C.PITCH_H - 0.3);
    line(C.PITCH_W - 0.3, C.PITCH_H - 0.3, 0.3, C.PITCH_H - 0.3);
    line(0.3, C.PITCH_H - 0.3, 0.3, 0.3);
    line(0.3, C.PITCH_H / 2, C.PITCH_W - 0.3, C.PITCH_H / 2);
    /* centre circle (ellipse in iso) */
    const cc = m.project(34, 52.5, 0, cam);
    ctx.beginPath();
    ctx.ellipse(cc.x, cc.y, 9.15 * cam.zoom * 1.41, 9.15 * cam.zoom * 0.71, 0, 0, m.TAU);
    ctx.stroke();
    /* centre spot + penalty boxes */
    ctx.fillStyle = C.COLORS.grassLine;
    ctx.fillRect(cc.x - 2, cc.y - 2, 4, 4);
    /* boxes both ends */
    for (const [ya, yb] of [[0, 16.5], [C.PITCH_H, C.PITCH_H - 16.5]]) {
      const b0 = m.project(13.84, ya, 0, cam), b1 = m.project(54.16, ya, 0, cam);
      const b2 = m.project(54.16, yb, 0, cam), b3 = m.project(13.84, yb, 0, cam);
      ctx.beginPath();
      ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y);
      ctx.lineTo(b2.x, b2.y); ctx.lineTo(b3.x, b3.y);
      ctx.closePath(); ctx.stroke();
    }
  }

  function drawGoals(ctx, view) {
    const cam = view.cam;
    for (const end of [0, C.PITCH_H]) {
      const gx = W.GOAL_CX;
      const half = W.GOAL_HALF;
      /* posts: front posts at goal line, back posts deeper */
      const pTL = m.project(gx - half, end, 0, cam);
      const pTR = m.project(gx + half, end, 0, cam);
      const pTLt = m.project(gx - half, end, C.GOAL_HEIGHT, cam);
      const pTRt = m.project(gx + half, end, C.GOAL_HEIGHT, cam);
      const depth = end === 0 ? -C.GOAL_DEPTH : C.GOAL_DEPTH;
      const bTL = m.project(gx - half, end + depth, 0, cam);
      const bTR = m.project(gx + half, end + depth, 0, cam);
      const bTLt = m.project(gx - half, end + depth, C.GOAL_HEIGHT, cam);
      const bTRt = m.project(gx + half, end + depth, C.GOAL_HEIGHT, cam);

      /* net back panel */
      ctx.strokeStyle = "rgba(232,244,224,.45)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        const a = { x: bTLt.x + (bTRt.x - bTLt.x) * t, y: bTLt.y + (bTRt.y - bTLt.y) * t };
        const b2 = { x: bTL.x + (bTR.x - bTL.x) * t, y: bTL.y + (bTR.y - bTL.y) * t };
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
      }
      for (let i = 0; i <= 3; i++) {
        const t = i / 3;
        ctx.beginPath();
        ctx.moveTo(bTLt.x + (bTL.x - bTLt.x) * t, bTLt.y + (bTL.y - bTLt.y) * t);
        ctx.lineTo(bTRt.x + (bTR.x - bTRt.x) * t, bTRt.y + (bTR.y - bTRt.y) * t);
        ctx.stroke();
      }

      /* frame */
      ctx.strokeStyle = "#f0f0e8";
      ctx.lineWidth = Math.max(3, cam.zoom * 0.5);
      ctx.beginPath();
      ctx.moveTo(pTL.x, pTL.y); ctx.lineTo(pTLt.x, pTLt.y);
      ctx.lineTo(pTRt.x, pTRt.y); ctx.lineTo(pTR.x, pTR.y);
      ctx.stroke();
      /* side nets to back */
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pTLt.x, pTLt.y); ctx.lineTo(bTLt.x, bTLt.y);
      ctx.lineTo(bTRt.x, bTRt.y); ctx.lineTo(pTRt.x, pTRt.y);
      ctx.stroke();
    }
  }

  function drawPads(ctx, view) {
    const cam = view.cam;
    const frame = Math.floor(view.time * 3) % 2;
    const list = view.pads || padList;
    const sc = sprScale(cam, 0.13);
    for (const p of list) {
      if (!p.active) continue;
      S.draw(ctx, p.big ? "boostpad_big" : "boostpad_small",
        m.project(p.x, p.y, 0.05, cam).x, m.project(p.x, p.y, 0.05, cam).y,
        { frame, scale: sc });
    }
  }

  function drawProps(ctx, view) {
    const cam = view.cam;
    ensure();
    const sc = sprScale(cam, 0.14);
    /* far-side props only here (y < pitch); near-side in front pass */
    for (const p of props) {
      if (p.y > C.PITCH_H * 0.5) continue;
      drawProp(ctx, view, p, sc);
    }
  }
  function drawFrontProps(ctx, view) {
    const cam = view.cam;
    ensure();
    const sc = sprScale(cam, 0.14);
    for (const p of props) {
      if (p.y <= C.PITCH_H * 0.5) continue;
      drawProp(ctx, view, p, sc);
    }
  }
  function drawProp(ctx, view, p, sc) {
    const cam = view.cam;
    const pr = m.project(p.x, p.y, 0, cam, s1);
    switch (p.kind) {
      case "floodlight": S.draw(ctx, "floodlight", pr.x, pr.y, { scale: Math.round(sc * 1.6) }); break;
      case "billboard": S.draw(ctx, p.name, pr.x, pr.y, { scale: sc }); break;
      case "tree": S.draw(ctx, "tree", pr.x, pr.y, { scale: sc, frame: Math.floor(view.time * 2 + p.id) % 2 }); break;
      case "bench": S.draw(ctx, "bench", pr.x, pr.y, { scale: sc }); break;
      case "cone": S.draw(ctx, "cone", pr.x, pr.y, { scale: sc }); break;
    }
  }

  /* ---------- entities ---------- */
  function drawCar(ctx, view, car) {
    const cam = view.cam;
    if (car.demo.active) return; // demolished cars invisible until respawn
    const name = car.team === "blue" ? "taxi_blue" : "taxi_orange";
    const sc = sprScale(cam, 0.115);
    /* shadow on ground */
    const sh = m.project(car.x, car.y, 0, cam, s1);
    S.shadow(ctx, name, sh.x, sh.y, sc);
    /* body at z */
    const pr = m.project(car.x, car.y, car.z, cam, s1);
    const frame = car.onGround ? Math.floor(car.wheelspin) % 2 : 2;
    S.draw(ctx, name, pr.x, pr.y + sc, {
      frame, scale: sc,
      flip: Math.cos(car.heading) < 0,
    });
    /* boost flame */
    if (car.boostHeld) {
      const bx = car.x - Math.cos(car.heading) * 2.6;
      const by = car.y - Math.sin(car.heading) * 2.6;
      const bp = m.project(bx, by, car.z + 0.5, cam, s1);
      ctx.fillStyle = car.id === "P1" ? "rgba(255,214,10,.85)" : "rgba(255,159,28,.85)";
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, sc * 1.6, 0, m.TAU);
      ctx.fill();
    }
    /* carry ring */
    if (car.carrying) {
      ctx.strokeStyle = "rgba(46,230,107,.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y - sc * 8, sc * 5, 0, m.TAU);
      ctx.stroke();
    }
    /* player marker */
    if (car.id === "P1") {
      ctx.fillStyle = "#ffffff";
      const my = pr.y - sc * 20 - (Math.sin(view.time * 4) > 0 ? 2 : 0);
      ctx.beginPath();
      ctx.moveTo(pr.x, my + 6); ctx.lineTo(pr.x - 5, my); ctx.lineTo(pr.x + 5, my);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawBall(ctx, view) {
    const cam = view.cam;
    const sc = sprScale(cam, 0.075);
    /* trail */
    if (view.trail) {
      for (let i = 0; i < view.trail.length; i++) {
        const t = view.trail[i];
        const a = (i / view.trail.length) * 0.35;
        const tp = m.project(t.x, t.y, t.z, cam, s1);
        ctx.fillStyle = `rgba(242,237,226,${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, sc * 0.5, 0, m.TAU);
        ctx.fill();
      }
    }
    /* landing guide */
    if (view.guides && view.guides.active) {
      const gp = m.project(view.guides.landX, view.guides.landY, 0.05, cam, s1);
      const pulse = 1 + 0.15 * Math.sin(view.time * 8);
      ctx.strokeStyle = "rgba(255,214,10,.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(gp.x, gp.y, 10 * sc * 0.5 * pulse, 5 * sc * 0.5 * pulse, 0, 0, m.TAU);
      ctx.stroke();
      /* drop line from ball to landing spot */
      const bp0 = m.project(view.guides.landX, view.guides.landY, 0, cam, s1);
      void bp0;
    }
    /* ball shadow + ball */
    const sh = m.project(view.ball.x, view.ball.y, 0, cam, s1);
    S.shadow(ctx, "ball", sh.x, sh.y, sc);
    const pr = m.project(view.ball.x, view.ball.y, view.ball.z, cam, s1);
    const roll = Math.floor((view.ball.x + view.ball.y) * 1.4) % 3;
    S.draw(ctx, "ball", pr.x, pr.y, { frame: roll, scale: sc });
  }

  function drawFx(ctx, view) {
    const cam = view.cam;
    for (const p of view.fx) {
      const pr = m.project(p.x, p.y, p.z, cam, s1);
      const a = m.clamp(1 - p.t / p.life, 0, 1);
      if (p.kind === "spark") ctx.fillStyle = `rgba(255,214,10,${a.toFixed(2)})`;
      else if (p.kind === "smoke") ctx.fillStyle = `rgba(140,150,165,${(a * 0.7).toFixed(2)})`;
      else {
        const cols = [[255, 61, 139], [255, 214, 10], [46, 230, 107], [0, 229, 255]];
        const cc = cols[Math.floor(p.x + p.y) % 4];
        ctx.fillStyle = `rgba(${cc[0]},${cc[1]},${cc[2]},${a.toFixed(2)})`;
      }
      const size = Math.max(2, Math.round(view.cam.zoom * 0.45));
      ctx.fillRect(Math.round(pr.x), Math.round(pr.y), size, size);
    }
  }

  function drawLights(ctx, view) {
    if (view.lightFlicker >= 0.98) return;
    ctx.save();
    ctx.fillStyle = `rgba(8,6,20,${((1 - view.lightFlicker) * 0.45).toFixed(3)})`;
    ctx.fillRect(0, 0, view.w, view.h);
    /* light cones from the 4 corners */
    const cam = view.cam;
    ensure();
    ctx.globalAlpha = 0.10;
    for (const p of props) {
      if (p.kind !== "floodlight") continue;
      const pr = m.project(p.x, p.y, 0, cam, s1);
      const top = m.project(p.x, p.y, 30, cam, s1);
      const grad = ctx.createLinearGradient(top.x, top.y, pr.x, pr.y);
      grad.addColorStop(0, "rgba(255,240,180,.9)");
      grad.addColorStop(1, "rgba(255,240,180,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(pr.x - 120, pr.y);
      ctx.lineTo(pr.x + 120, pr.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /* ================= main entry ================= */
  function drawScene(ctx, view) {
    ensure();
    drawSky(ctx, view);
    drawSkyline(ctx, view);
    drawStands(ctx, view);
    drawPitch(ctx, view);
    drawGoals(ctx, view);
    drawPads(ctx, view);
    drawProps(ctx, view);
    /* depth list: cars + ball by iso v */
    const ent = [];
    for (const car of view.cars) ent.push({ v: car.x + car.y, kind: "car", o: car });
    ent.push({ v: view.ball.x + view.ball.y, kind: "ball", o: view.ball });
    ent.sort((a, b) => a.v - b.v);
    for (const e of ent) {
      if (e.kind === "car") drawCar(ctx, view, e.o);
      else drawBall(ctx, view);
    }
    drawFrontProps(ctx, view);
    drawFrontStands(ctx, view);
    drawFx(ctx, view);
    drawLights(ctx, view);
  }

  return { drawScene, pickSizes };
})(RTL.C, RTL.mathx, RTL.world, RTL.spr);

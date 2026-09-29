/* ==========================================================================
   RICKSY TAXI LEAGUE — 12_ui.js
   Canvas HUD + pixel font text + DOM touch overlay + menus.
   Desktop and mobile get the same layouts scaled by view.
   Text rendering helper: pixel-look via monospace font, imageSmoothing off.
   ========================================================================== */
"use strict";

RTL.ui = (function (C, m) {
  const FONT = '"Press Start 2P", monospace';

  /* ---------- text helpers ---------- */
  function text(ctx, str, x, y, size, color, align, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.font = size + "px " + FONT;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = color || C.COLORS.uiInk;
    ctx.fillText(str, Math.round(x), Math.round(y));
    ctx.restore();
  }
  function textShadow(ctx, str, x, y, size, color, align, shadow) {
    text(ctx, str, x + 2, y + 2, size, shadow || "rgba(0,0,0,.6)", align);
    text(ctx, str, x, y, size, color, align);
  }

  /* ---------- panels ---------- */
  function panel(ctx, x, y, w, h, opts) {
    const o = opts || {};
    ctx.save();
    ctx.fillStyle = o.bg || C.COLORS.uiPanel;
    ctx.globalAlpha = o.alpha == null ? 0.92 : o.alpha;
    /* pixel-corner rect */
    const c = 6;
    ctx.beginPath();
    ctx.moveTo(x + c, y);
    ctx.lineTo(x + w - c, y);
    ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h);
    ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c);
    ctx.lineTo(x, y + c);
    ctx.closePath();
    ctx.fill();
    if (o.border !== false) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = o.borderColor || "rgba(255,255,255,.18)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function button(ctx, str, x, y, w, h, focused, opts) {
    const o = opts || {};
    /* POP-ART BUTTONS: chunky offset shadow slab, hot fill, thick border.
       Focused = sunshine yellow w/ magenta border; idle = deep purple w/ cyan edge. */
    const c = 6;
    const slab = (px, py, bg, border, lw) => {
      ctx.save();
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(px + c, py); ctx.lineTo(px + w - c, py);
      ctx.lineTo(px + w, py + c); ctx.lineTo(px + w, py + h - c);
      ctx.lineTo(px + w - c, py + h); ctx.lineTo(px + c, py + h);
      ctx.lineTo(px, py + h - c); ctx.lineTo(px, py + c);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = border; ctx.lineWidth = lw; ctx.stroke();
      ctx.restore();
    };
    /* drop slab (offset shadow — pop poster depth, no blur) */
    slab(x + 4, y + 5, "rgba(10,6,26,.9)", "rgba(10,6,26,.9)", 2);
    slab(x, y,
      focused ? (o.focusBg || C.COLORS.accent) : (o.bg || C.COLORS.uiPanel),
      focused ? (C.COLORS.danger || "#ff4a6a") : "rgba(63,167,255,.75)",
      focused ? 3 : 2);
    textShadow(ctx, str, x + w / 2, y + h / 2 - o.size / 2, o.size || 10,
      focused ? "#1a0f3a" : "#ffffff", "center");
  }

  /* ---------- HUD (in-match) ---------- */
  function hud(ctx, view, ui) {
    const { w } = view;
    const K = Math.max(1, w / 1300);   // canvas-resolution scale for all HUD sizes
    const match = view.match;
    /* scoreboard plate */
    const pw = 210 * K, ph = 34 * K;
    const px = w / 2 - pw / 2, py = 8;
    panel(ctx, px, py, pw, ph, { bg: "#0b1522", alpha: 0.86 });
    textShadow(ctx, String(match.score.blue), px + 34 * K, py + 11 * K, 14 * K, C.COLORS.blue, "center");
    textShadow(ctx, String(match.score.orange), px + pw - 34 * K, py + 11 * K, 14 * K, C.COLORS.orange, "center");
    const t = Math.max(0, match.t);
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    const clock = mm + ":" + (ss < 10 ? "0" : "") + ss;
    textShadow(ctx, clock, px + pw / 2, py + 11 * K, 14 * K, t <= 10 && match.state === "play" ? C.COLORS.danger : "#ffffff", "center");
    /* YOU / difficulty-name / BOT labels under the scoreboard (retro league parity) */
    text(ctx, "YOU", px + 34 * K, py + ph + 4, 7 * K, C.COLORS.blue, "center");
    text(ctx, C.AI_DIFFICULTIES[ui.difficulty || 0], px + pw / 2, py + ph + 4, 7 * K, C.COLORS.uiDim, "center");
    text(ctx, "BOT", px + pw - 34 * K, py + ph + 4, 7 * K, C.COLORS.orange, "center");
    if (match.overtime) text(ctx, "GOLDEN GOAL", px + pw / 2, py + ph + 2, 8 * K, C.COLORS.accent, "center", 0.6 + 0.4 * Math.sin(view.time * 6));

    /* boost gauge bottom-left */
    const car = view.playerCar;
    if (car) {
      const gx = 14 * K, gy = view.h - 46 * K, gw = 120 * K, gh = 14 * K;
      panel(ctx, gx - 4 * K, gy - 4 * K, gw + 8 * K, gh + 8 * K, { bg: "#0b1522", alpha: 0.8 });
      ctx.fillStyle = "#0e2033";
      ctx.fillRect(gx, gy, gw, gh);
      const frac = car.boost / C.MAX_BOOST;
      ctx.fillStyle = frac > 0.3 ? C.COLORS.accent : C.COLORS.danger;
      ctx.fillRect(gx, gy, Math.round(gw * frac), gh);
      text(ctx, "BOOST " + Math.round(car.boost), gx + 2, gy - 16 * K, 8 * K, C.COLORS.uiDim);

      /* speed (km/h) under boost */
      const kmh = Math.round(Math.hypot(car.vx, car.vy) * 3.6);
      text(ctx, kmh + " KM/H", gx + 2, gy + gh + 6 * K, 8 * K, C.COLORS.uiDim);
    }

    /* camera mode chip bottom-right */
    const camStr = view.cam.mode + " CAM [B]";
    const cw = 150 * K;
    panel(ctx, w - cw - 10 * K, view.h - 36 * K, cw, 26 * K, { bg: "#0b1522", alpha: 0.8 });
    text(ctx, camStr, w - cw / 2 - 10 * K, view.h - 29 * K, 9 * K, C.COLORS.uiDim, "center");

    /* carry indicator */
    if (car && car.carrying) {
      textShadow(ctx, "CARRY! F TO SHOOT", w / 2, view.h - 70 * K, 10 * K, C.COLORS.good, "center");
    } else if (car && !car.carrying && car.carryCd <= 0) {
      /* SHOT READY hint (retro league parity) */
      text(ctx, "SHOT READY - TAP F TO SHOOT", 12 * K, view.h - 76 * K, 7 * K, C.COLORS.good);
    }
    /* first-drive control hint: shows for the first 8s of every match, then
       fades. W = up-screen (fixed iso), SHIFT = boost, B = camera. */
    if (match.firstDriveT != null && match.firstDriveT < 8) {
      const a = m.clamp(Math.min(1, (8 - match.firstDriveT) / 1.5), 0, 1);
      const hy = view.h - 120 * K;
      const lines = ["W A S D - DRIVE", "SHIFT - BOOST", "B - CAMERA", "F - SHOOT"];
      panel(ctx, w / 2 - 95 * K, hy - 16 * K, 190 * K, (lines.length + 1.4) * 14 * K, { bg: "#14061f", alpha: a * 0.72, border: false });
      lines.forEach((ln, i) => {
        text(ctx, ln, w / 2, hy + i * 14 * K, 9 * K, i === 0 ? C.COLORS.accent : "#ffffff", "center", a);
      });
    }
    /* mobile: boost button fills */
    if (ui.touchMode) {
      /* drawn by DOM overlay; nothing here */
    }
  }

  /* ---------- banners ---------- */
  function banner(ctx, view, b) {
    if (!b || b.t <= 0) return;
    const K = Math.max(1, view.w / 1300);
    const a = m.clamp(b.t / 0.4, 0, 1);
    const pop = b.t > b.total - 0.25 ? m.easeOutBack(m.clamp((b.total - b.t) / 0.25, 0, 1)) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(view.w / 2, view.h * 0.32);
    ctx.scale(pop, pop);
    const size = (b.big ? 34 : 22) * K;
    const bw = Math.max(b.text.length * size + 60 * K, 300 * K);
    panel(ctx, -bw / 2, -size, bw, size * 2, { bg: b.color || C.COLORS.orange, alpha: 0.94 });
    textShadow(ctx, b.text, 0, -size + 6 * K, size, "#ffffff", "center");
    if (b.sub) text(ctx, b.sub, 0, size + 10 * K, 10 * K, "#ffffff", "center", a);
    ctx.restore();
  }

  /* ---------- countdown ---------- */
  function countdown(ctx, view, n) {
    if (n == null) return;
    const K = Math.max(1, view.w / 1300);
    const pop = 1 + 0.2 * Math.sin(view.time * 10);
    ctx.save();
    ctx.translate(view.w / 2, view.h * 0.4);
    ctx.scale(pop, pop);
    textShadow(ctx, n, 0, 0, 42 * K, n === "GO!" ? C.COLORS.good : "#ffffff", "center");
    ctx.restore();
  }

  /* ---------- menus ---------- */
  /* ui.screen: 'boot'|'menu'|'settings'|'controls'|'matchSetup'|'playing'|'paused'|'fulltime' */
  function drawMenu(ctx, view, ui, hit) {
    const { w, h } = view;
    const K = Math.max(1, w / 1300);
    ctx.save();
    ctx.fillStyle = "rgba(6,10,20,.55)";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    /* title */
    const title = "RICKSY TAXI LEAGUE";
    const ts = Math.min(30, w / 18) * K;
    textShadow(ctx, title, w / 2, Math.max(24, h * 0.09), ts, C.COLORS.accent, "center");
    text(ctx, "KASI CAR SOCCER - 5 MINUTE DERBY", w / 2, Math.max(24, h * 0.09) + ts + 8, 9 * K, C.COLORS.uiDim, "center");

    if (ui.screen === "menu") {
      const bw = Math.min(320 * K, w - 60), bx = w / 2 - bw / 2;
      let by = h * 0.30;
      const items = [
        ["PLAY MATCH", "playMatch"],
        ["FREE PLAY", "freePlay"],
        ["SETTINGS", "settings"],
        ["CONTROLS", "controls"],
      ];
      for (const [label, act] of items) {
        button(ctx, label, bx, by, bw, 46 * K, ui.focus === act, { size: 13 * K });
        hit.add(bx, by, bw, 46 * K, act);
        by += 56 * K;
      }
      text(ctx, "AMANDLA FC  vs  IBHOKISI FC", w / 2, by + 6, 8 * K, C.COLORS.uiDim, "center");
    }

    if (ui.screen === "matchSetup") {
      const bw = Math.min(360 * K, w - 50), bx = w / 2 - bw / 2, by = h * 0.30;
      text(ctx, "OPPONENT", w / 2, by - 22, 10 * K, C.COLORS.uiDim, "center");
      /* difficulty row */
      const dw = (bw - 30) / 4;
      for (let i = 0; i < 4; i++) {
        const dx = bx + 10 + i * (dw + 3);
        button(ctx, C.AI_DIFFICULTIES[i], dx, by, dw, 34 * K, ui.difficulty === i, { size: 8 * K });
        hit.add(dx, by, dw, 34 * K, "diff:" + i);
      }
      let cy = by + 52 * K;
      /* controls mode */
      text(ctx, "CONTROLS STYLE", w / 2, cy - 20, 10 * K, C.COLORS.uiDim, "center");
      const cw = (bw - 20) / 2;
      button(ctx, "ASSISTED - EASY", bx + 8, cy, cw, 40 * K, ui.assisted, { size: 9 * K });
      hit.add(bx + 8, cy, cw, 40 * K, "assisted");
      button(ctx, "CLASSIC - PRO", bx + 12 + cw, cy, cw, 40 * K, !ui.assisted, { size: 9 * K });
      hit.add(bx + 12 + cw, cy, cw, 40 * K, "classic");
      cy += 56 * K;
      button(ctx, "KICK OFF!", bx, cy, bw, 48 * K, ui.focus === "kickoff", { size: 14 * K, focusBg: "#1d5a30" });
      hit.add(bx, cy, bw, 48 * K, "kickoff");
      cy += 62 * K;
      button(ctx, "BACK", w / 2 - 60 * K, cy, 120 * K, 30 * K, false, { size: 9 * K });
      hit.add(w / 2 - 60 * K, cy, 120 * K, 30 * K, "menu");
    }

    if (ui.screen === "settings") {
      const bw = Math.min(340 * K, w - 50), bx = w / 2 - bw / 2, by = h * 0.28;
      let cy = by;
      button(ctx, "SOUND: " + (ui.muted ? "OFF" : "ON"), bx, cy, bw, 42 * K, ui.focus === "sound", { size: 11 * K });
      hit.add(bx, cy, bw, 42 * K, "toggleSound"); cy += 52 * K;
      button(ctx, "BALL GUIDES: " + (ui.guides ? "ON" : "OFF"), bx, cy, bw, 42 * K, ui.focus === "guides", { size: 11 * K });
      hit.add(bx, cy, bw, 42 * K, "toggleGuides"); cy += 52 * K;
      button(ctx, "DEFAULT CAMERA: " + ui.defaultCam, bx, cy, bw, 42 * K, ui.focus === "cam", { size: 11 * K });
      hit.add(bx, cy, bw, 42 * K, "cycleCam"); cy += 52 * K;
      button(ctx, "TOUCH CONTROLS: " + (ui.forceTouch ? "ON" : "AUTO"), bx, cy, bw, 42 * K, false, { size: 11 * K });
      hit.add(bx, cy, bw, 42 * K, "toggleTouch"); cy += 56 * K;
      button(ctx, "BACK", w / 2 - 60 * K, cy, 120 * K, 30 * K, false, { size: 9 * K });
      hit.add(w / 2 - 60 * K, cy, 120 * K, 30 * K, "menu");
    }

    if (ui.screen === "controls") {
      const bw = Math.min(400 * K, w - 40), bx = w / 2 - bw / 2, by = h * 0.22;
      panel(ctx, bx, by - 24, bw, 260 * K, { bg: "#0b1522" });
      const rows = [
        ["DRIVE", "W/S or STICK UP/DOWN"],
        ["STEER", "A/D or STICK LEFT/RIGHT"],
        ["JUMP + FLIP", "SPACE (tap = hop, again = flip)"],
        ["BOOST", "SHIFT / LEFT MOUSE / BTN"],
        ["SHOOT", "F"],
        ["CARRY BALL", "C (balance it on the roof)"],
        ["SWITCH CAMERA", "B  (CAR / BALL / TUNNEL)"],
        ["PAUSE", "P or ESC"],
      ];
      let ry = by - 8;
      for (const [k2, v] of rows) {
        text(ctx, k2, bx + 16, ry, 9 * K, C.COLORS.accent);
        text(ctx, v, bx + bw - 16, ry, 9 * K, C.COLORS.uiDim, "right");
        ry += 26 * K;
      }
      button(ctx, "BACK", w / 2 - 60 * K, by + 250 * K, 120 * K, 30 * K, false, { size: 9 * K });
      hit.add(w / 2 - 60 * K, by + 250 * K, 120 * K, 30 * K, "menu");
    }

    if (ui.screen === "paused") {
      textShadow(ctx, "PAUSED", w / 2, h * 0.24, 26 * K, "#ffffff", "center");
      const bw = Math.min(300 * K, w - 60), bx = w / 2 - bw / 2;
      let cy = h * 0.38;
      button(ctx, "RESUME", bx, cy, bw, 44 * K, ui.focus === "resume", { size: 12 * K });
      hit.add(bx, cy, bw, 44 * K, "resume"); cy += 54 * K;
      button(ctx, "RESTART MATCH", bx, cy, bw, 40 * K, false, { size: 10 * K });
      hit.add(bx, cy, bw, 40 * K, "restartMatch"); cy += 50 * K;
      button(ctx, "SOUND: " + (ui.muted ? "OFF" : "ON"), bx, cy, bw, 40 * K, false, { size: 10 * K });
      hit.add(bx, cy, bw, 40 * K, "toggleSound"); cy += 50 * K;
      button(ctx, "QUIT TO MENU", bx, cy, bw, 40 * K, false, { size: 10 * K, color: C.COLORS.danger });
      hit.add(bx, cy, bw, 40 * K, "quit");
    }

    if (ui.screen === "fulltime") {
      const ft = ui.fullTime;
      textShadow(ctx, ft.title, w / 2, h * 0.20, 24 * K, C.COLORS.accent, "center");
      let cy = h * 0.34;
      for (const line of ft.lines) {
        text(ctx, line, w / 2, cy, 11 * K, C.COLORS.uiInk, "center");
        cy += 24 * K;
      }
      const bw = Math.min(300 * K, w - 60), bx = w / 2 - bw / 2;
      button(ctx, "REMATCH", bx, cy + 16, bw, 44 * K, ui.focus === "rematch", { size: 12 * K });
      hit.add(bx, cy + 16, bw, 44 * K, "rematch");
      button(ctx, "MENU", bx, cy + 70, bw, 36 * K, false, { size: 10 * K });
      hit.add(bx, cy + 70, bw, 36 * K, "menu");
    }
  }

  /* ---------- touch overlay (DOM) ---------- */
  function touchOverlay(root, show) {
    let el = root.querySelector("#rtl-touch");
    if (!el) {
      el = document.createElement("div");
      el.id = "rtl-touch";
      el.innerHTML =
        '<div id="rtl-stick" data-stick="1"></div>' +
        '<div class="rtl-btn" data-btn="shoot" id="rtl-b-shoot">SHOT</div>' +
        '<div class="rtl-btn" data-btn="carry" id="rtl-b-carry">CARRY</div>' +
        '<div class="rtl-btn" data-btn="jump" id="rtl-b-jump">JUMP</div>' +
        '<div class="rtl-btn" data-btn="boost" id="rtl-b-boost">BOOST</div>' +
        '<div class="rtl-btn" data-btn="cam" id="rtl-b-cam">CAM</div>' +
        '<div class="rtl-btn" data-btn="pause" id="rtl-b-pause">II</div>';
      root.appendChild(el);
    }
    el.style.display = show ? "block" : "none";
    return el;
  }

  return { text, textShadow, panel, button, hud, banner, countdown, drawMenu, touchOverlay, FONT };
})(RTL.C, RTL.mathx);

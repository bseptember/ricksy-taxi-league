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
    panel(ctx, x, y, w, h, {
      bg: focused ? (o.focusBg || "#1d4a70") : (o.bg || "#132238"),
      borderColor: focused ? C.COLORS.accent : "rgba(255,255,255,.16)",
      alpha: o.alpha,
    });
    textShadow(ctx, str, x + w / 2, y + h / 2 - o.size / 2, o.size || 10,
      focused ? "#ffffff" : (o.color || C.COLORS.uiDim), "center");
  }

  /* ---------- HUD (in-match) ---------- */
  function hud(ctx, view, ui) {
    const { w } = view;
    const match = view.match;
    /* scoreboard plate */
    const pw = 210, px = w / 2 - pw / 2, py = 8;
    panel(ctx, px, py, pw, 34, { bg: "#0b1522", alpha: 0.86 });
    textShadow(ctx, String(match.score.blue), px + 34, py + 11, 14, C.COLORS.blue, "center");
    textShadow(ctx, String(match.score.orange), px + pw - 34, py + 11, 14, C.COLORS.orange, "center");
    const t = Math.max(0, match.t);
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    const clock = mm + ":" + (ss < 10 ? "0" : "") + ss;
    textShadow(ctx, clock, px + pw / 2, py + 11, 14, t <= 10 && match.state === "play" ? C.COLORS.danger : "#ffffff", "center");
    if (match.overtime) text(ctx, "GOLDEN GOAL", px + pw / 2, py + 36, 8, C.COLORS.accent, "center", 0.6 + 0.4 * Math.sin(view.time * 6));

    /* boost gauge bottom-left */
    const car = view.playerCar;
    if (car) {
      const gx = 14, gy = view.h - 46, gw = 120, gh = 14;
      panel(ctx, gx - 4, gy - 4, gw + 8, gh + 8, { bg: "#0b1522", alpha: 0.8 });
      ctx.fillStyle = "#0e2033";
      ctx.fillRect(gx, gy, gw, gh);
      const frac = car.boost / C.MAX_BOOST;
      ctx.fillStyle = frac > 0.3 ? C.COLORS.accent : C.COLORS.danger;
      ctx.fillRect(gx, gy, Math.round(gw * frac), gh);
      text(ctx, "BOOST " + Math.round(car.boost), gx + 2, gy - 14, 8, C.COLORS.uiDim);

      /* speed (km/h) under boost */
      const kmh = Math.round(Math.hypot(car.vx, car.vy) * 3.6);
      text(ctx, kmh + " KM/H", gx + 2, gy + gh + 6, 8, C.COLORS.uiDim);
    }

    /* camera mode chip bottom-right */
    const camStr = view.cam.mode + " CAM [B]";
    const cw = 130;
    panel(ctx, w - cw - 10, view.h - 34, cw, 24, { bg: "#0b1522", alpha: 0.8 });
    text(ctx, camStr, w - cw / 2 - 10, view.h - 28, 8, C.COLORS.uiDim, "center");

    /* carry indicator */
    if (car && car.carrying) {
      textShadow(ctx, "CARRY! F TO SHOOT", w / 2, view.h - 60, 10, C.COLORS.good, "center");
    }
    /* mobile: boost button fills */
    if (ui.touchMode) {
      /* drawn by DOM overlay; nothing here */
    }
  }

  /* ---------- banners ---------- */
  function banner(ctx, view, b) {
    if (!b || b.t <= 0) return;
    const a = m.clamp(b.t / 0.4, 0, 1);
    const pop = b.t > b.total - 0.25 ? m.easeOutBack(m.clamp((b.total - b.t) / 0.25, 0, 1)) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(view.w / 2, view.h * 0.32);
    ctx.scale(pop, pop);
    const size = b.big ? 34 : 22;
    const bw = Math.max(b.text.length * size + 60, 300);
    panel(ctx, -bw / 2, -size, bw, size * 2, { bg: b.color || C.COLORS.orange, alpha: 0.94 });
    textShadow(ctx, b.text, 0, -size + 6, size, "#ffffff", "center");
    if (b.sub) text(ctx, b.sub, 0, size + 10, 10, "#ffffff", "center", a);
    ctx.restore();
  }

  /* ---------- countdown ---------- */
  function countdown(ctx, view, n) {
    if (n == null) return;
    const pop = 1 + 0.2 * Math.sin(view.time * 10);
    ctx.save();
    ctx.translate(view.w / 2, view.h * 0.4);
    ctx.scale(pop, pop);
    textShadow(ctx, n, 0, 0, 42, n === "GO!" ? C.COLORS.good : "#ffffff", "center");
    ctx.restore();
  }

  /* ---------- menus ---------- */
  /* ui.screen: 'boot'|'menu'|'settings'|'controls'|'matchSetup'|'playing'|'paused'|'fulltime' */
  function drawMenu(ctx, view, ui, hit) {
    const { w, h } = view;
    ctx.save();
    ctx.fillStyle = "rgba(6,10,20,.55)";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    /* title */
    const title = "RICKSY TAXI LEAGUE";
    const ts = Math.min(30, w / 18);
    textShadow(ctx, title, w / 2, Math.max(24, h * 0.09), ts, C.COLORS.accent, "center");
    text(ctx, "KASI CAR SOCCER - 5 MINUTE DERBY", w / 2, Math.max(24, h * 0.09) + ts + 8, 9, C.COLORS.uiDim, "center");

    if (ui.screen === "menu") {
      const bw = Math.min(320, w - 60), bx = w / 2 - bw / 2;
      let by = h * 0.30;
      const items = [
        ["PLAY MATCH", "playMatch"],
        ["FREE PLAY", "freePlay"],
        ["SETTINGS", "settings"],
        ["CONTROLS", "controls"],
      ];
      for (const [label, act] of items) {
        button(ctx, label, bx, by, bw, 46, ui.focus === act, { size: 13 });
        hit.add(bx, by, bw, 46, act);
        by += 56;
      }
      text(ctx, "AMANDLA FC  vs  IBHOKISI FC", w / 2, by + 6, 8, C.COLORS.uiDim, "center");
    }

    if (ui.screen === "matchSetup") {
      const bw = Math.min(360, w - 50), bx = w / 2 - bw / 2, by = h * 0.30;
      text(ctx, "OPPONENT", w / 2, by - 22, 10, C.COLORS.uiDim, "center");
      /* difficulty row */
      const dw = (bw - 30) / 4;
      for (let i = 0; i < 4; i++) {
        const dx = bx + 10 + i * (dw + 3);
        button(ctx, C.AI_DIFFICULTIES[i], dx, by, dw, 34, ui.difficulty === i, { size: 8 });
        hit.add(dx, by, dw, 34, "diff:" + i);
      }
      let cy = by + 52;
      /* controls mode */
      text(ctx, "CONTROLS STYLE", w / 2, cy - 20, 10, C.COLORS.uiDim, "center");
      const cw = (bw - 20) / 2;
      button(ctx, "ASSISTED - EASY", bx + 8, cy, cw, 40, ui.assisted, { size: 9 });
      hit.add(bx + 8, cy, cw, 40, "assisted");
      button(ctx, "CLASSIC - PRO", bx + 12 + cw, cy, cw, 40, !ui.assisted, { size: 9 });
      hit.add(bx + 12 + cw, cy, cw, 40, "classic");
      cy += 56;
      button(ctx, "KICK OFF!", bx, cy, bw, 48, ui.focus === "kickoff", { size: 14, focusBg: "#1d5a30" });
      hit.add(bx, cy, bw, 48, "kickoff");
      cy += 62;
      button(ctx, "BACK", w / 2 - 60, cy, 120, 30, false, { size: 9 });
      hit.add(w / 2 - 60, cy, 120, 30, "menu");
    }

    if (ui.screen === "settings") {
      const bw = Math.min(340, w - 50), bx = w / 2 - bw / 2, by = h * 0.28;
      let cy = by;
      button(ctx, "SOUND: " + (ui.muted ? "OFF" : "ON"), bx, cy, bw, 42, ui.focus === "sound", { size: 11 });
      hit.add(bx, cy, bw, 42, "toggleSound"); cy += 52;
      button(ctx, "BALL GUIDES: " + (ui.guides ? "ON" : "OFF"), bx, cy, bw, 42, ui.focus === "guides", { size: 11 });
      hit.add(bx, cy, bw, 42, "toggleGuides"); cy += 52;
      button(ctx, "DEFAULT CAMERA: " + ui.defaultCam, bx, cy, bw, 42, ui.focus === "cam", { size: 11 });
      hit.add(bx, cy, bw, 42, "cycleCam"); cy += 52;
      button(ctx, "TOUCH CONTROLS: " + (ui.forceTouch ? "ON" : "AUTO"), bx, cy, bw, 42, false, { size: 11 });
      hit.add(bx, cy, bw, 42, "toggleTouch"); cy += 56;
      button(ctx, "BACK", w / 2 - 60, cy, 120, 30, false, { size: 9 });
      hit.add(w / 2 - 60, cy, 120, 30, "menu");
    }

    if (ui.screen === "controls") {
      const bw = Math.min(400, w - 40), bx = w / 2 - bw / 2, by = h * 0.22;
      panel(ctx, bx, by - 24, bw, 260, { bg: "#0b1522" });
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
        text(ctx, k2, bx + 16, ry, 9, C.COLORS.accent);
        text(ctx, v, bx + bw - 16, ry, 9, C.COLORS.uiDim, "right");
        ry += 26;
      }
      button(ctx, "BACK", w / 2 - 60, by + 250, 120, 30, false, { size: 9 });
      hit.add(w / 2 - 60, by + 250, 120, 30, "menu");
    }

    if (ui.screen === "paused") {
      textShadow(ctx, "PAUSED", w / 2, h * 0.24, 26, "#ffffff", "center");
      const bw = Math.min(300, w - 60), bx = w / 2 - bw / 2;
      let cy = h * 0.38;
      button(ctx, "RESUME", bx, cy, bw, 44, ui.focus === "resume", { size: 12 });
      hit.add(bx, cy, bw, 44, "resume"); cy += 54;
      button(ctx, "RESTART MATCH", bx, cy, bw, 40, false, { size: 10 });
      hit.add(bx, cy, bw, 40, "restartMatch"); cy += 50;
      button(ctx, "SOUND: " + (ui.muted ? "OFF" : "ON"), bx, cy, bw, 40, false, { size: 10 });
      hit.add(bx, cy, bw, 40, "toggleSound"); cy += 50;
      button(ctx, "QUIT TO MENU", bx, cy, bw, 40, false, { size: 10, color: C.COLORS.danger });
      hit.add(bx, cy, bw, 40, "quit");
    }

    if (ui.screen === "fulltime") {
      const ft = ui.fullTime;
      textShadow(ctx, ft.title, w / 2, h * 0.20, 24, C.COLORS.accent, "center");
      let cy = h * 0.34;
      for (const line of ft.lines) {
        text(ctx, line, w / 2, cy, 11, C.COLORS.uiInk, "center");
        cy += 24;
      }
      const bw = Math.min(300, w - 60), bx = w / 2 - bw / 2;
      button(ctx, "REMATCH", bx, cy + 16, bw, 44, ui.focus === "rematch", { size: 12 });
      hit.add(bx, cy + 16, bw, 44, "rematch");
      button(ctx, "MENU", bx, cy + 70, bw, 36, false, { size: 10 });
      hit.add(bx, cy + 70, bw, 36, "menu");
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

/* ==========================================================================
   RICKSY TAXI LEAGUE — 10_input.js
   Keyboard + mouse + touch -> RTL.input.state snapshot each frame.
   Mobile-first: virtual stick + action buttons, safe-area aware.
   Owns its listeners; exposes dispose().
   ========================================================================== */
"use strict";

RTL.input = (function (C, m) {
  const state = {
    /* unified per-frame action state */
    throttle: 0, steer: 0,
    boost: false, jump: false, shoot: false, carry: false, brake: false,
    /* UI intents (consumed by main each frame) */
    camToggle: false, pauseToggle: false,
    /* raw */
    keys: {}, pointerDown: false,
  };

  /* touch UI state written by ui module / DOM overlay */
  const touch = {
    active: false,           // touch mode engaged?
    stick: { id: null, cx: 0, cy: 0, dx: 0, dy: 0 },
    btn: { boost: false, jump: false, shoot: false, carry: false },
    btnIds: {},
  };

  /* ---- keyboard ---- */
  const KEYMAP = {
    KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down",
    KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
    Space: "jump", KeyF: "shoot", KeyC: "carry",
    KeyG: "fly", KeyV: "brake",
    ShiftLeft: "boost", ShiftRight: "boost",
  };
  const onKey = (e, down) => {
    const k = KEYMAP[e.code];
    if (k) {
      if (down && (k === "jump" || k === "shoot" || k === "carry")) {
        if (!state[k]) state[k + "Edge"] = true;  // edge latch, main consumes
      }
      state[k] = down;
      if (["jump", "shoot", "carry", "up", "down", "left", "right"].includes(k)) e.preventDefault();
    }
    /* meta keys */
    if (down) {
      if (e.code === "KeyB") state.camToggle = true;      // B = toggle camera
      if (e.code === "KeyP" || e.code === "Escape") state.pauseToggle = true;
      if (e.code === "KeyM") state.muteToggle = true;
      if (e.code === "Enter") state.enter = true;
      if (e.code === "KeyR") state.restart = true;
    }
  };
  const kd = (e) => onKey(e, true);
  const ku = (e) => onKey(e, false);

  /* ---- mouse (desktop: LMB = boost, RMB = jump alt) ---- */
  let canvasEl = null;
  const onMD = (e) => {
    if (!canvasEl) return;
    if (e.button === 0) { state.boost = true; state.pointerDown = true; }
    if (e.button === 2) onKey({ code: "Space", preventDefault() {} }, true);
  };
  const onMU = (e) => {
    if (e.button === 0) { state.boost = false; state.pointerDown = false; }
    if (e.button === 2) onKey({ code: "Space", preventDefault() {} }, false);
  };
  const onCtx = (e) => e.preventDefault();

  /* ---- touch (registered on overlay elements by 12_ui via RTL.input.bindTouch) ---- */
  function bindTouch(el) {
    const r = () => el.getBoundingClientRect();
    /* virtual stick */
    const sDown = (e) => {
      const b = r();
      touch.active = true;
      const t = e.changedTouches[0];
      touch.stick.id = t.identifier;
      touch.stick.cx = t.clientX; touch.stick.cy = t.clientY;
      touch.stick.dx = 0; touch.stick.dy = 0;
      e.preventDefault();
    };
    const sMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === touch.stick.id) {
          const dx = t.clientX - touch.stick.cx, dy = t.clientY - touch.stick.cy;
          const len = Math.hypot(dx, dy) || 1;
          const cl = Math.min(len, 52);
          touch.stick.dx = (dx / len) * (cl / 52);
          touch.stick.dy = (dy / len) * (cl / 52);
        }
      }
      e.preventDefault();
    };
    const sUp = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === touch.stick.id) {
          touch.stick.id = null; touch.stick.dx = 0; touch.stick.dy = 0;
        }
      }
      e.preventDefault();
    };
    el.addEventListener("touchstart", sDown, { passive: false });
    el.addEventListener("touchmove", sMove, { passive: false });
    el.addEventListener("touchend", sUp, { passive: false });
    el.addEventListener("touchcancel", sUp, { passive: false });

    /* action buttons live in DOM with data-btn="boost|jump|shoot|carry" */
    el.querySelectorAll("[data-btn]").forEach((btn) => {
      const key = btn.dataset.btn;
      const on = (e) => {
        e.preventDefault();
        touch.btn[key] = true;
        if (key === "jump" || key === "shoot" || key === "carry") state[key + "Edge"] = true;
      };
      const off = (e) => { e.preventDefault(); touch.btn[key] = false; };
      btn.addEventListener("touchstart", on, { passive: false });
      btn.addEventListener("touchend", off, { passive: false });
      btn.addEventListener("touchcancel", off, { passive: false });
      /* mouse for desktop testing of the overlay */
      btn.addEventListener("mousedown", on);
      btn.addEventListener("mouseup", off);
    });
    return el;
  }

  /** per-frame snapshot — merges kb/mouse/touch into the sim input shape */
  function sample(out) {
    const k = state;
    let throttle = 0, steer = 0;
    if (k.up) throttle += 1;
    if (k.down) throttle -= 1;
    if (k.left) steer -= 1;
    if (k.right) steer += 1;
    /* touch stick overrides (stick up = throttle, left/right = steer) */
    if (touch.stick.id !== null) {
      throttle = -touch.stick.dy;
      steer = touch.stick.dx;
    }
    out.throttle = m.clamp(throttle, -1, 1);
    out.steer = m.clamp(steer, -1, 1);
    out.boost = !!(k.boost || touch.btn.boost);
    out.jump = !!(k.jump || touch.btn.jump);
    out.shoot = !!(k.shoot || touch.btn.shoot);
    out.carry = !!(k.carry || touch.btn.carry);
    out.brake = !!k.brake;
    out.fly = !!k.fly;
    /* consume edges */
    out.jumpEdge = !!k.jumpEdge; k.jumpEdge = false;
    out.shootEdge = !!k.shootEdge; k.shootEdge = false;
    out.carryEdge = !!k.carryEdge; k.carryEdge = false;
    /* UI intents */
    out.camToggle = k.camToggle; k.camToggle = false;
    out.pauseToggle = k.pauseToggle; k.pauseToggle = false;
    out.muteToggle = k.muteToggle; k.muteToggle = false;
    out.enter = k.enter; k.enter = false;
    out.restart = k.restart; k.restart = false;
    return out;
  }

  function attach(el) {
    canvasEl = el;
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    el.addEventListener("mousedown", onMD);
    window.addEventListener("mouseup", onMU);
    el.addEventListener("contextmenu", onCtx);
  }
  function dispose() {
    window.removeEventListener("keydown", kd);
    window.removeEventListener("keyup", ku);
    if (canvasEl) {
      canvasEl.removeEventListener("mousedown", onMD);
      canvasEl.removeEventListener("mouseup", onMU);
      canvasEl.removeEventListener("contextmenu", onCtx);
    }
  }

  return { state, touch, sample, attach, dispose, bindTouch };
})(RTL.C, RTL.mathx);

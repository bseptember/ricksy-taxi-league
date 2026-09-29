/* ==========================================================================
   RICKSY TAXI LEAGUE — 03_sprites.js
   Procedural pixel-art sprites: string maps baked to offscreen canvases.
   All original art. bake() is idempotent; _makeCanvas is override-able for
   headless tests.
   ========================================================================== */
"use strict";

RTL.spr = (function (C, m) {
  const cache = {};
  let baked = false;

  /* ---- canvas factory (override in tests) ---- */
  function _makeCanvas(w, h) {
    const el = document.createElement("canvas");
    el.width = w; el.height = h;
    return el;
  }

  /* ---- palette ---- */
  const PAL = {
    k: "#14161c",        // tyre / outline
    d: "#0c0e12",        // dark outline
    r: "#f4f7fb",        // rim
    g: "#37a6ff", G: "#1668b8", s: "#d9f2ff",   // blue taxi: body/dark/roof
    o: "#ff8c1a", O: "#d16a15", t: "#ffe0a8",   // orange taxi
    y: "#ffd23f",        // yellow stripe
    w: "#ffffff", W: "#d8dbe2",                   // ball white / shade
    p: "#181a20",        // ball patch (pop black)
    n: "#ffffff",        // net / lines
    v: "#3ee66b",        // glow green
    c: "#ff5d8f",        // confetti pink
    b: "#3fa7ff",        // confetti cyan
    f: "#ff9e2c",        // flame orange
    e: "#8a5a2a",        // tree trunk brown
    l: "#2fa347", L: "#3ecf5a", h: "#5adf6e",   // tree greens (bright)
    x: "#6a7482",        // concrete
    z: "#aebfd4",        // steel
    q: "#1d4a70",        // dark water blue
    m: "#ff5d8f",        // pop magenta accent
    u: "#b06cff",        // pop purple accent
  };

  /* ---- string map sprite definitions ----
     Each: {p: palette rows, fw, fh (frame size), frames: n}
     ' ' = transparent */
  const MAPS = {};

  /* ---- taxi: 30x16 per frame — bold pop-art minibus, thick outline ---- */
  function taxiMap(body, dark, skyCol) {
    return [
      "          ddddddddddddd       ",
      "        dd" + skyCol + skyCol + skyCol + skyCol + skyCol + skyCol + skyCol + skyCol + skyCol + skyCol + "dd      ",
      "       d" + skyCol + skyCol + "d" + skyCol + skyCol + "dd" + skyCol + skyCol + "dd" + skyCol + skyCol + "dd" + skyCol + skyCol + "d     ",
      "       d" + skyCol + skyCol + "d" + skyCol + skyCol + "dd" + skyCol + skyCol + "dd" + skyCol + skyCol + "dd" + skyCol + skyCol + "d     ",
      "    dddd" + skyCol + skyCol + "d" + skyCol + skyCol + "dd" + skyCol + skyCol + "dd" + skyCol + skyCol + "dd" + skyCol + skyCol + "dddd   ",
      "   d" + body + body + body + body + "dd" + skyCol + skyCol + "dddddddddddd" + skyCol + skyCol + "dd" + body + "d  ",
      "  d" + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + "d ",
      "  d" + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + "d ",
      "  d" + body + "yyyyy" + body + "d" + "yyyyy" + "d" + body + body + "yyyyy" + body + "d" + "yyyyy" + body + body + "d ",
      "  d" + body + "yyyyy" + body + "d" + "yyyyy" + "d" + body + body + "yyyyy" + body + "d" + "yyyyy" + body + body + "d ",
      "  d" + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + "d ",
      "  d" + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + "d ",
      "   dd kk dd    dd kk dd   ",
      "     dkkd        dkkd     ",
      "     drrd        drrd     ",
      "      dd          dd      ",
    ];
  }
  MAPS.taxi_blue = { rows: taxiMap("g", "G", "s"), fw: 30, fh: 16, frames: 1 };
  MAPS.taxi_orange = { rows: taxiMap("o", "O", "t"), fw: 30, fh: 16, frames: 1 };

  /* ---- ball: 11x11, 4 rotation frames — classic B&W soccer ball, bold ---- */
  MAPS.ball = {
    frames: 4, fw: 11, fh: 11,
    rowsFn: (f) => {
      /* pentagon patches rotate across frames for visible spin */
      const pats = [
        ["    ppp    ", "   ppppp   ", "   ppppp   ", "    ppp    "],
        ["  pp       ", " pppp  pp  ", "  ppppppp  ", "      ppp  "],
        ["       pp  ", " pp  pppp  ", "  ppppppp  ", "  ppp      "],
        [" pp        ", "pppp  pp   ", " pppppppp  ", "    ppp    "],
      ];
      const q = pats[f % 4];
      return [
        "   wwwww   ",
        "  ww" + q[0] + "ww  ",
        " ww" + q[1].slice(0, 7) + "ww ",
        "ww" + q[2].slice(0, 9) + "ww",
        "w" + q[3].slice(0, 5) + "ww" + q[3].slice(0, 4) + "w",
        "ww" + q[1].slice(2, 9) + "ww",
        " ww" + q[2].slice(1, 8) + "ww ",
        "  ww" + q[0].slice(1, 8) + "w  ",
        "   wwwww   ",
      ].map(r => (r + "           ").slice(0, 11));
    },
  };

  /* ---- goal: 46x22 (posts + net crosshatch) ---- */
  MAPS.goal = {
    frames: 1, fw: 46, fh: 22,
    rows: [
      "dnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnd",
      "n                                          n",
      "n n n n n n n n n n n n n n n n n n n n n n",
      "n                                          n",
      "n  n  n  n  n  n  n  n  n  n  n  n  n  n   n",
      "n                                          n",
      "d                                          d",
      "d                                          d",
      "d                                          d",
      "d                                          d",
      "d                                          d",
      "d                                          d",
      "d                                          d",
      "d                                          d",
      "dd                                        dd",
    ],
  };

  /* ---- crowd row strip: 32x8, 2 frames ---- */
  MAPS.crowd_row = {
    frames: 2, fw: 32, fh: 8,
    rowsFn: (f) => {
      const cols = C.COLORS.crowd;
      const rows = [];
      const codes = "ABCDEFG";
      /* heads row uses index chars mapped to crowd colours */
      const headRow = [];
      for (let i = 0; i < 32; i++) {
        const h = m.hash(i * 7 + f * 13);
        headRow.push(codes[Math.floor(h * codes.length)]);
      }
      const headStr = headRow.join("");
      rows.push(" " + headStr.slice(0, 31));
      rows.push(headStr);
      rows.push("k".repeat(32));
      rows.push(" ");
      rows.push(" ");
      rows.push(" ");
      rows.push(" ");
      rows.push(" ");
      return rows;
    },
  };

  /* ---- floodlight tower: 18x36 ---- */
  MAPS.floodlight = {
    frames: 1, fw: 18, fh: 36,
    rows: [
      "  kkkkkkkkkkkkkk  ",
      " kwwwwwwwwwwwwwwk ",
      " kwzwzwzwzwzwzwzk ",
      " kwwwwwwwwwwwwwwk ",
      "  kkkkkkkkkkkkkk  ",
      "       kkkk       ",
      "       kzzk       ",
      "       kzzk       ",
      "       kzzk       ",
      "       kzzk       ",
      "       kzzk       ",
      "       kzzk       ",
      "       kzzk       ",
      "       kzzk       ",
      "       kzzk       ",
      "       kzzk       ",
      "       kzzk       ",
      "       kzzk       ",
      "       kzzk       ",
      "       kzzk       ",
      "       kzzk       ",
      "       kzzk       ",
      "      kkzzkk      ",
      "     kkzzzzkk     ",
    ],
  };

  /* ---- tree: 14x18 ---- */
  MAPS.tree = {
    frames: 2, fw: 14, fh: 18,
    rowsFn: (f) => [
      "    hhhhhh    ",
      "  hhhLhhhhhh  ",
      " hhLhhhhhLhhh ",
      "hhhhhhLhhhhhhh".slice(0, 14),
      "hhLhhhhhhhLhhh".slice(0, 14),
      " hhhhhLhhhhhh ",
      "  hhhhhhhh" + (f ? "h " : "h ") + " ",
      "   hhhhhhhh   ",
      "     eee      ",
      "     eee      ",
      "     eee      ",
      "    eeee      ",
    ],
  };

  /* ---- cone: 6x6, bench: 16x8 ---- */
  MAPS.cone = {
    frames: 1, fw: 6, fh: 6,
    rows: [
      "  ff  ",
      "  ff  ",
      " fyyf ",
      " fyyf ",
      "ffffff",
    ],
  };
  MAPS.bench = {
    frames: 1, fw: 16, fh: 8,
    rows: [
      "                ",
      " zzzzzzzzzzzzzz ",
      " zzzzzzzzzzzzzz ",
      "  k  k  k  k  k ",
      "  k  k  k  k  k ",
      "  k  k  k  k  k ",
    ],
  };

  /* ---- billboards: 40x12, text pixels ---- */
  function billboardMap(text, accent) {
    /* 40 wide, 12 tall: frame + big pixel text (hand-mocked per brand) */
    const rows = [];
    rows.push("k".repeat(40));
    rows.push("k" + " ".repeat(38) + "k");
    /* 3 text rows using 5px tall blocky letters approximated by accent blocks */
    const tw = Math.min(36, text.length * 2);
    const pad = Math.floor((38 - tw) / 2);
    rows.push("k" + " ".repeat(pad) + accent.repeat(tw) + " ".repeat(38 - pad - tw) + "k");
    rows.push("k" + " ".repeat(pad) + accent.repeat(tw) + " ".repeat(38 - pad - tw) + "k");
    rows.push("k" + " ".repeat(pad) + accent.repeat(Math.max(2, tw - 4)) + " ".repeat(38 - pad - tw + 4) + "k");
    rows.push("k" + " ".repeat(38) + "k");
    rows.push("k".repeat(40));
    while (rows.length < 12) rows.push("k".repeat(40));
    return rows;
  }
  MAPS.billboard_fontooweb = { frames: 1, fw: 40, fh: 12, rows: billboardMap("FONTOOWEB", "b") };
  MAPS.billboard_airtime = { frames: 1, fw: 40, fh: 12, rows: billboardMap("AIRTIME", "y") };
  MAPS.billboard_nandoz = { frames: 1, fw: 40, fh: 12, rows: billboardMap("NANDOZ", "c") };
  MAPS.billboard_spaza = { frames: 1, fw: 40, fh: 12, rows: billboardMap("SPAZA", "v") };
  MAPS.billboard_shisanyama = { frames: 1, fw: 40, fh: 12, rows: billboardMap("SHISANYAMA", "f") };
  MAPS.billboard_taxi = { frames: 1, fw: 40, fh: 12, rows: billboardMap("RICKSY", "o") };

  /* ---- boost pads: 8x4 ---- */
  MAPS.boostpad_small = {
    frames: 2, fw: 8, fh: 4,
    rowsFn: (f) => [
      "  yyyy  ",
      " y" + (f ? "w" : "y") + "yy" + (f ? "w" : "y") + "y ",
      " yyyyyy ",
      "  yyyy  ",
    ],
  };
  MAPS.boostpad_big = {
    frames: 2, fw: 12, fh: 6,
    rowsFn: (f) => [
      "   ffff   ",
      "  f" + (f ? "w" : "f") + "ff" + (f ? "w" : "f") + "f  ",
      " fffffff" + (f ? "f" : " ") + " ",
      " fffffff" + (f ? "f" : " ") + " ",
      "  ffffff  ",
      "   ffff   ",
    ],
  };

  /* ---- fx: spark/smoke/confetti 4x4, 2 frames ---- */
  MAPS.fx_spark = { frames: 2, fw: 4, fh: 4, rowsFn: (f) => [f ? " yy " : "ww", "ywwy", "ywwy", " ww "].map(r => (r + "    ").slice(0, 4)) };
  MAPS.fx_smoke = { frames: 2, fw: 4, fh: 4, rowsFn: (f) => [f ? "    " : " zz ", "z  z", "z  z", " zz "].map(r => (r + "    ").slice(0, 4)) };
  MAPS.fx_confetti = { frames: 2, fw: 3, fh: 3, rowsFn: (f) => [f ? "c b" : "c b", " b ", "c b"] };

  /* ================= bake ================= */
  function bake() {
    if (baked) return;
    baked = true;
    for (const name of Object.keys(MAPS)) {
      const def = MAPS[name];
      const frames = def.frames || 1;
      cache[name] = [];
      for (let f = 0; f < frames; f++) {
        const rows = def.rowsFn ? def.rowsFn(f) : def.rows;
        const cv = _makeCanvas(def.fw, def.fh);
        try {
          const g = cv.getContext("2d");
          if (g) {
            for (let y = 0; y < rows.length && y < def.fh; y++) {
              const row = rows[y];
              for (let x = 0; x < row.length && x < def.fw; x++) {
                const ch = row[x];
                if (ch === " ") continue;
                const col = ch === "A" || ch === "B" || ch === "C" || ch === "D" || ch === "E" || ch === "F" || ch === "G"
                  ? C.COLORS.crowd[{
                    A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6,
                  }[ch]]
                  : PAL[ch] || "#ff00ff";
                g.fillStyle = col;
                g.fillRect(x, y, 1, 1);
              }
            }
          }
        } catch (e) { /* headless fake ctx */ }
        cache[name].push(cv);
      }
    }
  }

  function draw(ctx, name, x, y, opts) {
    const o = opts || {};
    const frames = cache[name];
    if (!frames) return;
    const cv = frames[Math.floor(o.frame || 0) % frames.length];
    const sc = o.scale || 3;
    const w = cv.width * sc, h = cv.height * sc;
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    if (o.flip) {
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(-1, 1);
      ctx.drawImage(cv, 0, -h, w, h);
    } else {
      /* center-bottom anchor */
      ctx.drawImage(cv, Math.round(x - w / 2), Math.round(y - h), w, h);
    }
    ctx.restore();
  }

  function shadow(ctx, name, x, y, scale) {
    const s = (scale || 3);
    ctx.save();
    ctx.fillStyle = "rgba(10,14,20,.4)";
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y), 12 * s * 0.7, 5 * s * 0.7, 0, 0, m.TAU);
    ctx.fill();
    ctx.restore();
  }

  return { bake, draw, shadow, _makeCanvas, _cache: cache };
})(RTL.C, RTL.mathx);

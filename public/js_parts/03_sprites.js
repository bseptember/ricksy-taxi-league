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
    k: "#20242c",        // tyre / outline
    d: "#101318",        // dark outline
    r: "#cfd6e0",        // rim
    g: "#3aa0ff", G: "#1f6fc4", s: "#8fd0ff",   // blue taxi: body/dark/sky
    o: "#f07818", O: "#d16a15", t: "#ffd090",   // orange taxi
    y: "#ffd60a",        // yellow stripe
    w: "#f2ede2", W: "#c9c2b2",                  // ball
    p: "#c23a3a",        // ball patch
    n: "#e8f4e0",        // net / lines
    v: "#2ee66b",        // glow green
    c: "#ff3d8b",        // confetti pink
    b: "#00e5ff",        // confetti cyan
    f: "#ff9f1c",        // flame orange
    e: "#8a5a2a",        // tree trunk brown
    l: "#2a8238", L: "#2f8f3f", h: "#59a84a",   // tree greens
    x: "#5a6472",        // concrete
    z: "#8fa8c8",        // steel grey
    q: "#1d4a70",        // dark water blue
  };

  /* ---- string map sprite definitions ----
     Each: {p: palette rows, fw, fh (frame size), frames: n}
     ' ' = transparent */
  const MAPS = {};

  /* ---- taxi: 26x14 per frame, 4 frames (0-1 drive, 2 turn, 3 boost flame) ---- */
  function taxiMap(body, dark, skyCol) {
    return [
      "          dddddddd        ",
      "         d" + skyCol + skyCol + skyCol + skyCol + skyCol + skyCol + "d       ",
      "         d" + skyCol + "dd" + skyCol + "dd" + skyCol + "d       ",
      "      dddd" + skyCol + "dd" + skyCol + "dd" + skyCol + "dddd    ",
      "     d" + body + body + body + "dddddddddd" + body + body + "d   ",
      "    d" + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + "d  ",
      "   d" + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + "d  ",
      "   d" + body + "yyyyyyy" + body + body + "yyyyy" + body + "d  ",
      "   d" + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + body + "d  ",
      "   d" + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + dark + "d  ",
      "    dd kk dd   dd kk dd  ",
      "      dkkd      dkkd     ",
      "      drrd      drrd     ",
      "       dd        dd      ",
    ];
  }
  MAPS.taxi_blue = { rows: taxiMap("g", "G", "s"), fw: 26, fh: 14, frames: 1 };
  MAPS.taxi_orange = { rows: taxiMap("o", "O", "t"), fw: 26, fh: 14, frames: 1 };

  /* ---- ball: 7x7, 3 rotation frames ---- */
  MAPS.ball = {
    frames: 3, fw: 7, fh: 7,
    rowsFn: (f) => [
      "  www  ",
      " w" + (f === 1 ? "p" : "w") + "wwp w".slice(0, 4) + " w",
      "wwpwww" + (f === 2 ? "p" : "w"),
      "wwwwwpw".slice(0, 7),
      "wwwpwww".slice(0, 7),
      " w" + (f === 2 ? "p" : "w") + "www ",
      "  www  ",
    ],
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

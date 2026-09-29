/* ==========================================================================
   RICKSY TAXI LEAGUE — 03b_art.js
   AI-generated image assets (public/art/) with graceful fallback to the
   procedural string-map sprites in 03_sprites.js. If an image fails to
   load, RTL.spr.draw keeps working exactly as before (contract: loader must
   never break gameplay).
   ========================================================================== */
"use strict";

RTL.art = (function () {
  const imgs = {};          // name -> HTMLImageElement (only if loaded OK)
  const wanted = {
    taxi_blue: "art/taxi_blue.png",
    taxi_orange: "art/taxi_orange.png",
    ball: "art/ball.png",
  };
  let loaded = 0, failed = 0, total = 0;

  function load(onDone) {
    const names = Object.keys(wanted);
    total = names.length;
    if (!total) { if (onDone) onDone(); return; }
    let done = 0;
    names.forEach((name) => {
      const img = new Image();
      img.onload = () => { imgs[name] = img; loaded++; done++; if (done === total && onDone) onDone(); };
      img.onerror = () => { failed++; done++; if (done === total && onDone) onDone(); };
      img.src = wanted[name];
    });
  }

  function has(name) { return !!imgs[name]; }
  function get(name) { return imgs[name] || null; }
  function stats() { return { loaded, failed, total }; }

  return { load, has, get, stats, wanted, _imgs: imgs };
})();

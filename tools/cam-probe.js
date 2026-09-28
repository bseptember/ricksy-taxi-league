/* Camera feel probe — injected into the page via console:
   fetch('/tools/cam-probe.js').then(r=>r.text()).then(eval)
   Dev-server only; never loaded by the game itself. */
(() => {
  window.K = (code, down) => {
    const ev = new KeyboardEvent(down ? 'keydown' : 'keyup', {
      code, key: code.replace('Key', '').toLowerCase(),
      bubbles: true, cancelable: true
    });
    window.dispatchEvent(ev);
  };
  window.KDOWN = {};
  window.hold = (name, code) => {
    if (window.KDOWN[name]) clearInterval(window.KDOWN[name].iv);
    K(code, true);
    window.KDOWN[name] = { iv: setInterval(() => K(code, true), 40), code };
  };
  window.release = (name) => {
    if (!window.KDOWN[name]) return;
    clearInterval(window.KDOWN[name].iv);
    K(window.KDOWN[name].code, false);
    delete window.KDOWN[name];
  };
  window.releaseAll = () => Object.keys(window.KDOWN).forEach(release);

  const wrap = (d) => { while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

  window.CAMPROBE = {
    car: { fx: [], fy: [] }, ball: { fx: [], fy: [] }, rot: [], zoom: [],
    maxRotDelta: 0, prevRot: null, jumps: [],
    step() {
      const QA = RTL.main.QA;
      const cam = QA.cam, vw = cam.vw, vh = cam.vh;
      const cp = RTL.mathx.project(QA.cars[0].x, QA.cars[0].y, QA.cars[0].z, cam);
      const bp = RTL.mathx.project(QA.ball.x, QA.ball.y, QA.ball.z, cam);
      this.car.fx.push(cp.x / vw); this.car.fy.push(cp.y / vh);
      this.ball.fx.push(bp.x / vw); this.ball.fy.push(bp.y / vh);
      this.rot.push(cam.rot); this.zoom.push(cam.zoom);
      if (this.prevRot !== null) {
        const d = Math.abs(wrap(cam.rot - this.prevRot));
        if (d > this.maxRotDelta) this.maxRotDelta = d;
      }
      this.prevRot = cam.rot;
    },
    report() {
      const q = (a) => ({ min: +Math.min(...a).toFixed(3), max: +Math.max(...a).toFixed(3) });
      return {
        n: this.car.fx.length,
        car_fx: q(this.car.fx), car_fy: q(this.car.fy),
        ball_fx: q(this.ball.fx), ball_fy: q(this.ball.fy),
        rotRange: [+Math.min(...this.rot).toFixed(2), +Math.max(...this.rot).toFixed(2)],
        maxRotDeltaPerSample: +this.maxRotDelta.toFixed(4),
        zoom: q(this.zoom),
        camMode: RTL.main.QA.cam.mode,
        offScreen: {
          car: this.car.fx.concat(this.car.fy).filter(v => v < -0.02 || v > 1.02).length,
          ball: this.ball.fx.concat(this.ball.fy).filter(v => v < -0.05 || v > 1.05).length
        }
      };
    },
    reset() {
      this.car.fx = []; this.car.fy = []; this.ball.fx = []; this.ball.fy = [];
      this.rot = []; this.zoom = []; this.maxRotDelta = 0; this.prevRot = null; this.jumps = [];
    }
  };
  setInterval(() => {
    try {
      const cam = RTL.main.QA && RTL.main.QA.cam;
      if (cam && cam.ready && window.CAMPROBE.on) CAMPROBE.step();
    } catch (e) { /* between matches */ }
  }, 100);
  CAMPROBE.on = false;
  return 'probe installed';
})();

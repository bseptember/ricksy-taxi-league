/* ==========================================================================
   RICKSY TAXI LEAGUE — 08_events.js
   Pure match-event processors: goal banners, kickoff poses, hype strings,
   countdown text, full-time summary. UI-independent.
   ========================================================================== */
"use strict";

RTL.events = (function (C, m, W) {
  const BLUE_NAME = "AMANDLA FC";
  const ORANGE_NAME = "IBHOKISI FC";

  function goal(match, team, speed) {
    return {
      banner: "GOAL!",
      sub: team === "blue" ? BLUE_NAME + " SCORES!" : ORANGE_NAME + " SCORES!",
      freezeS: C.GOAL_FREEZE_SECONDS,
      chantLevel: 1,
    };
  }

  /** kickoff formation: varies by seed. Blue attacks +Y (its half is low Y). */
  function kickoffPose(match) {
    const r = m.rngFrom(match.seed >>> 0);
    const wide = r() < 0.5;
    const off = wide ? 7 : 3.5; // wide/tight formation offsets
    const blueY = 38, orangeY = C.PITCH_H - 38;
    return {
      cars: [
        { id: "P1", x: 34 - off, y: blueY, heading: Math.atan2(52.5 - blueY, 34 - (34 - off)) },
        { id: "AI", x: 34 + off, y: orangeY, heading: Math.atan2(52.5 - orangeY, 34 - (34 + off)) },
      ],
      ball: { x: 34, y: 52.5 },
    };
  }

  function describe(speed) {
    if (speed >= 30) return "TBAGRA!";
    if (speed >= 25) return "BANGER!";
    if (speed >= 20) return "SHOOO!";
    if (speed >= 15) return "NICE ONE!";
    return "";
  }

  function save(match, defender) {
    return { banner: "WHAT A SAVE!" };
  }

  function count(n) {
    if (n > 1) return String(n);
    if (n === 1) return "1";
    return "GO!";
  }

  /* ---------- full-time summary ----------
     Read-only. The sim owns score + stats (06_sim.js), so this is pure
     formatting of a finished match. `opt` = main's session state, used for
     the career/form block; omitted in headless tests. */
  function fullTime(match, opt) {
    const s = match.stats || {};
    const b = match.score.blue, o = match.score.orange;
    const won = b > o ? "win" : o > b ? "loss" : "draw";
    const winner = b > o ? BLUE_NAME + " WINS THE DERBY!" : o > b ? ORANGE_NAME + " WINS THE DERBY!" : "THE DERBY ENDS ALL SQUARE!";
    const title = match.overtime ? "GOLDEN GOAL" : "FULL TIME";
    /* big verdict line, driven by the actual result */
    const verdict = won === "win" ? "YOU WIN" : won === "loss" ? "YOU LOSE" : "DRAW";
    /* possession share: who touched the ball most. Cheap, honest proxy, and
       it gives the player a reason to look at the stats rather than skip. */
    const tB = s.touchesBlue || 0, tO = s.touchesOrange || 0;
    const poss = tB + tO > 0 ? Math.round((tB / (tB + tO)) * 100) : 50;
    const lines = [
      winner,
      "GOALS " + b + " - " + o,
      "SHOTS " + (s.shotsBlue || 0) + " - " + (s.shotsOrange || 0),
      "ON TARGET " + poss + "%",
      "TOP CARRY " + (s.carryMaxBlue || 0).toFixed(1) + "s - " + (s.carryMaxOrange || 0).toFixed(1) + "s",
      "TOP SPEED " + Math.round((s.topSpeedBlue || 0) * 3.6) + " - " + Math.round((s.topSpeedOrange || 0) * 3.6) + " KM/H",
      "SAVES " + (s.savesBlue || 0) + " - " + (s.savesOrange || 0),
      "DEMOS " + (s.demosBlue || 0) + " - " + (s.demosOrange || 0),
    ];
    const ft = { title, verdict, won, lines, score: b + "-" + o, possession: poss };

    /* career block — only when a session state was handed in (live game) */
    if (opt && opt.stats) {
      const st = opt.stats;
      const played = st.played || 0;
      const w = st.wins || 0, l = st.losses || 0, d = st.draws || 0;
      ft.career = {
        played, wins: w, losses: l, draws: d,
        winRate: played ? Math.round((w / played) * 100) : 0,
        goals: st.goals || 0, conceded: st.conceded || 0,
        form: st.form || "",
      };
    }
    return ft;
  }

  return { goal, kickoffPose, describe, save, count, fullTime, BLUE_NAME, ORANGE_NAME };
})(RTL.C, RTL.mathx, RTL.world);

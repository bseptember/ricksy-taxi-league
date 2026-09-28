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

  /** full-time summary. Reads match.stats with 0 fallbacks. */
  function fullTime(match) {
    const s = match.stats || {};
    const b = match.score.blue, o = match.score.orange;
    const winner = b > o ? BLUE_NAME + " WINS THE DERBY!" : o > b ? ORANGE_NAME + " WINS THE DERBY!" : "THE DERBY ENDS ALL SQUARE!";
    const title = match.overtime ? "GOLDEN GOAL!" : "FULL TIME";
    const lines = [
      winner,
      "GOALS " + b + " - " + o,
      "SHOTS " + (s.shotsBlue || 0) + " - " + (s.shotsOrange || 0),
      "TOP CARRY " + (s.carryMaxBlue || 0).toFixed(1) + "s - " + (s.carryMaxOrange || 0).toFixed(1) + "s",
      "DEMOS " + (s.demosBlue || 0) + " - " + (s.demosOrange || 0),
      "SAVES " + (s.savesBlue || 0) + " - " + (s.savesOrange || 0),
    ];
    return { title, lines };
  }

  return { goal, kickoffPose, describe, save, count, fullTime, BLUE_NAME, ORANGE_NAME };
})(RTL.C, RTL.mathx, RTL.world);

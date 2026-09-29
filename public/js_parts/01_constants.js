/* ==========================================================================
   RICKSY TAXI LEAGUE — 01_constants.js
   Global namespace + every tunable in one place. Loaded first.
   ========================================================================== */
"use strict";

/** Single global namespace. Every other file attaches to this. */
const RTL = {
  VERSION: "1.0.0",
  NAME: "Ricksy Taxi League",
  C: {},
};

(function initConstants(RTL) {
  const C = RTL.C;

  /* ---- Match ---- */
  C.MATCH_SECONDS = 300;          // 5:00 like the OG
  C.COUNTDOWN_SECONDS = 3;
  C.GOAL_FREEZE_SECONDS = 1.8;    // banner + chant time before kickoff reset
  C.OVERTIME_SECONDS = 60;        // golden-goal max extra time
  C.START_BOOST = 45;             // kickoffs have something to spend
  C.MAX_BOOST = 100;
  C.BOOST_USE_PER_SEC = 24;       // 4.2s of boost, not a one-shot
  C.BOOST_PADS_REGEN = 12;        // passive regen per second (small pads feel)

  /* ---- Physics ---- */
  C.FIXED_DT = 1 / 120;           // simulation step
  C.GRAVITY = 22;                 // m/s^2 (arcadey, stronger than earth for snappy jumps)
  C.BALL_RADIUS = 0.35;
  /* FEEL FIX (measured): the old pair (0.30 drag x 0.62 roll applied at 3x)
     compounded to 24% speed retained per second — a 30 m/s shot died at 7
     m/s after one second and travelled 19.7m of a 105m pitch. Shots felt
     dead and matches were goalless. New values: 89% air / 66% ground. */
  C.BALL_DRAG = 0.12;             // fraction of velocity lost per second
  C.BALL_GROUND_ROLL_FRICTION = 0.90; // per-second retained when rolling
  C.BALL_BOUNCE = 0.70;           // vertical restitution
  C.BALL_WALL_BOUNCE = 0.80;      // horizontal restitution vs boards
  C.BALL_MAX_SPEED = 46;
  C.BALL_AIR_CONTROL = 0.24;      // car->ball push efficiency mid-air

  C.CAR_LENGTH = 4.2;
  C.CAR_WIDTH = 1.9;
  C.CAR_HEIGHT = 1.5;
  C.CAR_ACCEL = 26;
  C.CAR_BRAKE_DECEL = 40;
  C.CAR_MAX_SPEED = 24;           // m/s ground
  C.CAR_BOOST_ACCEL = 20;         // extra accel while boosting
  C.CAR_BOOST_MAX_SPEED = 34;
  C.CAR_TURN_RATE = 2.6;          // rad/s at low speed
  C.CAR_TURN_RATE_HIGH = 1.35;    // rad/s at top speed
  C.CAR_LATERAL_GRIP = 6.0;       // sideways velocity kill per second
  C.CAR_GROUND_FRICTION = 1.6;    // coast decel
  C.CAR_JUMP_VZ = 8.2;            // m/s up
  C.CAR_DOUBLE_JUMP_VZ = 6.4;
  C.CAR_FLIP_IMPULSE = 13;        // horizontal impulse on flip
  C.CAR_FLIP_SECONDS = 0.65;
  C.CAR_AIR_TURN = 1.9;           // yaw authority airborne
  C.CAR_DEMO_SPEED = 26;          // relative speed needed to demo
  C.CAR_DEMO_SECONDS = 3.0;
  C.CAR_RESPAWN_SECONDS = 2.2;

  /* ---- Carry / shot (the OG's signature: tap F to line up, C to carry) ---- */
  C.CARRY_RANGE = 2.6;            // distance from nose at which carry can latch
  C.CARRY_HOLD_HEIGHT = 1.9;      // ball rest height on the roof
  C.CARRY_MAX_SECONDS = 6;        // ball pops free after this long
  C.CARRY_POP_SPEED = 9;
  C.CARRY_COOLDOWN = 1.2;         // after losing the ball
  C.SHOT_TAP_SECONDS = 0.75;      // window the aim assist runs after tapping shoot
  C.SHOT_SPEED_MIN = 18;
  C.SHOT_SPEED_MAX = 34;
  /* Tap-shot reach. The AI's shoot gate MUST equal this or its requests are
     silently discarded by the sim (they were: AI fired at 3.7-3.9m, the sim
     only honoured < 3.2m, so 3 requests produced 0 shots). */
  C.TAP_SHOT_RANGE = 3.2;
  C.FLY_BOOST_AIR_ACCEL = 14;     // G key / fly assist toward ball

  /* ---- Pitch (FIFA-size, metres) ---- */
  C.PITCH_W = 68;                 // X: 0..68 (touchline to touchline)
  C.PITCH_H = 105;                // Y: 0..105 (goal line to goal line)
  C.GOAL_WIDTH = 6.68;
  C.GOAL_HEIGHT = 2.44;           // crossbar
  C.GOAL_DEPTH = 2.2;             // how deep the net box is
  C.BOARD_HEIGHT = 1.1;           // advertising boards around pitch
  C.STANDS_DEPTH = 26;            // metres of stands drawn beyond boards

  /* ---- AI ---- */
  C.AI_DIFFICULTIES = ["RELAXED", "CASUAL", "SHARP", "NEURAL"]; // displayed
  C.AI_NAMES = ["BOET", "TSHAMI", "BRA H", "UMNUZ"];

  /* ---- Cameras ---- */
  C.CAMS = ["CAR", "BALL"];       // TUNNEL retired from the cycle (unplayable
                                  // for the driver view; kept as preset only)
  /* RL-style chase cams: sq = vertical squash (low = pitch of the camera),
     anchorY = where the look point sits on screen. */
  C.CAR_CAM = { lookAhead: 5, zoom: 26, refW: 1264, sq: 0.82, anchorY: 0.62 };
  C.BALL_CAM = { zoom: 24, refW: 1264, sq: 0.8, anchorY: 0.78 };
  C.TUNNEL_CAM = { zoom: 9, refW: 1264, sq: 0.5, rot: -Math.PI / 4 };
  C.CAM_SWITCH_COOLDOWN = 0.25;   // avoid double-toggles
  C.PAN_DAMP = 2.3;               // pan base damping (lazy-follow, matches
                                  // reference game's soft trailing pan);
                                  // error-adaptive catch-up lives in 11_camera.js

  /* ---- Presentation ---- */
  C.PIXEL = 3;                    // base pixel scale (retro chunk)
  C.FX_POOL = 220;                // pooled particles
  C.TRAIL_LENGTH = 22;            // ball trail points

  /* ---- Palette (POP ART Mzansi: saturated sunset + hot pitch) ---- */
  C.COLORS = {
    grassA: "#3ecf5a", grassB: "#2fa347", grassLine: "#ffffff",
    sky: "#2b1055", skyLow: "#ff7b00",
    skyMid: "#e0447a",
    blue: "#37b6ff", blueDark: "#1668b8", orange: "#ff8c1a", orangeDark: "#d16a15",
    taxiBlueBody: "#37a6ff", taxiBlueRoof: "#d9f2ff",
    taxiOrangeBody: "#ff8c1a", taxiOrangeRoof: "#ffe0a8",
    tyre: "#14161c", rim: "#f4f7fb",
    ball: "#ffffff", ballPatch: "#181a20",
    board: "#14161c", boardText: "#ffd60a",
    crowd: ["#ffd23f", "#ff5d8f", "#3fa7ff", "#8ce04a", "#ffffff", "#ff8c1a", "#b06cff"],
    night: "#1a0f3a",
    sun: "#ffd23f", sunHalo: "#ff9e2c",
    skyline: "#241145", skylineLit: "#ffd23f",
    ui: "#161033", uiPanel: "#241a4d", uiInk: "#ffffff", uiDim: "#c8b8ff",
    accent: "#ffd23f", danger: "#ff4a6a", good: "#3ee66b",
    pitchShadow: "rgba(20,10,40,.25)",
  };

  /* ---- Billboards (original fake SA brands, cheeky not real) ---- */
  C.BILLBOARDS = [
    { name: "billboard_fontooweb", text: "FONTOOWEB" },
    { name: "billboard_airtime", text: "AIRTIME 4 LESS" },
    { name: "billboard_nandoz", text: "NANDOZ FLAME GRILL" },
    { name: "billboard_spaza", text: "SIPHO'S SPAZA" },
    { name: "billboard_shisanyama", text: "LAZARUS SHISANYAMA" },
    { name: "billboard_taxi", text: "RICKSY TAXI LEAGUE" },
  ];

  /* ---- Storage ---- */
  C.SAVE_KEY = "ricksy_taxi_league_v1";
})(RTL);

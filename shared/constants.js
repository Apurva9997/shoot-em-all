/** Shared simulation rates, body sizes, and economy numbers. */

export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;
export const SUB_DT = 1 / 60;
export const SUBSTEPS = 2;

export const PLAYER_RADIUS = 0.3;
export const STAND_HEIGHT = 1.72;
export const CROUCH_HEIGHT = 1.1;
export const EYE_STAND = 1.6;
export const EYE_CROUCH = 0.98;
export const STEP_HEIGHT = 0.46;

export const GRAVITY = 20.5;
export const JUMP_VEL = 6.55;
export const CROUCH_JUMP_VEL = 4.4;
export const MAX_SPEED = 6.05;
export const CROUCH_SPEED = 2.25;
export const GROUND_ACCEL = 48;
export const AIR_ACCEL = 7.5;
export const FRICTION = 5.5;
export const STOP_SPEED = 1.4;

export const TEAMS = {
  T: "T",
  CT: "CT",
};

export const PHASE = {
  FREEZETIME: "FREEZETIME",
  LIVE: "LIVE",
  BOMB_PLANTED: "BOMB_PLANTED",
  ROUND_OVER: "ROUND_OVER",
};

export const PHASE_DURATION = {
  FREEZETIME: 5,
  LIVE: 115,
  BOMB_PLANTED: 40,
  ROUND_OVER: 5,
};

export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1400;
export const MAX_MONEY = 16000;
export const AMMO_PRICE = 200;
export const MAX_PLAYERS = 10;

export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const DEFUSE_RADIUS = 2.05;
export const PICKUP_RADIUS = 1.65;
export const PLANT_MOVE_SPEED = 0.45;

export const HEAD_MULT = 4;
export const LEG_MULT = 0.75;

export const TEAM_HEX = {
  T: "#c45c26",
  CT: "#4c8dff",
};

export const PITCH_LIMIT = 1.45;

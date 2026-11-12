/** Classic five-gun arsenal plus C4. Prices and team locks match CS 1.6 buy rules. */

export const SLOT = {
  PRIMARY: 1,
  SECONDARY: 2,
  KNIFE: 3,
  C4: 5,
};

const GUN = {
  type: "hitscan",
  automatic: false,
  airSpread: 0.07,
  reload: 2.4,
  recoilRecovery: 7,
};

export const WEAPONS = {
  knife: {
    id: "knife",
    name: "Knife",
    slot: SLOT.KNIFE,
    type: "melee",
    price: 0,
    team: "BOTH",
    damage: 42,
    backstab: 180,
    range: 1.75,
    fireDelay: 0.42,
    spread: 0,
    moveSpread: 0,
    crouchSpread: 0,
    recoil: 0,
    recoilRecovery: 8,
    automatic: false,
    airSpread: 0,
  },
  glock: {
    ...GUN,
    id: "glock",
    name: "Glock-18",
    slot: SLOT.SECONDARY,
    price: 400,
    team: "T",
    damage: 24,
    fireDelay: 0.15,
    magazine: 20,
    reserve: 120,
    spread: 0.014,
    moveSpread: 0.05,
    crouchSpread: 0.007,
    recoil: 0.016,
    reload: 2.2,
    recoilRecovery: 8,
  },
  usp: {
    ...GUN,
    id: "usp",
    name: "USP-S",
    slot: SLOT.SECONDARY,
    price: 400,
    team: "CT",
    damage: 32,
    fireDelay: 0.17,
    magazine: 12,
    reserve: 100,
    spread: 0.009,
    moveSpread: 0.042,
    crouchSpread: 0.004,
    recoil: 0.02,
    reload: 2.5,
    recoilRecovery: 7,
  },
  ak47: {
    ...GUN,
    id: "ak47",
    name: "AK-47",
    slot: SLOT.PRIMARY,
    price: 2700,
    team: "T",
    damage: 36,
    fireDelay: 0.1,
    magazine: 30,
    reserve: 90,
    automatic: true,
    spread: 0.0075,
    moveSpread: 0.055,
    crouchSpread: 0.0035,
    recoil: 0.021,
    reload: 2.5,
    recoilRecovery: 6.5,
    airSpread: 0.09,
  },
  m4a1: {
    ...GUN,
    id: "m4a1",
    name: "M4A1",
    slot: SLOT.PRIMARY,
    price: 3100,
    team: "CT",
    damage: 28,
    fireDelay: 0.09,
    magazine: 30,
    reserve: 90,
    automatic: true,
    spread: 0.0055,
    moveSpread: 0.042,
    crouchSpread: 0.0028,
    recoil: 0.013,
    reload: 3.1,
    recoilRecovery: 8,
    airSpread: 0.075,
  },
  awp: {
    ...GUN,
    id: "awp",
    name: "AWP",
    slot: SLOT.PRIMARY,
    price: 4750,
    team: "BOTH",
    damage: 120,
    ignoreArmor: true,
    fireDelay: 1.45,
    magazine: 10,
    reserve: 30,
    spread: 0.012,
    moveSpread: 0.14,
    crouchSpread: 0.004,
    scopedSpread: 0.0004,
    recoil: 0.07,
    reload: 3.6,
    recoilRecovery: 2.2,
    airSpread: 0.16,
    scope: true,
  },
  c4: {
    id: "c4",
    name: "C4 Explosive",
    slot: SLOT.C4,
    type: "c4",
    price: 0,
    team: "T",
    damage: 0,
    fireDelay: 0,
    spread: 0,
    moveSpread: 0,
    crouchSpread: 0,
    recoil: 0,
    recoilRecovery: 1,
    automatic: false,
  },
};

export const KEVLAR_PRICE = 650;
export const HELMET_PRICE = 1000;
export const HELMET_UPGRADE = 350;

/** Numbered buy menu shared by the server validator and the client UI. */
export const BUY_MENU = [
  {
    key: "1",
    id: "pistols",
    name: "Pistols",
    items: [
      { key: "1", item: "glock", name: "Glock-18", price: 400, team: "T" },
      { key: "2", item: "usp", name: "USP-S", price: 400, team: "CT" },
    ],
  },
  {
    key: "2",
    id: "rifles",
    name: "Rifles",
    items: [
      { key: "1", item: "ak47", name: "AK-47", price: 2700, team: "T" },
      { key: "2", item: "m4a1", name: "M4A1", price: 3100, team: "CT" },
      { key: "3", item: "awp", name: "AWP", price: 4750, team: "BOTH" },
    ],
  },
  {
    key: "3",
    id: "gear",
    name: "Kevlar",
    items: [
      { key: "1", item: "kevlar", name: "Kevlar Vest", price: KEVLAR_PRICE, team: "BOTH" },
      { key: "2", item: "helmet", name: "Kevlar + Helmet", price: HELMET_PRICE, team: "BOTH" },
    ],
  },
  {
    key: "4",
    id: "ammo",
    name: "Ammo",
    items: [{ key: "1", item: "ammo", name: "Full Reserve", price: 200, team: "BOTH" }],
  },
];

export function weaponById(id) {
  return WEAPONS[id] || null;
}

export function defaultMagazine(id) {
  const w = WEAPONS[id];
  if (!w || w.type === "melee" || w.type === "c4") return 0;
  return w.magazine;
}

export function defaultReserve(id) {
  const w = WEAPONS[id];
  if (!w || w.type === "melee" || w.type === "c4") return 0;
  return w.reserve;
}

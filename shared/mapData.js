/**
 * de_dust2-inspired layout, one AABB list for rendering and collision.
 * +X east, +Y up, +Z south. North is -Z (Three.js forward at yaw 0).
 *
 *   CT spawn (NW) --palace--> Bombsite A (NE)
 *        |                         ^
 *        |                      catwalk
 *      Bombsite B --doors-- MID DOUBLE DOORS -- long doors -- Long A
 *        |                    |
 *      tunnels ----------- T spawn (south) -- T side doors -- Long
 */

const WALL_H = 3.2;

function solid(x0, z0, x1, z1, mat = "sand", y0 = 0, y1 = WALL_H) {
  return {
    min: { x: Math.min(x0, x1), y: y0, z: Math.min(z0, z1) },
    max: { x: Math.max(x0, x1), y: y1, z: Math.max(z0, z1) },
    mat,
  };
}

const floor = {
  min: { x: -36, y: -0.8, z: -30 },
  max: { x: 36, y: 0, z: 34 },
  mat: "sand",
};

const outer = [
  solid(-36, -30, -32, 34, "sand"),
  solid(32, -30, 36, 34, "sand"),
  solid(-36, -30, 36, -26, "sand"),
  solid(-36, 30, 36, 34, "sand"),
];

const interior = [
  // T spawn / lower tunnel divider, door at z 20-24.
  solid(-9.2, 16, -8, 20, "sand"),
  solid(-9.2, 24, -8, 30, "sand"),
  // T spawn / long divider, door at z 20-24.
  solid(12, 16, 13.2, 20, "sand"),
  solid(12, 24, 13.2, 30, "sand"),
  // North lip of T spawn, wide exit into mid.
  solid(-8, 15.6, -4.2, 17, "stone"),
  solid(10.2, 15.6, 13.2, 17, "stone"),

  // West mid wall (tunnel / B side). Openings: upper tunnel z 4-8.6, B doors z -2.3-2.3.
  solid(-8, -8, -6.3, -2.3, "sand"),
  solid(-8, 2.3, -6.3, 4, "sand"),
  solid(-8, 8.6, -6.3, 16.2, "sand"),

  // East mid wall (long side). Opening from z -6.2 to 10.5 is the long lane.
  solid(18.2, 10.5, 19.6, 17, "sand"),

  // Mid double doors — frame across the north end of mid, gap in the middle.
  solid(-8, -5.35, -2.4, -3.55, "stone"),
  solid(-2.4, -5.35, -1.15, -3.55, "stone"),
  solid(5.15, -5.35, 6.5, -3.55, "stone"),
  solid(6.5, -5.35, 15, -3.55, "stone"),
  solid(-2.4, -5.35, 6.5, -3.55, "stone", 2.62, WALL_H),
  // Ajar door slabs. Gap between them is the walk-through.
  solid(-0.35, -4.85, 0.12, -4.05, "metal", 0, 2.55),
  solid(3.85, -4.85, 4.32, -4.05, "metal", 0, 2.55),
  // Door roof so the choke reads as a doorway from outside.
  solid(-2.6, -6.3, 6.7, -3.2, "stone", 3.15, 3.55),

  // Long-door frame, set east of the walk lane so z -4 is clear.
  solid(18.2, -6.4, 19.6, -5.7, "metal"),
  solid(18.2, 10.15, 19.6, 10.8, "metal"),

  // A site west wall. Palace gap z -21.2..-16.6, short gap z -13.2..-9.6,
  // long gap z -5.6..-1 so the long lane enters the site.
  solid(18.2, -26, 19.6, -21.2, "sand"),
  solid(18.2, -16.6, 19.6, -13.2, "sand"),
  solid(18.2, -9.6, 19.6, -6.4, "sand"),
  // A site south wall. Long entrance is the gap from x 16.5 to 27.5.
  solid(27.5, -7.3, 32, -5.7, "sand"),

  // CT spawn shell.
  solid(-32, -12.5, -18.2, -11.15, "stone"),
  solid(-12.2, -12.5, -3.6, -11.15, "stone"),
  solid(-4.3, -26, -3, -20.2, "stone"),
  solid(-4.3, -15.2, -3, -11.15, "stone"),

  // Connector between CT south exit and B.
  solid(-32, -9.35, -20.2, -8, "sand"),
  solid(-13.6, -9.35, -6.3, -8, "sand"),

  // B door frame thickening on the opening edges.
  solid(-8.15, -2.55, -6.2, -2.15, "metal"),
  solid(-8.15, 2.15, -6.2, 2.55, "metal"),

  // Indoor ceilings (headroom 3.0 > standing 1.72 and a jump).
  solid(-32, 0.2, -6.3, 30, "stone", 3.02, 3.4),
  solid(-32, -26, -3, -11.15, "stone", 3.02, 3.4),

  // Catwalk over short, plus 0.42m stairs up from the door yard.
  solid(5.2, -16.4, 13.4, -8.3, "stone", 0, 1.26),
  solid(6.1, -5.7, 10.2, -4.85, "stone", 0, 0.42),
  solid(6.1, -6.6, 10.2, -5.7, "stone", 0, 0.84),
  solid(6.1, -8.3, 10.2, -6.6, "stone", 0, 1.26),
  solid(5.2, -16.4, 5.55, -8.3, "sand", 1.26, 2.15),

  // Cover crates. All short enough to hide behind, none seal a lane.
  solid(20.2, -18.6, 22.5, -16.1, "crate", 0, 1.02),
  solid(24.4, -14.2, 26.7, -12.2, "crate", 0, 0.72),
  solid(-24.6, -4.2, -22, -1.5, "crate", 0, 1.02),
  solid(-19.4, -1.2, -16.8, 1.15, "crate", 0, 0.62),
  solid(1.4, 5.6, 3.7, 8.1, "crate", 0, 1.05),
  solid(22.2, 3.4, 24.6, 5.8, "crate", 0, 1.02),
  solid(-17.2, -22.4, -14.6, -19.6, "crate", 0, 0.9),
  solid(-1.2, 21.4, 1.3, 23.8, "crate", 0, 0.85),
  solid(7.2, 22.6, 8.8, 24.4, "crate", 0, 1.15),
  solid(-22, 18.5, -19.6, 20.6, "crate", 0, 0.7),
];

export const MAP = {
  name: "de_dust2",
  solids: [floor, ...outer, ...interior],
  spawns: {
    T: [
      { x: 0.2, y: 0.05, z: 25.2, yaw: 0 },
      { x: 4.4, y: 0.05, z: 26.4, yaw: 0 },
      { x: -3.8, y: 0.05, z: 26.2, yaw: 0 },
      { x: 6.2, y: 0.05, z: 22.4, yaw: 0 },
      { x: -2.2, y: 0.05, z: 22.2, yaw: 0 },
    ],
    CT: [
      { x: -20.4, y: 0.05, z: -18.2, yaw: Math.PI },
      { x: -14.2, y: 0.05, z: -23.2, yaw: Math.PI },
      { x: -24.6, y: 0.05, z: -22.4, yaw: Math.PI },
      { x: -9.2, y: 0.05, z: -17.4, yaw: Math.PI * 0.85 },
      { x: -16.8, y: 0.05, z: -15.4, yaw: Math.PI },
    ],
  },
  bombsites: [
    {
      id: "A",
      name: "Bombsite A",
      min: { x: 16.2, y: 0, z: -24.6 },
      max: { x: 31.2, y: 2.4, z: -8.2 },
    },
    {
      id: "B",
      name: "Bombsite B",
      min: { x: -30.5, y: 0, z: -7.2 },
      max: { x: -12.4, y: 2.4, z: 3.2 },
    },
  ],
  bounds: {
    min: { x: -32, z: -26 },
    max: { x: 32, z: 30 },
  },
  /** Flat marks drawn on the ground. Decorative — not colliders. */
  decals: [
    { text: "A", x: 23.5, z: -16.5, size: 3.2 },
    { text: "B", x: -22.5, z: -2.2, size: 3.2 },
  ],
};

export function siteAt(x, y, z) {
  for (const site of MAP.bombsites) {
    if (
      x >= site.min.x &&
      x <= site.max.x &&
      z >= site.min.z &&
      z <= site.max.z &&
      y >= site.min.y - 0.3 &&
      y <= site.max.y
    ) {
      return site;
    }
  }
  return null;
}

export function clampToSite(site, x, z) {
  return {
    x: Math.min(site.max.x - 0.4, Math.max(site.min.x + 0.4, x)),
    z: Math.min(site.max.z - 0.4, Math.max(site.min.z + 0.4, z)),
  };
}

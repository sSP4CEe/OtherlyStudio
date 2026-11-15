// Continuous yaw, quantised only for the cache.
import { rad, type P2 } from "./math2d";

/** yaw angle between the character's facing and the camera's view axis (0 = front, ±π/2 = profile, π = back) */
export type CharacterView = {
  yaw: number;          // continuous, used for drawing interpolation (signed: -π..π, 0 = front)
  pitch: number;         // head pitch for 3/4, zero for front/side
  mirror: boolean;       // mesh scale (no pipeline change, used for shading)
  light: number;         // canvas angle the key light comes FROM (45° quantised for cache)
  tier: number;          // tier index: 0,1,2,3
};

/** front/side view boolean from actor.ts (preserved for backward compatibility) */
export type OldView = {
  side: boolean;        // legacy: derived from actor's viewOf
  mirror: boolean;      // legacy
  fs: number;            // legacy: foreshortening
};

/** compute a continuous yaw from the camera and character position/direction */
export const viewOf = (camPos: P2, camRight: P2, charPos: P2, charFacing: number): CharacterView => {
  const dx = camPos[0] - charPos[0], dz = camPos[1] - charPos[1];
  const tl = Math.hypot(dx, dz) || 1;
  const c = (dx * Math.cos(charFacing) + dz * Math.sin(charFacing)) / tl;
  const yawAbs = Math.acos(Math.max(-1, Math.min(1, c))); // [0, π]
  // Determine sign: cross product of view vector and facing vector
  // If character is to the right of camera view axis, yaw is negative
  const cross = dz * Math.cos(charFacing) - dx * Math.sin(charFacing);
  const yaw = cross < 0 ? -yawAbs : yawAbs;
  // pitch is zero for front/side, but can be non-zero for continuous 3/4 interpolation (see below)
  const pitch = 0;
  const mirror = Math.sign(camRight[0] * Math.sin(charFacing) - camRight[1] * Math.cos(charFacing)) < 0;
  const light = Math.round(rad(-120) / (Math.PI / 4)) * (Math.PI / 4); // 45° quantised to 8 bands
  const tier = 0; // TODO: distance-based tier
  return { yaw, pitch, mirror, light, tier };
};

/** quantise yaw to 8 bands (22.5° each) for cache keys */
export const viewBand = (yaw: number): number => {
  const band = Math.round(yaw / (Math.PI / 8));
  return band * (Math.PI / 8);
};

/** wrap the old boolean viewOf for actors that haven't been migrated */
export const oldViewOf = (camPos: P2, camRight: P2, charPos: P2, charFacing: number): OldView => {
  const v = viewOf(camPos, camRight, charPos, charFacing);
  const side = Math.abs(v.yaw) >= 0.955; // preserve exact threshold for parity
  // Compute foreshortening for the legacy path
  const c = Math.cos(v.yaw); // cos(yaw) = forward component
  const fs = side ? 0 : Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20;
  return { side, mirror: v.mirror, fs };
};
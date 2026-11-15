// Skeleton solver: one set of joint calculations for both front and side views.
import { rad, clamp, lerp2, type P2 } from "./math2d";

/** two-bone leg solver, knee bending forward (+x direction in local space) */
export const solveLeg = (hip: P2, ankle: P2, thigh: number, shin: number, kneeDir: number): P2 => {
  const dx = ankle[0] - hip[0], dy = ankle[1] - hip[1], d = clamp(Math.hypot(dx, dy), 1, thigh + shin - 0.01);
  const A = Math.acos(clamp((thigh * thigh + d * d - shin * shin) / (2 * thigh * d), -1, 1));
  const baseAngle = Math.atan2(dy, dx);
  // kneeDir: +1 = knee bends forward (toward +x), -1 = backward
  const kneeAngle = baseAngle - kneeDir * A;
  return [hip[0] + thigh * Math.cos(kneeAngle), hip[1] + thigh * Math.sin(kneeAngle)];
};

/** arm solver for shoulder → elbow → wrist chain */
export const solveArm = (shoulder: P2, hand: P2, upper: number, fore: number, elbowDir: number): P2 => {
  const dx = hand[0] - shoulder[0], dy = hand[1] - shoulder[1], d = clamp(Math.hypot(dx, dy), 1, upper + fore - 0.01);
  const A = Math.acos(clamp((upper * upper + d * d - fore * fore) / (2 * upper * d), -1, 1));
  const baseAngle = Math.atan2(dy, dx);
  // elbowDir: +1 = elbow bends forward, -1 = backward
  const elbowAngle = baseAngle - elbowDir * A;
  return [shoulder[0] + upper * Math.cos(elbowAngle), shoulder[1] + upper * Math.sin(elbowAngle)];
};

/** torso frame: given root position, facing, and chest parameters, compute joint positions */
export const torsoFrame = (x: number, y: number, facing: number, hipAngle: number, chestLift: number, chestTwist: number, neckOverlap: number, specHeight: number, headA: number): {
  hip: P2; chest: P2; shoulderL: P2; shoulderR: P2; neck: P2; chin: P2; crown: P2;
} => {
  const hip: P2 = [x, y];
  // Chest is offset from hips along facing direction
  const chestOffset = specHeight * 0.3; // roughly torso length
  const chestX = x + chestOffset * Math.cos(facing + hipAngle);
  const chestY = y + chestOffset * Math.sin(facing + hipAngle);
  const chest: P2 = [chestX, chestY];
  
  const shoulderOffset = specHeight * 0.15; // shoulder width
  const neckOffset = specHeight * 0.1; // neck length
  const ang = facing + hipAngle + chestTwist;
  const shoulderL: P2 = [chestX + shoulderOffset * Math.cos(ang - Math.PI/2), chestY + shoulderOffset * Math.sin(ang - Math.PI/2)];
  const shoulderR: P2 = [chestX + shoulderOffset * Math.cos(ang + Math.PI/2), chestY + shoulderOffset * Math.sin(ang + Math.PI/2)];
  const neck: P2 = [chestX + neckOffset * Math.cos(ang), chestY + neckOffset * Math.sin(ang)];
  const headOffset = headA * 0.5;
  const chin: P2 = [neck[0] + headOffset * Math.cos(ang), neck[1] + headOffset * Math.sin(ang)];
  const crown: P2 = [chin[0] + headA * Math.cos(ang), chin[1] + headA * Math.sin(ang)];
  return { hip, chest, shoulderL, shoulderR, neck, chin, crown };
};

/** head frame: compose chin rotation (pitch, tilt, yaw) */
export const headFrame = (chin: P2, neck: P2, headYaw: number, headPitch: number, headTilt: number, headA: number): {
  chin: P2; head: P2; crown: P2; shoulderL: P2; shoulderR: P2;
} => {
  const facing = Math.atan2(chin[1] - neck[1], chin[0] - neck[0]);
  const headRoll = facing + headYaw;
  const head: P2 = [chin[0] + headA * Math.cos(headRoll + headTilt), chin[1] + headA * Math.sin(headRoll + headTilt)];
  const crown: P2 = [head[0] + headA * Math.cos(headRoll), head[1] + headA * Math.sin(headRoll)];
  const shoulderL: P2 = neck;
  const shoulderR: P2 = neck;
  return { chin, head, crown, shoulderL, shoulderR };
};

/** foot polygon from ankle, angle and spec */
export const footPoly = (ankle: P2, footAngle: number, u: number): [P2, P2] => {
  const c = Math.cos(footAngle), s = Math.sin(footAngle);
  return [[ankle[0] - 3 * u * c, ankle[1] - 3 * u * s], [ankle[0] + 13 * u * c, ankle[1] + 13 * u * s + 0.5 * u]];
};

/** Compute leg joint positions from pose (for rendering) */
export const computeLegJoints = (hips: { x: number; y: number; angle: number }, leg: { ankle: P2; footAngle: number; kneeDir: number }, thigh: number, shin: number): { hip: P2; knee: P2; ankle: P2 } => {
  const hip: P2 = [hips.x, hips.y];
  const knee = solveLeg(hip, leg.ankle, thigh, shin, leg.kneeDir);
  return { hip, knee, ankle: leg.ankle };
};

/** Compute arm joint positions from pose (for rendering) */
export const computeArmJoints = (shoulder: P2, arm: { hand: P2 | null; elbowDir: number; reach: number }, upper: number, fore: number): { shoulder: P2; elbow: P2; hand: P2 } => {
  const hand = arm.hand ?? [shoulder[0] + arm.reach * Math.cos(arm.elbowDir), shoulder[1] + arm.reach * Math.sin(arm.elbowDir)];
  const elbow = solveArm(shoulder, hand, upper, fore, arm.elbowDir);
  return { shoulder, elbow, hand };
};

/** Interpolate between front and side leg configurations based on yaw */
export const interpolateLegConfig = (yaw: number, frontConfig: { hipY: number; thigh: number; shin: number }, sideConfig: { hipY: number; thigh: number; shin: number }): { hipY: number; thigh: number; shin: number } => {
  // yaw: 0 = front, ±π/2 = side
  const t = Math.min(1, Math.abs(yaw) / (Math.PI / 2));
  return {
    hipY: lerp2([0, frontConfig.hipY], [0, sideConfig.hipY], t)[1],
    thigh: lerp2([0, frontConfig.thigh], [0, sideConfig.thigh], t)[1],
    shin: lerp2([0, frontConfig.shin], [0, sideConfig.shin], t)[1],
  };
};

/** Interpolate between front and side arm configurations based on yaw */
export const interpolateArmConfig = (yaw: number, frontConfig: { upper: number; fore: number }, sideConfig: { upper: number; fore: number }): { upper: number; fore: number } => {
  const t = Math.min(1, Math.abs(yaw) / (Math.PI / 2));
  return {
    upper: lerp2([0, frontConfig.upper], [0, sideConfig.upper], t)[1],
    fore: lerp2([0, frontConfig.fore], [0, sideConfig.fore], t)[1],
  };
};

/** Interpolate shoulder positions between front and side based on yaw */
export const interpolateShoulders = (yaw: number, chest: P2, frontShoulderL: P2, frontShoulderR: P2, sideShoulderL: P2, sideShoulderR: P2): { shoulderL: P2; shoulderR: P2 } => {
  const t = Math.min(1, Math.abs(yaw) / (Math.PI / 2));
  return {
    shoulderL: lerp2(frontShoulderL, sideShoulderL, t),
    shoulderR: lerp2(frontShoulderR, sideShoulderR, t),
  };
};
// Mixer: track sampling, masking and additive layers.
import type { Pose } from "./pose";
import { lerp2 } from "./math2d";
import { MOODS, type FacePose, type MoodName } from "./face";
import { clipRegistry, type ClipName } from "./clips";

export type Track = {
  clip: (u: number, opts?: any) => Pose;
  weight: number;        // override blend weight (0..1)
  start: number;         // start time (seconds)
  duration: number;      // length
  fadeIn: number;        // fadeIn / fadeOut seconds
  fadeOut: number;
  mask?: (p: Pose) => Pose; // channel mask (e.g. upper body only)
  mode: "override" | "add"; // override replaces, add layers (clamp by channel range)
};

export type TransitionDef = {
  from: ClipName;
  to: ClipName;
  at: number;           // absolute time (seconds)
  duration: number;     // transition duration (seconds)
  mode?: "override" | "add";
};

/** Build tracks from a list of clip names with absolute times and transitions */
export const buildTracks = (sequence: Array<{
  clip: ClipName;
  at: number;           // absolute start time
  duration?: number;    // if omitted, runs until next clip
  opts?: any;
  fadeIn?: number;
  fadeOut?: number;
  mode?: "override" | "add";
}>): Track[] => {
  const tracks: Track[] = [];
  for (let i = 0; i < sequence.length; i++) {
    const s = sequence[i];
    const next = sequence[i + 1];
    const dur = s.duration ?? (next ? next.at - s.at : 1000); // long default
    const fadeIn = s.fadeIn ?? 0;
    const fadeOut = s.fadeOut ?? 0;
    const mode = s.mode ?? "override";
    const clipFn = clipRegistry[s.clip];
    if (!clipFn) throw new Error(`Unknown clip: ${s.clip}`);
    tracks.push({
      clip: (u: number) => clipFn(u, s.opts),
      weight: 1,
      start: s.at,
      duration: dur,
      fadeIn,
      fadeOut,
      mode,
    });
  }
  return tracks;
};

/** Evaluate tracks at time t with proper fade handling */
export const sample = (tracks: Track[], t: number): Pose => {
  const active = tracks.filter((tr) => t >= tr.start - tr.fadeIn && t <= tr.start + tr.duration + tr.fadeOut);
  if (!active.length) return restPose(faceOf("neutral"));
  
  // Compute weight for each active track based on fades
  const weighted: Array<{ pose: Pose; weight: number }> = [];
  for (const tr of active) {
    const localT = t - tr.start;
    let w = 1;
    if (localT < 0) w = tr.fadeIn > 0 ? 1 + localT / tr.fadeIn : 0;
    else if (localT > tr.duration) w = tr.fadeOut > 0 ? 1 - (localT - tr.duration) / tr.fadeOut : 0;
    w = Math.max(0, Math.min(1, w));
    if (w > 0) {
      weighted.push({ pose: tr.clip(localT), weight: w });
    }
  }
  
  if (!weighted.length) return restPose(faceOf("neutral"));
  
  // Blend all weighted poses
  let result = weighted[0].pose;
  let totalWeight = weighted[0].weight;
  for (let i = 1; i < weighted.length; i++) {
    const wp = weighted[i];
    result = blend(result, wp.pose, wp.weight / (totalWeight + wp.weight));
    totalWeight += wp.weight;
  }
  return result;
};

/** Direct blend between two poses with optional mask */
export const blend = (a: Pose, b: Pose, t: number, mask?: (p: Pose) => Pose): Pose => {
  if (!mask) mask = (p) => p;
  const result: Pose = { ...a };
  result.x = a.x + (b.x - a.x) * t;
  result.y = a.y + (b.y - a.y) * t;
  result.scale = a.scale + (b.scale - a.scale) * t;
  result.roll = a.roll + (b.roll - a.roll) * t;
  result.facing = a.facing + (b.facing - a.facing) * t;
  result.hips.x = a.hips.x + (b.hips.x - a.hips.x) * t;
  result.hips.y = a.hips.y + (b.hips.y - a.hips.y) * t;
  result.hips.angle = a.hips.angle + (b.hips.angle - a.hips.angle) * t;
  result.chest.angle = a.chest.angle + (b.chest.angle - a.chest.angle) * t;
  result.chest.lift = a.chest.lift + (b.chest.lift - a.chest.lift) * t;
  result.chest.twist = a.chest.twist + (b.chest.twist - a.chest.twist) * t;
  result.head.yaw = a.head.yaw + (b.head.yaw - a.head.yaw) * t;
  result.head.pitch = a.head.pitch + (b.head.pitch - a.head.pitch) * t;
  result.head.tilt = a.head.tilt + (b.head.tilt - a.head.tilt) * t;
  result.legs[0].ankle[0] = a.legs[0].ankle[0] + (b.legs[0].ankle[0] - a.legs[0].ankle[0]) * t;
  result.legs[0].ankle[1] = a.legs[0].ankle[1] + (b.legs[0].ankle[1] - a.legs[0].ankle[1]) * t;
  result.legs[1].ankle[0] = a.legs[1].ankle[0] + (b.legs[1].ankle[0] - a.legs[1].ankle[0]) * t;
  result.legs[1].ankle[1] = a.legs[1].ankle[1] + (b.legs[1].ankle[1] - a.legs[1].ankle[1]) * t;
  result.arms[0].hand = a.arms[0].hand && b.arms[0].hand ? lerp2(a.arms[0].hand, b.arms[0].hand, t) : b.arms[0].hand || null;
  result.arms[0].elbowDir = a.arms[0].elbowDir + (b.arms[0].elbowDir - a.arms[0].elbowDir) * t;
  result.arms[0].reach = a.arms[0].reach + (b.arms[0].reach - a.arms[0].reach) * t;
  result.arms[1].hand = a.arms[1].hand && b.arms[1].hand ? lerp2(a.arms[1].hand, b.arms[1].hand, t) : b.arms[1].hand || null;
  result.arms[1].elbowDir = a.arms[1].elbowDir + (b.arms[1].elbowDir - a.arms[1].elbowDir) * t;
  result.arms[1].reach = a.arms[1].reach + (b.arms[1].reach - a.arms[1].reach) * t;
  result.face = lerpFace(a.face, b.face, t);
  result.extras.blink = a.extras.blink + (b.extras.blink - a.extras.blink) * t;
  result.extras.sweat = b.extras.sweat || a.extras.sweat;
  result.extras.kick = a.extras.kick + (b.extras.kick - a.extras.kick) * t;
  result.extras.lean = a.extras.lean + (b.extras.lean - a.extras.lean) * t;
  result.extras.airborne = b.extras.airborne || a.extras.airborne;
  return result;
};

export const addPose = (base: Pose, add: Pose, weight: number): Pose => {
  const result: Pose = { ...base };
  result.chest.lift = base.chest.lift + (add.chest.lift - base.chest.lift) * weight;
  result.chest.twist = base.chest.twist + (add.chest.twist - base.chest.twist) * weight;
  result.arms[0].elbowDir = base.arms[0].elbowDir + (add.arms[0].elbowDir - base.arms[0].elbowDir) * weight;
  result.arms[0].reach = base.arms[0].reach + (add.arms[0].reach - base.arms[0].reach) * weight;
  result.arms[1].elbowDir = base.arms[1].elbowDir + (add.arms[1].elbowDir - base.arms[1].elbowDir) * weight;
  result.arms[1].reach = base.arms[1].reach + (add.arms[1].reach - base.arms[1].reach) * weight;
  result.face = applyMood(addPoseFace(base.face, add.face, weight));
  return result;
};

export const lerpFace = (a: FacePose, b: FacePose, t: number): FacePose => {
  const k = Math.max(0, Math.min(1, t)), o = 1 - k;
  const pick = <T>(x: T, y: T) => (k < 0.5 ? x : y);
  return {
    expr: k < 0.5 ? a.expr : b.expr,
    eye: [k < 0.5 ? a.eye[0] : b.eye[0], k < 0.5 ? a.eye[1] : b.eye[1]],
    mouth: k < 0.5 ? a.mouth : b.mouth,
    brow: [a.brow[0] * o + b.brow[0] * k, a.brow[1] * o + b.brow[1] * k],
    lid: a.lid * o + b.lid * k, lidL: a.lidL * o + b.lidL * k, lidR: a.lidR * o + b.lidR * k,
    look: a.look * o + b.look * k, gazeX: a.gazeX * o + b.gazeX * k, gazeY: a.gazeY * o + b.gazeY * k,
    browLift: a.browLift * o + b.browLift * k, smile: a.smile * o + b.smile * k, jaw: a.jaw * o + b.jaw * k,
    sweat: pick(a.sweat, b.sweat), tongue: pick(a.tongue, b.tongue), mood: pick(a.mood, b.mood),
  };
};

export const applyMood = (face: FacePose, mood: MoodName = face.mood): FacePose => {
  const m = MOODS[mood];
  return {
    ...face, mood,
    brow: [face.brow[0] + m.brow - face.browLift, face.brow[1] + m.brow * 0.5 - face.browLift],
    lid: Math.max(0, Math.min(1, face.lid + m.lid)), lidL: Math.max(0, Math.min(1, face.lidL + m.lid)),
    lidR: Math.max(0, Math.min(1, face.lidR + m.lid)), smile: Math.max(-1, Math.min(1, face.smile + m.smile)),
  };
};

export const addPoseFace = (base: FacePose, add: FacePose, weight: number): FacePose => {
  return applyMood({
    ...base,
    lid: base.lid + (add.lid - base.lid) * weight,
    lidL: base.lidL + (add.lidL - base.lidL) * weight,
    lidR: base.lidR + (add.lidR - base.lidR) * weight,
    brow: [base.brow[0] + (add.brow[0] - base.brow[0]) * weight, base.brow[1] + (add.brow[1] - base.brow[1]) * weight],
    gazeX: base.gazeX + (add.gazeX - base.gazeX) * weight,
    gazeY: base.gazeY + (add.gazeY - base.gazeY) * weight,
    smile: base.smile + (add.smile - base.smile) * weight,
    jaw: base.jaw + (add.jaw - base.jaw) * weight,
    browLift: base.browLift + (add.browLift - base.browLift) * weight,
    sweat: add.sweat || base.sweat,
    tongue: add.tongue || base.tongue,
  })
};

export const faceOf = (expr: string, opts: { lid?: number; look?: number; mood?: MoodName } = {}): FacePose => {
  return {
    expr: expr as any, eye: ["lid", "lid"], mouth: "dash", brow: [0, -1],
    lid: opts.lid ?? 0, lidL: opts.lid ?? 0, lidR: opts.lid ?? 0, look: opts.look ?? 0, gazeX: 0, gazeY: 0, browLift: 0, smile: 0, jaw: 0,
    sweat: expr === "nervous", tongue: expr === "lick", mood: opts.mood ?? "neutral",
  };
};

export const restPose = (face: FacePose): Pose => ({
  x: 300, y: 0, scale: 1, roll: 0, facing: 0,
  hips: { x: 300, y: 0, angle: 0 }, chest: { angle: 0, lift: 0, twist: 0 }, head: { yaw: 0, pitch: 0, tilt: 0 },
  legs: [{ ankle: [300, 971], footAngle: 0, kneeDir: 0, plant: true, weight: 0.5 }, { ankle: [300, 971], footAngle: 0, kneeDir: 0, plant: true, weight: 0.5 }],
  arms: [{ hand: null, elbowDir: 0, reach: 0, grip: null }, { hand: null, elbowDir: 0, reach: 0, grip: null }],
  face, extras: { blink: 0, sweat: false, kick: 0, lean: 0, airborne: false },
});

// Re-export clips for buildTracks
export { clipRegistry, walk, stroll, stand, sit, fall, push, swing, wave, turn, gesture, type ClipName } from "./clips";
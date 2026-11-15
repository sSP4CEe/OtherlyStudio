// Face as channels, not as a string. The 14 named expressions stay as presets that reproduce the measured
// table exactly; the mixer can blend two presets, add a mood underneath, and drive lid/gaze per eye.
// Pure data: the painter is render/faceDraw.ts.
export type Expr = "neutral" | "stern" | "grin" | "laugh" | "whistle" | "nervous" | "shock" | "relief" | "relief_open" | "dazed"
  | "pained" | "smile" | "smile_closed" | "lick";
export type EyeK = "dot" | "small" | "lid" | "slit" | "happy" | "dash" | "squeeze" | "shock" | "shockHalf" | "spiral";
export type MouthK = "dash" | "frown" | "smirk" | "smile" | "smileWide" | "grin" | "laugh" | "o" | "O" | "wave" | "teeth" | "lick";

/** eyes [back, front], brows [inner, outer] offsets in u (+ = down), mouth kind */
export const FACE: Record<Expr, { eye: [EyeK, EyeK]; brow: [number, number]; mouth: MouthK }> = {
  neutral: { eye: ["lid", "lid"], brow: [0, -1], mouth: "dash" },
  stern: { eye: ["lid", "lid"], brow: [3, -2], mouth: "frown" },
  grin: { eye: ["happy", "happy"], brow: [-3, -3], mouth: "grin" },
  laugh: { eye: ["squeeze", "squeeze"], brow: [-4, -4], mouth: "laugh" },
  whistle: { eye: ["dash", "dash"], brow: [-2, -4], mouth: "o" },
  nervous: { eye: ["small", "small"], brow: [-3, 2], mouth: "wave" },
  shock: { eye: ["shock", "shock"], brow: [-7, -6], mouth: "O" },
  relief: { eye: ["happy", "happy"], brow: [-2, 1], mouth: "smileWide" },
  relief_open: { eye: ["happy", "happy"], brow: [-2, 1], mouth: "grin" },
  dazed: { eye: ["spiral", "spiral"], brow: [-3, 2], mouth: "wave" },
  pained: { eye: ["squeeze", "lid"], brow: [-3, 2], mouth: "teeth" },
  smile: { eye: ["dot", "dot"], brow: [0, -1], mouth: "smirk" },
  smile_closed: { eye: ["happy", "happy"], brow: [0, -1], mouth: "smile" },
  lick: { eye: ["dot", "dot"], brow: [0, -1], mouth: "lick" },
};

export const FACE_PRESETS = FACE;

export const halfLid = (k: EyeK): EyeK => (k === "dot" || k === "small" ? "lid" : k === "lid" ? "slit" : k === "shock" ? "shockHalf" : k);

/** Map any eye kind + lid value to a drawable eye kind.
 *  Blink now works on ALL eye kinds by mapping them through halfLid progression. */
export const eyeKind = (k: EyeK, lid: number): EyeK => {
  if (lid >= 1) {
    // Fully closed: map to dash for most kinds, keep spiral as dash
    if (k === "spiral") return "dash";
    return "dash";
  }
  if (lid > 0) {
    // Partially closed: step down through halfLid
    return halfLid(k);
  }
  return k;
};

export const lidOf = (b: boolean | number | undefined) => (b === true ? 1 : Number(b) || 0);

export type MoodName = "neutral" | "stern" | "bright" | "afraid" | "tired";
/** additive baseline: brow lift (- = up), lid bias, smile bias */
export const MOODS: Record<MoodName, { brow: number; lid: number; smile: number }> = {
  neutral: { brow: 0, lid: 0, smile: 0 },
  stern: { brow: 2.5, lid: 0.12, smile: -0.35 },
  bright: { brow: -1.5, lid: -0.05, smile: 0.45 },
  afraid: { brow: -4, lid: -0.1, smile: -0.6 },
  tired: { brow: 1, lid: 0.3, smile: -0.15 },
};

/** One face at one instant. All numeric channels are in design units (u = 1 % of head width) or 0..1. */
export type FacePose = {
  expr: Expr;
  eye: [EyeK, EyeK];
  mouth: MouthK;
  /** [inner, outer] brow offsets, + = down */
  brow: [number, number];
  lid: number; // 0 open .. 1 shut
  lidL: number; lidR: number;
  look: number; // -1 .. 1 (shift toward the facing side)
  gazeX: number; gazeY: number; // extra pupil shift, design units
  browLift: number; // extra up (+) / down (-)
  smile: number; // additive -1 .. 1
  jaw: number; // additive mouth opening 0 .. 1
  sweat: boolean;
  tongue: boolean;
  mood: MoodName;
};

export const faceOf = (expr: Expr, opts: { lid?: number; look?: number; mood?: MoodName } = {}): FacePose => {
  const F = FACE[expr], lid = lidOf(opts.lid);
  return {
    expr, eye: [F.eye[0], F.eye[1]], mouth: F.mouth, brow: [F.brow[0], F.brow[1]],
    lid, lidL: lid, lidR: lid, look: opts.look ?? 0, gazeX: 0, gazeY: 0, browLift: 0, smile: 0, jaw: 0,
    sweat: expr === "nervous", tongue: expr === "lick", mood: opts.mood ?? "neutral",
  };
};

const nearMouth = (a: MouthK, b: MouthK, t: number): MouthK => (t < 0.5 ? a : b);
const nearEye = (a: EyeK, b: EyeK, t: number): EyeK => (t < 0.5 ? a : b);

/** Blend two faces. Eye/mouth kinds pick the nearer preset (they are shapes, not scalars); every other channel
 *  interpolates, so lid, brows, gaze, smile and jaw move smoothly. */
export const lerpFace = (a: FacePose, b: FacePose, t: number): FacePose => {
  const k = Math.max(0, Math.min(1, t)), o = 1 - k;
  const pick = <T>(x: T, y: T) => (k < 0.5 ? x : y);
  return {
    expr: k < 0.5 ? a.expr : b.expr,
    eye: [nearEye(a.eye[0], b.eye[0], k), nearEye(a.eye[1], b.eye[1], k)],
    mouth: nearMouth(a.mouth, b.mouth, k),
    brow: [a.brow[0] * o + b.brow[0] * k, a.brow[1] * o + b.brow[1] * k],
    lid: a.lid * o + b.lid * k, lidL: a.lidL * o + b.lidL * k, lidR: a.lidR * o + b.lidR * k,
    look: a.look * o + b.look * k, gazeX: a.gazeX * o + b.gazeX * k, gazeY: a.gazeY * o + b.gazeY * k,
    browLift: a.browLift * o + b.browLift * k, smile: a.smile * o + b.smile * k, jaw: a.jaw * o + b.jaw * k,
    sweat: pick(a.sweat, b.sweat), tongue: pick(a.tongue, b.tongue), mood: pick(a.mood, b.mood),
  };
};

/** Add a persistent mood under a transient expression (the "emotional state" layer). */
export const applyMood = (f: FacePose, mood: MoodName = f.mood): FacePose => {
  const m = MOODS[mood];
  return {
    ...f, mood,
    brow: [f.brow[0] + m.brow - f.browLift, f.brow[1] + m.brow * 0.5 - f.browLift],
    lid: Math.max(0, Math.min(1, f.lid + m.lid)), lidL: Math.max(0, Math.min(1, f.lidL + m.lid)),
    lidR: Math.max(0, Math.min(1, f.lidR + m.lid)), smile: Math.max(-1, Math.min(1, f.smile + m.smile)),
  };
};

/** The renderer's resolved shape parameters: what faceDraw needs after lid/mood are folded in. */
export const faceDrawOf = (f: FacePose): { eye: [EyeK, EyeK]; brow: [number, number]; mouth: MouthK; lidL: number; lidR: number; look: number; sweat: boolean } => ({
  eye: [f.eye[0], f.eye[1]], brow: [f.brow[0], f.brow[1]], mouth: f.mouth,
  lidL: f.lidL, lidR: f.lidR, look: f.look, sweat: f.sweat,
});

/** Interpolation factor for 3/4 view based on yaw.
 *  yaw = 0 (front) -> 0, yaw = ±π/2 (side) -> 1, yaw = ±π (back) -> 1
 *  Linear interpolation for simplicity, can be eased later. */
export const viewT = (yaw: number): number => Math.min(1, Math.abs(yaw) / (Math.PI / 2));

/** Interpolate between front and side face geometry parameters.
 *  Returns parameters suitable for the 3/4 face drawing. */
export const interpolateFaceGeometry = (yaw: number): {
  // Eye positions
  eyeOffsetX: number;  // horizontal offset from center for each eye
  eyeOffsetY: number;  // vertical offset from center
  eyeSpacing: number;  // distance between eyes
  // Brow positions
  browOffsetY: number; // vertical offset from eye
  // Mouth position
  mouthOffsetX: number;
  mouthOffsetY: number;
  // Nose (side only)
  noseOffsetX: number;
  noseOffsetY: number;
  // Head center offset
  headOffsetX: number;
  // Which eye is visible (for side view)
  visibleEye: 0 | 1 | 2; // 0=left, 1=right, 2=both
} => {
  const t = viewT(yaw);
  const o = 1 - t;
  
  // Front: eyes at ±13u, side: eye at +27u (right-facing)
  // For right-facing character (facing=1), interpolate:
  // Front left eye at -13u, right eye at +13u
  // Side single eye at +27u
  
  return {
    eyeOffsetX: 13 * o + 27 * t,
    eyeOffsetY: 0,
    eyeSpacing: 26 * o + 0 * t, // side view has one eye
    browOffsetY: (20 * o + 20 * t), // same in both
    mouthOffsetX: 8 * o + 33 * t,
    mouthOffsetY: 20 * o + 21 * t,
    noseOffsetX: 0 * o + 44 * t,
    noseOffsetY: 0 * o + 4 * t,
    headOffsetX: 0 * o + 4 * t,
    visibleEye: t < 0.5 ? 2 : 1, // both eyes until halfway, then only right
  };
};

/** Compute per-eye parameters for a given yaw */
export const computeEyeParams = (yaw: number, facing: number, u: number, f: FacePose): {
  left: { x: number; kind: EyeK; lid: number; look: number; sweep: boolean };
  right: { x: number; kind: EyeK; lid: number; look: number; sweep: boolean };
  visibleLeft: boolean;
  visibleRight: boolean;
} => {
  const t = viewT(yaw);
  const o = 1 - t;
  
  // Front: both eyes visible, at ±13u from center
  // Side (right-facing): only right eye visible at +27u
  const centerX = 0;
  const leftEyeXFront = centerX - 13 * u;
  const rightEyeXFront = centerX + 13 * u;
  const rightEyeXSide = centerX + 27 * u;
  
  const leftEyeX = leftEyeXFront * o + centerX * t; // left eye moves to center (hidden)
  const rightEyeX = rightEyeXFront * o + rightEyeXSide * t;
  
  // Determine which eye is which based on facing
  const facingRight = facing >= 0;
  const frontEye = facingRight ? 1 : 0; // right eye in front
  const backEye = facingRight ? 0 : 1;  // left eye in front
  
  // For 3/4, we blend the eye kinds
  const leftKind = t < 0.5 ? f.eye[0] : "dash";
  const rightKind = f.eye[1];
  
  const leftLid = t < 0.5 ? f.lidL : 1; // left eye closes in side view
  const rightLid = f.lidR;
  
  const leftLook = facingRight ? -1 : 1; // left eye looks opposite to facing in front
  const rightLook = facingRight ? 1 : -1;
  
  return {
    left: {
      x: leftEyeX,
      kind: eyeKind(leftKind, leftLid),
      lid: leftLid,
      look: f.look + f.gazeX / (3 * u) * leftLook,
      sweep: false,
    },
    right: {
      x: rightEyeX,
      kind: eyeKind(rightKind, rightLid),
      lid: rightLid,
      look: f.look + f.gazeX / (3 * u) * rightLook,
      sweep: false,
    },
    visibleLeft: t < 0.5,
    visibleRight: true,
  };
};

/** Compute brow parameters for a given yaw */
export const computeBrowParams = (yaw: number, facing: number, u: number, f: FacePose): {
  left: { innerX: number; outerX: number; y: number; dI: number; dO: number };
  right: { innerX: number; outerX: number; y: number; dI: number; dO: number };
} => {
  const t = viewT(yaw);
  const o = 1 - t;
  
  const leftEyeXFront = -13 * u;
  const rightEyeXFront = 13 * u;
  const rightEyeXSide = 27 * u;
  const leftEyeX = leftEyeXFront * o;
  const rightEyeX = rightEyeXFront * o + rightEyeXSide * t;
  
  // Front: brows at eyeY - 20u, inner at eyeX - 8.5u, outer at eyeX + 8.5u
  // Side: brow at eyeY - 20u, inner at eyeX + 8u, outer at eyeX - 7u
  const eyeY = 0;
  const browY = eyeY - (20 * u) - f.browLift * u;
  const leftBrowY = browY;
  const rightBrowY = browY;
  
  const leftInnerX = leftEyeX - 8.5 * u * o + (leftEyeX + 8 * u) * t;
  const leftOuterX = leftEyeX + 8.5 * u * o + (leftEyeX - 7 * u) * t;
  const rightInnerX = rightEyeX + 8.5 * u * o + (rightEyeX - 7 * u) * t;
  const rightOuterX = rightEyeX - 8.5 * u * o + (rightEyeX + 8 * u) * t;
  
  return {
    left: { innerX: leftInnerX, outerX: leftOuterX, y: leftBrowY, dI: f.brow[0], dO: f.brow[1] },
    right: { innerX: rightInnerX, outerX: rightOuterX, y: rightBrowY, dI: f.brow[0], dO: f.brow[1] },
  };
};

/** Compute mouth parameters for a given yaw */
export const computeMouthParams = (yaw: number, facing: number, u: number, f: FacePose): {
  x: number; y: number; kind: MouthK; k: number;
} => {
  const t = viewT(yaw);
  const o = 1 - t;
  
  // Front: mouth at +8u * facing, +20u
  // Side: mouth at +33u (right-facing), +21u
  const mouthXFront = 8 * u * facing;
  const mouthYFront = 20 * u;
  const mouthXSide = 33 * u; // right-facing
  const mouthYSide = 21 * u;
  
  const x = mouthXFront * o + mouthXSide * t;
  const y = mouthYFront * o + mouthYSide * t;
  const k = o + 0.62 * t; // front k=1, side k=0.62
  
  return { x, y, kind: f.mouth, k };
};

/** Compute head offset for a given yaw */
export const computeHeadOffset = (yaw: number, u: number): { x: number } => {
  const t = viewT(yaw);
  const o = 1 - t;
  // Front: center at 0, Side: center at +4u
  return { x: 4 * u * t };
};
// Clips: named motion generators, pure (no DOM).
import { type P2, rad, lerp2, curve } from "./math2d";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
import type { Pose } from "./pose";
import type { CharacterSpec } from "./spec";
import { solveArm, solveLeg } from "./skeleton";

/** walk clip: target-based gait with foot plants, hip bob, arm swing
 *  Works for both front and side views by generating ankle targets in root space
 *  stride: step length in design units (default 370 = 0.8m at SU=0.00216)
 *  cadence: steps per second (default 2)
 *  phase: normalised cycle phase 0..1
 *  yaw: camera yaw for view-dependent stride scaling (0 = front, ±π/2 = side)
 *  groundY: optional ground height function for foot planting (world meters -> design units)
 *  props: list of prop IDs (rifle, icecream, hammer, shako)
 *  handTargets: optional hand targets for IK (world space positions)
 */
export function walk(u: number, opts: { 
  stride?: number; 
  cadence?: number; 
  phase?: number; 
  yaw?: number;
  lift?: number;
  hipHeight?: number;
  legLength?: number;
  shoulderWidth?: number;
  armLength?: number;
  groundY?: (x: number, z: number) => number;
  props?: string[];
  handTargets?: { left?: P2; right?: P2 };
}): Pose {
  const stride = opts.stride ?? 370;
  const cadence = opts.cadence ?? 2;
  const phaseOffset = opts.phase ?? 0;
  const yaw = opts.yaw ?? 0;
  const lift = opts.lift ?? 60;
  const hipHeight = opts.hipHeight ?? 0;
  const legLength = opts.legLength ?? 400;
  const shoulderWidth = opts.shoulderWidth ?? 150;
  const armLength = opts.armLength ?? 380;
  const groundY = opts.groundY;
  const props = opts.props ?? [];
  const handTargets = opts.handTargets;
  
  const cyclePhase = (u * cadence + phaseOffset) % 1;
  const halfCycle = cyclePhase < 0.5 ? cyclePhase * 2 : (cyclePhase - 0.5) * 2;
  
  const leftPlant = cyclePhase < 0.5;
  const rightPlant = cyclePhase >= 0.5;
  
  const leftPlantX = -stride / 2;
  const rightPlantX = stride / 2;
  const swingProgress = halfCycle;
  
  let leftAnkleX, leftAnkleY, leftFootAngle, leftKneeDir;
  if (leftPlant) {
    leftAnkleX = -stride / 2;
    leftAnkleY = 0;
    leftFootAngle = 0;
    leftKneeDir = 1;
  } else {
    leftAnkleX = lerp(stride / 2, -stride / 2, halfCycle);
    leftAnkleY = -Math.sin(halfCycle * Math.PI) * lift;
    leftFootAngle = halfCycle * 0.3;
    leftKneeDir = 1;
  }
  
  let rightAnkleX, rightAnkleY, rightFootAngle, rightKneeDir;
  if (rightPlant) {
    rightAnkleX = stride / 2;
    rightAnkleY = 0;
    rightFootAngle = 0;
    rightKneeDir = 1;
  } else {
    rightAnkleX = lerp(-stride / 2, stride / 2, halfCycle);
    rightAnkleY = -Math.sin(halfCycle * Math.PI) * lift;
    rightFootAngle = -halfCycle * 0.3;
    rightKneeDir = 1;
  }
  
  // Foot planting with groundY function (world meters -> design units)
  // groundY returns height in world meters at given world position
  if (groundY) {
    const leftAnkleWorldX = 300 + leftAnkleX;
    const rightAnkleWorldX = 300 + rightAnkleX;
    const leftAnkleWorldZ = 0; // z position in world
    const rightAnkleWorldZ = 0;
    
    // Convert design units to world meters (1 design unit = 0.00216m at SU=0.00216)
    const groundYLeft = groundY(leftAnkleWorldX * 0.00216, leftAnkleWorldZ) / 0.00216;
    const groundYRight = groundY(rightAnkleWorldX * 0.00216, rightAnkleWorldZ) / 0.00216;
    
    if (leftPlant) leftAnkleY = groundYLeft - 975;
    if (rightPlant) rightAnkleY = groundYRight - 975;
  }
  
  const hipBob = Math.cos(halfCycle * Math.PI * 2) * (lift * 0.05);
  
  const armSwingAngle = Math.sin(halfCycle * Math.PI + Math.PI) * 0.5;
  const armSwingX = Math.sin(armSwingAngle) * armLength * 0.3;
  const armSwingY = Math.cos(armSwingAngle) * armLength * 0.1;
  
  const shoulderY = hipHeight - legLength * 0.4;
  
  const hasRifle = props.includes("rifle");
  const hasIceCream = props.includes("icecream");
  const hasHammer = props.includes("hammer");
  const hasShako = props.includes("shako");
  
  // Right hand - handle props and hand targets
  let rightGrip = null;
  let rightHandX = 300 + shoulderWidth - Math.sin(armSwingAngle) * armLength * 0.3;
  let rightHandY = shoulderY + Math.cos(armSwingAngle) * armLength * 0.1;
  let rightElbowDir = -Math.sin(halfCycle * Math.PI + Math.PI) * 0.5;
  let rightReach = armLength;
  
  if (hasRifle) {
    rightGrip = "rifle";
    rightHandX = 300 + shoulderWidth * 0.5;
    rightHandY = shoulderY - 50;
    rightElbowDir = -20;
    rightReach = armLength;
  } else if (hasIceCream) {
    rightGrip = "icecream";
    rightHandX = 300 + shoulderWidth - armSwingX;
    rightHandY = shoulderY + armSwingY;
    rightReach = armLength;
  } else if (hasHammer) {
    rightGrip = "hammer";
    rightHandX = 300 + shoulderWidth - armSwingX;
    rightHandY = shoulderY + armSwingY;
    rightReach = armLength;
  }
  
  // Override with hand target if provided (for IK)
  if (handTargets?.right) {
    rightHandX = handTargets.right[0];
    rightHandY = handTargets.right[1];
    rightGrip = rightGrip || "push"; // default to push grip for IK targets
    rightReach = armLength;
    // Simple IK: compute elbow direction from shoulder to hand
    const dx = rightHandX - (300 + shoulderWidth);
    const dy = rightHandY - shoulderY;
    rightElbowDir = Math.atan2(dy, dx);
  }
  
  // Left hand - handle props and hand targets
  let leftGrip = null;
  let leftHandX = 300 - shoulderWidth + Math.sin(armSwingAngle) * armLength * 0.3;
  let leftHandY = shoulderY + Math.cos(armSwingAngle) * armLength * 0.1;
  let leftElbowDir = Math.sin(halfCycle * Math.PI + Math.PI) * 0.5;
  let leftReach = armLength;
  
  if (hasRifle) {
    leftGrip = "rifle";
    leftHandX = 300 - shoulderWidth * 0.5;
    leftHandY = shoulderY - 50;
    leftElbowDir = 20;
    leftReach = armLength;
  } else if (hasShako) {
    leftGrip = "shako";
    leftHandX = 300 - shoulderWidth + armSwingX;
    leftHandY = shoulderY + armSwingY;
    leftReach = armLength;
  }
  
  // Override with hand target if provided (for IK)
  if (handTargets?.left) {
    leftHandX = handTargets.left[0];
    leftHandY = handTargets.left[1];
    leftGrip = leftGrip || "push";
    leftReach = armLength;
    const dx = leftHandX - (300 - shoulderWidth);
    const dy = leftHandY - shoulderY;
    leftElbowDir = Math.atan2(dy, dx);
  }
  
  return {
    x: 0, y: hipBob, scale: 1, roll: 0, facing: 0,
    hips: { x: 300, y: hipHeight + hipBob, angle: 0 },
    chest: { angle: 0, lift: hipBob * 0.1, twist: 0 },
    head: { yaw: 0, pitch: 0, tilt: 0 },
    legs: [
      {
        ankle: [300 + leftAnkleX, 975 + leftAnkleY],
        footAngle: leftFootAngle,
        kneeDir: leftKneeDir,
        plant: cyclePhase < 0.5,
        weight: cyclePhase < 0.5 ? 1.0 : 0.0
      },
      {
        ankle: [300 + rightAnkleX, 975 + rightAnkleY],
        footAngle: rightFootAngle,
        kneeDir: rightKneeDir,
        plant: cyclePhase >= 0.5,
        weight: cyclePhase >= 0.5 ? 1.0 : 0.0
      }
    ],
    arms: [
      {
        hand: leftHandX ? [leftHandX, leftHandY] : null,
        elbowDir: leftElbowDir,
        reach: leftReach,
        grip: leftGrip
      },
      {
        hand: rightHandX ? [rightHandX, rightHandY] : null,
        elbowDir: rightElbowDir,
        reach: rightReach,
        grip: rightGrip
      }
    ],
    face: { expr: "neutral", eye: ["lid", "lid"], mouth: "dash", brow: [0, -1], lid: 0, lidL: 0, lidR: 0, look: 0, gazeX: 0, gazeY: 0, browLift: 0, smile: 0, jaw: 0, sweat: false, tongue: false, mood: "neutral" },
    extras: { blink: 0, sweat: false, kick: 0, lean: 0, airborne: false }
  };
}

/** stroll clip: slower walk with less lift and shorter stride */
export function stroll(u: number, opts: { stride?: number; cadence?: number; phase?: number; yaw?: number; props?: string[]; groundY?: (x: number, z: number) => number; handTargets?: { left?: P2; right?: P2 } }): Pose {
  return walk(u, { 
    ...opts, 
    stride: (opts.stride ?? 370) * 0.75, 
    cadence: opts.cadence ?? 1.5,
    lift: (opts as any).lift ?? 40,
    props: opts.props,
    groundY: opts.groundY,
    handTargets: opts.handTargets
  });
}

/** stand clip: breath, weight shift, micro sway */
export function stand(u: number, opts: { props?: string[]; handTargets?: { left?: P2; right?: P2 } } = {}): Pose {
  const { props = [], handTargets } = opts;
  
  const hasRifle = props.includes("rifle");
  const hasIceCream = props.includes("icecream");
  const hasHammer = props.includes("hammer");
  const hasShako = props.includes("shako");
  
  // Default hand positions
  let rightGrip = null;
  let rightHandX = 450; // shoulder width 150 + 300
  let rightHandY = 450; // shoulderY
  let rightElbowDir = 0;
  let rightReach = 380;
  
  let leftGrip = null;
  let leftHandX = 150; // 300 - shoulderWidth
  let leftHandY = 450;
  let leftElbowDir = 0;
  let leftReach = 380;
  
  if (hasRifle) {
    rightGrip = "rifle"; rightHandX = 375; rightHandY = 400; rightElbowDir = -20; rightReach = 380;
    leftGrip = "rifle"; leftHandX = 225; leftHandY = 400; leftElbowDir = 20; leftReach = 380;
  } else if (hasIceCream) {
    rightGrip = "icecream";
  } else if (hasHammer) {
    rightGrip = "hammer";
  } else if (hasShako) {
    leftGrip = "shako";
  }
  
  // Override with hand targets for IK
  if (handTargets?.right) {
    rightHandX = handTargets.right[0];
    rightHandY = handTargets.right[1];
    rightGrip = rightGrip || "push";
    rightReach = 380;
    const dx = rightHandX - 450;
    const dy = rightHandY - 450;
    rightElbowDir = Math.atan2(dy, dx);
  }
  if (handTargets?.left) {
    leftHandX = handTargets.left[0];
    leftHandY = handTargets.left[1];
    leftGrip = leftGrip || "push";
    leftReach = 380;
    const dx = leftHandX - 150;
    const dy = leftHandY - 450;
    leftElbowDir = Math.atan2(dy, dx);
  }
  
  return {
    x: 0, y: 0, scale: 1, roll: 0, facing: 0,
    hips: { x: 300, y: 0, angle: 0 },
    chest: { angle: 0, lift: 0.05 * Math.sin(u * Math.PI * 2), twist: 0 },
    head: { yaw: 0, pitch: 0, tilt: 0 },
    legs: [
      { ankle: [270, 975], footAngle: 0, kneeDir: 0, plant: true, weight: 0.5 },
      { ankle: [330, 975], footAngle: 0, kneeDir: 0, plant: true, weight: 0.5 }
    ],
    arms: [
      { hand: leftHandX ? [leftHandX, leftHandY] : null, elbowDir: leftElbowDir, reach: leftReach, grip: leftGrip },
      { hand: rightHandX ? [rightHandX, rightHandY] : null, elbowDir: rightElbowDir, reach: rightReach, grip: rightGrip }
    ],
    face: { expr: "neutral", eye: ["lid", "lid"], mouth: "dash", brow: [0, -1], lid: 0, lidL: 0, lidR: 0, look: 0, gazeX: 0, gazeY: 0, browLift: 0, smile: 0, jaw: 0, sweat: false, tongue: false, mood: "neutral" },
    extras: { blink: 0, sweat: false, kick: 0, lean: 0, airborne: false }
  };
}

/** sit clip: seated pose */
export function sit(u: number, opts: { handTargets?: { left?: P2; right?: P2 } } = {}): Pose {
  const base = stand(u, opts);
  return {
    ...base,
    hips: { x: 300, y: 850, angle: 0 },
    legs: [
      { ankle: [270, 975], footAngle: 0, kneeDir: 0, plant: true, weight: 0.5 },
      { ankle: [330, 975], footAngle: 0, kneeDir: 0, plant: true, weight: 0.5 }
    ]
  };
}

/** fall clip: falling through air */
export function fall(u: number): Pose {
  const base = stand(u);
  return {
    ...base,
    extras: { ...base.extras, airborne: true },
    hips: { x: 300, y: 850 - u * 200, angle: 0 },
    legs: [
      { ankle: [270, 975], footAngle: 0, kneeDir: 0, plant: false, weight: 0.5 },
      { ankle: [330, 975], footAngle: 0, kneeDir: 0, plant: false, weight: 0.5 }
    ]
  };
}

/** push clip: hand target from the episode with IK */
export function push(u: number, opts: { handTarget: P2; lean: number; }): Pose {
  const base = stand(u);
  const handTarget = opts.handTarget;
  const lean = opts.lean;
  
  return {
    ...base,
    chest: { ...base.chest, lift: lean * 0.1, twist: lean },
    arms: [
      base.arms[0],
      {
        hand: handTarget,
        elbowDir: 0,
        reach: 360,
        grip: "push"
      }
    ],
    extras: { ...base.extras, lean }
  };
}

/** swing clip: seated kid on the plank, kicking at pushes
 *  This replaces the old swingKid canvas transform trick
 *  Uses proper rig pose with seat height and rope constraints
 *  Matches legacy swingKid: seat = rope + 18, scale = 1.1, pivot = (350, 20)
 */
export function swing(u: number, opts: { 
  kick: number; 
  pivot?: P2;      // swing pivot point in design space
  ropeLength?: number;
  groundY?: number; // ground/seat height in design units
  scale?: number;   // scale factor (legacy uses 1.1)
}): Pose {
  const kick = opts.kick;
  const pivot = opts.pivot ?? [350, 20];
  const ropeLength = opts.ropeLength ?? 1830;
  const scale = opts.scale ?? 1.1; // Legacy swingKid uses k=1.1
  // Legacy seat height: rope + 18 (not pivot[1] + rope + 18)
  const seatHeight = opts.groundY ?? (ropeLength + 18);
  
  const base = stand(u);
  const swingAngle = -kick * Math.PI / 180 * 60;
  
  // Legacy hip position: canvas transform maps bodySide origin to pivot
  // Legacy transform: translate(350 - 300*k, rope+18 - (SWING_HIP+0.12*HH)*k), scale(k)
  // BodySide hips at (300, 0) -> after transform: (350, seat - (SWING_HIP+0.12*HH))
  // SWING_HIP = 733, HH = headBlob height
  const SWING_HIP = 733;
  const HH = 200; // approximate head height
  const k = 1.1;
  const seat = ropeLength + 18;
  const hipX = pivot[0]; // Legacy transform centers hips at pivot X
  const hipY = seat - (733 + 0.12 * 200); // seat - (SWING_HIP + 0.12*HH)
  
  const basePose = stand(u);
  
  return {
    ...basePose,
    x: hipX - 300,
    y: hipY,
    scale,
    hips: { x: hipX, y: hipY + 733, angle: 0 }, // angle handled by canvas transform in legacy
    chest: { angle: 0, lift: 0, twist: 0 },
    head: { yaw: 0, pitch: 0, tilt: 0 },
    legs: [
      { ankle: [hipX - 40, seat], footAngle: 0, kneeDir: 1, plant: true, weight: 0.5 },
      { ankle: [hipX + 40, seat], footAngle: 0, kneeDir: 1, plant: true, weight: 0.5 }
    ],
    arms: [
      { hand: [hipX - 60, hipY + 600], elbowDir: 30, reach: 400, grip: "rope" },
      { hand: [hipX + 60, hipY + 600], elbowDir: -30, reach: 400, grip: "rope" }
    ],
    face: { expr: "neutral", eye: ["lid", "lid"], mouth: "dash", brow: [0, -1], lid: 0, lidL: 0, lidR: 0, look: 0, gazeX: 0, gazeY: 0, browLift: 0, smile: 0, jaw: 0, sweat: false, tongue: false, mood: "neutral" },
    extras: { ...basePose.extras, kick }
  };
}

/** wave / gesture: additive arm layer, masked via mixer */
export function wave(u: number): Pose {
  const base = stand(u);
  return {
    ...base,
    arms: [
      { hand: null, elbowDir: 30, reach: 0.8, grip: null },
      { hand: null, elbowDir: -30, reach: 0.8, grip: null }
    ],
    chest: { angle: 0, lift: 0, twist: 0 }
  };
}

/** gesture clip: generic gesture */
export function gesture(u: number): Pose {
  const base = stand(u);
  return {
    ...base,
    arms: [
      { hand: null, elbowDir: 45, reach: 0.6, grip: null },
      { hand: null, elbowDir: -45, reach: 0.6, grip: null }
    ],
    chest: { angle: 0, lift: 0, twist: 0 }
  };
}

/** turn clip: sweep view.yaw, not pose.facing */
export function turn(u: number, opts: { from: number; to: number; }): Pose {
  const base = stand(u);
  return {
    ...base,
    chest: { angle: 0, lift: 0, twist: opts.from + (opts.to - opts.from) * u }
  };
}

// Clip registry for dynamic lookup
export const clipRegistry = {
  walk,
  stroll,
  stand,
  sit,
  fall,
  push,
  swing,
  wave,
  turn,
  gesture,
};

export type ClipName = keyof typeof clipRegistry;
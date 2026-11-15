// Props: attachable objects that can be carried or placed.
// Rifle, ice-cream, hammer and carried shako become PropSpecs. Generic hand targets remove the rifle-specific
// branches in the old mode and the custom arm drawing.
import { type P2, rad, type C3, lerp } from "./math2d";
import type { Outfit } from "../toon";
import type { Pen } from "./render/pen";
import { INK, WHITE, MOUTH } from "./math2d";

/** definition of a prop that can be attached to a character */
export type PropSpec = {
  id: string;
  layers: "far" | "near"; // drawing order; "far" drawn behind the torso, "near" in front
  attach: "handL" | "handR" | "both" | "head" | "back" | "world";
  grip: { angle: number; offset: P2 }; // canonical hand pose relative to the grip point
  draw(pen: Pen, frame: PropState, opts: PropOpts): void; // state = clip channels (e.g. hammer strike 0..1)
  contact?: { at: P2; normal: P2 }; // drives FX and the strike frame
};

export type PropState = {
  progress: number; // 0..1 for animated props (e.g. hammer swing)
  mood: string; // optional mood layer
};

export type PropOpts = {
  outfit: Outfit;
  seed: number;
  light: number;
  facing: number;
  mirror: boolean;
};

/** Rifle prop - carried by soldiers */
export const rifleProp: PropSpec = {
  id: "rifle",
  layers: "near",
  attach: "handR",
  grip: { angle: rad(-30), offset: [0, 0] },
  draw(pen: Pen, frame: PropState, opts: PropOpts) {
    // Rifle is drawn as part of the body (rifle band + bandolier)
    // This is handled in body rendering
  },
  contact: { at: [300 + 64, 0], normal: [1, 0] }, // muzzle position relative to hand
};

/** Ice cream prop - held in right hand */
export const iceCreamProp: PropSpec = {
  id: "icecream",
  layers: "near",
  attach: "handR",
  grip: { angle: 0, offset: [0, 0] },
  draw(pen: Pen, frame: PropState, opts: PropOpts) {
    const u = 1; // will be scaled by caller
    // Cone
    pen.poly([[-8 * u, -12 * u], [8 * u, -12 * u], [0, 7 * u]], "#e0a35a", 1.8 * u);
    // Scoop
    pen.ell(0, -19 * u, 11 * u, 10 * u, "#f7c6d9", 2.2 * u);
    // Hand dot
    pen.dot(0, 0, 5.5 * u);
  },
};

/** Hammer prop - held in right hand, animated swing */
export const hammerProp: PropSpec = {
  id: "hammer",
  layers: "near",
  attach: "handR",
  grip: { angle: rad(-70), offset: [0, 0] }, // varies with progress
  draw(pen: Pen, frame: PropState, opts: PropOpts) {
    const u = 1; // will be scaled by caller
    const k = frame.progress; // 0 = raised, 1 = struck
    const ang = rad(-70 + 105 * k);
    const Rh = (pts: P2[]) => {
      const c = Math.cos(ang), s = Math.sin(ang);
      return pts.map(([x, y]) => [c * x - s * y, s * x + c * y]) as P2[];
    };
    // Handle
    pen.band(Rh([[0, 12 * u], [0, -44 * u]] as P2[]), "#8a5a34", 5 * u, 1.5 * u, "round");
    // Head
    pen.poly(Rh([[-12 * u, -58 * u], [20 * u, -58 * u], [20 * u, -42 * u], [-12 * u, -42 * u]] as P2[]), "#7d848c", 2.2 * u);
    // Hand dot
    pen.dot(0, 0, 5.5 * u);
  },
  contact: { at: [20, -58], normal: [0, -1] }, // hammer head position
};

/** Carried shako prop - held in left hand */
export const carriedShakoProp: PropSpec = {
  id: "shako",
  layers: "near",
  attach: "handL",
  grip: { angle: 0, offset: [0, 0] },
  draw(pen: Pen, frame: PropState, opts: PropOpts) {
    const u = 1; // will be scaled by caller
    // Box
    pen.poly([[-14 * u, 3 * u], [14 * u, 3 * u], [16 * u, 30 * u], [-16 * u, 30 * u]], "#3a3d47", 2.2 * u);
    // Top
    pen.ell(0, 31 * u, 3.5 * u, 3.5 * u, "#2b7a4b", 1.5 * u);
    // Hand dot
    pen.dot(0, 0, 5.5 * u);
  },
};

/** All available props */
export const PROP_REGISTRY: Record<string, PropSpec> = {
  rifle: rifleProp,
  icecream: iceCreamProp,
  hammer: hammerProp,
  shako: carriedShakoProp,
};

/** Get a prop by ID */
export const getProp = (id: string): PropSpec | undefined => PROP_REGISTRY[id];

/** generic hand targets: computed from the character's pose */
export const attachHands = (pose: import("./pose").Pose, propIds: string[], opts: PropOpts): {
  handL: { hand: P2; elbowDir: number; grip: string | null };
  handR: { hand: P2; elbowDir: number; grip: string | null };
} => {
  // For now, return the current hand positions from the pose
  // In a full implementation, this would solve IK for the prop grip points
  const leftHand = pose.arms[0].hand ?? [0, 0];
  const rightHand = pose.arms[1].hand ?? [0, 0];
  
  return {
    handL: { hand: leftHand, elbowDir: pose.arms[0].elbowDir, grip: propIds.includes("shako") ? "shako" : null },
    handR: { hand: rightHand, elbowDir: pose.arms[1].elbowDir, grip: propIds.includes("rifle") ? "rifle" : propIds.includes("icecream") ? "icecream" : propIds.includes("hammer") ? "hammer" : null },
  };
};

/** contact point for a prop: where the strike happens (e.g. hammer head) */
export const contactAt = (propId: string, t: number, opts: PropOpts): P2 => {
  const prop = getProp(propId);
  if (!prop || !prop.contact) return [0, 0];
  // For now, return the contact point in local space
  // In a full implementation, this would be transformed to world space
  return prop.contact.at;
};

/** Draw a prop at a hand position */
export const drawPropAtHand = (pen: Pen, propId: string, handPos: P2, handAngle: number, u: number, opts: PropOpts): void => {
  const prop = getProp(propId);
  if (!prop) return;
  
  const c = Math.cos(handAngle), s = Math.sin(handAngle);
  const R = (pts: P2[]) => pts.map(([x, y]) => [handPos[0] + c * x - s * y, handPos[1] + s * x + c * y]);
  
  // Scale and transform
  const scaledPts = (pts: P2[]) => pts.map(([x, y]) => [handPos[0] + c * (x * u) - s * (y * u), handPos[1] + s * (x * u) + c * (y * u)]);
  
  // For now, use a simple approach - the prop drawing functions expect local coordinates
  // We'll create a temporary pen with transformed context
  const g = pen.g;
  g.save();
  g.translate(handPos[0], handPos[1]);
  g.rotate(handAngle);
  g.scale(u, u);
  
  const tempPen = new (require("../toon").Pen)(g);
  prop.draw(tempPen, { progress: 0, mood: "" }, { outfit: opts.outfit, seed: 0, light: opts.light, facing: opts.facing, mirror: opts.mirror });
  
  g.restore();
};
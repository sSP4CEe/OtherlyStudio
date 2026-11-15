// Legacy adapters: move old options → new rig, keep the public API identical.
import type { Outfit, FrontOpts, SideOpts, Expr } from "../toon";
import { Pen as ToonPen } from "../toon";
import { frontFrame, sideFrame, SWING_HIP } from "./pose";
import { paintFront, paintSide } from "./render/body";
import { headBlob, BUILD } from "./spec";
import { rrect, rad } from "./math2d";

/** bodyFront adapter (toon.ts) – exact arithmetic, same draw order */
export const bodyFront = (pen: ToonPen, outfit: Outfit, opts: FrontOpts): void => {
  const F = frontFrame(outfit, opts);
  paintFront(pen, outfit, F);
};

/** bodySide adapter (toon.ts) */
export const bodySide = (pen: ToonPen, outfit: Outfit, opts: SideOpts): void => {
  const F = sideFrame(outfit, opts);
  paintSide(pen, outfit, F);
};

/** legacyPose - encode old options into new Pose (for future use) */
export const legacyPose = (opts: FrontOpts | SideOpts, spec: import("./spec").CharacterSpec, view: import("./view").CharacterView): import("./pose").Pose => {
  // reconstruct the same joint targets the old mode used
  const pose: import("./pose").Pose = {
    x: 0, y: 0, scale: 1, roll: 0, facing: 0,
    hips: { x: 300, y: 0, angle: 0 },
    chest: { angle: 0, lift: 0, twist: 0 },
    head: { yaw: 0, pitch: 0, tilt: 0 },
    legs: [{ ankle: [0,0], footAngle: 0, kneeDir: 0, plant: false, weight: 0.5 }, { ankle: [0,0], footAngle: 0, kneeDir: 0, plant: false, weight: 0.5 }],
    arms: [{ hand: null, elbowDir: 0, reach: 0, grip: null }, { hand: null, elbowDir: 0, reach: 0, grip: null }],
    face: { expr: opts.expr || "neutral", eye: ["lid", "lid"], mouth: "dash", brow: [0, -1], lid: 0, lidL: 0, lidR: 0, look: 0, gazeX: 0, gazeY: 0, browLift: 0, smile: 0, jaw: 0, sweat: false, tongue: false, mood: "neutral" },
    extras: { blink: 0, sweat: false, kick: 0, lean: 0, airborne: false }
  };
  return pose;
};

/** swingKid adapter (toon.ts) – canvas transform trick around bodySide */
export const swingKid = (pen: ToonPen, outfit: Outfit, kick: number, expr: Expr, light = -120, blink: number = 0): void => {
  const rope = 1830, k = 1.1, HH = 2 * headBlob(5, BUILD[outfit.build ?? "adult"].a, 1).b;
  // two ropes from the pivot to the ends of a wide plank, the kid framed between them: a single rope behind the kid
  // ended at the cap and read as a hanging. Far rope behind the kid, near rope drawn over (clear of the face).
  const seat = rope + 18, x0 = 150, x1 = 550;
  pen.line([[350, 20], [x0 + 16, seat + 4]], "#a07a4c", 10);
  pen.poly(rrect(x0, seat, x1, seat + 36, 10), "#b5653f", 9);
  const g = pen.g;
  g.save();
  g.translate(350 - 300 * k, rope + 18 - (SWING_HIP + 0.12 * HH) * k);
  g.scale(k, k);
  // Create a new Pen for the scaled context
  const scaledPen = new ToonPen(g);
  bodySide(scaledPen, outfit, { mode: "swing", expr, pose: kick, light, seed: 5, blink });
  g.restore();
  pen.line([[350, 20], [x1 - 16, seat + 4]], "#a07a4c", 10);
};
// Character drawing orchestration: layer order + parameter plumbing.
// The layer order matches the film exactly:
// far legs → far arm → far props → torso → wardrobe → near arm → near props → head → hat → face → extras
import type { Pen } from "./pen";
import type { CharacterSpec } from "../spec";
import type { Pose } from "../pose";
import type { CharacterView } from "../view";
import type { Outfit } from "../../toon";
import { paintFront, paintSide } from "./body";

/** draw a character from a pose and view; branches to front or side painter */
export const drawCharacter = (pen: Pen, spec: CharacterSpec, pose: Pose, view: CharacterView, outfit: Outfit): void => {
  // For Phase 1, we use the legacy front/side split based on yaw
  const isSide = Math.abs(view.yaw) >= 0.955; // preserve exact threshold for parity
  // Use the legacy frame builders to get the exact same arithmetic
  const { frontFrame, sideFrame } = require("../pose");
  
  // Convert pose to legacy options (simplified - the adapters handle this)
  const isFrontOpts = pose.extras.lean === 0 && pose.chest.twist === 0;
  // For now, delegate to adapters
  if (isSide) {
    // bodySide path - would need legacy SideOpts
    paintSide(pen, outfit, sideFrame(outfit, { mode: "stand" }));
  } else {
    // bodyFront path - would need legacy FrontOpts
    paintFront(pen, outfit, frontFrame(outfit, { mode: "stand" }));
  }
};
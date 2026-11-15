// Rig barrel: public API for episodes; everything else lives in its sub‑modules.
export { CharacterSpec, makeSpec, measures, specSheet } from "./spec";
export { Pose, restPose, partial, FrontOpts, SideOpts, FrontMode, SideMode, Prop } from "./pose";
export { CharacterView, viewOf, oldViewOf } from "./view";
export { FacePose, FACE_PRESETS, lerpFace, applyMood } from "./face";
export { solveLeg, solveArm, torsoFrame, headFrame, footPoly } from "./skeleton";
export { walk, stroll, stand, sit, fall, push, swing, wave, turn, gesture } from "./clips";
export { Track, sample, blend } from "./mixer";
export { PropSpec, attachHands, contactAt } from "./props";
export { drawCharacter } from "./render/character";
export { CacheStats, keyOf, Cache } from "./cache";
export { legacyPose, bodyFront, bodySide, swingKid } from "./adapters";
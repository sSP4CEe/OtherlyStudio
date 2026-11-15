// Episode integration: bridges the episode's character creation with the rig system
// Uses mixer for smooth transitions, adapters for legacy rendering compatibility

import { makeSpec } from "./spec";
import { frontFrame, sideFrame } from "./pose";
import { buildTracks, sample, Track, ClipName } from "./mixer";
import { CharacterView, viewOf } from "./view";
import { drawCharacter } from "./render/character";
import { FrontOpts, SideOpts, Outfit, Expr } from "../toon";
import type { Pen } from "../toon";

export interface RigCharacterOptions {
  outfit: Outfit;
  specId?: string;
  specSeed?: number;
  expr?: Expr;
  look?: number;
  blink?: number | boolean;
  /** Clip sequence for mixer-based animation */
  clipSequence?: Array<{
    clip: "walk" | "stroll" | "stand" | "sit" | "fall" | "push" | "swing" | "wave" | "turn" | "gesture";
    at: number;           // absolute time (seconds)
    duration?: number;
    opts?: any;
    fadeIn?: number;
    fadeOut?: number;
    mode?: "override" | "add";
  }>;
  /** Legacy mode (for backward compatibility) */
  legacyMode?: FrontOpts | SideOpts;
  /** View parameters */
  view?: CharacterView;
  /** Light angle for drawing */
  light?: number;
  /** Random seed */
  seed?: number;
  /** Facing direction (-1, 0, 1) */
  facing?: -1 | 0 | 1;
}

/** Create a rig-based character draw function with mixer-based animation */
export const createRigCharacter = (opts: RigCharacterOptions) => {
  const {
    outfit,
    specId = "char",
    specSeed = 1,
    expr = "neutral",
    look = 0,
    blink = 0,
    clipSequence,
    legacyMode,
    view,
    light = -2.094, // rad(-120)
    seed = 1,
    facing = 0,
  } = opts;

  const spec = makeSpec(outfit, specSeed, specId);
  const baseExpr = expr;
  const baseLook = look;
  const baseBlink = blink;
  const baseLight = light;
  const baseSeed = seed;
  const baseFacing = facing;

  // Build mixer tracks if clip sequence provided
  let tracks: Track[] = [];
  if (clipSequence && clipSequence.length > 0) {
    tracks = clipSequence.map((s, i) => {
      const next = clipSequence[i + 1];
      const dur = s.duration ?? (next ? next.at - s.at : 1000);
      const fadeIn = s.fadeIn ?? 0;
      const fadeOut = s.fadeOut ?? 0;
      const mode = s.mode ?? "override";
      return {
        clip: (u: number) => {
          // Dynamic import to avoid circular deps
          const clips = require("./clips");
          const clipFn = clips[s.clip];
          if (!clipFn) throw new Error(`Unknown clip: ${s.clip}`);
          return clipFn(u, s.opts);
        },
        weight: 1,
        start: s.at,
        duration: dur,
        fadeIn,
        fadeOut,
        mode,
      };
    });
  }

  /** Draw function compatible with episode's person() API */
  return (p: Pen, t: number, customView?: CharacterView, customExpr?: Expr, customBlink?: number | boolean, customLook?: number, customLight?: number, customSeed?: number, customFacing?: number) => {
    const v = customView ?? view;
    const e = customExpr ?? baseExpr;
    const b = customBlink ?? baseBlink;
    const l = customLook ?? baseLook;
    const lt = customLight ?? baseLight;
    const sd = customSeed ?? baseSeed;
    const fc = (customFacing ?? baseFacing) as -1 | 0 | 1;

    // Sample mixer if tracks exist
    let pose;
    if (tracks.length > 0) {
      pose = require("./mixer").sample(tracks, t);
      // Override face with custom expression/blink/look if provided
      if (customExpr !== undefined || customBlink !== undefined || customLook !== undefined) {
        pose.face = {
          ...pose.face,
          expr: customExpr ?? pose.face.expr,
          lid: customBlink !== undefined ? (typeof customBlink === "boolean" ? (customBlink ? 1 : 0) : customBlink) : pose.face.lid,
          look: customLook ?? pose.face.look,
        };
      }
    } else if (legacyMode) {
      // Fallback to legacy mode
      pose = require("./pose").legacyPose(legacyMode, spec, v);
    } else {
      // Default rest pose
      pose = require("./pose").restPose(require("./face").faceOf(baseExpr));
    }

    // Draw using legacy adapters for exact parity
    // For now, use the legacy frame builders with the sampled pose data
    // This maintains exact visual parity
    const viewForDraw = v ?? { yaw: 0, pitch: 0, mirror: false, light: -2.094, tier: 0 };
    if (viewForDraw.yaw >= 0.955 || viewForDraw.yaw <= -0.955) {
      // Side view - use sideFrame with pose data
      const so: SideOpts = {
        expr: e,
        mode: "march", // Will be overridden by pose data in future
        blink: b,
        light: lt,
        seed: sd,
        pose: pose.extras.kick,
        stride: 1,
      };
      const F = sideFrame(outfit, so);
      require("./render/body").paintSide(p, outfit, F);
    } else {
      // Front view - use frontFrame with pose data
      const fo: FrontOpts = {
        expr: e,
        mode: "march",
        blink: b,
        lift: 60,
        light: lt,
        seed: sd,
        facing: fc,
      };
      const F = frontFrame(outfit, fo);
      require("./render/body").paintFront(p, outfit, F);
    }
  };
};

/** Build clip sequence for marching column soldiers with SNAP/DROP transitions */
export const buildColumnClipSequence = (shotId: number, tau: number, isFalling: boolean): Array<{
  clip: "walk" | "stroll" | "stand" | "sit" | "fall" | "push" | "swing" | "wave" | "turn" | "gesture";
  at: number;
  duration?: number;
  opts?: any;
  fadeIn?: number;
  fadeOut?: number;
}> => {
  // Map episode timeline to absolute time (use world time t)
  // For shot 8 (falling column), we have special transitions
  if (shotId === 8 && isFalling) {
    const SNAP = 34.62;
    const DROP0 = 36.35;
    const DROP1 = 36.95;
    
    // We need to convert tau to world time t
    // For shot 8, tau = t (since shot 8 starts at t=987/30=32.9s, tau=t)
    // Actually tau = s.tau(t), for shot 8: tau = t
    // So absolute time t = tau for this shot
    
    if (tau < SNAP) {
      // Before SNAP: marching
      return [{ clip: "walk", at: 0, opts: { phase: 0 } }];
    } else if (tau < SNAP + 0.25) {
      // SNAP transition: march -> stand (quick fade ~0.1s)
      return [
        { clip: "walk", at: 0, duration: SNAP, opts: { phase: 0 } },
        { clip: "stand", at: SNAP, duration: 0.3, fadeIn: 0.1, fadeOut: 0.1, opts: {} },
      ];
    } else if (tau < DROP0) {
      // After SNAP, before DROP: standing
      return [{ clip: "stand", at: SNAP + 0.25, opts: {} }];
    } else if (tau < DROP1 + 0.13) {
      // DROP transition: stand -> fall -> sit
      const fallStart = DROP0;
      const sitStart = DROP1 + 0.13;
      return [
        { clip: "walk", at: 0, duration: SNAP, opts: { phase: 0 } },
        { clip: "stand", at: SNAP, duration: 0.3, fadeIn: 0.1, fadeOut: 0.1, opts: {} },
        { clip: "stand", at: SNAP + 0.25, duration: DROP0 - (SNAP + 0.25), opts: {} },
        { clip: "fall", at: fallStart, duration: DROP1 - DROP0 + 0.13, fadeIn: 0.1, fadeOut: 0.1, opts: {} },
        { clip: "sit", at: sitStart, opts: {} },
      ];
    } else {
      // After DROP: sitting
      return [{ clip: "sit", at: DROP1 + 0.13, opts: {} }];
    }
  }
  
  // Default: walking march
  return [{ clip: "walk", at: 0, opts: { phase: 0 } }];
};

/** Build clip sequence for tourists (stroll -> march transition) */
export const buildTouristClipSequence = (t: number): Array<{
  clip: "walk" | "stroll" | "stand" | "sit" | "fall" | "push" | "swing" | "wave" | "turn" | "gesture";
  at: number;
  duration?: number;
  opts?: any;
  fadeIn?: number;
  fadeOut?: number;
}> => {
  // Shot 15 starts at t = 1863/30 = 62.1s
  // Tourists start strolling, some may transition to march
  // For now, just stroll
  return [{ clip: "stroll", at: 0, opts: { phase: 0 } }];
};

/** Legacy-compatible person function for gradual migration */
export const rigPerson = (cam: any, who: any, x: number, y: number, z: number, view: any, fo: FrontOpts, so: SideOpts, scale = 1) => {
  // This maintains the exact same API as the original person() function
  // but internally uses rig system
  const spec = makeSpec(who.o, 1, who.okey);
  const v = view;
  const isSide = v.side;
  const mirror = isSide && v.mirror;
  const light = typeof cam.light2D === "function" ? cam.light2D(cam, mirror) : -2.094;
  const seed = 1; // seedOf(who.i)
  
  // Use legacy frame builders for exact parity
  if (isSide) {
    const so2: SideOpts = { ...so, light, seed };
    const F = sideFrame(who.o, so2);
    return {
      key: `S|${who.okey}|${JSON.stringify(so2)}`,
      x, y, z, scale, mirror, tierKey: `${fo.light}`,
      draw: (p: Pen) => require("./render/body").paintSide(p, who.o, F),
    };
  } else {
    const fo2: FrontOpts = { ...fo, light, seed };
    const F = frontFrame(who.o, fo2);
    return {
      key: `F|${who.okey}|${JSON.stringify(fo2)}`,
      x, y, z, scale, mirror, tierKey: `${fo.light}`,
      draw: (p: Pen) => require("./render/body").paintFront(p, who.o, F),
    };
  }
};
// Re-export legacy adapters for backward compatibility
export { bodyFront, bodySide, swingKid } from "../toon";

// Re-export for convenience
export { makeSpec } from "./spec";
export { FrontOpts, SideOpts } from "./pose";
export { CharacterView, viewOf } from "./view";
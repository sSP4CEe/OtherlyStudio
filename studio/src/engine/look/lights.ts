// Light presets per time of day. The sun is CAMERA-RELATIVE and frozen per shot (world.ts update()):
// az = degrees from the shot camera's forward axis (0 = sun straight ahead = backlight, +90 = screen right,
// 180 = behind camera), el = elevation. lit/shade/lift are LINEAR RGB multipliers for shade.ts (may exceed 1).
// Field names follow lighting.md 9.1 exactly (the CHAR and POST agents read them); values are tuned on renders.
type C3 = [number, number, number];

/** The series' lighting vocabulary. Adding a look = one LIGHTS + one LOOK entry + one GRADES entry. */
export type LightName = "day" | "golden" | "overcast" | "dusk" | "night" | "interior_warm";
export const LIGHT_NAMES: LightName[] = ["day", "golden", "overcast", "dusk", "night", "interior_warm"];

export type LightPreset = {
  az: number; el: number;
  lit: C3; shade: C3; lift: C3; lambert: number; sideK: number; term: number;      // world two-tone (shade.ts)
  charTint: C3; charShade: number; charGrad: number; bodyGrad: number; sideTint: C3; // character cards (cast.ts)
  blob: C3; actorShadow: boolean;                                                    // contact blobs / card shadows
  top: string; hor: string; skyCurve: C3; fog: string; fogNear: number; fogFar: number; sunDisc: string; // depth.md 6.5
  sunCol: string; sunI: number; sky: string; ground: string; hemiI: number;         // three lights (unpatched mats only)
  bias: number; normalBias: number;
  /** draw a sun/moon disc + halo (golden, dusk, night); the disc colour doubles as the card emissive tint */
  sunVisible?: boolean;
};

export const LIGHTS: Record<LightName, LightPreset> = {
  day: {
    az: 75, el: 48,
    lit: [1.58, 1.5, 1.33], shade: [0.3, 0.29, 0.36], lift: [0.05, 0.06, 0.11], lambert: 0.35, sideK: 0.84, term: 0.2,
    charTint: [1.0, 0.94, 0.92], charShade: 0.86, charGrad: 0.07, bodyGrad: 0.2, sideTint: [0.92, 0.90, 0.96],
    blob: [0.62, 0.58, 0.58], actorShadow: false,
    top: "#3e7fd2", hor: "#b8d0ec", skyCurve: [0.0, 0.5, 0.6], fog: "#b8d0ec", fogNear: 25, fogFar: 300, sunDisc: "#000000",
    sunCol: "#fff3e0", sunI: 2.8, sky: "#dcecff", ground: "#b49a78", hemiI: 0.55,
    bias: -0.00025, normalBias: 0.015,
  },
  golden: {
    az: 6, el: 7,
    lit: [1.5, 0.68, 0.24], shade: [0.15, 0.15, 0.3], lift: [0.04, 0.06, 0.17], lambert: 0.35, sideK: 0.82, term: 0.07,
    charTint: [1.0, 0.78, 0.56], charShade: 0.88, charGrad: 0.1, bodyGrad: 0.25, sideTint: [0.85, 0.80, 0.95],
    blob: [0.75, 0.74, 0.9], actorShadow: true,
    top: "#6a4f8c", hor: "#ffd08a", skyCurve: [0.05, 0.6, 1.0], fog: "#efb489", fogNear: 50, fogFar: 380, sunDisc: "#ffcf9e",
    sunCol: "#ffab5e", sunI: 5.5, sky: "#d8b0b8", ground: "#8a6a60", hemiI: 0.5,
    bias: -0.0006, normalBias: 0.03, sunVisible: true,
  },
  overcast: {
    az: 150, el: 38,
    lit: [1.12, 1.14, 1.18], shade: [0.42, 0.44, 0.5], lift: [0.1, 0.11, 0.14], lambert: 0.42, sideK: 0.9, term: 0.35,
    charTint: [0.95, 0.96, 1.0], charShade: 0.9, charGrad: 0.05, bodyGrad: 0.15, sideTint: [0.92, 0.93, 0.98],
    blob: [0.55, 0.57, 0.6], actorShadow: false,
    top: "#9aa9bb", hor: "#d7dee6", skyCurve: [0.0, 0.4, 0.5], fog: "#d7dee6", fogNear: 30, fogFar: 260, sunDisc: "#000000",
    sunCol: "#eef2f7", sunI: 1.2, sky: "#e6edf5", ground: "#8f8a84", hemiI: 0.8,
    bias: -0.0002, normalBias: 0.02,
  },
  dusk: {
    az: 8, el: 3,
    lit: [0.72, 0.5, 0.52], shade: [0.16, 0.15, 0.28], lift: [0.05, 0.06, 0.16], lambert: 0.32, sideK: 0.8, term: 0.12,
    charTint: [0.9, 0.72, 0.72], charShade: 0.86, charGrad: 0.1, bodyGrad: 0.25, sideTint: [0.82, 0.8, 0.95],
    blob: [0.6, 0.58, 0.72], actorShadow: true,
    top: "#26325e", hor: "#d98a6a", skyCurve: [0.0, 0.55, 0.9], fog: "#c9866f", fogNear: 40, fogFar: 320, sunDisc: "#ff9a72",
    sunCol: "#ff8a5a", sunI: 2.4, sky: "#8d90b8", ground: "#5c4a52", hemiI: 0.6,
    bias: -0.0005, normalBias: 0.025, sunVisible: true,
  },
  night: {
    az: 200, el: 42,
    lit: [0.42, 0.52, 0.78], shade: [0.1, 0.12, 0.22], lift: [0.03, 0.04, 0.1], lambert: 0.3, sideK: 0.78, term: 0.18,
    charTint: [0.72, 0.78, 1.0], charShade: 0.9, charGrad: 0.05, bodyGrad: 0.18, sideTint: [0.78, 0.82, 1.0],
    blob: [0.3, 0.32, 0.42], actorShadow: true,
    top: "#0b1430", hor: "#27385e", skyCurve: [0.0, 0.5, 0.8], fog: "#22304e", fogNear: 30, fogFar: 300, sunDisc: "#dfe8ff",
    sunCol: "#b9c9ff", sunI: 1.0, sky: "#4a5a80", ground: "#2a2a38", hemiI: 0.35,
    bias: -0.0003, normalBias: 0.02, sunVisible: true,
  },
  interior_warm: {
    az: 120, el: 55,
    lit: [1.5, 1.18, 0.82], shade: [0.4, 0.3, 0.26], lift: [0.08, 0.06, 0.06], lambert: 0.5, sideK: 0.9, term: 0.3,
    charTint: [1.0, 0.9, 0.78], charShade: 0.92, charGrad: 0.06, bodyGrad: 0.16, sideTint: [0.95, 0.88, 0.85],
    blob: [0.5, 0.45, 0.4], actorShadow: false,
    top: "#3a3028", hor: "#c9a678", skyCurve: [0.0, 0.4, 0.5], fog: "#c9a678", fogNear: 8, fogFar: 60, sunDisc: "#000000",
    sunCol: "#ffd9a8", sunI: 1.6, sky: "#e8d6b8", ground: "#6a5540", hemiI: 0.7,
    bias: -0.0002, normalBias: 0.015,
  },
};

/** world-only look per light (sky stops by elevation in degrees, river colours, cloud palette). All colours are
 *  ON-SCREEN targets under the current PBR-Neutral tone map; world.ts pre-inverts the tone map (shade.ts untone). */
export type WorldLook = {
  sky: { c: string[]; e: number[] };                         // 5 stops: c[i] at elevation e[i] (deg), smoothstep between
  water: { near: string; mid: string; far: string; crest: string; trough: string; glint: string; shade: C3 };
  bounce: C3;                                                 // shade.ts uBounce: albedo x bounce on shaded faces turned to the lens
  sat: number;                                                // shade.ts uSat: world albedo saturation (1 = as painted)
  cloud: { lit: string; mid: string; shade: string };
};
export const LOOK: Record<LightName, WorldLook> = {
  day: {
    // depth.md 2.2: horizon #9fb6e6 just above the skyline, upper sky #5e93d9 at ~20 deg (grade: frame top #5997e2)
    sky: { c: ["#b8d0ec", "#9cbfea", "#6a9fe0", "#4f8cdb", "#3373cc"], e: [0, 3, 8, 16, 40] },
    water: { near: "#22a7b6", mid: "#167fb2", far: "#1a5596", crest: "#7ddfe8", trough: "#0e4a80", glint: "#ffffff", shade: [0.5, 0.56, 0.72] },
    cloud: { lit: "#fbf8f1", mid: "#e1e5f3", shade: "#c3cbe9" },
    bounce: [0, 0, 0],
    sat: 1.08,
  },
  golden: {
    // sunset, not dusk: #ffd08a horizon, peach/orange through ~10 deg, warm rose at 20, muted warm mauve only near the top
    // (the golden grade adds ~+11/255 blue to shadows/mids, so these lean warm)
    sky: { c: ["#ffc47c", "#f7ae78", "#e8967c", "#c4848e", "#8a6f8a"], e: [0, 4, 10, 20, 40] },
    water: { near: "#1e3a6e", mid: "#355f96", far: "#d4a48e", crest: "#d9a088", trough: "#16294f", glint: "#ffe2b0", shade: [0.42, 0.46, 0.72] },
    cloud: { lit: "#ffd2a8", mid: "#f2a08f", shade: "#a98fc4" },
    bounce: [0.04, 0.02, 0.0],
    sat: 1.1,
  },
  overcast: {
    sky: { c: ["#d7dee6", "#c9d2dc", "#b3bfcc", "#9dabbc", "#8796aa"], e: [0, 3, 9, 18, 40] },
    water: { near: "#3d7f84", mid: "#356f80", far: "#2f5b6e", crest: "#9fc0bf", trough: "#254a58", glint: "#e8f1f2", shade: [0.55, 0.6, 0.68] },
    cloud: { lit: "#f2f3f3", mid: "#d5d9dd", shade: "#b3bac2" },
    bounce: [0.0, 0.0, 0.01],
    sat: 0.92,
  },
  dusk: {
    sky: { c: ["#d98a6a", "#b9787f", "#86698f", "#4f4a78", "#2b2f5c"], e: [0, 3, 9, 18, 40] },
    water: { near: "#2a3358", mid: "#3b3564", far: "#8f5f78", crest: "#c98a86", trough: "#1c2444", glint: "#ffd0a8", shade: [0.4, 0.42, 0.64] },
    cloud: { lit: "#f0a488", mid: "#b97f92", shade: "#6f6294" },
    bounce: [0.03, 0.01, 0.01],
    sat: 1.04,
  },
  night: {
    sky: { c: ["#27385e", "#1d2c4e", "#152340", "#101b33", "#0b1430"], e: [0, 3, 9, 18, 40] },
    water: { near: "#16294a", mid: "#122340", far: "#1d2c4e", crest: "#5a739c", trough: "#0a1528", glint: "#c9d8ff", shade: [0.32, 0.38, 0.6] },
    cloud: { lit: "#8ea2c8", mid: "#5f7398", shade: "#3c4a6c" },
    bounce: [0.01, 0.01, 0.03],
    sat: 0.9,
  },
  interior_warm: {
    sky: { c: ["#3a3028", "#3a3028", "#332a24", "#2c2420", "#241e1c"], e: [0, 3, 9, 18, 40] },
    water: { near: "#3a4a48", mid: "#2e3c3e", far: "#2a3438", crest: "#8fa09a", trough: "#1c2628", glint: "#ffd9a8", shade: [0.4, 0.36, 0.34] },
    cloud: { lit: "#d8c4a4", mid: "#b19a7e", shade: "#8c7862" },
    bounce: [0.05, 0.03, 0.02],
    sat: 1.0,
  },
};

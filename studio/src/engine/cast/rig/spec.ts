// One character as data: head geometry, proportions, face measures and palette. This is the single source of
// truth for "how tall is this character" — painters read it, episodes never hard-code a proportion, and canon
// can point a returning character at the same spec. Pure math (no DOM) so it runs in the rig tests.
import { rad, rnd, mul, SU, type P2 } from "./math2d";
import type { Outfit } from "../toon";
export { SU };

export type Build = "adult" | "stout" | "kid";

/** base measurements per build: head radius, torso/legs in head-heights, torso width in head widths */
export const BUILD: Record<Build, { a: number; torso: number; legs: number; tw: number }> = {
  adult: { a: 118, torso: 1.1, legs: 1.4, tw: 0.8 },
  stout: { a: 118, torso: 1.15, legs: 1.32, tw: 0.92 },
  kid: { a: 112, torso: 0.85, legs: 1.0, tw: 0.72 },
};

export type Blob = { a: number; b: number; nTop: number; nBot: number; egg: number; asym: number; rot: number; noise: number; seed: number };

/** superellipse "bean": separate crown / jaw exponents, egg taper (neg = narrower chin), one-side bulge, soft noise.
 *  Points run right -> down -> left -> up (clockwise on screen). */
export const blobPts = (cx: number, cy: number, B: Blob, n = 72): P2[] => {
  const ph = [rnd(B.seed, 11), rnd(B.seed, 12), rnd(B.seed, 13)].map((v) => v * Math.PI * 2);
  const pts: P2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), e = 2 / (s < 0 ? B.nTop : B.nBot);
    let X = Math.sign(c) * Math.abs(c) ** e;
    const Y = Math.sign(s) * Math.abs(s) ** e;
    X *= (1 + B.egg * Y) * (1 + B.asym * Math.sign(X));
    const r = 1 + B.noise * (Math.cos(2 * t + ph[0]) + 0.7 * Math.cos(3 * t + ph[1]) + 0.5 * Math.cos(4 * t + ph[2]));
    const x = B.a * X * r, y = B.b * Y * r;
    pts.push([cx + x * Math.cos(B.rot) - y * Math.sin(B.rot), cy + x * Math.sin(B.rot) + y * Math.cos(B.rot)]);
  }
  return pts;
};

/** measured head: H/W 0.94, slightly pointed crown (1.75), fuller jaw (2.3), chin taper -0.12, 8 % bulge to the facing side */
export const headBlob = (seed: number, a = 118, facing = 0): Blob => ({
  a, b: a * (0.94 + 0.08 * (rnd(seed, 1) - 0.5)),
  nTop: 1.75 + 0.3 * (rnd(seed, 2) - 0.5), nBot: 2.3 + 0.3 * (rnd(seed, 3) - 0.5),
  egg: -0.12 + 0.06 * (rnd(seed, 4) - 0.5),
  asym: (0.06 + 0.04 * rnd(seed, 5)) * (facing || (rnd(seed, 6) < 0.5 ? -1 : 1)),
  rot: rad(8 * (rnd(seed, 7) - 0.5)), noise: 0.008, seed,
});

/** thickest outline direction: away from the light, pulled toward the ground (64 deg measured for upper-left light) */
export const thickAngle = (light: number) => Math.atan2(-Math.sin(light) + 0.8, -Math.cos(light));
export const DEF_LIGHT = rad(-120);

/** The reusable character record. `seed` drives the measured per-character head spread. */
export type CharacterSpec = {
  id: string;
  build: Build;
  seed: number;
  /** head radius in design units (headBlob's `a`) */
  headA: number;
  /** torso and legs in head-heights */
  torso: number;
  legs: number;
  /** torso width as a fraction of head width */
  torsoW: number;
  skin: string;
  /** body height in design units (soles to crown), derived by measures() */
  height: number;
};

export type Measures = {
  headW: number; headH: number; torsoLen: number; legLen: number; torsoW: number; height: number; hipInset: number;
};

/** Derive every absolute proportion once. The values reproduce characters.md 2.1 for the three built-in builds. */
export const measures = (spec: CharacterSpec): Measures => {
  const H = headBlob(spec.seed, spec.headA, 0);
  return {
    headW: 2 * H.a,
    headH: 2 * H.b,
    torsoLen: spec.torso * 2 * H.b,
    legLen: spec.legs * 2 * H.b,
    torsoW: spec.torsoW * 2 * H.a,
    height: (1 + spec.torso + spec.legs) * 2 * H.b,
    hipInset: 0.12 * 2 * H.b,
  };
};

export const makeSpec = (o: Outfit, seed = 1, id = ""): CharacterSpec => {
  const build = o.build ?? "adult", B = BUILD[build];
  return {
    id, build, seed, headA: B.a, torso: B.torso, legs: B.legs, torsoW: B.tw,
    skin: o.skin ?? "#ffe2c2", height: measures({ id, build, seed, headA: B.a, torso: B.torso, legs: B.legs, torsoW: B.tw, skin: o.skin ?? "#ffe2c2", height: 0 }).height,
  };
};

/** palette helpers kept next to the spec so a painter never rolls its own ratios */
export const skinShadow = (skin: string) => mul(skin, [0.96, 0.86, 0.84]);

/** debug sheet: draw front / side / 3-4 with joint dots and the measured table */
export const specSheet = (spec: CharacterSpec): string => {
  const m = measures(spec);
  return `spec ${spec.id}: build=${spec.build} headA=${spec.headA} torso=${spec.torso} legs=${spec.legs} torsoW=${spec.torsoW} skin=${spec.skin} height=${m.height}`;
};

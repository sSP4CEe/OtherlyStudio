// Pose: a frame of body state resolved into drawable joints. Two builders keep the shipped film exact:
// `frontFrame` / `sideFrame` reproduce the measured front and profile constructions to the unit, while the
// generic `Pose` + clips/mixer/skeleton give new work continuous, blendable, target-driven motion.
import { rad, clamp, lerp2, curve, mix, shade, rnd, INK, type P2 } from "./math2d";
import { BUILD, headBlob, blobPts, thickAngle, DEF_LIGHT, type Blob } from "./spec";
import type { Expr } from "./face";
import type { Outfit } from "../toon";

export type FrontMode = "march" | "stroll" | "stand" | "sit" | "fall";
export type SideMode = "march" | "stand" | "swing" | "push";
/** held prop; for the hammer the number is the strike 0 (raised) .. 1 (struck) */
export type Prop = null | "icecream" | "shako" | ["hammer", number];

export type FrontOpts = {
  phase?: number; expr?: Expr; mode?: FrontMode; look?: number; blink?: boolean | number; lift?: number;
  prop?: Prop; tilt?: number; headTilt?: number; wave?: number;
  /** canvas angle the key light comes FROM (painted crescent + thick outline side) */
  light?: number; facing?: -1 | 0 | 1; seed?: number;
};

export type SideOpts = {
  phase?: number; expr?: Expr; mode?: SideMode; blink?: boolean | number; stomp?: number; pose?: number;
  /** step length as a multiple of 0.8 m (370 units): matches 1.6 m/s at 2 steps/s; scale by the view's foreshortening */
  stride?: number; light?: number; seed?: number;
  /** push mode: where the hands land at pose 1, in final canvas units (e.g. the swing kid's back) */
  hand?: [number, number];
};

// ---------------- generic pose (clips, mixer, new episodes) ----------------
export type LegPose = { ankle: P2; footAngle: number; kneeDir: number; plant: boolean; weight: number };
export type ArmPose = { hand: P2 | null; elbowDir: number; reach: number; grip: string | null };

export type Pose = {
  /** root position in design units (x, y) and uniform scale; facing -1..1 drives the projection */
  x: number; y: number; scale: number; roll: number; facing: number;
  hips: { x: number; y: number; angle: number };
  chest: { angle: number; lift: number; twist: number };
  head: { yaw: number; pitch: number; tilt: number };
  legs: [LegPose, LegPose];
  arms: [ArmPose, ArmPose];
  face: import("./face").FacePose;
  extras: { blink: number; sweat: boolean; kick: number; lean: number; airborne: boolean };
};

export const restLeg = (): LegPose => ({ ankle: [300, 971], footAngle: 0, kneeDir: 0, plant: true, weight: 0.5 });
export const restArm = (): ArmPose => ({ hand: null, elbowDir: 0, reach: 0, grip: null });

export const restPose = (face: import("./face").FacePose): Pose => ({
  x: 300, y: 0, scale: 1, roll: 0, facing: 0,
  hips: { x: 300, y: 0, angle: 0 }, chest: { angle: 0, lift: 0, twist: 0 }, head: { yaw: 0, pitch: 0, tilt: 0 },
  legs: [restLeg(), restLeg()], arms: [restArm(), restArm()], face, extras: { blink: 0, sweat: false, kick: 0, lean: 0, airborne: false },
});

/** partial update: copy pose fields only where source is not undefined */
export const partial = (target: Pose, updates: Partial<Pose>): Pose => ({
  ...target,
  ...updates,
  hips: { ...target.hips, ...(updates.hips || {}) },
  chest: { ...target.chest, ...(updates.chest || {}) },
  head: { ...target.head, ...(updates.head || {}) },
  legs: updates.legs ? updates.legs : target.legs,
  arms: updates.arms ? updates.arms : target.arms,
  face: updates.face ? updates.face : target.face,
  extras: { ...target.extras, ...(updates.extras || {}) },
});

// ---------------- legacy front frame (exact construction) ----------------
export type ArmDraw = { pts: [P2, P2, P2]; front: boolean };
export type LegDraw = { pts: P2[]; fa: P2; fb: P2; w: number; col: string; footCol: string };

export type FrontFrame = {
  mode: FrontMode; expr: Expr; look: number; facing: -1 | 0 | 1; headTilt: number; prop: Prop;
  seed: number; light: number; skin: string; u: number; W: number; HH: number;
  H: Blob; hc: number; chin: number; hipY: number; crown: number; sole: number; torsoBot: number;
  thick: number; ow: number; legW: number; footW: number; legCol: string; armCol: string;
  legs: LegDraw[]; A: number; dress: boolean; dp: P2[] | null; sp: P2[] | null;
  tp: P2[]; tcx: number; tcy: number; Ta: number; R0: P2; R1: P2; rifle: boolean; arms: ArmDraw[]; lid: number;
};

const lidOf = (b: boolean | number | undefined) => (b === true ? 1 : Number(b) || 0);

export const frontFrame = (o: Outfit, opts: FrontOpts): FrontFrame => {
  const { phase = 0, expr = "neutral", mode = "march", look = 0, blink = false, lift = 60, prop = null, tilt = 0, headTilt = 0, wave,
    light = DEF_LIGHT, facing = 0, seed = 1 } = opts;
  const Bd = BUILD[o.build ?? "adult"], skin = o.skin ?? "#ffe2c2", two = Math.PI * 2, lid = lidOf(blink);
  const H = headBlob(seed, Bd.a, facing), W = 2 * H.a, HH = 2 * H.b, u = W / 100;
  const tall = (1 + Bd.torso + Bd.legs) * HH, sole = 975;
  // body bob 5 % (march) / 3 % (stroll) of the height, lowest at contact (phase 0 and 0.5)
  const bob = mode === "march" ? 0.025 * tall * Math.cos(2 * two * phase) : mode === "stroll" ? 0.015 * tall * Math.cos(2 * two * phase) : 0;
  const torsoBot = mode === "sit" ? sole - 0.2 * HH : sole - Bd.legs * HH + bob;
  const chin = torsoBot - Bd.torso * HH, hc = chin - H.b, crown = hc - H.b, hipY = torsoBot - 0.12 * HH;
  const thick = thickAngle(light), ow = 5 * u;
  const legCol = mix(o.pants, INK, 0.55), armCol = mix(o.jacket, INK, 0.5), footCol = o.boots;
  const legW = 5.8 * u, footW = 7.5 * u;
  const legs: LegDraw[] = [];
  if (mode === "sit") {
    for (const side of [-1, 1]) {
      const h: P2 = [300 + side * 15 * u, hipY], k: P2 = [300 + side * 36 * u, hipY + 0.2 * HH], f: P2 = [300 + side * 44 * u, sole - 8 * u];
      legs.push({ pts: curve(h, k, f), fa: [f[0] - side * 2 * u, f[1]], fb: [f[0] + side * 12 * u, f[1] - 5 * u], w: legW, col: legCol, footCol });
    }
  } else if (mode === "fall") {
    const ls: [P2, P2, P2][] = [
      [[300 - 15 * u, hipY], [300 - 46 * u, hipY + 0.5 * HH], [300 - 70 * u, hipY + 0.72 * HH]],
      [[300 + 15 * u, hipY], [300 + 50 * u, hipY + 0.45 * HH], [300 + 76 * u, hipY + 0.22 * HH]],
    ];
    ls.forEach(([h, k, f], i) => legs.push({ pts: curve(h, k, f), fa: f, fb: [f[0] + (i ? 14 : -14) * u, f[1] + (i ? -6 : 4) * u], w: legW, col: legCol, footCol }));
  } else if (o.dress) {
    for (const side of [-1, 1]) {
      const fx = 300 + side * 12 * u, fy = sole - 4 * u;
      legs.push({ pts: [[fx, sole - 0.4 * HH], [fx + side * u, fy]], fa: [fx - side * 3 * u, fy], fb: [fx + side * 12 * u, fy + u], w: legW, col: legCol, footCol });
    }
  } else {
    const L = mode === "march" ? lift * 1.25 : mode === "stroll" ? lift * 0.55 : 0;
    for (const [side, ph] of [[-1, 0], [1, 0.5]] as const) {
      const up = Math.max(0, Math.sin(two * (phase + ph))) * L;
      const hx = 300 + side * 15 * u, fx = 300 + side * 22 * u, fy = sole - 4 * u - up;
      const k: P2 = [(hx + fx) / 2 + side * (1.5 * u + up * 0.16), (hipY + fy) / 2 - up * 0.08];
      legs.push({ pts: curve([hx, hipY], k, [fx, fy]), fa: [fx - side * 3 * u, fy], fb: [fx + side * 13 * u, fy + 0.5 * u], w: legW, col: legCol, footCol });
    }
  }
  const sway = mode === "march" ? 1.6 * Math.sin(two * phase) : mode === "stroll" ? 1.0 * Math.sin(two * phase) : 0;
  const A = tilt + sway;
  const dress = !!o.dress && mode !== "sit" && mode !== "fall";
  const T: Blob = { a: ((Bd.tw / 2) * W) / 1.06, b: 0.5 * (torsoBot - (chin - 0.25 * HH)), nTop: 2.2, nBot: 2.6, egg: o.build === "stout" ? 0.17 : 0.12,
    asym: 0.04 * facing, rot: 0, noise: 0.006, seed: seed + 7 };
  const tcx = 300 + 3 * u * facing, tcy = torsoBot - T.b, tp = blobPts(tcx, tcy, T);
  const sh = (side: number): P2 => [tcx + side * 0.85 * T.a, chin + 0.12 * HH];
  const hang = (side: number, fwd: number): [P2, P2, P2] => {
    const S = sh(side), ex = tcx + side * (1.12 * T.a + 4 * u);
    const hx = ex + side * 3 * u - side * 6 * u * Math.max(0, fwd) + side * 4 * u * Math.max(0, -fwd);
    return [S, [ex, S[1] + 0.48 * HH], [hx, chin + 1.04 * HH - Math.abs(fwd) * 9 * u]];
  };
  const sw = mode === "march" || mode === "stroll" ? Math.sin(two * phase) : 0;
  const R0: P2 = [300 + 47 * u, torsoBot + 0.12 * HH], R1: P2 = [300 + 64 * u, crown - 0.32 * HH];
  const rifle = !!o.rifle && (mode === "march" || mode === "stand" || mode === "stroll");
  const arms: ArmDraw[] = [];
  if (mode === "sit") for (const side of [-1, 1]) arms.push({ pts: [sh(side), [tcx + side * (1.1 * T.a + 6 * u), sh(side)[1] + 0.4 * HH], [tcx + side * (1.2 * T.a + 10 * u), torsoBot + 0.04 * HH]], front: false });
  else if (mode === "fall") for (const side of [-1, 1]) arms.push({ pts: [sh(side), [tcx + side * (1.15 * T.a + 12 * u), sh(side)[1] - 0.25 * HH], [tcx + side * (1.3 * T.a + 24 * u), sh(side)[1] - 0.68 * HH]], front: false });
  else {
    arms.push({ pts: prop === "shako" ? hang(-1, 0) : hang(-1, -sw), front: false });
    if (rifle) {
      const G = lerp2(R0, R1, 0.1);
      arms.push({ pts: [sh(1), [tcx + 1.12 * T.a + 5 * u, sh(1)[1] + 0.45 * HH], G], front: false });
    } else if (wave !== undefined) {
      const S = sh(1);
      arms.push({ pts: [S, [tcx + 1.1 * T.a + 10 * u + 3 * u * wave, S[1] - 0.22 * HH], [tcx + 1.18 * T.a + 16 * u + 12 * u * wave, S[1] - 0.6 * HH]], front: false });
    } else if (prop === "icecream") {
      const S = sh(1);
      arms.push({ pts: [S, [tcx + 1.05 * T.a + 4 * u, S[1] + 0.45 * HH], [tcx + 0.5 * T.a, S[1] + 0.4 * HH]], front: true });
    } else if (Array.isArray(prop)) {
      const S = sh(1), k = clamp(prop[1], 0, 1);
      const E = lerp2([tcx + 1.1 * T.a + 10 * u, S[1] - 0.15 * HH], [tcx + 1.2 * T.a + 10 * u, S[1] + 0.3 * HH], k);
      const Hd = lerp2([tcx + 1.15 * T.a + 14 * u, S[1] - 0.55 * HH], [tcx + 1.45 * T.a + 22 * u, S[1] + 0.35 * HH], k);
      arms.push({ pts: [S, E, Hd], front: true });
    } else arms.push({ pts: hang(1, sw), front: false });
  }
  let dp: P2[] | null = null, sp: P2[] | null = null;
  if (dress) {
    const D: Blob = { a: 0.5 * W * 0.98, b: 0.5 * ((sole - 0.35 * HH) - (chin - 0.2 * HH)), nTop: 2.0, nBot: 3.0, egg: 0.35, asym: 0.03 * facing, rot: 0, noise: 0.006, seed: seed + 9 };
    dp = blobPts(300, sole - 0.35 * HH - D.b, D);
    const Sw: Blob = { a: 0.37 * W, b: 0.3 * HH, nTop: 2.2, nBot: 2.4, egg: 0.1, asym: 0, rot: 0, noise: 0.006, seed: seed + 8 };
    sp = blobPts(300, chin + 0.12 * HH, Sw);
  }
  return { mode, expr, look, facing, headTilt, prop, seed, light, skin, u, W, HH, H, hc, chin, hipY, crown, sole, torsoBot,
    thick, ow, legW, footW, legCol, armCol, legs, A, dress, dp, sp, tp, tcx, tcy, Ta: T.a, R0, R1, rifle, arms, lid };
};

// ---------------- legacy side frame (exact construction) ----------------
export type SideLeg = { pts: [P2, P2, P2]; fa: P2; fb: P2; col: string; footCol: string; w: number };
export type SideFrame = {
  mode: SideMode; expr: Expr; lean: number; seed: number; light: number; skin: string; u: number; W: number; HH: number;
  H: Blob; hc: number; chin: number; crown: number; hipY: number; torsoBot: number; thick: number; ow: number;
  legs: SideLeg[]; tp: P2[]; tcx: number; tcy: number; Ta: number; B0: P2; B1: P2; rifle: boolean;
  near: [P2, P2, P2]; far: [P2, P2, P2] | null; armW: number; armCol: string; farArm: string; nearCol: string; farCol: string;
  footCol: string; lid: number;
};

/** two-bone leg, knee bending forward (+x) */
export const ik = (hip: P2, ank: P2, l1: number, l2: number): P2 => {
  const dx = ank[0] - hip[0], dy = ank[1] - hip[1], d = clamp(Math.hypot(dx, dy), 1, l1 + l2 - 0.01);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), k = Math.atan2(dy, dx) - A;
  return [hip[0] + l1 * Math.cos(k), hip[1] + l1 * Math.sin(k)];
};

/** hip height of the seated kid in `swing` mode (design units); swingKid seats the torso bottom on the plank */
export const SWING_HIP = 733;

export const sideFrame = (o: Outfit, opts: SideOpts): SideFrame => {
  const { phase = 0, expr = "neutral", mode = "march", blink = false, stomp = 1, pose = 0, stride = 1, light = DEF_LIGHT, seed = 1 } = opts;
  const Bd = BUILD[o.build ?? "adult"], skin = o.skin ?? "#ffe2c2", two = Math.PI * 2, lid = lidOf(blink);
  const H: Blob = { ...headBlob(seed, Bd.a, 1), asym: 0.12, rot: rad(3 + 3 * (rnd(seed, 7) - 0.5)) };
  const W = 2 * H.a, HH = 2 * H.b, u = W / 100, sole = 975, ankY = sole - 4 * u;
  const thick = thickAngle(light), ow = 5 * u;
  const legLen = (Bd.legs + 0.12) * HH - 4 * u, l1 = legLen / 2, l2 = legLen / 2;
  const nearCol = mix(o.pants, INK, 0.55), farCol = mix(o.pants, INK, 0.75), footCol = o.boots;
  type LegS = { ank: P2; pitch: number; near: boolean };
  const legs0: LegS[] = [];
  let hipY = ankY - legLen * 0.995, lean = 0, nearFwd = 0;
  if (mode === "march") {
    const S = 370 * stride, liftH = Math.max(22, 40 + 70 * (stomp - 1));
    const st = (ph: number) => {
      const c = (((phase + ph) % 1) + 1) % 1;
      if (c < 0.5) { const s = c / 0.5; return { x: S / 2 - S * s, h: 0, stance: true, s }; }
      const s = (c - 0.5) / 0.5;
      return { x: -S / 2 + S * s - (S / Math.PI) * Math.sin(2 * Math.PI * s), h: liftH * Math.sin(Math.PI * s), stance: false, s };
    };
    const nL = st(0), fL = st(0.5), stance = nL.stance ? nL : fL;
    const Leff = legLen * (1 - 0.035 * Math.sin(Math.PI * stance.s));
    hipY = ankY - Math.sqrt(Math.max(1, Leff * Leff - stance.x * stance.x));
    for (const [L, near] of [[fL, false], [nL, true]] as const)
      legs0.push({ ank: [300 + L.x, ankY - L.h], pitch: L.stance ? 0 : rad(35 * Math.sin(Math.PI * L.s) * (1 - 1.6 * L.s)), near });
    lean = 4 + 3 * Math.cos(2 * two * phase);
    nearFwd = nL.x / (S / 2);
  } else if (mode === "push") {
    hipY = ankY - 0.87 * legLen;
    legs0.push({ ank: [300 - 0.5 * legLen, ankY], pitch: rad(-8), near: false }, { ank: [300 + 0.32 * legLen, ankY], pitch: 0, near: true });
    lean = 14 * pose;
  } else if (mode === "swing") {
    hipY = SWING_HIP;
    const a = rad(60 * pose);
    for (const [dx, near] of [[-6, false], [0, true]] as const) {
      const knee: P2 = [300 + l1 * 0.98 + dx * u, hipY + 6 * u];
      legs0.push({ ank: [knee[0] + l2 * Math.sin(a), knee[1] + l2 * Math.cos(a)], pitch: -a * 0.5, near });
    }
  } else {
    legs0.push({ ank: [300 - 4 * u, ankY], pitch: 0, near: false }, { ank: [300 + 4 * u, ankY], pitch: 0, near: true });
  }
  const torsoBot = hipY + 0.12 * HH, chin = torsoBot - Bd.torso * HH, hc = chin - H.b, crown = hc - H.b, hip: P2 = [300, hipY];
  const legs: SideLeg[] = legs0.map((L) => {
    const knee = mode === "swing" ? ([300 + l1 * 0.98 + (L.near ? 0 : -6 * u), hipY + 6 * u] as P2) : ik(hip, L.ank, l1, l2);
    const hp0: P2 = [300 + (L.near ? 0 : -5 * u), hipY];
    const c = Math.cos(L.pitch), s = Math.sin(L.pitch);
    return {
      pts: [hp0, knee, L.ank], w: 5.8 * u, col: L.near ? nearCol : farCol,
      fa: [L.ank[0] - 3 * u * c, L.ank[1] - 3 * u * s], fb: [L.ank[0] + 13 * u * c, L.ank[1] + 13 * u * s + 0.5 * u],
      footCol: L.near ? footCol : footCol === INK ? INK : shade(footCol, 0.82),
    };
  });
  const T: Blob = { a: (o.build === "stout" ? 0.36 : 0.31) * W, b: 0.5 * (torsoBot - (chin - 0.25 * HH)), nTop: 2.2, nBot: 2.5, egg: 0.1, asym: 0.06,
    rot: 0, noise: 0.006, seed: seed + 7 };
  const tcx = 300 + 2 * u, tcy = torsoBot - T.b, tp = blobPts(tcx, tcy, T);
  const armCol = mix(o.jacket, INK, 0.5), farArm = mix(o.jacket, INK, 0.68);
  const S: P2 = [tcx + 0.05 * T.a, chin + 0.14 * HH], aLen = 0.95 * HH;
  const swingArm = (ang: number): [P2, P2, P2] => {
    const e: P2 = [S[0] + Math.sin(ang) * aLen * 0.5, S[1] + Math.cos(ang) * aLen * 0.5], a2 = ang + rad(16) * Math.sign(ang || 1);
    return [S, e, [e[0] + Math.sin(a2) * aLen * 0.5, e[1] + Math.cos(a2) * aLen * 0.5]];
  };
  const rifle = !!o.rifle && (mode === "march" || mode === "stand");
  const B0: P2 = [tcx + 0.72 * T.a, chin + 0.58 * HH], B1: P2 = [tcx - 0.95 * T.a - 22 * u, crown - 0.4 * HH];
  let near: [P2, P2, P2], far: [P2, P2, P2] | null;
  if (mode === "swing") { near = [S, [S[0] + 12 * u, S[1] - 0.16 * HH], [300 + 6 * u, chin - 0.3 * HH]]; far = [S, [S[0] + 8 * u, S[1] - 0.18 * HH], [300 + 2 * u, chin - 0.36 * HH]]; }
  else if (mode === "push") {
    const reach = 0.55 * HH + 0.45 * HH * pose;
    let hN: P2 = [S[0] + reach, S[1] + 0.06 * HH];
    if (opts.hand) {
      const th = -rad(lean), dx = opts.hand[0] - 300, dy = opts.hand[1] - hipY;
      const tg: P2 = [300 + dx * Math.cos(th) - dy * Math.sin(th), hipY + dx * Math.sin(th) + dy * Math.cos(th)];
      hN = [hN[0] + (tg[0] - hN[0]) * pose, hN[1] + (tg[1] - hN[1]) * pose];
    }
    near = [S, [(S[0] + hN[0]) / 2, (S[1] + hN[1]) / 2 + 0.06 * HH], hN];
    far = [S, [(S[0] + hN[0]) / 2 - 4 * u, (S[1] + hN[1]) / 2 - 0.02 * HH], [hN[0] - 6 * u, hN[1] - 0.08 * HH]];
  } else if (rifle) { near = [S, [S[0] - 4 * u, S[1] + 0.42 * HH], B0]; far = mode === "march" ? swingArm(rad(30) * nearFwd) : swingArm(0); }
  else { near = swingArm(rad(-30) * nearFwd); far = mode === "march" ? swingArm(rad(30) * nearFwd) : null; }
  return { mode, expr, lean, seed, light, skin, u, W, HH, H, hc, chin, crown, hipY, torsoBot, thick, ow, legs, tp, tcx, tcy, Ta: T.a, B0, B1, rifle,
    near, far, armW: 5.2 * u, armCol, farArm, nearCol, farCol, footCol, lid };
};
// Torso, wardrobe and layer order. Two painters share the same primitives; `paintFront`/`paintSide` are the
// legacy constructions with their arithmetic moved out of the old monolith unchanged.
import { INK, SH_CLOTH, SH_SKIN, clamp, lerp2, mul, rad, rotAbout, rotPts, curve, type P2 } from "../math2d";
import { blobPts } from "../spec";
import type { Outfit } from "../../toon";
import type { Expr } from "../face";
import type { Pen as RigPen } from "./pen";
import type { Pen as ToonPen } from "../../toon";
// Use ToonPen for compatibility with legacy adapters
type Pen = ToonPen;
import { footStroke } from "./limbs";
import { hatBehind, hatOn } from "./head";
import { faceFront, faceSide, faceView } from "./faceDraw";
import type { FacePose } from "../face";

// Type definitions for the legacy frame data structures
type ArmDraw = { pts: [P2, P2, P2]; front: boolean };
type LegDraw = { pts: P2[]; fa: P2; fb: P2; w: number; col: string; footCol: string };

type FrontFrame = {
  mode: string; expr: Expr; look: number; facing: -1 | 0 | 1; headTilt: number; prop: any;
  seed: number; light: number; skin: string; u: number; W: number; HH: number;
  H: any; hc: number; chin: number; hipY: number; crown: number; sole: number; torsoBot: number;
  thick: number; ow: number; legW: number; footW: number; legCol: string; armCol: string;
  legs: LegDraw[]; A: number; dress: boolean; dp: P2[] | null; sp: P2[] | null;
  tp: P2[]; tcx: number; tcy: number; Ta: number; R0: P2; R1: P2; rifle: boolean; arms: ArmDraw[]; lid: number;
  // View parameters for Phase 4
  viewYaw?: number; viewFacing?: number;
};

type SideLeg = { pts: [P2, P2, P2]; fa: P2; fb: P2; col: string; footCol: string; w: number };
type SideFrame = {
  mode: string; expr: Expr; lean: number; seed: number; light: number; skin: string; u: number; W: number; HH: number;
  H: any; hc: number; chin: number; crown: number; hipY: number; torsoBot: number; thick: number; ow: number;
  legs: SideLeg[]; tp: P2[]; tcx: number; tcy: number; Ta: number; B0: P2; B1: P2; rifle: boolean;
  near: [P2, P2, P2]; far: [P2, P2, P2] | null; armW: number; armCol: string; farArm: string; nearCol: string; farCol: string;
  footCol: string; lid: number;
  // View parameters for Phase 4
  viewYaw?: number; viewFacing?: number;
};

const drawArmFront = (p: Pen, a: ArmDraw, u: number, armCol: string) => {
  p.stroke(curve(a.pts[0], a.pts[1], a.pts[2]), 5.2 * u, armCol);
  p.dot(a.pts[2][0], a.pts[2][1], 5.5 * u);
};

const shadeJacket = (o: Outfit, k: number) => {
  const n = parseInt(o.jacket.slice(1), 16);
  const ch = (v: number) => Math.min(255, Math.round(v * k)).toString(16).padStart(2, "0");
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
};

export const paintFront = (p: Pen, o: Outfit, F: FrontFrame) => {
  const u = F.u, HH = F.HH, chin = F.chin, hipY = F.hipY, torsoBot = F.torsoBot, A = F.A;
  // ---- legs + feet (not rotated) ----
  p.rot = null;
  for (const L of F.legs) { p.stroke(L.pts, L.w, L.col); footStroke(p, L.fa, L.fb, F.footW, L.footCol); }
  // ---- upper body: rotates about the hips ----
  p.rot = A ? [rad(A), 300, hipY] : null;
  // behind the body: rifle, sword, arms
  if (F.rifle) {
    p.band([F.R0, F.R1], "#7a4b2a", 5 * u, 1.5 * u, "round");
    p.band([lerp2(F.R0, F.R1, 0.6), F.R1], "#8d949c", 2.4 * u, 1.2 * u, "round");
  }
  if (o.sword && F.mode !== "sit") {
    const s0: P2 = [F.tcx - 0.75 * F.Ta, torsoBot - 0.2 * HH];
    p.band([s0, [s0[0] - Math.sin(rad(25)) * 0.8 * HH, s0[1] + Math.cos(rad(25)) * 0.8 * HH]], "#c9ccd2", 3 * u, 1.2 * u, "round");
  }
  for (const a of F.arms) if (!a.front) drawArmFront(p, a, u, F.armCol);
  // torso / dress: shaded fill -> clothing clipped to it -> thick-thin ink ring
  if (F.dress) {
    const dp = F.dp!;
    p.gradFill(dp, o.dress!, mul(o.dress!, SH_CLOTH), F.light);
    p.inkRing(dp, F.ow, F.thick);
    const sp = F.sp!;
    p.gradFill(sp, o.jacket, mul(o.jacket, SH_CLOTH), F.light);
    p.inkRing(sp, F.ow * 0.9, F.thick);
  } else {
    const tp = F.tp, T = F.Ta;
    p.gradFill(tp, o.jacket, mul(o.jacket, SH_CLOTH), F.light);
    p.clip(tp, () => {
      if (o.belt) {
        for (const s of [-1, 1]) p.band([[F.tcx - s * 0.75 * T, chin - 0.05 * HH], [F.tcx + s * 0.8 * T, torsoBot - 0.1 * HH]], o.belt!, 5.5 * u, 1.8 * u);
        const xc = F.tcx + 0.025 * T, yc = chin - 0.05 * HH + (torsoBot - 0.1 * HH - (chin - 0.05 * HH)) * (0.75 / 1.55);
        p.poly([[xc - 3.5 * u, yc - 3.5 * u], [xc + 3.5 * u, yc - 3.5 * u], [xc + 3.5 * u, yc + 3.5 * u], [xc - 3.5 * u, yc + 3.5 * u]], "#d9dde0", 1.5 * u);
      }
      if (o.sash) p.band([[F.tcx - 1.3 * T, torsoBot - 0.32 * HH], [F.tcx + 1.3 * T, torsoBot - 0.32 * HH]], o.sash, 0.13 * HH, 1.8 * u);
      for (let i = 0; i < 4; i++) {
        const y = chin + 0.12 * HH + i * 0.2 * HH;
        if (o.sash && Math.abs(y - (torsoBot - 0.32 * HH)) < 0.08 * HH) continue;
        p.dot(F.tcx + 2 * u * F.facing, y, 2.2 * u + 0.8 * u, INK); p.dot(F.tcx + 2 * u * F.facing, y, 2.2 * u, o.buttons ?? shadeJacket(o, 0.7));
      }
    });
    if (o.sash) { const s = F.facing || 1; p.poly([[F.tcx + s * 0.55 * T, torsoBot - 0.3 * HH], [F.tcx + s * 0.75 * T, torsoBot + 0.05 * HH], [F.tcx + s * 0.45 * T, torsoBot + 0.02 * HH]], o.sash, 1.6 * u); }
    p.inkRing(tp, F.ow, F.thick);
  }
  // in front of the body: hands holding props
  for (const a of F.arms) if (a.front) {
    drawArmFront(p, a, u, F.armCol);
    const [hx, hy] = a.pts[2];
    if (F.prop === "icecream") {
      p.poly([[hx - 8 * u, hy - 12 * u], [hx + 8 * u, hy - 12 * u], [hx, hy + 7 * u]], "#e0a35a", 1.8 * u);
      p.ell(hx, hy - 19 * u, 11 * u, 10 * u, "#f7c6d9", 2.2 * u);
      p.dot(hx, hy, 5.5 * u);
    } else if (Array.isArray(F.prop)) {
      const ang = rad(-70 + 105 * clamp(F.prop[1], 0, 1));
      const Rh = (pts: P2[]) => rotPts(pts, ang, hx, hy);
      p.band(Rh([[hx, hy + 12 * u], [hx, hy - 44 * u]]), "#8a5a34", 5 * u, 1.5 * u, "round");
      p.poly(Rh([[hx - 12 * u, hy - 58 * u], [hx + 20 * u, hy - 58 * u], [hx + 20 * u, hy - 42 * u], [hx - 12 * u, hy - 42 * u]]), "#7d848c", 2.2 * u);
      p.dot(hx, hy, 5.5 * u);
    }
  }
  if (F.prop === "shako") { // carried by the left hand
    const [hx, hy] = F.arms[0].pts[2];
    p.poly([[hx - 14 * u, hy + 3 * u], [hx + 14 * u, hy + 3 * u], [hx + 16 * u, hy + 30 * u], [hx - 16 * u, hy + 30 * u]], "#3a3d47", 2.2 * u);
    p.ell(hx, hy + 31 * u, 3.5 * u, 3.5 * u, "#2b7a4b", 1.5 * u);
    p.dot(hx, hy, 5.5 * u);
  }
  // ---- head: rotates with the body, plus its own tilt about the chin ----
  const Ah = A + F.headTilt, [cpx, cpy] = rotAbout([300, chin], rad(A), [300, hipY]);
  p.rot = Ah ? [rad(Ah), 300, chin, cpx - 300, cpy - chin] : null;
  hatBehind(p, o, F.H, 300, F.hc, F.light, F.thick, F.ow, false);
  const hp = blobPts(300, F.hc, F.H);
  p.shadedFill(hp, F.skin, mul(F.skin, SH_SKIN), F.light, F.H.a);
  p.inkRing(hp, F.ow, F.thick);
  hatOn(p, o, hp, F.H, 300, F.hc, F.light, F.seed, F.facing, false);
  const brim = !!o.hat && o.hat !== "hair" && o.hat !== "bonnet" && o.hat !== "cap";
  // Use legacy faceFront for exact parity at front view, new drawFace only for 3/4 views
  // Front view threshold: use legacy when |yaw| < 10° (π/18) to maintain parity
  const isFrontView = Math.abs(F.viewYaw ?? 0) < Math.PI / 18;
  if (isFrontView) {
    faceFront(p, 300, F.hc, F.W, F.expr, F.facing, F.look, F.lid, brim, F.skin, o.moustache, o.build === "stout");
  } else {
    // Build FacePose from legacy frame data
    const facePose: FacePose = {
      expr: F.expr,
      eye: ["lid", "lid"] as const,
      mouth: "dash",
      brow: [0, -1],
      lid: F.lid, lidL: F.lid, lidR: F.lid,
      look: F.look, gazeX: 0, gazeY: 0, browLift: 0, smile: 0, jaw: 0,
      sweat: false, tongue: false, mood: "neutral" as const,
    };
    faceView(p, 300, F.hc, F.W, facePose, { yaw: F.viewYaw ?? 0, facing: F.facing }, brim, F.skin, o.moustache, o.build === "stout");
  }
  p.rot = null;
};

export const paintSide = (p: Pen, o: Outfit, F: SideFrame) => {
  const u = F.u, HH = F.HH, chin = F.chin, hipY = F.hipY, torsoBot = F.torsoBot;
  p.rot = null;
  for (const L of F.legs) {
    p.stroke(L.pts as P2[], L.w, L.col);
    footStroke(p, L.fa, L.fb, 7.5 * u, L.footCol);
  }
  // ---- upper body leans about the hip ----
  p.rot = F.lean ? [rad(F.lean), 300, hipY] : null;
  const T = F.Ta;
  if (F.far) { p.stroke(curve(F.far[0], F.far[1], F.far[2]), 5.2 * u, F.farArm); p.dot(F.far[2][0], F.far[2][1], 5.5 * u); }
  p.gradFill(F.tp, o.jacket, mul(o.jacket, SH_CLOTH), F.light);
  p.clip(F.tp, () => {
    if (o.belt) p.band([[F.tcx - 0.65 * T, chin - 0.05 * HH], [F.tcx + 0.75 * T, torsoBot - 0.1 * HH]], o.belt!, 5.5 * u, 1.8 * u);
    if (o.sash) p.band([[F.tcx - 1.3 * T, torsoBot - 0.32 * HH], [F.tcx + 1.3 * T, torsoBot - 0.32 * HH]], o.sash, 0.13 * HH, 1.8 * u);
    if (!o.dress) for (let i = 0; i < 3; i++) { const y = chin + 0.16 * HH + i * 0.24 * HH; p.dot(F.tcx + 0.8 * T, y, 3 * u, INK); p.dot(F.tcx + 0.8 * T, y, 2.2 * u, o.buttons ?? shadeJacket(o, 0.7)); }
  });
  p.inkRing(F.tp, F.ow, F.thick);
  if (F.rifle) {
    p.band([F.B0, F.B1], "#7a4b2a", 5 * u, 1.5 * u, "round");
    p.band([lerp2(F.B0, F.B1, 0.6), F.B1], "#8d949c", 2.4 * u, 1.2 * u, "round");
  }
  p.stroke(curve(F.near[0], F.near[1], F.near[2]), 5.2 * u, F.armCol); p.dot(F.near[2][0], F.near[2][1], 5.5 * u);
  // ---- head ----
  const hx = 300 + 4 * u;
  hatBehind(p, o, F.H, hx, F.hc, F.light, F.thick, F.ow, true);
  const hp = blobPts(hx, F.hc, F.H);
  p.shadedFill(hp, F.skin, mul(F.skin, SH_SKIN), F.light, F.H.a);
  p.inkRing(hp, F.ow, F.thick);
  hatOn(p, o, hp, F.H, hx, F.hc, F.light, F.seed, 1, true);
  const brim = !!o.hat && o.hat !== "hair" && o.hat !== "bonnet" && o.hat !== "cap";
  // Use legacy faceSide for exact parity at side view, new drawFace only for 3/4 views
  // Side view threshold: use legacy when |yaw| >= 80° (π/2 - 0.27 rad) to maintain parity
  const isSideView = Math.abs(F.viewYaw ?? Math.PI / 2) >= Math.PI / 2 - 0.27;
  if (isSideView) {
    faceSide(p, hx, F.hc, F.W, F.expr, F.lid, brim, F.skin, o.moustache, o.build === "stout");
  } else {
    // Build FacePose from legacy frame data
    const facePose: FacePose = {
      expr: F.expr,
      eye: ["lid", "lid"] as const,
      mouth: "dash",
      brow: [0, -1],
      lid: F.lid, lidL: F.lid, lidR: F.lid,
      look: 0, gazeX: 0, gazeY: 0, browLift: 0, smile: 0, jaw: 0,
      sweat: false, tongue: false, mood: "neutral" as const,
    };
    faceView(p, hx, F.hc, F.W, facePose, { yaw: F.viewYaw ?? Math.PI / 2, facing: 1 }, brim, F.skin, o.moustache, o.build === "stout");
  }
  p.rot = null;
};
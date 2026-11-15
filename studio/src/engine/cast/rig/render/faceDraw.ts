// Face painters: the measured front / profile layouts, plus a channel-driven layout that shares the same
// primitives. Presets reproduce the legacy table exactly (FACE -> faceOf -> faceChannels).
import { INK, WHITE, MOUTH, TONGUE, type P2 } from "../math2d";
import { 
  FACE, eyeKind, type Expr, type EyeK, type MouthK, type FacePose,
  viewT, computeEyeParams, computeBrowParams, computeMouthParams, computeHeadOffset
} from "../face";
import type { Pen as ToonPen } from "../../toon";
type Pen = ToonPen;

/** tapered stroke, thick end at a: brows, moustache halves */
export const taper = (p: Pen, a: P2, b: P2, wa: number, wb: number, col = INK) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  p.poly([[a[0] + nx * wa / 2, a[1] + ny * wa / 2], [b[0] + nx * wb / 2, b[1] + ny * wb / 2],
    [b[0] - nx * wb / 2, b[1] - ny * wb / 2], [a[0] - nx * wa / 2, a[1] - ny * wa / 2]], col, 0);
  p.dot(a[0], a[1], wa / 2, col); p.dot(b[0], b[1], wb / 2, col);
};

export const eye = (p: Pen, kind: EyeK, x: number, ey: number, u: number, side: number, look: number, skin: string) => {
  const lx = x + look * 3 * u, lw = 3.8 * u;
  switch (kind) {
    case "dot": p.ell(lx, ey, 3.8 * u, 5.5 * u, INK, 0); break;
    case "small": p.ell(lx, ey, 3 * u, 4.4 * u, INK, 0); break;
    case "lid": p.ell(lx, ey - u, 7 * u, 6 * u, INK, 0, 0, 180); p.stroke([[x - 9 * u, ey - u], [x + 9 * u, ey - u]], lw); break;
    case "slit": p.ell(lx, ey, 7 * u, 2.6 * u, INK, 0, 0, 180); p.stroke([[x - 9 * u, ey], [x + 9 * u, ey]], lw); break;
    case "happy": p.arc(x, ey + 3 * u, 8 * u, 6 * u, 200, 340, lw); break;
    case "dash": p.stroke([[x - 8.5 * u, ey], [x + 8.5 * u, ey]], lw); break;
    case "squeeze": p.stroke([[x + 6 * u * side, ey - 5 * u], [x - 6 * u * side, ey], [x + 6 * u * side, ey + 5 * u]], lw); break;
    case "shock": case "shockHalf":
      p.ell(x, ey, 11 * u, 11 * u, WHITE, 2.6 * u); p.dot(lx - side * 1.5 * u, ey + 1.5 * u, 3 * u);
      if (kind === "shockHalf") { p.ell(x, ey, 11 * u, 11 * u, skin, 0, 180, 360); p.stroke([[x - 11 * u, ey], [x + 11 * u, ey]], 2.6 * u); }
      break;
    default: {
      const s: P2[] = [];
      for (let t = 1; t < 15; t++) s.push([x + Math.cos(t * 0.9) * t * 0.55 * u, ey + Math.sin(t * 0.9) * t * 0.55 * u]);
      p.stroke(s, 2.4 * u);
    }
  }
};

/** open "D" mouth with a white teeth band (+ tongue) */
export const dmouth = (p: Pen, mx: number, y: number, rx: number, ry: number, u: number, tongue = false) => {
  p.ell(mx, y, rx, ry, MOUTH, 0, 0, 180);
  p.clip([[mx - rx, y], [mx + rx, y], [mx + rx, y + 3 * u], [mx - rx, y + 3 * u]], () => p.ell(mx, y, rx, ry, WHITE, 0, 0, 180));
  if (tongue) p.ell(mx + 2 * u, y + 0.62 * ry, 0.4 * rx, 0.28 * ry, TONGUE, 0);
  p.ell(mx, y, rx, ry, null, 3 * u, 0, 180);
};

export const mouth = (p: Pen, kind: MouthK, mx: number, my: number, u: number, k = 1) => {
  const mw = 4 * u;
  switch (kind) {
    case "dash": p.stroke([[mx - 5.5 * u * k, my], [mx + 5.5 * u * k, my - 0.8 * u]], mw); break;
    case "frown": p.arc(mx, my + 3 * u, 6.5 * u * k, 3.5 * u, 200, 340, mw); break;
    case "smirk": p.arc(mx + u, my - 3 * u, 7 * u * k, 4 * u, 10, 150, mw); break;
    case "smile": p.arc(mx, my - 3 * u, 8 * u * k, 4.5 * u, 20, 160, mw); break;
    case "smileWide": p.arc(mx, my - 4 * u, 11 * u * k, 6 * u, 15, 165, mw); break;
    case "grin": dmouth(p, mx, my - u, 12 * u * k, 8 * u, u); break;
    case "laugh": dmouth(p, mx, my, 16 * u * k, 11 * u, u, true); break;
    case "o": p.ell(mx + 4 * u, my, 3.5 * u, 4 * u, MOUTH, 2.8 * u); break;
    case "O": p.ell(mx, my + 2 * u, 9 * u * k, 11 * u, MOUTH, 3.2 * u); break;
    case "wave": { const s: P2[] = []; for (let i = 0; i <= 12; i++) s.push([mx - 9 * u * k + i * 1.5 * u * k, my + 1.5 * u * Math.sin(i * 1.3)]); p.stroke(s, 3 * u); break; }
    case "teeth":
      p.poly([[mx - 12 * u * k, my - 4 * u], [mx + 12 * u * k, my - 4 * u], [mx + 11 * u * k, my + 4 * u], [mx - 11 * u * k, my + 4 * u]], WHITE, 3 * u);
      for (const j of [-1, 0, 1]) p.stroke([[mx + j * 6 * u * k, my - 4 * u], [mx + j * 6 * u * k, my + 4 * u]], 1.5 * u);
      break;
    case "lick": p.arc(mx, my - 3 * u, 8 * u * k, 4.5 * u, 20, 160, mw); p.ell(mx + 6 * u * k, my + 3 * u, 3.6 * u, 4.6 * u, TONGUE, 2.4 * u); break;
  }
};

/** face v2 (front / 3-4). u = 1 % of the head path width W. Eyes 26u apart on the centre line, brows 20u up, mouth 20u
 *  down, everything slid toward the facing side. No blush, no catchlights. */
export const faceFront = (p: Pen, cx: number, cy: number, W: number, expr: Expr, facing: number, look: number, lid: number, brim: boolean,
  skin: string, moustache?: string, stout = false) => {
  const u = W / 100, F = FACE[expr], fx = cx + 7 * u * facing;
  const ex = (F.eye[0] === "shock" ? 12 : 13) * u, ey = cy;
  for (const side of [-1, 1]) {
    const x = fx + side * ex;
    const kind = eyeKind(F.eye[(facing ? side === facing : side > 0) ? 1 : 0], lid);
    eye(p, kind, x, ey, u, side, look, skin);
    const [dI, dO] = F.brow, by = ey - (brim ? 17 : 20) * u;
    if (kind === "shock" || kind === "shockHalf") p.arc(x, by - 6 * u, 9 * u, 3 * u, 200, 340, 4 * u);
    else taper(p, [x - side * 8.5 * u, by + dI * u], [x + side * 8.5 * u, by + dO * u], 5 * u, 2.5 * u);
  }
  const mx = cx + 8 * u * facing, my = cy + 20 * u;
  mouth(p, F.mouth, mx, my, u);
  if (moustache) for (const s of [-1, 1])
    taper(p, [mx + s * 1.5 * u, cy + 12.5 * u], [mx + s * (stout ? 19 : 15) * u, cy + (stout ? 10.5 : 15) * u], stout ? 5.5 * u : 4.5 * u, 1.6 * u, moustache);
  if (expr === "nervous") p.ell(cx + 40 * u * (facing || 1), cy - 22 * u, 3 * u, 5 * u, "#9fd4ff", 2 * u);
};

/** profile face (facing screen-right): one eye, brow, nose tick, mouth near the front edge; no skin bump nose, no ear */
export const faceSide = (p: Pen, hx: number, hy: number, W: number, expr: Expr, lid: number, brim: boolean, skin: string, moustache?: string, stout = false) => {
  const u = W / 100, F = FACE[expr], ex = hx + 27 * u, ey = hy;
  const kind = eyeKind(F.eye[1], lid);
  eye(p, kind, ex, ey, u, 1, 0.6, skin);
  const by = ey - (brim ? 17 : 20) * u, [dI, dO] = F.brow;
  if (kind === "shock" || kind === "shockHalf") p.arc(ex, by - 6 * u, 9 * u, 3 * u, 200, 340, 4 * u);
  else taper(p, [ex + 8 * u, by + dI * u], [ex - 7 * u, by - u + dO * u], 5 * u, 2.5 * u);
  p.stroke([[hx + 44 * u, hy + 4 * u], [hx + 47.5 * u, hy + 9 * u], [hx + 43 * u, hy + 10 * u]], 3 * u);
  mouth(p, F.mouth, hx + 33 * u, hy + 21 * u, u, 0.62);
  if (moustache) taper(p, [hx + 41 * u, hy + 13.5 * u], [hx + 25 * u, hy + (stout ? 11.5 : 16) * u], stout ? 5.5 * u : 4.5 * u, 1.6 * u, moustache);
  if (expr === "nervous") p.ell(hx - 30 * u, hy - 24 * u, 3 * u, 5 * u, "#9fd4ff", 2 * u);
};

// ---------------- channel-driven layout (Phase 4) ----------------
/** Front/3-4 from FacePose. At preset weights the channels are the FACE values, so this is pixel-identical. */
export const faceFrontChannels = (p: Pen, cx: number, cy: number, W: number, f: FacePose, facing: number, brim: boolean, skin: string, moustache?: string, stout = false) => {
  const u = W / 100, fx = cx + 7 * u * facing;
  const ex = (f.eye[0] === "shock" ? 12 : 13) * u, ey = cy;
  for (const side of [-1, 1]) {
    const x = fx + side * ex;
    const which = (facing ? side === facing : side > 0) ? 1 : 0;
    const lid = which ? f.lidR : f.lidL;
    const kind = eyeKind(f.eye[which], lid);
    eye(p, kind, x, ey, u, side, f.look + f.gazeX / (3 * u), skin);
    const dI = f.brow[0], dO = f.brow[1], by = ey - (brim ? 17 : 20) * u - f.browLift * u;
    if (kind === "shock" || kind === "shockHalf") p.arc(x, by - 6 * u, 9 * u, 3 * u, 200, 340, 4 * u);
    else taper(p, [x - side * 8.5 * u, by + dI * u], [x + side * 8.5 * u, by + dO * u], 5 * u, 2.5 * u);
  }
  const mx = cx + 8 * u * facing, my = cy + 20 * u;
  mouth(p, f.mouth, mx, my, u, 1 + Math.max(0, f.jaw));
  if (moustache) for (const s of [-1, 1])
    taper(p, [mx + s * 1.5 * u, cy + 12.5 * u], [mx + s * (stout ? 19 : 15) * u, cy + (stout ? 10.5 : 15) * u], stout ? 5.5 * u : 4.5 * u, 1.6 * u, moustache);
  if (f.sweat) p.ell(cx + 40 * u * (facing || 1), cy - 22 * u, 3 * u, 5 * u, "#9fd4ff", 2 * u);
};

export const faceSideChannels = (p: Pen, hx: number, hy: number, W: number, f: FacePose, brim: boolean, skin: string, moustache?: string, stout = false) => {
  const u = W / 100, ex = hx + 27 * u, ey = hy;
  const kind = eyeKind(f.eye[1], f.lidR);
  eye(p, kind, ex, ey, u, 1, f.look + f.gazeX / (3 * u), skin);
  const by = ey - (brim ? 17 : 20) * u - f.browLift * u, dI = f.brow[0], dO = f.brow[1];
  if (kind === "shock" || kind === "shockHalf") p.arc(ex, by - 6 * u, 9 * u, 3 * u, 200, 340, 4 * u);
  else taper(p, [ex + 8 * u, by + dI * u], [ex - 7 * u, by - u + dO * u], 5 * u, 2.5 * u);
  p.stroke([[hx + 44 * u, hy + 4 * u], [hx + 47.5 * u, hy + 9 * u], [hx + 43 * u, hy + 10 * u]], 3 * u);
  mouth(p, f.mouth, hx + 33 * u, hy + 21 * u, u, 0.62 + Math.max(0, f.jaw) * 0.38);
  if (moustache) taper(p, [hx + 41 * u, hy + 13.5 * u], [hx + 25 * u, hy + (stout ? 11.5 : 16) * u], stout ? 5.5 * u : 4.5 * u, 1.6 * u, moustache);
  if (f.sweat) p.ell(hx - 30 * u, hy - 24 * u, 3 * u, 5 * u, "#9fd4ff", 2 * u);
};

// ---------------- unified view-parameterized face drawing (Phase 4) ----------------
/** Draw a face at any yaw angle, interpolating between front and side geometry.
 *  At yaw=0 (front) and yaw=±π/2 (side), matches legacy pixel output exactly. */
export const drawFace = (
  p: Pen,
  cx: number,
  cy: number,
  W: number,
  f: FacePose,
  yaw: number,       // signed: 0 = front, ±π/2 = side, π = back
  facing: number,    // character facing: -1 (left) or 1 (right)
  brim: boolean,
  skin: string,
  moustache?: string,
  stout = false
): void => {
  const u = W / 100;
  const t = Math.min(1, Math.abs(yaw) / (Math.PI / 2));
  const o = 1 - t;
  const facingRight = facing >= 0;
  
  // Determine head center offset
  const headOffset = computeHeadOffset(yaw, u);
  const hx = cx + headOffset.x;
  const hy = cy;
  
  // Compute eye parameters
  const eyeParams = computeEyeParams(yaw, facing, u, f);
  
  // Draw visible eyes
  if (eyeParams.visibleLeft) {
    eye(p, eyeParams.left.kind, hx + eyeParams.left.x, hy, u, -1, eyeParams.left.look, skin);
  }
  if (eyeParams.visibleRight) {
    eye(p, eyeParams.right.kind, hx + eyeParams.right.x, hy, u, 1, eyeParams.right.look, skin);
  }
  
  // Compute and draw brows
  const browParams = computeBrowParams(yaw, facing, u, f);
  
  // Left brow
  if (t < 1) { // always draw in front/3/4, fade out at side
    taper(p, 
      [hx + browParams.left.innerX, browParams.left.y + browParams.left.dI * u],
      [hx + browParams.left.outerX, browParams.left.y + browParams.left.dO * u],
      5 * u, 2.5 * u);
  }
  
  // Right brow
  taper(p,
    [hx + browParams.right.innerX, browParams.right.y + browParams.right.dI * u],
    [hx + browParams.right.outerX, browParams.right.y + browParams.right.dO * u],
    5 * u, 2.5 * u);
  
  // Shock brow arcs
  if (eyeParams.left.kind === "shock" || eyeParams.left.kind === "shockHalf") {
    p.arc(hx + eyeParams.left.x, browParams.left.y - 6 * u, 9 * u, 3 * u, 200, 340, 4 * u);
  }
  if (eyeParams.right.kind === "shock" || eyeParams.right.kind === "shockHalf") {
    p.arc(hx + eyeParams.right.x, browParams.right.y - 6 * u, 9 * u, 3 * u, 200, 340, 4 * u);
  }
  
  // Compute and draw mouth
  const mouthParams = computeMouthParams(yaw, facing, u, f);
  mouth(p, mouthParams.kind, hx + mouthParams.x, hy + mouthParams.y, u, mouthParams.k);
  
  // Draw nose tick for side/3/4 views
  if (t > 0.1) {
    const noseX = hx + 44 * u * t;
    const noseY = hy + 4 * u * t;
    p.stroke([[noseX, noseY], [noseX + 3.5 * u, noseY + 5 * u], [noseX - 1 * u, noseY + 6 * u]], 3 * u);
  }
  
  // Moustache
  if (moustache) {
    const mx = hx + (8 * u * facing * o + 41 * u * t);
    const my = cy + (13.5 * u * o + 13.5 * u * t);
    const mxEnd = hx + (facing * (stout ? 19 : 15) * u * o + 25 * u * t);
    const myEnd = cy + ((stout ? 10.5 : 15) * u * o + 16 * u * t);
    taper(p, [mx, my], [mxEnd, myEnd], stout ? 5.5 * u : 4.5 * u, 1.6 * u, moustache);
  }
  
  // Nervous sweat
  if (f.sweat) {
    const sweatX = hx + 40 * u * (facing || 1);
    p.ell(sweatX, hy - 22 * u, 3 * u, 5 * u, "#9fd4ff", 2 * u);
  }
};

/** View-parameterized face drawing that matches legacy at yaw=0 and yaw=±π/2. */
export const faceView = (
  p: Pen,
  cx: number,
  cy: number,
  W: number,
  f: FacePose,
  view: { yaw: number; facing: number },
  brim: boolean,
  skin: string,
  moustache?: string,
  stout = false
): void => {
  drawFace(p, cx, cy, W, f, view.yaw, view.facing, brim, skin, moustache, stout);
};
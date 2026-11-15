// Limbs, feet and hands drawn from joint points only. The two legacy foot/hand shapes are here so front,
// side and the new target-based path share one implementation.
import { INK, rad, type P2 } from "../math2d";
import { curve } from "../math2d";
import type { Pen as ToonPen } from "../../toon";
type Pen = ToonPen;

export const footStroke = (p: Pen, a: P2, b: P2, w: number, col: string) => {
  if (col !== INK) p.stroke([a, b], w + 3, INK);
  p.stroke([a, b], w, col);
};

/** ankle → toe cap in the legacy proportions (3u back, 13u forward, +0.5u toe lift) */
export const footPoly = (ank: P2, pitch: number, u: number): [P2, P2] => {
  const c = Math.cos(pitch), s = Math.sin(pitch);
  return [[ank[0] - 3 * u * c, ank[1] - 3 * u * s], [ank[0] + 13 * u * c, ank[1] + 13 * u * s + 0.5 * u]];
};

/** single-stroke limb from three joints, with the ink-dot hand the cast uses */
export const limb = (p: Pen, a: P2, b: P2, c: P2, w: number, col: string) => {
  p.stroke(curve(a, b, c), w, col);
};

export const handDot = (p: Pen, q: P2, u: number) => { p.dot(q[0], q[1], 5.5 * u); };

/** arm chain with a hand dot (front / side both use 5.2u strokes and a 5.5u hand) */
export const arm = (p: Pen, a: P2, b: P2, c: P2, u: number, col: string) => {
  limb(p, a, b, c, 5.2 * u, col);
  handDot(p, c, u);
};

/** rotate a foot pair about the ankle (new path) */
export const turnFoot = (f: [P2, P2], angle: number, about: P2): [P2, P2] => {
  const c = Math.cos(angle), s = Math.sin(angle);
  const R = ([x, y]: P2): P2 => [about[0] + (x - about[0]) * c - (y - about[1]) * s, about[1] + (x - about[0]) * s + (y - about[1]) * c];
  return [R(f[0]), R(f[1])];
};

export { rad };

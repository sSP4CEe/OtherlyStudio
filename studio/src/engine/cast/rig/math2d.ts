// Pure 2D helpers shared by the rig, the painters and the legacy adapters. No DOM, no three.js: this file and
// everything it feeds can run in Node for the rig math tests.
export type P2 = [number, number];
export type C3 = [number, number, number];

// ---------------- palette (the measured cast colours, characters.md 2.3) ----------------
export const INK = "#241726";
export const SKIN = "#ffe2c2";
export const WHITE = "#ffffff";
export const MOUTH = "#5a1e28";
export const TONGUE = "#e86e78";
export const BONNET = "#e9cf8f";
export const BONNET_BRIM = "#d6b46a";
/** measured shadow/lit ratios: skin heads, cloth torsos, felt hats */
export const SH_SKIN: C3 = [0.96, 0.86, 0.84];
export const SH_CLOTH: C3 = [0.64, 0.66, 0.74];
export const SH_FELT: C3 = [0.62, 0.62, 0.7];
/** metres per design unit: 1000 units = 2.16 m */
export const SU = 0.00216;

export const rad = (d: number) => (d * Math.PI) / 180;
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const clamp01 = (x: number) => clamp(x, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** multiply an sRGB hex colour by a 0..1 channel ratio (the cast's painted shading) */
export const mul = (c: string, m: C3) => {
  const n = parseInt(c.slice(1), 16);
  const ch = (v: number, k: number) => Math.min(255, Math.round(v * k)).toString(16).padStart(2, "0");
  return `#${ch((n >> 16) & 255, m[0])}${ch((n >> 8) & 255, m[1])}${ch(n & 255, m[2])}`;
};
export const shade = (c: string, k: number) => mul(c, [k, k, k]);
export const mix = (a: string, b: string, t: number) => {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
};
/** deterministic per-character random in [0, 1) */
export const rnd = (seed: number, k: number) => { const x = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
export const rotPts = (pts: P2[], a: number, cx: number, cy: number): P2[] =>
  pts.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
export const rotAbout = (q: P2, a: number, c: P2): P2 => rotPts([q], a, c[0], c[1])[0];
export const lerp2 = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** smooth curve from a through (near) k to b, as a polyline */
export const curve = (a: P2, k: P2, b: P2, n = 10): P2[] => {
  const c: P2 = [2 * k[0] - (a[0] + b[0]) / 2, 2 * k[1] - (a[1] + b[1]) / 2], out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = 1 - t;
    out.push([s * s * a[0] + 2 * s * t * c[0] + t * t * b[0], s * s * a[1] + 2 * s * t * c[1] + t * t * b[1]]);
  }
  return out;
};

// ---------------- 2D affine frames (new rig path; null on the legacy path) ----------------
/** [a, b, c, d, e, f] maps (x, y) -> (a x + c y + e, b x + d y + f) */
export type Mat2 = [number, number, number, number, number, number];
export const IDENT: Mat2 = [1, 0, 0, 1, 0, 0];
export const applyMat = (m: Mat2, x: number, y: number): P2 => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
/** parent ∘ child: child is applied first, then parent */
export const composeMat = (parent: Mat2, child: Mat2): Mat2 => [
  parent[0] * child[0] + parent[2] * child[1],
  parent[1] * child[0] + parent[3] * child[1],
  parent[0] * child[2] + parent[2] * child[3],
  parent[1] * child[2] + parent[3] * child[3],
  parent[0] * child[4] + parent[2] * child[5] + parent[4],
  parent[1] * child[4] + parent[3] * child[5] + parent[5],
];
export const matOf = (x: number, y: number, angle: number, sx = 1, sy = sx): Mat2 => {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [c * sx, s * sx, -s * sy, c * sy, x, y];
};

// primitive geometry (also used by toon.ts effects)
export const ellPts = (cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = 360, rot = 0, n = 48): P2[] => {
  const r = rad(rot), pts: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n), x = rx * Math.cos(a), y = ry * Math.sin(a);
    pts.push([cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)]);
  }
  return pts;
};

export const rrect = (x0: number, y0: number, x1: number, y1: number, r: number, n = 8): P2[] => {
  const pts: P2[] = [];
  for (const [cx, cy, a] of [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]])
    for (let i = 0; i <= n; i++) pts.push([cx + r * Math.cos(rad(a + (90 * i) / n)), cy + r * Math.sin(rad(a + (90 * i) / n))]);
  return pts;
};

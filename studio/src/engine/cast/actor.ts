// The reusable character-card runtime: a canvas pool keyed by drawing, yaw-only lit billboards and unlit effect
// cards, all on the NOINK layer so the world ink pass never outlines their quads. Episodes provide the drawings
// (see engine/cast/toon.ts) and their own blocking; this file has no story or set knowledge.
import * as THREE from "three";
import { Pen } from "./toon";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";
import { NOINK } from "../post/ink";

// ---------------- types ----------------
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body" | "swing"; roll?: number; size?: [number, number, number];
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
/** sun = world direction TOWARD the sun (optional: when absent the scene's shadow-casting light is used) */
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };
export type Stage = { places: Place[]; fx: FxPlace[] };

export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
export const SU_SWING = 2.3 / 1830; // swing canvas: rope of 1830 units = 2.3 m
export const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
export const tmp = new THREE.Vector3();

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number; lastUsed: number };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h, lastUsed: 0 };
};

/** Drawing-cache counters with rig integration. Cheap to maintain; read with Pool.stats(). */
export type CacheStats = {
  frames: number; requests: number; unique: number; hits: number; misses: number; drawn: number; evicted: number;
  drawMs: number; flushMs: number; liveBytes: number; peakBytes: number; uploads: number; maxDraws: number; maxLive: number;
  // Rig integration stats
  rigHits: number; rigMisses: number; rigBytes: number;
};
/** set true to print a one-line summary every 60 flushes (measurement runs only; off for normal renders) */
const LOG_STATS = false;

/** Byte budget for canvas pool (256 MB) */
const POOL_BUDGET = 256 * 1024 * 1024;
/** Per-frame draw budget (steady state) */
const PER_FRAME_DRAW_BUDGET = 100;
/** Maximum frames to keep unused entry before eviction */
const MAX_UNUSED_FRAMES = 120; // ~2 seconds at 60fps

export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  private frameCount = 0;
  private s: CacheStats = { frames: 0, requests: 0, unique: 0, hits: 0, misses: 0, drawn: 0, evicted: 0,
    drawMs: 0, flushMs: 0, liveBytes: 0, peakBytes: 0, uploads: 0, maxDraws: 0, maxLive: 0,
    rigHits: 0, rigMisses: 0, rigBytes: 0 };
  
  /** Request a drawing with integer-packed key from rig cache */
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    this.s.requests++;
    return r;
  }
  
  /** Record a rig cache hit/miss for integrated stats */
  recordRigHit(bytes: number) { this.s.rigHits++; this.s.rigBytes += bytes; }
  recordRigMiss(bytes: number) { this.s.rigMisses++; this.s.rigBytes += bytes; }

  stats(): CacheStats { return { ...this.s }; }
  resetStats() { this.s = { frames: 0, requests: 0, unique: 0, hits: 0, misses: 0, drawn: 0, evicted: 0,
    drawMs: 0, flushMs: 0, liveBytes: 0, peakBytes: 0, uploads: 0, maxDraws: 0, maxLive: 0,
    rigHits: 0, rigMisses: 0, rigBytes: 0 }; }

  /** Compute tier with hysteresis for a given distance and previous tier */
  static tierWithHysteresis(distance: number, prevTier: number): number {
    const h = 0.4;
    const boundaries = [3.2, 6.5, 16.0];
    let rawTier = 0;
    if (distance >= boundaries[2]) rawTier = 3;
    else if (distance >= boundaries[1]) rawTier = 2;
    else if (distance >= boundaries[0]) rawTier = 1;
    else rawTier = 0;
    
    if (prevTier !== rawTier) {
      const prevBoundary = prevTier === 0 ? 0 : (prevTier >= 3 ? Infinity : boundaries[prevTier - 1]);
      const nextBoundary = rawTier >= 3 ? Infinity : boundaries[rawTier];
      if (rawTier > prevTier) {
        if (distance < nextBoundary + 0.4) return prevTier;
      } else if (rawTier < prevTier) {
        if (distance > prevBoundary - 0.4) return prevTier;
      }
    }
    return rawTier;
  }

  /** Tier boundaries for external use */
  static readonly TIER_BOUNDARIES = [3.2, 6.5, 16.0];

  /** Warm up the pool by pre-rendering a set of keys (per-shot warm-up) */
  warmUp(keys: Array<{ key: string; w: number; h: number; k: number; draw: (p: Pen) => void }>) {
    for (const k of keys) {
      this.req(k.key, k.w, k.h, k.k, k.draw);
    }
    this.flush(); // Force immediate render
  }

  flush() {
    const t0 = performance.now();
    this.frameCount++;
    
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    
    // Evict entries not wanted this frame (with grace period for LRU)
    for (const [key, e] of this.live) {
      if (!want.has(key)) {
        // Check if recently used (within grace period)
        if (this.frameCount - e.lastUsed <= MAX_UNUSED_FRAMES) {
          // Keep but mark for potential eviction
        } else {
          this.live.delete(key);
          this.free.push(e);
          this.s.evicted++;
        }
      }
    }
    
    // Enforce byte budget (LRU eviction)
    let liveBytes = 0;
    for (const e of this.live.values()) liveBytes += e.w * e.h * 4;
    while (liveBytes > POOL_BUDGET && this.live.size) {
      // Evict oldest (first in map iteration order approximates LRU)
      const firstKey = this.live.keys().next().value;
      if (firstKey) {
        const e = this.live.get(firstKey);
        if (e) {
          this.live.delete(firstKey);
          this.free.push(e);
          this.s.evicted++;
          liveBytes -= e.w * e.h * 4;
        }
      }
    }
    
    let draws = 0;
    for (const [key, rs] of want) {
      // Enforce per-frame draw budget
      if (draws >= PER_FRAME_DRAW_BUDGET) break;
      
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        const d0 = performance.now();
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        this.s.drawMs += performance.now() - d0;
        e.tex.needsUpdate = true;
        this.live.set(key, e);
        this.s.misses++; this.s.drawn++; draws++; this.s.uploads++;
      } else {
        this.s.hits++;
      }
      e.lastUsed = this.frameCount;
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
    this.s.frames++;
    this.s.unique += want.size;
    this.s.maxDraws = Math.max(this.s.maxDraws, draws);
    this.s.maxLive = Math.max(this.s.maxLive, this.live.size);
    
    let bytes = 0;
    for (const e of this.live.values()) bytes += e.w * e.h * 4;
    this.s.liveBytes = bytes;
    this.s.peakBytes = Math.max(this.s.peakBytes, bytes);
    this.s.flushMs += performance.now() - t0;
    if (LOG_STATS) console.log("[caststats]", JSON.stringify(this.s));
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
/** world roots that hold actors (to find the scene's sun when world.ts does not pass it) */
const ROOTS = new Set<THREE.Object3D>();

/** lit flat character: cardShade() material, receives shadows (dims to the bright floor only), casts its silhouette
 *  when the world says so. Drawn after the contact blobs (renderOrder 1). */
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    // rim width is in output pixels: tell the card shader the render height (1920 = 1080 x 1920 frame)
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}

/** unlit effect card: hard cut-out (ink drawings), soft see-through (dust, mist) or a multiply ground blob */
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      // no mipmaps: at grazing views the mip chain averages the blob with its white surround and it fades out
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

// ---------------- placements ----------------
/** sun = world direction TOWARD the sun (optional: when absent the scene's shadow-casting light is used) */
export const findSun = (cam: CamInfo, out: THREE.Vector3) => {
  if (cam.sun) return out.copy(cam.sun).normalize();
  let best: THREE.DirectionalLight | null = null, err = Infinity;
  for (const r of ROOTS) {
    if (!r.parent) continue;
    const s = sunOf(r);
    if (!s) continue;
    const d = tmp.copy(s.target.position).sub(cam.pos), e = Math.abs(d.dot(cam.right)) / (d.length() || 1);
    if (e < err) { err = e; best = s; }
  }
  return best ? out.copy(best.position).sub(best.target.position).normalize() : out;
};

/** canvas angle the sun comes FROM on an upright card facing the camera, in 45-degree steps (small texture cache) */
export const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = SUN.dot(cam.right) * (mirror ? -1 : 1), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
}

/** front / side view and mirroring for someone at (x, z) walking along (dx, dz); fs = foreshortening of the walk */
export const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: c < 0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0, fs: Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20 };
}

const sunOf = (root: THREE.Object3D) => {
  let s: THREE.DirectionalLight | null = null;
  root.traverse((o) => { if (!s && o instanceof THREE.DirectionalLight && o.castShadow) s = o; });
  return s as THREE.DirectionalLight | null;
}

export const TIER_BOUNDARIES = [3.2, 6.5, 16.0];
export const tierWithHysteresis = (distance: number, prevTier: number): number => {
  const h = 0.4;
  const boundaries = TIER_BOUNDARIES;
  let rawTier = 0;
  if (distance >= boundaries[2]) rawTier = 3;
  else if (distance >= boundaries[1]) rawTier = 2;
  else if (distance >= boundaries[0]) rawTier = 1;
  else rawTier = 0;
  
  if (prevTier !== rawTier) {
    const prevBoundary = prevTier === 0 ? 0 : (prevTier >= 3 ? Infinity : boundaries[prevTier - 1]);
    const nextBoundary = rawTier >= 3 ? Infinity : boundaries[rawTier];
    if (rawTier > prevTier) {
      if (distance < nextBoundary + 0.4) return prevTier;
    } else if (rawTier < prevTier) {
      if (distance > prevBoundary - 0.4) return prevTier;
    }
  }
  return rawTier;
};


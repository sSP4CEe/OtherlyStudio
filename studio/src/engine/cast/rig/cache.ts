// Cache key and quantisation: short integer for fast hashing, bounded per-frame, LRU eviction.
import { SU, type P2 } from "./math2d";
import type { CharacterSpec } from "./spec";
import type { Pose } from "./pose";
import type { CharacterView } from "./view";

/** finite field for pose channels: step sizes that are barely visible */
export const QPHASE = 1 / 120; // phase 0..1, 120 steps per cycle
export const QJOINT = 1 / 8;   // design units, 0.125 u
export const QFACE = 1 / 12;   // channels: lid, brow, gaze, smile
export const QLID = 1 / 4;     // lid 0..1, 4 steps
export const QLIGHT = Math.PI / 8; // 45°
export const QYAW = Math.PI / 8;    // 22.5° band
export const QT = 40; // tier: 4 steps (0..3)

/** integer encoding: spec id + quantised pose + view + tier */
export type PoseHash = {
  specId: number;
  phase: number; jointL: number; jointR: number; faceL: number; faceR: number; lid: number; light: number; yaw: number; tier: number;
};

/** 
 * Tier hysteresis: ±0.4m around boundaries to prevent flicker
 * Boundaries: 3.2m, 6.5m, 16m → tiers 0, 1, 2, 3
 * Hysteresis: when entering a new tier, require 0.4m past boundary
 * When leaving, require 0.4m back
 */
export const TIER_BOUNDARIES = [3.2, 6.5, 16.0]; // meters
export const TIER_HYSTERESIS = 0.4; // meters

/** Determine tier with hysteresis based on previous tier */
export const tierWithHysteresis = (distance: number, prevTier: number = 0): number => {
  const boundaries = TIER_BOUNDARIES;
  const h = TIER_HYSTERESIS;
  
  // First, determine raw tier
  let rawTier = 0;
  for (let i = 0; i < boundaries.length; i++) {
    if (distance >= boundaries[i]) rawTier = i + 1;
  }
  
  // Apply hysteresis: if we were in a different tier, require crossing with margin
  if (prevTier !== rawTier) {
    const prevBoundary = prevTier === 0 ? 0 : boundaries[prevTier - 1];
    const nextBoundary = rawTier >= boundaries.length ? Infinity : boundaries[rawTier];
    
    // If moving up, require distance > nextBoundary + h
    if (rawTier > prevTier) {
      if (distance < nextBoundary + h) return prevTier;
    }
    // If moving down, require distance < prevBoundary - h
    else if (rawTier < prevTier) {
      if (distance > prevBoundary - h) return prevTier;
    }
  }
  
  return rawTier;
};

/** short packed key: base-36 for readability, bound ~16 chars */
export const keyOf = (spec: CharacterSpec, pose: Pose, view: CharacterView, tier: number): string => {
  // Quantize all values to discrete steps
  const q = (x: number, step: number) => Math.round(Math.max(0, Math.min(1, x)) / step);
  const qAngle = (x: number, step: number) => Math.round(Math.max(-Math.PI, Math.min(Math.PI, x)) / step);
  const qSigned = (x: number, step: number) => Math.round(x / step);
  
  // Hash spec.id to a 16-bit integer
  const specIdHash = Array.from(spec.id).reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0) & 0xFFFF;
  
  // Quantize pose channels (all mapped to 0..100 range for packing)
  const phase = q(pose.extras.kick, QPHASE) & 0x7F;      // 0..119 → 7 bits
  const jointL = qSigned(pose.legs[0].ankle[0] / 600, QJOINT) & 0x7F;  // -600..600 / 0.125
  const jointR = qSigned(pose.legs[1].ankle[0] / 600, QJOINT) & 0x7F;
  const faceL = q(pose.arms[0].elbowDir / Math.PI, QFACE) & 0x1F;       // -π..π / (π/12)
  const faceR = q(pose.arms[1].elbowDir / Math.PI, QFACE) & 0x1F;
  const lid = q(pose.face.lid, QLID) & 0x03;                          // 0..3
  const light = qAngle(view.light, QLIGHT) & 0x0F;                    // -π..π / (π/8)
  const yaw = qAngle(view.yaw, QYAW) & 0x1F;                          // -π..π / (π/8)
  const tierPart = tier & 0x03;                                        // 0..3
  
  // Pack into a single string (base-36 for compactness)
  // Layout: specId(16b) | phase(7b) | jointL(7b) | jointR(7b) | faceL(5b) | faceR(5b) | lid(2b) | light(4b) | yaw(5b) | tier(2b)
  // Total: ~63 bits → fits in JavaScript number (53 bits mantissa) but we use string for safety
  
  const parts = [
    specIdHash.toString(36).padStart(4, '0'),
    phase.toString(36).padStart(2, '0'),
    (jointL + 64).toString(36).padStart(2, '0'),
    (jointR + 64).toString(36).padStart(2, '0'),
    faceL.toString(36).padStart(2, '0'),
    faceR.toString(36).padStart(2, '0'),
    lid.toString(36),
    light.toString(36).padStart(2, '0'),
    yaw.toString(36).padStart(2, '0'),
    tierPart.toString(36),
  ];
  
  return parts.join('');
};

/** quantised boolean for the cache */
export const quantise = (x: number, step: number): number => Math.round(Math.max(0, Math.min(1, x)) / step * (1 / step)) * step;

/** simple LRU with a byte budget; evict oldest when liveBytes > budget */
export class Cache {
  private live: Map<string, { bytes: number; key: string }[]> = new Map();
  private free: { bytes: number; key: string }[] = [];
  readonly budget = 256 * 1024 * 1024; // 256 MB
  readonly perFrameDraws = 8; // max draws per frame

  insert(key: string, bytes: number) {
    const bucket = this.live.get(key[0]);
    if (!bucket) {
      this.live.set(key[0], [{ key, bytes }]);
    } else {
      bucket.push({ key, bytes });
    }
    this.trim();
  }

  evict() {
    // remove oldest bucket
    const buckets = Array.from(this.live.values());
    if (buckets.length) {
      const oldest = buckets[0];
      if (oldest.length) {
        const evicted = oldest.shift();
        if (evicted) this.free.push(evicted);
        this.live.set(oldest[0]?.key[0] || '', oldest);
      }
    }
  }

  private trim() {
    let liveBytes = 0;
    for (const bucket of this.live.values()) liveBytes += bucket.reduce((s, e) => s + e.bytes, 0);
    while (liveBytes > this.budget && this.live.size) this.evict();
  }

  /** release a key this frame: move to free list for reuse */
  release(key: string) {
    const bucket = this.live.get(key[0]);
    if (bucket) {
      const idx = bucket.findIndex(e => e.key === key);
      if (idx >= 0) {
        const evicted = bucket.splice(idx, 1)[0];
        if (evicted) this.free.push(evicted);
        if (!bucket.length) this.live.delete(key[0]);
      }
    }
  }

  available(): number {
    let used = 0;
    for (const bucket of this.live.values()) used += bucket.reduce((s, e) => s + e.bytes, 0);
    return Math.max(0, this.budget - used);
  }
}

/** stats for monitoring; exported from actor.ts for dev logs */
export type CacheStats = {
  draws: number; hits: number; misses: number; bytes: number; uploads: number; flushMs: number;
};

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
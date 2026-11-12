// Episode timeline primitives: shot ranges, crossfade layers and the thin-lens DOF key table. Episodes own the
// actual shot content; these helpers keep the frame math identical across episodes and the Python audio/QA tools.
import type { V3 } from "./camera";

export type ShotTiming = { id: number; a: number; b: number };
export type Layer = { id: number; alpha: number };

/** the shot containing frame f (last shot wins at/after the final boundary) */
export const shotAt = <T extends ShotTiming>(shots: T[], f: number): T =>
  shots.find((s) => f >= s.a && f < s.b) ?? shots[shots.length - 1];

/** base shot plus the next shot fading in during a crossfade window centred on its first frame */
export const layersAt = <T extends ShotTiming>(shots: T[], xfade: Record<number, number>, f: number): Layer[] => {
  for (const s of shots) {
    const x = xfade[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) {
      return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
    }
  }
  return [{ id: shotAt(shots, f).id, alpha: 1 }];
};

/** a DOF key: cInf = blur circle (px at 1080x1920) at infinity; focus = world point, else the camera look point */
export type DofKey = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
export type DofValue = { cInf: number; focus?: (f: number) => V3 };

/** resolve the DOF value at frame f; entries without `dur` switch on cuts, entries with `dur` ramp from the previous */
export const dofAt = <K extends DofKey>(keys: K[], f: number): DofValue => {
  let i = 0;
  while (i + 1 < keys.length && f >= keys[i + 1].f) i++;
  const d = keys[i], p = keys[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};

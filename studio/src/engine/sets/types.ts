// Set contract. A "set" is the reusable physical world of an episode (town, forest, station, ship...).
// Sets expose their model list and a build function; episodes decide camera, story and cast.
// Persistent sets: build once per (set id, kit) and hand out clones, so episodes in one place share the geometry.
import * as THREE from "three";
import { Batch, Kit, prop, Ray } from "../build/build";

/** One placed prop from the model kit. `h` is metres, `yaw` radians, `y` the ground height at that spot. */
export type SetPiece = { asset: string; x: number; z: number; h?: number; yaw?: number; y?: number };

export type SetDefinition = {
  id: string;
  title: string;
  /** the Kenney folder the set's models come from */
  assetDir: string;
  /** models this set loads */
  kit: readonly string[];
  /** ground plate height in metres (bridge town: 6) */
  groundY: number;
  /** add geometry and props to root; `rays` are sight lines the builder should keep clear */
  build(root: THREE.Object3D, kit: Kit, rays?: Ray[]): void;
  /** optional declarative dressing, merged into one batch after build() */
  pieces?: SetPiece[];
};

/** Add a declarative prop list to a batch (deterministic, no randomness). */
export const placePieces = (b: Batch, kit: Kit, pieces: readonly SetPiece[], groundY = 0) => {
  for (const p of pieces) prop(b, kit, p.asset, p.x, p.y ?? groundY, p.z, p.h ?? 1, p.yaw ?? 0);
};

const built = new WeakMap<Kit, Map<string, THREE.Object3D>>();
/** Build a set once per kit and hand out clones, for episodes that revisit the same place. */
export const buildSet = (set: SetDefinition, kit: Kit, clone: (o: THREE.Object3D) => THREE.Object3D = (o) => o.clone(true)) => {
  let byKit = built.get(kit);
  if (!byKit) { byKit = new Map(); built.set(kit, byKit); }
  let root = byKit.get(set.id);
  if (!root) {
    root = new THREE.Object3D();
    set.build(root, kit);
    if (set.pieces?.length) { const b = new Batch(); placePieces(b, kit, set.pieces, set.groundY); b.build(root); }
    byKit.set(set.id, root);
  }
  return clone(root);
};

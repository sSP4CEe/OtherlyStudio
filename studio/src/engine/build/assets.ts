// Asset registry: one loader for CC0 Kenney kits (and any future GLTF folder) with per-folder caching.
// Episodes name the models they need; the engine handles fetching, caching and missing-file tolerance.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { staticFile } from "remotion";
import type { Kit } from "./build";

const cache = new Map<string, Promise<Kit>>();

/**
 * Load a named Kenney kit from `public/<dir>/<name>.glb`.
 * Missing files are skipped (a set still builds, with that prop absent).
 */
export const loadKenneyKit = (names: readonly string[], dir = "bridge/kenney"): Promise<Kit> => {
  const key = `${dir}|${names.join(",")}`;
  let p = cache.get(key);
  if (!p) {
    const loader = new GLTFLoader();
    p = Promise.all(names.map((n) =>
      loader.loadAsync(staticFile(`${dir}/${n}.glb`)).then((g) => [n, g.scene] as const).catch(() => [n, null] as const)))
      .then((list) => Object.fromEntries(list.filter((e) => e[1]).map(([n, s]) => [n, s!])) as Kit);
    cache.set(key, p);
  }
  return p;
};

/** Clone one model at a target height (metres). Returns null when the model is missing. */
export const cloneAt = (kit: Kit, name: string, h: number): THREE.Object3D | null => {
  const src = kit[name];
  if (!src) return null;
  const o = src.clone(true);
  const bb = new THREE.Box3().setFromObject(o), size = bb.getSize(new THREE.Vector3());
  const s = h / Math.max(1e-6, size.y);
  o.scale.setScalar(s);
  o.position.y -= bb.min.y * s;
  return o;
};

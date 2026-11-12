// An episode is content + a small contract; everything else is the shared engine.
//   EpisodeDefinition -> Episode -> ShotView -> EpisodeScene.update() per frame -> engine post chain.
// Episodes own their story, set, cast blocking, kit and shot list. They never own the compositor or the look math.
import type * as THREE from "three";
import type { LightName } from "../look/lights";
import type { GradeName } from "../post/grade";
import type { DofValue, Layer } from "../stage/timeline";
import type { V3 } from "../stage/camera";

/** The minimum a shot must expose to be rendered: a frame range and its light preset. */
export type EpisodeShot = { id: number; a: number; b: number; light: LightName; grade?: GradeName };

/** A posed set. `update` must be a pure function of (shot id, frame) and return the camera look target. */
export type EpisodeScene = {
  root: THREE.Object3D;
  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene): THREE.Vector3;
};

export type EpisodeTimeline<S extends EpisodeShot = EpisodeShot> = {
  total: number;
  fps: number;
  shots: S[];
  /** base shot plus the next shot fading in during a crossfade */
  layersAt(f: number): Layer[];
  /** thin-lens DOF at frame f (cInf = blur circle at 1080x1920 infinity, focus = world point) */
  dofAt(f: number): DofValue;
  /** white flash opacity at frame f (0 = off) */
  flashOpacity?(f: number): number;
};

export type EpisodeDefinition<K = unknown, S extends EpisodeShot = EpisodeShot> = {
  /** composition id, also the output folder name */
  id: string;
  title: string;
  series?: string;
  /** page colour behind the WebGL canvases (also what a missing frame shows) */
  background: string;
  timeline: EpisodeTimeline<S>;
  /** load the set's models; resolves when they are ready */
  loadKit(): Promise<K>;
  /** build one scene per rendered shot layer (crossfades stack two) */
  createWorld(kit: K): EpisodeScene;
  /** colour grade per shot, default: the shot's light */
  gradeOf?(shot: S): GradeName;
};

export type { V3 };

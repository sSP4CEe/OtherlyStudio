// Public engine surface. Episodes (and only episodes) may import from here; engine modules import each other
// directly so this barrel never creates a cycle.

// --- episode runtime ---
export { makeEpisode } from "./episode/Episode";
export type { EpisodeDefinition, EpisodeScene, EpisodeShot, EpisodeTimeline } from "./episode/types";

// --- stage: camera grammar + timeline ---
export { clamp01, smooth, easeOut, glide, runKeys, dolly, zoom, rolled } from "./stage/camera";
export type { V3, Cam, Shot, Key } from "./stage/camera";
export { shotAt, layersAt, dofAt } from "./stage/timeline";
export type { DofKey, DofValue, Layer } from "./stage/timeline";

// --- look: light presets, shading, painted textures ---
export { LIGHTS, LOOK, LIGHT_NAMES } from "./look/lights";
export type { LightName, LightPreset } from "./look/lights";
export { GRADES, GRADE_STRENGTH, gradeFor } from "./post/grade";
export type { GradeName, GradeParams } from "./post/grade";
export { NOINK } from "./post/ink";

// --- build: geometry, props, assets ---
export { Batch, Strand, boxGeo, house, prop, kitClone, setSight, clearSight, V, lam } from "./build/build";
export type { Kit, Ray } from "./build/build";
export { loadKenneyKit, cloneAt } from "./build/assets";

// --- cast: toon drawing API + billboards ---
export { Pen, soldier } from "./cast/toon";
export type { Outfit, Build } from "./cast/toon";
export { Pool, Actor, Fx, SU, findSun, light2D, viewOf } from "./cast/actor";
export type { Place, FxPlace, CamInfo, Stage } from "./cast/actor";

// --- sets: persistent places ---
export { buildSet, placePieces } from "./sets/types";
export type { SetDefinition, SetPiece } from "./sets/types";

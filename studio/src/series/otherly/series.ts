// Series bible: what stays constant across every Otherly short. Episodes may not change these; they choose a
// light preset, a set and a cast from the canon instead.
export const SERIES = {
  id: "otherly",
  title: "Otherly",
  tagline: "Small true stories, told by people who were almost there.",
  /** vertical short, authored at 1080x1920 and exported at 1440x2560 (--scale 1.3333) */
  width: 1080,
  height: 1920,
  fps: 30,
  aspect: "9:16",
  defaultRuntimeSeconds: 70,
  language: "en",
} as const;

/** The look contract. These are style rules, not suggestions: the engine enforces most of them. */
export const STYLE = {
  characters: "flat Canvas2D cards (600x1000 design space) shaded by cardShade, yaw-only billboards, ink outlines",
  world: "painted low-poly 3D sets with black ink lines, saturated sky, aerial haze",
  camera: "continuous slow push-ins; symmetric smootherstep glides 18-40 f; cuts on reframes; no hand-held float",
  post: "ink -> thin-lens DOF -> bloom (emissive only) -> neutral tone map -> display-referred grade; MSAA 4",
  sound: "music +3 dB, SFX -6 dB, voice unchanged; one steady voice tone",
  titles: "no captions, no on-screen labels, no channel branding",
  grain: "off: the reference measures no grain and it quadruples the 2K file size",
} as const;

/** Roadmap of the current season. `status` drives nothing at render time; it is for humans and tooling. */
export const SEASON_1 = [
  { episode: 1, id: "BridgeShort", title: "The Bridge That Fell for a Song", setting: "broughton-1831", light: ["day", "golden"], status: "released" },
] as const;

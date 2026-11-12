// "The Bridge That Fell for a Song": our original 67 s short in the flat-characters-in-a-3D-toon-world style.
// Episode content lives here (story timeline, set, cast blocking); the renderer is the shared engine/episode runtime.
// One three.js world (world.ts) posed per frame from the story timeline (story.ts).
import { makeEpisode, type EpisodeDefinition, type Kit } from "../../engine";
import { World, loadKit } from "./world";
import { TOTAL, FLASH_AT, SHOTS, ShotDef, layersAt, dofAt } from "./story";

const flashFrames = [1, 0.75, 0.45, 0.2];

export const bridgeEpisode: EpisodeDefinition<Kit, ShotDef> = {
  id: "BridgeShort",
  title: "The Bridge That Fell for a Song",
  series: "otherly",
  background: "#cfe3f2",
  timeline: {
    total: TOTAL,
    fps: 30,
    shots: SHOTS,
    layersAt,
    dofAt,
    flashOpacity: (f) => (f >= FLASH_AT && f < FLASH_AT + flashFrames.length ? flashFrames[f - FLASH_AT] : 0),
  },
  loadKit,
  createWorld: (kit) => new World(kit),
};

export const BridgeShort = makeEpisode(bridgeEpisode);
export const BRIDGE_FRAMES = TOTAL;

// Episode registry: every composition the studio can render. Add an episode by exporting its definition here.
import { type EpisodeDefinition } from "../engine";
import { bridgeEpisode } from "./broughton/Bridge";

export const EPISODES: EpisodeDefinition<any, any>[] = [bridgeEpisode];

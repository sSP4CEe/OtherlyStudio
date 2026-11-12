import React from "react";
import { Composition } from "remotion";
import { EPISODES } from "./episodes";
import { makeEpisode } from "./engine";
import { SERIES } from "./series/otherly";

// One <Composition> per registered episode: src/episodes/index.ts -> src/episodes/<name>/.
// Shared renderer: src/engine/. Series canon and manifests: src/series/otherly/.
const components = new Map(EPISODES.map((e) => [e.id, makeEpisode(e)]));

export const Root: React.FC = () => (
  <>
    {EPISODES.map((e) => (
      <Composition
        key={e.id}
        id={e.id}
        component={components.get(e.id)!}
        durationInFrames={e.timeline.total}
        fps={e.timeline.fps}
        width={SERIES.width}
        height={SERIES.height}
      />
    ))}
  </>
);

// Example sandbox entry. Copy to src/sandboxes/<name>/index.tsx and point it at the episode (or a sandbox copy)
// you want to render, then run: EPISODE_ENTRY=src/sandboxes/<name>/index.tsx node scripts/bridge-stills.mjs ...
// Paths below are relative to src/sandboxes/<name>/.
import React from "react";
import { Composition, registerRoot } from "remotion";
import { BridgeShort, BRIDGE_FRAMES } from "../../episodes/broughton/Bridge";

const Root: React.FC = () => <Composition id="BridgeShort" component={BridgeShort} durationInFrames={BRIDGE_FRAMES} fps={30} width={1080} height={1920} />;
registerRoot(Root);

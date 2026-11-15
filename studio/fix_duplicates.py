with open(r'C:\OtherlyStudio\studio\src\episodes\broughton\cast.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove duplicate imports block
old = '''};

import {
  FPS, D0, FILES, ROW_GAP, COUNT, PARK, SHOTS, SNAP, DROP0, DROP1, DROP_H, V3, front, marchPhase, stomp, deckY, dropW, dropU, shapeZ,
  smooth, clamp01, BridgeState,
} from "./story";
import { LIGHTS, LightName } from "../../engine/look/lights";
import { NOINK } from "../../engine/post/ink";
import { tierWithHysteresis, TIER_BOUNDARIES } from "../../engine/cast/rig/cache";

// ---------------- per-character tier state for hysteresis ----------------
const characterTiers = new Map<string, number>();'''

new = '''};}

// ---------------- per-character tier state for hysteresis ----------------
const characterTiers = new Map<string, number>();'''

content = content.replace(old, new)

with open(r'C:\OtherlyStudio\studio\src\episodes\broughton\cast.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
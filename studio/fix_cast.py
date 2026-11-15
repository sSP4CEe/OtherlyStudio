import re

with open(r'C:\OtherlyStudio\studio\src\episodes\broughton\cast.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove duplicate imports block
old_block = '};\\n\\nimport {\\n  FPS, D0, FILES, ROW_GAP, COUNT, PARK, SHOTS, SNAP, DROP0, DROP1, DROP_H, V3, front, marchPhase, stomp, deckY, dropW, dropU, shapeZ,\\n  smooth, clamp01, BridgeState,\\n} from "./story";\\nimport { LIGHTS, LightName } from "../../engine/look/lights";\\nimport { NOINK } from "../../engine/post/ink";\\nimport { tierWithHysteresis, TIER_BOUNDARIES } from "../../engine/cast/rig/cache";\\n\\n// ---------------- per-character tier state for hysteresis ----------------\\nconst characterTiers = new Map<string, number>();'

new_block = '};\\n\\n// ---------------- per-character tier state for hysteresis ----------------\\nconst characterTiers = new Map<string, number>();'

content = content.replace(old_block, new_block)

with open(r'C:\OtherlyStudio\studio\src\episodes\broughton\cast.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
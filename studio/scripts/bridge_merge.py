# Merge look sandboxes back into the main project, by owned files.
# Layout: a sandbox is src/sandboxes/bridge_<owner>/ holding only the files it owns (by basename).
# Engine files live in src/engine/, episode content in src/episodes/broughton/.
# Backs up both trees first (backup/bridge_<time>/), copies each sandbox's owned files, reports missing/unchanged.
# Usage: python scripts/bridge_merge.py [cam,world,look,mat,char,post]
import os, shutil, sys, time, filecmp

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # the studio folder
EPISODE = os.path.join(ROOT, "src/episodes/broughton")
ENGINE = os.path.join(ROOT, "src/engine")
SANDBOXES = os.path.join(ROOT, "src/sandboxes")
OWN = {  # owner -> {sandbox basename: destination folder}
    "cam": {"story.ts": EPISODE},
    "world": {"world.ts": EPISODE, "town.ts": EPISODE},
    "look": {"lights.ts": os.path.join(ENGINE, "look"), "shade.ts": os.path.join(ENGINE, "look")},
    "mat": {"build.ts": os.path.join(ENGINE, "build"), "paint.ts": os.path.join(ENGINE, "look")},
    "char": {"toon.ts": os.path.join(ENGINE, "cast"), "cardshade.ts": os.path.join(ENGINE, "cast"), "cast.ts": EPISODE},
    "post": {"ink.ts": os.path.join(ENGINE, "post"), "lensblur.ts": os.path.join(ENGINE, "post"),
             "grade.ts": os.path.join(ENGINE, "post"), "Episode.tsx": os.path.join(ENGINE, "episode")},
}
which = sys.argv[1].split(",") if len(sys.argv) > 1 else list(OWN)
bak = os.path.join(ROOT, "backup", time.strftime("bridge_%Y%m%d_%H%M%S"))
shutil.copytree(EPISODE, os.path.join(bak, "broughton"))
shutil.copytree(ENGINE, os.path.join(bak, "engine"))
print("backup ->", bak)
for box in which:
    src = os.path.join(SANDBOXES, f"bridge_{box}")
    for name, dest in OWN[box].items():
        a, b = os.path.join(src, name), os.path.join(dest, name)
        if not os.path.exists(a):
            print(f"  {box}: {name} not in sandbox (skipped)")
            continue
        if os.path.exists(b) and filecmp.cmp(a, b, shallow=False):
            print(f"  {box}: {name} unchanged")
            continue
        shutil.copy2(a, b)
        print(f"  {box}: {name} -> {os.path.relpath(b, ROOT)}")

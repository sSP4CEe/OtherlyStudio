# Writes <out>/shots.json (shot ranges, crossfade windows, flash, planned cuts, kicks) from an episode's story.ts
# for scripts/short_qa.py. Episode metadata comes from studio/episodes.json.
#
#   python scripts/episode_shots.py                 # first episode in the manifest
#   python scripts/episode_shots.py BridgeShort     # by composition id
#   python scripts/episode_shots.py src/episodes/broughton/story.ts out/broughton
import json, math, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
manifest = json.load(open(os.path.join(ROOT, "episodes.json"), encoding="utf-8"))
series = manifest.get("series", {})
fps = int(series.get("fps", 30))


def pick_episode(arg: str | None):
    eps = manifest["episodes"]
    if not arg:
        return eps[0]
    for e in eps:
        if e["id"] == arg or e.get("dir") == arg or e.get("story") == arg:
            return e
    raise SystemExit(f"unknown episode {arg!r}; known: {', '.join(e['id'] for e in eps)}")


def main(argv: list[str]):
    episode = pick_episode(argv[0] if argv else None)
    story = os.path.join(ROOT, episode.get("story", f"{episode['dir']}/story.ts"))
    out_arg = argv[1] if len(argv) > 1 else episode.get("outDir", "out/" + episode["id"].lower())
    out_dir = out_arg if os.path.isabs(out_arg) else os.path.join(ROOT, out_arg)
    src = open(story, encoding="utf-8").read()

    total = int(re.search(r"TOTAL = (\d+)", src).group(1))
    shots = [
        {"id": int(i), "a": int(a), "b": total if b == "TOTAL" else int(b)}
        for i, a, b in re.findall(r"\{\s*id: (\d+),\s*a: (\d+),\s*b: (\w+),", src)
    ]
    xf = {int(k): int(v) for k, v in re.findall(r"(\d+): (\d+)", re.search(r"XFADE[^=]*= \{([^}]*)\}", src).group(1))} if "XFADE" in src else {}
    flash_at = re.search(r"FLASH_AT = (\d+)", src)
    flash = int(flash_at.group(1)) if flash_at else 0

    xfade = [[s["a"] - xf[s["id"]] // 2, s["a"] + xf[s["id"]] // 2] for s in shots if s["id"] in xf]
    cuts = [[int(f), int(f)] for f in re.findall(r"\{ f: (\d+), cut: true", src)]
    consts = {k: float(v) for k, v in re.findall(r"(SNAP|DROP0|DROP1) = ([\d.]+)", src)}
    kicks = []
    m = re.search(r"const KICKS[^=]*= \[(.*?)\];", src)
    if m:
        for t0, _ in re.findall(r"\[([\w.]+), ([\d.]+)\]", m.group(1)):
            f0 = round((consts[t0] if t0 in consts else float(t0)) * fps)
            kicks.append([f0, f0 + 8])

    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "shots.json")
    json.dump({"shots": shots, "xfade": xfade, "flash": [flash, flash + 4] if flash_at else [0, 0], "planned": cuts + kicks}, open(out, "w"), indent=1)
    print(f"{episode['id']}: {len(shots)} shots -> {os.path.relpath(out, ROOT)}", xfade, "flash", flash, "cuts", [c[0] for c in cuts], "kicks", kicks)


if __name__ == "__main__":
    main(sys.argv[1:])

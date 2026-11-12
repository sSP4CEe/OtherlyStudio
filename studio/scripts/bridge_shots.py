# Backwards-compatible wrapper: the bridge short is episode "BridgeShort" in episodes.json.
# Default output stays out/bridge/shots.json (the path short_qa.py docs use); pass args to override.
#   python scripts/bridge_shots.py [story.ts|episode-id] [outdir]
import os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import episode_shots

if __name__ == "__main__":
    argv = sys.argv[1:]
    if not argv:
        argv = ["BridgeShort", "out/bridge"]
    episode_shots.main(argv)

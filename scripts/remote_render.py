#!/usr/bin/env python3
"""
Remote render workflow - sync project to gaming laptop, render there, sync back.
Usage: python remote_render.py --host user@laptop --frames 0-150 --resolution production
"""
import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

STUDIO_DIR = Path(__file__).parent.parent / "studio"

def run_cmd(cmd, cwd=None, timeout=None):
    print(f"Running: {cmd}")
    try:
        result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        if result.stdout:
            print(result.stdout)
        if result.stderr:
            print(result.stderr, file=sys.stderr)
        return result.returncode == 0, result.stdout
    except subprocess.TimeoutExpired:
        print(f"Timed out after {timeout}s")
        return False, ""
    except Exception as e:
        print(f"Error: {e}")
        return False, ""

def main():
    parser = argparse.ArgumentParser(description="Remote render on gaming laptop")
    parser.add_argument("--host", required=True, help="SSH host (user@ip)")
    parser.add_argument("--frames", default="0-150", help="Frame range")
    parser.add_argument("--resolution", choices=["preview", "production", "high-quality"], default="production")
    parser.add_argument("--chunk-size", type=int, default=25)
    parser.add_argument("--remote-path", default="~/otherly_render", help="Remote directory")
    parser.add_argument("--sync-only", action="store_true", help="Only sync, don't render")
    args = parser.parse_args()

    RESOLUTIONS = {
        "preview": {"scale": "0.6666666666666666", "suffix": "preview"},
        "production": {"scale": "1.0", "suffix": "production"},
        "high-quality": {"scale": "1.3333333333333333", "suffix": "hq"},
    }
    res = RESOLUTIONS[args.resolution]

    remote = args.host
    remote_path = args.remote_path
    scale = res["scale"]
    suffix = res["suffix"]

    # 1. Sync project to remote (exclude node_modules, .git, out, etc.)
    print(f"\n=== Syncing to {remote}:{remote_path} ===")
    exclude = [
        "--exclude=node_modules/",
        "--exclude=.git/",
        "--exclude=out/",
        "--exclude=.next/",
        "--exclude=dist/",
        "--exclude=*.log",
        "--exclude=*.mp4",
    ]
    rsync_cmd = f"rsync -avz --delete {' '.join(exclude)} {STUDIO_DIR}/ {remote}:{remote_path}/"
    success, _ = run_cmd(rsync_cmd, timeout=300)
    if not success:
        print("Sync failed")
        return 1

    if args.sync_only:
        print("Sync complete")
        return 0

    # 2. Install deps on remote (if needed)
    print("\n=== Installing deps on remote ===")
    install_cmd = f"ssh {remote} 'cd {remote_path} && npm ci --prefer-offline'"
    success, _ = run_cmd(install_cmd, timeout=300)
    if not success:
        print("Remote install failed")
        return 1

    # 3. Render in chunks
    start, end = map(int, args.frames.split("-"))
    total = end - start + 1
    chunk_size = args.chunk_size

    print(f"\n=== Rendering {end-start+1} frames in chunks of {args.chunk_size} ===")

    chunk_files = []
    for chunk_start in range(start, end + 1, args.chunk_size):
        chunk_end = min(chunk_start + args.chunk_size - 1, end)
        chunk_num = len(chunk_files) + 1
        chunk_file = f"chunk_{chunk_num:03d}_{suffix}.mp4"

        print(f"\n=== Chunk {chunk_num}: frames {chunk_start}-{chunk_end} ===")

        cmd = (
            f"ssh {remote} 'cd {remote_path} && "
            f"npx remotion render src/index.ts BridgeShort "
            f"out/bridge/{chunk_file} "
            f"--codec h264 --crf 16 --scale {scale} "
            f"--concurrency 1 --frames={chunk_start}-{chunk_end} "
            f"--timeout 600000'"
        )

        success, _ = run_cmd(cmd, timeout=7200)
        if not success:
            print(f"Chunk {chunk_num} failed!")
            return 1

        # Pull chunk back
        pull_cmd = f"rsync -avz {remote}:{remote_path}/out/bridge/{chunk_file} {STUDIO_DIR}/out/bridge/"
        success, _ = run_cmd(pull_cmd, timeout=60)
        if not success:
            print("Failed to pull chunk")
            return 1

        print(f"Chunk {chunk_num} complete")

    # 4. Concatenate locally
    print("\n=== Concatenating chunks ===")
    chunk_files = sorted(STUDIO_DIR.glob(f"out/bridge/chunk_*_{suffix}.mp4"))
    concat_file = STUDIO_DIR / "out" / "bridge" / "concat_list.txt"
    with open(concat_file, "w") as f:
        for cf in chunk_files:
            f.write(f"file '{cf.resolve()}'\n")

    final_output = STUDIO_DIR / "out" / "bridge" / f"final_{suffix}.mp4"
    concat_cmd = f"ffmpeg -y -f concat -safe 0 -i {concat_file} -c copy {final_output}"
    success, _ = run_cmd(concat_cmd, timeout=60)

    if success:
        print(f"\n✅ Complete: {final_output}")
        # Cleanup chunks
        for cf in chunk_files:
            cf.unlink(missing_ok=True)
        concat_file.unlink(missing_ok=True)
    else:
        print("Concatenation failed")

    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
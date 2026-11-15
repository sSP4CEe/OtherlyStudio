#!/usr/bin/env python3
"""
Chunked rendering for Remotion - renders in small batches to avoid memory leaks,
then concatenates with ffmpeg.
"""
import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

STUDIO_DIR = Path(__file__).parent.parent
OUT_DIR = STUDIO_DIR / "out" / "bridge"

def run_cmd(cmd, cwd=None, env=None, timeout=None):
    """Run a command and return (success, output)."""
    if os.name == 'nt':
        # On Windows, always use shell
        cmd_str = ' '.join(cmd) if isinstance(cmd, list) else cmd
        print(f"Running: {cmd_str}")
        try:
            result = subprocess.run(
                cmd_str, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout, shell=True
            )
            if result.stdout:
                print(result.stdout)
            if result.stderr:
                print(result.stderr, file=sys.stderr)
            return result.returncode == 0, result.stdout
        except subprocess.TimeoutExpired:
            print(f"Command timed out after {timeout}s")
            return False, ""
        except Exception as e:
            print(f"Error running command: {e}")
            return False, ""
    else:
        # Unix-like
        print(f"Running: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
        try:
            result = subprocess.run(
                cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout, shell=isinstance(cmd, str)
            )
            if result.stdout:
                print(result.stdout)
            if result.stderr:
                print(result.stderr, file=sys.stderr)
            return result.returncode == 0, result.stdout
        except subprocess.TimeoutExpired:
            print(f"Command timed out after {timeout}s")
            return False, ""
        except Exception as e:
            print(f"Error running command: {e}")
            return False, ""

def render_chunk(chunk_start, chunk_end, scale, output_file):
    """Render a single chunk of frames."""
    env = os.environ.copy()
    env["REMOTION_SCALE"] = str(scale)
    
    cmd = [
        "npx", "remotion", "render",
        "src/index.ts", "BridgeShort",
        str(output_file),
        "--codec", "h264",
        "--crf", "16",
        "--concurrency", "1",
        "--frames", f"{chunk_start}-{chunk_end}",
        "--timeout", "300000"
    ]
    
    success, _ = run_cmd(cmd, cwd=STUDIO_DIR, env=env, timeout=600)
    return success

def concatenate_chunks(chunk_files, output_file):
    """Concatenate video chunks using ffmpeg."""
    # Create concat file
    concat_file = OUT_DIR / "concat_list.txt"
    with open(concat_file, "w") as f:
        for chunk in chunk_files:
            f.write(f"file '{chunk.resolve()}'\n")
    
    cmd = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", str(concat_file),
        "-c", "copy",
        str(output_file)
    ]
    
    success, _ = run_cmd(cmd, timeout=60)
    
    # Cleanup
    concat_file.unlink(missing_ok=True)
    for chunk in chunk_files:
        chunk.unlink(missing_ok=True)
    
    return success

def main():
    parser = argparse.ArgumentParser(description="Chunked rendering for Remotion")
    parser.add_argument("--resolution", choices=["preview", "production", "high-quality"], default="production")
    parser.add_argument("--chunk-size", type=int, default=25, help="Frames per chunk")
    parser.add_argument("--frames", default="0-150", help="Frame range (e.g., 0-150)")
    args = parser.parse_args()
    
    RESOLUTIONS = {
        "preview": {"scale": 2/3, "suffix": "preview"},
        "production": {"scale": 1.0, "suffix": "production"},
        "high-quality": {"scale": 4/3, "suffix": "hq"},
    }
    
    resolution = RESOLUTIONS[args.resolution]
    scale = resolution["scale"]
    suffix = resolution["suffix"]
    
    # Parse frame range
    start_frame, end_frame = map(int, args.frames.split("-"))
    total_frames = end_frame - start_frame + 1
    
    print(f"Chunked rendering: {total_frames} frames in chunks of {args.chunk_size}")
    print(f"Resolution: {args.resolution} (scale={scale}x)")
    
    chunk_files = []
    chunk_num = 0
    
    for chunk_start in range(start_frame, end_frame + 1, args.chunk_size):
        chunk_end = min(chunk_start + args.chunk_size - 1, end_frame)
        chunk_num += 1
        chunk_file = OUT_DIR / f"chunk_{chunk_num:03d}_{suffix}.mp4"
        
        print(f"\n=== Chunk {chunk_num}: frames {chunk_start}-{chunk_end} ===")
        
        success = render_chunk(chunk_start, chunk_end, scale, chunk_file)
        if not success:
            print(f"Chunk {chunk_num} failed!")
            return 1
        
        chunk_files.append(chunk_file)
        print(f"Chunk {chunk_num} complete")
    
    # Concatenate
    print(f"\n=== Concatenating {len(chunk_files)} chunks ===")
    final_output = OUT_DIR / f"final_{suffix}.mp4"
    
    success = concatenate_chunks(chunk_files, final_output)
    if success:
        print(f"\n✅ Complete: {final_output}")
    else:
        print("\n❌ Concatenation failed!")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
"""Numeric still comparison without Pillow: decode JPEGs with ffmpeg into raw RGB and diff them.

Usage: python scripts/diff_stills.py [frames] [candidate-prefix]
  frames:            comma list or years, default "100,700,1500"
  candidate-prefix:  path prefix of the new stills, default "out/refactor/check_"
"""
import subprocess, sys, numpy as np

W, H = 540, 960


def load(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, H, W, 3)[0].astype(np.int16)


frames = (sys.argv[1] if len(sys.argv) > 1 else "100,700,1500").split(",")
prefix = sys.argv[2] if len(sys.argv) > 2 else "out/refactor/check_"
for fr in frames:
    a = load(f"out/baseline/bridge_{fr}.jpg")
    b = load(f"{prefix}{fr}.jpg")
    d = np.abs(a - b)
    print(f"{fr}: mean={d.mean():.3f} max={d.max()} p99={np.percentile(d, 99):.1f} pct>8={100 * (d.max(axis=2) > 8).mean():.3f}%")

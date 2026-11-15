"""Numeric still comparison without Pillow: decode JPEGs with ffmpeg into raw RGB and diff them.

Usage: python scripts/diff_stills.py [frames] [candidate-prefix] [baseline-prefix]
  frames:            comma list or years, default "100,700,1500"
  candidate-prefix:  path prefix of the new stills, default "out/refactor/check_"
  baseline-prefix:   path prefix of the reference stills, default "out/baseline/bridge_"

`ink=` counts pixels darker than the surface ink (#241726, max channel 60); `dink` is the change against
the baseline in percent of the frame. A refactor that changes the outline weight fails here even when the
mean diff is small.
"""
import subprocess, sys, numpy as np

W, H = 540, 960
INK_MAX = 60


def load(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, H, W, 3)[0].astype(np.int16)


frames = (sys.argv[1] if len(sys.argv) > 1 else "100,700,1500").split(",")
prefix = sys.argv[2] if len(sys.argv) > 2 else "out/refactor/check_"
base = sys.argv[3] if len(sys.argv) > 3 else "out/baseline/bridge_"
failed = False
for fr in frames:
    a = load(f"{base}{fr}.jpg")
    b = load(f"{prefix}{fr}.jpg")
    d = np.abs(a - b)
    ink_a = 100 * (a.max(axis=2) <= INK_MAX).mean()
    ink_b = 100 * (b.max(axis=2) <= INK_MAX).mean()
    print(f"{fr}: mean={d.mean():.3f} max={d.max()} p99={np.percentile(d, 99):.1f} pct>8={100 * (d.max(axis=2) > 8).mean():.3f}% "
          f"ink={ink_b:.3f}% dink={ink_b - ink_a:+.3f}pp")
    if d.max() != 0:
        failed = True
sys.exit(1 if failed else 0)

"""Print mean RGB / luma of stills so preset colour shifts can be checked without opening the images."""
import subprocess, sys, numpy as np

W, H = 540, 960


def load(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, H, W, 3)[0]


for p in sys.argv[1:]:
    a = load(p).astype(np.float64)
    y = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    print(f"{p}: R={a[...,0].mean():.1f} G={a[...,1].mean():.1f} B={a[...,2].mean():.1f} "
          f"Y={y.mean():.1f} p5={np.percentile(y,5):.0f} p95={np.percentile(y,95):.0f}")

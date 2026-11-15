# Remote Render Setup - Gaming Laptop (GTX 1650)

## Hardware
- **GPU**: NVIDIA GTX 1650 (4GB VRAM) - **~15x faster** than integrated for Three.js
- **RAM**: 8GB - Use chunked rendering (25 frames/chunk)
- **OS**: Windows 10/11

---

## Quick Setup (5 minutes)

### On Gaming Laptop:
```powershell
# 1. Enable OpenSSH Server
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType 'Automatic'

# 2. Set password for your user
net user %USERNAME% *

# 3. Get laptop IP
ipconfig | findstr IPv4
```

### On Main Machine:
```bash
# Test connection
ssh yourusername@192.168.X.X

# Run remote render (5 sec preview)
python scripts/remote_render.py --host user@192.168.X.X --frames 0-149 --resolution preview --chunk-size 25
```

---

## Expected Performance (GTX 1650)

| Resolution | Frames | Time (est) |
|------------|--------|------------|
| 720p (preview) | 150 frames | ~5-8 min |
| 1080p (production) | 150 frames | ~10-15 min |
| Full 60s (2025 frames) | production | ~2-3 hours |

---

## Files Created

| File | Purpose |
|------|---------|
| `scripts/remote_render.py` | Main orchestration script |
| `REMOTE_RENDER_SETUP.md` | This file |

---

## How It Works

1. **Sync** project via rsync (excludes node_modules, .git, outputs)
2. **Remote install** `npm ci` on laptop
3. **Chunked render** 25 frames at a time (avoids 8GB RAM limit)
4. **Auto-pull** each chunk via rsync
4. **Local concatenate** with ffmpeg

---

## Requirements

### Main Machine:
- rsync, ssh, python3, ffmpeg

### Gaming Laptop:
- Windows 10/11 with OpenSSH Server
- Node.js 18+, npm
- Git (for repo sync)
- Chrome (for Remotion)

---

## Troubleshooting

**SSH connection refused:**
```powershell
# On laptop - check firewall
Get-NetFirewallRule -Name "*SSH*" | Set-NetFirewallRule -Enabled True
```

**Out of memory:**
- Reduce `--chunk-size` to 15
- Close other apps on laptop

**Slow rsync:**
- Use wired ethernet
- Exclude more: `--exclude=*.png --exclude=*.jpg`

---

## Alternative: GitHub Actions (if repo is public/private)

```yaml
# .github/workflows/render.yml
on: [workflow_dispatch]
jobs:
  render:
    runs-on: windows-latest  # Has GPU
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx remotion render ...
```

---

## Quick Test First

```bash
# Test connection
ssh user@laptop "echo connected"

# Test 3-frame render
python scripts/remote_render.py --host user@laptop --frames 0-2 --resolution preview
```

Expected: ~30 seconds for 3 frames on GTX 1650.
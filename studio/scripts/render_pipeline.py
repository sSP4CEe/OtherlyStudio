#!/usr/bin/env python3
"""
Otherly End-to-End Production Pipeline

This script orchestrates the complete video production workflow:
1. Generate voice narration (ElevenLabs: Jeremy voice, edge-tts fallback)
2. Mix audio (voice + music + SFX) using mix.py
3. Render video at specified resolution
4. Mux audio with video using ffmpeg

Usage:
    python render_pipeline.py [--resolution preview|production|high-quality] [--episode EPISODE_ID] [--frames FRAME_RANGE]

ElevenLabs Setup:
    1. Set ELEVENLABS_API_KEY in environment or .env file
    2. Pipeline uses Jeremy voice (snODv2VnG1inLn1Ba0dk) - requires paid plan
    3. Falls back to edge-tts if API key not set or quota exceeded
"""

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

# Resolution presets
RESOLUTIONS = {
    "preview": {"scale": 2/3, "width": 720, "height": 1280, "suffix": "preview"},
    "production": {"scale": 1.0, "width": 1080, "height": 1920, "suffix": "production"},
    "high-quality": {"scale": 4/3, "width": 1440, "height": 2560, "suffix": "hq"},
}

DEFAULT_EPISODE = "BridgeShort"
STUDIO_DIR = Path(__file__).parent.parent
SHORTS_DIR = STUDIO_DIR / "shorts" / "bridge"
AUDIO_DIR = SHORTS_DIR / "audio"
VOICE_DIR = SHORTS_DIR / "voice"
OUT_DIR = STUDIO_DIR / "out" / "bridge"

def run_cmd(cmd, cwd=None, env=None, timeout=None):
    """Run a command and return (success, output)."""
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

def generate_voice():
    """Generate voice narration using ElevenLabs (Jeremy voice) with edge-tts fallback."""
    print("\n=== Generating Voice Narration (ElevenLabs: Jeremy) ===")
    os.chdir(AUDIO_DIR)
    # Use ElevenLabs script (tries ElevenLabs -> edge-tts)
    success, _ = run_cmd([sys.executable, "generate_voice_elevenlabs.py"], timeout=300)
    if not success:
        print("Failed to generate voice")
        return False
    
    # Copy to voice directory for mix.py
    VOICE_DIR.mkdir(exist_ok=True)
    import shutil
    shutil.copy2(VOICE_DIR / "voice.wav", AUDIO_DIR / "voice" / "voice.wav")
    shutil.copy2(VOICE_DIR / "words.json", AUDIO_DIR / "voice" / "words.json")
    return True

def mix_audio():
    """Run the audio mixing pipeline."""
    print("\n=== Mixing Audio ===")
    os.chdir(AUDIO_DIR)
    success, _ = run_cmd([sys.executable, "mix.py"], timeout=300)
    return success

def render_video(resolution, episode=DEFAULT_EPISODE, frames=None):
    """Render video at specified resolution."""
    print(f"\n=== Rendering Video ({resolution['width']}x{resolution['height']}) ===")
    os.chdir(STUDIO_DIR)
    
    output_file = OUT_DIR / f"video_{resolution['suffix']}.mp4"
    
    # Set environment variable for scale
    env = os.environ.copy()
    env["REMOTION_SCALE"] = str(resolution["scale"])
    
    # Build frames argument
    frames_arg = f" --frames={frames}" if frames else ""
    
    # On Windows, npx needs to be run via cmd /c or as a shell command
    if os.name == 'nt':
        cmd = f'cmd /c npx remotion render src/index.ts {episode} "{output_file}" --codec h264 --crf 16 --concurrency 1 --timeout 7200000{frames_arg}'
    else:
        cmd = [
            "npx", "remotion", "render",
            "src/index.ts", episode,
            str(output_file),
            "--codec", "h264",
            "--crf", "16",
            "--concurrency", "1",
            "--timeout", "7200000"
        ]
        if frames:
            cmd.extend(["--frames", frames])
    
    timeout = 300 if frames else 15000  # Short timeout for test frames
    success, _ = run_cmd(cmd, env=env, timeout=timeout)
    return success, output_file

def mux_audio_video(video_file, audio_file, output_file):
    """Mux audio with video using ffmpeg."""
    print(f"\n=== Muxing Audio with Video ===")
    if os.name == 'nt':
        cmd = f'cmd /c ffmpeg -y -i "{video_file}" -i "{audio_file}" -c:v copy -c:a aac -b:a 192k -shortest "{output_file}"'
    else:
        cmd = [
            "ffmpeg", "-y",
            "-i", str(video_file),
            "-i", str(audio_file),
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            str(output_file)
        ]
    success, _ = run_cmd(cmd, timeout=300)
    return success

def validate_output(video_file):
    """Validate the output video."""
    print(f"\n=== Validating Output ===")
    if os.name == 'nt':
        cmd = f'cmd /c ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration,codec_name -of default=noprint_wrappers=1 "{video_file}"'
    else:
        cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,duration,codec_name",
            "-of", "default=noprint_wrappers=1",
            str(video_file)
        ]
    success, output = run_cmd(cmd)
    if success:
        print(f"Video info: {output.strip()}")
    return success

def main():
    parser = argparse.ArgumentParser(description="Otherly Production Pipeline")
    parser.add_argument("--resolution", choices=list(RESOLUTIONS.keys()), default="production",
                        help="Output resolution preset")
    parser.add_argument("--episode", default=DEFAULT_EPISODE, help="Episode ID to render")
    parser.add_argument("--skip-voice", action="store_true", help="Skip voice generation")
    parser.add_argument("--skip-mix", action="store_true", help="Skip audio mixing")
    parser.add_argument("--skip-render", action="store_true", help="Skip video rendering")
    parser.add_argument("--skip-mux", action="store_true", help="Skip audio muxing")
    parser.add_argument("--frames", default=None, help="Frame range to render (e.g., '0-30')")
    args = parser.parse_args()
    
    resolution = RESOLUTIONS[args.resolution]
    print(f"Otherly Production Pipeline")
    print(f"Resolution: {resolution['width']}x{resolution['height']} (scale: {resolution['scale']}x)")
    print(f"Episode: {args.episode}")
    
    start_time = time.time()
    
    # Step 1: Generate voice
    if not args.skip_voice:
        if not generate_voice():
            print("Voice generation failed!")
            return 1
    else:
        print("Skipping voice generation")
    
    # Step 2: Mix audio
    if not args.skip_mix:
        if not mix_audio():
            print("Audio mixing failed!")
            return 1
    else:
        print("Skipping audio mixing")
    
    # Step 3: Render video
    video_file = None
    if not args.skip_render:
        success, video_file = render_video(resolution, args.episode, args.frames)
        if not success:
            print("Video rendering failed!")
            return 1
    else:
        video_file = OUT_DIR / f"video_{resolution['suffix']}.mp4"
        print(f"Skipping render, using existing: {video_file}")
    
    # Step 4: Mux audio with video
    if not args.skip_mux:
        audio_file = AUDIO_DIR / "mix.wav"
        final_output = OUT_DIR / f"final_{resolution['suffix']}.mp4"
        if not mux_audio_video(video_file, audio_file, final_output):
            print("Audio muxing failed!")
            return 1
        print(f"\n[OK] Final output: {final_output}")
        validate_output(final_output)
    else:
        print("Skipping audio muxing")
        validate_output(video_file)
    
    elapsed = time.time() - start_time
    print(f"\n=== Pipeline Complete in {elapsed:.1f}s ===")
    return 0

if __name__ == "__main__":
    sys.exit(main())
#!/usr/bin/env python3
"""
Generate voice narration using multiple local TTS engines (no API limits).

Priority order:
1. OmniVoice CLI (VoiceStudio) - best quality, voice design
2. OpenVoice v2 (direct Python) - MIT license, commercial OK, voice cloning
3. OmniVoice direct Python API (VoiceStudio backend)
4. edge-tts (Microsoft) - always works, free

VOICE CLONING SETUP:
    Place your reference audio at: shorts/bridge/audio/voice/my_reference.mp3 (or .wav)
    - 10-30 seconds of clean speech, single speaker
    - MP3 or WAV supported (auto-converts MP3 to WAV)
    - If file exists -> uses OpenVoice v2 for voice cloning
    - If not -> falls back to voice design (OmniVoice) or edge-tts

REQUIREMENTS:
    pip install openvoice torch torchaudio edge-tts
    # ffmpeg must be in PATH for MP3->WAV conversion
"""
# Force CPU usage to avoid CUDA driver issues with faster-whisper
import os
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"

import asyncio
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import edge_tts
    EDGE_TTS_AVAILABLE = True
except ImportError:
    EDGE_TTS_AVAILABLE = False

SCRIPT = """Seventy-four soldiers knocked down an iron bridge just by walking across it.
It's 1831, and the brand new bridge over the river is the pride of the whole town.
The men are marching home four across, every boot hitting the planks at the exact same moment.
Halfway over, the bridge starts bouncing under their feet.
A normal person would slow down, but these guys think it's hilarious.
Somebody starts whistling a marching tune, and the whole column stomps along to it, a little harder every step.
The bounce gets bigger, the chains start groaning, and nobody wants to be the one who breaks step.
Then a single bolt snaps, and the whole end of the bridge drops into the river.
Luckily, the river was only two feet deep.
Unluckily, the river was only two feet deep.
You see, every bridge has a rhythm it naturally likes to sway at.
Ever pushed a kid on a swing? Each push is tiny, but if they all land at just the right moment, the swing goes higher and higher.
Seventy-four men stepping together were pushing that bridge like a swing.
Nobody died, but the army made a rule: never cross a bridge in step.
So now, the best drilled soldiers in the world cross every bridge like a crowd of tourists."""

VOICE_DIR = Path(__file__).parent / "voice"
VOICE_DIR.mkdir(exist_ok=True)
VOICE_FILE = VOICE_DIR / "voice.wav"
WORDS_FILE = VOICE_DIR / "words.json"

# Reference audio for voice cloning (MP3 or WAV)
REF_AUDIO_MP3 = VOICE_DIR / "my_reference.mp3"
REF_AUDIO_WAV = VOICE_DIR / "my_reference.wav"

# VoiceStudio/OmniVoice settings (voice design mode)
OMNIVOICE_MODEL = "k2-fsa/OmniVoice"
VOICE_INSTRUCT = "male, British narrator, clear and authoritative, storytelling style"
LANGUAGE = "English"

# OpenVoice v2 settings (voice cloning mode)
OPENVOICE_MODEL_DIR = "openvoice_checkpoints"  # Auto-downloads on first run

def estimate_word_timings(text: str, total_duration: float = 67.5) -> list:
    words = re.findall(r'\b\w+\b|[.,!?;:]', text)
    total_words = len(words)
    avg_word_duration = total_duration / total_words
    
    timings = []
    current_time = 0.0
    for word in words:
        pause = 0.15 if word in ',.!?;:' else 0.05
        word_duration = avg_word_duration + pause
        start = current_time
        end = current_time + word_duration
        clean_word = word.rstrip('.,!?;:')
        timings.append({"word": clean_word, "s": round(start, 3), "e": round(end, 3)})
        current_time = end
    if timings:
        timings[-1]["e"] = round(total_duration, 3)
    return timings

def find_ffmpeg() -> str | None:
    """Find ffmpeg in PATH."""
    return shutil.which("ffmpeg")

def convert_mp3_to_wav(mp3_path: Path, wav_path: Path) -> bool:
    """Convert MP3 to WAV using ffmpeg."""
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print("ffmpeg not found in PATH - cannot convert MP3 to WAV")
        return False
    
    try:
        cmd = [ffmpeg, "-y", "-i", str(mp3_path), "-ar", "16000", "-ac", "1", str(wav_path)]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            print(f"Converted MP3 to WAV: {wav_path}")
            return True
        else:
            print(f"ffmpeg conversion failed: {result.stderr}")
            return False
    except Exception as e:
        print(f"ffmpeg error: {e}")
        return False

def get_reference_wav() -> Path | None:
    """Get reference audio as WAV (converts MP3 if needed)."""
    # Check for MP3 first
    if REF_AUDIO_MP3.exists():
        print(f"Found reference MP3: {REF_AUDIO_MP3}")
        if not REF_AUDIO_WAV.exists() or REF_AUDIO_MP3.stat().st_mtime > REF_AUDIO_WAV.stat().st_mtime:
            print("Converting MP3 to WAV for OpenVoice...")
            if not convert_mp3_to_wav(REF_AUDIO_MP3, REF_AUDIO_WAV):
                return None
        return REF_AUDIO_WAV
    
    # Check for WAV
    if REF_AUDIO_WAV.exists():
        print(f"Found reference WAV: {REF_AUDIO_WAV}")
        return REF_AUDIO_WAV
    
    return None

def find_omnivoice_cli() -> str | None:
    """Find omnivoice-infer or voicestudio CLI in PATH."""
    for cmd in ["omnivoice-infer", "voicestudio"]:
        path = shutil.which(cmd)
        if path:
            return path
    return None

def download_openvoice_checkpoints(checkpoints_dir: Path) -> bool:
    """Download OpenVoice v2 checkpoints from HuggingFace."""
    try:
        from huggingface_hub import snapshot_download
        
        print("Downloading OpenVoice v2 checkpoints (first run, ~500MB)...")
        checkpoints_dir.mkdir(parents=True, exist_ok=True)
        
        # Download from myshell-ai/OpenVoiceV2
        snapshot_download(
            repo_id="myshell-ai/OpenVoiceV2",
            local_dir=checkpoints_dir,
            local_dir_use_symlinks=False,
            resume_download=True,
        )
        print(f"Checkpoints downloaded to: {checkpoints_dir}")
        return True
    except Exception as e:
        print(f"Failed to download checkpoints: {e}")
        return False

async def generate_openvoice_v2(text: str, output_file: Path, ref_audio: Path) -> bool:
    """Generate voice using OpenVoice v2 ToneColorConverter with edge-tts base audio.
    
    This uses edge-tts for base audio generation (since base speaker checkpoints
    are not available in the HuggingFace repo), then OpenVoice's ToneColorConverter
    for voice cloning.
    """
    try:
        import torch
        import soundfile as sf
        from openvoice.api import ToneColorConverter
        from openvoice import se_extractor
        
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Using device: {device}")
        
        # Checkpoints directory
        checkpoints_dir = VOICE_DIR / "openvoice_checkpoints"
        
        # Download checkpoints if needed (only converter is needed)
        if not (checkpoints_dir / "converter" / "config.json").exists():
            print("Downloading OpenVoice v2 checkpoints...")
            if not download_openvoice_checkpoints(checkpoints_dir):
                return False
        
        # Load ToneColorConverter (voice converter)
        print("Loading OpenVoice v2 ToneColorConverter...")
        ckpt_converter = checkpoints_dir / "converter"
        tone_color_converter = ToneColorConverter(str(ckpt_converter / "config.json"), device=device)
        tone_color_converter.load_ckpt(str(ckpt_converter / "checkpoint.pth"))
        
        print("Generating base audio with edge-tts...")
        # Generate base audio using edge-tts
        import edge_tts
        
        tmp_base_audio = VOICE_DIR / "tmp_base.wav"
        voice = "en-US-EricNeural"  # Friendly, approachable American male
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(str(tmp_base_audio))
        
        print("Loading source speaker embedding...")
        # Extract speaker embedding directly using ToneColorConverter (avoids faster-whisper CUDA issue)
        source_se = tone_color_converter.extract_se([str(tmp_base_audio)])
        print(f"Source SE shape: {source_se.shape}")
        
        print("Extracting target speaker embedding from reference audio...")
        # Extract target speaker embedding from reference audio
        target_se = tone_color_converter.extract_se([str(ref_audio)])
        print(f"Target SE shape: {target_se.shape}")
        
        print("Converting base audio to target voice...")
        # Convert base audio to target voice
        tone_color_converter.convert(
            audio_src_path=str(tmp_base_audio),
            src_se=source_se,
            tgt_se=target_se,
            output_path=str(output_file),
            message="@MyShell"
        )
        
        # Clean up temp file
        tmp_base_audio.unlink(missing_ok=True)
        
        print(f"Generated OpenVoice v2 voice (your voice): {output_file}")
        return True
        
    except Exception as e:
        print(f"OpenVoice v2 generation failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def generate_omnivoice_cli(text: str, output_file: Path) -> bool:
    """Generate voice using OmniVoice CLI (comes with VoiceStudio)."""
    cli = find_omnivoice_cli()
    if not cli:
        return False
    
    if cli.endswith("omnivoice-infer"):
        cmd = [
            cli,
            "--model", OMNIVOICE_MODEL,
            "--text", text,
            "--output", str(output_file),
            "--instruct", VOICE_INSTRUCT,
            "--language", LANGUAGE,
        ]
    else:
        return False
    
    print(f"Running: {' '.join(cmd)}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode == 0:
            print(f"Generated OmniVoice voice: {output_file}")
            return True
        else:
            print(f"OmniVoice CLI failed: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        print("OmniVoice CLI timed out")
        return False
    except Exception as e:
        print(f"OmniVoice CLI error: {e}")
        return False

def generate_omnivoice_direct(text: str, output_file: Path) -> bool:
    """Generate voice using OmniVoice Python API directly (requires VoiceStudio backend)."""
    try:
        vs_paths = [
            Path.home() / "AppData" / "Local" / "VoiceStudio" / "backend",
            Path("/opt/VoiceStudio/backend"),
            Path.home() / ".local" / "VoiceStudio" / "backend",
        ]
        for vs_path in vs_paths:
            if vs_path.exists():
                sys.path.insert(0, str(vs_path))
                break
        
        import torch
        from omnivoice.models.omnivoice import OmniVoice
        from omnivoice.utils.audio import save_audio
        from omnivoice.utils.dtype import tts_dtype_name
    except ImportError:
        return False
    
    try:
        device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
        print(f"Loading OmniVoice model on {device}...")
        model = OmniVoice.from_pretrained(
            OMNIVOICE_MODEL,
            device_map=device,
            dtype=getattr(torch, tts_dtype_name(device)),
        )
        
        print(f"Generating audio (voice design)...")
        audios = model.generate(
            text=text,
            language=LANGUAGE,
            instruct=VOICE_INSTRUCT,
            num_step=32,
            guidance_scale=2.0,
            speed=1.0,
        )
        
        save_audio(str(output_file), audios[0], model.sampling_rate)
        print(f"Generated OmniVoice voice (voice design): {output_file}")
        return True
    except Exception as e:
        print(f"OmniVoice direct generation failed: {e}")
        return False

async def generate_edge_tts(text: str, output_file: Path) -> bool:
    """Fallback: Generate voice using edge-tts (Microsoft, free)."""
    if not EDGE_TTS_AVAILABLE:
        return False
    
    voice = "en-US-EricNeural"  # Friendly, approachable American male
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(output_file))
    print(f"Generated edge-tts voice: {output_file}")
    return True

async def main():
    print("=" * 60)
    print("Voice Generation Pipeline")
    print("=" * 60)
    print(f"Script: {len(SCRIPT)} chars, ~{len(SCRIPT.split())} words")
    
    # Check for reference audio (voice cloning mode)
    ref_wav = get_reference_wav()
    
    if ref_wav:
        print(f"\n[MODE] Voice Cloning -> Using YOUR voice ({ref_wav.name})")
        print("-" * 60)
        
        # Method 1: OpenVoice v2 (MIT license, commercial OK, your voice)
        print("\n[1/4] Trying OpenVoice v2 (voice cloning, MIT license)...")
        if await generate_openvoice_v2(SCRIPT, VOICE_FILE, ref_wav):
            success = True
        else:
            success = False
        
        # Method 2: OmniVoice CLI (voice cloning if ref_audio supported)
        if not success:
            print("\n[2/4] Trying OmniVoice CLI...")
            # Note: omnivoice-infer supports --ref_audio for cloning
            cli = shutil.which("omnivoice-infer")
            if cli:
                cmd = [
                    cli,
                    "--model", OMNIVOICE_MODEL,
                    "--text", SCRIPT,
                    "--output", str(VOICE_FILE),
                    "--ref_audio", str(ref_wav),
                    "--ref_text", "Reference transcript needed for cloning",
                ]
                try:
                    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
                    if result.returncode == 0:
                        print(f"Generated OmniVoice voice (cloning): {VOICE_FILE}")
                        success = True
                    else:
                        print(f"OmniVoice cloning failed: {result.stderr}")
                except Exception as e:
                    print(f"OmniVoice CLI error: {e}")
        
        # Method 3: OmniVoice direct (voice design fallback)
        if not success:
            print("\n[3/4] Trying OmniVoice direct (voice design fallback)...")
            success = generate_omnivoice_direct(SCRIPT, VOICE_FILE)
        
        # Method 4: edge-tts fallback
        if not success:
            print("\n[4/4] Falling back to edge-tts (Microsoft)...")
            success = await generate_edge_tts(SCRIPT, VOICE_FILE)
    
    else:
        print(f"\n[MODE] Voice Design -> No reference audio found")
        print("-" * 60)
        print("Place your reference audio at:")
        print(f"  {REF_AUDIO_MP3}  (MP3)")
        print(f"  {REF_AUDIO_WAV}  (WAV)")
        print("To enable voice cloning with your own voice.")
        print("-" * 60)
        
        # Method 1: OmniVoice CLI (voice design)
        print("\n[1/3] Trying OmniVoice CLI (voice design)...")
        success = generate_omnivoice_cli(SCRIPT, VOICE_FILE)
        
        # Method 2: OmniVoice direct (voice design)
        if not success:
            print("\n[2/3] Trying OmniVoice direct (voice design)...")
            success = generate_omnivoice_direct(SCRIPT, VOICE_FILE)
        
        # Method 3: edge-tts fallback
        if not success:
            print("\n[3/3] Falling back to edge-tts (Microsoft)...")
            success = await generate_edge_tts(SCRIPT, VOICE_FILE)
    
    if not success:
        print("\n[ERROR] All voice generation methods failed!")
        return 1
    
    # Generate words.json with estimated timings
    words = estimate_word_timings(SCRIPT, total_duration=67.5)
    with open(WORDS_FILE, 'w', encoding='utf-8') as f:
        json.dump(words, f, indent=2)
    
    print(f"\n[OK] Generated {len(words)} word timings in {WORDS_FILE}")
    print(f"[OK] Voice output: {VOICE_FILE}")
    print("=" * 60)
    return 0

if __name__ == "__main__":
    exit(asyncio.run(main()))
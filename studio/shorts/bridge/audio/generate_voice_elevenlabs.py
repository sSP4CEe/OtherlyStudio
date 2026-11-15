#!/usr/bin/env python3
"""
Generate voice narration using ElevenLabs API.
Falls back to edge-tts if API key not set.
"""
import os
import json
import re
from pathlib import Path

# Load .env file if present
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass  # python-dotenv not installed, rely on system env vars

# Try ElevenLabs first, fallback to edge-tts
try:
    from elevenlabs import ElevenLabs
    ELEVENLABS_AVAILABLE = True
except ImportError:
    ELEVENLABS_AVAILABLE = False

import edge_tts

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

# ElevenLabs voice ID (British male narrator)
# Get from: https://elevenlabs.io/voice-library or your Voices page
ELEVENLABS_VOICE_ID = "snODv2VnG1inLn1Ba0dk"  # Jeremy - friendly guy next door
ELEVENLABS_MODEL = "eleven_multilingual_v2"   # High quality multilingual

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

async def generate_elevenlabs(text: str, output_file: Path) -> bool:
    """Generate voice using ElevenLabs API."""
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        print("ELEVENLABS_API_KEY not set, skipping ElevenLabs")
        return False
    
    try:
        client = ElevenLabs(api_key=api_key)
        audio = client.text_to_speech.convert(
            voice_id=ELEVENLABS_VOICE_ID,
            model_id=ELEVENLABS_MODEL,
            text=text,
            voice_settings={
                "stability": 0.5,
                "similarity_boost": 0.75,
                "style": 0.2,
                "use_speaker_boost": True
            }
        )
        # audio is a generator of bytes
        with open(output_file, "wb") as f:
            for chunk in audio:
                f.write(chunk)
        print(f"Generated ElevenLabs voice: {output_file}")
        return True
    except Exception as e:
        print(f"ElevenLabs failed: {e}")
        return False

async def generate_edge_tts(text: str, output_file: Path) -> bool:
    """Fallback: Generate voice using edge-tts."""
    voice = "en-GB-RyanNeural"
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(output_file))
    print(f"Generated edge-tts voice: {output_file}")
    return True

async def main():
    print("Generating voice narration...")
    
    # Try ElevenLabs first
    success = await generate_elevenlabs(SCRIPT, VOICE_FILE)
    
    # Fallback to edge-tts
    if not success:
        print("Falling back to edge-tts...")
        success = await generate_edge_tts(SCRIPT, VOICE_FILE)
    
    if not success:
        print("All voice generation methods failed!")
        return 1
    
    # Generate words.json with estimated timings
    words = estimate_word_timings(SCRIPT, total_duration=67.5)
    with open(WORDS_FILE, 'w', encoding='utf-8') as f:
        json.dump(words, f, indent=2)
    
    print(f"Generated {len(words)} word timings in {WORDS_FILE}")
    print("Done!")
    return 0

if __name__ == "__main__":
    import asyncio
    exit(asyncio.run(main()))
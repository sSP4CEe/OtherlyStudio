#!/usr/bin/env python3
"""
Generate voice narration using edge-tts and create words.json with timing.
"""
import asyncio
import json
import os
import re
from pathlib import Path

import edge_tts

# Script from SCRIPT.md
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

VOICE = "en-GB-RyanNeural"  # British male voice, good for narration
OUTPUT_DIR = Path(__file__).parent / "voice"
OUTPUT_DIR.mkdir(exist_ok=True)

VOICE_FILE = OUTPUT_DIR / "voice.wav"
WORDS_FILE = OUTPUT_DIR / "words.json"


def estimate_word_timings(text: str, total_duration: float = 67.5) -> list:
    """
    Estimate word timings based on text length and total duration.
    Returns list of {"word": str, "s": float, "e": float}
    """
    # Split into words, preserving punctuation
    words = re.findall(r'\b\w+\b|[.,!?;:]', text)
    
    # Estimate duration per word (roughly 3.7 words/sec for ~67.5s)
    total_words = len(words)
    avg_word_duration = total_duration / total_words
    
    timings = []
    current_time = 0.0
    
    for i, word in enumerate(words):
        # Add small pause after punctuation
        pause = 0.15 if word in ',.!?;:' else 0.05
        word_duration = avg_word_duration + pause
        
        start = current_time
        end = current_time + word_duration
        
        # Clean word for JSON
        clean_word = word.rstrip('.,!?;:')
        
        timings.append({
            "word": clean_word,
            "s": round(start, 3),
            "e": round(end, 3)
        })
        
        current_time = end
    
    # Adjust last word to end at total_duration
    if timings:
        timings[-1]["e"] = round(total_duration, 3)
    
    return timings


async def generate_voice(text: str, output_file: Path, voice: str = "en-GB-RyanNeural"):
    """Generate voice using edge-tts."""
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(output_file))
    print(f"Generated voice: {output_file}")


def main():
    print("Generating voice narration...")
    
    # Generate voice
    asyncio.run(generate_voice(SCRIPT, VOICE_FILE))
    
    # Generate words.json with estimated timings
    words = estimate_word_timings(SCRIPT, total_duration=67.5)
    
    with open(WORDS_FILE, 'w', encoding='utf-8') as f:
        json.dump(words, f, indent=2)
    
    print(f"Generated {len(words)} word timings in {WORDS_FILE}")
    print(f"Voice file: {VOICE_FILE}")
    print("Done!")


if __name__ == "__main__":
    main()
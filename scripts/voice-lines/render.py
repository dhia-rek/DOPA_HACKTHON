"""Pre-record dialogue lines in each speaker's own voice (same edge-tts voice + effects as public/voices/<id>.mp3).

Needs `pip install edge-tts` and ffmpeg. Reads lines.json from enumerate.ts, writes
public/voices/lines/<speaker>/<hash>.mp3 plus public/voices/lines/index.json. Existing files are kept.
"""
import asyncio
import json
import pathlib
import subprocess
import tempfile

import edge_tts

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "voices" / "lines"

# speaker: (edge voice, rate, pitch, ffmpeg filter)
VOICES = {
    "villager": ("en-GB-ThomasNeural", "+5%", "+8Hz", "tremolo=f=6:d=0.15"),
    "priestess": ("en-GB-SoniaNeural", "-12%", "-4Hz", "aecho=0.8:0.8:90:0.35"),
    "child": ("en-US-AnaNeural", "+0%", "+0Hz", "aecho=0.8:0.4:25:0.1"),
    "wounded_soldier": ("en-GB-RyanNeural", "-25%", "-20Hz", "lowpass=f=5000,bass=g=3,aecho=0.8:0.4:30:0.1"),
    "altar": ("en-US-ChristopherNeural", "-20%", "-30Hz", "aecho=0.8:0.85:120|240:0.4|0.25,bass=g=4"),
    "trial_hermes": ("en-US-BrianNeural", "+14%", "+6Hz", "chorus=0.7:0.9:40:0.3:0.25:2,aecho=0.8:0.5:30:0.12"),
    "trial_ares": ("en-US-SteffanNeural", "-12%", "-22Hz", "bass=g=8,acompressor=threshold=0.1:ratio=6,aecho=0.8:0.5:40:0.25"),
    "trial_artemis": ("en-GB-LibbyNeural", "-5%", "+0Hz", "aecho=0.8:0.6:70:0.25,highpass=f=120"),
    "trial_athena": ("en-AU-NatashaNeural", "-15%", "-6Hz", "aecho=0.8:0.85:110|220:0.35|0.2,bass=g=3"),
    "trial_charon": ("en-GB-ThomasNeural", "-30%", "-28Hz", "lowpass=f=3800,bass=g=5,tremolo=f=4:d=0.1,aecho=0.8:0.7:90:0.3"),
    "trial_nemesis": ("en-US-EmmaNeural", "-18%", "-10Hz",
                      "asplit[a][b];[b]asetrate=24000*0.88,aresample=24000,atempo=1.136,adelay=30,volume=0.6[c];[a][c]amix=inputs=2:normalize=0,aecho=0.8:0.8:130:0.35"),
}


async def render(entry, sem):
    dest = OUT / f"{entry['key']}.mp3"
    if dest.exists():
        return
    voice, rate, pitch, fx = VOICES[entry["speakerId"]]
    dest.parent.mkdir(parents=True, exist_ok=True)
    async with sem:
        with tempfile.NamedTemporaryFile(suffix=".mp3") as raw:
            for attempt in range(3):
                try:
                    await edge_tts.Communicate(entry["text"], voice, rate=rate, pitch=pitch).save(raw.name)
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    await asyncio.sleep(2)
            proc = await asyncio.create_subprocess_exec(
                "ffmpeg", "-y", "-loglevel", "error", "-i", raw.name, "-af", f"{fx},loudnorm",
                "-ac", "1", "-b:a", "64k", str(dest))
            if await proc.wait() != 0:
                raise RuntimeError(f"ffmpeg failed for {entry['key']}")


async def main():
    entries = [e for e in json.loads((pathlib.Path(__file__).parent / "lines.json").read_text()) if e["speakerId"] in VOICES]
    sem = asyncio.Semaphore(6)
    await asyncio.gather(*(render(e, sem) for e in entries))
    keys = sorted(e["key"] for e in entries if (OUT / f"{e['key']}.mp3").exists())
    (OUT / "index.json").write_text(json.dumps(keys))
    print(f"{len(keys)} lines recorded")


asyncio.run(main())

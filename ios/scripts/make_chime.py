#!/usr/bin/env python3
"""Generate the MG "your turn" chime used by APNs (sound: "mg-chime.caf").

Sound: two-tone ding-dong (880 Hz, then 1108.73 Hz, ~0.4 s each), played
3 times with 0.6 s between rounds. Total ~3.6 s (iOS allows up to 30 s).

Writes:
  ios/Resources/mg-chime.wav   (for listening on Windows)
  ios/Resources/mg-chime.caf   (Core Audio Format, 16-bit linear PCM, mono)

Run from the repo root:  python ios/scripts/make_chime.py
Only the Python standard library is needed.
"""

import math
import os
import struct
import wave

SAMPLE_RATE = 44100
TONE_SECONDS = 0.4
ROUND_GAP_SECONDS = 0.6
ROUNDS = 3
DING_HZ = 880.0
DONG_HZ = 1108.73
PEAK = 0.85  # headroom below full scale

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "Resources"))


def bell_tone(freq: float, seconds: float) -> list:
    """Soft bell: 5 ms attack, exponential decay, a little 2nd/3rd harmonic."""
    n = int(SAMPLE_RATE * seconds)
    attack = int(SAMPLE_RATE * 0.005)
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        env = (i / attack) if i < attack else math.exp(-4.0 * (t - attack / SAMPLE_RATE) / seconds)
        # Short fade-out on the last 10 ms to avoid a click.
        tail = n - i
        if tail < int(SAMPLE_RATE * 0.01):
            env *= tail / (SAMPLE_RATE * 0.01)
        s = (
            math.sin(2 * math.pi * freq * t)
            + 0.30 * math.sin(2 * math.pi * freq * 2 * t)
            + 0.12 * math.sin(2 * math.pi * freq * 3 * t)
        )
        out.append(env * s / 1.42)
    return out


def build_samples() -> list:
    ding = bell_tone(DING_HZ, TONE_SECONDS)
    dong = bell_tone(DONG_HZ, TONE_SECONDS)
    gap = [0.0] * int(SAMPLE_RATE * ROUND_GAP_SECONDS)
    samples = []
    for r in range(ROUNDS):
        samples += ding + dong
        if r < ROUNDS - 1:
            samples += gap
    samples += [0.0] * int(SAMPLE_RATE * 0.05)
    return samples


def to_int16(samples: list) -> list:
    return [max(-32767, min(32767, int(round(s * PEAK * 32767)))) for s in samples]


def write_wav(path: str, pcm: list) -> None:
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(struct.pack("<%dh" % len(pcm), *pcm))


def write_caf(path: str, pcm: list) -> None:
    """Minimal CAF: header + 'desc' + 'data' chunks, big-endian 16-bit LPCM."""
    audio = struct.pack(">%dh" % len(pcm), *pcm)
    header = b"caff" + struct.pack(">HH", 1, 0)  # file type, version 1, flags 0

    # Audio description: sample rate, 'lpcm', flags (0 = big-endian signed
    # integer), bytes/packet, frames/packet, channels, bits/channel.
    desc_body = struct.pack(">d4sIIIII", float(SAMPLE_RATE), b"lpcm", 0, 2, 1, 1, 16)
    desc = b"desc" + struct.pack(">q", len(desc_body)) + desc_body

    data_body = struct.pack(">I", 0) + audio  # edit count + samples
    data = b"data" + struct.pack(">q", len(data_body)) + data_body

    with open(path, "wb") as f:
        f.write(header + desc + data)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    pcm = to_int16(build_samples())
    write_wav(os.path.join(OUT_DIR, "mg-chime.wav"), pcm)
    write_caf(os.path.join(OUT_DIR, "mg-chime.caf"), pcm)
    print("Wrote %d samples (%.2f s) to %s" % (len(pcm), len(pcm) / SAMPLE_RATE, OUT_DIR))


if __name__ == "__main__":
    main()

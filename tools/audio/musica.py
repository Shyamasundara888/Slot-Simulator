"""
Composizione di musica e suoni delle slot senza dipendenze Python: si scrive la
partitura in codice, questo modulo la salva come MIDI e la fa suonare a
FluidSynth con un soundfont General MIDI, poi ffmpeg normalizza e comprime.

Requisiti (vedi README.md): fluidsynth, un soundfont GM (FluidR3_GM, licenza MIT)
e ffmpeg con libopus e libmp3lame.
"""

from __future__ import annotations

import os
import shutil
import struct
import subprocess
import tempfile
from dataclasses import dataclass, field

RATE = 44100
PPQ = 480
DRUMS = 9  # canale delle percussioni General MIDI (il 10 contando da 1)

SOUNDFONTS = [
    os.environ.get("SOUNDFONT", ""),
    "/usr/share/sounds/sf2/FluidR3_GM.sf2",
    "/usr/share/soundfonts/FluidR3_GM.sf2",
    "C:/soundfonts/FluidR3_GM.sf2",
]

# Note: "D4" -> 62. Diesis con #, bemolle con b.
_NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def note(name: str) -> int:
    pitch = _NAMES[name[0]]
    rest = name[1:]
    while rest and rest[0] in "#b":
        pitch += 1 if rest[0] == "#" else -1
        rest = rest[1:]
    return 12 * (int(rest) + 1) + pitch


@dataclass
class Track:
    """Una parte: strumento General MIDI (0-127, contando da 0) su un canale."""

    channel: int
    program: int | None
    volume: int = 100
    pan: int = 64
    reverb: int = 50
    events: list[tuple[float, int, bytes]] = field(default_factory=list)

    def add(self, beat: float, pitch: int | str, length: float, velocity: int = 90) -> "Track":
        p = note(pitch) if isinstance(pitch, str) else pitch
        v = max(1, min(127, int(velocity)))
        self.events.append((beat, 1, bytes([0x90 | self.channel, p, v])))
        self.events.append((beat + length, 0, bytes([0x80 | self.channel, p, 0])))
        return self

    def chord(self, beat: float, pitches: list[int | str], length: float, velocity: int = 80, strum: float = 0.0) -> "Track":
        for i, p in enumerate(pitches):
            self.add(beat + i * strum, p, length - i * strum, velocity)
        return self

    def control(self, beat: float, number: int, value: int) -> "Track":
        self.events.append((beat, 0, bytes([0xB0 | self.channel, number, value])))
        return self

    def bend(self, beat: float, amount: float) -> "Track":
        """Pitch bend da -1 a 1 (con l'estensione predefinita di ±2 semitoni)."""
        value = max(0, min(16383, int(8192 + amount * 8191)))
        self.events.append((beat, 0, bytes([0xE0 | self.channel, value & 127, value >> 7])))
        return self


@dataclass
class Song:
    tempo: float
    tracks: list[Track] = field(default_factory=list)

    def track(self, program: int | None, channel: int | None = None, **settings) -> Track:
        if channel is None:
            used = {t.channel for t in self.tracks}
            channel = next(c for c in range(16) if c != DRUMS and c not in used)
        t = Track(channel, program, **settings)
        self.tracks.append(t)
        return t

    def drums(self, **settings) -> Track:
        return self.track(None, DRUMS, **settings)

    def seconds(self, beats: float) -> float:
        return beats * 60 / self.tempo

    def midi(self, repeat: int = 1, length: float | None = None) -> bytes:
        """File MIDI di tipo 1; con `repeat` la partitura si ripete ogni `length` battiti."""
        chunks = [_tempo_track(self.tempo)]
        for t in self.tracks:
            events: list[tuple[float, int, bytes]] = []
            if t.program is not None:
                events.append((0, -1, bytes([0xC0 | t.channel, t.program])))
            for number, value in ((7, t.volume), (10, t.pan), (91, t.reverb), (93, 0)):
                events.append((0, -2, bytes([0xB0 | t.channel, number, value])))
            for r in range(repeat):
                offset = r * (length or 0)
                events.extend((beat + offset, order, data) for beat, order, data in t.events)
            chunks.append(_track_chunk(events))
        header = b"MThd" + struct.pack(">IHHH", 6, 1, len(chunks), PPQ)
        return header + b"".join(chunks)


def _varlen(value: int) -> bytes:
    out = [value & 0x7F]
    value >>= 7
    while value:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    return bytes(reversed(out))


def _track_chunk(events: list[tuple[float, int, bytes]]) -> bytes:
    # A parità di tempo prima i cambi di strumento, poi i note off, poi i note on.
    events = sorted(events, key=lambda e: (round(e[0] * PPQ), e[1]))
    body = bytearray()
    last = 0
    for beat, _, data in events:
        tick = max(last, round(beat * PPQ))
        body += _varlen(tick - last) + data
        last = tick
    body += b"\x00\xff\x2f\x00"
    return b"MTrk" + struct.pack(">I", len(body)) + bytes(body)


def _tempo_track(tempo: float) -> bytes:
    micros = round(60_000_000 / tempo)
    body = b"\x00\xff\x51\x03" + micros.to_bytes(3, "big") + b"\x00\xff\x2f\x00"
    return b"MTrk" + struct.pack(">I", len(body)) + body


def soundfont() -> str:
    for path in SOUNDFONTS:
        if path and os.path.exists(path):
            return path
    raise SystemExit("soundfont General MIDI non trovato: installa FluidR3_GM o indica il file con SOUNDFONT=...")


def _run(args: list[str]) -> None:
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def loudness(path: str) -> float:
    """Volume percepito (LUFS integrati, EBU R128) di un file audio."""
    result = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True, check=True)
    lines = [l for l in result.stderr.splitlines() if l.strip().startswith("I:")]
    return float(lines[-1].split()[1])


def render(song: Song, out: str, *, loop_beats: float | None = None, tail: float = 1.5, lufs: float = -16.0, bitrate: str = "96k") -> float:
    """
    Fa suonare la partitura e la salva in `out` (.ogg o .mp3); restituisce la durata in secondi.
    Gli .ogg sono in Opus: i browser li decodificano della durata esatta, mentre con Vorbis
    Chrome aggiunge circa 12 ms in fondo e il loop delle musiche sobbalza.

    Con `loop_beats` il brano deve ripetersi senza stacchi: si suona due volte di fila e si tiene
    la seconda, che all'inizio ha già le code di riverbero della fine. Senza, si tiene tutto il
    suono più `tail` secondi di coda, con una dissolvenza breve alla fine.
    """
    for tool in ("fluidsynth", "ffmpeg"):
        if not shutil.which(tool):
            raise SystemExit(f"manca {tool}: vedi tools/audio/README.md")
    with tempfile.TemporaryDirectory() as tmp:
        mid = os.path.join(tmp, "brano.mid")
        wav = os.path.join(tmp, "brano.wav")
        with open(mid, "wb") as f:
            f.write(song.midi(repeat=2 if loop_beats else 1, length=loop_beats))
        _run([
            "fluidsynth", "-ni", "-q", "-g", "0.6", "-r", str(RATE),
            "-o", "synth.reverb.room-size=0.75", "-o", "synth.reverb.damp=0.35",
            "-o", "synth.reverb.width=0.9", "-o", "synth.reverb.level=0.7",
            "-F", wav, soundfont(), mid,
        ])
        if loop_beats:
            start = song.seconds(loop_beats)
            duration = start
            cut = ["-ss", f"{start:.6f}", "-t", f"{duration:.6f}"]
            fade = ""
        else:
            end = max(beat for t in song.tracks for beat, _, _ in t.events)
            duration = song.seconds(end) + tail
            cut = ["-t", f"{duration:.6f}"]
            fade = f",afade=t=out:st={max(0.0, duration - 0.4):.3f}:d=0.4"
        # Compressione leggera, poi il volume portato a `lufs`: così i suoni stanno alla pari fra loro.
        mixed = os.path.join(tmp, "mix.wav")
        _run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, *cut, "-af", f"acompressor=threshold=-18dB:ratio=3:attack=5:release=120{fade}", mixed])
        gain = lufs - loudness(mixed)
        codec = ["-c:a", "libopus", "-b:a", bitrate, "-ar", "48000"] if out.endswith(".ogg") else ["-c:a", "libmp3lame", "-b:a", bitrate, "-ar", str(RATE)]
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        _run(["ffmpeg", "-y", "-loglevel", "error", "-i", mixed, "-af", f"volume={gain:.2f}dB,alimiter=limit=0.89:level=false", *codec, out])
    return duration

"""
Musica e suoni del Tempio del Sole, composti in codice e suonati con FluidSynth.

    python slots/tempio-del-sole/art/audio/partitura.py

Scrive i file .ogg accanto a questo script; art/art.json li collega agli eventi.
Scala: Re frigio dominante (Re Mib Fa# Sol La Sib Do), il colore "egizio" classico.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../../tools/audio"))
from musica import Song, note, render  # noqa: E402

OUT = os.path.dirname(os.path.abspath(__file__))

# Strumenti General MIDI (numeri da 0).
NYLON, CELESTA, GLOCKEN, BELLS = 24, 8, 9, 14
CELLO, TREMOLO, PIZZICATO, HARP, TIMPANI = 42, 44, 45, 46, 47
STRINGS, SLOW_STRINGS, CHOIR, HIT = 48, 49, 52, 55
TRUMPET, HORN, BRASS, NEY = 56, 60, 61, 75

CHORDS = {
    "D": ["D3", "F#3", "A3"],
    "Eb": ["Eb3", "G3", "Bb3"],
    "Gm": ["G3", "Bb3", "D4"],
}
HARMONY = ["D", "D", "Eb", "D", "Gm", "Gm", "Eb", "D", "D", "D", "Eb", "D", "Gm", "Gm", "Eb", "D"]
ROOT = {"D": "D2", "Eb": "Eb2", "Gm": "G2"}

# Frasi di due battute: (battito, nota, durata).
PHRASE_D = [(0, "A4", 1), (1, "Bb4", .5), (1.5, "A4", .5), (2, "G4", .5), (2.5, "F#4", .5), (3, "Eb4", .5), (3.5, "D4", .5),
            (4, "F#4", .75), (4.75, "G4", .25), (5, "A4", 2.5)]
PHRASE_EB = [(0, "G4", .5), (.5, "Bb4", .5), (1, "C5", 1), (2, "Bb4", .5), (2.5, "A4", .5), (3, "G4", .5), (3.5, "F#4", .5),
             (4, "Eb4", .5), (4.5, "F#4", .5), (5, "D4", 2.5)]
PHRASE_GM = [(0, "D5", 1), (1, "C5", .5), (1.5, "Bb4", .5), (2, "A4", .5), (2.5, "Bb4", .5), (3, "G4", 1),
             (4, "Bb4", .5), (4.5, "A4", .5), (5, "G4", .5), (5.5, "F#4", .5), (6, "G4", 2)]
CADENCE = [(0, "Bb4", .5), (.5, "C5", .5), (1, "D5", 1), (2, "Eb5", .5), (2.5, "D5", .5), (3, "C5", .5), (3.5, "Bb4", .5),
           (4, "A4", .5), (4.5, "G4", .5), (5, "F#4", .5), (5.5, "Eb4", .5), (6, "D4", 2)]


def play(track, start, phrase, velocity=88, transpose=0, swell=False):
    for beat, pitch, length in phrase:
        accent = 8 if beat % 2 == 0 else 0
        track.add(start + beat, note(pitch) + transpose, length * 0.95, velocity + accent)
        if swell and length >= 2:
            # Il flauto di canna "scivola" sulla nota lunga, come un ney.
            track.bend(start + beat, -0.25).bend(start + beat + 0.25, 0)


def arpeggio(track, start, chord, velocity=55, beats=4, step=0.5):
    tones = [note(p) for p in CHORDS[chord]]
    tones = tones + [t + 12 for t in tones] + [tones[0] + 24]
    order = tones + tones[-2:0:-1]
    for i in range(int(beats / step)):
        track.add(start + i * step, order[i % len(order)], step * 2, velocity - (i % 4) * 4)


def music_base():
    song = Song(tempo=96)
    pad = song.track(SLOW_STRINGS, volume=70, reverb=80)
    drone = song.track(CELLO, volume=72, reverb=70)
    bass = song.track(PIZZICATO, volume=95, reverb=50)
    harp = song.track(HARP, volume=80, pan=40, reverb=70)
    oud = song.track(NYLON, volume=105, pan=78, reverb=55)
    ney = song.track(NEY, volume=92, pan=52, reverb=90)
    drums = song.drums(volume=100, reverb=40)
    for bar, chord in enumerate(HARMONY):
        b = bar * 4
        pad.chord(b, CHORDS[chord], 4, 52)
        bass.add(b, ROOT[chord], 1, 92).add(b + 2, note(ROOT[chord]) + 12, 1, 78).add(b + 3.5, ROOT[chord], .5, 70)
        if bar % 4 == 0:
            drone.chord(b, ["D2", "A2"], 16, 48)
        if bar < 4 or 8 <= bar < 12:
            arpeggio(harp, b, chord, 50 if bar < 4 else 42)
        # Maqsum: doum e tek, il ritmo base della musica araba ed egizia.
        for beat, kind in ((0, "D"), (.5, "T"), (1.5, "T"), (2, "D"), (3, "T")):
            if kind == "D":
                drums.add(b + beat, 64, .25, 96)
            else:
                drums.add(b + beat, 60, .25, 78)
        for i in range(8):
            drums.add(b + i * .5, 54, .25, 30 if i % 2 else 42)
        if bar % 4 == 3:
            # Rullata di tek a fine frase.
            for i in range(4):
                drums.add(b + 3 + i * .25, 62, .2, 60 + i * 8)
        if bar % 8 == 0:
            drums.add(b, 81, 2, 70)
    play(oud, 16, PHRASE_GM)
    play(oud, 24, CADENCE)
    play(ney, 32, PHRASE_D, 84, swell=True)
    play(ney, 40, PHRASE_EB, 84, swell=True)
    play(oud, 48, PHRASE_GM, 92)
    play(ney, 48, PHRASE_GM, 70, 12, swell=True)
    play(oud, 56, CADENCE, 92)
    play(ney, 56, CADENCE, 70, 12, swell=True)
    return song, 64


def music_bonus():
    song = Song(tempo=128)
    choir = song.track(CHOIR, volume=78, reverb=90)
    trem = song.track(TREMOLO, volume=70, pan=44, reverb=60)
    ostinato = song.track(STRINGS, volume=88, pan=84, reverb=50)
    timp = song.track(TIMPANI, volume=100, reverb=60)
    brass = song.track(BRASS, volume=92, reverb=60)
    lead = song.track(TRUMPET, volume=90, pan=60, reverb=70)
    flute = song.track(NEY, volume=86, pan=70, reverb=80)
    drums = song.drums(volume=105, reverb=40)
    for bar, chord in enumerate(HARMONY):
        b = bar * 4
        choir.chord(b, [note(p) + 12 for p in CHORDS[chord]], 4, 58)
        trem.chord(b, CHORDS[chord], 4, 50)
        root = note(ROOT[chord]) + 24
        for i, step in enumerate([0, 0, 1, 0, 0, 0, 3, 0, 0, 0, 1, 0, 5, 3, 1, 0]):
            ostinato.add(b + i * .25, root + step, .22, 82 if i % 4 == 0 else 64)
        timp.add(b, ROOT[chord], 1, 100).add(b + 2.5, ROOT[chord], .5, 80)
        if bar % 2 == 1:
            brass.chord(b + 3, [note(p) + 12 for p in CHORDS[chord]], .5, 92).chord(b + 3.5, [note(p) + 12 for p in CHORDS[chord]], .5, 100)
        for beat in (0, 1.5, 2):
            drums.add(b + beat, 36, .25, 110)
        for beat in (2.5, 3.5):
            drums.add(b + beat, 41, .25, 96)
        for beat in (1, 3):
            drums.add(b + beat, 39, .25, 70)
        for i in range(16):
            drums.add(b + i * .25, 54, .2, 30 + (14 if i % 4 == 0 else 0))
        if bar % 4 == 0:
            drums.add(b, 49, 2, 95)
    play(flute, 0, PHRASE_D, 80, 12, swell=True)
    play(flute, 8, PHRASE_EB, 80, 12, swell=True)
    play(lead, 16, PHRASE_GM, 92)
    play(lead, 24, CADENCE, 96)
    play(flute, 32, PHRASE_D, 84, 12, swell=True)
    play(lead, 40, PHRASE_EB, 90)
    play(lead, 48, PHRASE_GM, 96)
    play(flute, 48, PHRASE_GM, 70, 12)
    play(lead, 56, CADENCE, 100)
    play(flute, 56, CADENCE, 74, 12)
    return song, 64


def sfx_spin():
    song = Song(tempo=120)
    harp = song.track(HARP, volume=110, reverb=60)
    drums = song.drums(volume=100, reverb=30)
    for i, p in enumerate(["D4", "Eb4", "F#4", "G4", "A4", "Bb4", "C5", "D5", "Eb5", "F#5"]):
        harp.add(i * .07, p, .6, 70 + i * 3)
    for i in range(6):
        drums.add(i * .125, 69, .1, 70 - i * 6)
    return song


def sfx_stop():
    song = Song(tempo=120)
    bass = song.track(PIZZICATO, volume=110, reverb=30)
    drums = song.drums(volume=110, reverb=25)
    drums.add(0, 41, .3, 105).add(0, 77, .2, 90)
    bass.add(0, "D2", .4, 100)
    return song


def sfx_win():
    song = Song(tempo=120)
    glock = song.track(GLOCKEN, volume=100, reverb=70)
    harp = song.track(HARP, volume=95, reverb=70)
    celesta = song.track(CELESTA, volume=90, reverb=80)
    for i, p in enumerate(["D5", "F#5", "A5", "D6"]):
        glock.add(i * .25, p, .6, 85 + i * 6)
        harp.add(i * .25, note(p) - 12, 1, 80)
    celesta.chord(1, ["D5", "F#5", "A5", "D6"], 1.5, 80)
    return song


def sfx_big_win():
    song = Song(tempo=110)
    timp = song.track(TIMPANI, volume=110, reverb=60)
    brass = song.track(BRASS, volume=110, reverb=70)
    horn = song.track(HORN, volume=95, reverb=80)
    trumpet = song.track(TRUMPET, volume=105, reverb=70)
    choir = song.track(CHOIR, volume=95, reverb=95)
    hit = song.track(HIT, volume=90, reverb=60)
    harp = song.track(HARP, volume=90, reverb=80)
    drums = song.drums(volume=105, reverb=60)
    for i in range(16):
        timp.add(i * .125, "D2", .125, 60 + i * 4)
    brass.chord(2, ["Eb4", "G4", "Bb4"], .5, 100)
    brass.chord(2.5, ["D4", "F#4", "A4", "D5"], 3.5, 112)
    horn.chord(2.5, ["D3", "A3", "D4"], 3.5, 96)
    choir.chord(2.5, ["D4", "F#4", "A4", "D5"], 3.5, 96)
    hit.chord(2.5, ["D4", "A4"], .5, 110)
    for i, p in enumerate(["A4", "D5", "F#5", "A5"]):
        trumpet.add(2.5 + i * .5, p, .5 if i < 3 else 2, 108)
    for i, p in enumerate(["D4", "F#4", "A4", "D5", "F#5", "A5", "D6"]):
        harp.add(2.5 + i * .08, p, 2, 90)
    timp.add(2.5, "D2", 1, 127).add(5, "D2", 1, 120)
    drums.add(2.5, 49, 3, 120).add(2.5, 36, .5, 120).add(5, 57, 2, 110)
    return song


def sfx_feature():
    song = Song(tempo=100)
    bells = song.track(BELLS, volume=100, reverb=90)
    timp = song.track(TIMPANI, volume=110, reverb=70)
    choir = song.track(CHOIR, volume=100, reverb=100)
    harp = song.track(HARP, volume=95, reverb=80)
    strings = song.track(TREMOLO, volume=85, reverb=80)
    drums = song.drums(volume=100, reverb=80)
    timp.add(0, "D2", 1.5, 120)
    drums.add(0, 52, 3, 100)
    bells.add(0, "D4", 3, 100).add(0, "A4", 3, 80)
    choir.chord(0, ["Eb4", "G4", "Bb4"], 1.5, 80)
    choir.chord(1.5, ["D4", "F#4", "A4", "D5"], 3, 96)
    strings.chord(0, ["D3", "A3"], 4.5, 70)
    scale = ["D4", "Eb4", "F#4", "G4", "A4", "Bb4", "C5", "D5", "Eb5", "F#5", "G5", "A5", "D6"]
    for i, p in enumerate(scale):
        harp.add(.25 + i * .09, p, 2, 70 + i * 3)
    return song


def main():
    jobs = [
        # nome, partitura, in loop, volume (LUFS), coda in secondi
        ("musica.ogg", music_base, True, -20, 0),
        ("musica-bonus.ogg", music_bonus, True, -19, 0),
        ("giro.ogg", sfx_spin, False, -20, 0.3),
        ("arresto.ogg", sfx_stop, False, -19, 0.3),
        ("vincita.ogg", sfx_win, False, -16, 1.0),
        ("grande-vincita.ogg", sfx_big_win, False, -14, 1.5),
        ("bonus.ogg", sfx_feature, False, -15, 1.5),
    ]
    only = set(sys.argv[1:])
    for name, compose, loop, lufs, tail in jobs:
        if only and name not in only:
            continue
        result = compose()
        song, beats = result if loop else (result, None)
        seconds = render(song, os.path.join(OUT, name), loop_beats=beats, lufs=lufs, tail=tail, bitrate="96k" if loop else "80k")
        size = os.path.getsize(os.path.join(OUT, name)) / 1024
        print(f"{name}: {seconds:.1f} s, {size:.0f} KB")


if __name__ == "__main__":
    main()

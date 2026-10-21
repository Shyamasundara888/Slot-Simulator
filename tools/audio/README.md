# Musica e suoni composti

`musica.py` serve a scrivere musica e suoni di una slot come codice Python: note, strumenti General MIDI e percussioni. Il modulo salva la partitura in MIDI e la fa suonare a [FluidSynth](https://www.fluidsynth.org/) con un soundfont. Poi ffmpeg comprime leggermente il suono, porta il volume a un valore fisso in LUFS e salva in OGG o MP3. Non servono librerie Python.

Esempio completo: [`slots/tempio-del-sole/art/audio/partitura.py`](../../slots/tempio-del-sole/art/audio/partitura.py), con due musiche in loop e cinque effetti in Re frigio dominante.

```bash
python3 slots/tempio-del-sole/art/audio/partitura.py              # rifà tutti i file in art/audio/
python3 slots/tempio-del-sole/art/audio/partitura.py musica.ogg   # solo un file
npm run assets -- build slots/tempio-del-sole                     # li copia in assets/sounds/
```

## Requisiti

- **FluidSynth** 2.x: `apt install fluidsynth` su Debian e Ubuntu, `choco install fluidsynth` su Windows.
- **Soundfont General MIDI FluidR3_GM** (licenza MIT, si può usare e ridistribuire): `apt install fluid-soundfont-gm` lo mette in `/usr/share/sounds/sf2/`. Per un altro percorso, o per un altro soundfont, usa la variabile `SOUNDFONT=/percorso/file.sf2`.
- **ffmpeg** con `libopus` e `libmp3lame`.

I file prodotti sono già nel repo: non serve rifarli per giocare. Il soundfont FluidR3 ha una licenza libera, quindi anche i suoni ricavati sono liberi. Con un altro soundfont controlla prima la sua licenza.

## Come si scrive una partitura

```python
from musica import Song, render

song = Song(tempo=96)
arpa = song.track(46, volume=90, reverb=70)    # strumento General MIDI, contando da 0 (46 = arpa)
batteria = song.drums()                         # canale 10: le note sono i pezzi della batteria (64 = conga bassa)
arpa.chord(0, ["D3", "F#3", "A3"], 4, velocity=70)
arpa.add(4, "A4", 1).add(5, "Bb4", .5)
batteria.add(0, 64, .25, 96)
render(song, "art/audio/musica.ogg", loop_beats=16, lufs=-20)   # loop di 16 battiti, senza stacchi
render(song, "art/audio/vincita.ogg", tail=1.0, lufs=-16)        # effetto con 1 s di coda
```

- I tempi sono in battiti: `add(battito, nota, durata, velocity)`. Le note si scrivono come `"D4"`, `"F#3"`, `"Bb4"`, oppure come numeri MIDI.
- Con `loop_beats` il brano viene suonato due volte e si tiene la seconda. Così l'inizio contiene già le code di riverbero della fine e il loop non ha stacchi. Scrivi brani di 8 o 16 battute che tornano all'accordo iniziale.
- Volume con `lufs`: musiche da -20 a -19, effetti da -20 (giro, arresto) a -14 (grande vincita). Il client suona le musiche più piano degli effetti.
- Musiche in **OGG**, che `render` scrive in Opus: il client le suona in loop con la Web Audio API, senza stacchi. Con Vorbis, Chrome aggiunge circa 12 ms in fondo e il loop sobbalza. Gli effetti possono essere OGG o MP3.

## Strumenti utili per i temi

| Tema | General MIDI (contando da 0) |
| --- | --- |
| Egitto, Medio Oriente | 24 chitarra nylon (come un oud), 75 flauto di Pan (come un ney), 104 sitar, 46 arpa, 49 archi lenti, 52 coro; percussioni 64/60 conga e bongo (doum e tek), 54 tamburello, 81 triangolo |
| Epico, fantasy | 48 archi, 61 ottoni, 60 corno, 47 timpani, 52 coro, 116 taiko, 55 colpo d'orchestra |
| Magico, vincite | 8 celesta, 9 glockenspiel, 14 campane tubolari, 46 arpa in glissando |
| Retro, arcade | 80 onda quadra, 81 dente di sega, 38 basso synth |

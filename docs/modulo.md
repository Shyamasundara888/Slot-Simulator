# Formato di un modulo

Un modulo è una slot completa in una cartella. Il motore lo valida tutto prima di usarlo e, se qualcosa non va, riporta **tutti** i problemi in un solo messaggio (vedi [errori.md](errori.md)). Questo documento descrive ogni file e ogni campo; i valori predefiniti sono indicati tra parentesi.

```
slots/<id>/
  manifest.json        obbligatorio   identità del modulo
  math/reels.json      obbligatorio   righe visibili e strisce dei rulli per modalità
  math/lines.json      obbligatorio   linee di pagamento
  math/paytable.json   obbligatorio   simboli e pagamenti
  math/features.json   facoltativo    wild espandenti, free spin, moltiplicatori, upgrade, tetto di vincita
  scenes/main.json     facoltativo    aspetto: colori, etichette, immagini, suoni, nomi delle modalità
  scripts/main.lua     facoltativo    regole aggiuntive in Lua (vedi script-lua.md)
  assets/              facoltativo    immagini e suoni usati dalla scena (generati, vedi asset.md)
  art/                 facoltativo    sorgenti degli asset; non entra negli zip dei mod
```

Altri file nella cartella vengono ignorati. Un modello completo da copiare è in [templates/slot-base/](../templates/slot-base/).

## Come gioca il motore

Capire il round aiuta a scrivere file giusti:

1. **Spin base.** Per ogni rullo il motore estrae una posizione di arresto a caso sulla striscia della modalità `base`. La griglia visibile è fatta, per ogni rullo, dei simboli dalla posizione di arresto in giù per `rows` righe (la striscia è circolare). Ogni posizione ha la stessa probabilità: un simbolo che compare più volte su una striscia esce più spesso.
2. **Valutazione.** Nell'ordine: upgrade dei simboli (solo nei free spin), espansione dei wild, vincite su linea, vincita scatter. Poi il moltiplicatore, se c'è.
3. **Free spin.** Se lo spin base ha abbastanza scatter partono i free spin, sulle strisce `free`. Durante i free spin i wild espansi possono dare spin in più, upgrade e moltiplicatore; gli scatter possono riattivarli.
4. **Sequenze degli script.** Finiti i free spin, il motore gioca le sequenze di spin che lo script ha chiesto (per esempio i Gold Spin), una dopo l'altra.
5. **Tetto.** Se la vincita del round arriva a `maxWin`, il round si ferma e paga esattamente `maxWin`.

Unità: le vincite su linea sono multipli della **puntata per linea** (puntata totale diviso numero di linee); scatter, vincite di uno spin e vincite del round sono multipli della **puntata totale**.

## manifest.json

```json
{
  "id": "tempio-del-sole",
  "name": "Tempio del Sole",
  "version": "0.5.0",
  "author": "Slot Simulator",
  "description": "Slot 5x3 a 10 linee a tema egizio...",
  "engineApi": 1
}
```

| Campo | Tipo | Regole |
| --- | --- | --- |
| `id` | testo | lettere minuscole, cifre e `-`; deve essere unico e di solito coincide con il nome della cartella |
| `name` | testo | nome mostrato nel client |
| `version` | testo | libero; usa `maggiore.minore.patch` e alzalo quando cambi matematica o aspetto |
| `author` | testo | facoltativo |
| `description` | testo | facoltativo |
| `engineApi` | numero | sempre `1` |

## math/reels.json

```json
{
  "rows": 3,
  "modes": {
    "base": [["A", "K", "WILD", "Q"], ["K", "A", "J"], ["..."], ["..."], ["..."]],
    "free": [["..."], ["..."], ["..."], ["..."], ["..."]],
    "gold": [["..."], ["..."], ["..."], ["..."], ["..."]]
  }
}
```

| Campo | Regole |
| --- | --- |
| `rows` | righe visibili, da 1 a 10 |
| `modes.base` | obbligatoria: una striscia per rullo; il numero di strisce è il numero di rulli |
| `modes.free` | facoltativa: strisce dei free spin; se manca si usano quelle base. Se c'è, serve `freeSpins` in `features.json` |
| altre modalità | facoltative, con nome in minuscolo (`gold`, `boss`, `bonus_2`): si giocano solo quando uno script le chiede |

Ogni modalità deve avere lo stesso numero di rulli della base, ogni striscia almeno `rows` simboli e solo simboli definiti in `paytable.json`. Le strisce possono avere lunghezze diverse.

Consigli pratici (non controllati dal motore, ma importanti):
- Evita due simboli uguali di fila sulla stessa striscia e tieni wild e scatter lontani tra loro almeno `rows` posizioni, così non compaiono due volte nella stessa colonna.
- Un solo scatter per striscia nella base rende la frequenza dei free spin facile da prevedere.
- Strisce più lunghe con più simboli bassi abbassano sia l'RTP base sia la frequenza dei bonus.

## math/lines.json

```json
{ "lines": [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0]] }
```

Ogni linea dà, per ogni rullo da sinistra, la riga toccata (0 = in alto). Ogni linea ha tante posizioni quanti sono i rulli e nessuna riga oltre `rows - 1`. Il numero di linee è anche il divisore della puntata: con 10 linee, un pagamento di 50 su una linea vale 5 volte la puntata totale.

## math/paytable.json

```json
{
  "symbols": [
    { "id": "WILD", "kind": "wild" },
    { "id": "SCATTER", "kind": "scatter" },
    { "id": "H1", "kind": "normal" },
    { "id": "L1", "kind": "normal" }
  ],
  "linePays": {
    "WILD": { "3": 50, "4": 250, "5": 1000 },
    "H1": { "2": 2, "3": 40, "4": 150, "5": 500 },
    "L1": { "3": 5, "4": 15, "5": 50 }
  },
  "scatterPays": { "3": 2, "4": 10, "5": 50 }
}
```

| Campo | Regole |
| --- | --- |
| `symbols[].id` | lettere maiuscole, cifre e `_` (`DRAGO`, `A`, `10`, `H_1`) |
| `symbols[].kind` | `normal`, `wild` (al massimo uno) o `scatter` (al massimo uno) |
| `linePays` | per simbolo, quante volte la **puntata per linea** paga una corsa di N simboli uguali da sinistra. Chiavi da 1 al numero di rulli; i conteggi assenti non pagano |
| `scatterPays` | quante volte la **puntata totale** paga avere N scatter in qualunque punto della griglia. Un conteggio assente usa il valore del conteggio inferiore più vicino |

Regole di pagamento:
- **Linee:** si paga la corsa più lunga di simboli uguali partendo dal rullo più a sinistra; per ogni linea si paga solo la vincita migliore.
- **Wild:** sostituisce i simboli normali, mai lo scatter. Se la corsa di soli wild iniziale paga più del simbolo che sostituisce, si paga quella.
- **Scatter:** non paga sulle linee e interrompe una linea; paga per numero totale sulla griglia.

## math/features.json

```json
{
  "expandingWild": { "reels": [2, 3, 4] },
  "freeSpins": {
    "trigger": { "minScatters": 3, "spins": { "3": 10, "4": 15, "5": 20 } },
    "retrigger": true,
    "perExpandedWild": { "extraSpins": 0, "upgrade": true, "multiplier": 1 },
    "upgradeLadder": ["GATTO", "SCARABEO", "ANKH", "FARAONE"],
    "maxMultiplier": 25,
    "maxSpins": 1000
  },
  "maxWin": 5000
}
```

| Campo | Significato |
| --- | --- |
| `expandingWild.reels` | rulli (da 1) su cui un wild si espande su tutta la colonna, tranne gli scatter che restano visibili e contano. Vale in tutte le modalità. Richiede un simbolo `wild` |
| `freeSpins.trigger.minScatters` | scatter necessari nello spin base |
| `freeSpins.trigger.spins` | free spin assegnati per numero di scatter; un conteggio assente usa il valore inferiore più vicino |
| `freeSpins.retrigger` (`false`) | se gli scatter durante i free spin ne aggiungono altri, con la stessa tabella |
| `perExpandedWild.extraSpins` (`0`) | free spin in più per ogni wild espanso durante i free spin |
| `perExpandedWild.upgrade` (`false`) | ogni wild espanso fa salire di un livello l'upgrade, dallo spin **successivo**. Richiede `upgradeLadder` ed `expandingWild` |
| `perExpandedWild.multiplier` (`0`) | quanto sale il moltiplicatore dei free spin per ogni wild espanso. Parte da ×1, vale **già nello spin** in cui il wild compare e resta fino alla fine. Richiede `expandingWild` |
| `upgradeLadder` | simboli normali dal meno al più pagante. Al livello L i primi L simboli diventano il simbolo in posizione L |
| `maxMultiplier` (`10`) | tetto del moltiplicatore dei free spin, da 1 a 1000 |
| `maxSpins` (`1000`) | limite di sicurezza ai free spin di un round |
| `maxWin` (nessuno) | vincita massima di un round in multipli della puntata totale |

## scenes/main.json

La scena cambia solo l'aspetto: non tocca mai l'esito. Ogni campo è facoltativo.

```json
{
  "background": "#1b1430",
  "backgroundImage": "assets/background.svg",
  "symbols": {
    "DRAGO": {
      "label": "Drago",
      "color": "#5c1a1a",
      "image": "assets/symbols/drago.svg",
      "winFrames": ["assets/symbols/drago-win-1.svg", "assets/symbols/drago.svg"],
      "fps": 6
    }
  },
  "sounds": { "spin": "assets/sounds/spin.wav", "win": "assets/sounds/win.wav" },
  "modes": { "gold": { "label": "Gold Spin", "description": "regola mostrata nella paytable" } }
}
```

| Campo | Significato |
| --- | --- |
| `background` | colore della pagina dietro i rulli (`#rrggbb`) |
| `backgroundImage` | immagine che copre l'area di gioco |
| `symbols.<ID>.label` (l'id) | nome mostrato su tessere e paytable |
| `symbols.<ID>.color` | colore della tessera, obbligatorio per ogni simbolo descritto |
| `symbols.<ID>.image` | immagine del simbolo, al centro della tessera |
| `symbols.<ID>.winFrames` | fotogrammi mostrati in ciclo quando il simbolo vince; senza, il simbolo pulsa |
| `symbols.<ID>.fps` (`8`) | fotogrammi al secondo, al massimo 60 |
| `sounds` | `spin` (partenza), `stop` (ogni rullo che si ferma), `win`, `bigWin` (da 20× la puntata), `feature` (free spin e sequenze degli script) |
| `modes.<modo>.label` | nome di una modalità aggiunta, per esempio "Gold Spin" |
| `modes.<modo>.description` | regola della modalità, mostrata nella paytable |

I simboli non descritti ricevono un colore predefinito. I percorsi degli asset partono da `assets/`, usano lettere, cifre, `-`, `_` e `.`, e finiscono con un formato ammesso: PNG, JPG, WebP, GIF o SVG per le immagini; MP3, OGG o WAV per i suoni. Ogni asset citato deve esistere. Di solito questi campi li scrive `npm run assets -- build`.

## Mod in zip

Un mod è lo zip della cartella del modulo, con i file nella radice o dentro una sola cartella. Si crea con `npm run mod -- pack slots/<id>` e si installa con `npm run mod -- install mio-mod.zip` oppure dal pulsante **Importa mod** del client. Limiti: 500 file, 50 MB estratti, nessun percorso che esce dalla cartella. Nello zip finiscono solo i file del modulo e `assets/`; `art/` resta fuori.

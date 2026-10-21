# Asset: immagini, animazioni e suoni

Gli asset di una slot (immagini dei simboli, fotogrammi delle vincite, sfondo, suoni) non si scrivono a mano in `assets/`: si descrivono in `art/art.json` e si generano con `npm run assets -- build slots/<id>`. Il comando:
- rifà da zero `assets/symbols/` e `assets/sounds/` e scrive `assets/background.svg`;
- aggiorna in `scenes/main.json` colori, immagini, fotogrammi e suoni dei simboli, lasciando com'erano etichette, nomi delle modalità e gli altri campi;
- valida il modulo risultante.

La cartella `art/` contiene le sorgenti e non finisce negli zip dei mod. Un test controlla che gli asset salvati delle slot di esempio corrispondano al loro `art/art.json`: dopo ogni modifica va rifatta la build.

## art/art.json

```json
{
  "prompt": "16-bit fantasy RPG pixel art, bold black outlines, limited palette",
  "look": "pixel",
  "symbols": {
    "SPADA": {
      "tile": "#3b4252",
      "prompt": "a glowing steel sword with a golden hilt, the wild symbol",
      "pixels": { "palette": { "K": "#111111", "W": "#f8f9fa" }, "rows": ["..KK", ".KWK", "KWK.", "KK.."] }
    },
    "DRAGO": { "tile": "#5c1a1a", "svg": "art/symbols/drago.svg" },
    "MAGO": { "tile": "#2e1f5e", "svg": "art/symbols/mago.svg", "image": "art/raw/mago.png" }
  },
  "win": { "frames": 2, "fps": 6 },
  "background": { "svg": "art/background.svg", "prompt": "night sky over purple mountains" },
  "sounds": {
    "spin": { "wave": "square", "notes": [[[220, 660], 0.18]], "volume": 0.35 },
    "win": { "wave": "square", "notes": [[523.25, 0.07], [659.25, 0.07], [783.99, 0.14]], "volume": 0.45 }
  }
}
```

| Campo | Significato |
| --- | --- |
| `prompt` | stile comune, ripreso in testa a ogni prompt per il generatore esterno |
| `look` (`pixel`) | `pixel`: tessere quadrate e pixel netti; `smooth`: tessere arrotondate con cornice in rilievo, pannello incassato con luce dall'alto e grana leggera, bagliore morbido |
| `frame` (`#c9a227`) | colore della cornice delle tessere `smooth` (predefinito oro; per esempio `#b8c4d0` argento, `#8a5a3c` bronzo) |
| `symbols.<ID>.tile` | colore della tessera e colore del simbolo nella scena; scuro, diverso per ogni simbolo |
| `symbols.<ID>.pixels` | pixel art: `rows` una stringa per riga (tutte lunghe uguali), `.` trasparente, ogni altro carattere preso da `palette` |
| `symbols.<ID>.svg` | file vettoriale in `art/`, con `viewBox` (oppure `width` e `height`) |
| `symbols.<ID>.image` | PNG, JPG o WebP in `art/`, incorporato nell'immagine del simbolo |
| `symbols.<ID>.prompt` | soggetto per il generatore esterno (in inglese) |
| `symbols.<ID>.glow` | colore del bagliore nelle vincite (predefinito: la tessera schiarita) |
| `symbols.<ID>.animation` | animazione di vincita fatta di immagini (vedi [Animazioni generate](#animazioni-generate)): `frames` percorso con `#` al posto del numero, `count`, `fps` (`12`), `loop` (`pingpong` o `loop`); prende il posto di `win.frames` per quel simbolo |
| `symbols.<ID>.motion` | il disegno si muove da solo nel client sopra la tessera, senza fotogrammi (vedi [Disegni che si muovono](#disegni-che-si-muovono)): `win` (`pop`), `shine` (`true`), `land` (`false`), `strength` (`1`); alternativo a `animation` |
| `symbols.<ID>.rig` | file JSON in `art/` con le parti del disegno che si muovono ognuna per conto suo nelle vincite (vedi [Simboli a parti](#simboli-a-parti-rig)); richiede `motion` |
| `win.frames` (`1`) | fotogrammi illuminati, da 1 a 8, seguiti dal simbolo normale |
| `win.fps` (`6`) | velocità dell'animazione |
| `background.svg` / `background.image` | sfondo; `prompt` per il generatore esterno |
| `sounds.<evento>` | effetti `spin`, `stop`, `win`, `bigWin`, `feature`; musiche in loop `music` (gioco base) e `bonusMusic` (free spin e sequenze degli script) |
| `sounds.<evento>.file` | suono già pronto in `art/` (OGG, MP3 o WAV), copiato in `assets/sounds/`: per esempio composto con [tools/audio](../tools/audio/README.md). Al posto di `wave`, `notes` e `volume` |
| `sounds.<evento>.wave` (`square`) | `square` (8 bit), `triangle` (morbido), `sine` (puro), `noise` (rumore, per colpi e scatti) |
| `sounds.<evento>.notes` | note in sequenza: `[frequenza in Hz, durata in s]` oppure `[[da, a], durata]` per una glissata |
| `sounds.<evento>.volume` (`0.5`) | da 0 a 1 |

Ogni simbolo deve avere almeno uno tra `pixels`, `svg` e `image`; se ne ha più di uno vince `image`, poi `svg`, poi `pixels`. Così si parte da un disegno di Claude e lo si sostituisce più avanti con un'immagine esterna, senza perdere la riserva. I simboli che `art.json` non descrive restano tessere colorate. Gli id devono esistere in `math/paytable.json`.

File prodotti per un simbolo `DRAGO` con `win.frames: 2`: `assets/symbols/drago.svg`, `drago-win-1.svg`, `drago-win-2.svg`; nella scena `winFrames` è `[drago-win-1, drago-win-2, drago]`. Con `motion` ci sono anche `drago-disegno.svg` (solo il disegno, su fondo trasparente) e `drago-tessera.svg` (la tessera senza disegno), e i fotogrammi `drago-win-*` sono tessere illuminate senza disegno. I suoni vanno in `assets/sounds/<evento>.wav`, o con l'estensione del `file` (`bigWin` diventa `big-win`, `bonusMusic` diventa `bonus-music`).

### Disegni che si muovono

Con `motion` il client separa il disegno dalla tessera e lo anima con PixiJS nelle vincite: la tessera si illumina coi fotogrammi di `win.frames` e il disegno ci si muove sopra, anche oltre il bordo della cella. Funziona con qualsiasi disegno (immagine generata, SVG o pixel art) e non serve rigenerare nulla.

| `motion.win` | Movimento | Adatto a |
| --- | --- | --- |
| `pop` | esce dalla tessera con un rimbalzo e poi respira, un po' più grande | wild, simboli alti |
| `pulse` | respira | lettere e simboli bassi, scatter |
| `swing` | oscilla a destra e sinistra | statue, amuleti, oggetti appesi |
| `spin` | gira come una ruota | monete, dischi, gemme rotonde |
| `wobble` | ondeggia come una gelatina, ferma alla base | creature morbide, fiamme, pozioni |
| `flutter` | si stringe e si allarga in fretta, come ali che battono | insetti, uccelli, pipistrelli |

`shine` fa passare un riflesso di luce che segue la sagoma del disegno (al posto del riflesso sulla cella intera). `land: true` fa fare al disegno un breve salto quando il rullo si ferma su di lui, di solito per wild e scatter. `strength` scala l'ampiezza: 0,6 per un movimento più contenuto, 1,5 per uno più vistoso. Con l'impostazione di sistema "riduci movimento" il client torna alla pulsazione semplice e non fa i salti.

```json
"SOLE": { "tile": "#8a5a00", "image": "art/raw/sole.webp", "motion": { "win": "pop", "land": true } }
```

### Simboli a parti (rig)

Con `rig` il disegno si divide in parti che si muovono ognuna per conto suo, come nelle slot commerciali fatte con Spine: ali che battono, zampe che camminano, una corona che oscilla. Le parti sono pixel dell'immagine originale, quindi il simbolo non cambia mai aspetto, il loop chiude sempre e lo sfondo resta trasparente. Il movimento di `motion` (uscita dalla tessera, respiro, riflesso) resta e porta con sé tutte le parti.

Il rig sta in un file a parte, per esempio `art/rig/scarabeo.json`, con le coordinate in pixel dell'immagine del simbolo:

```json
{
  "size": [512, 512],
  "loop": 1.2,
  "parts": [
    {"id": "zampa-a-sx", "shape": [[78, 64], [132, 64], [150, 138], [186, 152], [188, 182], [140, 184]], "pivot": [186, 170], "moves": [{"rotate": 7, "cycles": 2}]},
    {"id": "ala-sx", "shape": [[4, 176], [176, 178], [180, 192], [177, 250], [100, 280], [4, 280]], "pivot": [180, 214], "front": true,
     "moves": [{"scaleX": -0.42, "perspective": 0.5, "shade": 0.22, "rotate": 4, "cycles": 2, "wave": "pulse"}]}
  ]
}
```

| Campo | Significato |
| --- | --- |
| `size` | larghezza e altezza in pixel dell'immagine a cui si riferiscono le coordinate |
| `loop` (`1.2`) | durata del loop in secondi |
| `parts[].id` | nome della parte, in minuscolo |
| `parts[].shape` | poligono che ritaglia la parte; un pixel va alla prima parte dell'elenco che lo contiene, quello che resta fuori da tutte è il corpo, che sta fermo |
| `parts[].pivot` | attaccatura: il punto attorno a cui la parte ruota e si allunga |
| `parts[].front` (`false`) | `true` disegna la parte davanti al corpo (ali); di solito sta dietro (zampe, antenne) |
| `parts[].moves` | da 1 a 8 movimenti che si sommano |
| `moves[].rotate` | rotazione in gradi |
| `moves[].scaleX`, `moves[].scaleY` | allungamento: `-0.4` schiaccia del 40% verso il perno |
| `moves[].x`, `moves[].y` | spostamento in pixel |
| `moves[].perspective` | il lato lontano dal perno cresce in altezza, come un'ala che si alza verso chi guarda |
| `moves[].shade` | scurisce la parte, da 0 a 0.9, quando il movimento è al massimo |
| `moves[].cycles` (`1`) | quante volte il movimento si ripete in un loop (intero) |
| `moves[].phase` (`0`) | sfasamento da 0 a 1: `0.5` va in controfase, utile per zampe alternate |
| `moves[].wave` (`sine`) | `sine` va avanti e indietro attorno alla posa ferma; `pulse` va dalla posa ferma al massimo e torna (battito d'ali) |

Il client ritaglia le parti una volta sola all'avvio e le muove con mesh PixiJS; nelle prime 0,25 s i movimenti crescono da zero, così il disegno non salta. L'ampiezza segue `motion.strength`, e con "riduci movimento" il rig si ferma come il resto.

Come si prepara:

1. Genera il simbolo in una posa aperta: parti che non si coprono a vicenda (ali spiegate, zampe staccate dal corpo).
2. Guarda l'immagine con una griglia sopra (Python con Pillow va bene) e scrivi i poligoni larghi attorno a ogni parte, senza toccare il corpo; le parti vicine vanno messe prima nell'elenco.
3. Per controllare, disegna i poligoni sopra l'immagine e verifica che nessun pezzo resti staccato fuori dalle parti.
4. `npm run assets -- build slots/<id>`, poi nel client una vincita con quel simbolo.

Sullo scarabeo del Tempio del Sole (`slots/tempio-del-sole/art/rig/scarabeo.json`) bastano 11 parti: due ali davanti al corpo, sei zampe che si muovono a tre a tre come in un insetto vero, due antenne e la testa.

## Linee guida per disegnare

**Leggibilità e gerarchia**
- Wild e scatter si riconoscono a colpo d'occhio: forma unica, colori più saturi, scritta WILD o SCATTER nel disegno se non è ovvio.
- I simboli alti sono figure dettagliate; i bassi (A, K, Q, J, 10 o equivalenti a tema) sono semplici e coerenti tra loro.
- Ogni simbolo ha una sagoma diversa, riconoscibile anche piccola e in scala di grigi.
- Colore della tessera scuro e diverso dal colore principale del disegno.

**Pixel art** (`look: pixel`): griglia 16x16, contorno scuro di 1 pixel, 3-5 colori più un riflesso, un pixel di margine. Rileggi la griglia riga per riga: un carattere sbagliato rompe la sagoma.

**Vettoriale** (`look: smooth`): `viewBox="0 0 100 100"`, disegno tra 6 e 94, contorno scuro di 2-3 unità, un gradiente per il volume, un riflesso chiaro. Gli `id` di gradienti e filtri devono essere unici per file (es. `sole-disc`), perché i file vengono annidati. Testo solo con font di sistema (Arial, Georgia) e `paint-order="stroke"`.

**Sfondo**: SVG 900x520 con `preserveAspectRatio="xMidYMid slice"`, scuro e calmo al centro dove stanno i rulli, dettagli ai bordi.

**Suoni**: `spin` glissata breve in salita (0,2 s); `stop` colpo corto (0,04-0,06 s, anche `noise`); `win` tre note in salita; `bigWin` 6-8 note che finiscono lunghe; `feature` un arpeggio. Una scala coerente col tema (pentatonica per il fantasy, frigia dominante per l'Egitto). Volume 0,3-0,55.

**Musica e suoni composti.** Per un suono da slot vera, con strumenti campionati e musica in loop, si scrive la partitura in Python e la si fa suonare a FluidSynth: vedi [tools/audio/README.md](../tools/audio/README.md) e l'esempio `slots/tempio-del-sole/art/audio/partitura.py`. I file vanno in `art/audio/` e si collegano con `sounds.<evento>.file`. Le musiche (`music`, `bonusMusic`) vanno in OGG Opus: il client le suona in loop con la Web Audio API, che riparte senza stacchi. Un MP3 lascia un attimo di silenzio a ogni giro e un OGG Vorbis, in Chrome, circa 12 ms di troppo. Il client le abbassa rispetto agli effetti e passa dall'una all'altra con una dissolvenza. Senza `bonusMusic` nei bonus resta `music`.

## Generatore di immagini esterno

```bash
npm run assets -- prompts slots/<id>     # scrive art/prompts.md
```

`art/prompts.md` contiene un prompt completo per ogni simbolo e per lo sfondo (stile comune + soggetto + vincoli: icona centrata, formato 1:1, niente testo né bordi) e il nome del file da salvare in `art/raw/`. Con le immagini pronte:

1. salvale in `art/raw/<id>.png` (sfondo in `art/raw/background.png`);
2. controlla che siano quadrate, centrate, senza testo, firme o watermark, coerenti tra loro e sotto i 300 KB;
3. aggiungi `"image": "art/raw/<id>.png"` ai simboli e `"background": { "image": "art/raw/background.png" }`;
4. `npm run assets -- build slots/<id>`, poi i controlli.

Usa lo stesso modello, le stesse impostazioni e lo stesso seed per tutta la serie. Nei prompt niente nomi di giochi, marchi o artisti viventi. Prima di usare un servizio esterno verifica che le sue condizioni permettano l'uso che vuoi fare delle immagini.

## ComfyUI in locale

Con [ComfyUI](https://github.com/comfyanonymous/ComfyUI) avviato sullo stesso computer, un comando genera tutte le immagini:

```bash
npm run assets -- generate slots/<id>                        # tutti i simboli e lo sfondo che mancano in art/raw/
npm run assets -- generate slots/<id> --only FARAONE --force # rifà un solo simbolo
npm run assets -- generate slots/<id> --only ANKH --variants 4  # 4 varianti con seed consecutivi
```

In PowerShell `npm run` perde il `--` e si prende le opzioni: lì usa `npm.cmd run assets -- generate ...` (da cmd, bash o dal terminale di VS Code con bash va bene `npm`). Se succede, il comando se ne accorge e si ferma senza generare nulla.

Per ogni simbolo il comando prende lo stesso prompt di `art/prompts.md` (con "plain light grey background" al posto della trasparenza, che SDXL non sa fare), lo mette nel workflow, lo manda all'API di ComfyUI e salva il risultato in `art/raw/<id>.webp`; lo sfondo va in `art/raw/background.webp`. Il workflow dei simboli scontorna l'immagine, quindi il file è già trasparente. ComfyUI restituisce PNG da 400-550 KB a 512 px; il comando li converte in WebP (qualità 88, trasparenza intatta), che pesa una frazione e resta sotto i 300 KB. Le immagini che ci sono già si saltano; `--force` le rifà. Ogni file generato viene registrato in `art/raw/generated.json` con prompt, seed, workflow, modello e data: serve a rifare la stessa immagine e a sapere da dove viene.

Il comando non cambia `art/art.json`: alla fine stampa le righe `"image": ...` da aggiungere ai simboli. Poi `npm run assets -- build slots/<id>` come sempre.

**Uno stile per tutta la serie.** Scrivi in `generate.reference` il file del simbolo guida (per esempio `art/raw/scarabeo.webp`), generalo per primo con `--only SCARABEO --variants 3`, copia la variante migliore in `art/raw/scarabeo.webp` e poi genera gli altri. Finché il riferimento manca si può generare solo lui. Il comando carica il riferimento in ComfyUI una volta sola, lo passa al nodo `LoadImage` del workflow e lo annota in `generated.json`. Il simbolo di riferimento stesso e lo sfondo si generano senza riferimento. Il riferimento passa anche un po' di composizione (alla prima prova un ankh è venuto dentro lo stesso medaglione dello scarabeo). Descrivi la forma nel `prompt` del simbolo invece di nominarla soltanto: SDXL non sa cos'è un ankh, ma capisce "una croce col braccio superiore ad anello". Scrivi anche "single object, no medallion" nel simbolo guida, abbassa `referenceWeight` e genera 2-3 varianti. Serve IP-Adapter installato in ComfyUI (vedi [tools/comfyui/README.md](../tools/comfyui/README.md)).

**Una forma imposta da un disegno.** Le forme che SDXL non conosce o disegna male (lettere, numeri, un sole con raggi alternati, un ankh) si danno con un disegno: `symbols.<ID>.shape` indica un SVG o un'immagine in `art/` (l'SVG del simbolo stesso, `art/symbols/a.svg`, oppure una sagoma fatta apposta in `art/forme/`). Il comando lo mette al centro di un quadrato grigio chiaro da 1024 px, lo carica in ComfyUI e usa il workflow `simbolo-forma.json`: ControlNet ricava i contorni del disegno (Canny) e li impone a SDXL per il primo 70% dei passi, poi lascia libero il modello di rifinire materiali e luce. Il prompt descrive il materiale e ripete la forma ("the capital letter A carved from polished purple amethyst"). Un simbolo con la forma non usa il riferimento di stile, che porterebbe con sé la forma del simbolo guida. Per le lettere conviene una forza alta (0,95), per le figure basta 0,8. Serve il modello ControlNet (vedi [tools/comfyui/README.md](../tools/comfyui/README.md)).

Le varianti vanno in `art/raw/varianti/<id>-<seed>.webp`. Per tenerne una, scrivi il suo seed nel simbolo (`"seed": 779`) e rilancia con `--only <ID> --force`: stesso seed, stesso modello e stesse impostazioni danno la stessa immagine.

| Campo di `art.json` | Significato |
| --- | --- |
| `generate.reference` | immagine guida dello stile in `art/`, di solito un simbolo già generato e scelto (`art/raw/faraone.webp`): i simboli si generano col workflow `simbolo-stile.json` (IP-Adapter) che ne copia lo stile |
| `generate.referenceWeight`, `generate.referenceMode` | peso (0,8 nel workflow) e modo (`style transfer`) dell'IP-Adapter; se i simboli copiano anche la forma del riferimento, abbassa il peso a 0,4-0,55. Lascia `style transfer`: alla prova `strong style transfer` ha copiato anche il soggetto (2 ankh su 3 sono diventati scarabei) |
| `generate.fit` (`true`) | ritaglia i bordi trasparenti dei simboli e ricentra il soggetto con un margine sottile, perché SDXL lascia molto spazio attorno all'oggetto |
| `generate.cleanup` (`true`) | toglie dai simboli i frammenti staccati che lo scontorno lascia sui bordi, tenendo solo il soggetto |
| `generate.seed` (`777`) | seed di tutta la serie |
| `generate.size` (`512`) | lato in pixel dei simboli salvati (ComfyUI li rimpicciolisce prima di salvarli) |
| `generate.backgroundSize` | `[larghezza, altezza]` dello sfondo; se manca resta quella del workflow (1344x768) |
| `generate.workflow`, `generate.backgroundWorkflow`, `generate.shapeWorkflow` | workflow propri in `art/` (formato API); predefiniti quelli di [tools/comfyui/workflows](../tools/comfyui/workflows/) |
| `generate.shapeStrength`, `generate.shapeEnd` | forza del ControlNet (0,8 nel workflow) e punto, da 0 a 1, in cui smette di guidare (0,7) |
| `symbols.<ID>.generate` (`true`) | `false` per saltare il simbolo, che resta SVG |
| `symbols.<ID>.shape`, `symbols.<ID>.shapeStrength` | disegno (SVG, PNG, WebP o JPG in `art/`) che impone la forma del simbolo con ControlNet, e forza propria al posto di `generate.shapeStrength` |
| `symbols.<ID>.reference: false`, `symbols.<ID>.referenceWeight` | genera quel simbolo senza riferimento di stile (per esempio se il riferimento ne cambia i colori), oppure con un peso diverso da `generate.referenceWeight` |
| `symbols.<ID>.seed`, `background.seed` | seed di un'immagine, al posto di `generate.seed` |

L'API predefinita è `http://127.0.0.1:8188`; un altro indirizzo si passa con `--url` o con la variabile `COMFYUI_URL`. Un workflow proprio va bene se ha un solo campionatore (`KSampler` o `KSamplerAdvanced`) col prompt positivo in un `CLIPTextEncode` (anche passando da nodi come `ControlNetApplyAdvanced`) e un solo `SaveImage`; per la forma serve un `LoadImage` intitolato `forma`: il comando trova da solo i nodi, non conta sui loro numeri. Requisiti, modelli e tempi misurati in [tools/comfyui/README.md](../tools/comfyui/README.md).

Il comando gira solo dove ComfyUI è raggiungibile, di solito il PC su cui è installato: un assistente in un ambiente cloud non lo raggiunge e deve chiedere alla persona di lanciarlo.

### Animazioni generate

Un simbolo già generato si può animare con un modello image-to-video, che parte dall'immagine del simbolo su fondo scuro e fa una clip di 2 s, seguita dallo scontorno di ogni fotogramma. [`tools/comfyui/workflows/animazione.json`](../tools/comfyui/workflows/animazione.json) (Wan 2.2 TI2V 5B, da lanciare a mano in ComfyUI) è stato provato sullo scarabeo del Tempio del Sole.

Il risultato è stato bocciato: movimento quasi assente o simbolo deformato, circa 2 minuti a clip e quasi tutta la RAM su una RTX 3080. I numeri sono in [tools/comfyui/prove/scarabeo/](../tools/comfyui/prove/scarabeo/README.md). Un modello video ridisegna il simbolo a ogni fotogramma, quindi perde i dettagli e non dà né trasparenza né loop puliti: per i simboli conviene il [rig a parti](#simboli-a-parti-rig), e i modelli video restano per effetti come fuoco o fumo. Il campo `animation` e il comando `frames` valgono per i fotogrammi di qualsiasi provenienza, anche disegnati a mano o esportati da Spine o Blender.

```bash
npm run assets -- frames slots/<id> --symbol SCARABEO --from <cartella-fotogrammi>
```

Il comando prende i fotogrammi PNG o WebP già scontornati, in ordine alfabetico, e li ritaglia tutti con lo stesso riquadro, quello che contiene il soggetto in ogni fotogramma: così il soggetto non balla e ha la stessa misura del simbolo fermo. Poi li salva in `art/raw/anim/<id>-NN.webp` e stampa il campo da mettere nel simbolo:

```json
"animation": { "frames": "art/raw/anim/scarabeo-##.webp", "count": 24, "fps": 12, "loop": "pingpong" }
```

Con `build` ogni fotogramma diventa `assets/symbols/<id>-anim-NN.svg`, sulla tessera del simbolo. `pingpong` va avanti e poi indietro: il workflow parte dal primo fotogramma ma non può imporre l'ultimo, quindi la clip non chiude il giro e un loop semplice salterebbe. Bastano 24 fotogrammi a 12 fps (uno su due di una clip a 24 fps). Ogni fotogramma pesa circa 60 KB, quindi conviene animare solo i simboli alti.

## Controllare il risultato

1. `npm run assets -- build slots/<id>` e `npm run mod -- check slots/<id>`.
2. Guarda tutti gli SVG di `assets/symbols/` insieme (una pagina HTML con le immagini in griglia, o uno screenshot con Playwright) e confrontali.
3. `npm run dev` e apri `http://localhost:5173/?slot=<id>&seed=1`: gira fino a una vincita e controlla griglia, sfondo, fotogrammi e suoni.
4. `npm test`.

## Usare asset propri senza art.json

Si possono anche mettere immagini e suoni direttamente in `assets/` e scrivere a mano i campi della scena (vedi [modulo.md](modulo.md#scenesmainjson)). In quel caso non lanciare `npm run assets -- build`, che rifarebbe `assets/symbols/` e `assets/sounds/`.

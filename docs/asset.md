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
| `look` (`pixel`) | `pixel`: tessere quadrate e pixel netti; `smooth`: tessere arrotondate con sfumatura e bagliore morbido |
| `symbols.<ID>.tile` | colore della tessera e colore del simbolo nella scena; scuro, diverso per ogni simbolo |
| `symbols.<ID>.pixels` | pixel art: `rows` una stringa per riga (tutte lunghe uguali), `.` trasparente, ogni altro carattere preso da `palette` |
| `symbols.<ID>.svg` | file vettoriale in `art/`, con `viewBox` (oppure `width` e `height`) |
| `symbols.<ID>.image` | PNG, JPG o WebP in `art/`, incorporato nell'immagine del simbolo |
| `symbols.<ID>.prompt` | soggetto per il generatore esterno (in inglese) |
| `symbols.<ID>.glow` | colore del bagliore nelle vincite (predefinito: la tessera schiarita) |
| `win.frames` (`1`) | fotogrammi illuminati, da 1 a 8, seguiti dal simbolo normale |
| `win.fps` (`6`) | velocità dell'animazione |
| `background.svg` / `background.image` | sfondo; `prompt` per il generatore esterno |
| `sounds.<evento>` | `spin`, `stop`, `win`, `bigWin`, `feature` |
| `sounds.<evento>.wave` (`square`) | `square` (8 bit), `triangle` (morbido), `sine` (puro), `noise` (rumore, per colpi e scatti) |
| `sounds.<evento>.notes` | note in sequenza: `[frequenza in Hz, durata in s]` oppure `[[da, a], durata]` per una glissata |
| `sounds.<evento>.volume` (`0.5`) | da 0 a 1 |

Ogni simbolo deve avere almeno uno tra `pixels`, `svg` e `image`; se ne ha più di uno vince `image`, poi `svg`, poi `pixels`. Così si parte da un disegno di Claude e lo si sostituisce più avanti con un'immagine esterna, senza perdere la riserva. I simboli che `art.json` non descrive restano tessere colorate. Gli id devono esistere in `math/paytable.json`.

File prodotti per un simbolo `DRAGO` con `win.frames: 2`: `assets/symbols/drago.svg`, `drago-win-1.svg`, `drago-win-2.svg`; nella scena `winFrames` è `[drago-win-1, drago-win-2, drago]`. I suoni vanno in `assets/sounds/<evento>.wav` (`bigWin` diventa `big-win.wav`).

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

**Uno stile per tutta la serie.** Genera prima il simbolo più importante, scegli la variante migliore e mettila in `generate.reference`; poi rigenera gli altri con `--force`. Il comando carica il riferimento in ComfyUI una volta sola, lo passa al nodo `LoadImage` del workflow e lo annota in `generated.json`. Il simbolo di riferimento stesso e lo sfondo si generano senza riferimento. Il riferimento passa anche un po' di composizione (alla prima prova un ankh è venuto dentro lo stesso medaglione dello scarabeo): descrivi bene la forma nel `prompt` del simbolo, abbassa `referenceWeight` e genera 2-3 varianti. Serve IP-Adapter installato in ComfyUI (vedi [tools/comfyui/README.md](../tools/comfyui/README.md)).

Le varianti vanno in `art/raw/varianti/<id>-<seed>.webp`. Per tenerne una, scrivi il suo seed nel simbolo (`"seed": 779`) e rilancia con `--only <ID> --force`: stesso seed, stesso modello e stesse impostazioni danno la stessa immagine.

| Campo di `art.json` | Significato |
| --- | --- |
| `generate.reference` | immagine guida dello stile in `art/`, di solito un simbolo già generato e scelto (`art/raw/faraone.webp`): i simboli si generano col workflow `simbolo-stile.json` (IP-Adapter) che ne copia lo stile |
| `generate.referenceWeight`, `generate.referenceMode` | peso (0,8 nel workflow) e modo (`style transfer`) dell'IP-Adapter; se i simboli copiano anche la forma del riferimento, prova 0,5-0,6 o `strong style transfer` |
| `generate.cleanup` (`true`) | toglie dai simboli i frammenti staccati che lo scontorno lascia sui bordi, tenendo solo il soggetto |
| `generate.seed` (`777`) | seed di tutta la serie |
| `generate.size` (`512`) | lato in pixel dei simboli salvati (ComfyUI li rimpicciolisce prima di salvarli) |
| `generate.backgroundSize` | `[larghezza, altezza]` dello sfondo; se manca resta quella del workflow (1344x768) |
| `generate.workflow`, `generate.backgroundWorkflow` | workflow propri in `art/` (formato API); predefiniti quelli di [tools/comfyui/workflows](../tools/comfyui/workflows/) |
| `symbols.<ID>.seed`, `background.seed` | seed di un'immagine, al posto di `generate.seed` |

L'API predefinita è `http://127.0.0.1:8188`; un altro indirizzo si passa con `--url` o con la variabile `COMFYUI_URL`. Un workflow proprio va bene se ha un solo campionatore (`KSampler` o `KSamplerAdvanced`) col prompt positivo in un `CLIPTextEncode` e un solo `SaveImage`: il comando trova da solo i nodi, non conta sui loro numeri. Requisiti, modelli e tempi misurati in [tools/comfyui/README.md](../tools/comfyui/README.md).

Il comando gira solo dove ComfyUI è raggiungibile, di solito il PC su cui è installato: un assistente in un ambiente cloud non lo raggiunge e deve chiedere alla persona di lanciarlo.

## Controllare il risultato

1. `npm run assets -- build slots/<id>` e `npm run mod -- check slots/<id>`.
2. Guarda tutti gli SVG di `assets/symbols/` insieme (una pagina HTML con le immagini in griglia, o uno screenshot con Playwright) e confrontali.
3. `npm run dev` e apri `http://localhost:5173/?slot=<id>&seed=1`: gira fino a una vincita e controlla griglia, sfondo, fotogrammi e suoni.
4. `npm test`.

## Usare asset propri senza art.json

Si possono anche mettere immagini e suoni direttamente in `assets/` e scrivere a mano i campi della scena (vedi [modulo.md](modulo.md#scenesmainjson)). In quel caso non lanciare `npm run assets -- build`, che rifarebbe `assets/symbols/` e `assets/sounds/`.

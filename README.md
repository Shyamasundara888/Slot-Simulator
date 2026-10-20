# Slot Simulator

Motore per creare slot machine moddabili: ogni slot è un **modulo** con regole, matematica, grafica e script separati, caricato da un motore comune.

Stato attuale: **fasi 1-5**. Il nucleo matematico gestisce linee, wild, scatter, wild espandenti, free spin con riattivazione, upgrade dei simboli e tetto di vincita, con un simulatore da riga di comando e il calcolo esatto dell'RTP dello spin base. Un client PixiJS nel browser fa giocare le slot con grafica provvisoria. I moduli possono aggiungere regole proprie con uno script Lua e si installano da uno zip, sia da riga di comando sia dal browser. Ci sono due slot di esempio: il Tempio del Sole (5x3, Gold Spins) e Pixel Quest (5x4, Combo e Boss Spin). La bozza di architettura completa è nel documento di progetto.

![Il client con il Tempio del Sole: tre scatter attivano i free spin](docs/client.png)

## Requisiti

- Node.js 20 o superiore

```
npm install
```

## Comandi

| Comando | Cosa fa |
| --- | --- |
| `npm run dev` | avvia il client nel browser su http://localhost:5173 |
| `npm run build:app` | crea la versione statica del client in `dist-app/` |
| `npm run sim -- slots/tempio-del-sole` | simula 1.000.000 di round e stampa RTP, frequenza vincite, volatilità, statistiche dei free spin |
| `npm run sim -- slots/tempio-del-sole --spins 5000000 --seed 42` | numero di round e seed a scelta; lo stesso seed dà sempre lo stesso risultato |
| `npm run sim -- slots/tempio-del-sole --exact` | RTP esatto dello spin base e frequenza esatta dei free spin, in meno di un secondo |
| `npm run sim -- slots/tempio-del-sole --json` | risultato in JSON |
| `npm run sim -- mods/pixel-quest-0.2.0.zip` | il simulatore legge anche un mod in zip, senza installarlo |
| `npm run mod -- install mio-mod.zip` | controlla il mod (script compreso) e lo estrae in `slots/<id>/`; con `--force` sostituisce un modulo esistente |
| `npm run mod -- pack slots/pixel-quest` | controlla il modulo e crea `mods/pixel-quest-0.2.0.zip`, pronto da condividere |
| `npm run mod -- check mio-mod.zip` | controlla un mod (zip o cartella) senza installarlo |
| `npm test` | test automatici |
| `npm run typecheck` | controllo dei tipi TypeScript |

Un **round** è uno spin base più gli eventuali free spin che attiva e le sequenze che lo script del modulo richiede. Se il modulo ha uno script, il simulatore lo esegue; `--exact` invece lo ignora. Esempio di output:

```
Tempio del Sole 0.4.0: 2.000.000 round, seed 1, 28.0 s
  script scripts/main.lua con hook onSpin, onFeatureEnd
  RTP simulato        95.08% ± 0.73% (95%)
    spin base         73.79%  (esatto 73.52%)
    free spin         17.58%
    modalità gold     3.71%
  Frequenza vincite   28.24% (1 round su 3.5)
  Deviazione std      5.30x
  Vincita massima     531.40x (round n. 544995)
  Tetto di vincita    5000x, raggiunto 0 volte
  Free spin:
    attivazione       1 round su 176 (esatto 1 su 175.4)
    spin per bonus    17.5 in media
    vincita media     30.93x
    upgrade medio     livello 2.53
  Modalità gold (richiesta dallo script):
    sequenze          1 round su 284
    spin per sequenza 1.8 in media
    vincita media     10.55x
```

## Formato di un modulo

Un modulo è una cartella dentro `slots/`. Un mod è lo zip di quella cartella: si installa con `npm run mod -- install`, che lo controlla prima di estrarlo, oppure estraendolo a mano in `slots/`. Lo zip può contenere i file direttamente o dentro una sola cartella; i file di sistema come `__MACOSX/` vengono ignorati, i percorsi che escono dalla cartella (`../`) rifiutati.

```
slots/tempio-del-sole/
  manifest.json        id, nome, versione, autore, versione dell'API del motore
  math/reels.json      righe visibili e strisce dei rulli per modalità (base, free e altre a scelta)
  math/lines.json      linee di pagamento: per ogni rullo, la riga toccata (0 = in alto)
  math/paytable.json   simboli, pagamenti su linea e pagamenti scatter
  math/features.json   facoltativo: wild espandenti, free spin, upgrade, tetto di vincita
  scenes/main.json     facoltativo: sfondo, aspetto dei simboli, suoni, nomi delle modalità
  scripts/main.lua     facoltativo: regole aggiuntive in Lua
  assets/              facoltativo: immagini e suoni usati da scenes/main.json
```

Regole di pagamento:

- **Linee:** si paga la corsa di simboli uguali partendo dal rullo più a sinistra. I pagamenti sono multipli della puntata per linea; la vincita totale è riportata in multipli della puntata totale.
- **Wild:** sostituisce i simboli normali, non lo scatter. Se una corsa di soli wild paga più del simbolo sostituito, si paga quella.
- **Scatter:** paga ovunque compaia sulla griglia, in multipli della puntata totale. Con più scatter dell'ultimo valore indicato vale l'ultimo valore.

### Funzioni bonus (`features.json`)

```json
{
  "expandingWild": { "reels": [2, 3, 4] },
  "freeSpins": {
    "trigger": { "minScatters": 3, "spins": { "3": 12 } },
    "retrigger": true,
    "perExpandedWild": { "extraSpins": 1, "upgrade": true },
    "upgradeLadder": ["GATTO", "SCARABEO", "ANKH", "FARAONE"]
  },
  "maxWin": 5000
}
```

- **Wild espandenti:** sui rulli indicati (da 1) un wild copre tutta la colonna, tranne gli scatter, che restano visibili e contano.
- **Free spin:** partono con `minScatters` scatter nello spin base e usano le strisce `free` se ci sono. Con `retrigger` gli scatter durante i free spin ne aggiungono altri.
- **Per ogni wild espanso durante i free spin:** `extraSpins` free spin in più e, con `upgrade`, un livello di upgrade per gli spin successivi. Al livello L i primi L simboli di `upgradeLadder` diventano il simbolo di posizione L.
- **Tetto di vincita:** `maxWin` limita la vincita di un round, in multipli della puntata totale, e ferma i free spin quando viene raggiunto.
- `maxSpins` (predefinito 1000) è un limite di sicurezza ai free spin di un round.

### Script Lua (`scripts/main.lua`)

Uno script aggiunge regole che i file JSON non descrivono. Il motore lo chiama in momenti precisi del round (gli **hook**) e lo script può chiedere di giocare altre sequenze di spin su una modalità di `reels.json`. L'esito resta deciso dal motore, quindi simulatore e client vedono le stesse regole.

```lua
-- Gold Spins del Tempio del Sole (versione ridotta)
spinModes = { "free" }            -- onSpin solo durante i free spin

function onSpin(spin)             -- dopo ogni spin
  for _ = 1, spin.wilds do
    if math.random(4) == 1 then round.gold = (round.gold or 0) + 1 end
  end
end

function onFeatureEnd(feature)    -- quando finiscono i free spin o una sequenza
  if feature.mode == "free" and (round.gold or 0) > 0 then
    return { mode = "gold", spins = round.gold, guaranteeWin = true }
  end
end
```

| Hook | Quando | Dati ricevuti |
| --- | --- | --- |
| `onSpin(spin)` | dopo ogni spin, nelle modalità di `spinModes` (tutte se manca) | `mode`, `index` (da 1), `win`, `wilds` (wild espansi), `scatters`, `level` (upgrade) |
| `onFeatureEnd(feature)` | alla fine dei free spin e di ogni sequenza richiesta | `mode`, `spins`, `win`, `level` |

- Entrambi possono restituire `nil` oppure `{ mode = "...", spins = n, guaranteeWin = true }`: le sequenze richieste si giocano dopo i free spin, una dopo l'altra. Con `guaranteeWin` ogni spin della sequenza viene rigiocato finché non vince.
- `round` è una tabella vuota all'inizio di ogni round, per lo stato dello script. Le vincite sono in multipli della puntata totale.
- `math.random` usa l'RNG del motore: con lo stesso seed lo script fa sempre le stesse scelte. Si può usare solo dentro gli hook.
- Lo script gira isolato (Lua 5.4 in WebAssembly, con wasmoon): niente `io`, `os`, `require`, `load`, `debug` né coroutine, al massimo 1.000.000 di istruzioni per chiamata e 16 MB di memoria. Un errore annulla il round e indica la riga dello script.
- In un round si giocano al massimo 1.000 spin richiesti dagli script, e il tetto di vincita vale anche per loro.
- Per dare un nome a una modalità nel client: `"modes": { "gold": { "label": "Gold Spin", "description": "..." } }` in `scenes/main.json`; la descrizione compare nella paytable.

### Scena e asset (`scenes/main.json`, `assets/`)

La scena decide solo l'aspetto: la matematica e l'esito dei round non cambiano. Ogni campo è facoltativo; un simbolo senza immagine è una tessera colorata con la sua etichetta.

```json
{
  "background": "#0f1a2b",
  "backgroundImage": "assets/background.svg",
  "symbols": {
    "DRAGO": {
      "label": "Drago",
      "color": "#7a1f1f",
      "image": "assets/symbols/drago.svg",
      "winFrames": ["assets/symbols/drago-glow.svg", "assets/symbols/drago.svg"],
      "fps": 6
    }
  },
  "sounds": { "spin": "assets/sounds/spin.wav", "win": "assets/sounds/win.wav" }
}
```

- `backgroundImage` copre tutta l'area di gioco; `image` va al centro della tessera del simbolo, adattata senza deformarla.
- `winFrames` sono i fotogrammi mostrati in ciclo quando il simbolo fa parte di una vincita, a `fps` fotogrammi al secondo (8 se manca, al massimo 60). Senza fotogrammi il simbolo vincente pulsa.
- `sounds` collega un suono a un evento: `spin` (partenza), `stop` (ogni rullo che si ferma), `win`, `bigWin` (da 20 volte la puntata) e `feature` (free spin e sequenze degli script).
- Formati: PNG, JPG, WebP, GIF e SVG per le immagini; MP3, OGG e WAV per i suoni. I percorsi partono da `assets/` e usano solo lettere, cifre, `-`, `_` e `.`.
- Il caricatore e `npm run mod -- check` segnalano ogni asset citato dalla scena e assente dalla cartella. Gli asset di Pixel Quest sono originali e generati da `node tools/pixel-quest-assets.mjs` (pixel art in SVG, suoni a 8 bit in WAV).

Il caricatore controlla la coerenza tra i file (simboli non definiti, linee fuori griglia, pagamenti impossibili) e riporta tutti i problemi in un solo messaggio.

## Il client

A ogni merge su `main` il client viene pubblicato su GitHub Pages (`.github/workflows/pages.yml`), all'indirizzo https://shyamasundara888.github.io/Slot-Simulator/. Va attivato una volta in Settings → Pages scegliendo "GitHub Actions" come sorgente; su un repository privato serve un piano GitHub a pagamento.

Il client (`app/`) è una pagina Vite con PixiJS. Include nel bundle tutti i moduli presenti in `slots/` e li mostra nel menu in alto.

- Il motore decide l'intero round prima che parta l'animazione; il client mostra soltanto l'esito: rulli che si fermano uno alla volta, celle trasformate da upgrade ed espansioni, linee vincenti, contatore dei free spin e delle sequenze richieste dagli script (per esempio "Gold Spin 1 di 2").
- Saldo virtuale di 1.000 crediti, salvato nel browser; puntata totale da 0,10 a 50; modalità turbo; paytable generata dalla matematica del modulo.
- Statistiche per slot, divise tra sessione (dura finché resta aperta la scheda) e totale: round giocati, puntato, vinto, bilancio, vincita massima, bonus attivati e ritorno osservato. Il bilancio di sessione e quello totale della slot aperta sono sempre visibili in basso; il pulsante Statistiche mostra il dettaglio e il riepilogo di tutte le slot.
- **Importa mod** carica una slot da uno zip senza ricompilare il sito: il mod viene controllato (script compreso), salvato nel browser (IndexedDB) e compare nel menu con "(mod)". **Rimuovi mod** lo toglie. Un mod non può usare l'id di una slot inclusa nel sito.
- Barra spaziatrice per girare. `?slot=<id>` apre una slot precisa, `?seed=<valore>` rende ripetibile la sequenza dei round.
- Immagini, sfondo, animazioni di vincita e suoni arrivano dalla scena del modulo, anche per i mod importati. Il pulsante **Audio** compare solo se la slot ha suoni e la scelta resta salvata nel browser. Senza asset i simboli sono tessere colorate con l'etichetta della scena; i simboli senza stile ricevono un colore predefinito.

## Come funziona

- `src/core/rng.ts`: generatore pseudo-casuale con seed (sfc32), estrazioni senza bias.
- `src/core/engine.ts`: round completo (spin base, free spin, sequenze degli script), upgrade, wild espandenti, tetto di vincita.
- `src/core/evaluate.ts`: valutazione di linee, wild e scatter.
- `src/module/`: schema dei file e validazione (`parse.ts`, usato anche dal browser), lettura e scrittura degli zip (`zip.ts`, anche nel browser), lettura da disco (`load.ts`).
- `src/cli/mod.ts`: installazione, creazione e controllo dei mod.
- `src/script/runtime.ts`: esecuzione isolata degli script Lua e collegamento agli hook del motore.
- `src/sim/exact.ts`: RTP esatto dello spin base. Su una linea i rulli sono indipendenti, quindi basta enumerare le combinazioni di simboli invece di tutte le posizioni di arresto; con i wild espandenti la distribuzione di ogni cella tiene conto della finestra del suo rullo. I free spin dipendono dallo stato del round e si misurano con la simulazione.
- `src/sim/simulate.ts`: simulazione Monte Carlo per round con intervallo di confidenza, RTP diviso tra spin base, free spin e modalità degli script, frequenza vincite, deviazione standard, fasce di vincita e statistiche dei free spin.

## Prossime fasi

7. Editor visuale, dopo che il motore si è stabilizzato.
8. API per integrare le slot in un gioco più grande.

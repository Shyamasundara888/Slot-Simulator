# Client e strumenti

## Client nel browser

```bash
npm run dev          # http://localhost:5173
npm run build:app    # versione statica in dist-app/
```

La versione pubblicata si aggiorna a ogni merge su `main`: https://shyamasundara888.github.io/Slot-Simulator/

Il client include nel bundle tutti i moduli in `slots/` e li mostra nel menu in alto.

| Funzione | Dettagli |
| --- | --- |
| Slot | menu in alto; `?slot=<id>` apre una slot precisa |
| Round ripetibili | `?seed=<valore>` fissa la sequenza dei round: stesso seed, stessi round. Utile per mostrare un bonus o riprodurre un problema |
| Puntata | da 0,10 a 50 (0,10 · 0,20 · 0,50 · 1 · 2 · 5 · 10 · 20 · 50) |
| Saldo | 1.000 crediti virtuali, salvati nel browser; **Azzera saldo** lo riporta a 1.000 |
| Gira | pulsante o barra spaziatrice; **Turbo** accorcia le animazioni |
| Audio | compare solo se la slot ha suoni; la scelta resta salvata |
| Effetti di vincita | le celle vincenti hanno un bagliore del colore del simbolo, un riflesso che scorre e scintille; da 20 volte la puntata parte la schermata GRANDE VINCITA (50: MEGA, 100: EPICA) con monete e contatore, anche a fine bonus per il totale del bonus. Un clic porta subito alla cifra finale; con "riduci movimento" del sistema niente particelle |
| Paytable | generata dalla matematica del modulo, con icone, regole delle funzioni e descrizioni delle modalità della scena |
| Statistiche | per slot, sessione (dura quanto la scheda) e totale: round, puntato, vinto, bilancio, vincita massima, bonus, ritorno osservato |
| Lingua | italiano o inglese, dal menu in alto a destra o con `?lang=it` / `?lang=en`; la scelta resta salvata |
| Modifica, Nuova slot | aprono l'editor visuale sulla slot del menu o su una slot nuova dal modello (vedi [Editor visuale](#editor-visuale)) |
| Importa mod | carica una slot da uno zip senza ricompilare il sito: viene controllata (script compreso), salvata nel browser (IndexedDB) e compare con "(mod)". **Rimuovi mod** la toglie. Un mod non può usare l'id di una slot inclusa |

Durante il gioco lo stato mostra il numero del free spin, il moltiplicatore raggiunto e l'upgrade attivo, poi le sequenze degli script ("1 × Boss Spin, con moltiplicatore ×12!"). Il motore decide l'intero round prima che parta l'animazione.

## Editor visuale

L'editor è nel client: a sinistra le schede, a destra l'anteprima giocabile. Lavora sugli stessi file di un modulo (vedi [modulo.md](modulo.md)), quindi tutto quello che si fa con l'editor si può fare anche a prompt, e una slot si può passare dall'uno all'altro.

| Parte | Cosa fa |
| --- | --- |
| Generale | `manifest.json` (id, nome, versione, autore, descrizione), griglia, colore di sfondo della scena |
| Simboli | simboli della paytable con tipo, etichetta e colore della scena, ordine; aggiunta e rimozione; rinominare un id aggiorna paytable, strisce, funzioni, scena e `art/art.json` (non lo script Lua: l'editor avvisa se lo script cita il vecchio id) |
| Paytable | pagamenti su linea (per puntata di linea) e scatter (per puntata totale); vuoto vuol dire nessun pagamento |
| Linee | una mini griglia per linea: si clicca la casella da cui passa la linea su ogni rullo; aggiunta e rimozione, avviso sulle linee doppie |
| Rulli | una modalità alla volta (spin base, free spin, modalità degli script); per ogni rullo quante volte compare ogni simbolo, con la lunghezza del rullo; cambiare un conteggio ridistribuisce i simboli del rullo senza ammassarli. Da qui si aggiungono e tolgono modalità. **Modifica le strisce simbolo per simbolo** mostra le strisce come testo, per chi vuole l'ordine esatto |
| Funzioni | `features.json`: wild espandenti e su quali rulli, free spin (scatter minimi, spin per numero di scatter, riattivazione, extra per wild espanso, scala degli upgrade), vincita massima |
| Problemi | gli errori del motore, come `npm run mod -- check` (script compreso), con il campo sbagliato evidenziato |
| Numeri | RTP esatto dello spin base a ogni modifica; **Simula** con 100.000, 1 milione o 5 milioni di round in un worker |
| Anteprima | si gioca la bozza, con saldo e statistiche separati da quelli veri; **Trova un seed** cerca un primo round con free spin o con le sequenze dello script |
| Salvataggio | bozza automatica in IndexedDB, una per slot di partenza; annulla e ripeti; **Ricomincia dall'originale** |
| Esportazione | **Scarica zip** (come `npm run mod -- pack`) e **Aggiungi al menu come mod** |

Cambiare la griglia adatta linee, strisce e pagamenti perché il modulo resti valido, ma poi linee e strisce vanno riviste nelle schede Linee e Rulli. Lo script Lua, la grafica e i suoni per ora si modificano nei file come descritto in [script-lua.md](script-lua.md) e [asset.md](asset.md).

`?edit=<id>` apre l'editor su una slot del menu, `?edit=new` su una slot nuova. Una slot inclusa nel sito si modifica come copia: lo zip si scarica con qualsiasi id, ma per aggiungerla al menu come mod l'id va cambiato.

Elementi utili per i test nel browser: `#edit-open`, `#edit-new`, `#ed-undo`, `#ed-redo`, `#ed-close`, `#ed-problems`, `#ed-base-rtp`, `#ed-simulate`, `#ed-sim`, `#ed-seed`, `#ed-seed-free`, `#ed-download`, `#ed-install`; i campi hanno `data-path="<file>#<percorso>"`, per esempio `math/paytable.json#linePays.A.5`.

Da codice le stesse operazioni sono in `src/edit/draft.ts`: `draftFromFiles`, `checkDraft`, `renameSymbol`, `addSymbol`, `removeSymbol`, `setLinePay`, `resizeGrid`, `draftZip` e le altre.

## Lingue dell'interfaccia

I testi del client e dell'editor stanno in `app/src/i18n/`: `it.ts` è la lingua di riferimento, `en.ts` ha le stesse chiavi. Per aggiungere una lingua si crea un file con tutte le chiavi di `it.ts` e lo si registra in `LANGUAGES` in `app/src/i18n/index.ts`; il controllo dei tipi segnala le chiavi mancanti e un test controlla che i segnaposto `{nome}` siano gli stessi. Restano nella lingua originale i testi scritti nei moduli e i messaggi d'errore del motore.

### Trovare un seed con un bonus

Per mostrare una funzione serve un seed il cui primo round la attivi. Uno script temporaneo con `tsx` lo trova in pochi secondi:

```ts
import { loadSlotModule } from "./src/module/load.js";
import { ScriptRuntime } from "./src/script/runtime.js";
import { playRound } from "./src/core/engine.js";
import { createRng } from "./src/core/rng.js";

const module = await loadSlotModule("slots/tempio-del-sole");
const hooks = module.script ? await ScriptRuntime.create(module.math, module.script) : undefined;
for (let i = 0; i < 100_000; i++) {
  const round = playRound(module.math, createRng(`s${i}`), hooks);
  if (round.extra.length > 0) { console.log(`?seed=s${i}`, round.totalWin); break; }
}
```

Seed già noti: Tempio del Sole `?seed=m233` (free spin fino a ×6 e un Gold Spin ×6), Pixel Quest `?seed=m62` (Boss Spin ×12).

### Provare il client in automatico

I test automatici (`npm test`) coprono motore, moduli, script, asset, operazioni dell'editor e traduzioni. Per il client si usa Playwright con Chromium: `npm run build:app`, `npx vite preview --port 4173`, poi uno script che apre `http://localhost:4173/?slot=<id>&seed=<s>`, clicca `#spin`, aspetta che il pulsante torni attivo e fa screenshot. Elementi utili: `#spin`, `#turbo`, `#status`, `#win`, `#balance`, `#paytable-open`, `#stats-open`, `#mute`, `#mod-file` (input per importare uno zip). Nell'ambiente cloud di Claude Code Chromium è in `/opt/pw-browsers/chromium` e va lanciato con `--use-gl=swiftshader --enable-unsafe-swiftshader`.

## Comandi

| Comando | Cosa fa |
| --- | --- |
| `npm run sim -- <modulo>` | simula 1.000.000 di round; opzioni `--spins N`, `--seed S`, `--exact`, `--json`, `--choice random\|N\|each` (come rispondere alle scelte del giocatore: a caso, sempre l'opzione N, oppure una simulazione per opzione) |
| `npm run mod -- check <modulo o zip>` | controlla un modulo come farebbe il motore, script compreso |
| `npm run mod -- pack <modulo> [--out DIR]` | crea `mods/<id>-<versione>.zip` |
| `npm run mod -- install <zip> [--slots DIR] [--force]` | controlla ed estrae in `slots/<id>/` |
| `npm run assets -- build <modulo>` | genera gli asset da `art/art.json` e aggiorna la scena |
| `npm run assets -- prompts <modulo>` | scrive `art/prompts.md` per un generatore esterno |
| `npm run assets -- generate <modulo>` | genera con ComfyUI in locale le immagini dei simboli e dello sfondo in `art/raw/` ([asset.md](asset.md#comfyui-in-locale)) |
| `npm test` | test automatici |
| `npm run typecheck` | controllo dei tipi |

Il simulatore accetta anche uno zip (`npm run sim -- mods/pixel-quest-0.3.0.zip`).

## Usare il motore da codice

```ts
import { loadSlotModule } from "./src/module/load.js";      // Node: legge una cartella o uno zip
import { parseSlotModule } from "./src/module/parse.js";     // Node e browser: valida file già letti
import { playRound } from "./src/core/engine.js";           // gioca un round
import { createRng } from "./src/core/rng.js";              // RNG con seed
import { simulate } from "./src/sim/simulate.js";           // Monte Carlo
import { exactRtp } from "./src/sim/exact.js";              // RTP esatto dello spin base
import { ScriptRuntime } from "./src/script/runtime.js";    // script Lua come hook del motore
```

`playRound(math, rng, hooks?)` restituisce lo spin base, i free spin (con spin, moltiplicatore, upgrade), le sequenze degli script, la vincita totale in multipli della puntata e se il round ha toccato il tetto.

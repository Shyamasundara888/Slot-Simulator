# Slot Simulator: guida per gli assistenti AI

Questo file è il punto d'ingresso per chi lavora sul repo tramite un assistente AI (Claude Code, Cursor, Copilot, ChatGPT e simili). Leggilo per intero prima di cambiare qualcosa: dice cosa è il progetto, dove sta ogni cosa, quali regole non si violano e quali comandi provano che il lavoro è giusto.

## Il progetto in breve

Slot Simulator è un motore per creare slot machine **moddabili**, un "Tabletop Simulator per le slot". Una slot è un **modulo**: una cartella in `slots/<id>/` fatta di file JSON (matematica, scena, asset), uno script Lua facoltativo e le immagini e i suoni. Il motore in TypeScript decide l'esito di ogni round; il client nel browser (PixiJS) mostra soltanto quell'esito. Un simulatore misura RTP e volatilità. I moduli si scambiano come zip (mod).

Le slot si creano e si modificano scrivendo file: per questo tutto si può fare anche solo con dei prompt, chiedendo a un assistente AI di seguire questa documentazione. L'editor visuale nel client (pulsante **Modifica**) scrive gli stessi file, quindi una slot può passare dall'editor ai prompt e viceversa.

## Dove leggere

| Se devi... | Leggi |
| --- | --- |
| capire il formato di un modulo, file per file e campo per campo | [docs/modulo.md](docs/modulo.md) |
| creare o tarare la matematica (RTP, volatilità, strisce, pagamenti) | [docs/matematica.md](docs/matematica.md) |
| aggiungere regole con uno script Lua | [docs/script-lua.md](docs/script-lua.md) |
| creare immagini, animazioni e suoni | [docs/asset.md](docs/asset.md) |
| provare una slot nel browser, importare mod, usare i comandi | [docs/client-e-strumenti.md](docs/client-e-strumenti.md) |
| seguire un percorso completo partendo da una richiesta in linguaggio naturale | [docs/ricette.md](docs/ricette.md) |
| capire un messaggio d'errore | [docs/errori.md](docs/errori.md) |

Per partire da zero c'è un modello completo e valido in [templates/slot-base/](templates/slot-base/). Le slot di esempio [slots/tempio-del-sole/](slots/tempio-del-sole/) (alta volatilità, grafica vettoriale) e [slots/pixel-quest/](slots/pixel-quest/) (5x4, pixel art) mostrano tutte le funzioni.

Con Claude Code ci sono anche skill pronte in `.claude/skills/`: `slot-nuova`, `slot-matematica`, `slot-asset-art`, `slot-asset-ai-images`. Si attivano da sole quando la richiesta corrisponde, oppure si chiamano per nome.

## Regole che non si violano

1. **Il motore decide, il client mostra.** Nessuna regola di gioco va nel client (`app/`). Una regola nuova va nei JSON del modulo, in uno script Lua o nel motore (`src/core/`), mai nell'animazione.
2. **Asset originali.** Non copiare, ricalcare o imitare in modo riconoscibile grafica, suoni, nomi o marchi di slot e giochi esistenti. Le slot reali si possono studiare per le meccaniche e la matematica osservabile, non per gli asset.
3. **Gli asset si generano.** `assets/symbols/` e `assets/sounds/` vengono rifatti da `npm run assets -- build`: si modificano `art/art.json` e i file in `art/`, mai i file generati.
4. **Ogni modifica si verifica** con i comandi qui sotto. Una slot non è pronta finché `npm run mod -- check` non dà OK e la simulazione non conferma l'RTP dichiarato.
5. **RTP sotto il 100%.** Le slot di esempio stanno tra il 94% e il 96%. Un RTP sopra il 100% è un errore di taratura.
6. **Stesso seed, stesso risultato.** Negli script usa solo `math.random` (l'RNG del motore), mai fonti di casualità esterne.

## Comandi

```bash
npm install                                   # una volta
npm run mod -- check slots/<id>               # valida il modulo (script compreso) e conta gli asset
npm run sim -- slots/<id> --exact             # RTP esatto dello spin base, in meno di un secondo
npm run sim -- slots/<id> --spins 2000000     # RTP totale, volatilità, vincita massima, frequenze dei bonus
npm run assets -- build slots/<id>            # genera immagini, animazioni, sfondo e suoni da art/art.json
npm run assets -- prompts slots/<id>          # prompt per un generatore di immagini esterno
npm run assets -- generate slots/<id>         # immagini dei simboli e dello sfondo con ComfyUI in locale, in art/raw/
npm test                                      # test automatici (devono passare tutti)
npm run typecheck                             # controllo dei tipi
npm run dev                                   # client su http://localhost:5173/?slot=<id>
npm run mod -- pack slots/<id>                # crea mods/<id>-<versione>.zip da condividere
```

## Mappa del codice

| Percorso | Contenuto |
| --- | --- |
| `slots/<id>/` | i moduli inclusi nel sito: ogni cartella è una slot |
| `templates/slot-base/` | modello da copiare per una slot nuova |
| `src/core/` | motore: RNG con seed, valutazione di linee e scatter, round completo con free spin e moltiplicatori |
| `src/module/` | schema dei file (`schema.ts`), validazione e coerenza (`parse.ts`, `build.ts`, `ui.ts` per `scenes/ui.json`), zip dei mod, lettura da disco |
| `src/ui/` | valori del round mostrati dagli elementi di interfaccia, segnaposto e scale |
| `src/script/runtime.ts` | esecuzione isolata degli script Lua (wasmoon) |
| `src/sim/` | RTP esatto dello spin base e simulazione Monte Carlo |
| `src/assets/` | generatore degli asset da `art/art.json` |
| `src/cli/` | comandi `sim`, `mod`, `assets` |
| `src/edit/` | operazioni sui moduli usate dall'editor: bozza, rinomina e rimozione di simboli, pagamenti, griglia, zip |
| `app/` | client Vite + PixiJS |
| `app/src/hud.ts` | elementi di interfaccia del modulo disegnati con PixiJS |
| `app/src/editor/` | editor visuale: stato e pannelli, schede, worker per simulazione e ricerca di seed |
| `app/src/i18n/` | testi dell'interfaccia: `it.ts` di riferimento, `en.ts` con le stesse chiavi |
| `test/` | test vitest |

## Convenzioni

- Testi, commenti, messaggi d'errore e documentazione sono in italiano. I testi che il client mostra vanno nei file di `app/src/i18n/` (italiano e inglese insieme), mai scritti direttamente nel codice. Gli id dei simboli sono in maiuscolo (`DRAGO`, `A`, `10`), gli id dei moduli e delle modalità in minuscolo (`pixel-quest`, `gold`).
- Le vincite sono sempre in **multipli della puntata**: le linee in multipli della puntata per linea, scatter e totali in multipli della puntata totale.
- Quando cambi la matematica o l'aspetto di una slot pubblicata, alza la versione in `manifest.json`.
- Nel README e nelle PR riporta i numeri misurati (RTP con intervallo, deviazione standard, vincita massima, frequenza dei bonus), non stime.

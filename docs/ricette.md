# Ricette: dalla richiesta alla slot

Questa pagina serve a due lettori. A chi usa il progetto dà **prompt pronti** da copiare in un assistente AI. All'assistente dà, per ogni richiesta, la **procedura**: i passi, i file da toccare e le verifiche. Ogni procedura finisce con le stesse verifiche (vedi [Verifiche finali](#verifiche-finali)).

Prima di tutto l'assistente legge [AGENTS.md](../AGENTS.md). Con Claude Code le skill in `.claude/skills/` coprono le stesse procedure.

## 1. Creare una slot nuova da un'idea

**Prompt di esempio**

> Crea una nuova slot "Abissi" a tema mondo sottomarino: 5x3, 20 linee, volatilità media, RTP 95%. Il wild è un tridente che si espande sui rulli 2-4, lo scatter una perla. Tre perle danno 10 free spin con moltiplicatore che sale a ogni tridente espanso. Grafica vettoriale originale e suoni morbidi.

**Procedura**
1. Copia `templates/slot-base/` in `slots/<id>/` (id in minuscolo con `-`). Aggiorna `manifest.json` (id, nome, versione `0.1.0`, descrizione).
2. Definisci i simboli in `math/paytable.json`: un wild, uno scatter, 3-4 simboli alti, 4-5 bassi. Id in maiuscolo.
3. Scrivi `math/lines.json` per la griglia richiesta (per 5x3 a 10 linee puoi copiare quelle del Tempio del Sole; per 20 linee aggiungi zig-zag e V senza ripeterne).
4. Scrivi `math/features.json` con le funzioni richieste, guardando le tabelle in [modulo.md](modulo.md#mathfeaturesjson).
5. Crea strisce di partenza in `math/reels.json` e tara seguendo [matematica.md](matematica.md) fino al profilo richiesto.
6. Se serve una regola che `features.json` non sa esprimere, scrivi `scripts/main.lua` ([script-lua.md](script-lua.md)) e aggiungi la modalità alla scena.
7. Scrivi `scenes/main.json` con etichette e nomi delle modalità, poi `art/art.json` e i disegni ([asset.md](asset.md)); `npm run assets -- build slots/<id>`. Per i bonus aggiungi `scenes/ui.json` con contatori e indicatori ([modulo.md](modulo.md#scenesuijson)).
8. Verifiche finali.

## 2. Ricostruire le meccaniche di una slot reale

**Prompt di esempio**

> Ho giocato la demo di una slot 5x3 a 10 linee: wild che si espandono sui rulli centrali, 3 scatter danno 12 free spin, durante i free spin i simboli alti si trasformano. RTP dichiarato 96%, vincita massima 5000x. Ricostruiscila con grafica originale e un tema diverso.

**Procedura**
- Ricostruisci solo ciò che si osserva o è dichiarato (griglia, linee, funzioni, RTP, vincita massima, frequenza dei bonus). Non copiare nomi, grafica, suoni o testi del gioco originale: scegli un tema e simboli propri.
- I pagamenti osservati nella paytable della demo si possono riprendere come valori; le strisce dei rulli non sono visibili e vanno tarate fino a ottenere RTP e frequenze dichiarati.
- Scrivi nel `manifest.json` che la slot è "ispirata alle meccaniche classiche", senza nominare il gioco.
- Poi come la ricetta 1.

## 3. Cambiare volatilità o RTP

**Prompt di esempio**

> Rendi Pixel Quest più volatile: voglio vincite rare ma fino a 3000x, RTP sempre intorno al 95%.

**Procedura**
1. Misura lo stato attuale: `npm run sim -- slots/<id> --spins 2000000` e `--exact`.
2. Scegli le leve (vedi [matematica.md](matematica.md#le-leve)): per più volatilità sposta RTP dalla base ai bonus, rendi i bonus più rari, aggiungi o alza i moltiplicatori.
3. Cambia una leva alla volta, misura, annota. Conferma con 4-8 milioni di round.
4. Aggiorna le descrizioni nella scena se le regole spiegate al giocatore cambiano, alza la versione e aggiorna i test che fissano l'RTP del modulo.

## 4. Aggiungere una funzione a una slot

**Prompt di esempio**

> Nel Tempio del Sole aggiungi un "Raggio di Ra": a ogni spin base, con probabilità 1 su 150, parte un giro bonus sui rulli gold con moltiplicatore ×3.

**Procedura**
1. Controlla se `features.json` la esprime già (wild espandenti, spin extra, upgrade, moltiplicatore per wild). Se sì, usa quello.
2. Altrimenti estendi `scripts/main.lua`: hook, stato in `round`, richiesta `{ mode, spins, guaranteeWin, multiplier }`. Se servono strisce nuove, aggiungi una modalità in `reels.json`.
3. Aggiungi la modalità alla scena con `label` e `description`.
4. Ritara: ogni funzione aggiunge RTP.

## 5. Dare o cambiare la grafica

**Prompt di esempio**

> Rifai la grafica di Pixel Quest in pixel art 16x16 a tema invernale: stessi simboli, palette fredda, sfondo con neve. Suoni a 8 bit più acuti.

**Procedura**: modifica `art/art.json` e i file in `art/`, poi `npm run assets -- build slots/<id>`. Mai a mano in `assets/symbols/` o `assets/sounds/`. Linee guida e controllo visivo in [asset.md](asset.md).

**Con un generatore di immagini esterno**

> Prepara i prompt per generare i simboli del Tempio del Sole con Stable Diffusion, poi integra le immagini che ho messo in art/raw.

Procedura in [asset.md](asset.md#generatore-di-immagini-esterno).

## 6. Condividere una slot come mod

> Crea lo zip di Abissi da mandare a un amico.

`npm run mod -- check slots/<id>`, poi `npm run mod -- pack slots/<id>`: lo zip è in `mods/`. Chi lo riceve lo apre con **Importa mod** nel client o con `npm run mod -- install`.

## Verifiche finali

Una richiesta è finita solo quando tutte queste verifiche passano. Riporta i numeri nella risposta o nella PR:

1. `npm run mod -- check slots/<id>` dà OK.
2. `npm run sim -- slots/<id> --exact` e `npm run sim -- slots/<id> --spins 4000000` (almeno): RTP con intervallo, RTP base, deviazione standard, vincita massima, frequenza dei bonus. L'RTP è sotto il 100% e vicino all'obiettivo.
3. `npm test` e `npm run typecheck` passano.
4. La slot si gioca nel client (`npm run dev`, `?slot=<id>`): griglia, vincite, bonus e paytable sono giusti. Se possibile trova un seed che attiva il bonus e indicalo.
5. Le regole spiegate nella scena e nella paytable corrispondono a quello che fa la matematica.
6. Il README elenca la slot se è nuova, e la versione nel `manifest.json` è aggiornata.

## Scrivere un buon prompt

- Indica griglia (rulli x righe), linee, RTP obiettivo e volatilità (bassa, media, alta).
- Descrivi wild, scatter e funzioni con numeri: "3 scatter danno 10 free spin", "un wild su 5", "fino a ×25".
- Indica lo stile grafico (pixel art o vettoriale), il tema e il tono dei suoni.
- Se ti ispiri a una slot reale descrivi le meccaniche, non chiedere di copiarne grafica o nome.
- Chiedi i numeri della simulazione nella risposta: così vedi se la slot è davvero quella che volevi.

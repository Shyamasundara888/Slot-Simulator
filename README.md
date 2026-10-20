# Slot Simulator

Motore per creare slot machine moddabili: ogni slot è un **modulo** con regole, matematica, grafica e script separati, caricato da un motore comune.

Questa è la **fase 1**: il nucleo matematico senza grafica, con un simulatore da riga di comando e il calcolo esatto dell'RTP. La bozza di architettura completa è nel documento di progetto.

## Requisiti

- Node.js 20 o superiore

```
npm install
```

## Comandi

| Comando | Cosa fa |
| --- | --- |
| `npm run sim -- slots/tempio-del-sole` | simula 1.000.000 di spin e stampa RTP, frequenza vincite, volatilità |
| `npm run sim -- slots/tempio-del-sole --spins 5000000 --seed 42` | numero di spin e seed a scelta; lo stesso seed dà sempre lo stesso risultato |
| `npm run sim -- slots/tempio-del-sole --exact` | RTP esatto della modalità base, in meno di un secondo |
| `npm run sim -- slots/tempio-del-sole --json` | risultato in JSON |
| `npm test` | test automatici |
| `npm run typecheck` | controllo dei tipi TypeScript |

Esempio di output:

```
Tempio del Sole 0.1.0: 2.000.000 spin, seed 42, 24.0 s
  RTP simulato        94.62% ± 0.54% (95%)
  RTP esatto          94.83%
    da linee          79.18%  (esatto 79.39%)
    da scatter        15.44%  (esatto 15.43%)
  Frequenza vincite   32.36% (1 spin su 3.1)
  Deviazione std      3.88x
  Vincita massima     681.50x (spin n. 796539)
```

## Formato di un modulo

Un modulo è una cartella dentro `slots/`. Per installare un mod basta estrarre il suo zip lì.

```
slots/tempio-del-sole/
  manifest.json        id, nome, versione, autore, versione dell'API del motore
  math/reels.json      righe visibili e strisce dei rulli per modalità
  math/lines.json      linee di pagamento: per ogni rullo, la riga toccata (0 = in alto)
  math/paytable.json   simboli, pagamenti su linea e pagamenti scatter
```

Regole di pagamento della fase 1:

- **Linee:** si paga la corsa di simboli uguali partendo dal rullo più a sinistra. I pagamenti sono multipli della puntata per linea; la vincita totale è riportata in multipli della puntata totale.
- **Wild:** sostituisce i simboli normali, non lo scatter. Se una corsa di soli wild paga più del simbolo sostituito, si paga quella.
- **Scatter:** paga ovunque compaia sulla griglia, in multipli della puntata totale.

Il caricatore controlla la coerenza tra i file (simboli non definiti, linee fuori griglia, pagamenti impossibili) e riporta tutti i problemi in un solo messaggio.

## Come funziona

- `src/core/rng.ts`: generatore pseudo-casuale con seed (sfc32), estrazioni senza bias.
- `src/core/engine.ts` e `src/core/evaluate.ts`: spin, griglia, valutazione di linee, wild e scatter.
- `src/module/`: schema dei file, validazione e caricamento dei moduli.
- `src/sim/exact.ts`: RTP esatto. Su una linea il simbolo di ogni rullo segue le frequenze della sua striscia e i rulli sono indipendenti, quindi basta enumerare le combinazioni di simboli invece di tutte le posizioni di arresto.
- `src/sim/simulate.ts`: simulazione Monte Carlo con intervallo di confidenza, frequenza vincite, deviazione standard, fasce di vincita e frequenza degli scatter.

## Prossime fasi

2. Componenti pronti: wild espandenti, free spins con retrigger, upgrade dei simboli.
3. Client minimo con PixiJS.
4. Scripting Lua con hook sul ciclo dello spin.
5. Caricamento dei mod da zip e seconda slot di esempio.
6. Editor visuale, dopo che il motore si è stabilizzato.
7. API per integrare le slot in un gioco più grande.

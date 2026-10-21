# Matematica e taratura

Questa guida spiega come progettare e tarare la matematica di una slot: quali numeri contano, quali leve li muovono e come misurarli. La taratura si fa sempre misurando, mai a occhio.

## I numeri che contano

| Misura | Cosa dice | Dove leggerla |
| --- | --- | --- |
| **RTP** (return to player) | quanto torna in media al giocatore per ogni credito puntato. 95% = su 100 crediti puntati ne tornano 95 nel lungo periodo | `npm run sim` (RTP simulato con intervallo al 95%) |
| **RTP base** | la parte di RTP che viene dagli spin base, senza bonus | `npm run sim -- --exact` (valore esatto) |
| **Frequenza vincite** | quota di round con una vincita qualsiasi | `npm run sim` |
| **Frequenza bonus** | ogni quanti round partono i free spin | `--exact` (esatta) e `npm run sim` |
| **Deviazione standard** | misura della volatilità, in multipli della puntata | `npm run sim` |
| **Vincita massima** | la più alta vista nella simulazione, e quante volte si è toccato il tetto | `npm run sim` |
| **Fasce di vincita** | quanti round vincono 0-1x, 1-5x, 5-20x, 20-100x, 100-1000x, oltre 1000x | `npm run sim` |

Riferimenti per una slot online tipica:

| Profilo | RTP | Deviazione std | Vincita massima tipica | Bonus |
| --- | --- | --- | --- | --- |
| volatilità bassa | 94-96% | 2-5x | 100-500x | 1 su 80-150 |
| media | 94-96% | 5-9x | 500-2000x | 1 su 150-250 |
| alta | 94-96% | 9-20x | 2000-10000x | 1 su 250-500 |

Le slot di esempio: `templates/slot-base` ≈ 94%, bassa (dev. 3,5x); Pixel Quest ≈ 95,5%, medio-alta (dev. 9,1x, max visto 2124x); Tempio del Sole ≈ 94,9%, alta (dev. 11,4x, max visto 4921x).

## Misurare

```bash
npm run sim -- slots/<id> --exact              # RTP base esatto e frequenza esatta dei free spin
npm run sim -- slots/<id> --spins 2000000      # tutto il resto
npm run sim -- slots/<id> --spins 8000000 --seed 1   # numeri da pubblicare
```

- L'intervallo "± x%" accanto all'RTP simulato è l'incertezza al 95%. Si stringe con la radice del numero di round: per una slot molto volatile servono milioni di round per stare entro ±1%. Due simulazioni con seed diversi che differiscono più dell'intervallo indicano un problema.
- `--exact` ignora script e free spin: è il modo veloce per tarare lo spin base, perché cambia subito a ogni modifica di strisce o pagamenti.
- Con lo stesso seed il risultato è identico: usa seed diversi per controllare la stabilità, lo stesso seed per confrontare due versioni.

## Le leve

**Spin base**
- *Pagamenti su linea* (`linePays`): alzano o abbassano l'RTP base in proporzione. Toccare i simboli bassi cambia molto l'RTP perché escono spesso; toccare quelli alti cambia la volatilità.
- *Composizione delle strisce*: più copie di un simbolo = esce più spesso. Più wild = molte più vincite. Aggiungere simboli bassi allunga la striscia, abbassa l'RTP base e rende più rari scatter e wild.
- *Numero di linee e forma*: più linee = vincite più frequenti e più piccole.

**Bonus**
- *Frequenza dei free spin*: scatter per striscia, lunghezza delle strisce, `minScatters`. Con uno scatter per rullo su strisce di lunghezza L e 3 righe, la probabilità che un rullo mostri lo scatter è circa 3/L.
- *Valore dei free spin*: numero di spin (`trigger.spins`), strisce `free` più ricche (più wild, più simboli alti), upgrade, moltiplicatori.
- *Moltiplicatori*: sono la leva principale della volatilità. Senza moltiplicatori una griglia piena del simbolo più alto vale al massimo il suo pagamento a 5 diviso il numero di linee per linea: con 10 linee e 500 per linea, 500 volte la puntata totale. Per rendere raggiungibili vincite da 5000x servono moltiplicatori (`perExpandedWild.multiplier`, `multiplier` nelle sequenze degli script).
- *Sequenze degli script*: Gold Spin, Boss Spin e simili aggiungono RTP in base a quanto spesso partono e quanto vincono (vedi [script-lua.md](script-lua.md)).

**Regola pratica per la volatilità**: a parità di RTP, sposta valore dallo spin base ai bonus e rendi i bonus più rari e più ricchi. Base intorno al 60-65% e bonus rari con moltiplicatori danno alta volatilità; base al 75% e bonus frequenti danno bassa volatilità.

## Procedura di taratura

1. Fissa il profilo: RTP obiettivo (es. 95%), volatilità (bassa, media, alta), frequenza dei bonus desiderata, vincita massima.
2. Decidi la ripartizione: per esempio base 65%, free spin 25%, sequenze degli script 5%.
3. Tara lo spin base con `--exact` cambiando strisce e pagamenti, finché l'RTP base è vicino all'obiettivo e la frequenza dei free spin è quella voluta.
4. Tara i bonus con simulazioni da 300.000-1.000.000 di round, cambiando una leva alla volta. Annota ogni prova (cosa hai cambiato, RTP, deviazione) per non girare in tondo.
5. Conferma con 4-8 milioni di round e due seed diversi. Pubblica quei numeri.
6. Aggiorna versione, descrizioni nella scena (le regole spiegate al giocatore devono corrispondere ai numeri: "un wild su 5", "ogni 5 vincite di fila") e i test che controllano l'RTP del modulo, se ce ne sono.

Consigli:
- Cambia una leva alla volta: le leve dei free spin interagiscono (più spin danno anche più occasioni di moltiplicatore e upgrade), quindi l'effetto non è lineare.
- Per esplorare molte varianti in fretta, conviene uno script temporaneo che carica il modulo con `loadSlotModule`, modifica l'oggetto `math` in memoria e chiama `simulate`; poi riporta nei file la variante scelta.
- Se una modifica alle strisce viola i vincoli pratici (wild e scatter troppo vicini, simboli uguali di fila), rigenera la striscia con un mescolamento che li rispetta invece di spostare simboli a mano.
- L'RTP mostrato dal client in "Statistiche" è quello osservato da un giocatore: su poche centinaia di round è lontanissimo da quello reale, non usarlo per tarare.

## Calcolo esatto dello spin base

`src/sim/exact.ts` calcola l'RTP base enumerando le combinazioni di simboli per ogni linea, tenendo conto dei wild espandenti, invece di simulare. È esatto e richiede meno di un secondo; anche la frequenza dei free spin è esatta. I free spin e gli script dipendono dallo stato del round, quindi si misurano solo con la simulazione.

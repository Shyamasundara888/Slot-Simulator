# Messaggi d'errore

Il motore valida un modulo per intero e riporta tutti i problemi insieme:

```
Modulo non valido:
  - math/paytable.json: symbols.3.id: usa solo lettere maiuscole, cifre e _
  - reels: modalità base, il rullo 2 usa il simbolo non definito DRAG0
```

Ogni riga comincia con il file o la sezione, poi il percorso del campo (`symbols.3.id` = quarto elemento di `symbols`, campo `id`), poi il problema. Correggi tutte le righe e riprova con `npm run mod -- check slots/<id>`.

## Formato dei file

| Messaggio | Causa e rimedio |
| --- | --- |
| `<file>: JSON non valido (...)` | virgola in più o in meno, virgolette mancanti, commenti (il JSON non li ammette) |
| `<file>: impossibile leggere il file` | file obbligatorio mancante: servono `manifest.json` e `math/reels.json`, `lines.json`, `paytable.json` |
| `...: Unrecognized key(s) in object: 'x'` | campo sconosciuto, spesso un errore di battitura: controlla il nome in [modulo.md](modulo.md) |
| `...: Required` | manca un campo obbligatorio (per esempio `color` di un simbolo nella scena) |
| `usa solo lettere maiuscole, cifre e _` | id di simbolo non valido (`Drago` → `DRAGO`) |
| `usa lettere minuscole, cifre e _, iniziando con una lettera` | nome di modalità non valido (`Gold` → `gold`) |
| `usa solo lettere minuscole, cifre e -` | id del modulo non valido (`Pixel_Quest` → `pixel-quest`) |
| `usa un colore esadecimale come #ffcc00` | colore non nel formato `#rrggbb` |
| `serve un'immagine dentro assets/ (...)` / `serve un suono dentro assets/ (...)` | percorso fuori da `assets/`, con spazi o con un formato non ammesso |

## Coerenza tra i file

| Messaggio | Causa e rimedio |
| --- | --- |
| `paytable: simbolo X definito due volte` | id ripetuto in `symbols` |
| `paytable: al massimo un wild` / `un scatter` | più simboli dello stesso tipo speciale |
| `reels: modalità M ha N rulli, la modalità base ne ha K` | tutte le modalità devono avere lo stesso numero di rulli |
| `reels: ..., il rullo R ha N simboli, meno delle K righe` | striscia troppo corta |
| `reels: ..., il rullo R usa il simbolo non definito X` | simbolo nelle strisce ma non in `paytable.json` (spesso un refuso: `DRAG0` con lo zero) |
| `reels: ci sono strisce per la modalità free ma features.freeSpins manca` | aggiungi `freeSpins` in `features.json` o togli `free` |
| `lines: la linea N ha K posizioni, servono R` | una posizione per rullo |
| `lines: la linea N usa una riga oltre la R` | righe da 0 a `rows - 1` |
| `linePays: simbolo non definito X` | pagamento per un simbolo che non esiste |
| `linePays: lo scatter X paga solo tramite scatterPays` | togli lo scatter da `linePays` |
| `linePays.X: numero di simboli N fuori da 1..R` | chiave oltre il numero di rulli |
| `scatterPays: nessun simbolo di tipo scatter definito` | aggiungi uno scatter o togli `scatterPays` |
| `features.expandingWild: nessun simbolo di tipo wild definito` / `il rullo N non esiste` | wild mancante o rullo oltre il numero di rulli (i rulli partono da 1) |
| `features.freeSpins: servono gli scatter per attivarli` | i free spin partono solo con uno scatter |
| `features.freeSpins: l'upgrade richiede upgradeLadder` / `richiede expandingWild` | l'upgrade avviene sui wild espansi e serve la scala dei simboli |
| `features.freeSpins: il moltiplicatore per wild espanso richiede expandingWild` | come sopra, per `perExpandedWild.multiplier` |
| `features.freeSpins.upgradeLadder: X non è un simbolo normale` / `simboli ripetuti` | la scala contiene solo simboli `normal`, una volta ciascuno |
| `features.freeSpins.trigger.spins: nessun free spin assegnato` | tutti i valori sono 0 o sotto `minScatters` |
| `scenes/main.json: asset mancante assets/...` | la scena cita un file che non c'è: rifai `npm run assets -- build` o correggi il percorso |
| `scenes/ui.json: asset mancante assets/...` | un elemento cita un'immagine o un suono che non c'è |
| `scenes/ui.json: elemento X: esce dallo stage LxA` / `reels: il riquadro dei rulli esce dallo stage` | riquadro oltre i bordi: correggi `x`, `y`, `width`, `height` o ingrandisci `stage` |
| `scenes/ui.json: elemento X: id ripetuto` | due elementi con lo stesso `id` |
| `scenes/ui.json: elemento X: visibleIn cita una modalità senza strisce dei rulli Y` | la modalità non esiste in `reels.json` |
| `scenes/ui.json: elemento X: format usa un segnaposto sconosciuto {Y}` | segnaposto scritto male; i valori ammessi sono in [modulo.md](modulo.md#scenesuijson). In `text` non c'è `{value}` |
| `scenes/ui.json: ...value: valore sconosciuto` | `value` non è tra i valori del round |
| `scenes/ui.json: elemento X: serve image oppure frames` | un elemento `image` vuole uno solo dei due campi |
| `scenes/ui.json: elemento X: un pannello ha options oppure button, non tutti e due` | un `panel` è un menu di scelta (`options`) oppure un avviso da chiudere (`button`) |

## Script Lua

| Messaggio | Causa e rimedio |
| --- | --- |
| `scripts/main.lua:N: ...` al caricamento | errore di sintassi alla riga N |
| `scripts/main.lua: nessun hook definito (onSpin, onFeatureEnd)` | serve almeno una delle due funzioni, globali (non `local function`) |
| `scripts/main.lua: spinModes: modalità senza strisce dei rulli X` | `spinModes` cita una modalità che `reels.json` non ha |
| `onSpin: troppe istruzioni, lo script è in un ciclo infinito?` | più di 1.000.000 di istruzioni in una chiamata |
| `onSpin deve restituire nil o { mode = "...", spins = n }: modalità senza strisce dei rulli X` | la richiesta usa una modalità inesistente |
| `...: spins non valido` | `spins` deve essere un intero da 0 in su |
| `...: multiplier deve essere un numero tra 1 e 1000` | moltiplicatore fuori intervallo (per esempio 0 da un contatore vuoto) |
| `...: ha restituito number` (o `string`) | l'hook deve restituire `nil` o una tabella |
| `math.random si può usare solo durante un round` | `math.random` chiamato al caricamento dello script, fuori dagli hook |
| `math.random: intervallo non valido` | argomenti non interi o `n < m` |
| `attempt to perform arithmetic on a nil value (field 'x')` | contatore non inizializzato: usa `(round.x or 0) + 1` |
| `ui.show: elemento sconosciuto X (non è in scenes/ui.json)` | anche per `ui.hide` e `ui.fx`: l'id non esiste in `scenes/ui.json` |
| `ui.set: nome non valido X` | i nomi dei valori usano lettere minuscole, cifre e `_` (`Oro` → `oro`) |
| `ui.set: from deve essere una cella { reel = 1..R, row = 1..N }` | la cella conta da 1; usa quelle di `spin.wildCells` e simili |
| `ui.set si può usare solo dentro gli hook` | vale per tutte le funzioni `ui` tranne `ui.get` |
| `ui.fx: effetto sconosciuto X` / `ui.message: serve un testo da 1 a 120 caratteri` | effetti ammessi: `pop`, `pulse`, `shake` |
| `choose: X non è un pannello con options in scenes/ui.json` | `choose` vuole l'id di un `panel` con `options` |
| `choose: risposta N fuori da 1..M` | il simulatore o l'editor hanno dato una risposta che il pannello non ha |
| `ui.pick: X non è un elemento picker di scenes/ui.json` / `ui.pick: servono da 1 a N premi` | `ui.pick` vuole l'id di un `picker` e un premio per ogni oggetto da scoprire, al massimo `count` |
| `scelta del giocatore senza risposta: X` | un programma ha giocato il round con `playRound` senza dire come rispondere alle scelte: usa `attemptRound`, oppure l'opzione `choice` dello script (`--choice` nel simulatore) |
| `--choice each`: `nessun pannello con options` | non ci sono scelte da confrontare: togli `--choice each` |

Nel client un errore dello script annulla il round, restituisce la puntata e mostra il messaggio.

## Zip dei mod

| Messaggio | Causa e rimedio |
| --- | --- |
| `zip: manca manifest.json nella radice dell'archivio` | i file devono stare nella radice dello zip o dentro una sola cartella |
| `zip: percorso non ammesso ...` | percorsi con `..`, assoluti o con `\` |
| `zip: più di 500 file` / `più di 50 MB una volta estratto` | togli file inutili (le sorgenti in `art/` non servono nel mod) |
| `slots/<id> esiste già: usa --force per sostituirlo` | `npm run mod -- install` non sovrascrive senza `--force` |

## Asset (`npm run assets`)

| Messaggio | Causa e rimedio |
| --- | --- |
| `manca art/art.json` | crea il file (vedi [asset.md](asset.md)) |
| `art/art.json: symbols.X: simbolo non presente in math/paytable.json` | id sbagliato o simbolo tolto dalla paytable |
| `art/art.json: symbols.X: manca art/...` | file SVG o immagine citato ma assente |
| `serve almeno uno tra pixels, svg e image` | il simbolo non ha un disegno |
| `carattere X senza colore nella palette` / `le righe devono avere la stessa lunghezza` | pixel art incoerente |
| `art/...: serve viewBox oppure width e height` | l'SVG non dichiara le sue dimensioni |

# Script Lua

Uno script (`scripts/main.lua`) aggiunge regole che i file JSON non descrivono: contatori, raccolte, bonus a fine feature, moltiplicatori calcolati. Il motore chiama lo script in momenti precisi del round, gli **hook**, e lo script può chiedere di giocare altre **sequenze di spin** su una modalità di `reels.json`. Lo script non disegna niente e non decide i simboli: l'esito di ogni spin resta del motore, quindi simulatore e client vedono le stesse regole.

## Hook

```lua
spinModes = { "free" }   -- facoltativo: onSpin viene chiamato solo in queste modalità

function onSpin(spin)
  -- dopo ogni spin
end

function onFeatureEnd(feature)
  -- alla fine dei free spin e di ogni sequenza richiesta
end
```

Serve almeno uno dei due hook. Dati ricevuti:

| Hook | Campo | Significato |
| --- | --- | --- |
| `onSpin(spin)` | `mode` | `"base"`, `"free"` o una modalità aggiunta |
| | `index` | numero dello spin nella sua feature, da 1 (lo spin base è 1) |
| | `win` | vincita dello spin in multipli della puntata totale, moltiplicatore compreso |
| | `wilds` | wild espansi nello spin |
| | `scatters` | scatter visibili |
| | `level` | livello di upgrade con cui è stato valutato |
| | `multiplier` | moltiplicatore applicato allo spin (1 se nessuno) |
| `onFeatureEnd(feature)` | `mode` | `"free"` o la modalità della sequenza finita |
| | `spins` | spin giocati |
| | `win` | vincita totale della feature |
| | `level` | livello di upgrade raggiunto |
| | `multiplier` | moltiplicatore raggiunto (free spin) o usato (sequenza) |

## Chiedere una sequenza

Entrambi gli hook possono restituire `nil` oppure una richiesta:

```lua
return { mode = "gold", spins = 3, guaranteeWin = true, multiplier = 5 }
```

| Campo | Regole |
| --- | --- |
| `mode` | una modalità con strisce in `reels.json` (anche `"base"` o `"free"`) |
| `spins` | intero da 0 in su |
| `guaranteeWin` (`false`) | se vero, ogni spin viene rigiocato finché non vince (fino a 1000 tentativi): usalo con strisce che vincono spesso |
| `multiplier` (`1`) | numero da 1 a 1000 che moltiplica la vincita di ogni spin della sequenza |

Le sequenze si mettono in coda e si giocano **dopo** i free spin, una dopo l'altra. Anche gli spin delle sequenze chiamano `onSpin` e la loro fine chiama `onFeatureEnd`, quindi una sequenza può chiederne un'altra. In un round si giocano al massimo 1000 spin richiesti dagli script e il tetto `maxWin` vale anche per loro.

Per mostrare un nome nel client aggiungi la modalità alla scena: `"modes": { "gold": { "label": "Gold Spin", "description": "regola per la paytable" } }`.

## Stato

- `round` è una tabella vuota all'inizio di ogni round: è il posto per contatori e raccolte (`round.gold = (round.gold or 0) + 1`).
- Le variabili globali definite al caricamento (costanti, tabelle) restano tra un round e l'altro. Non usarle per stato che cambia, o il risultato dipenderebbe dai round precedenti.

## Casualità

`math.random` usa l'RNG del round: con lo stesso seed lo script fa sempre le stesse scelte, nel client e nel simulatore. Forme ammesse: `math.random()` (decimale tra 0 e 1), `math.random(n)` (intero da 1 a n), `math.random(m, n)`. Si può chiamare solo dentro gli hook. `math.randomseed` non esiste.

## Sandbox e limiti

Lo script gira in Lua 5.4 compilato in WebAssembly (wasmoon), isolato:
- disponibili: funzioni base, `table`, `string`, `math`, `utf8`;
- assenti: `io`, `os`, `require`, `load`, `loadfile`, `dofile`, `debug`, `collectgarbage`, le coroutine e `string.dump`;
- al massimo 1.000.000 di istruzioni per chiamata (un ciclo infinito diventa un errore leggibile) e 16 MB di memoria.

Un errore nello script annulla il round, con il messaggio e la riga (`scripts/main.lua:12: ...`). `npm run mod -- check` carica lo script e controlla gli hook e `spinModes`; gli errori che dipendono dai dati del round emergono solo giocando o simulando, quindi simula sempre dopo aver cambiato uno script. Nell'editor visuale (scheda **Script**) questa prova parte da sola: a ogni modifica il motore gioca 3.000 round e segnala la riga e il seed del primo round che sbaglia.

## Ricette

**Raccolta durante i free spin, poi bonus garantito** (Gold Spin del Tempio del Sole):

```lua
spinModes = { "free" }
local GOLD_CHANCE = 5   -- un wild espanso su 5 è d'oro

function onSpin(spin)
  for _ = 1, spin.wilds do
    if math.random(GOLD_CHANCE) == 1 then round.gold = (round.gold or 0) + 1 end
  end
end

function onFeatureEnd(feature)
  if feature.mode == "free" and (round.gold or 0) > 0 then
    return { mode = "gold", spins = round.gold, guaranteeWin = true, multiplier = feature.multiplier }
  end
end
```

**Combo di vincite consecutive** (Boss Spin di Pixel Quest): conta gli spin vincenti di fila, sblocca un premio ogni N e usa la combo più lunga come moltiplicatore.

```lua
spinModes = { "free" }
local COMBO_FOR_BOSS = 5

function onSpin(spin)
  if spin.win > 0 then
    round.combo = (round.combo or 0) + 1
    round.best = math.max(round.best or 0, round.combo)
    if round.combo % COMBO_FOR_BOSS == 0 then round.boss = (round.boss or 0) + 1 end
  else
    round.combo = 0
  end
end

function onFeatureEnd(feature)
  if feature.mode == "free" and (round.boss or 0) > 0 then
    return { mode = "boss", spins = round.boss, guaranteeWin = true, multiplier = 2 * round.best }
  end
end
```

**Bonus casuale nello spin base** (una possibilità su 200 di 3 spin "bonus" a ×2):

```lua
spinModes = { "base" }
function onSpin(spin)
  if math.random(200) == 1 then return { mode = "bonus", spins = 3, multiplier = 2 } end
end
```

Ogni ricetta aggiunge RTP: dopo averla inserita, ritara la slot (vedi [matematica.md](matematica.md)). La modalità richiesta deve esistere in `reels.json`.

## Quando non serve uno script

Wild espandenti, free spin con riattivazione, spin extra, upgrade, moltiplicatore per wild espanso e tetto di vincita si configurano in `features.json` senza script. Usa uno script solo per quello che `features.json` non sa fare. Se una regola nuova serve a molte slot, è meglio aggiungerla al motore (`src/core/`) con i suoi test.

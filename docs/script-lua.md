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
| | `wildCells`, `expandedCells`, `scatterCells` | celle `{ reel, row }` (da 1) di wild, wild espansi e scatter, per le animazioni (vedi [Interfaccia](#interfaccia)) |
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

## Interfaccia

Lo script può pilotare gli elementi di `scenes/ui.json` ([modulo.md](modulo.md#scenesuijson)). Non disegna niente: dice cosa è cambiato, il motore lo annota sullo spin (o sulla fine della feature) e il client lo mette in scena dopo che i rulli si sono fermati, prima delle vincite. Il simulatore ignora queste richieste, quindi l'RTP non cambia.

| Funzione | Effetto |
| --- | --- |
| `ui.set(nome, valore)` | pubblica il valore `script.<nome>`: gli elementi con `"value": "script.<nome>"` o `{script.<nome>}` lo mostrano. Con `nome` uguale a `"session.<voce>"` cambia invece la voce di `session` |
| `ui.add(nome, quanto)` | come `ui.set`, sommando al valore attuale |
| `ui.set(nome, valore, { from = cella })` | anche con `ui.add`: un'icona del simbolo vola dalla cella agli elementi che mostrano il valore, che cambia quando arriva |
| `ui.get(nome)` | valore attuale (0 se mai pubblicato) |
| `ui.show(id)` / `ui.hide(id)` | mostra o nasconde un elemento fino alla fine del round, a prescindere da `visibleIn` |
| `ui.fx(id, effetto)` | anima un elemento una volta: `"pop"`, `"pulse"` o `"shake"` |
| `ui.message(testo)` | testo grande sopra i rulli per un attimo (fino a 120 caratteri) |
| `ui.pick(id, premi)` | pick-em: mostra il `picker` `id`, il giocatore tocca un oggetto per ogni premio e li scopre nell'ordine dato |
| `choose(id)` | chiede al giocatore di scegliere tra le `options` del `panel` `id`; restituisce il numero dell'opzione, da 1 |

- I nomi dei valori usano lettere minuscole, cifre e `_`; gli `id` sono quelli di `scenes/ui.json`. I valori ripartono da 0 a ogni round, come `round`.
- Le celle sono tabelle `{ reel = r, row = n }` contate da 1. `onSpin` riceve le celle utili: `spin.wildCells` (i wild atterrati), `spin.expandedCells` (per ogni wild espanso, la cella in cui è atterrato: tante quante `spin.wilds`) e `spin.scatterCells`.
- Le funzioni `ui` si usano solo dentro gli hook e non toccano `math.random`: aggiungerle a uno script non cambia i round.
- `ui.show` su un `panel` con `button` ferma la scena finché il giocatore non tocca il pulsante (in turbo il pannello si chiude da solo); il round però è già deciso.

```lua
-- Tempio del Sole: ogni wild d'oro manda una moneta nella barra dei Gold Spin.
for _, cella in ipairs(spin.expandedCells) do
  if math.random(GOLD_CHANCE) == 1 then
    round.gold = (round.gold or 0) + 1
    ui.add("gold", 1, { from = cella })
  end
end
```

```json
{ "id": "oro", "type": "meter", "value": "script.gold", "max": 10, "style": "segments", "direction": "up",
  "x": 12, "y": 334, "width": 120, "height": 206, "visibleIn": ["free"] }
```

## Scelte del giocatore

`choose(id)` mostra il pannello `id` di `scenes/ui.json` (un `panel` con `options`) e restituisce l'opzione scelta, da 1. Il motore calcola il round tutto in una volta, quindi la scelta funziona così:

1. il motore gioca il round finché lo script chiama `choose`, poi si ferma;
2. il client mostra il round fino a quel punto e aspetta il tocco del giocatore;
3. il motore rigioca il round dallo stesso stato dell'RNG con la risposta: tutto ciò che viene prima della scelta esce identico e lo script prosegue con l'opzione scelta.

Per questo lo script deve arrivare alla scelta sempre per la stessa strada: usa solo `round`, `math.random` e i dati dello spin, come già chiede la regola sulla casualità. Una scelta si può chiedere in `onSpin` (dopo che i rulli si sono fermati, prima delle vincite) o in `onFeatureEnd`.

Il simulatore non ha un giocatore: con `--choice random` (predefinito) sceglie a caso, con `--choice 2` sceglie sempre la seconda opzione, con `--choice each` fa una simulazione per opzione e le confronta. Nelle slot vere le opzioni di un menu rendono quasi lo stesso RTP e cambiano la volatilità: controllalo con `--choice each`.

**Pick-em.** I premi si decidono nello script, prima che il giocatore tocchi: `ui.pick(id, premi)` dice solo in che ordine scoprirli (da 1 al numero di oggetti del `picker`, testi o numeri). Dove tocca il giocatore non cambia niente, come nelle slot reali.

```lua
-- Pixel Quest: prima dei Boss Spin si sceglie se giocarli o tentare la Sfida.
local spins = round.boss
if choose("scelta") == 2 then
  if math.random(2) == 1 then
    spins = 2 * spins
    ui.pick("forzieri", { "Doppio! " .. spins .. " Boss Spin" })
  else
    spins = 0
    ui.pick("forzieri", { "Vuoto" })
  end
end
```

## Stato

- `round` è una tabella vuota all'inizio di ogni round: è il posto per contatori e raccolte (`round.gold = (round.gold or 0) + 1`).
- `session` resta tra un round e l'altro: è il posto per le raccolte lunghe, come "300 forzieri aprono il Tesoro" (sotto).
- Le variabili globali definite al caricamento (costanti, tabelle) restano tra un round e l'altro. Non usarle per stato che cambia: non vengono salvate, e il risultato dipenderebbe da round che il client non ricorda.

### session

`session` parte vuota e, alla fine di ogni round, il motore la salva per il round dopo. Il client la tiene **per slot e per puntata**, come le slot reali: cambiare puntata non porta con sé una barra quasi piena. Un round fermato su una scelta non salva niente, così il round rigiocato riparte dalla stessa `session`.

- Le voci hanno nomi in minuscolo (`forzieri`, `livello_2`) e valgono numeri, testi (fino a 200 caratteri) o `true`/`false`; al massimo 50 voci. Una voce che non rispetta queste regole è un errore alla fine del round.
- Le voci numeriche si vedono negli elementi come `session.<nome>` ([modulo.md](modulo.md#scenesuijson)): ogni cambio fatto in uno hook arriva all'interfaccia da solo. Con `ui.add("session.forzieri", 1, { from = cella })` cambia la voce e l'icona vola dalla cella; `ui.get("session.forzieri")` legge la voce (0 se manca).
- Il simulatore gioca i round in fila con la stessa `session`, come un giocatore che resta sempre alla stessa puntata: l'RTP misurato è quello di lungo periodo. Con `--session-reset N` la `session` riparte da zero ogni N round, come un giocatore nuovo: confrontare le due misure dice quanto pesa la barra.
- Lo stesso spin vale di più con la barra quasi piena: la taratura si fa sull'RTP di lungo periodo, e un premio che arriva dopo molti round va pagato da altre parti della slot.

```lua
-- Pixel Quest: ogni forziere dello spin base va nella barra del Tesoro; ogni 300 si apre un Boss Spin.
local function treasure(spin)
  for _, cella in ipairs(spin.scatterCells) do
    ui.add("session.forzieri", 1, { from = cella })
  end
  if (session.forzieri or 0) >= 300 then
    session.forzieri = session.forzieri - 300
    ui.message("Tesoro aperto: Boss Spin!")
    return { mode = "boss", spins = 1, guaranteeWin = true }
  end
end
```

## Casualità

`math.random` usa l'RNG del round: con lo stesso seed lo script fa sempre le stesse scelte, nel client e nel simulatore. Forme ammesse: `math.random()` (decimale tra 0 e 1), `math.random(n)` (intero da 1 a n), `math.random(m, n)`. Si può chiamare solo dentro gli hook. `math.randomseed` non esiste.

## Sandbox e limiti

Lo script gira in Lua 5.4 compilato in WebAssembly (wasmoon), isolato:
- disponibili: funzioni base, `table`, `string`, `math`, `utf8`;
- assenti: `io`, `os`, `require`, `load`, `loadfile`, `dofile`, `debug`, `collectgarbage`, le coroutine e `string.dump`;
- al massimo 1.000.000 di istruzioni per chiamata (un ciclo infinito diventa un errore leggibile) e 16 MB di memoria.

Un errore nello script annulla il round, con il messaggio e la riga (`scripts/main.lua:12: ...`). `npm run mod -- check` carica lo script e controlla gli hook e `spinModes`; gli errori che dipendono dai dati del round emergono solo giocando o simulando, quindi simula sempre dopo aver cambiato uno script.

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

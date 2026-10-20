---
name: slot-matematica
description: Tara RTP, volatilità, frequenza dei bonus e vincita massima di una slot del Slot Simulator modificando strisce, pagamenti, funzioni e moltiplicatori, misurando ogni passo con il simulatore.
---

# Tarare la matematica di una slot

Usala quando bisogna impostare o cambiare RTP, volatilità, frequenza dei bonus o vincita massima di un modulo in `slots/<id>/`, oppure dopo aver aggiunto una funzione o uno script che cambia l'RTP.

Leggi prima `docs/matematica.md` (numeri, leve, procedura) e le sezioni `math/` di `docs/modulo.md`.

## Passi

1. **Obiettivo.** Scrivi il profilo: RTP (95% se non detto), volatilità (deviazione standard di riferimento in `docs/matematica.md`), frequenza dei bonus, vincita massima, e una ripartizione dell'RTP tra base, free spin e sequenze degli script.
2. **Misura iniziale.** `npm run sim -- slots/<id> --exact` e `npm run sim -- slots/<id> --spins 1000000`.
3. **Spin base.** Cambia strisce e pagamenti e ricontrolla con `--exact` (meno di un secondo) finché RTP base e frequenza dei free spin sono quelli voluti.
4. **Bonus.** Cambia una leva alla volta (spin assegnati, strisce `free`, upgrade, `perExpandedWild.multiplier` e `maxMultiplier`, probabilità e `multiplier` negli script) e misura con 300.000-1.000.000 di round. Tieni una tabella delle prove: modifica, RTP, deviazione, vincita massima.
5. **Esplorazione veloce.** Per molte varianti scrivi uno script temporaneo nella cartella di lavoro temporanea (non nel repo) che usa `loadSlotModule`, modifica `math` in memoria e chiama `simulate` (con `ScriptRuntime.create` se il modulo ha uno script). Riporta poi nei file la variante scelta.
6. **Strisce.** Se aggiungi o togli simboli, rigenera la striscia con un mescolamento che evita simboli uguali di fila e tiene wild e scatter ad almeno `rows` posizioni tra loro. Non spostare simboli a mano a caso.
7. **Conferma.** 4-8 milioni di round con due seed diversi; i risultati devono stare negli intervalli dichiarati.
8. **Allineamento.** Aggiorna le descrizioni nella scena (le regole spiegate devono corrispondere ai numeri), la versione del manifest, i test che fissano l'RTP del modulo (`test/simulate.test.ts` per il Tempio del Sole) e i numeri nel README.

## Regole

- Mai un RTP sopra il 100%. Mai numeri non misurati nella risposta o nella PR.
- Senza moltiplicatori una griglia piena vale al massimo il pagamento più alto a 5 diviso per le linee: per vincite da migliaia di volte la puntata servono moltiplicatori.
- L'RTP osservato nelle statistiche del client non serve per tarare.

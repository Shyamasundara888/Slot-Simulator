---
name: slot-nuova
description: Crea una nuova slot (modulo in slots/<id>/) del Slot Simulator a partire da una descrizione in linguaggio naturale, o ricostruisce le meccaniche di una slot reale con tema e grafica originali.
---

# Creare una slot nuova

Usala quando la persona chiede una slot nuova ("crea una slot a tema...", "ricostruisci questa slot..."). Il risultato è un modulo completo in `slots/<id>/`, giocabile nel client, con matematica tarata e asset originali.

Prima di cominciare leggi `AGENTS.md`, poi `docs/ricette.md` (ricette 1 e 2) e `docs/modulo.md`. Sono la fonte aggiornata: se questa skill e i documenti differiscono, valgono i documenti.

## Passi

1. **Brief.** Ricava dalla richiesta: griglia (rulli x righe), linee, RTP obiettivo (95% se non detto), volatilità, wild, scatter, funzioni con i loro numeri, tema, stile grafico (`pixel` o `smooth`), tono dei suoni. Se manca qualcosa di importante, scegli un valore ragionevole e dillo nella risposta invece di fermarti.
2. **Base.** Copia `templates/slot-base/` in `slots/<id>/`. Aggiorna `manifest.json`. Rinomina i simboli (`H1`, `L1`...) con id a tema in maiuscolo in tutti i file.
3. **Matematica.** `math/paytable.json`, `math/lines.json`, `math/features.json`, `math/reels.json` secondo `docs/modulo.md`. Poi tara con la skill `slot-matematica` (o `docs/matematica.md`) fino al profilo del brief.
4. **Regole extra.** Solo se `features.json` non basta: `scripts/main.lua` secondo `docs/script-lua.md`, con le modalità nuove in `reels.json` e in `scenes/main.json` (`modes.<modo>.label` e `description`).
5. **Aspetto.** `scenes/main.json` con le etichette; `art/art.json` e i disegni con la skill `slot-asset-art`; `npm run assets -- build slots/<id>`. Se la slot ha bonus, aggiungi `scenes/ui.json` con contatore dei free spin, moltiplicatore e gli altri indicatori (vedi `docs/modulo.md`).
6. **Verifiche finali** di `docs/ricette.md`: `npm run mod -- check`, simulazione da almeno 4 milioni di round, `npm test`, `npm run typecheck`, prova nel client con un seed che attiva il bonus.
7. **Consegna.** Aggiungi la slot al README (elenco delle slot di esempio). Nella risposta o nella PR riporta i numeri misurati e il seed del bonus.

## Regole

- Solo asset, nomi e testi originali. Da una slot reale si riprendono solo meccaniche e numeri osservabili; nel manifest scrivi "ispirata alle meccaniche classiche", senza nominarla.
- RTP sempre sotto il 100%, misurato e non stimato.
- Nessuna regola di gioco nel client (`app/`).

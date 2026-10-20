# Documentazione di Slot Simulator

Documentazione completa del motore, scritta per essere letta sia da persone sia da assistenti AI: ogni pagina dice cosa fare, con quali file e come verificarlo. Il punto d'ingresso per un assistente AI è [AGENTS.md](../AGENTS.md).

| Pagina | Contenuto |
| --- | --- |
| [ricette.md](ricette.md) | prompt pronti e procedure complete: slot nuova, slot ricostruita, volatilità, nuove funzioni, grafica, mod |
| [modulo.md](modulo.md) | riferimento del formato: ogni file del modulo e ogni campo, con regole e valori predefiniti |
| [matematica.md](matematica.md) | RTP, volatilità, leve di taratura e procedura per arrivare ai numeri voluti |
| [script-lua.md](script-lua.md) | hook, richieste di sequenze, moltiplicatori, sandbox, ricette di script |
| [asset.md](asset.md) | `art/art.json`, pixel art e vettoriale, animazioni, suoni, generatori di immagini esterni |
| [client-e-strumenti.md](client-e-strumenti.md) | il client nel browser, i comandi, i seed, i test nel browser, l'uso del motore da codice |
| [errori.md](errori.md) | ogni messaggio d'errore con causa e rimedio |

Punti di partenza nel repo:
- [templates/slot-base/](../templates/slot-base/): slot minima e valida da copiare (5x3, 10 linee, wild, scatter, free spin; RTP circa 94%).
- [slots/tempio-del-sole/](../slots/tempio-del-sole/): alta volatilità, moltiplicatore nei free spin, upgrade, Gold Spin in Lua, grafica vettoriale.
- [slots/pixel-quest/](../slots/pixel-quest/): 5x4 a 20 linee, Boss Spin in Lua, pixel art.

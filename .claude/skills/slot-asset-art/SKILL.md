---
name: slot-asset-art
description: Crea o rifà la grafica e i suoni di una slot del Slot Simulator (pixel art o vettoriale in SVG, animazioni di vincita, sfondo, suoni a 8 bit) tramite art/art.json e npm run assets.
---

# Asset di una slot disegnati da Claude

Usala quando una slot in `slots/<id>/` ha bisogno di grafica e suoni, o di una grafica nuova. Tutto nasce da `slots/<id>/art/art.json` e dai file in `art/`; `npm run assets -- build slots/<id>` produce `assets/` e aggiorna `scenes/main.json`. Non scrivere mai a mano in `assets/symbols/` o `assets/sounds/`: vengono rifatte a ogni build.

Leggi prima `docs/asset.md`: formato completo di `art.json`, linee guida di disegno e suoni. Se questa skill e il documento differiscono, vale il documento.

## Passi

1. **Capire la slot.** Da `math/paytable.json`: simboli, quali sono `wild` e `scatter`, ordine di valore (pagamenti a 5). `art.json` copre tutti i simboli e nessun altro. Leggi anche manifest, scena ed eventuale `art.json` esistente.
2. **Brief visivo.** Tema, `look` (`pixel` o `smooth`), 2-3 colori dominanti, una scala musicale e un timbro per i suoni.
3. **Gerarchia.** Wild e scatter riconoscibili subito (forma unica, colori saturi, scritta WILD/SCATTER); alti dettagliati, bassi semplici e coerenti; sagome diverse; tessere scure e diverse tra loro.
4. **Disegno.**
   - Pixel art: griglie 16x16 in `pixels`, contorno scuro di 1 pixel, 3-5 colori. Rileggi ogni griglia riga per riga.
   - Vettoriale: un SVG per simbolo in `art/symbols/<id>.svg`, `viewBox="0 0 100 100"`, id di gradienti unici per file (prefisso col nome del simbolo), font di sistema.
   - Sfondo in `art/background.svg` (900x520), calmo al centro.
   - Suoni in `sounds`: `spin`, `stop`, `win`, `bigWin`, `feature`.
   - Aggiungi un `prompt` (in inglese) globale e per simbolo: servono alla skill `slot-asset-ai-images`.
5. **Build e controlli.** `npm run assets -- build slots/<id>`, `npm run assets -- prompts slots/<id>`, `npm run mod -- check slots/<id>`, `npm test`.
6. **Controllo visivo obbligatorio.** Con Playwright e Chromium (nel cloud `executablePath: '/opt/pw-browsers/chromium'`, argomenti `--use-gl=swiftshader --enable-unsafe-swiftshader`): una pagina con tutti gli SVG di `assets/symbols/` in griglia, poi il client (`npm run build:app`, `npx vite preview --port 4173`, `?slot=<id>&seed=1`) fino a una vincita. Guarda gli screenshot, correggi quello che non si legge e ripeti. Ferma il server per PID, mai con `pkill -f`.
7. **Consegna.** Commit di `art/`, `assets/` e `scenes/main.json` insieme; alza la versione minor del manifest se la slot era già pubblicata; nella PR descrivi lo stile e cosa hai controllato.

## Regole

Solo asset originali: niente copie, ricalchi o imitazioni riconoscibili di giochi, marchi o personaggi esistenti, anche se la slot è ispirata a una reale.

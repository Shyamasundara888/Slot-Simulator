---
name: slot-asset-ai-images
description: Porta nel Slot Simulator immagini create con un generatore di immagini esterno (Stable Diffusion, ComfyUI, servizi con API): prompt coerenti, raccolta in art/raw, integrazione e controllo.
---

# Asset di una slot da un generatore di immagini esterno

Usala quando la persona vuole illustrazioni più ricche di quelle disegnate in SVG, prodotte da un generatore di immagini. Si appoggia alla pipeline di `slot-asset-art`: i disegni SVG o pixel restano come riserva e l'immagine esterna li sostituisce simbolo per simbolo (in `art/art.json` vince `image`, poi `svg`, poi `pixels`). Formato e procedura completi in `docs/asset.md`, sezione "Generatore di immagini esterno".

Claude non genera immagini raster da solo. Non inventare risultati: se il generatore non è raggiungibile da questo ambiente, prepara i prompt e chiedi alla persona di lanciare la generazione e caricare i file.

## Passi

1. **Prompt.** In `art/art.json`: `prompt` globale (tecnica, palette, luce, in inglese) e `prompt` per ogni simbolo e per `background`; wild e scatter detti esplicitamente. `npm run assets -- prompts slots/<id>` scrive `art/prompts.md` con prompt completi e nomi dei file (`art/raw/<id>.png`, `art/raw/background.png`).
2. **Consigli per la generazione.** Stesso modello, impostazioni e seed per tutta la serie; simboli 1:1 almeno 512x512, sfondo 16:9; sfondo trasparente o tinta unita; 2-4 varianti per simbolo.
3. **Generazione.** Con ComfyUI in locale c'è già il comando: `npm run assets -- generate slots/<id>` (opzioni `--only`, `--force`, `--variants`, `--seed`; vedi `docs/asset.md`, sezione "ComfyUI in locale"). Se ComfyUI non è raggiungibile da questo ambiente, chiedi alla persona di lanciare il comando sul suo PC e di fare commit di `art/raw/`. Per altri generatori: se la persona ha un endpoint raggiungibile (per esempio l'API di ComfyUI o di un servizio) e la chiave è un segreto dell'ambiente, scrivi uno script in `art/` che legge i prompt e salva in `art/raw/`. Non salvare mai chiavi nel repo o nella memoria del progetto. Altrimenti la persona genera e carica i file, che rinomini come in `art/prompts.md`.
4. **Selezione.** Ogni immagine: quadrata, soggetto centrato e intero, niente testo, firme o watermark, stile coerente con le altre, sotto i 300 KB (ridimensiona con uno script se serve). Scarta o fai rigenerare spiegando perché.
5. **Integrazione.** Aggiungi `"image": "art/raw/<id>.png"` ai simboli (lascia `svg`/`pixels` come riserva) e `"background": { "image": "art/raw/background.png" }`; `look: smooth` per le illustrazioni; scegli `tile` simile al fondo dell'immagine se non è trasparente.
6. **Animazioni (facoltative, solo simboli alti).** Fotogrammi scontornati da qualsiasi fonte. La prova con Wan 2.2 5B in ComfyUI (`tools/comfyui/workflows/animazione.json`) è stata bocciata, quindi serve un modello o una pipeline specializzati, da concordare con la persona. Poi `npm run assets -- frames slots/<id> --symbol <ID> --from <cartella>` e il campo `animation` stampato dal comando nel simbolo (vedi `docs/asset.md`, sezione "Animazioni generate"). Controlla che il soggetto resti quello del simbolo fermo per tutta la clip.
7. **Build e controlli.** `npm run assets -- build slots/<id>`, `npm run mod -- check slots/<id>`, `npm test`, controllo visivo come in `slot-asset-art`, con attenzione alla leggibilità a dimensione di gioco.
8. **Consegna.** Commit di `art/raw/`, `art/art.json`, `art/prompts.md`, `assets/` e `scenes/main.json`; versione minor del manifest; nella PR generatore e modello usati, quali simboli vengono da immagini esterne e il peso totale degli asset.

## Regole

- Solo immagini originali: nei prompt niente nomi di giochi, marchi, studi, artisti viventi o personaggi protetti.
- Prima di usare un servizio esterno verifica con la persona che le sue condizioni permettano l'uso previsto delle immagini.

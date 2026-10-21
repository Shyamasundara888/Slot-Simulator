# Workflow ComfyUI per gli asset delle slot

Due workflow in formato API (quello che accetta `POST /prompt`) per generare in locale gli asset di una slot con SDXL. Le immagini generate sono materiale di partenza: per entrare in un modulo passano da `art/` e da `npm run assets -- build`, mai copiate a mano in `assets/` (vedi [docs/asset.md](../../docs/asset.md)).

| File | Cosa fa | Uscita |
| --- | --- | --- |
| `workflows/simbolo.json` | SDXL txt2img 1024x1024, poi scontorno con BiRefNet | PNG RGBA con sfondo trasparente |
| `workflows/simbolo-stile.json` | come `simbolo.json`, con IP-Adapter che copia lo stile di un'immagine di riferimento | PNG RGBA con sfondo trasparente |
| `workflows/sfondo.json` | SDXL txt2img 1344x768, senza scontorno | PNG RGB |

## Requisiti

- **ComfyUI** 0.42.2 (ComfyUI Desktop), API su `http://127.0.0.1:8188`.
- **Checkpoint:** `sd_xl_base_1.0.safetensors` in `models/checkpoints/`.
- **Scontorno:** `birefnet.safetensors` (423,9 MB, licenza MIT) in `models/background_removal/`, da [Comfy-Org/BiRefNet](https://huggingface.co/Comfy-Org/BiRefNet/resolve/main/background_removal/birefnet.safetensors). Non serve alcun nodo personalizzato.
- **Nodi usati**, tutti nativi di ComfyUI: `CheckpointLoaderSimple`, `CLIPTextEncode`, `EmptyLatentImage`, `KSampler`, `VAEDecode`, `SaveImage`; per il simbolo anche `LoadBackgroundRemovalModel`, `RemoveBackground`, `InvertMask`, `JoinImageWithAlpha`.

Solo per `simbolo-stile.json`:

- **Nodo personalizzato** [ComfyUI_IPAdapter_plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus) (GPL-3), clonato in `custom_nodes/`. Non ha dipendenze da installare. Dopo l'installazione va riavviato ComfyUI.
- **Modelli** da [h94/IP-Adapter](https://huggingface.co/h94/IP-Adapter) (Apache-2.0):
  - `ip-adapter-plus_sdxl_vit-h.safetensors` (848 MB) in `models/ipadapter/`. In ComfyUI Desktop è la cartella condivisa `ComfyUI-Shared\models\ipadapter`, non quella dentro l'installazione: lì il nodo non lo vede.
  - `CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors` (2,5 GB, `models/image_encoder/model.safetensors` rinominato) in `models/clip_vision/`.
- **Nodi aggiuntivi:** `LoadImage`, `IPAdapterModelLoader`, `CLIPVisionLoader`, `IPAdapterAdvanced`.

`RemoveBackground` restituisce una maschera con il soggetto a 1, mentre `JoinImageWithAlpha` usa la maschera invertita: per questo `InvertMask` sta in mezzo. Senza, si salverebbe trasparente il soggetto invece dello sfondo.

## Uso

1. Cambia il prompt nel nodo `2` (positivo) ed eventualmente il `seed` nel nodo `5`.
2. Invia il workflow: `POST /prompt` con corpo `{"prompt": <contenuto del file>}`. La risposta contiene `prompt_id`.
3. Attendi che `GET /history/<prompt_id>` riporti `status.completed: true`.
4. Scarica ogni immagine elencata in `outputs` con `GET /view?filename=...&subfolder=...&type=output`.

I file finiscono anche nella cartella di output di ComfyUI, sotto `slot/`.

## Simboli nello stesso stile

`simbolo-stile.json` carica con `LoadImage` (nodo `12`) un simbolo già riuscito, messo nella cartella `input` di ComfyUI, e lo passa a `IPAdapterAdvanced` (nodo `15`) con `weight_type` `style transfer`. Il riferimento non trasmette la forma, solo lo stile: materiali, colori, intarsi e luce. Il soggetto lo decide il prompt del nodo `2`.

- Usa un riferimento su fondo uniforme e chiaro, non il PNG trasparente: i pixel trasparenti hanno colori casuali e l'encoder li vede.
- Tieni lo stesso riferimento, lo stesso `seed` e la stessa coda di prompt (materiali, luce, sfondo) per tutti i simboli della serie, cambiando solo il soggetto.
- `weight` 0,8 è un buon punto di partenza: alzalo se lo stile si perde, abbassalo se il soggetto prende la forma del riferimento.

Provato con lo scarabeo di `simbolo.json` come riferimento e tre soggetti, seed 777. Lo stile resta coerente in tutti e tre: oro lucido, intarsi turchesi e blu, stesse luci.

- **Occhio di Horus:** riuscito.
- **Ankh:** è venuto come una croce, perché SDXL base conosce male l'ankh. Va descritto nel prompt, per esempio "loop on top".
- **Lettera "A":** la forma è sbagliata. SDXL base disegna male le lettere, quindi per le carte conviene disegnare la lettera a parte (SVG di `art/`) o partire da una sagoma con img2img/ControlNet.

## Tempi misurati

RTX 3080 10 GB, 30 passi `dpmpp_2m` `karras`, cfg 7, checkpoint già caricato:

| Workflow | Tempo |
| --- | --- |
| `sfondo.json` (1344x768) | 18,4 s |
| `simbolo.json` (1024x1024 + BiRefNet) | 18,1 s |
| `simbolo-stile.json` (+ IP-Adapter) | 26,1 s al primo lancio, poi 16,1 s |

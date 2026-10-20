# Workflow ComfyUI per gli asset delle slot

Due workflow in formato API (quello che accetta `POST /prompt`) per generare in locale gli asset di una slot con SDXL. Le immagini generate sono materiale di partenza: per entrare in un modulo passano da `art/` e da `npm run assets -- build`, mai copiate a mano in `assets/` (vedi [docs/asset.md](../../docs/asset.md)).

| File | Cosa fa | Uscita |
| --- | --- | --- |
| `workflows/simbolo.json` | SDXL txt2img 1024x1024, poi scontorno con BiRefNet | PNG RGBA con sfondo trasparente |
| `workflows/sfondo.json` | SDXL txt2img 1344x768, senza scontorno | PNG RGB |

## Requisiti

- **ComfyUI** 0.42.2 (ComfyUI Desktop), API su `http://127.0.0.1:8188`.
- **Checkpoint:** `sd_xl_base_1.0.safetensors` in `models/checkpoints/`.
- **Scontorno:** `birefnet.safetensors` (423,9 MB, licenza MIT) in `models/background_removal/`, da [Comfy-Org/BiRefNet](https://huggingface.co/Comfy-Org/BiRefNet/resolve/main/background_removal/birefnet.safetensors). Non serve alcun nodo personalizzato.
- **Nodi usati**, tutti nativi di ComfyUI: `CheckpointLoaderSimple`, `CLIPTextEncode`, `EmptyLatentImage`, `KSampler`, `VAEDecode`, `SaveImage`; per il simbolo anche `LoadBackgroundRemovalModel`, `RemoveBackground`, `InvertMask`, `JoinImageWithAlpha`.

`RemoveBackground` restituisce una maschera con il soggetto a 1, mentre `JoinImageWithAlpha` usa la maschera invertita: per questo `InvertMask` sta in mezzo. Senza, si salverebbe trasparente il soggetto invece dello sfondo.

## Uso

1. Cambia il prompt nel nodo `2` (positivo) ed eventualmente il `seed` nel nodo `5`.
2. Invia il workflow: `POST /prompt` con corpo `{"prompt": <contenuto del file>}`. La risposta contiene `prompt_id`.
3. Attendi che `GET /history/<prompt_id>` riporti `status.completed: true`.
4. Scarica ogni immagine elencata in `outputs` con `GET /view?filename=...&subfolder=...&type=output`.

I file finiscono anche nella cartella di output di ComfyUI, sotto `slot/`.

## Tempi misurati

RTX 3080 10 GB, 30 passi `dpmpp_2m` `karras`, cfg 7, checkpoint già caricato:

| Workflow | Tempo |
| --- | --- |
| `sfondo.json` (1344x768) | 18,4 s |
| `simbolo.json` (1024x1024 + BiRefNet) | 18,1 s |

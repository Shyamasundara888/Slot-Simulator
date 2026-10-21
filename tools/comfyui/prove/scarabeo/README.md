# Prova di animazione: scarabeo del Tempio del Sole (bocciata)

Per la prova sono stati scelti 24 fotogrammi WebP 512x512 con alfa, da riprodurre a 12 fps per un loop di 2 s: un fotogramma su due dei 49 generati con [`workflows/animazione.json`](../../workflows/animazione.json) partendo da `slots/tempio-del-sole/art/raw/scarabeo.webp`. Il simbolo è stato messo su fondo scuro uniforme (`#16121c`) in un quadrato 704x704 e poi scontornato fotogramma per fotogramma con BiRefNet.

Shyam ha giudicato il risultato non adatto al gioco (2026-10-21). I fotogrammi sono stati tolti dal repo e restano solo le misure qui sotto. Il workflow serve come base per altre prove.

## Requisiti

- **ComfyUI Desktop** 0.42.2, solo nodi nativi: `UNETLoader`, `CLIPLoader` (tipo `wan`), `VAELoader`, `ModelSamplingSD3` (shift 8), `Wan22ImageToVideoLatent`, `KSampler`, `VAEDecode`, `CreateVideo`, `SaveVideo`, più i nodi dello scontorno di `simbolo.json`.
- **Modelli** di Comfy-Org (licenza Apache 2.0), nella cartella condivisa dei modelli:
  - `diffusion_models/wan2.2_ti2v_5B_fp16.safetensors` (10,0 GB)
  - `text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors` (6,7 GB)
  - `vae/wan2.2_vae.safetensors` (1,4 GB)
- **Immagine iniziale:** da caricare in `input/` con il nome `scarabeo-anim-start.png`.

## Misure

RTX 3080 10 GB, 16 GB di RAM, `uni_pc` `simple`, cfg 5, 704x704, 49 fotogrammi. Il tempo include lo scontorno dei 49 fotogrammi.

| Seed | Passi | Tempo | Picco VRAM | Picco RAM (sistema) | Movimento medio | Chiusura del loop | IoU minima del bordo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 20 | 99 s | 9,1 GB | 14,0 GB | 2,36/255 | 11,39/255 | 0,902 |
| 2 | 20 | 94 s | 9,6 GB | 14,2 GB | 0,36/255 | 3,02/255 | 0,992 |
| 3 | 20 | 93 s | 9,2 GB | 14,0 GB | 3,00/255 | 24,07/255 | 0,623 |
| **1** | **30** | **122 s** | **9,7 GB** | **15,0 GB** | **2,68/255** | **4,44/255** | **0,925** |

Come leggere le colonne:

- **Movimento medio:** differenza di colore tra fotogrammi consecutivi.
- **Chiusura del loop:** differenza tra l'ultimo e il primo fotogramma; più è bassa, meno si vede il salto quando il loop ricomincia.
- **IoU minima del bordo:** sovrapposizione della maschera di ogni fotogramma con quella del primo; 1 vuol dire bordo identico.

Esito per seed:

- **Seed 1, 20 passi:** dal fotogramma 12 perde i dettagli del simbolo. Le venature d'oro e le ali incise diventano uno scarabeo realistico e sfocato.
- **Seed 2:** resta fedele al simbolo, ma è quasi fermo.
- **Seed 3:** a fine clip ingrandisce lo scarabeo (l'area del soggetto passa da 114 a 142 mila pixel), quindi il loop salta.
- **Seed 1, 30 passi:** il migliore, e i fotogrammi qui sono suoi. Resta coerente col simbolo statico, le ali e i riflessi si muovono appena e il bordo resta stabile (area del soggetto 113,9-114,9 mila pixel). Il loop chiude con un piccolo salto.

La RAM è quasi piena durante la generazione: ComfyUI scarica parte del modello in RAM. Conviene non avere altri programmi pesanti aperti, e il PC resta lento per i circa 2 minuti di ogni clip.

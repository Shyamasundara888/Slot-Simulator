# Prompt per gli asset di Pixel Quest

Genera ogni immagine con lo stesso modello e le stesse impostazioni, così lo stile resta coerente.
Salva i file con il nome indicato, poi in `art/art.json` aggiungi `"image": "art/raw/<nome>"` al simbolo e lancia `npm run assets -- build <cartella>`.

## Simboli

### Spada → `art/raw/spada.png`

```
16-bit fantasy RPG pixel art, bold black outlines, limited palette, crisp pixels. A glowing steel sword with a golden hilt, the wild symbol. Single game icon, centered, fills most of a square 1:1 frame, transparent or plain flat background, no text, no border, no frame.
```

### Forziere → `art/raw/forziere.png`

```
16-bit fantasy RPG pixel art, bold black outlines, limited palette, crisp pixels. A wooden treasure chest with gold trim, the scatter symbol. Single game icon, centered, fills most of a square 1:1 frame, transparent or plain flat background, no text, no border, no frame.
```

### Drago → `art/raw/drago.png`

```
16-bit fantasy RPG pixel art, bold black outlines, limited palette, crisp pixels. A green dragon head with golden horns. Single game icon, centered, fills most of a square 1:1 frame, transparent or plain flat background, no text, no border, no frame.
```

### Cavaliere → `art/raw/cavaliere.png`

```
16-bit fantasy RPG pixel art, bold black outlines, limited palette, crisp pixels. A knight's helmet with a red plume. Single game icon, centered, fills most of a square 1:1 frame, transparent or plain flat background, no text, no border, no frame.
```

### Mago → `art/raw/mago.png`

```
16-bit fantasy RPG pixel art, bold black outlines, limited palette, crisp pixels. A purple wizard hat with a golden star. Single game icon, centered, fills most of a square 1:1 frame, transparent or plain flat background, no text, no border, no frame.
```

### Arciere → `art/raw/arciere.png`

```
16-bit fantasy RPG pixel art, bold black outlines, limited palette, crisp pixels. A wooden bow with an arrow. Single game icon, centered, fills most of a square 1:1 frame, transparent or plain flat background, no text, no border, no frame.
```

### Pozione → `art/raw/pozione.png`

```
16-bit fantasy RPG pixel art, bold black outlines, limited palette, crisp pixels. A round pink potion flask. Single game icon, centered, fills most of a square 1:1 frame, transparent or plain flat background, no text, no border, no frame.
```

### Scudo → `art/raw/scudo.png`

```
16-bit fantasy RPG pixel art, bold black outlines, limited palette, crisp pixels. A blue shield with a white cross. Single game icon, centered, fills most of a square 1:1 frame, transparent or plain flat background, no text, no border, no frame.
```

### Moneta → `art/raw/moneta.png`

```
16-bit fantasy RPG pixel art, bold black outlines, limited palette, crisp pixels. A shiny gold coin. Single game icon, centered, fills most of a square 1:1 frame, transparent or plain flat background, no text, no border, no frame.
```

### Chiave → `art/raw/chiave.png`

```
16-bit fantasy RPG pixel art, bold black outlines, limited palette, crisp pixels. A golden key. Single game icon, centered, fills most of a square 1:1 frame, transparent or plain flat background, no text, no border, no frame.
```

## Sfondo → `art/raw/background.png`

```
16-bit fantasy RPG pixel art, bold black outlines, limited palette, crisp pixels. night sky with stars and a full moon over purple mountains and a grassy field. Wide 16:9 landscape, calm and slightly dark so symbols stay readable, no text, no characters in the center.
```

Poi in `art/art.json` usa `"background": { "image": "art/raw/background.png" }`.

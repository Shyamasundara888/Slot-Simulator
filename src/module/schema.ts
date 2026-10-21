import { z } from "zod";

const symbolId = z.string().regex(/^[A-Z0-9_]+$/, "usa solo lettere maiuscole, cifre e _");
const strips = z.array(z.array(symbolId).min(1)).min(1);
const modeId = z.string().regex(/^[a-z][a-z0-9_]*$/, "usa lettere minuscole, cifre e _, iniziando con una lettera");
const payTable = z.record(z.string().regex(/^\d+$/, "la chiave deve essere un numero di simboli"), z.number().nonnegative());

export const manifestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, "usa solo lettere minuscole, cifre e -"),
    name: z.string().min(1),
    version: z.string().min(1),
    author: z.string().optional(),
    description: z.string().optional(),
    /** Versione dell'API del motore usata dal modulo. */
    engineApi: z.literal(1),
  })
  .strict();

export const reelsSchema = z
  .object({
    rows: z.number().int().min(1).max(10),
    modes: z
      .object({
        base: strips,
        /** Strisce dei free spin; se manca si usano quelle base. */
        free: strips.optional(),
      })
      /** Altre modalità, giocate solo su richiesta di uno script. */
      .catchall(strips)
      .superRefine((modes, ctx) => {
        for (const mode of Object.keys(modes)) {
          const parsed = modeId.safeParse(mode);
          if (!parsed.success) ctx.addIssue({ code: "custom", path: [mode], message: parsed.error.issues[0]!.message });
        }
      }),
  })
  .strict();

export const linesSchema = z.object({ lines: z.array(z.array(z.number().int().min(0))).min(1) }).strict();

export const paytableSchema = z
  .object({
    symbols: z.array(z.object({ id: symbolId, kind: z.enum(["normal", "wild", "scatter"]) }).strict()).min(1),
    /** Pagamenti su linea, in multipli della puntata per linea. */
    linePays: z.record(symbolId, payTable),
    /** Pagamenti scatter, in multipli della puntata totale. */
    scatterPays: payTable.optional(),
  })
  .strict();

export const featuresSchema = z
  .object({
    /** Rulli (da 1) su cui un wild si espande a coprire tutta la colonna. */
    expandingWild: z.object({ reels: z.array(z.number().int().min(1)).min(1) }).strict().optional(),
    freeSpins: z
      .object({
        trigger: z.object({ minScatters: z.number().int().min(1), spins: payTable }).strict(),
        retrigger: z.boolean().default(false),
        perExpandedWild: z
          .object({
            extraSpins: z.number().int().min(0).default(0),
            upgrade: z.boolean().default(false),
            /** Quanto sale il moltiplicatore dei free spin per ogni wild espanso. */
            multiplier: z.number().int().min(0).default(0),
          })
          .strict()
          .optional(),
        /** Dal simbolo meno pagante al più pagante. */
        upgradeLadder: z.array(symbolId).min(2).optional(),
        /** Moltiplicatore massimo dei free spin. */
        maxMultiplier: z.number().int().min(1).max(1_000).default(10),
        maxSpins: z.number().int().min(1).max(10_000).default(1_000),
      })
      .strict()
      .optional(),
    /** Vincita massima di un round, in multipli della puntata totale. */
    maxWin: z.number().positive().optional(),
  })
  .strict();

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "usa un colore esadecimale come #ffcc00");

/** Presentazione provvisoria: colori ed etichette dei simboli, finché non ci sono asset grafici. */
/** Percorso di un file dentro la cartella assets/ del modulo. */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "svg"] as const;
export const SOUND_EXTENSIONS = ["mp3", "ogg", "wav"] as const;
const assetPath = (extensions: readonly string[], what: string) =>
  z
    .string()
    .regex(
      new RegExp(`^assets/([A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\\.(${extensions.join("|")})$`, "i"),
      `serve un ${what} dentro assets/ (${extensions.join(", ")})`,
    );
const image = assetPath(IMAGE_EXTENSIONS, "immagine");
const sound = assetPath(SOUND_EXTENSIONS, "suono");

/** Eventi del client che possono avere un suono: partenza dei rulli, arresto di un rullo, vincita, vincita grande, bonus. */
export const SOUND_EVENTS = ["spin", "stop", "win", "bigWin", "feature"] as const;

export const sceneSchema = z
  .object({
    background: color.optional(),
    /** Immagine di sfondo, adattata a tutta l'area di gioco. */
    backgroundImage: image.optional(),
    symbols: z
      .record(
        symbolId,
        z
          .object({
            label: z.string().min(1).optional(),
            color,
            /** Immagine del simbolo; senza, il simbolo è una tessera colorata con l'etichetta. */
            image: image.optional(),
            /** Fotogrammi dell'animazione mostrata quando il simbolo è in una vincita. */
            winFrames: z.array(image).min(1).optional(),
            /** Fotogrammi al secondo dell'animazione. */
            fps: z.number().positive().max(60).default(8),
          })
          .strict(),
      )
      .default({}),
    /** Suoni facoltativi per gli eventi del client. */
    sounds: z
      .object({
        spin: sound.optional(),
        stop: sound.optional(),
        win: sound.optional(),
        bigWin: sound.optional(),
        feature: sound.optional(),
      })
      .strict()
      .default({}),
    /** Nome mostrato per le modalità aggiunte dal modulo e, facoltativa, la regola per la paytable. */
    modes: z
      .record(modeId, z.object({ label: z.string().min(1), description: z.string().min(1).optional() }).strict())
      .default({}),
  })
  .strict();

/** Valori del round che gli elementi di interfaccia possono mostrare (vedi src/ui/values.ts). */
export const UI_VALUES = [
  "free.remaining",
  "free.played",
  "free.total",
  "sequence.remaining",
  "sequence.played",
  "sequence.total",
  "multiplier",
  "level",
  "win.spin",
  "win.feature",
  "win.round",
  "bet",
  "maxWin",
] as const;
/** Animazioni di un elemento quando il suo valore cambia. */
export const UI_ANIMATIONS = ["none", "pop", "pulse", "shake", "count"] as const;

const uiValue = z.enum(UI_VALUES, { message: `valore sconosciuto: usa uno tra ${UI_VALUES.join(", ")}` });
const uiId = z.string().regex(/^[a-z][a-z0-9_-]*$/, "usa lettere minuscole, cifre, - e _, iniziando con una lettera");
const box = { x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() };
/** Aspetto del riquadro di un elemento: un'immagine adattata alla misura oppure un rettangolo colorato. */
const panelLook = {
  /** Immagine stirata sul riquadro, per esempio una cornice. */
  frame: image.optional(),
  /** Colore del riquadro quando non c'è `frame`. */
  background: color.optional(),
  /** Trasparenza del riquadro, da 0 a 1. */
  opacity: z.number().min(0).max(1).default(0.55),
  border: color.optional(),
};
const textLook = {
  color: color.default("#ffffff"),
  /** Misura del testo in unità dello stage; senza, si adatta all'altezza dell'elemento. */
  fontSize: z.number().positive().max(200).optional(),
};
const common = {
  id: uiId,
  ...box,
  /** "above" sopra i rulli, "below" sotto (fra lo sfondo e i rulli). */
  layer: z.enum(["above", "below"]).default("above"),
  /** Modalità in cui l'elemento si vede; senza, si vede sempre. */
  visibleIn: z.array(modeId).min(1).optional(),
  onChange: z.enum(UI_ANIMATIONS).default("pop"),
  /** Suono quando il valore cambia. */
  sound: sound.optional(),
};

const counterSchema = z
  .object({
    ...common,
    type: z.literal("counter"),
    label: z.string().optional(),
    value: uiValue,
    /** Testo del numero: {value} è il valore dell'elemento, {free.total} e simili gli altri valori. */
    format: z.string().min(1).default("{value}"),
    labelColor: color.optional(),
    ...panelLook,
    ...textLook,
  })
  .strict();

const meterSchema = z
  .object({
    ...common,
    type: z.literal("meter"),
    label: z.string().optional(),
    value: uiValue,
    /** Valore a cui la barra è piena. */
    max: z.number().positive(),
    /** "bar" continua, "segments" un segmento per unità (al massimo 50). */
    style: z.enum(["bar", "segments"]).default("bar"),
    /** Verso in cui si riempie. */
    direction: z.enum(["right", "up"]).default("right"),
    fillColor: color.default("#ffd43b"),
    /** Immagine di un'unità piena (con "segments") o della parte piena (con "bar"). */
    fill: image.optional(),
    ...panelLook,
    ...textLook,
  })
  .strict();

const ladderSchema = z
  .object({
    ...common,
    type: z.literal("ladder"),
    label: z.string().optional(),
    value: uiValue,
    /**
     * Gradini dal primo all'ultimo: testi, numeri o id di simboli (allora si
     * vede l'immagine del simbolo). Con soli numeri si accende l'ultimo gradino
     * non oltre il valore, altrimenti il gradino in posizione `value` (da 0).
     */
    steps: z.array(z.string().min(1)).min(2).max(20),
    direction: z.enum(["row", "column"]).default("row"),
    highlight: color.default("#ffd43b"),
    ...panelLook,
    ...textLook,
  })
  .strict();

const imageSchema = z
  .object({
    ...common,
    type: z.literal("image"),
    image: image.optional(),
    /** Fotogrammi mostrati in ciclo, al posto di `image`. */
    frames: z.array(image).min(1).optional(),
    fps: z.number().positive().max(60).default(8),
  })
  .strict();

const textSchema = z
  .object({
    ...common,
    type: z.literal("text"),
    /** Testo con segnaposto come {maxWin} o {free.remaining}. */
    text: z.string().min(1),
    align: z.enum(["left", "center", "right"]).default("center"),
    ...panelLook,
    opacity: z.number().min(0).max(1).default(0),
    ...textLook,
  })
  .strict();

export const uiElementSchema = z.discriminatedUnion("type", [counterSchema, meterSchema, ladderSchema, imageSchema, textSchema]);

/** Layout dello stage ed elementi di interfaccia di un modulo (scenes/ui.json). */
export const uiSchema = z
  .object({
    /** Misura logica dello stage; il canvas viene scalato per riempire la pagina. */
    stage: z.object({ width: z.number().int().min(300).max(4000), height: z.number().int().min(200).max(4000) }).strict().optional(),
    /** Riquadro dei rulli nello stage; senza, i rulli stanno al centro. */
    reels: z.object(box).strict().optional(),
    elements: z.array(uiElementSchema).default([]),
  })
  .strict();

export type Manifest = z.infer<typeof manifestSchema>;
export type ReelsFile = z.infer<typeof reelsSchema>;
export type LinesFile = z.infer<typeof linesSchema>;
export type PaytableFile = z.infer<typeof paytableSchema>;
export type FeaturesFile = z.input<typeof featuresSchema>;
export type SceneFile = z.infer<typeof sceneSchema>;
export type UiFile = z.input<typeof uiSchema>;
export type UiElement = z.infer<typeof uiElementSchema>;
export type UiValue = (typeof UI_VALUES)[number];

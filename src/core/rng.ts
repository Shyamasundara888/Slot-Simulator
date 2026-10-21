/**
 * Generatore pseudo-casuale deterministico (sfc32, inizializzato con splitmix32).
 * Lo stesso seed produce sempre la stessa sequenza: ogni spin è riproducibile.
 */
export interface Rng {
  /** Intero senza segno a 32 bit. */
  nextUint32(): number;
  /** Intero uniforme in [0, maxExclusive), senza bias da modulo. */
  int(maxExclusive: number): number;
  /** Numero in [0, 1). */
  float(): number;
}

const UINT32 = 0x1_0000_0000;

function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/** Converte un seed testuale in un intero a 32 bit (FNV-1a). */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

export function createRng(seed: number | string): Rng {
  const init = splitmix32(typeof seed === "string" ? hashSeed(seed) : seed);
  let a = init();
  let b = init();
  let c = init();
  let d = init();

  const nextUint32 = (): number => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t;
  };

  // Scarta i primi valori, come raccomandato per sfc32.
  for (let i = 0; i < 12; i++) nextUint32();
  return fromUint32(nextUint32);
}

/** Costruisce int e float a partire da una sorgente di interi a 32 bit. */
function fromUint32(nextUint32: () => number): Rng {
  return {
    nextUint32,
    int(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > UINT32) {
        throw new RangeError(`int(): limite non valido ${maxExclusive}`);
      }
      // Rejection sampling: scarta la coda che introdurrebbe bias.
      const limit = UINT32 - (UINT32 % maxExclusive);
      let x = nextUint32();
      while (x >= limit) x = nextUint32();
      return x % maxExclusive;
    },
    float(): number {
      return nextUint32() / UINT32;
    },
  };
}

/** RNG che può ripetere da capo i valori già estratti (vedi createReplayableRng). */
export interface ReplayableRng extends Rng {
  /** Riparte dal primo valore estratto: le estrazioni successive ripetono quelle già fatte, poi proseguono. */
  rewind(): void;
}

/**
 * Avvolge un RNG in modo da poter rigiocare un round dallo stesso punto: i
 * valori estratti restano in memoria e dopo rewind() si rileggono uguali.
 * Serve alle scelte del giocatore: il round si rigioca con la risposta e
 * tutto ciò che viene prima della scelta esce identico. Il RNG avvolto avanza
 * solo per i valori nuovi.
 */
export function createReplayableRng(base: Rng): ReplayableRng {
  const drawn: number[] = [];
  let next = 0;
  const rng = fromUint32(() => {
    if (next === drawn.length) drawn.push(base.nextUint32());
    return drawn[next++]!;
  });
  return {
    ...rng,
    rewind() {
      next = 0;
    },
  };
}

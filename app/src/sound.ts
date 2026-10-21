import type { Scene, SoundEvent } from "../../src/module/parse.js";

const MUTE_KEY = "slot-simulator:muted";

/** Preferenza "muto", condivisa tra le slot e salvata nel browser. */
export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Senza storage la preferenza vale finché la pagina resta aperta.
  }
}

/** Suoni di una slot. Gli eventi senza suono nella scena non fanno nulla. */
export class Sounds {
  private readonly audio = new Map<SoundEvent, HTMLAudioElement>();
  /** Suoni degli elementi di interfaccia, per percorso dell'asset. */
  private readonly extra = new Map<string, HTMLAudioElement>();
  muted = isMuted();

  /** `extra` sono altri suoni del modulo, suonati per percorso con playAsset. */
  constructor(scene: Scene, assets: ReadonlyMap<string, string>, extra: Iterable<string> = []) {
    const load = (path: string) => {
      const url = assets.get(path);
      if (!url) return null;
      const audio = new Audio(url);
      audio.preload = "auto";
      return audio;
    };
    for (const [event, path] of Object.entries(scene.sounds) as [SoundEvent, string][]) {
      const audio = load(path);
      if (audio) this.audio.set(event, audio);
    }
    for (const path of extra) {
      const audio = load(path);
      if (audio) this.extra.set(path, audio);
    }
  }

  get available(): boolean {
    return this.audio.size > 0 || this.extra.size > 0;
  }

  play(event: SoundEvent): void {
    this.playAudio(this.audio.get(event));
  }

  playAsset(path: string): void {
    this.playAudio(this.extra.get(path));
  }

  private playAudio(audio: HTMLAudioElement | undefined): void {
    if (!audio || this.muted) return;
    // Una copia per ogni riproduzione, così i suoni ravvicinati (gli arresti dei rulli) si sovrappongono.
    const copy = audio.cloneNode() as HTMLAudioElement;
    copy.volume = 0.6;
    // Il browser può rifiutare l'audio prima di un gesto dell'utente: non è un errore del gioco.
    copy.play().catch(() => {});
  }
}

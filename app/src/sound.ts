import type { Scene, SoundEvent } from "../../src/module/parse.js";
import { MUSIC_EVENTS } from "../../src/module/schema.js";

type MusicEvent = (typeof MUSIC_EVENTS)[number];
const isMusic = (event: SoundEvent): event is MusicEvent => (MUSIC_EVENTS as readonly string[]).includes(event);
/** Volume delle musiche rispetto agli effetti, e durata delle dissolvenze in secondi. */
const MUSIC_VOLUME = 0.45;
const FADE = 0.8;

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

/**
 * Musiche in loop con la Web Audio API: un AudioBufferSourceNode in loop riparte
 * senza il piccolo stacco che lascia un elemento <audio>. Il contesto audio nasce
 * al primo play(), che il gioco chiama dopo un clic, come chiedono i browser.
 */
class Music {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<MusicEvent, Promise<AudioBuffer | null>>();
  private current: { event: MusicEvent; source: AudioBufferSourceNode; gain: GainNode } | null = null;
  /** Ultima musica chiesta, anche se non è ancora caricata. */
  private wanted: MusicEvent | null = null;

  constructor(private readonly urls: ReadonlyMap<MusicEvent, string>) {}

  get available(): boolean {
    return this.urls.size > 0;
  }

  private setup(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof AudioContext === "undefined") return null;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.connect(this.context.destination);
    return this.context;
  }

  private buffer(event: MusicEvent, context: AudioContext): Promise<AudioBuffer | null> {
    let buffer = this.buffers.get(event);
    if (!buffer) {
      const url = this.urls.get(event)!;
      // Una musica che non si carica o non si decodifica lascia il gioco in silenzio, senza errori.
      buffer = fetch(url)
        .then((r) => r.arrayBuffer())
        .then((bytes) => context.decodeAudioData(bytes))
        .catch(() => null);
      this.buffers.set(event, buffer);
    }
    return buffer;
  }

  /** Passa alla musica `event` con una dissolvenza; null la ferma. Senza quella musica resta l'altra. */
  async play(event: MusicEvent | null, muted: boolean): Promise<void> {
    if (event !== null && !this.urls.has(event)) event = event === "bonusMusic" && this.urls.has("music") ? "music" : null;
    this.wanted = event;
    const context = this.setup();
    if (!context || !this.master) return;
    if (context.state === "suspended") void context.resume().catch(() => {});
    this.master.gain.value = muted ? 0 : 1;
    if (this.current?.event === event) return;
    const buffer = event ? await this.buffer(event, context) : null;
    // Nel frattempo può essere stata chiesta un'altra musica.
    if (this.wanted !== event || this.current?.event === event) return;
    const now = context.currentTime;
    if (this.current) {
      const { source, gain } = this.current;
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + FADE);
      source.stop(now + FADE);
      this.current = null;
    }
    if (!event || !buffer) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(MUSIC_VOLUME, now + FADE);
    source.connect(gain).connect(this.master);
    source.start(now);
    this.current = { event, source, gain };
  }

  setMuted(muted: boolean): void {
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.05);
  }

  stop(): void {
    this.wanted = null;
    this.current?.source.stop();
    this.current = null;
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}

/** Suoni di una slot. Gli eventi senza suono nella scena non fanno nulla. */
export class Sounds {
  private readonly audio = new Map<SoundEvent, HTMLAudioElement>();
  /** Suoni degli elementi di interfaccia, per percorso dell'asset. */
  private readonly extra = new Map<string, HTMLAudioElement>();
  private readonly music: Music;
  private mutedValue = isMuted();

  get muted(): boolean {
    return this.mutedValue;
  }

  set muted(muted: boolean) {
    this.mutedValue = muted;
    this.music.setMuted(muted);
  }

  /** `extra` sono altri suoni del modulo, suonati per percorso con playAsset. */
  constructor(scene: Scene, assets: ReadonlyMap<string, string>, extra: Iterable<string> = []) {
    const load = (path: string) => {
      const url = assets.get(path);
      if (!url) return null;
      const audio = new Audio(url);
      audio.preload = "auto";
      return audio;
    };
    const music = new Map<MusicEvent, string>();
    for (const [event, path] of Object.entries(scene.sounds) as [SoundEvent, string][]) {
      if (isMusic(event)) {
        const url = assets.get(path);
        if (url) music.set(event, url);
        continue;
      }
      const audio = load(path);
      if (audio) this.audio.set(event, audio);
    }
    this.music = new Music(music);
    for (const path of extra) {
      const audio = load(path);
      if (audio) this.extra.set(path, audio);
    }
  }

  get available(): boolean {
    return this.audio.size > 0 || this.extra.size > 0 || this.music.available;
  }

  play(event: Exclude<SoundEvent, MusicEvent>): void {
    this.playAudio(this.audio.get(event));
  }

  /** Musica di sottofondo: quella del gioco base, quella dei bonus o nessuna. */
  playMusic(event: MusicEvent | null): void {
    void this.music.play(event, this.muted);
  }

  /** Ferma la musica e libera l'audio, quando si cambia slot. */
  stop(): void {
    this.music.stop();
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

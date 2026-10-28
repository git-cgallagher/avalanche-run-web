import { effects, music, rumble, RATE, type Effect } from './synth';
import { Settings } from './storage';

/** M cycles through these. */
export const soundModes = ['Music + sound', 'Sound effects only', 'Muted'] as const;

/**
 * Music and sound effects via WebAudio. Every sound is synthesized in code, so there are no audio files.
 * Browsers only allow audio after a user gesture, so nothing plays until `unlock()` runs from a key press.
 */
export class Sound {
  private ctx?: AudioContext;
  private master?: GainNode;
  private musicGain?: GainNode;
  private rumbleGain?: GainNode;
  private buffers = new Map<Effect, AudioBuffer>();
  private musicSource?: AudioBufferSourceNode;
  private pcm?: { effects: Map<Effect, Float32Array>; music: Float32Array; rumble: Float32Array };
  private wantMusic = false;
  private musicPaused = false;
  mode = Settings.soundMode;

  /** Renders every sound up front (a few hundred ms), so the first key press can play instantly. */
  prepare() {
    if (this.pcm) return;
    const rendered = new Map<Effect, Float32Array>();
    for (const name of Object.keys(effects) as Effect[]) rendered.set(name, effects[name]());
    this.pcm = { effects: rendered, music: music(), rumble: rumble() };
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    this.prepare();
    const ctx = new AudioContext();
    this.ctx = ctx;
    const toBuffer = (samples: Float32Array) => {
      const buffer = ctx.createBuffer(1, samples.length, RATE);
      buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      return buffer;
    };
    for (const [name, samples] of this.pcm!.effects) this.buffers.set(name, toBuffer(samples));

    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.musicGain = ctx.createGain();
    this.musicGain.connect(this.master);
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    this.rumbleGain.connect(this.master);

    const rumbleSource = ctx.createBufferSource();
    rumbleSource.buffer = toBuffer(this.pcm!.rumble);
    rumbleSource.loop = true;
    rumbleSource.connect(this.rumbleGain);
    rumbleSource.start();
    this.musicBuffer = toBuffer(this.pcm!.music);
    this.applyMode();
    if (this.wantMusic) this.startMusic();
  }

  private musicBuffer?: AudioBuffer;

  play(effect: Effect, volume = 1) {
    if (this.mode === 2 || !this.ctx || !this.master) return;
    const buffer = this.buffers.get(effect);
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(this.master);
    source.start();
  }

  startMusic() {
    this.wantMusic = true;
    this.musicPaused = false;
    if (!this.ctx || !this.musicGain || !this.musicBuffer || this.musicSource) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.musicBuffer;
    source.loop = true;
    source.connect(this.musicGain);
    source.start();
    this.musicSource = source;
    this.applyMode();
  }

  stopMusic() {
    this.wantMusic = false;
    this.musicSource?.stop();
    this.musicSource = undefined;
  }

  pauseMusic(paused: boolean) {
    this.musicPaused = paused;
    this.applyMode();
  }

  /** 0…1, driven by how close the avalanche is. */
  setRumble(level: number) {
    if (!this.ctx || !this.rumbleGain) return;
    const target = this.mode === 2 ? 0 : level * 0.8;
    this.rumbleGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
  }

  cycleMode(): string {
    this.mode = (this.mode + 1) % soundModes.length;
    Settings.soundMode = this.mode;
    this.applyMode();
    return soundModes[this.mode];
  }

  private applyMode() {
    if (!this.ctx || !this.musicGain) return;
    const musicOn = this.mode === 0 && !this.musicPaused;
    this.musicGain.gain.setTargetAtTime(musicOn ? 0.4 : 0, this.ctx.currentTime, 0.02);
    if (this.mode === 2) this.rumbleGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
  }
}

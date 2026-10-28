import { seeded } from './rng';

/** Tiny offline synthesizer: oscillators, filtered noise and a sequencer for the music loop. */
export const RATE = 44_100;

type Wave = 'sine' | 'square' | 'triangle' | 'saw';
type Samples = Float32Array;

function osc(wave: Wave, phase: number): number {
  const p = phase - Math.floor(phase);
  switch (wave) {
    case 'sine': return Math.sin(2 * Math.PI * p);
    case 'square': return p < 0.5 ? 1 : -1;
    case 'triangle': return 4 * Math.abs(p - 0.5) - 1;
    case 'saw': return 2 * p - 1;
  }
}

/** One note, sweeping exponentially from `f0` to `f1`, with a quick attack and a power-curve decay. */
function tone(wave: Wave, duration: number, f0: number, f1: number, volume: number,
  { attack = 0.005, curve = 3, tremolo = 0 } = {}): Samples {
  const n = Math.floor(duration * RATE);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    phase += (f0 * Math.pow(f1 / f0, t)) / RATE;
    let env = Math.min(1, i / RATE / attack) * Math.pow(1 - t, curve);
    if (tremolo > 0) env *= 0.6 + 0.4 * Math.sin((2 * Math.PI * tremolo * i) / RATE);
    out[i] = osc(wave, phase) * env * volume;
  }
  return out;
}

/** Noise through a one-pole low-pass; `smooth` near 1 is darker (rumbles, thuds), near 0 is hiss. */
function noise(duration: number, volume: number, smooth: number, curve = 2, seed = 1): Samples {
  const next = seeded(seed);
  const n = Math.floor(duration * RATE);
  const gain = Math.sqrt((1 + smooth) / (1 - smooth));
  const out = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y = smooth * y + (1 - smooth) * (next() * 2 - 1);
    out[i] = y * gain * Math.pow(1 - i / n, curve) * volume;
  }
  return out;
}

const silence = (duration: number): Samples => new Float32Array(Math.floor(duration * RATE));

function mix(...parts: Samples[]): Samples {
  const out = new Float32Array(Math.max(...parts.map((p) => p.length)));
  for (const part of parts) for (let i = 0; i < part.length; i++) out[i] += part[i];
  return out;
}

function concat(...parts: Samples[]): Samples {
  const out = new Float32Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const note = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
const held = (wave: Wave, duration: number, freq: number, volume: number, curve: number) =>
  tone(wave, duration, freq, freq, volume, { curve });

export const effects = {
  jump: () => tone('square', 0.16, 280, 820, 0.16, { curve: 1.5 }),
  land: () => mix(tone('sine', 0.14, 140, 55, 0.6), noise(0.08, 0.2, 0.7)),
  trick: () => concat(held('square', 0.07, 1047, 0.13, 0.5), held('square', 0.07, 1319, 0.13, 0.5), held('square', 0.22, 1568, 0.13, 2)),
  crash: () => mix(noise(0.45, 0.5, 0.6, 2.5, 2), tone('sine', 0.25, 110, 40, 0.7)),
  gate: () => mix(held('sine', 0.5, 1320, 0.3, 4), held('sine', 0.5, 1980, 0.12, 6)),
  comboUp: () => concat(held('triangle', 0.06, 880, 0.3, 0.5), held('triangle', 0.12, 1175, 0.3, 3)),
  comboLost: () => tone('triangle', 0.35, 520, 200, 0.3, { curve: 1 }),
  clear: () => tone('triangle', 0.18, 600, 1400, 0.25, { curve: 1 }),
  warn: () => concat(held('square', 0.09, 988, 0.12, 0.3), silence(0.06), held('square', 0.09, 988, 0.12, 0.3)),
  toss: () => tone('sine', 0.22, 520, 240, 0.25, { curve: 1.5 }),
  splat: () => noise(0.18, 0.45, 0.75, 3, 6),
  yeti: () => mix(tone('saw', 0.9, 95, 70, 0.3, { attack: 0.08, curve: 1.2, tremolo: 22 }), noise(0.9, 0.18, 0.85, 1.2, 3)),
  penguin: () => concat(tone('sine', 0.12, 1100, 1700, 0.28, { curve: 0.8 }), tone('sine', 0.16, 1600, 1000, 0.28, { curve: 1 })),
  bear: () => mix(tone('saw', 1.0, 140, 75, 0.28, { attack: 0.1, curve: 1 }), noise(1.0, 0.28, 0.9, 1, 4)),
  narwhal: () => mix(noise(0.7, 0.35, 0.3, 3, 5), concat(silence(0.05), tone('sine', 0.3, 300, 700, 0.3, { curve: 1.5 }))),
  prize: () => mix(
    concat(...[76, 81, 84, 88, 93].map((m) => held('triangle', 0.07, note(m), 0.26, 0.6))),
    concat(silence(0.2), held('sine', 0.45, note(100), 0.1, 3)),
  ),
  buried: () => concat(held('square', 0.18, 523, 0.15, 0.6), held('square', 0.18, 392, 0.15, 0.6), held('square', 0.18, 311, 0.15, 0.6),
    tone('square', 0.6, 262, 196, 0.15, { curve: 1.5 })),
  blip: () => tone('square', 0.05, 660, 660, 0.12, { curve: 1 }),
  highScore: () => concat(...[72, 76, 79, 84].map((m) => held('triangle', 0.1, note(m), 0.3, 0.4)),
    mix(held('triangle', 0.5, note(84), 0.3, 1.5), held('square', 0.5, note(79), 0.08, 1.5))),
} satisfies Record<string, () => Samples>;

export type Effect = keyof typeof effects;

/** Low rolling rumble. Every component completes whole cycles in 2 s, so the loop is seamless. */
export function rumble(): Samples {
  const n = 2 * RATE;
  const next = seeded(9);
  const partials = [31, 36.5, 42, 47.5, 55, 61.5].map((f) => [f, next()] as const);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let body = 0;
    for (const [frequency, offset] of partials) body += Math.sin(2 * Math.PI * (frequency * t + offset));
    body /= partials.length;
    const swell = 0.65 + 0.35 * Math.sin(2 * Math.PI * 1.5 * t) * Math.sin(2 * Math.PI * 0.5 * t);
    out[i] = body * swell * 0.9;
  }
  return out;
}

/** A 16-bar loop at 136 bpm in A minor: bass, arpeggio, drums and a seeded pentatonic lead. */
export function music(): Samples {
  const step = 60 / 136 / 4; // one sixteenth note
  const bars = 16;
  const n = Math.floor(bars * 16 * step * RATE);
  const out = new Float32Array(n);
  const add = (samples: Samples, time: number) => {
    const start = Math.floor(time * RATE);
    const end = Math.min(samples.length, n - start);
    for (let i = 0; i < end; i++) out[start + i] += samples[i];
  };

  // Am  F  C  G  Am  Dm  F  E
  const chords: [number, number[]][] = [
    [45, [57, 60, 64]], [41, [57, 60, 65]], [48, [55, 60, 64]], [43, [55, 59, 62]],
    [45, [57, 60, 64]], [38, [57, 62, 65]], [41, [57, 60, 65]], [40, [56, 59, 64]],
  ];
  const bassPattern = [0, 0, 12, 0, 0, 7, 12, 7];
  const scale = [69, 72, 74, 76, 79, 81, 84];
  const rhythms = [[2, 1, 1, 2, 2], [3, 1, 2, 2], [1, 1, 2, 1, 1, 2], [4, 2, 2], [2, 2, 1, 1, 2]]; // eighths, sum 8
  const next = seeded(2026);
  const pickIndex = (count: number) => Math.floor(next() * count);

  const kick = tone('sine', 0.18, 150, 45, 0.5, { curve: 1.5 });
  const snare = mix(noise(0.15, 0.2, 0.4, 2.5, 11), tone('triangle', 0.08, 220, 180, 0.15));
  const hat = noise(0.035, 0.05, 0, 2, 12);

  for (let bar = 0; bar < bars; bar++) {
    const [root, tones] = chords[bar % chords.length];
    const barStart = bar * 16 * step;

    bassPattern.forEach((offset, i) => add(held('triangle', step * 1.8, note(root + offset), 0.26, 0.8), barStart + i * 2 * step));

    if (bar >= 4) {
      for (let i = 0; i < 16; i++) {
        add(held('square', step * 0.9, note(tones[[0, 1, 2, 1][i % 4]] + 12), 0.035, 1.2), barStart + i * step);
      }
    }

    if (bar >= 2) {
      for (let beat = 0; beat < 4; beat++) {
        const t = barStart + beat * 4 * step;
        add(beat % 2 === 0 ? kick : snare, t);
        add(hat, t);
        add(hat, t + step * 2);
      }
    }

    if (bar >= 8) {
      let slot = 0;
      rhythms[pickIndex(rhythms.length)].forEach((length, i) => {
        // Chord tones on the downbeat, free pentatonic movement elsewhere.
        const midi = i === 0 ? tones[pickIndex(3)] + 12 : scale[pickIndex(scale.length)];
        const duration = length * step * 2 * 0.95;
        add(mix(tone('square', duration, note(midi), note(midi), 0.06, { attack: 0.01, curve: 0.9 }),
          tone('triangle', duration, note(midi), note(midi), 0.1, { attack: 0.01, curve: 0.9 })), barStart + slot * step * 2);
        slot += length;
      });
    }
  }

  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0.9) for (let i = 0; i < n; i++) out[i] *= 0.9 / peak;
  return out;
}

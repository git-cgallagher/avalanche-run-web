/** Small deterministic generator (mulberry32) for repeatable shapes and sounds. Returns [0, 1). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = (lo: number, hi: number, next: () => number = Math.random) => lo + next() * (hi - lo);
export const randInt = (lo: number, hiExclusive: number) => Math.floor(rand(lo, hiExclusive));
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const pick = <T>(list: readonly T[]): T => list[randInt(0, list.length)];

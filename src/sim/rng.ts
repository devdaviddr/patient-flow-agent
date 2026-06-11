// Seedable PRNG (mulberry32). The simulator's ONLY source of randomness — no
// Math.random anywhere in src/sim — so the same seed replays an identical day.

export interface Rng {
  /** next float in [0, 1) */
  next(): number
  /** integer in [0, n) */
  int(n: number): number
  /** count of independent successes given a small mean (simple Poisson-ish draw) */
  poisson(mean: number): number
}

export function makeRng(seed: number): Rng {
  let state = seed >>> 0
  const next = () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (n: number) => Math.floor(next() * n)
  // Knuth's Poisson sampler, driven by our PRNG.
  const poisson = (mean: number) => {
    const L = Math.exp(-mean)
    let k = 0
    let p = 1
    do {
      k++
      p *= next()
    } while (p > L)
    return k - 1
  }
  return { next, int, poisson }
}

// Deterministic 32-bit string hash (FNV-1a) — used to derive a patient's fixed
// profile from its id, so attributes are reproducible without shared state.
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

import type { ActionKind, AnalysisOption } from '../domain/types'

/** How a villain deviates from the GTO strategy it samples from. */
export type Style = 'tight' | 'gto' | 'loose' | 'maniac'
export const STYLES: Style[] = ['tight', 'gto', 'loose', 'maniac']

/**
 * Multipliers applied to the GTO frequency of each action kind before renormalising, plus a
 * floor so a style still takes its signature action with hands GTO would never use.
 */
export const STYLE_PROFILE: Record<Style, { fold: number; call: number; aggro: number; floor: Partial<Record<'call' | 'aggro', number>>; label: string; blurb: string }> = {
  tight: { fold: 1.6, call: 0.8, aggro: 0.8, floor: {}, label: 'Tight', blurb: 'folds more than GTO, continues only with the strong part of the range' },
  gto: { fold: 1, call: 1, aggro: 1, floor: {}, label: 'GTO', blurb: 'plays the solver / chart frequencies' },
  loose: { fold: 0.45, call: 1.6, aggro: 1, floor: { call: 0.05 }, label: 'Loose', blurb: 'calls too much, folds too little' },
  maniac: { fold: 0.4, call: 0.6, aggro: 2.5, floor: { aggro: 0.06 }, label: 'Maniac', blurb: 'bets and raises far more than GTO, with any two' },
}

const AGGRO: ActionKind[] = ['bet', 'raise', 'allin']

/** Style-tilted frequencies for a set of options (same order). Sums to 1. */
export function tilt(options: AnalysisOption[], style: Style): number[] {
  const p = STYLE_PROFILE[style]
  const hasAggro = options.some((o) => AGGRO.includes(o.kind))
  const hasCall = options.some((o) => o.kind === 'call')
  const out = options.map((o) => {
    let f = o.freq
    if (AGGRO.includes(o.kind)) {
      if (p.floor.aggro && f < p.floor.aggro) f = p.floor.aggro
      f *= p.aggro
    } else if (o.kind === 'call' || o.kind === 'check') {
      if (o.kind === 'call' && p.floor.call && f < p.floor.call) f = p.floor.call
      f *= p.call
    } else {
      f *= p.fold
    }
    return f
  })
  // a check is never "tight" or "loose" by itself: when nothing else is available keep GTO
  if (!hasAggro && !hasCall) return normalise(options.map((o) => o.freq))
  return normalise(out)
}

function normalise(v: number[]): number[] {
  const sum = v.reduce((a, b) => a + b, 0)
  if (sum <= 0) return v.map((_, i) => (i === 0 ? 1 : 0))
  return v.map((x) => x / sum)
}

/** Sample an option index by tilted frequency. */
export function sampleIndex(freqs: number[], r: number): number {
  let acc = 0
  for (let i = 0; i < freqs.length; i++) {
    acc += freqs[i]
    if (r < acc) return i
  }
  return freqs.length - 1
}

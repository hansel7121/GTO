import type { Action, Analysis, Decision, Hand } from '../domain/types'

/** Frequency at or above which a mixed-strategy action counts as "correct". */
export const FREQ_TOLERANCE = 0.1
/** EV loss (as a fraction of the pot) at or below which an action counts as correct (solver tolerance). */
export const EV_TOLERANCE_PCT = 0.5

/** Find which option the chosen action corresponds to (-1 when the model has no such action). */
export function matchOption(analysis: Analysis, chosen: Action): number {
  const opts = analysis.options
  const kind = chosen.kind
  if (kind === 'bet' || kind === 'raise' || kind === 'allin') {
    if (kind === 'allin') {
      const ai = opts.findIndex((o) => o.kind === 'allin')
      if (ai >= 0) return ai
    }
    const amt = chosen.amount ?? 0
    let best = -1
    let bestDiff = Infinity
    for (let i = 0; i < opts.length; i++) {
      const o = opts[i]
      if (o.kind !== 'bet' && o.kind !== 'raise' && o.kind !== 'allin') continue
      const d = o.amount === undefined ? 0 : Math.abs(o.amount - amt)
      if (d < bestDiff) { bestDiff = d; best = i }
    }
    if (best < 0) return -1
    // chart / equity models have a single generic raise option: any raise maps onto it
    if (analysis.engine !== 'cfr') return best
    // solver: only an (almost) identical size counts; otherwise the line must be re-solved
    return bestDiff <= Math.max(0.011, 0.01 * amt) ? best : -1
  }
  const i = opts.findIndex((o) => o.kind === kind)
  if (i >= 0) return i
  if (kind === 'check') return opts.findIndex((o) => o.label === 'Check')
  return -1
}

/** Grade a decision in place: sets chosenIndex, evLossBb, correct. */
export function grade(analysis: Analysis, chosen: Action, potBb: number): Analysis {
  const out: Analysis = { ...analysis, options: analysis.options.map((o) => ({ ...o })) }
  if (out.bestIndex < 0 || out.options.length === 0) {
    out.chosenIndex = undefined
    out.correct = undefined
    return out
  }
  const ci = matchOption(out, chosen)
  out.chosenIndex = ci >= 0 ? ci : undefined
  const best = out.options[out.bestIndex]
  const hasEv = out.options.every((o) => typeof o.ev === 'number')
  if (ci < 0) {
    // action not in the model (e.g. custom size not yet solved)
    out.correct = undefined
    out.evLossBb = undefined
    return out
  }
  const pick = out.options[ci]
  if (hasEv) {
    const loss = Math.max(0, (best.ev ?? 0) - (pick.ev ?? 0))
    out.evLossBb = loss
    out.correct = loss <= (EV_TOLERANCE_PCT / 100) * Math.max(potBb, 1) || pick.freq >= FREQ_TOLERANCE
  } else {
    out.correct = pick.freq >= FREQ_TOLERANCE
  }
  return out
}

export interface SessionStats {
  decisions: number
  graded: number
  correct: number
  accuracy: number // 0..1
  evLossBb: number
  cfrGraded: number
  approxGraded: number
  byStreet: Record<string, { graded: number; correct: number; evLossBb: number }>
}

export function sessionStats(hands: Hand[]): SessionStats {
  const s: SessionStats = {
    decisions: 0,
    graded: 0,
    correct: 0,
    accuracy: 0,
    evLossBb: 0,
    cfrGraded: 0,
    approxGraded: 0,
    byStreet: {},
  }
  for (const h of hands) {
    for (const d of h.decisions) {
      s.decisions++
      const a = d.analysis
      if (!a || a.correct === undefined) continue
      s.graded++
      if (a.correct) s.correct++
      if (a.evLossBb) s.evLossBb += a.evLossBb
      if (a.engine === 'cfr') s.cfrGraded++
      if (a.confidence === 'approx') s.approxGraded++
      const b = (s.byStreet[d.street] ??= { graded: 0, correct: 0, evLossBb: 0 })
      b.graded++
      if (a.correct) b.correct++
      b.evLossBb += a.evLossBb ?? 0
    }
  }
  s.accuracy = s.graded ? s.correct / s.graded : 0
  return s
}

export function handStats(hand: Hand): { graded: number; correct: number; evLossBb: number } {
  let graded = 0
  let correct = 0
  let evLossBb = 0
  for (const d of hand.decisions) {
    if (!d.analysis || d.analysis.correct === undefined) continue
    graded++
    if (d.analysis.correct) correct++
    evLossBb += d.analysis.evLossBb ?? 0
  }
  return { graded, correct, evLossBb }
}

export function decisionLabel(d: Decision): string {
  if (!d.analysis) return 'not analysed'
  if (d.analysis.correct === undefined) return 'ungraded'
  return d.analysis.correct ? 'ok' : 'mistake'
}

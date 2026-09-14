import { handClass, type Card } from '../domain/cards'
import { EPS, type EngineConfig, type HandState } from '../domain/engine'
import type { ChartFormat, Seat } from '../domain/positions'
import type { Action, Analysis, AnalysisOption } from '../domain/types'
import { analyzePreflop } from '../preflop/analyze'
import type { Scenario } from '../preflop/charts'
import { chartFrequencies, findChart, type ChartResolver } from '../preflop/lookup'

/** The trainer's fixed game: 5-handed, 30bb, no straddle / ante. */
export const TRAINER_CFG: EngineConfig = { tableSize: 5, stackBb: 30, straddleBb: 0 }
export const TRAINER_FORMAT: ChartFormat = '5max30'

/** Fraction of the effective stack above which a raise is just a jam. */
const JAM_FRACTION = 0.4

/**
 * "Raise to" sizes (bb) matching the 30bb charts: open 2.5 (SB 3), 3-bet 3x IP / 3.5x OOP,
 * anything deeper in the tree is all-in.
 */
export function raiseTo30(scenario: Scenario, hero: Seat, heroInPosition: boolean, currentBet: number): number {
  if (scenario === 'RFI') return hero === 'SB' ? 3 : 2.5
  if (scenario === 'VS_RFI') {
    const to = Math.round(currentBet * (heroInPosition ? 3 : 3.5) * 10) / 10
    return to >= TRAINER_CFG.stackBb * JAM_FRACTION ? TRAINER_CFG.stackBb : to
  }
  return TRAINER_CFG.stackBb
}

/** True when the bet `seat` faces is (effectively) an all-in: it cannot be raised. */
export function facingAllIn(state: HandState, seat: Seat): boolean {
  const me = state.players[seat]
  const toCall = state.currentBet - me.committed
  if (toCall <= EPS) return false
  if (toCall >= me.stack - EPS) return true
  return Object.values(state.players).some((p) => p.seat !== seat && !p.folded && p.allIn && p.committed >= state.currentBet - EPS)
}

/**
 * Chart analysis for one trainer decision. Wraps `analyzePreflop` with the 30bb chart set and
 * sizes, then tidies the options for a short-stack tree:
 *  - facing a jam: only Call / Fold remain. The calling frequency is the chart's all-in mass
 *    (plus its flat mass when the chart itself is defined against a jam, i.e. VS_4BET).
 *  - a zero-frequency non-all-in raise is dropped when the chart jams instead.
 */
export function analyzeTrainer(hero: Seat, heroCards: [Card, Card], state: HandState, preflopActions: Action[], resolve: ChartResolver): Analysis {
  const base = analyzePreflop({
    tableSize: TRAINER_CFG.tableSize,
    hero,
    heroCards,
    state,
    preflopActions,
    resolve,
    chartFormat: TRAINER_FORMAT,
    raiseTo: raiseTo30,
  })
  const notes = base.notes.filter((n) => !n.includes('Import a solver export'))
  if (base.options.length === 0) {
    // Off-model line (e.g. a limp in front). If hero faces a jam, grade it with the generic
    // cold jam-calling range; otherwise leave it ungraded.
    if (!facingAllIn(state, hero)) return base
    const generic = findChart(resolve, TRAINER_CFG.tableSize, 'COLD_4BET', hero, undefined, TRAINER_FORMAT)
    if (!generic) return base
    const f = chartFrequencies(generic.chart, handClass(heroCards[0], heroCards[1]))
    const call = Math.min(1, f.allin + f.raise)
    return {
      ...base,
      engine: 'preflop-chart',
      confidence: 'approx',
      options: [
        { label: 'Call', kind: 'call', freq: call },
        { label: 'Fold', kind: 'fold', freq: Math.max(0, 1 - call) },
      ],
      bestIndex: call > 0.5 ? 0 : 1,
      notes: [...notes, 'No chart for this line (off-model, e.g. after a limp): graded with the generic jam-calling range.'],
      scenario: base.scenario ?? 'facing jam',
    }
  }
  let options: AnalysisOption[]
  if (facingAllIn(state, hero)) {
    const chartVsJam = base.scenario?.startsWith('VS_4BET') ?? false
    let call = 0
    for (const o of base.options) {
      if (o.kind === 'allin' || o.kind === 'raise' || (chartVsJam && o.kind === 'call')) call += o.freq
    }
    call = Math.min(1, call)
    options = [
      { label: 'Call', kind: 'call', freq: call },
      { label: 'Fold', kind: 'fold', freq: Math.max(0, 1 - call) },
    ]
    notes.push(chartVsJam ? 'Facing a jam: call range from the chart.' : 'Facing a jam: the chart\'s all-in range is the calling range (flat-call hands fold).')
  } else {
    const hasJam = base.options.some((o) => o.kind === 'allin' && o.freq > 0)
    options = base.options.filter((o) => !(hasJam && o.kind === 'raise' && o.freq <= 0))
  }
  let bestIndex = 0
  for (let i = 1; i < options.length; i++) if (options[i].freq > options[bestIndex].freq) bestIndex = i
  return { ...base, options, bestIndex, notes }
}

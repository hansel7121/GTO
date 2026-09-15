import { handClass, type Card } from '../domain/cards'
import { EPS, type HandState } from '../domain/engine'
import type { Seat } from '../domain/positions'
import type { Action, Analysis, AnalysisOption } from '../domain/types'
import { analyzePreflop } from '../preflop/analyze'
import type { Scenario } from '../preflop/charts'
import { chartFrequencies, findChart, recommendedRaiseTo, type ChartResolver } from '../preflop/lookup'
import { chartSetFor, type TrainerSettings } from './config'

/** Fraction of the starting stack above which a raise is just a jam. */
const JAM_FRACTION = 0.4

/**
 * "Raise to" sizes (bb) for the 30bb chart set: open 2.5 (SB 3), 3-bet 3x IP / 3.5x OOP,
 * anything deeper in the tree is all-in.
 */
export function raiseTo30(scenario: Scenario, hero: Seat, heroInPosition: boolean, currentBet: number, stackBb = 30): number {
  if (scenario === 'RFI') return hero === 'SB' ? 3 : 2.5
  if (scenario === 'VS_RFI') {
    const to = Math.round(currentBet * (heroInPosition ? 3 : 3.5) * 10) / 10
    return to >= stackBb * JAM_FRACTION ? stackBb : to
  }
  return stackBb
}

/** Sizing function for the active chart set; any raise past 40% of the stack becomes a jam. */
export function raiseToFor(settings: TrainerSettings) {
  const deep = chartSetFor(settings.stackBb) !== '5max30'
  return (scenario: Scenario, hero: Seat, ip: boolean, currentBet: number): number => {
    const to = deep ? recommendedRaiseTo(scenario, hero, ip, currentBet) : raiseTo30(scenario, hero, ip, currentBet, settings.stackBb)
    return to >= settings.stackBb * JAM_FRACTION ? settings.stackBb : to
  }
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
export function analyzeTrainer(
  settings: TrainerSettings,
  hero: Seat,
  heroCards: [Card, Card],
  state: HandState,
  preflopActions: Action[],
  resolve: ChartResolver,
): Analysis {
  const base = analyzePreflop({
    tableSize: settings.players,
    hero,
    heroCards,
    state,
    preflopActions,
    resolve,
    chartFormat: chartSetFor(settings.stackBb),
    raiseTo: raiseToFor(settings),
  })
  const notes = base.notes.filter((n) => !n.includes('Import a solver export'))
  if (base.options.length === 0) {
    // Off-model line (e.g. a limp in front). If hero faces a jam, grade it with the generic
    // cold jam-calling range; otherwise leave it ungraded.
    if (!facingAllIn(state, hero)) return base
    // the 30bb cold chart doubles as the generic "call a jam" range at any depth
    const generic = findChart(resolve, settings.players, 'COLD_4BET', hero, undefined, '5max30')
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
    // open-limping is not part of the model: list it at 0% so a limp grades as a mistake
    const toCall = state.currentBet - state.players[hero].committed
    if (base.scenario === 'RFI' && toCall > EPS && !options.some((o) => o.kind === 'call')) {
      options.splice(options.length - 1, 0, { label: 'Limp', kind: 'call', freq: 0 })
    }
  }
  let bestIndex = 0
  for (let i = 1; i < options.length; i++) if (options[i].freq > options[bestIndex].freq) bestIndex = i
  return { ...base, options, bestIndex, notes }
}

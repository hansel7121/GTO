import { computeState, seatsIn, type EngineConfig } from '../domain/engine'
import type { Analysis, Hand, Session, Settings } from '../domain/types'
import { analyzeWithEquity } from '../equity/analyze'
import { analyzePreflop, rangesFromPreflop } from '../preflop/analyze'
import type { ChartResolver } from '../preflop/lookup'
import { preflopActionCount, analyzeWithCfr, postflopSpot } from '../solver/postflop'
import type { SolveProgress } from '../solver/worker'

export function engineConfig(session: Session, hand: Hand): EngineConfig {
  return {
    tableSize: hand.tableSize,
    stackBb: session.stackDepthBb,
    straddleBb: hand.straddle && session.straddle > 0 ? session.straddle / session.bb : 0,
  }
}

/** Resolve the effective solver mode for this device. */
export function effectiveMode(settings: Settings): 'full' | 'street' | 'off' {
  if (settings.solverMode !== 'auto') return settings.solverMode
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1
  const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
  const mobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
  return cores >= 4 && isolated && !mobile ? 'full' : 'street'
}

export interface AnalyzeArgs {
  session: Session
  hand: Hand
  /** Hero decision point: the node reached after this many actions. */
  actionIndex: number
  /** Include hand.actions[actionIndex] (hero's chosen action) in the solver tree. */
  includeChosen?: boolean
  settings: Settings
  resolve: ChartResolver
  onProgress?: (p: SolveProgress) => void
  /** Override the device's solver mode (e.g. force a full flop solve when re-grading). */
  mode?: 'full' | 'street' | 'off'
}

/** Analyse hero's decision at `actionIndex` with the right engine for the spot. */
export async function analyzeDecision(args: AnalyzeArgs): Promise<Analysis> {
  const { session, hand, actionIndex, settings, resolve } = args
  const cfg = engineConfig(session, hand)
  if (!hand.heroCards) throw new Error('Enter your hole cards first')
  const actions = hand.actions.slice(0, actionIndex)
  const state = computeState(cfg, hand.board.length, actions)
  if (state.error) throw new Error(state.error)
  if (state.toAct !== hand.heroSeat) throw new Error(`It is ${state.toAct ?? 'nobody'}'s turn, not yours`)

  if (state.street === 'preflop') {
    return analyzePreflop({
      tableSize: hand.tableSize,
      hero: hand.heroSeat,
      heroCards: hand.heroCards,
      state,
      preflopActions: actions,
      resolve,
    })
  }

  const preflopLen = preflopActionCount(cfg, hand, actionIndex)
  const preflopActions = hand.actions.slice(0, preflopLen)
  const stFlop = computeState(cfg, 3, preflopActions)
  const players = seatsIn(stFlop)
  const lr = rangesFromPreflop(hand.tableSize, preflopActions, players, resolve)

  const mode = args.mode ?? effectiveMode(settings)
  const spot = postflopSpot(cfg, hand, actionIndex)
  const useSolver = spot && mode !== 'off' && !(mode === 'street' && state.street === 'flop')
  if (spot && useSolver) {
    const res = await analyzeWithCfr({
      cfg,
      hand,
      actionsUpTo: actionIndex,
      includeChosen: args.includeChosen,
      from: mode === 'street' ? 'street' : 'flop',
      ranges: lr.ranges,
      settings,
      onProgress: args.onProgress ?? (() => {}),
    })
    if (lr.approx) {
      res.analysis.confidence = 'approx'
      res.analysis.notes.push(...lr.notes)
    }
    return res.analysis
  }

  const eq = analyzeWithEquity({
    hero: hand.heroSeat,
    heroCards: hand.heroCards,
    board: hand.board.slice(0, state.street === 'flop' ? 3 : state.street === 'turn' ? 4 : 5),
    state,
    ranges: lr.ranges,
    rangeNotes: lr.notes,
    playersAtFlop: players.length,
  })
  if (spot) {
    // heads-up spot that the solver could grade exactly later
    eq.provisional = true
    eq.notes = eq.notes.filter((n) => !n.includes('no public GTO solution exists for multiway'))
    eq.notes.unshift(
      mode === 'off'
        ? 'Solver is off: equity / pot-odds estimate only.'
        : 'Quick mode: a flop solve is too slow on this device, so this is an equity / pot-odds estimate. Use "Grade all" on a laptop for the full GTO solve.',
    )
  }
  return eq
}

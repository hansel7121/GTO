import type { Card } from '../domain/cards'
import { computeState, type EngineConfig } from '../domain/engine'
import type { Seat } from '../domain/positions'
import type { Action, Settings, Street } from '../domain/types'
import { effectiveMode } from '../app/analyze'
import { solveAndQuery, type SolveOutcome } from '../solver/client'
import { prepareCfr, type PostflopSpot } from '../solver/postflop'
import type { LineStep, SolveProgress } from '../solver/worker'
import { toChips } from '../solver/postflop'
import { engineCfg } from '../trainer/config'
import type { GtoSettings } from './config'
import { asHand, type GtoHand } from './hand'

export interface SolvedNode {
  outcome: SolveOutcome
  spot: PostflopSpot
  fromStreet: Street
  notes: string[]
}

/**
 * Postflop solver access for one hand. `query` returns the solved node reached after
 * `actionsUpTo` actions (for whichever player acts there), or null when the spot cannot be
 * solved (multiway, solver off, or the flop in quick mode). Injected so tests can fake it.
 */
export interface PostflopSolver {
  query(hand: GtoHand, actionsUpTo: number, holdings: { seat: Seat; cards: [Card, Card] }[]): Promise<SolvedNode | null>
  /** Villain's fold frequency (0..1, range-weighted) if hero takes `action` at `actionsUpTo`. */
  foldPctAfter(hand: GtoHand, actionsUpTo: number, action: Action): Promise<number | null>
}

export type SolveMode = 'full' | 'street' | 'off'

export function resolveSolveMode(gto: GtoSettings, app: Settings): SolveMode {
  if (gto.solver === 'full') return 'full'
  if (gto.solver === 'quick') return 'street'
  return effectiveMode({ ...app, solverMode: 'auto' })
}

/** Real solver: one CFR solve per hand (from the flop, or per street in quick mode), then node queries. */
export class CfrHandSolver implements PostflopSolver {
  private app: Settings
  private gto: GtoSettings
  private onProgress: (p: SolveProgress | null) => void

  constructor(app: Settings, gto: GtoSettings, onProgress: (p: SolveProgress | null) => void) {
    this.app = app
    this.gto = gto
    this.onProgress = onProgress
  }

  private settings(): Settings {
    return { ...this.app, solverTimeBudgetSec: this.gto.solveSeconds, solverTargetExploitPct: Math.max(this.app.solverTargetExploitPct, 0.8) }
  }

  private cfg(hand: GtoHand): EngineConfig {
    return engineCfg({ players: hand.settings.players, stackBb: hand.settings.stackBb })
  }

  private prep(hand: GtoHand, actionsUpTo: number, holdings: { seat: Seat; cards: [Card, Card] }[]) {
    const mode = resolveSolveMode(this.gto, this.app)
    if (mode === 'off' || !hand.ranges) return null
    const cfg = this.cfg(hand)
    const st = computeState(cfg, hand.board.length, hand.actions.slice(0, actionsUpTo))
    if (mode === 'street' && st.street === 'flop') return null
    try {
      return prepareCfr(
        { cfg, hand: asHand(hand), actionsUpTo, from: mode === 'street' ? 'street' : 'flop', ranges: hand.ranges, settings: this.settings() },
        holdings,
      )
    } catch {
      return null // not heads-up
    }
  }

  async query(hand: GtoHand, actionsUpTo: number, holdings: { seat: Seat; cards: [Card, Card] }[]): Promise<SolvedNode | null> {
    const prep = this.prep(hand, actionsUpTo, holdings)
    if (!prep) return null
    const outcome = await solveAndQuery(prep.cfgSolve, prep.line, (p) => this.onProgress(p.phase === 'done' ? null : p), this.settings().threads)
    this.onProgress(null)
    return { outcome, spot: prep.spot, fromStreet: prep.fromStreet, notes: prep.notes }
  }

  async foldPctAfter(hand: GtoHand, actionsUpTo: number, action: Action): Promise<number | null> {
    const prep = this.prep(hand, actionsUpTo, [{ seat: hand.heroSeat, cards: hand.cards[hand.heroSeat] }])
    if (!prep) return null
    const cfg = this.cfg(hand)
    const st = computeState(cfg, hand.board.length, hand.actions.slice(0, actionsUpTo))
    const step = actionToStep(action, st.players[action.seat].committed + st.players[action.seat].stack)
    if (!step) return null
    try {
      const outcome = await solveAndQuery(prep.cfgSolve, [...prep.line, step], () => {}, this.settings().threads)
      const node = outcome.node
      const fi = node.actions.findIndex((a) => a.startsWith('Fold'))
      if (fi < 0 || node.player === 'terminal' || node.player === 'chance') return null
      let num = 0
      let den = 0
      for (let i = 0; i < node.hands.length; i++) {
        const w = node.weights[i] ?? 0
        num += w * (node.strategy[fi]?.[i] ?? 0)
        den += w
      }
      return den > 0 ? num / den : null
    } catch {
      return null
    }
  }
}

function actionToStep(a: Action, stackTotal: number): LineStep | null {
  switch (a.kind) {
    case 'check': return { kind: 'X' }
    case 'call': return { kind: 'C' }
    case 'fold': return { kind: 'F' }
    case 'bet': return { kind: 'B', amount: toChips(a.amount ?? 0) }
    case 'raise': return { kind: 'R', amount: toChips(a.amount ?? 0) }
    case 'allin': return { kind: 'A', amount: toChips(stackTotal) }
    default: return null
  }
}

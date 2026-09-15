import type { Card } from '../domain/cards'
import { EPS, type HandState } from '../domain/engine'
import type { Seat } from '../domain/positions'
import type { Action, AnalysisOption } from '../domain/types'
import { computeEquity } from '../equity/equity'
import type { ChartResolver } from '../preflop/lookup'
import type { Range } from '../preflop/range'
import { nodeHandIndex, nodeOptions } from '../solver/postflop'
import { analyzeTrainer } from '../trainer/analyze30'
import { legalRaise, optionToAction, type Rng } from '../trainer/sim'
import type { GtoHand } from './hand'
import type { PostflopSolver } from './solver'
import { STYLE_PROFILE, sampleIndex, tilt, type Style } from './style'

export interface VillainDeps {
  resolve: ChartResolver
  rand: Rng
  solver: PostflopSolver | null
}

/** One villain decision: GTO strategy (chart / solver / equity heuristic) tilted by its style. */
export async function villainAct(hand: GtoHand, state: HandState, seat: Seat, deps: VillainDeps): Promise<Action> {
  const style = hand.styles[seat] ?? 'gto'
  const cards = hand.cards[seat]
  if (state.street === 'preflop') {
    const a = analyzeTrainer({ players: hand.settings.players, stackBb: hand.settings.stackBb }, seat, cards, state, hand.actions, deps.resolve)
    if (a.options.length > 0) return pick(state, seat, a.options, style, deps.rand)
    return heuristicPreflop(state, seat, cards, deps.rand)
  }
  if (deps.solver) {
    const solved = await deps.solver.query(hand, hand.actions.length, [
      { seat: hand.heroSeat, cards: hand.cards[hand.heroSeat] },
      { seat, cards },
    ])
    if (solved) {
      const node = solved.outcome.node
      const villainSide = solved.spot.heroIsOop ? 'ip' : 'oop'
      const idx = node.player === villainSide ? nodeHandIndex(node, cards) : -1
      if (idx >= 0 && node.actions.length > 0) {
        return pick(state, seat, nodeOptions(node, idx), style, deps.rand)
      }
    }
  }
  return heuristicPostflop(hand, state, seat, style, deps.rand)
}

/** Tilt the option frequencies by style, sample one, and turn it into a legal action. */
function pick(state: HandState, seat: Seat, options: AnalysisOption[], style: Style, rand: Rng): Action {
  const freqs = tilt(options, style)
  let i = sampleIndex(freqs, rand())
  if (style === 'maniac' && (options[i].kind === 'bet' || options[i].kind === 'raise')) {
    // maniacs like the biggest size on the menu
    let big = i
    for (let j = 0; j < options.length; j++) {
      if ((options[j].kind === 'bet' || options[j].kind === 'raise') && (options[j].amount ?? 0) > (options[big].amount ?? 0)) big = j
    }
    i = big
  }
  return toAction(state, seat, options[i])
}

function toAction(state: HandState, seat: Seat, o: AnalysisOption): Action {
  const p = state.players[seat]
  const toCall = state.currentBet - p.committed
  if (o.kind === 'bet') {
    const amt = Math.min(o.amount ?? 0, p.committed + p.stack)
    if (amt >= p.committed + p.stack - EPS) return { seat, kind: 'allin' }
    return { seat, kind: 'bet', amount: round2(amt) }
  }
  if (o.kind === 'raise') return legalRaise(state, seat, o.amount ?? state.minRaiseTo)
  if (o.kind === 'check') return toCall > EPS ? { seat, kind: 'call' } : { seat, kind: 'check' }
  return optionToAction(state, seat, o.kind, o.amount)
}

const round2 = (x: number) => Math.round(x * 100) / 100

function heuristicPreflop(state: HandState, seat: Seat, cards: [Card, Card], rand: Rng): Action {
  const toCall = state.currentBet - state.players[seat].committed
  if (toCall <= EPS) return { seat, kind: 'check' }
  const r1 = cards[0] >> 2
  const r2 = cards[1] >> 2
  const premium = (r1 === r2 && r1 >= 10) || (r1 >= 11 && r2 >= 11)
  if (premium && rand() < 0.9) return toCall >= state.players[seat].stack - EPS ? { seat, kind: 'call' } : { seat, kind: 'allin' }
  return { seat, kind: 'fold' }
}

/**
 * Equity-vs-ranges policy for spots the solver does not cover (multiway, or the flop in quick
 * mode). Thresholds shift with style.
 */
export function heuristicPostflop(hand: GtoHand, state: HandState, seat: Seat, style: Style, rand: Rng): Action {
  const p = state.players[seat]
  const toCall = state.currentBet - p.committed
  const others = Object.values(state.players).filter((q) => !q.folded && q.seat !== seat)
  const ranges = others.map((q) => hand.ranges?.get(q.seat)).filter((r): r is Range => !!r)
  const eq =
    ranges.length === others.length && ranges.length > 0
      ? computeEquity({ hero: hand.cards[seat], board: hand.board, villains: ranges, iterations: 2500, seed: Math.floor(rand() * 1e9) }).equity
      : 0.5
  const profile = STYLE_PROFILE[style]
  const pot = state.pot
  if (toCall > EPS) {
    const potOdds = toCall / (pot + toCall)
    const margin = style === 'tight' ? 0.08 : style === 'gto' ? 0.03 : style === 'loose' ? -0.08 : -0.14
    const raiseAt = style === 'maniac' ? 0.55 : style === 'tight' ? 0.78 : 0.7
    const canRaise = state.minRaiseTo < p.committed + p.stack + EPS && toCall < p.stack - EPS
    if (eq >= raiseAt && canRaise) return legalRaise(state, seat, state.currentBet + pot + toCall)
    if (style === 'maniac' && canRaise && rand() < 0.15) return legalRaise(state, seat, state.currentBet + pot + toCall)
    if (eq >= potOdds + margin) return toCall >= p.stack - EPS ? { seat, kind: 'call' } : { seat, kind: 'call' }
    return { seat, kind: 'fold' }
  }
  const betAt = style === 'tight' ? 0.62 : style === 'gto' ? 0.55 : style === 'loose' ? 0.5 : 0.35
  const bluff = style === 'maniac' ? 0.3 : style === 'loose' ? 0.05 : style === 'gto' ? 0.1 : 0.03
  if (eq >= betAt || rand() < bluff * profile.aggro) {
    const size = style === 'maniac' ? pot : Math.round(pot * 0.6 * 100) / 100
    const amt = Math.min(size, p.stack)
    if (amt >= p.stack - EPS) return { seat, kind: 'allin' }
    return { seat, kind: 'bet', amount: Math.max(1, round2(amt)) }
  }
  return { seat, kind: 'check' }
}

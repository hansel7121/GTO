import type { Card } from '../domain/cards'
import type { HandState } from '../domain/engine'
import type { Seat } from '../domain/positions'
import type { Analysis, AnalysisOption } from '../domain/types'
import type { Range } from '../preflop/range'
import { computeEquity } from './equity'

export interface EquityContext {
  hero: Seat
  heroCards: [Card, Card]
  board: Card[]
  state: HandState
  ranges: Map<Seat, Range>
  rangeNotes: string[]
  /** Number of players who saw the flop (for the explanation text). */
  playersAtFlop?: number
}

/**
 * Multiway / fallback analysis using textbook pot-odds math:
 *   required equity to call = call / (pot + call)          (pot odds)
 *   MDF = pot / (pot + bet), bluff ratio alpha = bet / (pot + bet)
 * References: Chen & Ankenman, "The Mathematics of Poker" (2006); any standard pot-odds primer.
 * Villain ranges are the preflop chart ranges (not narrowed by postflop action).
 */
export function analyzeWithEquity(ctx: EquityContext): Analysis {
  const notes: string[] = [...ctx.rangeNotes]
  const villains = Object.values(ctx.state.players)
    .filter((p) => !p.folded && p.seat !== ctx.hero)
    .map((p) => p.seat)
  const villainRanges = villains.map((v) => ctx.ranges.get(v)).filter((r): r is Range => !!r)
  if (villainRanges.length !== villains.length) notes.push('Some villain ranges were unavailable.')
  const eq = computeEquity({ hero: ctx.heroCards, board: ctx.board, villains: villainRanges, iterations: 30000 })
  const hero = ctx.state.players[ctx.hero]
  const toCall = Math.max(0, ctx.state.currentBet - hero.committed)
  const pot = ctx.state.pot // includes the outstanding bet(s)
  const n = villains.length + 1
  const atFlop = ctx.playersAtFlop ?? n
  notes.push(
    `${atFlop} players saw the flop${atFlop !== n ? ` (${n} still in)` : ''}: no public GTO solution exists for multiway pots; using equity vs preflop ranges (${eq.exact ? 'exact' : eq.samples.toLocaleString() + ' samples'}) and pot odds.`,
  )

  const options: AnalysisOption[] = []
  if (toCall > 0) {
    const required = toCall / (pot + toCall)
    const bet = ctx.state.currentBet
    const potBefore = pot - bet
    const mdf = potBefore > 0 ? potBefore / (potBefore + bet) : 0
    const alpha = bet / (potBefore + bet)
    const callGood = eq.equity >= required
    options.push({ label: 'Call', kind: 'call', freq: callGood ? 1 : 0 })
    options.push({ label: 'Fold', kind: 'fold', freq: callGood ? 0 : 1 })
    options.push({ label: 'Raise', kind: 'raise', freq: 0 })
    notes.push(`Pot odds: need ${(required * 100).toFixed(1)}% equity to call ${fmt(toCall)}bb into ${fmt(pot)}bb; you have ${(eq.equity * 100).toFixed(1)}%.`)
    if (ctx.board.length < 5) notes.push('Before the river, raw equity ignores implied odds and future betting — treat borderline calls with care.')
    notes.push(`MDF vs this bet = ${(mdf * 100).toFixed(0)}% of range; bluff ratio alpha = ${(alpha * 100).toFixed(0)}%.`)
    notes.push('Raising is not modelled by the equity engine.')
    return {
      engine: 'equity',
      confidence: 'approx',
      options,
      bestIndex: callGood ? 0 : 1,
      notes,
      equity: eq.equity,
      potOdds: required,
      scenario: `${n}-way, facing ${fmt(toCall)}bb`,
    }
  }
  // no bet to face: equity information only, not graded
  options.push({ label: 'Check', kind: 'check', freq: 0 })
  options.push({ label: 'Bet', kind: 'bet', freq: 0 })
  notes.push(`Your equity vs ${villains.length} range(s): ${(eq.equity * 100).toFixed(1)}% (fair share ${(100 / n).toFixed(1)}%). Bet/check decisions multiway are shown for information only and are not graded.`)
  return {
    engine: 'equity',
    confidence: 'approx',
    options,
    bestIndex: -1,
    notes,
    equity: eq.equity,
    scenario: `${n}-way, checked to you`,
  }
}

const fmt = (x: number) => (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1))

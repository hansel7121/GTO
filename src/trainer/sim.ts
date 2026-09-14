import { ALL_CARDS, handClass, type Card } from '../domain/cards'
import { EPS, computeState, type HandState } from '../domain/engine'
import { seatsFor, type Seat } from '../domain/positions'
import type { Action, Analysis } from '../domain/types'
import type { ChartResolver } from '../preflop/lookup'
import { grade } from '../scoring/score'
import { TRAINER_CFG, analyzeTrainer } from './analyze30'

export type Rng = () => number

/** Small seeded PRNG (mulberry32) so drills are reproducible in tests. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface TrainerDecision {
  /** Index in `hand.actions` where hero's action was / will be appended. */
  actionIndex: number
  potBb: number
  toCallBb: number
  analysis: Analysis
  chosen?: Action
}

export interface TrainerHand {
  id: number
  heroSeat: Seat
  cards: Record<string, [Card, Card]>
  actions: Action[]
  decisions: TrainerDecision[]
}

export const TRAINER_SEATS: Seat[] = seatsFor(TRAINER_CFG.tableSize)

export function dealHand(rand: Rng, id: number, heroSeat?: Seat): TrainerHand {
  const deck = [...ALL_CARDS]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const cards: Record<string, [Card, Card]> = {}
  TRAINER_SEATS.forEach((s, i) => {
    cards[s] = [deck[i * 2], deck[i * 2 + 1]]
  })
  return {
    id,
    heroSeat: heroSeat ?? TRAINER_SEATS[Math.floor(rand() * TRAINER_SEATS.length)],
    cards,
    actions: [],
    decisions: [],
  }
}

export function stateOf(hand: TrainerHand): HandState {
  return computeState(TRAINER_CFG, 0, hand.actions)
}

/** Clamp a "raise to" amount to something the engine accepts; a raise for the whole stack is an all-in. */
export function legalRaise(state: HandState, seat: Seat, to: number): Action {
  const p = state.players[seat]
  const max = p.committed + p.stack
  if (to >= max - EPS || state.minRaiseTo >= max - EPS) return { seat, kind: 'allin' }
  const amt = Math.max(state.minRaiseTo, Math.min(max, to))
  return { seat, kind: 'raise', amount: Math.round(amt * 100) / 100 }
}

/** Turn a chart option into a legal action for `seat` in `state`. */
export function optionToAction(state: HandState, seat: Seat, kind: Analysis['options'][number]['kind'], amount?: number): Action {
  const p = state.players[seat]
  const toCall = state.currentBet - p.committed
  switch (kind) {
    case 'allin':
      return { seat, kind: 'allin' }
    case 'raise':
    case 'bet':
      return legalRaise(state, seat, amount ?? state.minRaiseTo)
    case 'call':
      return toCall > EPS ? { seat, kind: 'call' } : { seat, kind: 'check' }
    case 'check':
      return toCall > EPS ? { seat, kind: 'fold' } : { seat, kind: 'check' }
    default:
      return toCall > EPS ? { seat, kind: 'fold' } : { seat, kind: 'check' }
  }
}

const PREMIUM = new Set(['AA', 'KK', 'QQ', 'AKs', 'AKo'])

/**
 * A villain's action: sample from the chart frequencies for its spot. Spots with no chart
 * (5-bet trees etc.) fall back to premium-only continuing.
 */
export function botAction(state: HandState, seat: Seat, cards: [Card, Card], actions: Action[], resolve: ChartResolver, rand: Rng): Action {
  const p = state.players[seat]
  const toCall = state.currentBet - p.committed
  const analysis = analyzeTrainer(seat, cards, state, actions, resolve)
  if (analysis.options.length === 0) {
    if (toCall <= EPS) return { seat, kind: 'check' }
    return PREMIUM.has(handClass(cards[0], cards[1])) ? { seat, kind: toCall >= p.stack - EPS ? 'call' : 'allin' } : { seat, kind: 'fold' }
  }
  let r = rand()
  for (const o of analysis.options) {
    r -= o.freq
    if (r <= 0) return optionToAction(state, seat, o.kind, o.amount)
  }
  // rounding remainder: fold (or check when free)
  return optionToAction(state, seat, 'fold')
}

/**
 * Play villains until it is hero's turn (a new decision is appended to `hand.decisions`) or the
 * preflop round is over. Mutates `hand`. Returns the resulting state.
 */
export function advance(hand: TrainerHand, resolve: ChartResolver, rand: Rng): HandState {
  for (let guard = 0; guard < 40; guard++) {
    const state = stateOf(hand)
    if (state.error) throw new Error(state.error)
    if (state.handOver || state.needsBoard || state.street !== 'preflop' || !state.toAct) return state
    if (state.toAct === hand.heroSeat) {
      const last = hand.decisions[hand.decisions.length - 1]
      if (!last || last.actionIndex !== hand.actions.length) {
        const me = state.players[hand.heroSeat]
        hand.decisions.push({
          actionIndex: hand.actions.length,
          potBb: state.pot,
          toCallBb: state.currentBet - me.committed,
          analysis: analyzeTrainer(hand.heroSeat, hand.cards[hand.heroSeat], state, hand.actions, resolve),
        })
      }
      return state
    }
    hand.actions.push(botAction(state, state.toAct, hand.cards[state.toAct], hand.actions, resolve, rand))
  }
  throw new Error('Preflop did not terminate')
}

/** Hero acts: grades the pending decision, appends the action. */
export function heroAct(hand: TrainerHand, action: Action): TrainerDecision {
  const d = hand.decisions[hand.decisions.length - 1]
  if (!d || d.actionIndex !== hand.actions.length) throw new Error('Not hero\'s turn')
  d.chosen = action
  d.analysis = grade(d.analysis, action, d.potBb)
  hand.actions.push(action)
  return d
}

export type Outcome = 'hero-folded' | 'hero-won' | 'all-in' | 'flop'

/** Why the hand is over, once `advance` returns without a pending decision. */
export function outcomeOf(hand: TrainerHand, state: HandState): Outcome {
  if (state.players[hand.heroSeat].folded) return 'hero-folded'
  if (state.handOver && state.playersIn <= 1) return 'hero-won'
  if (Object.values(state.players).some((p) => !p.folded && p.allIn)) return 'all-in'
  return 'flop'
}

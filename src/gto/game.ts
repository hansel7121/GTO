import { ALL_CARDS, handClass, type Card } from '../domain/cards'
import { computeState, seatsIn, type HandState } from '../domain/engine'
import type { Action, Analysis } from '../domain/types'
import { analyzeWithEquity } from '../equity/analyze'
import { rangesFromPreflop } from '../preflop/analyze'
import type { ChartResolver } from '../preflop/lookup'
import { grade } from '../scoring/score'
import { nodeToAnalysis, preflopActionCount } from '../solver/postflop'
import { analyzeTrainer } from '../trainer/analyze30'
import { chartSetFor, engineCfg, trainerSeats } from '../trainer/config'
import type { Rng } from '../trainer/sim'
import type { GtoSettings } from './config'
import { explain, type ExplainCtx } from './explain'
import { asHand, type GtoDecision, type GtoHand } from './hand'
import { handLabel, settle } from './showdown'
import type { PostflopSolver } from './solver'
import { STYLES, type Style } from './style'
import { villainAct } from './villain'

export interface GameDeps {
  resolve: ChartResolver
  rand: Rng
  solver: PostflopSolver | null
  /** Called after every villain action / street deal so the UI can animate. */
  onStep?: () => void | Promise<void>
}

export function cfgOf(hand: GtoHand) {
  return engineCfg({ players: hand.settings.players, stackBb: hand.settings.stackBb })
}

export function dealGtoHand(settings: GtoSettings, rand: Rng, id: number): GtoHand {
  const seats = trainerSeats({ players: settings.players, stackBb: settings.stackBb })
  const deck = [...ALL_CARDS]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const cards: Record<string, [Card, Card]> = {}
  for (const s of seats) cards[s] = [deck.pop()!, deck.pop()!]
  const heroSeat = seats[Math.floor(rand() * seats.length)]
  const styles: Record<string, Style> = {}
  for (const s of seats) {
    if (s === heroSeat) continue
    styles[s] = settings.style === 'mixed' ? STYLES[Math.floor(rand() * STYLES.length)] : settings.style
  }
  return { id, settings, seats, heroSeat, cards, styles, deck, board: [], actions: [], decisions: [] }
}

export function stateOf(hand: GtoHand): HandState {
  return computeState(cfgOf(hand), hand.board.length, hand.actions)
}

/** Pending (unanswered) hero decision, if any. */
export function pending(hand: GtoHand): GtoDecision | undefined {
  const d = hand.decisions[hand.decisions.length - 1]
  return d && !d.chosen && d.actionIndex === hand.actions.length ? d : undefined
}

/**
 * Advance the hand until hero must act or the hand is over: deals streets, lets villains act,
 * builds hero's analysis at the decision point, settles at the end. Mutates `hand`.
 */
export async function runUntilHero(hand: GtoHand, deps: GameDeps): Promise<HandState> {
  for (let guard = 0; guard < 300; guard++) {
    const state = stateOf(hand)
    if (state.error) throw new Error(state.error)
    if (state.handOver) {
      if (!hand.result) finish(hand, state)
      return state
    }
    if (state.needsBoard) {
      const need = hand.board.length === 0 ? 3 : 1
      for (let i = 0; i < need; i++) hand.board.push(hand.deck.pop()!)
      if (hand.board.length === 3) computeRanges(hand, deps.resolve)
      await deps.onStep?.()
      continue
    }
    if (!state.toAct) throw new Error('No player to act')
    if (state.toAct === hand.heroSeat) {
      if (pending(hand)) return state
      const me = state.players[hand.heroSeat]
      hand.decisions.push({
        street: state.street,
        actionIndex: hand.actions.length,
        potBb: state.pot,
        toCallBb: state.currentBet - me.committed,
        analysis: await heroAnalysis(hand, state, deps),
      })
      return state
    }
    hand.actions.push(await villainAct(hand, state, state.toAct, deps))
    await deps.onStep?.()
  }
  throw new Error('Hand did not terminate')
}

function computeRanges(hand: GtoHand, resolve: ChartResolver) {
  const cfg = cfgOf(hand)
  const preflopLen = preflopActionCount(cfg, asHand(hand))
  const preflopActions = hand.actions.slice(0, preflopLen)
  const stFlop = computeState(cfg, 3, preflopActions)
  const lr = rangesFromPreflop(hand.settings.players, preflopActions, seatsIn(stFlop), resolve, chartSetFor(hand.settings.stackBb))
  hand.ranges = lr.ranges
  hand.rangeNotes = lr.notes
}

async function heroAnalysis(hand: GtoHand, state: HandState, deps: GameDeps): Promise<Analysis> {
  const hero = hand.heroSeat
  const cards = hand.cards[hero]
  if (state.street === 'preflop') {
    return analyzeTrainer({ players: hand.settings.players, stackBb: hand.settings.stackBb }, hero, cards, state, hand.actions, deps.resolve)
  }
  if (!hand.ranges) computeRanges(hand, deps.resolve)
  if (deps.solver) {
    const villain = seatsIn(state).find((s) => s !== hero)
    const solved = await deps.solver.query(hand, hand.actions.length, [
      { seat: hero, cards },
      ...(villain ? [{ seat: villain, cards: hand.cards[villain] }] : []),
    ])
    if (solved) {
      const a = nodeToAnalysis(solved.outcome, solved.spot, { heroCards: cards })
      a.notes.push(...solved.notes)
      if (solved.fromStreet !== 'flop') {
        a.confidence = 'approx'
        a.provisional = true
      }
      if (hand.rangeNotes?.length) {
        a.confidence = 'approx'
        a.notes.push(...hand.rangeNotes)
      }
      return a
    }
  }
  const eq = analyzeWithEquity({
    hero,
    heroCards: cards,
    board: hand.board,
    state,
    ranges: hand.ranges!,
    rangeNotes: hand.rangeNotes ?? [],
    playersAtFlop: hand.ranges!.size,
  })
  if (seatsIn(state).length === 2) {
    eq.notes = eq.notes.filter((n) => !n.includes('no public GTO solution exists for multiway'))
    eq.notes.unshift(deps.solver ? 'Quick mode: flop graded by equity / pot odds; turn and river are solved.' : 'Solver off: equity / pot-odds estimate only.')
  }
  return eq
}

/** Hero acts: grades the pending decision, writes the explanation, appends the action. */
export async function heroAct(hand: GtoHand, action: Action, deps: GameDeps): Promise<GtoDecision> {
  const d = pending(hand)
  if (!d) throw new Error("Not hero's turn")
  d.chosen = action
  d.analysis = grade(d.analysis, action, d.potBb)
  if (d.analysis.correct === false) {
    const state = stateOf(hand)
    const best = d.analysis.options[d.analysis.bestIndex]
    let villainFold: number | null = null
    if (deps.solver && (best.kind === 'bet' || best.kind === 'raise') && d.street !== 'preflop') {
      villainFold = await deps.solver.foldPctAfter(hand, hand.actions.length, { seat: hand.heroSeat, kind: best.kind, amount: best.amount })
    }
    const ctx: ExplainCtx = {
      street: d.street,
      cls: handClass(hand.cards[hand.heroSeat][0], hand.cards[hand.heroSeat][1]),
      handLabel: handLabel(hand.cards[hand.heroSeat], hand.board),
      potBb: d.potBb,
      toCallBb: d.toCallBb,
      stackBb: state.players[hand.heroSeat].stack,
      villainFoldPct: villainFold,
      players: seatsIn(state).length,
    }
    d.explanation = explain(d.analysis, ctx)
  }
  hand.actions.push(action)
  return d
}

function finish(hand: GtoHand, state: HandState) {
  const pay = settle(state, hand.cards, hand.board)
  const hero = state.players[hand.heroSeat]
  const live = seatsIn(state)
  hand.result = {
    heroNetBb: Math.round(((pay.paid[hand.heroSeat] ?? 0) - hero.total) * 100) / 100,
    winners: pay.winners,
    showdown: pay.showdown,
    potBb: state.pot,
    shown: pay.showdown ? live.map((s) => ({ seat: s, label: handLabel(hand.cards[s], hand.board) })) : [],
  }
}


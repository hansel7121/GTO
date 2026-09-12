import { cardToString, pairIndex, type Card } from '../domain/cards'
import { computeState, type EngineConfig, type HandState } from '../domain/engine'
import { postflopOrder, type Seat } from '../domain/positions'
import type { Action, Analysis, AnalysisOption, Hand, Settings, Street } from '../domain/types'
import { rangeToRaw, type Range } from '../preflop/range'
import { solveAndQuery, type SolveOutcome } from './client'
import type { LineStep, SolveConfig, SolveProgress } from './worker'

/** Solver chips per big blind. */
export const CHIPS_PER_BB = 100
export const toChips = (bb: number) => Math.round(bb * CHIPS_PER_BB)
export const toBb = (chips: number) => chips / CHIPS_PER_BB

export interface PostflopSpot {
  hero: Seat
  villain: Seat
  heroIsOop: boolean
  startingPotBb: number
  effectiveStackBb: number
  flop: Card[]
}

/** Pot, stacks and first action index at the start of a postflop street. */
export interface StreetStart {
  street: Street
  actionIndex: number
  potBb: number
  effectiveStackBb: number
}

export function streetStart(cfg: EngineConfig, hand: Hand, street: Street, actionsUpTo: number): StreetStart | null {
  for (let i = 0; i <= actionsUpTo; i++) {
    const st = computeState(cfg, hand.board.length, hand.actions.slice(0, i))
    if (st.street === street && !st.error) {
      const inHand = Object.values(st.players).filter((p) => !p.folded)
      return { street, actionIndex: i, potBb: st.pot, effectiveStackBb: Math.min(...inHand.map((p) => p.stack)) }
    }
  }
  return null
}

/**
 * Identify the heads-up postflop spot from the hand (exactly two players saw the flop).
 * Returns null when the pot is multiway.
 */
export function postflopSpot(cfg: EngineConfig, hand: Hand, actionsUpTo: number): PostflopSpot | null {
  // state at the end of preflop
  const preflopLen = preflopActionCount(cfg, hand, actionsUpTo)
  const st = computeState(cfg, 3, hand.actions.slice(0, preflopLen))
  const inHand = Object.values(st.players).filter((p) => !p.folded)
  if (inHand.length !== 2 || hand.board.length < 3) return null
  const hero = hand.heroSeat
  const villain = inHand.find((p) => p.seat !== hero)?.seat
  if (!villain) return null
  const order = postflopOrder(hand.tableSize)
  const heroIsOop = order.indexOf(hero) < order.indexOf(villain)
  const pot = inHand.reduce((a, p) => a + p.total, 0) + Object.values(st.players).filter((p) => p.folded).reduce((a, p) => a + p.total, 0)
  const eff = Math.min(...inHand.map((p) => p.stack))
  return { hero, villain, heroIsOop, startingPotBb: pot, effectiveStackBb: eff, flop: hand.board.slice(0, 3) }
}

/** Number of leading actions in the log that belong to preflop. */
export function preflopActionCount(cfg: EngineConfig, hand: Hand, upTo = hand.actions.length): number {
  const n = Math.min(upTo, hand.actions.length)
  for (let i = 1; i <= n; i++) {
    const st = computeState(cfg, 0, hand.actions.slice(0, i))
    if (st.roundComplete || st.handOver) return i
  }
  return n
}

/** Convert the postflop actions (after preflop) into solver line steps including chance deals. */
export function buildLine(cfg: EngineConfig, hand: Hand, actionsUpTo: number, from?: StreetStart): LineStep[] {
  const preflopLen = from ? from.actionIndex : preflopActionCount(cfg, hand, actionsUpTo)
  const steps: LineStep[] = []
  // replay to find street boundaries
  let prevStreet: string = from ? from.street : 'flop'
  for (let i = preflopLen; i < actionsUpTo; i++) {
    const stBefore = computeState(cfg, hand.board.length, hand.actions.slice(0, i))
    const streetBefore = stBefore.street
    if (streetBefore !== prevStreet) {
      if (streetBefore === 'turn') steps.push({ kind: 'D', card: hand.board[3] })
      if (streetBefore === 'river') {
        if (prevStreet === 'flop') steps.push({ kind: 'D', card: hand.board[3] })
        steps.push({ kind: 'D', card: hand.board[4] })
      }
      prevStreet = streetBefore
    }
    const a = hand.actions[i]
    steps.push(actionStep(a, stBefore))
  }
  // if the decision itself is on a later street than the last action, deal the cards
  const stNow = computeState(cfg, hand.board.length, hand.actions.slice(0, actionsUpTo))
  if (stNow.street !== prevStreet) {
    if (stNow.street === 'turn' && prevStreet === 'flop') steps.push({ kind: 'D', card: hand.board[3] })
    if (stNow.street === 'river') {
      if (prevStreet === 'flop') steps.push({ kind: 'D', card: hand.board[3] })
      steps.push({ kind: 'D', card: hand.board[4] })
    }
  }
  return steps
}

function actionStep(a: Action, before: HandState): LineStep {
  switch (a.kind) {
    case 'check': return { kind: 'X' }
    case 'call': return { kind: 'C' }
    case 'fold': return { kind: 'F' }
    case 'bet': return { kind: 'B', amount: toChips(a.amount ?? 0) }
    case 'raise': return { kind: 'R', amount: toChips(a.amount ?? 0) }
    case 'allin': {
      const p = before.players[a.seat]
      const total = p.committed + p.stack
      return { kind: 'A', amount: toChips(total) }
    }
  }
}

export interface CfrRequest {
  cfg: EngineConfig
  hand: Hand
  actionsUpTo: number // hero decision point: analyse the node reached after these actions
  /** When true, hand.actions[actionsUpTo] (hero's chosen action) is added to the tree as well. */
  includeChosen?: boolean
  /** Solve from the flop (exact) or from the street of the decision (fast, ranges not narrowed). */
  from?: 'flop' | 'street'
  ranges: Map<Seat, Range>
  settings: Settings
  onProgress: (p: SolveProgress) => void
}

export interface CfrResult {
  analysis: Analysis
  outcome: SolveOutcome
  spot: PostflopSpot
}

/** Run (or reuse) the CFR solve for the hand and return hero's strategy at the decision node. */
export async function analyzeWithCfr(req: CfrRequest): Promise<CfrResult> {
  const spot = postflopSpot(req.cfg, req.hand, req.actionsUpTo)
  if (!spot) throw new Error('Not a heads-up pot')
  const heroRange = req.ranges.get(spot.hero)
  const villainRange = req.ranges.get(spot.villain)
  if (!heroRange || !villainRange) throw new Error('Missing ranges')
  const stNow = computeState(req.cfg, req.hand.board.length, req.hand.actions.slice(0, req.actionsUpTo))
  const decisionStreet = stNow.street
  const fromStreet = req.from === 'street' && decisionStreet !== 'flop' ? streetStart(req.cfg, req.hand, decisionStreet, req.actionsUpTo) : null
  const boardLen = fromStreet ? (fromStreet.street === 'turn' ? 4 : 5) : 3
  const board = req.hand.board.slice(0, boardLen)
  const dead = [...req.hand.board]
  const heroRaw = rangeToRaw(heroRange, dead)
  const villainRaw = rangeToRaw(villainRange, dead)
  const extraNotes: string[] = []
  const hc = req.hand.heroCards!
  const heroIdx = pairIndex(hc[0], hc[1])
  if (heroRaw[heroIdx] <= 0) {
    // hero's actual holding is outside the chart range: add it with a tiny weight so the solver
    // still produces a (best-response quality) strategy for it without moving the equilibrium
    heroRaw[heroIdx] = 0.02
    extraNotes.push('Your hand is outside the preflop range for this line; it was added with a tiny weight so the solver could still grade it (best-response quality).')
  }
  if (fromStreet) {
    extraNotes.push(`Quick mode: solved from the ${fromStreet.street} with preflop ranges (not narrowed by earlier streets). Re-grade with the full solver for an exact answer.`)
  }
  const cfgSolve: SolveConfig = {
    oopRange: spot.heroIsOop ? heroRaw : villainRaw,
    ipRange: spot.heroIsOop ? villainRaw : heroRaw,
    board: new Uint8Array(board),
    startingPot: toChips(fromStreet ? fromStreet.potBb : spot.startingPotBb),
    effectiveStack: toChips(fromStreet ? fromStreet.effectiveStackBb : spot.effectiveStackBb),
    flopBet: req.settings.flopBetSizes,
    flopRaise: req.settings.raiseSizes,
    turnBet: req.settings.turnBetSizes,
    turnRaise: req.settings.raiseSizes,
    riverBet: req.settings.riverBetSizes,
    riverRaise: req.settings.raiseSizes,
    addedLines: '',
    targetExploitPct: req.settings.solverTargetExploitPct,
    timeBudgetMs: req.settings.solverTimeBudgetSec * 1000,
    maxIterations: 5000,
    maxRaises: req.settings.maxRaises,
  }
  const extend = req.includeChosen && req.hand.actions.length > req.actionsUpTo ? 1 : 0
  const line = buildLine(req.cfg, req.hand, req.actionsUpTo + extend, fromStreet ?? undefined)
  const outcome = await solveAndQuery(cfgSolve, line, req.onProgress, req.settings.threads, extend)
  const analysis = nodeToAnalysis(outcome, spot, req.hand)
  analysis.notes.push(...extraNotes)
  if (fromStreet) {
    analysis.confidence = 'approx'
    analysis.provisional = true
  }
  return { analysis, outcome, spot }
}

function nodeToAnalysis(outcome: SolveOutcome, spot: PostflopSpot, hand: Hand): Analysis {
  const node = outcome.node
  const notes: string[] = []
  const heroPlayer = spot.heroIsOop ? 'oop' : 'ip'
  if (node.player !== heroPlayer) {
    return {
      engine: 'cfr',
      confidence: 'approx',
      options: [],
      bestIndex: -1,
      notes: [`Solver node belongs to ${node.player}, not hero (${heroPlayer}). Check the action log.`],
    }
  }
  const heroCards = hand.heroCards!
  const key1 = cardToString(heroCards[0]) + cardToString(heroCards[1])
  const key2 = cardToString(heroCards[1]) + cardToString(heroCards[0])
  const idx = node.hands.findIndex((h) => h === key1 || h === key2)
  if (idx < 0) {
    return {
      engine: 'cfr',
      confidence: 'approx',
      options: [],
      bestIndex: -1,
      notes: ['Hero hand is not in the preflop range used for this line (0 combos), so the solver has no strategy for it. Widen the chart or import your own ranges.'],
      exploitability: outcome.exploitabilityPct,
    }
  }
  const options: AnalysisOption[] = node.actions.map((a, ai) => {
    const [k, v] = a.split(':')
    const amountBb = toBb(Number(v))
    const kind = k === 'Fold' ? 'fold' : k === 'Check' ? 'check' : k === 'Call' ? 'call' : k === 'Bet' ? 'bet' : k === 'Raise' ? 'raise' : 'allin'
    const potBb = toBb(node.pot)
    const label =
      kind === 'fold' ? 'Fold' : kind === 'check' ? 'Check' : kind === 'call' ? 'Call'
        : kind === 'allin' ? `All-in ${fmt(amountBb)}bb`
        : `${kind === 'bet' ? 'Bet' : 'Raise to'} ${fmt(amountBb)}bb (${Math.round((amountBb / potBb) * 100)}% pot)`
    return {
      label,
      kind,
      amount: kind === 'fold' || kind === 'check' || kind === 'call' ? undefined : amountBb,
      freq: node.strategy[ai]?.[idx] ?? 0,
      ev: node.evs[ai] ? toBb(node.evs[ai][idx]) : undefined,
    }
  })
  let bestIndex = 0
  for (let i = 1; i < options.length; i++) {
    const a = options[i].ev ?? -Infinity
    const b = options[bestIndex].ev ?? -Infinity
    if (a > b) bestIndex = i
  }
  if (outcome.exploitabilityPct > 2) notes.push(`Solver stopped at ${outcome.exploitabilityPct.toFixed(1)}% pot exploitability (time budget). Increase the budget in Settings for a tighter solution.`)
  if (node.empty) notes.push('One range is empty at this node — results unreliable.')
  return {
    engine: 'cfr',
    confidence: 'gto',
    options,
    bestIndex,
    notes,
    exploitability: outcome.exploitabilityPct,
    equity: node.equity[idx],
    source: 'https://github.com/b-inary/postflop-solver',
    scenario: `${spot.heroIsOop ? 'OOP' : 'IP'} vs ${spot.villain}`,
  }
}

const fmt = (x: number) => (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1))

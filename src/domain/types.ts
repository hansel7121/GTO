import type { Card } from './cards'
import type { Seat } from './positions'

export type Street = 'preflop' | 'flop' | 'turn' | 'river'
export const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river']

export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'

/** One action in the log. `amount` is the total put in on this street (bb), for bet/raise/allin. */
export interface Action {
  seat: Seat
  kind: ActionKind
  amount?: number
}

export interface Session {
  id: string
  createdAt: number
  name: string
  sb: number
  bb: number
  straddle: number // 0 = none, otherwise the straddle amount in currency
  tableSize: number
  stackDepthBb: number
  currency: string
  notes?: string
}

export type Engine = 'preflop-chart' | 'cfr' | 'equity' | 'none'
export type Confidence = 'gto' | 'approx'

export interface AnalysisOption {
  /** Canonical action label, e.g. "Fold", "Call", "Raise 2.5bb", "Bet 33%" */
  label: string
  kind: ActionKind
  amount?: number // bb (total for the street)
  freq: number // 0..1
  ev?: number // bb, hero's EV for taking this action
}

export interface Analysis {
  engine: Engine
  confidence: Confidence
  options: AnalysisOption[]
  bestIndex: number
  /** Index in `options` matching what hero actually did (set once the hero action is chosen). */
  chosenIndex?: number
  evLossBb?: number
  correct?: boolean
  notes: string[]
  source?: string
  exploitability?: number // % of pot, CFR only
  /** True for quick on-the-spot results that a full flop solve should replace later. */
  provisional?: boolean
  equity?: number // hero equity 0..1 when known
  potOdds?: number // required equity to call
  scenario?: string
}

export interface Decision {
  id: string
  street: Street
  /** Index into hand.actions where hero's action was (or will be) appended. */
  actionIndex: number
  potBb: number
  toCallBb: number
  analysis?: Analysis
  chosen?: Action
}

export interface Hand {
  id: string
  sessionId: string
  createdAt: number
  handNo: number
  tableSize: number
  straddle: boolean
  heroSeat: Seat
  heroCards: [Card, Card] | null
  board: Card[]
  actions: Action[]
  decisions: Decision[]
  note?: string
  result?: number // hero net result in bb, optional
  /** "Ask Claude" conversation about this hand (saved so it can be re-read offline). */
  coach?: CoachTurn[]
}

/** One message in the "Ask Claude" conversation about a hand. */
export interface CoachTurn {
  role: 'user' | 'assistant'
  text: string
  at: number
  model?: string
  /** True when the reply was cut off (connection lost, cancelled, error). */
  partial?: boolean
}

/** One graded decision from the preflop trainer. */
export interface Drill {
  id: string
  createdAt: number
  heroSeat: Seat
  cls: string // 169-hand class, e.g. "AKs"
  scenario: string // e.g. "VS_RFI vs BTN"
  chosen: string // option label hero picked
  best: string // highest-frequency option label
  correct: boolean
}

/** One graded decision from the full-hand GTO trainer. */
export interface GtoDecisionRow {
  id: string
  createdAt: number
  handId: string
  street: Street
  scenario: string
  engine: Engine
  correct: boolean
  evLossBb: number
}

/** One finished hand from the full-hand GTO trainer. */
export interface GtoHandRow {
  id: string
  createdAt: number
  players: number
  stackBb: number
  heroSeat: Seat
  netBb: number
}

export interface RangeOverride {
  id: string // chart key
  actions: { raise?: string; call?: string; allin?: string; limp?: string }
  updatedAt: number
}

export interface Settings {
  id: 'settings'
  solverTimeBudgetSec: number
  solverTargetExploitPct: number
  flopBetSizes: string
  turnBetSizes: string
  riverBetSizes: string
  raiseSizes: string
  showBb: boolean
  threads: number
  /** full = always solve from the flop; street = solve from the current street (turn/river) and use equity on the flop; off = equity only */
  solverMode: 'auto' | 'full' | 'street' | 'off'
  maxRaises: number
  /** Anthropic API key for "Ask Claude" hand explanations (stored on this device only). */
  claudeApiKey: string
  claudeModel: string
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  solverTimeBudgetSec: 90,
  solverTargetExploitPct: 0.5,
  flopBetSizes: '33%',
  turnBetSizes: '75%',
  riverBetSizes: '75%',
  raiseSizes: '2.5x',
  showBb: false,
  threads: 0,
  solverMode: 'auto',
  maxRaises: 1,
  claudeApiKey: '',
  claudeModel: 'claude-opus-5',
}

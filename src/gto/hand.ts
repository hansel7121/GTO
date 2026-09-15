import type { Card } from '../domain/cards'
import type { Seat } from '../domain/positions'
import type { Action, Analysis, Hand, Street } from '../domain/types'
import type { Range } from '../preflop/range'
import type { GtoSettings } from './config'
import type { Style } from './style'

export interface GtoDecision {
  street: Street
  /** Index in `hand.actions` where hero's action was / will be appended. */
  actionIndex: number
  potBb: number
  toCallBb: number
  analysis: Analysis
  chosen?: Action
  /** Why the better option was better (only when graded as a mistake). */
  explanation?: string
}

export interface HandResult {
  heroNetBb: number
  winners: Seat[]
  showdown: boolean
  potBb: number
  /** Best hand description per shown player at showdown. */
  shown: { seat: Seat; label: string }[]
}

export interface GtoHand {
  id: number
  settings: GtoSettings
  seats: Seat[]
  heroSeat: Seat
  cards: Record<string, [Card, Card]>
  styles: Record<string, Style>
  /** Undealt cards, top of the deck last. */
  deck: Card[]
  board: Card[]
  actions: Action[]
  decisions: GtoDecision[]
  /** Preflop ranges implied by the line, computed once the flop is dealt. */
  ranges?: Map<Seat, Range>
  rangeNotes?: string[]
  result?: HandResult
}

/** The logger's `Hand` shape, which the solver helpers take. */
export function asHand(h: GtoHand): Hand {
  return {
    id: String(h.id),
    sessionId: 'gto-trainer',
    createdAt: 0,
    handNo: h.id,
    tableSize: h.settings.players,
    straddle: false,
    heroSeat: h.heroSeat,
    heroCards: h.cards[h.heroSeat],
    board: h.board,
    actions: h.actions,
    decisions: [],
  }
}

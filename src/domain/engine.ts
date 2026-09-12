import { blindFor, postflopOrder, preflopOrder, type Seat } from './positions'
import type { Action, Street } from './types'

export interface EngineConfig {
  tableSize: number
  stackBb: number
  straddleBb: number // 0 = no straddle
}

export interface PlayerState {
  seat: Seat
  stack: number // remaining, bb
  committed: number // this street, bb
  total: number // whole hand, bb
  folded: boolean
  allIn: boolean
}

export interface StreetSummary {
  street: Street
  actions: Action[]
  potAtStart: number
  aggressor: Seat | null
}

export interface HandState {
  street: Street
  players: Record<string, PlayerState>
  order: Seat[]
  toAct: Seat | null
  currentBet: number
  minRaiseTo: number
  pot: number // everything committed so far (all streets)
  roundComplete: boolean
  handOver: boolean
  /** Number of players who have not folded. */
  playersIn: number
  /** Street summaries consumed so far (including the current one, possibly partial). */
  streets: StreetSummary[]
  lastAggressor: Seat | null
  /** True when the next thing needed is board cards, not an action. */
  needsBoard: boolean
  error?: string
}

export const EPS = 1e-9

function streetForBoard(boardLen: number): Street {
  if (boardLen >= 5) return 'river'
  if (boardLen === 4) return 'turn'
  if (boardLen === 3) return 'flop'
  return 'preflop'
}

export function nextStreet(s: Street): Street | null {
  return s === 'preflop' ? 'flop' : s === 'flop' ? 'turn' : s === 'turn' ? 'river' : null
}

/**
 * Replays the action log and returns the resulting state.
 * Amounts are in bb; `bet`/`raise`/`allin` carry the total for the street ("raise to").
 */
export function computeState(cfg: EngineConfig, boardLen: number, actions: Action[]): HandState {
  const seats = preflopOrder(cfg.tableSize, false)
  const players: Record<string, PlayerState> = {}
  for (const seat of seats) {
    players[seat] = { seat, stack: cfg.stackBb, committed: 0, total: 0, folded: false, allIn: false }
  }
  const put = (seat: Seat, amount: number) => {
    const p = players[seat]
    const add = Math.min(amount, p.stack)
    p.stack -= add
    p.committed += add
    p.total += add
    if (p.stack <= EPS) p.allIn = true
  }
  // blinds
  for (const seat of seats) {
    const b = blindFor(cfg.tableSize, seat)
    if (b > 0) put(seat, b)
  }
  const straddler = cfg.straddleBb > 0 && cfg.tableSize >= 3 ? seats[0] : null
  if (straddler) put(straddler, cfg.straddleBb)

  let street: Street = 'preflop'
  let order = preflopOrder(cfg.tableSize, !!straddler)
  let currentBet = Math.max(...seats.map((s) => players[s].committed))
  let minRaiseTo = currentBet * 2
  let lastRaiseSize = currentBet
  let needToAct = new Set<Seat>(order.filter((s) => !players[s].allIn))
  let cursor = 0 // index in order of the next player to act
  let lastAggressor: Seat | null = null
  const streets: StreetSummary[] = [{ street, actions: [], potAtStart: 0, aggressor: null }]
  let handOver = false
  let error: string | undefined

  const activeNotAllIn = () => seats.filter((s) => !players[s].folded && !players[s].allIn)
  const playersIn = () => seats.filter((s) => !players[s].folded).length
  const potTotal = () => seats.reduce((a, s) => a + players[s].total, 0)

  const findToAct = (): Seat | null => {
    for (let i = 0; i < order.length; i++) {
      const s = order[(cursor + i) % order.length]
      if (needToAct.has(s) && !players[s].folded && !players[s].allIn) {
        cursor = (cursor + i) % order.length
        return s
      }
    }
    return null
  }

  const roundIsComplete = () => {
    if (playersIn() <= 1) return true
    // nobody left who still needs to act
    for (const s of needToAct) if (!players[s].folded && !players[s].allIn) return false
    return true
  }

  const startStreet = (s: Street) => {
    street = s
    for (const seat of seats) players[seat].committed = 0
    order = postflopOrder(cfg.tableSize)
    currentBet = 0
    minRaiseTo = 1
    lastRaiseSize = 1
    // if fewer than two players can still bet there is no betting round on this street
    needToAct = activeNotAllIn().length >= 2 ? new Set(activeNotAllIn()) : new Set()
    cursor = 0
    streets.push({ street: s, actions: [], potAtStart: potTotal(), aggressor: null })
  }

  const targetStreet = streetForBoard(boardLen)

  for (let i = 0; i < actions.length; i++) {
    const a = actions[i]
    if (handOver) { error = `Action after hand over (#${i + 1})`; break }
    // advance streets if the current round is complete
    while (roundIsComplete() && !handOver) {
      if (playersIn() <= 1) { handOver = true; break }
      const ns = nextStreet(street)
      if (!ns) { handOver = true; break }
      const streetIdx = ['preflop', 'flop', 'turn', 'river'].indexOf(ns)
      const targetIdx = ['preflop', 'flop', 'turn', 'river'].indexOf(targetStreet)
      if (streetIdx > targetIdx) { error = `Board cards needed before action #${i + 1}`; break }
      startStreet(ns)
      // everyone all-in except at most one: no more betting, keep dealing
    }
    if (error || handOver) { if (!error) error = `Action after hand over (#${i + 1})`; break }

    const p = players[a.seat]
    if (!p) { error = `Unknown seat ${a.seat}`; break }
    if (p.folded || p.allIn) { error = `${a.seat} cannot act (#${i + 1})`; break }
    const expected = findToAct()
    if (expected !== a.seat) { error = `Expected ${expected} to act, got ${a.seat} (#${i + 1})`; break }

    const toCall = currentBet - p.committed
    switch (a.kind) {
      case 'fold':
        p.folded = true
        break
      case 'check':
        if (toCall > EPS) { error = `${a.seat} cannot check facing a bet (#${i + 1})`; }
        break
      case 'call':
        put(a.seat, toCall)
        break
      case 'bet':
      case 'raise':
      case 'allin': {
        let to = a.kind === 'allin' ? p.committed + p.stack : (a.amount ?? 0)
        if (to > p.committed + p.stack + EPS) to = p.committed + p.stack
        if (to <= currentBet + EPS && a.kind !== 'allin') { error = `${a.seat} ${a.kind} must exceed ${currentBet}bb (#${i + 1})`; break }
        const raiseSize = to - currentBet
        put(a.seat, to - p.committed)
        if (to > currentBet + EPS) {
          // a short all-in that is less than a full raise does not reopen action; we still treat
          // it as re-opening for simplicity of live logging (rare in deep games)
          if (raiseSize >= lastRaiseSize - EPS || a.kind !== 'allin') lastRaiseSize = Math.max(raiseSize, lastRaiseSize)
          currentBet = to
          minRaiseTo = currentBet + lastRaiseSize
          lastAggressor = a.seat
          streets[streets.length - 1].aggressor = a.seat
          needToAct = new Set(activeNotAllIn().filter((s) => s !== a.seat))
        }
        break
      }
    }
    if (error) break
    needToAct.delete(a.seat)
    streets[streets.length - 1].actions.push(a)
    cursor = (order.indexOf(a.seat) + 1) % order.length
    if (playersIn() <= 1) handOver = true
  }

  // after replay: determine whether we need board cards or the round can advance
  let needsBoard = false
  if (!handOver && !error && roundIsComplete()) {
    if (playersIn() <= 1) handOver = true
    else {
      const ns = nextStreet(street)
      if (!ns) handOver = true
      else {
        const streetIdx = ['preflop', 'flop', 'turn', 'river'].indexOf(ns)
        const targetIdx = ['preflop', 'flop', 'turn', 'river'].indexOf(targetStreet)
        if (streetIdx > targetIdx) needsBoard = true
        else {
          startStreet(ns)
          // all-in situations: keep asking for cards until the river is out
          while (roundIsComplete() && !handOver) {
            const n2 = nextStreet(street)
            if (!n2) { handOver = true; break }
            const s2 = ['preflop', 'flop', 'turn', 'river'].indexOf(n2)
            if (s2 > targetIdx) { needsBoard = true; break }
            startStreet(n2)
          }
        }
      }
    }
  }

  const toAct = handOver || error || needsBoard ? null : findToAct()
  return {
    street,
    players,
    order,
    toAct,
    currentBet,
    minRaiseTo,
    pot: potTotal(),
    roundComplete: roundIsComplete(),
    handOver,
    playersIn: playersIn(),
    streets,
    lastAggressor,
    needsBoard,
    error,
  }
}

/** Effective stack between hero and the biggest remaining opponent stack, in bb. */
export function effectiveStack(state: HandState, hero: Seat): number {
  const h = state.players[hero]
  const opp = Object.values(state.players)
    .filter((p) => p.seat !== hero && !p.folded)
    .map((p) => p.stack + p.committed)
  if (opp.length === 0) return h.stack + h.committed
  return Math.min(h.stack + h.committed, Math.max(...opp))
}

/** Players still in the hand (not folded). */
export function seatsIn(state: HandState): Seat[] {
  return Object.values(state.players).filter((p) => !p.folded).map((p) => p.seat)
}

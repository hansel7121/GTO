import { cardCodes, evaluateCardCodes, handRank, rankDescription } from 'phe'
import { ALL_CARDS, RANKS, cardToString, rankOf, suitOf, type Card } from '../domain/cards'
import type { HandState } from '../domain/engine'
import type { Seat } from '../domain/positions'

const PHE: number[] = cardCodes(ALL_CARDS.map(cardToString))

/** phe strength (lower = stronger) of the best 5-card hand from hole cards + board. */
export function strength(cards: [Card, Card], board: Card[]): number {
  return evaluateCardCodes([...board, ...cards].map((c) => PHE[c]))
}

/** Short description of the made hand, e.g. "top pair", "flush draw", "two pair". */
export function handLabel(cards: [Card, Card], board: Card[]): string {
  if (board.length < 3) return ''
  const s = strength(cards, board)
  const cat = rankDescription[handRank(s)].toLowerCase()
  const boardRanks = board.map(rankOf)
  const hi = Math.max(...boardRanks)
  const r1 = rankOf(cards[0])
  const r2 = rankOf(cards[1])
  const draws: string[] = []
  if (board.length < 5) {
    const all = [...cards, ...board]
    const suits = [0, 0, 0, 0]
    for (const c of all) suits[suitOf(c)]++
    if (suits.some((n) => n === 4) && cat !== 'flush') draws.push('flush draw')
    const rs = new Set(all.map(rankOf))
    if (rs.has(12)) rs.add(-1) // wheel ace
    let straightDraw = false
    for (let lo = -1; lo <= 8 && !straightDraw; lo++) {
      let n = 0
      for (let r = lo; r < lo + 5; r++) if (rs.has(r)) n++
      if (n === 4 && !cat.includes('straight')) straightDraw = true
    }
    if (straightDraw) draws.push('straight draw')
  }
  let made = cat
  if (cat === 'one pair') {
    if (r1 === r2) made = r1 > hi ? 'overpair' : r1 === hi ? 'top pair (set-less)' : 'pocket pair below top card'
    else if (r1 === hi || r2 === hi) made = 'top pair'
    else if (boardRanks.includes(r1) || boardRanks.includes(r2)) made = 'middle/bottom pair'
    else made = 'paired board, no pair of your own'
    if (r1 === r2 && r1 === hi) made = 'top pair'
  } else if (cat === 'high card') {
    made = `${RANKS[Math.max(r1, r2)]}-high`
  } else if (cat === 'three of a kind') {
    made = r1 === r2 ? 'set' : 'trips'
  }
  return draws.length ? `${made} + ${draws.join(' + ')}` : made
}

export interface Payout {
  winners: Seat[]
  /** Amount each seat receives (bb). */
  paid: Record<string, number>
  showdown: boolean
}

/** Award the pot(s): everyone folded → last player; otherwise showdown with side pots by committed amount. */
export function settle(state: HandState, cards: Record<string, [Card, Card]>, board: Card[]): Payout {
  const players = Object.values(state.players)
  const live = players.filter((p) => !p.folded)
  const paid: Record<string, number> = {}
  for (const p of players) paid[p.seat] = 0
  if (live.length === 1) {
    paid[live[0].seat] = state.pot
    return { winners: [live[0].seat], paid, showdown: false }
  }
  // side pots: sort distinct committed totals; each level is contested by everyone who put in at least that much
  const levels = [...new Set(players.map((p) => p.total))].filter((t) => t > 0).sort((a, b) => a - b)
  const str = new Map(live.map((p) => [p.seat, strength(cards[p.seat], board)]))
  let prev = 0
  const winnersAll = new Set<Seat>()
  for (const lvl of levels) {
    let pot = 0
    for (const p of players) pot += Math.max(0, Math.min(p.total, lvl) - prev)
    const eligible = live.filter((p) => p.total >= lvl)
    if (eligible.length === 0 || pot <= 0) {
      prev = lvl
      continue
    }
    const best = Math.min(...eligible.map((p) => str.get(p.seat)!))
    const ws = eligible.filter((p) => str.get(p.seat) === best)
    for (const w of ws) {
      paid[w.seat] += pot / ws.length
      winnersAll.add(w.seat)
    }
    prev = lvl
  }
  return { winners: [...winnersAll], paid, showdown: true }
}

// Equity calculation: hero hand vs. N weighted villain ranges on a given board.
// Hand strength comes from `phe` (Cactus-Kev perfect-hash evaluator; smaller value = stronger).
import { cardCodes, evaluateCardCodes } from 'phe'
import { ALL_CARDS, cardToString, type Card } from '../domain/cards'
import { rangeCombos, type Range } from '../preflop/range'

// phe card code for each of our 52 card ids, built through phe's own string parser
// (its suit ordering differs from ours).
const PHE: number[] = cardCodes(ALL_CARDS.map(cardToString))

export interface EquityInput {
  hero: [Card, Card]
  board: Card[]
  villains: Range[]
  iterations?: number
  seed?: number
}

export interface EquityResult {
  equity: number // win + tie share
  win: number
  tie: number
  samples: number
  exact: boolean
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface WeightedCombos {
  cards: [Card, Card][]
  cum: Float64Array // cumulative weights
  total: number
}

function prepare(range: Range, dead: Card[]): WeightedCombos {
  const combos = rangeCombos(range, dead)
  const cards = combos.map((c) => c.cards)
  const cum = new Float64Array(combos.length)
  let acc = 0
  for (let i = 0; i < combos.length; i++) {
    acc += combos[i].w
    cum[i] = acc
  }
  return { cards, cum, total: acc }
}

function sample(wc: WeightedCombos, rnd: () => number): [Card, Card] | null {
  if (wc.total <= 0) return null
  const r = rnd() * wc.total
  // binary search
  let lo = 0
  let hi = wc.cum.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (wc.cum[mid] < r) lo = mid + 1
    else hi = mid
  }
  return wc.cards[lo]
}

/**
 * Monte Carlo equity (exact enumeration of villain combos on the river when there is a single
 * villain). Villain combos are sampled proportionally to their range weights, rejecting card
 * conflicts between villains.
 */
export function computeEquity(input: EquityInput): EquityResult {
  const { hero, board, villains } = input
  const dead = [...hero, ...board]
  const prepared = villains.map((r) => prepare(r, dead))
  if (prepared.some((p) => p.cards.length === 0)) {
    return { equity: 0, win: 0, tie: 0, samples: 0, exact: false }
  }
  const rnd = mulberry32(input.seed ?? 12345)
  const deck: Card[] = []
  for (let c = 0; c < 52; c++) if (!dead.includes(c)) deck.push(c)

  // exact enumeration: river vs one villain
  if (board.length === 5 && villains.length === 1) {
    const heroCodes = [...board, ...hero].map((c) => PHE[c])
    const heroRank = evaluateCardCodes(heroCodes)
    let win = 0
    let tie = 0
    let total = 0
    const p = prepared[0]
    for (let i = 0; i < p.cards.length; i++) {
      const w = p.cum[i] - (i > 0 ? p.cum[i - 1] : 0)
      const v = p.cards[i]
      const vr = evaluateCardCodes([...board, ...v].map((c) => PHE[c]))
      if (heroRank < vr) win += w
      else if (heroRank === vr) tie += w
      total += w
    }
    return { equity: (win + tie / 2) / total, win: win / total, tie: tie / total, samples: p.cards.length, exact: true }
  }

  const iterations = input.iterations ?? 20000
  let win = 0
  let tie = 0
  let samples = 0
  const need = 5 - board.length
  const used = new Set<Card>()
  outer: for (let it = 0; it < iterations; it++) {
    used.clear()
    const vHands: [Card, Card][] = []
    for (const p of prepared) {
      let h: [Card, Card] | null = null
      for (let tries = 0; tries < 20; tries++) {
        const cand = sample(p, rnd)
        if (!cand) continue outer
        if (!used.has(cand[0]) && !used.has(cand[1])) { h = cand; break }
      }
      if (!h) continue outer
      used.add(h[0])
      used.add(h[1])
      vHands.push(h)
    }
    // runout
    const run: Card[] = []
    while (run.length < need) {
      const c = deck[Math.floor(rnd() * deck.length)]
      if (used.has(c) || run.includes(c)) continue
      run.push(c)
    }
    const full = [...board, ...run]
    const fullCodes = full.map((c) => PHE[c])
    const heroRank = evaluateCardCodes([...fullCodes, PHE[hero[0]], PHE[hero[1]]])
    let best = heroRank
    let heroBest = true
    let ties = 0
    for (const v of vHands) {
      const vr = evaluateCardCodes([...fullCodes, PHE[v[0]], PHE[v[1]]])
      if (vr < best) { best = vr; heroBest = false; ties = 0 }
      else if (vr === best) ties++
    }
    samples++
    if (heroBest && ties === 0) win++
    else if (heroBest && ties > 0) tie += 1 / (ties + 1)
  }
  if (samples === 0) return { equity: 0, win: 0, tie: 0, samples: 0, exact: false }
  return { equity: (win + tie) / samples, win: win / samples, tie: tie / samples, samples, exact: false }
}

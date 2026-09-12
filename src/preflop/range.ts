import { RANKS, pairIndex, type Card } from '../domain/cards'

/**
 * Range = weights for the 169 hand classes, keyed by class label ("AKs", "T9o", "77").
 * Parsing follows the postflop-solver / GTO Wizard string grammar:
 *   "66+, A8s+, A5s-A4s, AJo+, KQo:0.5, 76s:0.25"
 * Weighted entries use ":w" (0..1). Later entries do NOT override earlier ones (same as the solver).
 */
export type Range = Map<string, number>

const RANK_INDEX = (c: string) => RANKS.indexOf(c.toUpperCase() as never)

export function classLabel(r1: number, r2: number, suited: 's' | 'o' | ''): string {
  const hi = Math.max(r1, r2)
  const lo = Math.min(r1, r2)
  if (hi === lo) return RANKS[hi] + RANKS[lo]
  return RANKS[hi] + RANKS[lo] + suited
}

/** All 169 class labels. */
export const ALL_CLASSES: string[] = (() => {
  const out: string[] = []
  for (let hi = 12; hi >= 0; hi--) {
    for (let lo = hi; lo >= 0; lo--) {
      if (hi === lo) out.push(classLabel(hi, lo, ''))
      else {
        out.push(classLabel(hi, lo, 's'))
        out.push(classLabel(hi, lo, 'o'))
      }
    }
  }
  return out
})()

function parseSingleton(tok: string): { r1: number; r2: number; s: 's' | 'o' | '' } {
  const m = /^([2-9TJQKA])([2-9TJQKA])([so]?)$/i.exec(tok)
  if (!m) throw new Error(`Bad hand: ${tok}`)
  const r1 = RANK_INDEX(m[1])
  const r2 = RANK_INDEX(m[2])
  const s = m[3].toLowerCase() as 's' | 'o' | ''
  if (r1 === r2 && s) throw new Error(`Pair with suitedness: ${tok}`)
  if (r1 < r2) throw new Error(`Rank order: ${tok}`)
  return { r1, r2, s }
}

function setClass(range: Range, r1: number, r2: number, s: 's' | 'o' | '', w: number) {
  if (r1 === r2) {
    setIfUnset(range, classLabel(r1, r2, ''), w)
  } else if (s === '') {
    setIfUnset(range, classLabel(r1, r2, 's'), w)
    setIfUnset(range, classLabel(r1, r2, 'o'), w)
  } else {
    setIfUnset(range, classLabel(r1, r2, s), w)
  }
}

function setIfUnset(range: Range, key: string, w: number) {
  if (!range.has(key)) range.set(key, w)
}

export function parseRange(str: string): Range {
  const range: Range = new Map()
  const tokens = str
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
  for (const token of tokens) {
    const [hands, weightStr, extra] = token.split(':')
    if (extra !== undefined) throw new Error(`Bad token: ${token}`)
    const w = weightStr === undefined ? 1 : Number(weightStr)
    if (!(w >= 0 && w <= 1)) throw new Error(`Bad weight: ${token}`)
    const h = hands.trim()
    if (h.includes('-')) {
      const [a, b] = h.split('-')
      const A = parseSingleton(a)
      const B = parseSingleton(b)
      if (A.s !== B.s) throw new Error(`Suitedness mismatch: ${token}`)
      const gapA = A.r1 - A.r2
      const gapB = B.r1 - B.r2
      if (gapA === gapB) {
        if (A.r1 < B.r1) throw new Error(`Descending order required: ${token}`)
        for (let i = B.r1; i <= A.r1; i++) setClass(range, i, i - gapA, A.s, w)
      } else if (A.r1 === B.r1) {
        if (A.r2 < B.r2) throw new Error(`Descending order required: ${token}`)
        for (let i = B.r2; i <= A.r2; i++) setClass(range, A.r1, i, A.s, w)
      } else throw new Error(`Bad range: ${token}`)
    } else if (h.endsWith('+')) {
      const A = parseSingleton(h.slice(0, -1))
      const gap = A.r1 - A.r2
      if (gap <= 1) {
        for (let i = A.r1; i < 13; i++) setClass(range, i, i - gap, A.s, w)
      } else {
        for (let i = A.r2; i < A.r1; i++) setClass(range, A.r1, i, A.s, w)
      }
    } else {
      const A = parseSingleton(h)
      setClass(range, A.r1, A.r2, A.s, w)
    }
  }
  return range
}

export function rangeWeight(range: Range, cls: string): number {
  return range.get(cls) ?? 0
}

/** Serialize to a compact solver-compatible string (one entry per class, weighted). */
export function rangeToString(range: Range): string {
  const parts: string[] = []
  for (const cls of ALL_CLASSES) {
    const w = range.get(cls) ?? 0
    if (w <= 0) continue
    parts.push(w >= 1 ? cls : `${cls}:${round3(w)}`)
  }
  return parts.join(',')
}

function round3(x: number) {
  return Math.round(x * 1000) / 1000
}

/** Number of combos in a class. */
export function classCombos(cls: string): number {
  if (cls.length === 2) return 6
  return cls[2] === 's' ? 4 : 12
}

/** Percentage of all 1326 combos in the range (weighted). */
export function rangePercent(range: Range): number {
  let total = 0
  for (const [cls, w] of range) total += classCombos(cls) * w
  return (total / 1326) * 100
}

/**
 * Expand to the 1326-combo weight vector used by postflop-solver (`Range::from_raw_data`).
 * `dead` cards get weight 0.
 */
export function rangeToRaw(range: Range, dead: Card[] = []): Float32Array {
  const raw = new Float32Array(1326)
  const deadSet = new Set(dead)
  for (let c1 = 0; c1 < 52; c1++) {
    for (let c2 = c1 + 1; c2 < 52; c2++) {
      if (deadSet.has(c1) || deadSet.has(c2)) continue
      const r1 = c1 >> 2
      const r2 = c2 >> 2
      const suited = (c1 & 3) === (c2 & 3)
      const cls = r1 === r2 ? classLabel(r1, r2, '') : classLabel(r1, r2, suited ? 's' : 'o')
      const w = range.get(cls) ?? 0
      if (w > 0) raw[pairIndex(c1, c2)] = w
    }
  }
  return raw
}

/** Multiply two ranges class-wise (e.g. RFI range × continue-vs-3bet frequency). */
export function multiplyRanges(a: Range, b: Range): Range {
  const out: Range = new Map()
  for (const [cls, w] of a) {
    const wb = b.get(cls) ?? 0
    if (w * wb > 0) out.set(cls, w * wb)
  }
  return out
}

/** Weighted list of combos (card pairs) in the range, excluding dead cards. */
export function rangeCombos(range: Range, dead: Card[] = []): { cards: [Card, Card]; w: number }[] {
  const out: { cards: [Card, Card]; w: number }[] = []
  const deadSet = new Set(dead)
  for (let c1 = 0; c1 < 52; c1++) {
    for (let c2 = c1 + 1; c2 < 52; c2++) {
      if (deadSet.has(c1) || deadSet.has(c2)) continue
      const r1 = c1 >> 2
      const r2 = c2 >> 2
      const suited = (c1 & 3) === (c2 & 3)
      const cls = r1 === r2 ? classLabel(r1, r2, '') : classLabel(r1, r2, suited ? 's' : 'o')
      const w = range.get(cls) ?? 0
      if (w > 0) out.push({ cards: [c1, c2], w })
    }
  }
  return out
}

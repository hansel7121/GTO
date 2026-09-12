// Card encoding follows postflop-solver: id = rank * 4 + suit,
// rank 0 = '2' … 12 = 'A', suit 0 = c, 1 = d, 2 = h, 3 = s.

export const RANKS = '23456789TJQKA' as const
export const SUITS = 'cdhs' as const
export type Card = number // 0..51

export const RANK_CHARS = RANKS.split('')
export const SUIT_CHARS = SUITS.split('')

export function cardFromString(s: string): Card {
  if (s.length !== 2) throw new Error(`Bad card: ${s}`)
  const r = RANKS.indexOf(s[0].toUpperCase() as never)
  const su = SUITS.indexOf(s[1].toLowerCase() as never)
  if (r < 0 || su < 0) throw new Error(`Bad card: ${s}`)
  return r * 4 + su
}

export function cardToString(c: Card): string {
  return RANKS[c >> 2] + SUITS[c & 3]
}

export function rankOf(c: Card): number {
  return c >> 2
}

export function suitOf(c: Card): number {
  return c & 3
}

export const SUIT_SYMBOL = ['♣', '♦', '♥', '♠']
export const SUIT_COLOR = ['text-emerald-400', 'text-sky-400', 'text-rose-400', 'text-slate-100']

/** Pretty label such as "A♠". */
export function cardLabel(c: Card): string {
  return RANKS[c >> 2] + SUIT_SYMBOL[c & 3]
}

/** 169-hand class label for two cards, e.g. "AKs", "T9o", "77". */
export function handClass(a: Card, b: Card): string {
  const [hi, lo] = rankOf(a) >= rankOf(b) ? [a, b] : [b, a]
  const rh = RANKS[rankOf(hi)]
  const rl = RANKS[rankOf(lo)]
  if (rankOf(hi) === rankOf(lo)) return rh + rl
  return rh + rl + (suitOf(hi) === suitOf(lo) ? 's' : 'o')
}

/** Index into the 1326-combo array used by postflop-solver (card_pair_to_index). */
export function pairIndex(c1: Card, c2: Card): number {
  if (c1 > c2) [c1, c2] = [c2, c1]
  return (c1 * (101 - c1)) / 2 + c2 - 1
}

export const ALL_CARDS: Card[] = Array.from({ length: 52 }, (_, i) => i)

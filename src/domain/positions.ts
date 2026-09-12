export type Seat =
  | 'UTG' | 'UTG+1' | 'UTG+2' | 'UTG+3'
  | 'LJ' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB'

/**
 * Seats in preflop acting order for a table of `n` players (blinds act last).
 * Heads-up: the button posts the small blind, acts first preflop and last postflop.
 */
export function seatsFor(n: number): Seat[] {
  switch (n) {
    case 2: return ['BTN', 'BB']
    case 3: return ['BTN', 'SB', 'BB']
    case 4: return ['CO', 'BTN', 'SB', 'BB']
    case 5: return ['HJ', 'CO', 'BTN', 'SB', 'BB']
    case 6: return ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']
    case 7: return ['UTG', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']
    case 8: return ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']
    case 9: return ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']
    case 10: return ['UTG', 'UTG+1', 'UTG+2', 'UTG+3', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']
    default: throw new Error(`Unsupported table size ${n}`)
  }
}

/** Preflop order. With a straddle the straddler (UTG) acts last preflop. */
export function preflopOrder(n: number, straddle = false): Seat[] {
  const seats = seatsFor(n)
  if (straddle && n >= 3) {
    const straddler = seats[0]
    return [...seats.slice(1), straddler]
  }
  return seats
}

/** Postflop order: SB first, BTN last. Heads-up: BB first, BTN last. */
export function postflopOrder(n: number): Seat[] {
  const seats = seatsFor(n)
  if (n === 2) return ['BB', 'BTN']
  const blinds = seats.slice(-2) // SB, BB
  const rest = seats.slice(0, -2) // UTG … BTN
  return [...blinds, ...rest]
}

/** 1-based "Nth to act postflop" for a seat. */
export function postflopActIndex(n: number, seat: Seat): number {
  return postflopOrder(n).indexOf(seat) + 1
}

/** Blind posted by a seat in bb units (0 if none). */
export function blindFor(n: number, seat: Seat): number {
  if (n === 2) return seat === 'BTN' ? 0.5 : 1
  if (seat === 'SB') return 0.5
  if (seat === 'BB') return 1
  return 0
}

/**
 * Chart positions available for a table size. Six-max charts cover UTG/HJ/CO/BTN/SB/BB;
 * full-ring charts cover UTG/UTG+1/LJ/HJ/CO/BTN/SB/BB. Extra early seats collapse onto UTG.
 */
export type ChartFormat = '6max' | 'fullring'

export function chartFormatFor(n: number): ChartFormat {
  return n <= 6 ? '6max' : 'fullring'
}

export function chartSeat(n: number, seat: Seat): Seat {
  const fmt = chartFormatFor(n)
  if (fmt === '6max') {
    if (n === 6 || seat === 'BTN' || seat === 'SB' || seat === 'BB' || seat === 'CO' || seat === 'HJ' || seat === 'UTG') return seat
    return 'UTG'
  }
  // full ring charts have UTG, UTG+1, LJ, HJ, CO, BTN, SB, BB
  if (seat === 'UTG+2' || seat === 'UTG+3') return 'UTG+1'
  return seat
}

/** Whether `a` acts before `b` postflop (i.e. `a` is out of position). */
export function isOutOfPosition(n: number, a: Seat, b: Seat): boolean {
  const order = postflopOrder(n)
  return order.indexOf(a) < order.indexOf(b)
}

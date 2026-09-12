import { seatsFor, type Seat } from '../domain/positions'
import type { Hand, Session } from '../domain/types'
import { db, newId } from '../storage/db'

/** Hero's seat usually moves one to the right each hand (button rotates). */
export function nextSeat(seat: Seat, tableSize: number): Seat {
  const seats = seatsFor(tableSize)
  const i = seats.indexOf(seat)
  if (i < 0) return seats[seats.length - 1]
  return seats[(i - 1 + seats.length) % seats.length]
}

export async function createHand(session: Session, last?: Hand): Promise<Hand> {
  const seats = seatsFor(session.tableSize)
  const hand: Hand = {
    id: newId(),
    sessionId: session.id,
    createdAt: Date.now(),
    handNo: (last?.handNo ?? 0) + 1,
    tableSize: last?.tableSize ?? session.tableSize,
    straddle: last?.straddle ?? session.straddle > 0,
    heroSeat: last ? nextSeat(last.heroSeat, last.tableSize) : seats[seats.length - 1],
    heroCards: null,
    board: [],
    actions: [],
    decisions: [],
  }
  await db.hands.add(hand)
  return hand
}

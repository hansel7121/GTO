import { describe, expect, it } from 'vitest'
import { cardFromString, cardToString, handClass, pairIndex } from './cards'
import { computeState } from './engine'
import { postflopActIndex, postflopOrder, preflopOrder, seatsFor } from './positions'

describe('cards', () => {
  it('round-trips strings and matches the solver encoding', () => {
    expect(cardFromString('2c')).toBe(0)
    expect(cardFromString('As')).toBe(51)
    expect(cardToString(cardFromString('Td'))).toBe('Td')
    expect(pairIndex(cardFromString('2d'), cardFromString('2c'))).toBe(0)
    expect(pairIndex(cardFromString('As'), cardFromString('Ah'))).toBe(1325)
  })
  it('classifies hands', () => {
    expect(handClass(cardFromString('Ah'), cardFromString('Kh'))).toBe('AKs')
    expect(handClass(cardFromString('9c'), cardFromString('Td'))).toBe('T9o')
    expect(handClass(cardFromString('7c'), cardFromString('7d'))).toBe('77')
  })
})

describe('positions', () => {
  it('orders seats for every table size', () => {
    for (let n = 2; n <= 10; n++) {
      const seats = seatsFor(n)
      expect(seats.length).toBe(n)
      expect(new Set(seats).size).toBe(n)
      const post = postflopOrder(n)
      expect(post[post.length - 1]).toBe('BTN')
      expect(new Set(post).size).toBe(n)
    }
    expect(preflopOrder(6)).toEqual(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'])
    expect(postflopOrder(6)).toEqual(['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'])
    expect(postflopOrder(2)).toEqual(['BB', 'BTN'])
    expect(preflopOrder(6, true)).toEqual(['HJ', 'CO', 'BTN', 'SB', 'BB', 'UTG'])
    expect(postflopActIndex(6, 'CO')).toBe(5)
  })
})

describe('engine', () => {
  const cfg = { tableSize: 6, stackBb: 100, straddleBb: 0 }
  it('posts blinds and tracks the raise', () => {
    const st = computeState(cfg, 0, [])
    expect(st.pot).toBe(1.5)
    expect(st.toAct).toBe('UTG')
    const st2 = computeState(cfg, 0, [
      { seat: 'UTG', kind: 'fold' },
      { seat: 'HJ', kind: 'raise', amount: 2.5 },
      { seat: 'CO', kind: 'fold' },
      { seat: 'BTN', kind: 'call' },
      { seat: 'SB', kind: 'fold' },
    ])
    expect(st2.toAct).toBe('BB')
    expect(st2.currentBet).toBe(2.5)
    expect(st2.pot).toBe(6.5)
    expect(st2.minRaiseTo).toBe(4)
  })
  it('completes preflop and asks for the flop', () => {
    const acts = [
      { seat: 'UTG', kind: 'fold' },
      { seat: 'HJ', kind: 'raise', amount: 2.5 },
      { seat: 'CO', kind: 'fold' },
      { seat: 'BTN', kind: 'fold' },
      { seat: 'SB', kind: 'fold' },
      { seat: 'BB', kind: 'call' },
    ] as const
    const st = computeState(cfg, 0, [...acts])
    expect(st.roundComplete).toBe(true)
    expect(st.needsBoard).toBe(true)
    expect(st.toAct).toBeNull()
    const st2 = computeState(cfg, 3, [...acts])
    expect(st2.street).toBe('flop')
    expect(st2.toAct).toBe('BB')
    expect(st2.pot).toBe(5.5)
    expect(st2.playersIn).toBe(2)
  })
  it('handles the BB option and limped pots', () => {
    const st = computeState(cfg, 0, [
      { seat: 'UTG', kind: 'call' },
      { seat: 'HJ', kind: 'fold' },
      { seat: 'CO', kind: 'fold' },
      { seat: 'BTN', kind: 'call' },
      { seat: 'SB', kind: 'call' },
    ])
    expect(st.toAct).toBe('BB')
    const st2 = computeState(cfg, 3, [
      { seat: 'UTG', kind: 'call' },
      { seat: 'HJ', kind: 'fold' },
      { seat: 'CO', kind: 'fold' },
      { seat: 'BTN', kind: 'call' },
      { seat: 'SB', kind: 'call' },
      { seat: 'BB', kind: 'check' },
    ])
    expect(st2.street).toBe('flop')
    expect(st2.toAct).toBe('SB')
    expect(st2.pot).toBe(4)
  })
  it('ends the hand when everyone folds', () => {
    const st = computeState(cfg, 0, [
      { seat: 'UTG', kind: 'raise', amount: 3 },
      { seat: 'HJ', kind: 'fold' },
      { seat: 'CO', kind: 'fold' },
      { seat: 'BTN', kind: 'fold' },
      { seat: 'SB', kind: 'fold' },
      { seat: 'BB', kind: 'fold' },
    ])
    expect(st.handOver).toBe(true)
  })
  it('rejects out-of-turn actions', () => {
    const st = computeState(cfg, 0, [{ seat: 'BTN', kind: 'raise', amount: 3 }])
    expect(st.error).toMatch(/Expected UTG/)
  })
  it('replays a full heads-up hand with all-in', () => {
    const acts = [
      { seat: 'UTG', kind: 'fold' },
      { seat: 'HJ', kind: 'fold' },
      { seat: 'CO', kind: 'fold' },
      { seat: 'BTN', kind: 'raise', amount: 2.5 },
      { seat: 'SB', kind: 'fold' },
      { seat: 'BB', kind: 'call' },
      { seat: 'BB', kind: 'check' },
      { seat: 'BTN', kind: 'bet', amount: 2 },
      { seat: 'BB', kind: 'raise', amount: 7 },
      { seat: 'BTN', kind: 'allin' },
      { seat: 'BB', kind: 'call' },
    ] as const
    const st = computeState(cfg, 3, [...acts])
    expect(st.error).toBeUndefined()
    expect(st.needsBoard).toBe(true)
    expect(st.players.BTN.allIn).toBe(true)
    expect(st.pot).toBe(200.5)
    const st5 = computeState(cfg, 5, [...acts])
    expect(st5.handOver).toBe(true)
  })
  it('supports a straddle', () => {
    const st = computeState({ tableSize: 6, stackBb: 100, straddleBb: 2 }, 0, [])
    expect(st.toAct).toBe('HJ')
    expect(st.currentBet).toBe(2)
    expect(st.pot).toBe(3.5)
  })
})

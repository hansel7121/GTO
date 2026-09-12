import { describe, expect, it } from 'vitest'
import { cardFromString } from '../domain/cards'
import { parseRange } from '../preflop/range'
import { computeEquity } from './equity'

describe('equity', () => {
  it('AA beats 72o heads up on the river', () => {
    const r = computeEquity({ hero: [cardFromString('Ah'), cardFromString('Ad')], board: ['2c', '5d', '9h', 'Jc', 'Kd'].map(cardFromString), villains: [parseRange('72o')] })
    expect(r.exact).toBe(true)
    expect(r.equity).toBe(1)
  })
  it('flop equity is sane and fast', () => {
    const t0 = Date.now()
    const r = computeEquity({
      hero: [cardFromString('Jh'), cardFromString('Th')],
      board: ['9s', '8d', '2c'].map(cardFromString),
      villains: [parseRange('66+,A3s+,K8s+,Q9s+,J9s+,T9s,ATo+,KJo+,QJo'), parseRange('TT-22,AQs-A2s,KTs+,QTs+,JTs,T9s,98s,87s,76s,65s,54s,AQo')],
      iterations: 30000,
    })
    const dt = Date.now() - t0
    expect(r.equity).toBeGreaterThan(0.3)
    expect(r.equity).toBeLessThan(0.6)
    expect(dt).toBeLessThan(3000)
    console.log('equity', r.equity, 'ms', dt)
  })
})

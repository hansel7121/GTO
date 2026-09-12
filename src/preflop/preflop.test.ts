import { describe, expect, it } from 'vitest'
import { cardFromString } from '../domain/cards'
import { computeState } from '../domain/engine'
import { analyzePreflop, rangesFromPreflop } from './analyze'
import { BUNDLED_CHARTS } from './charts'
import { bundledResolver, chartFrequencies, classifyPreflop, findChart, parseChart } from './lookup'
import { parseRange, rangePercent, rangeToRaw, rangeToString } from './range'

describe('range parser', () => {
  it('parses plus, dash and weights', () => {
    const r = parseRange('66+,A8s+,A5s-A4s,AJo+,KQo:0.5')
    expect(r.get('66')).toBe(1)
    expect(r.get('AA')).toBe(1)
    expect(r.get('55')).toBeUndefined()
    expect(r.get('A8s')).toBe(1)
    expect(r.get('AKs')).toBe(1)
    expect(r.get('A7s')).toBeUndefined()
    expect(r.get('A5s')).toBe(1)
    expect(r.get('A4s')).toBe(1)
    expect(r.get('A3s')).toBeUndefined()
    expect(r.get('AJo')).toBe(1)
    expect(r.get('ATo')).toBeUndefined()
    expect(r.get('KQo')).toBe(0.5)
    expect(r.get('KQs')).toBeUndefined()
  })
  it('handles connectors and pairs ranges', () => {
    const r = parseRange('T9s+,88-55,KQ')
    expect(r.get('T9s')).toBe(1)
    expect(r.get('AKs')).toBe(1)
    expect(r.get('98s')).toBeUndefined()
    expect(r.get('77')).toBe(1)
    expect(r.get('44')).toBeUndefined()
    expect(r.get('KQs')).toBe(1)
    expect(r.get('KQo')).toBe(1)
  })
  it('first entry wins on overlap, like the solver', () => {
    const r = parseRange('AA:0.5,AA')
    expect(r.get('AA')).toBe(0.5)
  })
  it('round-trips through serialization', () => {
    const r = parseRange('22+,A2s+,KTs+:0.5')
    const r2 = parseRange(rangeToString(r))
    expect(rangePercent(r2)).toBeCloseTo(rangePercent(r), 6)
    expect(r2.get('KTs')).toBe(0.5)
  })
  it('expands to 1326 combos', () => {
    const raw = rangeToRaw(parseRange('AA'))
    expect(raw.length).toBe(1326)
    expect(Array.from(raw).filter((w) => w > 0).length).toBe(6)
    const dead = rangeToRaw(parseRange('AA'), [cardFromString('As')])
    expect(Array.from(dead).filter((w) => w > 0).length).toBe(3)
  })
  it('computes the published percentages for the RFI charts', () => {
    expect(rangePercent(parseRange('66+,A3s+,K8s+,Q9s+,J9s+,T9s,ATo+,KJo+,QJo'))).toBeGreaterThan(16.5)
    expect(rangePercent(parseRange('33+,A2s+,K2s+,Q3s+,J4s+,T6s+,96s+,85s+,75s+,64s+,53s+,A4o+,K8o+,Q9o+,J9o+,T8o+,98o'))).toBeGreaterThan(42)
  })
})

describe('bundled charts', () => {
  it('all parse and never exceed 100% per hand', () => {
    for (const c of BUNDLED_CHARTS) {
      const p = parseChart(c)
      const keys = new Set([...p.raise.keys(), ...p.call.keys(), ...p.allin.keys(), ...p.limp.keys()])
      for (const k of keys) {
        const f = chartFrequencies(c, k)
        const sum = f.raise + f.call + f.allin + f.limp
        expect(sum, `${c.key} ${k}`).toBeLessThanOrEqual(1.0001)
      }
    }
  })
  it('finds charts with position mapping', () => {
    expect(findChart(bundledResolver, 6, 'RFI', 'UTG')?.chart.key).toBe('6max:RFI:UTG')
    expect(findChart(bundledResolver, 9, 'RFI', 'UTG+2')?.chart.key).toBe('fullring:RFI:UTG+1')
    expect(findChart(bundledResolver, 9, 'VS_RFI', 'BB', 'LJ')?.chart.key).toBe('6max:VS_RFI:BB:UTG')
    expect(findChart(bundledResolver, 4, 'RFI', 'CO')?.chart.key).toBe('6max:RFI:CO')
  })
})

describe('preflop analysis', () => {
  const cfg = { tableSize: 6, stackBb: 100, straddleBb: 0 }
  it('classifies spots', () => {
    expect(classifyPreflop('CO', [{ seat: 'UTG', kind: 'fold' }, { seat: 'HJ', kind: 'fold' }], 'BB').scenario).toBe('RFI')
    expect(classifyPreflop('BB', [{ seat: 'UTG', kind: 'raise', amount: 2.5 }, { seat: 'HJ', kind: 'fold' }, { seat: 'CO', kind: 'fold' }, { seat: 'BTN', kind: 'fold' }, { seat: 'SB', kind: 'fold' }], 'BB')).toMatchObject({ scenario: 'VS_RFI', raiser: 'UTG' })
    expect(classifyPreflop('UTG', [{ seat: 'UTG', kind: 'raise', amount: 2.5 }, { seat: 'HJ', kind: 'fold' }, { seat: 'CO', kind: 'fold' }, { seat: 'BTN', kind: 'raise', amount: 8 }, { seat: 'SB', kind: 'fold' }, { seat: 'BB', kind: 'fold' }], 'BB')).toMatchObject({ scenario: 'VS_3BET', raiser: 'BTN' })
  })
  it('recommends opening AKs UTG and folding 72o', () => {
    const acts = [] as const
    const state = computeState(cfg, 0, [...acts])
    const a = analyzePreflop({ tableSize: 6, hero: 'UTG', heroCards: [cardFromString('Ah'), cardFromString('Kh')], state, preflopActions: [], resolve: bundledResolver })
    expect(a.engine).toBe('preflop-chart')
    expect(a.options[a.bestIndex].kind).toBe('raise')
    expect(a.confidence).toBe('gto')
    const b = analyzePreflop({ tableSize: 6, hero: 'UTG', heroCards: [cardFromString('7h'), cardFromString('2c')], state, preflopActions: [], resolve: bundledResolver })
    expect(b.options[b.bestIndex].kind).toBe('fold')
  })
  it('builds postflop ranges from the line', () => {
    const acts = [
      { seat: 'UTG', kind: 'fold' },
      { seat: 'HJ', kind: 'fold' },
      { seat: 'CO', kind: 'fold' },
      { seat: 'BTN', kind: 'raise', amount: 2.5 },
      { seat: 'SB', kind: 'fold' },
      { seat: 'BB', kind: 'call' },
    ] as const
    const r = rangesFromPreflop(6, [...acts], ['BTN', 'BB'], bundledResolver)
    expect(r.approx).toBe(false)
    expect(rangePercent(r.ranges.get('BTN')!)).toBeGreaterThan(42)
    expect(r.ranges.get('BB')!.get('AA')).toBeUndefined()
    expect(r.ranges.get('BB')!.get('76s')).toBeGreaterThan(0)
  })
})

import { describe, expect, it } from 'vitest'
import { cardFromString } from '../domain/cards'
import { computeState } from '../domain/engine'
import type { Seat } from '../domain/positions'
import { CHART_INDEX, chartKey } from '../preflop/charts'
import { SEATS_30BB } from '../preflop/charts/charts30'
import { bundledResolver } from '../preflop/lookup'
import { analyzeTrainer, facingAllIn, raiseTo30 } from './analyze30'
import { DEFAULT_TRAINER_SETTINGS, engineCfg } from './config'
import { advance, dealHand, heroAct, legalRaise, makeRng, outcomeOf, stateOf } from './sim'

const c = (s: string) => cardFromString(s)
const S = DEFAULT_TRAINER_SETTINGS
const TRAINER_CFG_ENGINE = engineCfg(S)

describe('30bb chart set', () => {
  it('covers every seat pair the 5-handed tree can reach', () => {
    const missing: string[] = []
    const need = (k: string) => {
      if (!CHART_INDEX.has(k)) missing.push(k)
    }
    for (const s of ['HJ', 'CO', 'BTN', 'SB'] as Seat[]) need(chartKey('5max30', 'RFI', s))
    for (let h = 1; h < SEATS_30BB.length; h++) {
      for (let v = 0; v < h; v++) {
        need(chartKey('5max30', 'VS_RFI', SEATS_30BB[h], SEATS_30BB[v]))
        need(chartKey('5max30', 'VS_3BET', SEATS_30BB[v], SEATS_30BB[h]))
        need(chartKey('5max30', 'VS_4BET', SEATS_30BB[h], SEATS_30BB[v]))
      }
    }
    for (const s of ['CO', 'BTN', 'SB', 'BB'] as Seat[]) need(chartKey('5max30', 'COLD_4BET', s))
    expect(missing).toEqual([])
  })
})

describe('trainer analysis', () => {
  it('HJ opens AA, folds 72o', () => {
    const st = computeState(TRAINER_CFG_ENGINE, 0, [])
    const a = analyzeTrainer(S, 'HJ', [c('Ah'), c('Ad')], st, [], bundledResolver)
    expect(a.options[a.bestIndex].kind).toBe('raise')
    expect(a.options[a.bestIndex].amount).toBe(2.5)
    const b = analyzeTrainer(S, 'HJ', [c('7h'), c('2d')], st, [], bundledResolver)
    expect(b.options[b.bestIndex].kind).toBe('fold')
  })
  it('BB defends wide vs BTN but folds trash', () => {
    const acts = [
      { seat: 'HJ', kind: 'fold' },
      { seat: 'CO', kind: 'fold' },
      { seat: 'BTN', kind: 'raise', amount: 2.5 },
      { seat: 'SB', kind: 'fold' },
    ] as const
    const st = computeState(TRAINER_CFG_ENGINE, 0, [...acts])
    expect(st.toAct).toBe('BB')
    const a = analyzeTrainer(S, 'BB', [c('9h'), c('8h')], st, [...acts], bundledResolver)
    expect(a.options[a.bestIndex].kind).toBe('call')
    const b = analyzeTrainer(S, 'BB', [c('7c'), c('2d')], st, [...acts], bundledResolver)
    expect(b.options[b.bestIndex].kind).toBe('fold')
    const j = analyzeTrainer(S, 'BB', [c('Ac'), c('Ad')], st, [...acts], bundledResolver)
    expect(j.options[j.bestIndex].kind).toBe('raise')
    expect(j.options[j.bestIndex].amount).toBe(raiseTo30('VS_RFI', 'BB', false, 2.5))
  })
  it('facing a jam leaves only call / fold', () => {
    const acts = [
      { seat: 'HJ', kind: 'raise', amount: 2.5 },
      { seat: 'CO', kind: 'fold' },
      { seat: 'BTN', kind: 'fold' },
      { seat: 'SB', kind: 'allin' },
      { seat: 'BB', kind: 'fold' },
    ] as const
    const st = computeState(TRAINER_CFG_ENGINE, 0, [...acts])
    expect(st.toAct).toBe('HJ')
    expect(facingAllIn(st, 'HJ')).toBe(true)
    const a = analyzeTrainer(S, 'HJ', [c('Kc'), c('Kd')], st, [...acts], bundledResolver)
    expect(a.options.map((o) => o.kind)).toEqual(['call', 'fold'])
    expect(a.options[a.bestIndex].kind).toBe('call')
    const b = analyzeTrainer(S, 'HJ', [c('7c'), c('6c')], st, [...acts], bundledResolver)
    expect(b.options[b.bestIndex].kind).toBe('fold')
  })
  it('4-bets are jams at 30bb', () => {
    expect(raiseTo30('VS_3BET', 'HJ', false, 8)).toBe(30)
    expect(raiseTo30('RFI', 'SB', false, 1)).toBe(3)
  })
})

describe('simulation', () => {
  it('plays 1000 seeded hands without illegal actions and always reaches hero or the end', () => {
    const rand = makeRng(42)
    let heroDecisions = 0
    const seats = new Set<string>()
    const outcomes = new Set<string>()
    let threeBets = 0
    for (let i = 0; i < 1000; i++) {
      const hand = dealHand(S, rand, i)
      seats.add(hand.heroSeat)
      let st = advance(hand, bundledResolver, rand)
      let guard = 0
      while (st.toAct === hand.heroSeat && !st.handOver && guard++ < 10) {
        const d = hand.decisions[hand.decisions.length - 1]
        expect(d.actionIndex).toBe(hand.actions.length)
        expect(d.analysis.options.length).toBeGreaterThan(0)
        // hero plays the chart's most frequent action
        const best = d.analysis.options[d.analysis.bestIndex]
        const me = st.players[hand.heroSeat]
        const toCall = st.currentBet - me.committed
        const action =
          best.kind === 'raise'
            ? { seat: hand.heroSeat, kind: 'raise' as const, amount: Math.max(st.minRaiseTo, best.amount ?? 0) }
            : best.kind === 'allin'
              ? { seat: hand.heroSeat, kind: 'allin' as const }
              : best.kind === 'call'
                ? { seat: hand.heroSeat, kind: toCall > 0 ? ('call' as const) : ('check' as const) }
                : { seat: hand.heroSeat, kind: 'fold' as const }
        const graded = heroAct(hand, action)
        expect(graded.analysis.correct).toBe(true)
        heroDecisions++
        st = advance(hand, bundledResolver, rand)
      }
      expect(stateOf(hand).error).toBeUndefined()
      const raises = hand.actions.filter((a) => a.kind === 'raise' || a.kind === 'allin').length
      if (raises >= 2) threeBets++
      outcomes.add(outcomeOf(hand, st))
    }
    expect(seats.size).toBe(5)
    expect(heroDecisions).toBeGreaterThan(600)
    expect(threeBets).toBeGreaterThan(50)
    expect(outcomes.has('hero-folded')).toBe(true)
    expect(outcomes.has('flop')).toBe(true)
  })

  it('survives random hero play; only limp lines can be ungraded', () => {
    const rand = makeRng(7)
    for (let i = 0; i < 1500; i++) {
      const hand = dealHand(S, rand, i)
      let st = advance(hand, bundledResolver, rand)
      let guard = 0
      while (st.toAct === hand.heroSeat && !st.handOver && guard++ < 10) {
        const d = hand.decisions[hand.decisions.length - 1]
        if (d.analysis.options.length === 0) {
          const heroLimped = hand.actions.some((a, idx) => a.seat === hand.heroSeat && a.kind === 'call' && !hand.actions.slice(0, idx).some((b) => b.kind === 'raise' || b.kind === 'allin'))
          expect(heroLimped, JSON.stringify(hand.actions)).toBe(true)
        }
        const me = st.players[hand.heroSeat]
        const toCall = st.currentBet - me.committed
        const r = rand()
        const a =
          r < 0.3
            ? { seat: hand.heroSeat, kind: 'fold' as const }
            : r < 0.6
              ? { seat: hand.heroSeat, kind: toCall > 0 ? ('call' as const) : ('check' as const) }
              : r < 0.8
                ? legalRaise(st, hand.heroSeat, st.minRaiseTo + rand() * 5)
                : { seat: hand.heroSeat, kind: 'allin' as const }
        heroAct(hand, a)
        st = advance(hand, bundledResolver, rand)
      }
      expect(stateOf(hand).error).toBeUndefined()
    }
  })

  it.each([
    [{ players: 6, stackBb: 30 }],
    [{ players: 3, stackBb: 20 }],
    [{ players: 6, stackBb: 100 }],
    [{ players: 9, stackBb: 100 }],
    [{ players: 5, stackBb: 50 }],
  ])('other table shapes %o: legal lines, graded hero spots', (cfg) => {
    const rand = makeRng(11)
    let decisions = 0
    let graded = 0
    for (let i = 0; i < 300; i++) {
      const hand = dealHand(cfg, rand, i)
      let st = advance(hand, bundledResolver, rand)
      let guard = 0
      while (st.toAct === hand.heroSeat && !st.handOver && guard++ < 10) {
        const d = hand.decisions[hand.decisions.length - 1]
        decisions++
        if (d.analysis.options.length > 0) graded++
        const best = d.analysis.options[d.analysis.bestIndex]
        const me = st.players[hand.heroSeat]
        const toCall = st.currentBet - me.committed
        const a = !best || best.kind === 'fold'
          ? { seat: hand.heroSeat, kind: toCall > 0 ? ('fold' as const) : ('check' as const) }
          : best.kind === 'raise'
            ? legalRaise(st, hand.heroSeat, best.amount ?? st.minRaiseTo)
            : best.kind === 'allin'
              ? { seat: hand.heroSeat, kind: 'allin' as const }
              : { seat: hand.heroSeat, kind: toCall > 0 ? ('call' as const) : ('check' as const) }
        heroAct(hand, a)
        st = advance(hand, bundledResolver, rand)
      }
      expect(stateOf(hand).error).toBeUndefined()
      expect(hand.seats.length).toBe(cfg.players)
    }
    expect(decisions).toBeGreaterThan(150)
    expect(graded / decisions).toBeGreaterThan(0.97)
  })
})

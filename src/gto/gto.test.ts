import { describe, expect, it } from 'vitest'
import { cardFromString } from '../domain/cards'
import type { Action, AnalysisOption } from '../domain/types'
import { bundledResolver } from '../preflop/lookup'
import { rangesFromPreflop } from '../preflop/analyze'
import { legalRaise, makeRng } from '../trainer/sim'
import { DEFAULT_GTO_SETTINGS, type GtoSettings } from './config'
import { explain } from './explain'
import { dealGtoHand, heroAct, pending, runUntilHero, stateOf } from './game'
import { handLabel, settle } from './showdown'
import type { PostflopSolver, SolvedNode } from './solver'
import { tilt } from './style'

const c = (s: string) => cardFromString(s)

describe('style tilt', () => {
  const opts: AnalysisOption[] = [
    { label: 'Fold', kind: 'fold', freq: 0.5 },
    { label: 'Call', kind: 'call', freq: 0.3 },
    { label: 'Raise', kind: 'raise', freq: 0.2, amount: 8 },
  ]
  it('keeps GTO unchanged and sums to one', () => {
    expect(tilt(opts, 'gto')).toEqual([0.5, 0.3, 0.2])
    for (const s of ['tight', 'loose', 'maniac'] as const) expect(tilt(opts, s).reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
  it('tight folds more, loose calls more, maniac raises more', () => {
    expect(tilt(opts, 'tight')[0]).toBeGreaterThan(0.5)
    expect(tilt(opts, 'loose')[1]).toBeGreaterThan(0.3)
    expect(tilt(opts, 'maniac')[2]).toBeGreaterThan(0.2)
  })
  it('maniac raises even when GTO never does', () => {
    const pure: AnalysisOption[] = [
      { label: 'Fold', kind: 'fold', freq: 1 },
      { label: 'Raise', kind: 'raise', freq: 0, amount: 8 },
    ]
    expect(tilt(pure, 'maniac')[1]).toBeGreaterThan(0)
    expect(tilt(pure, 'gto')[1]).toBe(0)
  })
})

describe('showdown', () => {
  it('labels hands', () => {
    expect(handLabel([c('Ah'), c('Kd')], [c('As'), c('7c'), c('2d')])).toBe('top pair')
    expect(handLabel([c('9h'), c('8h')], [c('7h'), c('6c'), c('2h')])).toContain('flush draw')
    expect(handLabel([c('9h'), c('8h')], [c('7h'), c('6c'), c('2h')])).toContain('straight draw')
    expect(handLabel([c('Qh'), c('Qd')], [c('Js'), c('7c'), c('2d')])).toBe('overpair')
  })
})

/** Fake solver: uniform strategy over the tree's actions with a made-up EV, so hands run without WASM. */
function fakeSolver(): PostflopSolver {
  return {
    async query(): Promise<SolvedNode | null> {
      return null // exercise the equity / heuristic paths
    },
    async foldPctAfter() {
      return 0.4
    },
  }
}

async function playHand(settings: GtoSettings, rand: () => number, id: number, heroPolicy: 'best' | 'random') {
  const hand = dealGtoHand(settings, rand, id)
  const deps = { resolve: bundledResolver, rand, solver: fakeSolver() }
  let st = await runUntilHero(hand, deps)
  let guard = 0
  while (!hand.result && guard++ < 30) {
    const d = pending(hand)
    expect(d, 'no pending decision but hand not over').toBeTruthy()
    const me = st.players[hand.heroSeat]
    const toCall = st.currentBet - me.committed
    const canRaise = toCall < me.stack - 1e-9 && st.minRaiseTo < me.committed + me.stack + 1e-9
    let a: Action
    const best = d!.analysis.bestIndex >= 0 ? d!.analysis.options[d!.analysis.bestIndex] : undefined
    const r = rand()
    if (heroPolicy === 'best' && best) {
      a =
        best.kind === 'fold'
          ? { seat: hand.heroSeat, kind: toCall > 0 ? 'fold' : 'check' }
          : best.kind === 'allin'
            ? { seat: hand.heroSeat, kind: 'allin' }
            : (best.kind === 'raise' || best.kind === 'bet') && canRaise
              ? legalRaise(st, hand.heroSeat, best.amount ?? st.minRaiseTo)
              : { seat: hand.heroSeat, kind: toCall > 0 ? 'call' : 'check' }
    } else {
      a =
        r < 0.25
          ? { seat: hand.heroSeat, kind: toCall > 0 ? 'fold' : 'check' }
          : r < 0.6
            ? { seat: hand.heroSeat, kind: toCall > 0 ? 'call' : 'check' }
            : r < 0.85 && canRaise
              ? legalRaise(st, hand.heroSeat, st.pot * 0.6 + st.currentBet)
              : canRaise
                ? { seat: hand.heroSeat, kind: 'allin' }
                : { seat: hand.heroSeat, kind: toCall > 0 ? 'call' : 'check' }
    }
    await heroAct(hand, a, deps)
    st = await runUntilHero(hand, deps)
  }
  return hand
}

describe('full hand simulation (no solver)', () => {
  it.each([
    [{ ...DEFAULT_GTO_SETTINGS, players: 5, stackBb: 30 }],
    [{ ...DEFAULT_GTO_SETTINGS, players: 6, stackBb: 100, style: 'maniac' as const }],
    [{ ...DEFAULT_GTO_SETTINGS, players: 3, stackBb: 20, style: 'loose' as const }],
    [{ ...DEFAULT_GTO_SETTINGS, players: 9, stackBb: 50, style: 'tight' as const }],
  ])('%o: hands terminate, chips are conserved, results settle', async (settings) => {
    const rand = makeRng(99)
    const streets = new Set<string>()
    let showdowns = 0
    let mistakesExplained = 0
    for (let i = 0; i < 120; i++) {
      const hand = await playHand(settings, rand, i, i % 2 ? 'best' : 'random')
      expect(hand.result).toBeTruthy()
      const st = stateOf(hand)
      expect(st.error).toBeUndefined()
      expect(st.handOver).toBe(true)
      // chips conserved: every stack + pot = players * stack
      const total = Object.values(st.players).reduce((a, p) => a + p.stack, 0) + st.pot
      expect(total).toBeCloseTo(settings.players * settings.stackBb, 6)
      // hero net = paid - committed
      const pay = settle(st, hand.cards, hand.board)
      expect(hand.result!.heroNetBb).toBeCloseTo((pay.paid[hand.heroSeat] ?? 0) - st.players[hand.heroSeat].total, 2)
      if (hand.result!.showdown) showdowns++
      for (const d of hand.decisions) {
        streets.add(d.street)
        if (d.analysis.correct === false) {
          expect(d.explanation, `${d.street} ${d.analysis.scenario}`).toBeTruthy()
          mistakesExplained++
        }
      }
    }
    expect(streets.has('flop')).toBe(true)
    expect(showdowns).toBeGreaterThan(0)
    expect(mistakesExplained).toBeGreaterThan(0)
  }, 60000)

  it('uses the 30bb charts for line ranges when asked', () => {
    const acts: Action[] = [
      { seat: 'HJ', kind: 'fold' },
      { seat: 'CO', kind: 'fold' },
      { seat: 'BTN', kind: 'raise', amount: 2.5 },
      { seat: 'SB', kind: 'fold' },
      { seat: 'BB', kind: 'call' },
    ]
    const deep = rangesFromPreflop(5, acts, ['BTN', 'BB'], bundledResolver)
    const short = rangesFromPreflop(5, acts, ['BTN', 'BB'], bundledResolver, '5max30')
    expect(short.ranges.get('BB')!.get('K5s')).toBe(0.75) // 30bb chart weight
    expect(deep.ranges.get('BB')!.get('K5s')).not.toBe(0.75)
  })
})

describe('explain', () => {
  it('writes a reason for a bad call', () => {
    const text = explain(
      {
        engine: 'cfr',
        confidence: 'gto',
        options: [
          { label: 'Fold', kind: 'fold', freq: 1, ev: 0 },
          { label: 'Call', kind: 'call', freq: 0, ev: -1.2 },
        ],
        bestIndex: 0,
        chosenIndex: 1,
        correct: false,
        notes: [],
        equity: 0.19,
      },
      { street: 'turn', cls: 'J9s', handLabel: 'straight draw', potBb: 10, toCallBb: 7.5, stackBb: 20, villainFoldPct: null, players: 2 },
    )
    expect(text).toContain('Fold earns 0bb vs -1.2bb')
    expect(text).toContain('needs 43% equity')
  })
})

import { describe, expect, it } from 'vitest'
import { cardFromString } from '../domain/cards'
import type { Hand, Session } from '../domain/types'
import { describeHand, questionForDecision } from './prompt'

const session: Session = { id: 's', createdAt: 0, name: 'test', sb: 1, bb: 2, straddle: 0, tableSize: 6, stackDepthBb: 100, currency: '$' }

const hand: Hand = {
  id: 'h',
  sessionId: 's',
  createdAt: 0,
  handNo: 3,
  tableSize: 6,
  straddle: false,
  heroSeat: 'BTN',
  heroCards: [cardFromString('Ah'), cardFromString('Kd')],
  board: ['Ks', '7h', '2c', '9d'].map(cardFromString),
  actions: [
    { seat: 'UTG', kind: 'fold' },
    { seat: 'HJ', kind: 'raise', amount: 2.5 },
    { seat: 'CO', kind: 'fold' },
    { seat: 'BTN', kind: 'raise', amount: 8 },
    { seat: 'SB', kind: 'fold' },
    { seat: 'BB', kind: 'fold' },
    { seat: 'HJ', kind: 'call' },
    { seat: 'HJ', kind: 'check' },
    { seat: 'BTN', kind: 'bet', amount: 5.5 },
    { seat: 'HJ', kind: 'call' },
    { seat: 'HJ', kind: 'check' },
    { seat: 'BTN', kind: 'check' },
  ],
  decisions: [
    {
      id: 'd1',
      street: 'preflop',
      actionIndex: 3,
      potBb: 4,
      toCallBb: 2.5,
      chosen: { seat: 'BTN', kind: 'raise', amount: 8 },
      analysis: {
        engine: 'preflop-chart',
        confidence: 'gto',
        options: [
          { label: 'Fold', kind: 'fold', freq: 0 },
          { label: 'Call', kind: 'call', freq: 0.2 },
          { label: 'Raise 8bb', kind: 'raise', amount: 8, freq: 0.8 },
        ],
        bestIndex: 2,
        chosenIndex: 2,
        correct: true,
        notes: ['BTN vs HJ open, 100bb'],
      },
    },
    {
      id: 'd3',
      street: 'turn',
      actionIndex: 11,
      potBb: 28.5,
      toCallBb: 0,
      chosen: { seat: 'BTN', kind: 'check' },
      analysis: {
        engine: 'cfr',
        confidence: 'gto',
        exploitability: 0.31,
        options: [
          { label: 'Check', kind: 'check', freq: 0.35, ev: 18.1 },
          { label: 'Bet 21bb', kind: 'bet', amount: 21, freq: 0.65, ev: 19.4 },
        ],
        bestIndex: 1,
        chosenIndex: 0,
        correct: false,
        evLossBb: 1.3,
        notes: [],
      },
    },
  ],
  result: 12.5,
}

describe('coach prompt', () => {
  it('describes the hand, the action and every graded decision', () => {
    const text = describeHand(session, hand, { tableSize: 6, stackBb: 100, straddleBb: 0 })
    expect(text).toContain('6-handed cash game, blinds $1/$2 (1bb = $2)')
    expect(text).toContain('Hero: BTN with Ah Kd.')
    expect(text).toContain('Board: flop Ks 7h 2c, turn 9d.')
    expect(text).toContain('Preflop: UTG folds, HJ raises to 2.5bb, CO folds, BTN (hero) raises to 8bb, SB folds, BB folds, HJ calls')
    expect(text).toContain('Flop (pot 17.5bb at start): HJ checks, BTN (hero) bets 5.5bb, HJ calls')
    expect(text).toContain('1. Preflop, pot 4bb, 2.5bb to call: Hero raises to 8bb')
    expect(text).toContain('Engine: preflop chart lookup')
    expect(text).toContain('Strategy: Fold 0% · Call 20% · Raise 8bb 80%')
    expect(text).toContain('Grade: OK')
    expect(text).toContain('2. Turn, pot 28.5bb, no bet to face: Hero checks')
    expect(text).toContain('exploitability 0.31% of pot')
    expect(text).toContain('Check 35% (EV 18.1bb) · Bet 21bb 65% (EV 19.4bb)')
    expect(text).toContain('Recommended: Bet 21bb')
    expect(text).toContain('Grade: MISTAKE (EV lost 1.3bb)')
    expect(text).toContain("Hero's net result: +12.5bb.")
  })
  it('phrases the per-decision question', () => {
    expect(questionForDecision(hand, hand.decisions[1])).toBe('Decision 2 (turn): I checked, but the app says Bet 21bb is best. Why is Bet 21bb better here?')
    expect(questionForDecision(hand, hand.decisions[0])).toBe('Decision 1 (preflop): explain why Raise 8bb is the recommended play here (I raised to 8bb).')
  })
})

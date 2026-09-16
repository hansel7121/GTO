import { cardToString } from '../domain/cards'
import { computeState, type EngineConfig } from '../domain/engine'
import type { Action, Analysis, Decision, Hand, Session } from '../domain/types'
import { trim } from '../app/format'

const bb = (x: number) => `${trim(x)}bb`

function describeAction(a: Action, hero: string): string {
  const who = a.seat === hero ? `${a.seat} (hero)` : a.seat
  switch (a.kind) {
    case 'fold': return `${who} folds`
    case 'check': return `${who} checks`
    case 'call': return `${who} calls`
    case 'bet': return `${who} bets ${bb(a.amount ?? 0)}`
    case 'raise': return `${who} raises to ${bb(a.amount ?? 0)}`
    case 'allin': return `${who} goes all-in`
  }
}

function firstPerson(a: Action): string {
  switch (a.kind) {
    case 'fold': return 'I folded'
    case 'check': return 'I checked'
    case 'call': return 'I called'
    case 'bet': return `I bet ${bb(a.amount ?? 0)}`
    case 'raise': return `I raised to ${bb(a.amount ?? 0)}`
    case 'allin': return 'I went all-in'
  }
}

function engineLabel(a: Analysis): string {
  const approx = a.confidence === 'approx' ? ', approximated ranges' : ''
  switch (a.engine) {
    case 'cfr':
      return `on-device CFR solver (heads-up postflop solve${a.provisional ? ', quick mode' : ''}${
        typeof a.exploitability === 'number' ? `, exploitability ${a.exploitability.toFixed(2)}% of pot` : ''
      }${approx})`
    case 'preflop-chart':
      return `preflop chart lookup${approx}`
    case 'equity':
      return `Monte-Carlo equity vs ranges + pot odds / MDF math${a.provisional ? ' (quick estimate, no solve yet)' : ''}${approx}`
    default:
      return 'no model — not graded'
  }
}

function describeAnalysis(a: Analysis): string[] {
  const out: string[] = [`Engine: ${engineLabel(a)}`]
  if (a.scenario) out.push(`Scenario: ${a.scenario}`)
  if (a.options.length > 0) {
    const hasEv = a.options.some((o) => typeof o.ev === 'number')
    out.push(
      'Strategy: ' +
        a.options
          .map((o) => `${o.label} ${Math.round(o.freq * 100)}%${hasEv && typeof o.ev === 'number' ? ` (EV ${bb(o.ev)})` : ''}`)
          .join(' · '),
    )
  }
  if (a.bestIndex >= 0) out.push(`Recommended: ${a.options[a.bestIndex].label}`)
  if (a.correct !== undefined) {
    out.push(
      `Grade: ${a.correct ? 'OK' : 'MISTAKE'}${typeof a.evLossBb === 'number' ? ` (EV lost ${bb(a.evLossBb)})` : ''}`,
    )
  } else if (a.engine !== 'none') {
    out.push('Grade: ungraded (hero action not in the model)')
  }
  const extra: string[] = []
  if (typeof a.equity === 'number') extra.push(`hero equity vs ranges ${(a.equity * 100).toFixed(1)}%`)
  if (typeof a.potOdds === 'number') extra.push(`required equity to call ${(a.potOdds * 100).toFixed(1)}%`)
  if (extra.length) out.push(extra.join(', '))
  for (const n of a.notes) out.push(`Note: ${n}`)
  return out
}

function describeDecision(d: Decision, i: number): string {
  const lines: string[] = []
  const chosen = d.chosen ? describeAction(d.chosen, d.chosen.seat).replace(/^.*?\(hero\) /, 'Hero ') : 'Hero (no action yet)'
  lines.push(`${i + 1}. ${d.street[0].toUpperCase() + d.street.slice(1)}, pot ${bb(d.potBb)}${d.toCallBb > 0 ? `, ${bb(d.toCallBb)} to call` : ', no bet to face'}: ${chosen}`)
  if (d.analysis) for (const l of describeAnalysis(d.analysis)) lines.push(`   ${l}`)
  else lines.push('   (not analysed)')
  return lines.join('\n')
}

/** Plain-text hand history + the app's analysis of each hero decision, for the Claude prompt. */
export function describeHand(session: Session, hand: Hand, cfg: EngineConfig): string {
  const state = computeState(cfg, hand.board.length, hand.actions)
  const lines: string[] = []
  const straddle = cfg.straddleBb > 0 ? `, ${bb(cfg.straddleBb)} straddle` : ''
  lines.push(
    `Game: ${hand.tableSize}-handed cash game, blinds ${session.currency}${trim(session.sb)}/${session.currency}${trim(session.bb)} (1bb = ${session.currency}${trim(session.bb)})${straddle}, everyone ${cfg.stackBb}bb deep at the start of the hand.`,
  )
  lines.push(`Hero: ${hand.heroSeat} with ${hand.heroCards ? hand.heroCards.map(cardToString).join(' ') : 'unknown cards'}.`)
  const b = hand.board.map(cardToString)
  if (b.length >= 3) {
    lines.push(`Board: flop ${b.slice(0, 3).join(' ')}${b.length >= 4 ? `, turn ${b[3]}` : ''}${b.length >= 5 ? `, river ${b[4]}` : ''}.`)
  }
  lines.push('')
  lines.push('Action (amounts are the total put in on that street, in bb):')
  for (const s of state.streets) {
    const acts = s.actions.length ? s.actions.map((a) => describeAction(a, hand.heroSeat)).join(', ') : '—'
    const pot = s.street === 'preflop' ? '' : ` (pot ${bb(s.potAtStart)} at start)`
    lines.push(`${s.street[0].toUpperCase() + s.street.slice(1)}${pot}: ${acts}`)
  }
  if (state.error) lines.push(`(Action log error: ${state.error})`)
  else if (!state.handOver) lines.push('(The hand is still in progress.)')
  if (typeof hand.result === 'number') lines.push(`Hero's net result: ${hand.result >= 0 ? '+' : ''}${bb(hand.result)}.`)
  if (hand.note) lines.push(`Hero's note: ${hand.note}`)
  lines.push('')
  if (hand.decisions.length === 0) lines.push('Hero has not made any decision yet.')
  else {
    lines.push("Hero's decisions with the app's analysis:")
    hand.decisions.forEach((d, i) => lines.push(describeDecision(d, i)))
  }
  return lines.join('\n')
}

export const DEFAULT_QUESTION = 'Walk me through this hand: why is each recommended action right, and where (if anywhere) did I go wrong?'

/** Question text for the "Why?" button on one decision. */
export function questionForDecision(hand: Hand, d: Decision): string {
  const i = hand.decisions.findIndex((x) => x.id === d.id) + 1
  const a = d.analysis
  const best = a && a.bestIndex >= 0 ? a.options[a.bestIndex].label : null
  const chosen = d.chosen ? firstPerson(d.chosen) : ''
  if (best && a?.correct === false) return `Decision ${i} (${d.street}): ${chosen}, but the app says ${best} is best. Why is ${best} better here?`
  if (best) return `Decision ${i} (${d.street}): explain why ${best} is the recommended play here${chosen ? ` (${chosen})` : ''}.`
  return `Decision ${i} (${d.street}): what is the right play here and why?`
}

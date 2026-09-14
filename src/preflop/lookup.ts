import { chartFormatFor, chartSeat, type ChartFormat, type Seat } from '../domain/positions'
import type { Action } from '../domain/types'
import { CHART_INDEX, chartKey, type Chart, type Scenario } from './charts'
import { parseRange, type Range } from './range'

export type ChartResolver = (key: string) => Chart | undefined

/** Default resolver: bundled charts only. The store wraps this with user overrides. */
export const bundledResolver: ChartResolver = (key) => CHART_INDEX.get(key)

/** Map any seat at any table size onto the seat names used by the 6-max chart set. */
export function sixMaxSeat(tableSize: number, seat: Seat): Seat {
  const s = chartSeat(tableSize, seat)
  if (s === 'UTG+1' || s === 'UTG+2' || s === 'UTG+3' || s === 'LJ') return 'UTG'
  return s
}

export interface ChartHit {
  chart: Chart
  /** True when the requested position pair was mapped onto a different chart. */
  mapped: boolean
}

/**
 * Finds a chart for a scenario. RFI uses the format-specific chart (6-max / full-ring);
 * everything else only exists for 6-max and is mapped onto it for bigger tables.
 * With an explicit `format` (e.g. '5max30' for the trainer) the key is looked up directly, no mapping.
 */
export function findChart(
  resolve: ChartResolver,
  tableSize: number,
  scenario: Scenario,
  hero: Seat,
  villain?: Seat,
  explicitFormat?: ChartFormat,
): ChartHit | null {
  if (explicitFormat) {
    const direct = resolve(chartKey(explicitFormat, scenario, hero, scenario === 'COLD_4BET' ? undefined : villain))
    return direct ? { chart: direct, mapped: false } : null
  }
  if (scenario === 'COLD_4BET') return null
  const format = chartFormatFor(tableSize)
  if (scenario === 'RFI') {
    const direct = resolve(chartKey(format, 'RFI', chartSeat(tableSize, hero)))
    if (direct) return { chart: direct, mapped: chartSeat(tableSize, hero) !== hero }
    const six = resolve(chartKey('6max', 'RFI', sixMaxSeat(tableSize, hero)))
    return six ? { chart: six, mapped: true } : null
  }
  const h = sixMaxSeat(tableSize, hero)
  const v = villain ? sixMaxSeat(tableSize, villain) : undefined
  const c = resolve(chartKey('6max', scenario, h, v))
  if (c) return { chart: c, mapped: h !== hero || v !== villain }
  return null
}

export interface ParsedChart {
  raise: Range
  call: Range
  allin: Range
  limp: Range
}

const parsedCache = new WeakMap<Chart, ParsedChart>()

export function parseChart(chart: Chart): ParsedChart {
  const hit = parsedCache.get(chart)
  if (hit) return hit
  const p: ParsedChart = {
    raise: chart.actions.raise ? parseRange(chart.actions.raise) : new Map(),
    call: chart.actions.call ? parseRange(chart.actions.call) : new Map(),
    allin: chart.actions.allin ? parseRange(chart.actions.allin) : new Map(),
    limp: chart.actions.limp ? parseRange(chart.actions.limp) : new Map(),
  }
  parsedCache.set(chart, p)
  return p
}

/** Frequencies for one hand class in a chart (fold is the remainder). */
export function chartFrequencies(chart: Chart, cls: string) {
  const p = parseChart(chart)
  const raise = p.raise.get(cls) ?? 0
  const call = p.call.get(cls) ?? 0
  const allin = p.allin.get(cls) ?? 0
  const limp = p.limp.get(cls) ?? 0
  const fold = Math.max(0, 1 - raise - call - allin - limp)
  return { raise, call, allin, limp, fold }
}

/** The whole "continue" range of a chart action (used to build postflop ranges). */
export function chartRange(chart: Chart, action: keyof ParsedChart): Range {
  return parseChart(chart)[action]
}

// ---------------------------------------------------------------------------
// Preflop line interpretation
// ---------------------------------------------------------------------------

export interface PreflopSpot {
  scenario: Scenario | 'BB_VS_LIMP' | 'COLD_4BET' | 'VS_5BET' | 'UNKNOWN'
  raiser?: Seat // last aggressor before hero
  opener?: Seat
  raises: number
  limpers: Seat[]
  callers: Seat[] // callers of the last raise
  notes: string[]
}

/** Classify the preflop situation hero faces given the preflop actions so far. */
export function classifyPreflop(hero: Seat, preflopActions: Action[], bigBlindSeat: Seat): PreflopSpot {
  const raisesList = preflopActions.filter((a) => a.kind === 'raise' || a.kind === 'bet' || a.kind === 'allin')
  const raises = raisesList.length
  const notes: string[] = []
  if (raises === 0) {
    const limpers = preflopActions.filter((a) => a.kind === 'call').map((a) => a.seat)
    if (hero === bigBlindSeat) return { scenario: 'BB_VS_LIMP', raises, limpers, callers: [], notes }
    if (limpers.length > 0) notes.push(`${limpers.length} limper(s) in front: iso-raise graded with the RFI chart (approximate).`)
    return { scenario: 'RFI', raises, limpers, callers: [], notes }
  }
  const lastRaise = raisesList[raises - 1]
  const lastRaiseIdx = preflopActions.lastIndexOf(lastRaise)
  const callers = preflopActions.slice(lastRaiseIdx + 1).filter((a) => a.kind === 'call').map((a) => a.seat)
  const opener = raisesList[0].seat
  if (raises === 1) {
    const limpers = preflopActions.slice(0, lastRaiseIdx).filter((a) => a.kind === 'call').map((a) => a.seat)
    if (callers.length > 0) notes.push(`${callers.length} caller(s) of the open: chart is for heads-up vs the open (squeeze spot, approximate).`)
    if (limpers.length > 0) notes.push('Limpers in front of the raise: chart assumes an unopened pot (approximate).')
    return { scenario: 'VS_RFI', raiser: lastRaise.seat, opener, raises, limpers, callers, notes }
  }
  if (raises === 2) {
    if (opener === hero) {
      if (callers.length > 0) notes.push('Cold-caller of the 3-bet present: chart is for heads-up (approximate).')
      return { scenario: 'VS_3BET', raiser: lastRaise.seat, opener, raises, limpers: [], callers, notes }
    }
    notes.push('Cold 4-bet spot (a raise and a 3-bet in front of you): no public GTO chart; not graded.')
    return { scenario: 'COLD_4BET', raiser: lastRaise.seat, opener, raises, limpers: [], callers, notes }
  }
  if (raises === 3) {
    const threeBettor = raisesList[1].seat
    if (threeBettor === hero) {
      return { scenario: 'VS_4BET', raiser: lastRaise.seat, opener, raises, limpers: [], callers, notes }
    }
    notes.push('Facing a 4-bet without being the 3-bettor: no public GTO chart; not graded.')
    return { scenario: 'UNKNOWN', raiser: lastRaise.seat, opener, raises, limpers: [], callers, notes }
  }
  notes.push('Facing a 5-bet+: no public GTO chart; not graded.')
  return { scenario: 'VS_5BET', raiser: lastRaise.seat, opener, raises, limpers: [], callers, notes }
}

/**
 * Recommended raise size in bb for the chart action (total "raise to"), following the sizing
 * guidance published alongside the RFI charts on pokercoaching.com:
 *  - open 2.5bb (SB 3bb); 3-bet 3.5x IP / 4x OOP; 4-bet 2.3x IP / 2.5x OOP.
 */
export function recommendedRaiseTo(
  scenario: Scenario,
  hero: Seat,
  heroInPosition: boolean,
  currentBet: number,
  bigBlind = 1,
): number {
  if (scenario === 'RFI') return hero === 'SB' ? 3 * bigBlind : 2.5 * bigBlind
  if (scenario === 'VS_RFI') return round1(currentBet * (heroInPosition ? 3.5 : 4))
  if (scenario === 'VS_3BET') return round1(currentBet * (heroInPosition ? 2.3 : 2.5))
  return round1(currentBet * 2.2)
}

function round1(x: number) {
  return Math.round(x * 10) / 10
}

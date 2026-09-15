import { handClass, type Card } from '../domain/cards'
import type { HandState } from '../domain/engine'
import { isOutOfPosition, type ChartFormat, type Seat } from '../domain/positions'
import type { Action, Analysis, AnalysisOption } from '../domain/types'
import type { Scenario } from './charts'
import { chartFrequencies, chartRange, classifyPreflop, findChart, recommendedRaiseTo, type ChartResolver } from './lookup'
import { multiplyRanges, parseRange, type Range } from './range'

export interface PreflopContext {
  tableSize: number
  hero: Seat
  heroCards: [Card, Card]
  state: HandState // state at hero's decision
  preflopActions: Action[] // actions so far this street (before hero acts)
  resolve: ChartResolver
  /** Explicit chart set (e.g. '5max30'); default = pick by table size with seat mapping. */
  chartFormat?: ChartFormat
  /** Raise sizing override ("raise to" in bb); default = the 100bb guidance in `recommendedRaiseTo`. */
  raiseTo?: (scenario: Scenario, hero: Seat, heroInPosition: boolean, currentBet: number) => number
}

function bigBlindSeat(): Seat {
  return 'BB'
}

/** Build the preflop analysis for hero's current decision. */
export function analyzePreflop(ctx: PreflopContext): Analysis {
  const cls = handClass(ctx.heroCards[0], ctx.heroCards[1])
  const spot = classifyPreflop(ctx.hero, ctx.preflopActions, bigBlindSeat())
  const notes = [...spot.notes]
  const toCall = ctx.state.currentBet - ctx.state.players[ctx.hero].committed

  const none = (why: string): Analysis => ({
    engine: 'none',
    confidence: 'approx',
    options: [],
    bestIndex: -1,
    notes: [...notes, why],
    scenario: spot.scenario,
  })

  if (spot.scenario === 'BB_VS_LIMP') {
    return none('Big blind facing limps: checking is free and no public GTO chart covers iso-raising here. Not graded.')
  }
  if (spot.scenario === 'VS_5BET' || spot.scenario === 'UNKNOWN') {
    return none('No chart for this spot.')
  }

  const scenario = spot.scenario
  const villain = scenario === 'RFI' ? undefined : spot.raiser
  const hit = findChart(ctx.resolve, ctx.tableSize, scenario, ctx.hero, villain, ctx.chartFormat)
  if (!hit) return none(`No ${scenario} chart for ${ctx.hero}${villain ? ' vs ' + villain : ''}.`)
  const { chart, mapped } = hit
  if (mapped) notes.push(`Using the ${chart.hero}${chart.villain ? ' vs ' + chart.villain : ''} ${chart.format} chart for this seat (approximate).`)
  if (chart.fidelity === 'approx') notes.push('Chart is an approximation of published solver ranges. Import a solver export in Settings for exact frequencies.')

  const f = chartFrequencies(chart, cls)
  const heroIp = villain ? !isOutOfPosition(ctx.tableSize, ctx.hero, villain) : true
  const raiseTo = (ctx.raiseTo ?? recommendedRaiseTo)(scenario, ctx.hero, heroIp, ctx.state.currentBet)
  const options: AnalysisOption[] = []

  const raiseLabel = scenario === 'RFI' ? 'Raise' : scenario === 'VS_RFI' ? '3-bet' : scenario === 'VS_3BET' || scenario === 'COLD_4BET' ? '4-bet' : '5-bet'
  if (f.allin > 0 || scenario === 'VS_4BET' || scenario === 'COLD_4BET') {
    options.push({ label: 'All-in', kind: 'allin', freq: f.allin })
  }
  if ((scenario !== 'VS_4BET' && scenario !== 'COLD_4BET') || f.raise > 0) {
    options.push({ label: `${raiseLabel} to ${raiseTo}bb`, kind: 'raise', amount: raiseTo, freq: f.raise })
  }
  if (scenario !== 'RFI' || spot.limpers.length > 0) {
    const callLabel = scenario === 'RFI' ? 'Limp along' : 'Call'
    options.push({ label: callLabel, kind: 'call', freq: f.call + f.limp })
  }
  options.push({ label: toCall > 0 || ctx.hero !== 'BB' ? 'Fold' : 'Check', kind: toCall > 0 || ctx.hero !== 'BB' ? 'fold' : 'check', freq: f.fold })

  let bestIndex = 0
  for (let i = 1; i < options.length; i++) if (options[i].freq > options[bestIndex].freq) bestIndex = i

  const approxSpot = spot.notes.length > 0 || mapped || chart.fidelity === 'approx'
  return {
    engine: 'preflop-chart',
    confidence: approxSpot ? 'approx' : 'gto',
    options,
    bestIndex,
    notes,
    source: chart.source,
    scenario: `${scenario}${villain ? ' vs ' + villain : ''}`,
  }
}

// ---------------------------------------------------------------------------
// Range construction for the postflop engines
// ---------------------------------------------------------------------------

export interface LineRanges {
  ranges: Map<Seat, Range>
  approx: boolean
  notes: string[]
}

/**
 * Derive each remaining player's preflop range from the preflop action line using the charts.
 * Unknown lines fall back to a wide, clearly flagged approximation.
 */
export function rangesFromPreflop(
  tableSize: number,
  preflopActions: Action[],
  seatsIn: Seat[],
  resolve: ChartResolver,
  /** Explicit chart set (e.g. '5max30'); default = pick by table size. */
  format?: ChartFormat,
): LineRanges {
  const find = (scenario: Scenario, hero: Seat, villain?: Seat) => findChart(resolve, tableSize, scenario, hero, villain, format)
  const notes: string[] = []
  let approx = false
  const ranges = new Map<Seat, Range>()
  const raisesList = preflopActions.filter((a) => a.kind === 'raise' || a.kind === 'bet' || a.kind === 'allin')
  const opener = raisesList[0]?.seat
  const threeBettor = raisesList[1]?.seat
  const fourBettor = raisesList[2]?.seat

  const fallbackFor = (seat: Seat, label: string): Range => {
    approx = true
    notes.push(`${seat}: no chart for "${label}", using the ${seat} open range as a stand-in.`)
    const hit = find('RFI', seat)
    return hit ? chartRange(hit.chart, 'raise') : parseRange('22+,A2s+,K2s+,Q2s+,J5s+,T7s+,97s+,86s+,75s+,65s,A2o+,K8o+,Q9o+,J9o+,T9o')
  }

  for (const seat of seatsIn) {
    const acts = preflopActions.filter((a) => a.seat === seat)
    const lastAct = acts[acts.length - 1]
    if (!lastAct) {
      // e.g. BB who never acted because everyone folded to a limp... treat as wide
      ranges.set(seat, fallbackFor(seat, 'no action'))
      continue
    }
    if (raisesList.length === 0) {
      // limped pot
      if (seat === 'BB' && lastAct.kind === 'check') {
        approx = true
        notes.push('BB checked a limped pot: using a full random range minus premium hands (approximate).')
        ranges.set(seat, parseRange('TT-22,AJs-A2s,K2s+,Q2s+,J2s+,T2s+,92s+,82s+,72s+,62s+,52s+,42s+,32s,AJo-A2o,K2o+,Q2o+,J2o+,T2o+,92o+,82o+,72o+,62o+,52o+,42o+,32o'))
      } else {
        ranges.set(seat, fallbackFor(seat, 'limp'))
      }
      continue
    }
    if (seat === opener) {
      const rfi = find('RFI', seat)
      let r = rfi ? chartRange(rfi.chart, 'raise') : fallbackFor(seat, 'open')
      if (threeBettor) {
        const v3 = find('VS_3BET', seat, threeBettor)
        if (v3) {
          const action = fourBettor === seat ? 'raise' : 'call'
          r = multiplyRanges(r, chartRange(v3.chart, action))
          if (raisesList.length >= 4 && fourBettor === seat) {
            approx = true
            notes.push(`${seat}: 4-bet then called a 5-bet; range approximated as the 4-bet range.`)
          }
        } else {
          r = fallbackFor(seat, 'vs 3-bet')
        }
      }
      ranges.set(seat, r)
      continue
    }
    if (seat === threeBettor) {
      const vr = find('VS_RFI', seat, opener!)
      let r = vr ? chartRange(vr.chart, 'raise') : fallbackFor(seat, '3-bet')
      if (fourBettor && fourBettor !== seat) {
        const v4 = find('VS_4BET', seat, opener!)
        if (v4) {
          const p = chartRange(v4.chart, lastAct.kind === 'allin' ? 'allin' : 'call')
          r = multiplyRanges(r, p)
        } else r = fallbackFor(seat, 'vs 4-bet')
      }
      ranges.set(seat, r)
      continue
    }
    // caller of the open (or of a 3-bet)
    if (lastAct.kind === 'call') {
      const lastRaiser = raisesList[raisesList.length - 1].seat
      if (raisesList.length === 1) {
        const vr = find('VS_RFI', seat, opener!)
        ranges.set(seat, vr ? chartRange(vr.chart, 'call') : fallbackFor(seat, 'call open'))
      } else {
        approx = true
        notes.push(`${seat}: cold-called a ${raisesList.length === 2 ? '3-bet' : '4-bet'}; using the "call vs 3-bet" range of an opener as a stand-in.`)
        const v3 = find('VS_3BET', seat, lastRaiser)
        ranges.set(seat, v3 ? chartRange(v3.chart, 'call') : fallbackFor(seat, 'cold call'))
      }
      continue
    }
    ranges.set(seat, fallbackFor(seat, lastAct.kind))
  }
  return { ranges, approx, notes }
}

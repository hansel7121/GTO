import type { Seat, ChartFormat } from '../../domain/positions'

/** COLD_4BET = hero faces an open and a 3-bet without being involved (chart keyed by hero seat only). */
export type Scenario = 'RFI' | 'VS_RFI' | 'VS_3BET' | 'VS_4BET' | 'COLD_4BET'

/**
 * A preflop chart: range strings per aggressive/passive action. Anything not covered folds
 * (or checks, for the BB with no raise in front). Weights use the solver ":w" syntax.
 */
export interface Chart {
  key: string
  format: ChartFormat
  scenario: Scenario
  hero: Seat
  villain?: Seat
  actions: { raise?: string; call?: string; allin?: string; limp?: string }
  source: string
  sourceLabel: string
  /** 'published' = transcribed verbatim from the cited source; 'approx' = editorial transcription of typical solver output. */
  fidelity: 'published' | 'approx'
  note?: string
}

export function chartKey(format: ChartFormat, scenario: Scenario, hero: Seat, villain?: Seat): string {
  return villain ? `${format}:${scenario}:${hero}:${villain}` : `${format}:${scenario}:${hero}`
}

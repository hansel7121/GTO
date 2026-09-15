import type { EngineConfig } from '../domain/engine'
import { seatsFor, type ChartFormat, type Seat } from '../domain/positions'

/** User-adjustable trainer game: number of seats and starting stack (bb). No ante / straddle. */
export interface TrainerSettings {
  players: number
  stackBb: number
}

export const DEFAULT_TRAINER_SETTINGS: TrainerSettings = { players: 5, stackBb: 30 }
export const PLAYER_OPTIONS = [3, 4, 5, 6, 7, 8, 9]
export const STACK_OPTIONS = [20, 25, 30, 40, 50, 60, 75, 100, 150, 200]

/**
 * Which bundled chart set grades a given depth. Two exist: the 5-handed 30bb set (short) and
 * the 100bb cash set (6-max / full-ring, picked by table size). Nothing in between, so depths
 * up to 40bb use the short set and 50bb+ the deep set — with a note in the UI.
 */
export function chartSetFor(stackBb: number): ChartFormat | undefined {
  return stackBb <= 40 ? '5max30' : undefined
}

export function chartSetLabel(s: TrainerSettings): string {
  if (chartSetFor(s.stackBb) === '5max30') return `30bb 5-max charts${s.stackBb !== 30 ? ` (approx at ${s.stackBb}bb)` : ''}${s.players !== 5 ? ' · seats mapped' : ''}`
  const fmt = s.players <= 6 ? '6-max' : 'full-ring'
  return `100bb ${fmt} cash charts${s.stackBb !== 100 ? ` (approx at ${s.stackBb}bb)` : ''}`
}

export function engineCfg(s: TrainerSettings): EngineConfig {
  return { tableSize: s.players, stackBb: s.stackBb, straddleBb: 0 }
}

export function trainerSeats(s: TrainerSettings): Seat[] {
  return seatsFor(s.players)
}

const KEY = 'gto-trainer:preflop-drill'

export function loadTrainerSettings(): TrainerSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_TRAINER_SETTINGS
    const p = JSON.parse(raw) as Partial<TrainerSettings>
    return {
      players: PLAYER_OPTIONS.includes(p.players ?? 0) ? p.players! : DEFAULT_TRAINER_SETTINGS.players,
      stackBb: STACK_OPTIONS.includes(p.stackBb ?? 0) ? p.stackBb! : DEFAULT_TRAINER_SETTINGS.stackBb,
    }
  } catch {
    return DEFAULT_TRAINER_SETTINGS
  }
}

export function saveTrainerSettings(s: TrainerSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private mode etc. */
  }
}

import { DEFAULT_TRAINER_SETTINGS, PLAYER_OPTIONS, STACK_OPTIONS } from '../trainer/config'
import type { Style } from './style'

export type StyleSetting = Style | 'mixed'
export type SolverSetting = 'auto' | 'full' | 'quick'

/** Full-hand trainer options: table shape, villain style, solver effort. */
export interface GtoSettings {
  players: number
  stackBb: number
  style: StyleSetting
  solver: SolverSetting
  /** Time budget per solve, seconds. */
  solveSeconds: number
  /** Show each villain's style on the table during the hand (otherwise revealed at the end). */
  showStyles: boolean
}

export const DEFAULT_GTO_SETTINGS: GtoSettings = {
  players: DEFAULT_TRAINER_SETTINGS.players,
  stackBb: DEFAULT_TRAINER_SETTINGS.stackBb,
  style: 'mixed',
  solver: 'auto',
  solveSeconds: 45,
  showStyles: false,
}
export const STYLE_OPTIONS: { value: StyleSetting; label: string }[] = [
  { value: 'mixed', label: 'Mixed (random per seat)' },
  { value: 'tight', label: 'Tight' },
  { value: 'gto', label: 'GTO' },
  { value: 'loose', label: 'Loose' },
  { value: 'maniac', label: 'Maniac' },
]
export const SOLVER_OPTIONS: { value: SolverSetting; label: string }[] = [
  { value: 'auto', label: 'Auto (full on desktop, quick on phone)' },
  { value: 'full', label: 'Full (solve from the flop, slow)' },
  { value: 'quick', label: 'Quick (flop by equity, turn/river solved)' },
]
export const SOLVE_SECONDS_OPTIONS = [15, 30, 45, 60, 90, 120]
export { PLAYER_OPTIONS, STACK_OPTIONS }

const KEY = 'gto-trainer:full-hand'

export function loadGtoSettings(): GtoSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_GTO_SETTINGS
    const p = JSON.parse(raw) as Partial<GtoSettings>
    return {
      players: PLAYER_OPTIONS.includes(p.players ?? 0) ? p.players! : DEFAULT_GTO_SETTINGS.players,
      stackBb: STACK_OPTIONS.includes(p.stackBb ?? 0) ? p.stackBb! : DEFAULT_GTO_SETTINGS.stackBb,
      style: STYLE_OPTIONS.some((o) => o.value === p.style) ? p.style! : DEFAULT_GTO_SETTINGS.style,
      solver: SOLVER_OPTIONS.some((o) => o.value === p.solver) ? p.solver! : DEFAULT_GTO_SETTINGS.solver,
      solveSeconds: SOLVE_SECONDS_OPTIONS.includes(p.solveSeconds ?? 0) ? p.solveSeconds! : DEFAULT_GTO_SETTINGS.solveSeconds,
      showStyles: !!p.showStyles,
    }
  } catch {
    return DEFAULT_GTO_SETTINGS
  }
}

export function saveGtoSettings(s: GtoSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private mode etc. */
  }
}

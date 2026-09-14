import type { ChartFormat, Seat } from '../../domain/positions'
import { CHARTS_30BB } from './charts30'
import { chartKey, type Chart, type Scenario } from './types'

export { chartKey, type Chart, type Scenario } from './types'

export const POKERCOACHING_URL = 'https://pokercoaching.com/preflop-charts/'
export const POKERCOACHING_LABEL = 'PokerCoaching.com free GTO preflop charts (100bb cash, text ranges on page)'
export const APPROX_LABEL =
  'Bundled approximation of published 100bb cash solver ranges (GTO Wizard-style, 2.5bb open / 3bb SB open). Import your own solver export in Settings for exact frequencies.'


const rfi = (format: ChartFormat, hero: Seat, raise: string, extra: Partial<Chart> = {}): Chart => ({
  key: chartKey(format, 'RFI', hero),
  format,
  scenario: 'RFI',
  hero,
  actions: { raise, ...(extra.actions ?? {}) },
  source: POKERCOACHING_URL,
  sourceLabel: POKERCOACHING_LABEL,
  fidelity: 'published',
  ...extra,
})

const approx = (
  format: ChartFormat,
  scenario: Scenario,
  hero: Seat,
  villain: Seat,
  actions: Chart['actions'],
  note?: string,
): Chart => ({
  key: chartKey(format, scenario, hero, villain),
  format,
  scenario,
  hero,
  villain,
  actions,
  source: 'https://blog.gtowizard.com/',
  sourceLabel: APPROX_LABEL,
  fidelity: 'approx',
  note,
})

// ---------------------------------------------------------------------------
// RFI — transcribed verbatim from pokercoaching.com ("Cash 6-Max 100BB" and
// "Cash Full-Ring 100BB" tables). SB rows on that page are "Raise or Call/Limp";
// the raise portion below is the top of that range (approx split), the rest limps.
// ---------------------------------------------------------------------------
const RFI_6MAX: Chart[] = [
  rfi('6max', 'UTG', '66+,A3s+,K8s+,Q9s+,J9s+,T9s,ATo+,KJo+,QJo', { note: 'Listed as "LJ" on the source (6-max first position).' }),
  rfi('6max', 'HJ', '55+,A2s+,K6s+,Q9s+,J9s+,T9s,98s,87s,76s,ATo+,KTo+,QTo+'),
  rfi('6max', 'CO', '33+,A2s+,K3s+,Q6s+,J8s+,T7s+,97s+,87s,76s,A8o+,KTo+,QTo+,JTo'),
  rfi('6max', 'BTN', '33+,A2s+,K2s+,Q3s+,J4s+,T6s+,96s+,85s+,75s+,64s+,53s+,A4o+,K8o+,Q9o+,J9o+,T8o+,98o'),
  rfi('6max', 'SB', '22+,A2s+,K2s+,Q2s+,J2s+,T3s+,94s+,84s+,74s+,63s+,53s+,43s,A2o+,K4o+,Q5o+,J7o+,T7o+,96o+,86o+,76o', {
    fidelity: 'published',
    note: 'Source lists SB as "Raise or Call 62.3%". Bundled as raise-first-in (3bb); limping is not modelled.',
  }),
]

const RFI_FULLRING: Chart[] = [
  rfi('fullring', 'UTG', '77+,A3s+,K9s+,QTs+,JTs,T9s,AQo+,KQo'),
  rfi('fullring', 'UTG+1', '77+,A3s+,K8s+,QTs+,JTs,T9s,AJo+,KQo'),
  rfi('fullring', 'LJ', '66+,A2s+,K7s+,QTs+,JTs,T9s,ATo+,KJo+'),
  rfi('fullring', 'HJ', '55+,A2s+,K5s+,Q9s+,J9s+,T9s,ATo+,KTo+,QJo'),
  rfi('fullring', 'CO', '44+,A2s+,K5s+,Q8s+,J8s+,T8s+,97s+,87s,76s,65s,54s,A8o+,KTo+,QTo+,JTo'),
  rfi('fullring', 'BTN', '22+,A2s+,K2s+,Q3s+,J5s+,T6s+,96s+,86s+,76s,65s,54s,A3o+,K8o+,Q9o+,J9o+,T9o'),
  rfi('fullring', 'SB', '22+,A2s+,K2s+,Q2s+,J2s+,T2s+,92s+,84s+,73s+,63s+,52s+,42s+,A2o+,K2o+,Q3o+,J5o+,T6o+,96o+,86o+,75o+,65o,54o', {
    note: 'Source lists SB as "Call or Raise 73.9%". Bundled as raise-first-in (3bb); limping is not modelled.',
  }),
]

// ---------------------------------------------------------------------------
// Facing an open (VS_RFI): 3-bet ("raise") and call ranges; rest folds.
// Approximate transcription of 100bb 6-max cash solver output.
// ---------------------------------------------------------------------------
const V = {
  // In-position 3-bet/call vs early-position opens
  HJ_vs_UTG: {
    raise: 'AA,KK,QQ,JJ:0.5,AKs,AKo,AQs:0.5,A5s,A4s:0.5,KQs:0.25,AQo:0.25',
    call: 'JJ:0.5,TT,99,88,77,66:0.5,AQs:0.5,AJs,ATs,KQs:0.75,KJs,KTs:0.5,QJs,JTs,T9s,AQo:0.5',
  },
  CO_vs_UTG: {
    raise: 'AA,KK,QQ,JJ:0.5,AKs,AKo,AQs:0.5,AQo:0.5,A5s,A4s,A3s:0.5,KQs:0.25,KJs:0.25,76s:0.25,65s:0.25',
    call: 'JJ:0.5,TT,99,88,77,66,55:0.5,AQs:0.5,AJs,ATs,A9s:0.5,KQs:0.75,KJs:0.75,KTs,QJs,QTs:0.5,JTs,T9s,98s,87s:0.5,AQo:0.5,AJo:0.25,KQo:0.25',
  },
  CO_vs_HJ: {
    raise: 'AA,KK,QQ,JJ:0.75,TT:0.25,AKs,AKo,AQs:0.75,AQo:0.5,AJs:0.25,A5s,A4s,A3s:0.5,A2s:0.25,KQs:0.5,KJs:0.25,76s:0.25,65s:0.25,54s:0.25',
    call: 'JJ:0.25,TT:0.75,99,88,77,66,55:0.5,44:0.25,AQs:0.25,AJs:0.75,ATs,A9s:0.5,KQs:0.5,KJs:0.75,KTs,K9s:0.25,QJs,QTs:0.5,JTs,T9s,98s,87s:0.5,76s:0.5,AQo:0.5,AJo:0.5,KQo:0.5',
  },
  BTN_vs_UTG: {
    raise: 'AA,KK,QQ,JJ:0.5,AKs,AKo,AQs:0.5,AQo:0.5,A5s,A4s,A3s:0.5,KQs:0.5,KJs:0.25,QJs:0.25,76s:0.25,65s:0.25,54s:0.25',
    call: 'JJ:0.5,TT,99,88,77,66,55,44,33:0.5,22:0.5,AQs:0.5,AJs,ATs,A9s,A8s:0.5,KQs:0.5,KJs:0.75,KTs,K9s:0.5,QJs:0.75,QTs,JTs,T9s,98s,87s,76s:0.75,65s:0.75,54s:0.5,AQo:0.5,AJo:0.5,KQo:0.5',
  },
  BTN_vs_HJ: {
    raise: 'AA,KK,QQ,JJ:0.75,TT:0.25,AKs,AKo,AQs:0.75,AQo:0.5,AJs:0.25,AJo:0.25,A5s,A4s,A3s,A2s:0.5,KQs:0.5,KJs:0.25,KTs:0.25,QJs:0.25,JTs:0.25,76s:0.25,65s:0.25,54s:0.25',
    call: 'JJ:0.25,TT:0.75,99,88,77,66,55,44,33:0.5,22:0.5,AQs:0.25,AJs:0.75,ATs,A9s,A8s,A7s:0.5,A6s:0.5,A2s:0.5,KQs:0.5,KJs:0.75,KTs:0.75,K9s,K8s:0.5,QJs:0.75,QTs,Q9s:0.5,JTs:0.75,J9s:0.5,T9s,T8s:0.5,98s,97s:0.5,87s,86s:0.25,76s:0.75,65s:0.75,54s:0.75,AQo:0.5,AJo:0.75,ATo:0.5,KQo:0.75,KJo:0.5,QJo:0.25',
  },
  BTN_vs_CO: {
    raise: 'AA,KK,QQ,JJ,TT:0.5,AKs,AKo,AQs,AQo:0.75,AJs:0.5,AJo:0.5,ATs:0.25,A5s,A4s,A3s,A2s:0.75,KQs:0.75,KQo:0.25,KJs:0.5,KTs:0.25,K9s:0.25,QJs:0.25,JTs:0.25,T9s:0.25,76s:0.25,65s:0.25,54s:0.25',
    call: 'TT:0.5,99,88,77,66,55,44,33:0.75,22:0.75,AJs:0.5,ATs:0.75,A9s,A8s,A7s,A6s:0.75,A2s:0.25,KQs:0.25,KJs:0.5,KTs:0.75,K9s:0.75,K8s:0.5,K7s:0.25,QJs:0.75,QTs,Q9s:0.75,Q8s:0.25,JTs:0.75,J9s:0.75,J8s:0.25,T9s:0.75,T8s:0.5,98s,97s:0.5,87s,86s:0.5,76s:0.75,75s:0.25,65s:0.75,54s:0.75,AQo:0.25,AJo:0.5,ATo:0.75,A9o:0.25,KQo:0.75,KJo:0.75,KTo:0.25,QJo:0.5,JTo:0.25',
  },
  // Small blind: mostly 3-bet or fold, a few flats
  SB_vs_UTG: {
    raise: 'AA,KK,QQ,JJ:0.75,TT:0.5,AKs,AKo,AQs,AQo:0.5,AJs,ATs:0.5,A5s,A4s,KQs,KJs:0.5,KTs:0.25,QJs:0.25,JTs:0.25',
    call: 'JJ:0.25,TT:0.5,99,88,77:0.5,ATs:0.5,A9s:0.25,KTs:0.25,QJs:0.5,JTs:0.5,T9s:0.5',
  },
  SB_vs_HJ: {
    raise: 'AA,KK,QQ,JJ,TT:0.75,99:0.25,AKs,AKo,AQs,AQo:0.75,AJs,AJo:0.25,ATs:0.75,A9s:0.25,A5s,A4s,A3s:0.5,KQs,KQo:0.25,KJs:0.75,KTs:0.5,K9s:0.25,QJs:0.5,QTs:0.25,JTs:0.5,T9s:0.25,76s:0.25,65s:0.25',
    call: 'TT:0.25,99:0.75,88,77,66:0.5,55:0.25,ATs:0.25,A9s:0.25,KTs:0.25,QJs:0.5,QTs:0.25,JTs:0.5,T9s:0.5,98s:0.5,87s:0.25',
  },
  SB_vs_CO: {
    raise: 'AA,KK,QQ,JJ,TT,99:0.5,88:0.25,AKs,AKo,AQs,AQo,AJs,AJo:0.5,ATs,A9s:0.5,A8s:0.25,A5s,A4s,A3s,A2s:0.5,KQs,KQo:0.5,KJs,KJo:0.25,KTs:0.75,K9s:0.5,K8s:0.25,QJs:0.75,QTs:0.5,Q9s:0.25,JTs:0.75,J9s:0.25,T9s:0.5,98s:0.25,87s:0.25,76s:0.25,65s:0.25,54s:0.25',
    call: '99:0.5,88:0.5,77:0.75,66:0.5,55:0.5,44:0.25,A9s:0.25,A8s:0.25,KTs:0.25,K9s:0.25,QTs:0.5,JTs:0.25,J9s:0.25,T9s:0.5,98s:0.5,87s:0.5,76s:0.5,65s:0.5',
  },
  SB_vs_BTN: {
    raise: 'AA,KK,QQ,JJ,TT,99,88:0.75,77:0.5,66:0.25,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo:0.75,A9s:0.5,A9o:0.25,A8s:0.75,A7s:0.75,A6s:0.5,A5s,A4s,A3s,A2s,KQs,KQo,KJs,KJo:0.75,KTs,KTo:0.25,K9s:0.5,K8s:0.5,K7s:0.25,K6s:0.25,K5s:0.25,QJs,QJo:0.5,QTs:0.75,Q9s:0.5,Q8s:0.25,JTs,J9s:0.5,J8s:0.25,T9s:0.75,T8s:0.5,98s:0.75,97s:0.25,87s:0.75,76s:0.75,65s:0.75,54s:0.5',
    call: '88:0.25,77:0.5,66:0.75,55:0.75,44:0.5,33:0.25,22:0.25,A9s:0.5,A8s:0.25,A6s:0.5,K9s:0.5,K8s:0.25,QTs:0.25,Q9s:0.25,J9s:0.25,T9s:0.25,T8s:0.25,98s:0.25,87s:0.25,76s:0.25,65s:0.25,54s:0.5',
  },
  // Big blind defense (call wide, 3-bet polarised)
  BB_vs_UTG: {
    raise: 'AA,KK,QQ,JJ:0.5,AKs,AKo,AQs:0.5,AQo:0.25,A5s:0.75,A4s:0.75,A3s:0.25,KQs:0.25,76s:0.25,65s:0.25,54s:0.25',
    call: 'JJ:0.5,TT,99,88,77,66,55,44,33,22,AQs:0.5,AJs,ATs,A9s,A8s,A7s,A6s,A5s:0.25,A4s:0.25,A3s:0.75,A2s,KQs:0.75,KJs,KTs,K9s,K8s,K7s:0.5,K6s:0.5,K5s:0.5,QJs,QTs,Q9s,Q8s:0.5,JTs,J9s,J8s:0.5,T9s,T8s,T7s:0.5,98s,97s,87s,86s:0.5,76s:0.75,75s:0.5,65s:0.75,64s:0.5,54s:0.75,53s:0.25,AQo:0.75,AJo,ATo,A9o:0.25,KQo,KJo,KTo:0.5,QJo,QTo:0.25,JTo:0.5',
  },
  BB_vs_HJ: {
    raise: 'AA,KK,QQ,JJ:0.75,TT:0.25,AKs,AKo,AQs:0.75,AQo:0.5,AJs:0.25,A5s,A4s,A3s:0.5,A2s:0.25,KQs:0.5,KJs:0.25,K9s:0.25,K8s:0.25,76s:0.25,65s:0.25,54s:0.25',
    call: 'JJ:0.25,TT:0.75,99,88,77,66,55,44,33,22,AQs:0.25,AJs:0.75,ATs,A9s,A8s,A7s,A6s,A3s:0.5,A2s:0.75,KQs:0.5,KJs:0.75,KTs,K9s:0.75,K8s:0.75,K7s,K6s,K5s,K4s:0.5,K3s:0.25,K2s:0.25,QJs,QTs,Q9s,Q8s,Q7s:0.5,Q6s:0.5,Q5s:0.25,JTs,J9s,J8s,J7s:0.5,T9s,T8s,T7s,T6s:0.25,98s,97s,96s:0.5,87s,86s,85s:0.25,76s:0.75,75s,65s:0.75,64s,54s:0.75,53s:0.5,43s:0.25,AQo:0.5,AJo,ATo,A9o,A8o:0.5,A7o:0.25,A5o:0.25,KQo,KJo,KTo,K9o:0.5,QJo,QTo,Q9o:0.25,JTo,J9o:0.25,T9o:0.5',
  },
  BB_vs_CO: {
    raise: 'AA,KK,QQ,JJ,TT:0.5,AKs,AKo,AQs,AQo:0.75,AJs:0.5,AJo:0.25,ATs:0.25,A5s,A4s,A3s:0.75,A2s:0.5,KQs:0.5,KJs:0.5,KTs:0.25,K9s:0.25,K8s:0.25,K7s:0.25,QJs:0.25,JTs:0.25,T9s:0.25,76s:0.25,65s:0.25,54s:0.25',
    call: 'TT:0.5,99,88,77,66,55,44,33,22,AJs:0.5,ATs:0.75,A9s,A8s,A7s,A6s,A3s:0.25,A2s:0.5,KQs:0.5,KJs:0.5,KTs:0.75,K9s:0.75,K8s:0.75,K7s:0.75,K6s,K5s,K4s,K3s,K2s,QJs:0.75,QTs,Q9s,Q8s,Q7s,Q6s,Q5s,Q4s:0.5,Q3s:0.5,Q2s:0.25,JTs:0.75,J9s,J8s,J7s,J6s:0.5,J5s:0.25,T9s:0.75,T8s,T7s,T6s,T5s:0.25,98s,97s,96s,95s:0.25,87s,86s,85s,84s:0.25,76s:0.75,75s,74s:0.5,65s:0.75,64s,63s:0.25,54s:0.75,53s,43s:0.5,AQo:0.25,AJo:0.75,ATo,A9o,A8o,A7o,A6o:0.5,A5o:0.75,A4o:0.5,A3o:0.25,A2o:0.25,KQo,KJo,KTo,K9o,K8o:0.5,QJo,QTo,Q9o:0.5,JTo,J9o:0.5,T9o,T8o:0.25,98o:0.25',
  },
  BB_vs_BTN: {
    raise: 'AA,KK,QQ,JJ,TT:0.75,99:0.25,AKs,AKo,AQs,AQo,AJs:0.75,AJo:0.5,ATs:0.5,ATo:0.25,A9s:0.25,A5s,A4s,A3s,A2s:0.75,KQs:0.75,KQo:0.25,KJs:0.5,KTs:0.5,K9s:0.25,K8s:0.25,K7s:0.25,K6s:0.25,QJs:0.5,QTs:0.25,JTs:0.25,T9s:0.25,98s:0.25,87s:0.25,76s:0.25,65s:0.25,54s:0.25',
    call: 'TT:0.25,99:0.75,88,77,66,55,44,33,22,AJs:0.25,ATs:0.5,A9s:0.75,A8s,A7s,A6s,A2s:0.25,KQs:0.25,KJs:0.5,KTs:0.5,K9s:0.75,K8s:0.75,K7s:0.75,K6s:0.75,K5s,K4s,K3s,K2s,QJs:0.5,QTs:0.75,Q9s,Q8s,Q7s,Q6s,Q5s,Q4s,Q3s,Q2s,JTs:0.75,J9s,J8s,J7s,J6s,J5s,J4s,J3s:0.5,J2s:0.5,T9s:0.75,T8s,T7s,T6s,T5s,T4s:0.5,T3s:0.5,T2s:0.25,98s:0.75,97s,96s,95s,94s:0.5,93s:0.25,87s:0.75,86s,85s,84s,83s:0.25,76s:0.75,75s,74s,73s:0.25,65s:0.75,64s,63s,62s:0.25,54s:0.75,53s,52s:0.25,43s,42s:0.25,32s:0.25,AJo:0.5,ATo:0.75,A9o,A8o,A7o,A6o,A5o,A4o,A3o,A2o,KQo:0.75,KJo,KTo,K9o,K8o,K7o,K6o:0.5,K5o:0.5,K4o:0.25,QJo,QTo,Q9o,Q8o,Q7o:0.5,Q6o:0.25,JTo,J9o,J8o,J7o:0.5,T9o,T8o,T7o:0.5,98o,97o:0.5,87o,86o:0.25,76o:0.75,65o:0.5,54o:0.25',
  },
  BB_vs_SB: {
    raise: 'AA,KK,QQ,JJ,TT,99:0.75,88:0.5,77:0.25,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo:0.75,A9s:0.75,A9o:0.5,A8s:0.5,A8o:0.25,A7s:0.5,A6s:0.5,A5s,A4s,A3s,A2s:0.75,KQs,KQo,KJs,KJo:0.75,KTs:0.5,KTo:0.5,K9s:0.5,K9o:0.25,K8s:0.5,K7s:0.5,K6s:0.5,K5s:0.5,K4s:0.25,K3s:0.25,K2s:0.25,QJs,QJo:0.5,QTs:0.75,QTo:0.25,Q9s:0.5,Q8s:0.25,JTs:0.75,JTo:0.25,J9s:0.5,J8s:0.25,T9s:0.5,T8s:0.25,98s:0.5,97s:0.25,87s:0.5,76s:0.5,65s:0.5,54s:0.5',
    call: '99:0.25,88:0.5,77:0.75,66,55,44,33,22,ATo:0.25,A9s:0.25,A9o:0.5,A8s:0.5,A8o:0.75,A7s:0.5,A7o,A6s:0.5,A6o,A5o,A4o,A3o,A2o,A2s:0.25,KJo:0.25,KTs:0.5,KTo:0.5,K9s:0.5,K9o:0.75,K8s:0.5,K8o,K7s:0.5,K7o,K6s:0.5,K6o,K5s:0.5,K5o,K4s:0.75,K4o:0.75,K3s:0.75,K3o:0.5,K2s:0.75,K2o:0.5,QJo:0.5,QTs:0.25,QTo:0.75,Q9s:0.5,Q9o,Q8s:0.75,Q8o,Q7s,Q7o:0.75,Q6s,Q6o:0.5,Q5s,Q5o:0.5,Q4s,Q4o:0.25,Q3s,Q2s,JTs:0.25,JTo:0.75,J9s:0.5,J9o,J8s:0.75,J8o,J7s,J7o:0.75,J6s,J6o:0.5,J5s,J5o:0.25,J4s,J3s,J2s,T9s:0.5,T9o,T8s:0.75,T8o,T7s,T7o:0.75,T6s,T6o:0.5,T5s,T4s,T3s,T2s:0.5,98s:0.5,98o,97s:0.75,97o:0.75,96s,96o:0.5,95s,94s,93s:0.5,92s:0.25,87s:0.5,87o,86s:0.75,86o:0.5,85s,84s,83s:0.5,76s:0.5,76o:0.75,75s:0.75,75o:0.5,74s,73s:0.5,65s:0.5,65o:0.5,64s:0.75,63s:0.5,54s:0.5,54o:0.25,53s:0.75,52s:0.25,43s:0.5,42s:0.25,32s:0.25',
  },
}

const VS_RFI_6MAX: Chart[] = [
  approx('6max', 'VS_RFI', 'HJ', 'UTG', V.HJ_vs_UTG),
  approx('6max', 'VS_RFI', 'CO', 'UTG', V.CO_vs_UTG),
  approx('6max', 'VS_RFI', 'CO', 'HJ', V.CO_vs_HJ),
  approx('6max', 'VS_RFI', 'BTN', 'UTG', V.BTN_vs_UTG),
  approx('6max', 'VS_RFI', 'BTN', 'HJ', V.BTN_vs_HJ),
  approx('6max', 'VS_RFI', 'BTN', 'CO', V.BTN_vs_CO),
  approx('6max', 'VS_RFI', 'SB', 'UTG', V.SB_vs_UTG),
  approx('6max', 'VS_RFI', 'SB', 'HJ', V.SB_vs_HJ),
  approx('6max', 'VS_RFI', 'SB', 'CO', V.SB_vs_CO),
  approx('6max', 'VS_RFI', 'SB', 'BTN', V.SB_vs_BTN),
  approx('6max', 'VS_RFI', 'BB', 'UTG', V.BB_vs_UTG),
  approx('6max', 'VS_RFI', 'BB', 'HJ', V.BB_vs_HJ),
  approx('6max', 'VS_RFI', 'BB', 'CO', V.BB_vs_CO),
  approx('6max', 'VS_RFI', 'BB', 'BTN', V.BB_vs_BTN),
  approx('6max', 'VS_RFI', 'BB', 'SB', V.BB_vs_SB),
]

// ---------------------------------------------------------------------------
// Facing a 3-bet after opening (VS_3BET): 4-bet ("raise"), call; rest folds.
// Grouped by the opener and the 3-bettor's position type.
// ---------------------------------------------------------------------------
const T = {
  // early opener (UTG/HJ) vs in-position 3-bet
  EP_vs_IP: {
    raise: 'AA,KK,QQ:0.5,AKs,AKo:0.5,A5s:0.5,A4s:0.5,AQo:0.25,KQs:0.25',
    call: 'QQ:0.5,JJ,TT,99,88:0.75,77:0.5,66:0.25,AKo:0.5,AQs,AQo:0.5,AJs,ATs,A9s:0.25,A5s:0.5,A4s:0.5,KQs:0.75,KJs,KTs:0.5,QJs,JTs,T9s:0.5',
  },
  // early opener vs blinds' 3-bet (hero in position)
  EP_vs_BLIND: {
    raise: 'AA,KK,QQ:0.5,AKs,AKo:0.5,A5s:0.5,A4s:0.5,AQo:0.25,KQs:0.25,AJs:0.25',
    call: 'QQ:0.5,JJ,TT,99,88,77:0.75,66:0.5,AKo:0.5,AQs,AQo:0.75,AJs:0.75,ATs,A9s:0.5,A5s:0.5,A4s:0.5,A3s:0.5,KQs:0.75,KJs,KTs:0.75,K9s:0.25,QJs,QTs:0.5,JTs,T9s:0.75,98s:0.5,87s:0.25',
  },
  // CO opener vs IP 3-bet (BTN)
  CO_vs_IP: {
    raise: 'AA,KK,QQ:0.75,JJ:0.25,AKs,AKo:0.75,AQs:0.25,A5s:0.75,A4s:0.75,A3s:0.25,AQo:0.25,KQs:0.25,KJs:0.25',
    call: 'QQ:0.25,JJ:0.75,TT,99,88,77,66:0.75,55:0.5,44:0.25,AKo:0.25,AQs:0.75,AQo:0.5,AJs,ATs,A9s:0.5,A8s:0.25,A5s:0.25,A4s:0.25,KQs:0.75,KJs:0.75,KTs:0.75,K9s:0.25,QJs,QTs:0.5,JTs,T9s,98s:0.75,87s:0.5,76s:0.5,65s:0.25',
  },
  CO_vs_BLIND: {
    raise: 'AA,KK,QQ:0.75,JJ:0.25,AKs,AKo:0.75,AQs:0.25,AQo:0.5,A5s:0.75,A4s:0.75,A3s:0.5,A2s:0.25,KQs:0.25,KJs:0.25,AJo:0.25',
    call: 'QQ:0.25,JJ:0.75,TT,99,88,77,66,55:0.75,44:0.5,33:0.25,22:0.25,AKo:0.25,AQs:0.75,AQo:0.5,AJs,AJo:0.25,ATs,A9s:0.75,A8s:0.5,A7s:0.25,A5s:0.25,A4s:0.25,A3s:0.5,A2s:0.5,KQs:0.75,KQo:0.25,KJs:0.75,KTs,K9s:0.5,K8s:0.25,QJs,QTs:0.75,Q9s:0.25,JTs,J9s:0.5,T9s,T8s:0.5,98s,87s:0.75,76s:0.75,65s:0.5,54s:0.5',
  },
  // BTN opener vs blinds' 3-bet
  BTN_vs_BLIND: {
    raise: 'AA,KK,QQ,JJ:0.5,TT:0.25,AKs,AKo,AQs:0.5,AQo:0.5,AJs:0.25,A5s,A4s,A3s:0.5,A2s:0.25,KQs:0.25,KJs:0.25,KTs:0.25,AJo:0.25,KQo:0.25',
    call: 'JJ:0.5,TT:0.75,99,88,77,66,55,44:0.75,33:0.5,22:0.5,AQs:0.5,AQo:0.5,AJs:0.75,AJo:0.5,ATs,ATo:0.25,A9s,A8s,A7s:0.75,A6s:0.5,A3s:0.5,A2s:0.5,KQs:0.75,KQo:0.5,KJs:0.75,KJo:0.25,KTs:0.75,K9s:0.75,K8s:0.5,K7s:0.25,K6s:0.25,QJs,QTs,Q9s:0.75,Q8s:0.25,JTs,J9s:0.75,J8s:0.25,T9s,T8s:0.75,T7s:0.25,98s,97s:0.5,87s,86s:0.5,76s,75s:0.25,65s,64s:0.25,54s:0.75',
  },
  // SB opener vs BB 3-bet
  SB_vs_BB: {
    raise: 'AA,KK,QQ,JJ:0.75,TT:0.25,AKs,AKo,AQs:0.75,AQo:0.5,AJs:0.5,AJo:0.25,ATs:0.25,A5s,A4s,A3s:0.75,A2s:0.5,KQs:0.5,KQo:0.25,KJs:0.25,KTs:0.25,K9s:0.25,K8s:0.25,K7s:0.25,K6s:0.25,K5s:0.25,QJs:0.25',
    call: 'JJ:0.25,TT:0.75,99,88,77,66,55,44,33:0.5,22:0.5,AQs:0.25,AQo:0.5,AJs:0.5,AJo:0.5,ATs:0.75,ATo:0.5,A9s,A9o:0.25,A8s,A7s,A6s:0.75,A3s:0.25,A2s:0.5,KQs:0.5,KQo:0.5,KJs:0.75,KJo:0.5,KTs:0.75,KTo:0.25,K9s:0.75,K8s:0.5,K7s:0.5,K6s:0.5,K5s:0.5,K4s:0.25,QJs:0.75,QJo:0.25,QTs,Q9s:0.75,Q8s:0.5,Q7s:0.25,JTs,J9s:0.75,J8s:0.5,T9s,T8s:0.75,T7s:0.5,98s,97s:0.5,87s,86s:0.5,76s,75s:0.5,65s,64s:0.5,54s,53s:0.25,43s:0.25',
  },
}

const VS_3BET_6MAX: Chart[] = [
  approx('6max', 'VS_3BET', 'UTG', 'HJ', T.EP_vs_IP),
  approx('6max', 'VS_3BET', 'UTG', 'CO', T.EP_vs_IP),
  approx('6max', 'VS_3BET', 'UTG', 'BTN', T.EP_vs_IP),
  approx('6max', 'VS_3BET', 'UTG', 'SB', T.EP_vs_BLIND),
  approx('6max', 'VS_3BET', 'UTG', 'BB', T.EP_vs_BLIND),
  approx('6max', 'VS_3BET', 'HJ', 'CO', T.EP_vs_IP),
  approx('6max', 'VS_3BET', 'HJ', 'BTN', T.EP_vs_IP),
  approx('6max', 'VS_3BET', 'HJ', 'SB', T.EP_vs_BLIND),
  approx('6max', 'VS_3BET', 'HJ', 'BB', T.EP_vs_BLIND),
  approx('6max', 'VS_3BET', 'CO', 'BTN', T.CO_vs_IP),
  approx('6max', 'VS_3BET', 'CO', 'SB', T.CO_vs_BLIND),
  approx('6max', 'VS_3BET', 'CO', 'BB', T.CO_vs_BLIND),
  approx('6max', 'VS_3BET', 'BTN', 'SB', T.BTN_vs_BLIND),
  approx('6max', 'VS_3BET', 'BTN', 'BB', T.BTN_vs_BLIND),
  approx('6max', 'VS_3BET', 'SB', 'BB', T.SB_vs_BB),
]

// ---------------------------------------------------------------------------
// Facing a 4-bet after 3-betting (VS_4BET): 5-bet all-in ("allin"), call; rest folds.
// ---------------------------------------------------------------------------
const F = {
  IP_3BETTOR: {
    // hero 3-bet in position (HJ/CO/BTN) and the opener 4-bets
    allin: 'AA,KK,AKs:0.5,QQ:0.5,AKo:0.25',
    call: 'QQ:0.5,JJ,TT:0.75,99:0.25,AKs:0.5,AKo:0.75,AQs,AQo:0.25,AJs:0.5,A5s:0.5,A4s:0.25,KQs:0.5,KJs:0.25,JTs:0.25,T9s:0.25',
  },
  BLIND_3BETTOR: {
    // hero 3-bet from SB/BB and the opener 4-bets
    allin: 'AA,KK,QQ:0.75,AKs:0.75,AKo:0.5,A5s:0.25',
    call: 'QQ:0.25,JJ,TT:0.75,99:0.5,88:0.25,AKs:0.25,AKo:0.5,AQs,AQo:0.5,AJs:0.5,ATs:0.25,A5s:0.25,A4s:0.25,KQs:0.5,KJs:0.25,QJs:0.25,JTs:0.25',
  },
}

const VS_4BET_6MAX: Chart[] = (() => {
  const out: Chart[] = []
  const seats: Seat[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']
  for (let h = 0; h < seats.length; h++) {
    for (let v = 0; v < h; v++) {
      const hero = seats[h]
      const villain = seats[v]
      const spec = hero === 'SB' || hero === 'BB' ? F.BLIND_3BETTOR : F.IP_3BETTOR
      out.push(approx('6max', 'VS_4BET', hero, villain, spec))
    }
  }
  return out
})()

export const BUNDLED_CHARTS: Chart[] = [
  ...RFI_6MAX,
  ...RFI_FULLRING,
  ...VS_RFI_6MAX,
  ...VS_3BET_6MAX,
  ...VS_4BET_6MAX,
  ...CHARTS_30BB,
]

export const CHART_INDEX: Map<string, Chart> = new Map(BUNDLED_CHARTS.map((c) => [c.key, c]))

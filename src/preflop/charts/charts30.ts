import type { Seat } from '../../domain/positions'
import { chartKey, type Chart, type Scenario } from './types'

/**
 * 5-handed, 30bb effective, no ante (SB 0.5 / BB 1) — the charts behind the preflop trainer.
 * Sizes assumed: open 2.5bb (SB 3bb); 3-bet 3x in position / 3.5x out of position; a 4-bet is
 * always all-in at this depth, so VS_3BET has no non-all-in raise and VS_4BET is "call the jam".
 * Editorial approximation of typical 30bb solver output — labelled approx in the app and
 * replaceable per chart in Settings → Preflop ranges.
 */
export const LABEL_30BB = 'Bundled approximation of 30bb 5-handed solver ranges (no ante, 2.5bb open / 3bb SB open, 4-bet = all-in). Import your own solver export in Settings for exact frequencies.'
const SOURCE_30BB = 'https://blog.gtowizard.com/'

export const SEATS_30BB: Seat[] = ['HJ', 'CO', 'BTN', 'SB', 'BB']

const c30 = (scenario: Scenario, hero: Seat, actions: Chart['actions'], villain?: Seat, note?: string): Chart => ({
  key: chartKey('5max30', scenario, hero, villain),
  format: '5max30',
  scenario,
  hero,
  villain,
  actions,
  source: SOURCE_30BB,
  sourceLabel: LABEL_30BB,
  fidelity: 'approx',
  note,
})

// ---------------------------------------------------------------------------
// RFI (raise first in). Everything else folds; the SB never limps in this model.
// ---------------------------------------------------------------------------
const RFI: Chart[] = [
  c30('RFI', 'HJ', { raise: '44+,A2s+,K7s+,Q9s+,J9s+,T9s,98s,87s,ATo+,KJo+,QJo' }),
  c30('RFI', 'CO', { raise: '22+,A2s+,K5s+,Q8s+,J8s+,T8s+,97s+,87s,76s,65s,A8o+,KTo+,QTo+,JTo' }),
  c30('RFI', 'BTN', { raise: '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,86s+,75s+,65s,54s,A2o+,K8o+,Q9o+,J9o+,T9o' }),
  c30('RFI', 'SB', { raise: '22+,A2s+,K2s+,Q2s+,J4s+,T6s+,96s+,86s+,75s+,65s,54s,A2o+,K7o+,Q9o+,J9o+,T9o' }, undefined, 'Raise-or-fold model: limping is not modelled.'),
]

// ---------------------------------------------------------------------------
// Facing an open (VS_RFI): 3-bet ("raise"), flat ("call"), jam ("allin"); rest folds.
// ---------------------------------------------------------------------------
const V = {
  CO_vs_HJ: {
    raise: 'QQ+,AKs,AKo,JJ:0.5,AQs:0.5,A5s:0.5,A4s:0.5,KQs:0.25',
    call: 'JJ:0.5,TT,99,88,77,66:0.5,AQs:0.5,AJs,ATs,KQs:0.75,KJs,QJs,JTs,T9s,AQo:0.75,AJo:0.25,KQo:0.25',
  },
  BTN_vs_HJ: {
    raise: 'QQ+,AKs,AKo,JJ:0.75,TT:0.25,AQs:0.75,AQo:0.5,A5s,A4s:0.5,A3s:0.25,KQs:0.5,KJs:0.25',
    call: 'JJ:0.25,TT:0.75,99,88,77,66,55:0.5,44:0.25,AQs:0.25,AJs,ATs,A9s:0.5,KQs:0.5,KJs:0.75,KTs:0.75,QJs,QTs:0.5,JTs,T9s,98s:0.5,AQo:0.5,AJo:0.5,KQo:0.5',
  },
  BTN_vs_CO: {
    raise: 'JJ+,AKs,AKo,TT:0.5,AQs,AQo:0.75,AJs:0.5,A5s,A4s,A3s:0.5,A2s:0.25,KQs:0.5,KJs:0.5,KTs:0.25,QJs:0.25,AJo:0.25,KQo:0.25',
    call: 'TT:0.5,99,88,77,66,55,44:0.5,33:0.25,22:0.25,AJs:0.5,ATs,A9s,A8s:0.5,A7s:0.25,KQs:0.5,KJs:0.5,KTs:0.75,K9s:0.5,QJs:0.75,QTs,Q9s:0.5,JTs,J9s:0.5,T9s,98s,87s:0.5,76s:0.5,AQo:0.25,AJo:0.75,ATo:0.5,KQo:0.75,KJo:0.5,QJo:0.25',
  },
  SB_vs_HJ: {
    raise: 'QQ+,AKs,AKo,JJ:0.75,TT:0.5,AQs:0.75,AQo:0.5,AJs:0.5,A5s:0.75,A4s:0.5,KQs:0.5,KJs:0.25',
    allin: 'JJ:0.25,TT:0.5,99:0.5,AQs:0.25,AQo:0.25,AJs:0.25',
    call: '99:0.5,88,77,66:0.5,AJs:0.25,ATs:0.5,KQs:0.5,QJs:0.25,JTs:0.25',
  },
  SB_vs_CO: {
    raise: 'JJ+,AKs,AKo,TT:0.5,AQs,AQo:0.75,AJs:0.75,ATs:0.25,A5s,A4s:0.75,A3s:0.25,KQs:0.75,KJs:0.5,KTs:0.25,QJs:0.25,KQo:0.25',
    allin: 'TT:0.5,99:0.75,88:0.5,AQo:0.25,AJs:0.25,ATs:0.5,AJo:0.5,KQo:0.25',
    call: '88:0.5,77,66:0.5,55:0.25,ATs:0.25,A9s:0.5,KJs:0.25,QJs:0.5,JTs:0.5,T9s:0.5',
  },
  SB_vs_BTN: {
    raise: 'TT+,AKs,AKo,99:0.5,AQs,AQo,AJs,ATs:0.5,A9s:0.25,A5s,A4s,A3s:0.5,A2s:0.25,KQs,KJs:0.75,KTs:0.5,QJs:0.5,AJo:0.5,KQo:0.5,KJo:0.25',
    allin: '99:0.5,88:0.75,77:0.5,66:0.25,ATs:0.5,A9s:0.5,A8s:0.5,AJo:0.5,ATo:0.5,KQo:0.5,KJo:0.25,QJo:0.25',
    call: '77:0.5,66:0.75,55:0.5,44:0.5,33:0.25,22:0.25,A9s:0.25,A8s:0.5,A7s:0.5,A6s:0.5,K9s:0.5,QTs:0.5,JTs:0.75,T9s:0.75,98s:0.5,87s:0.5,76s:0.25',
  },
  BB_vs_HJ: {
    raise: 'QQ+,AKs,AKo,JJ:0.5,AQs:0.5,A5s:0.5,A4s:0.5,KQs:0.25',
    allin: 'JJ:0.25,TT:0.25,AQs:0.25,AQo:0.25',
    call: 'JJ:0.25,TT:0.75,99-22,AQs:0.25,AJs-A6s,A5s:0.5,A4s:0.5,A3s,A2s,KQs:0.75,KJs-K5s,QJs-Q8s,JTs-J8s,T9s,T8s,98s,97s:0.5,87s,76s,65s,54s,AQo:0.75,AJo,ATo,A9o:0.5,KQo,KJo,KTo:0.5,QJo,QTo:0.5,JTo',
  },
  BB_vs_CO: {
    raise: 'JJ+,AKs,AKo,TT:0.5,AQs:0.75,AQo:0.5,AJs:0.25,A5s:0.75,A4s:0.75,A3s:0.5,KQs:0.5,KJs:0.25,KQo:0.25',
    allin: 'TT:0.25,99:0.25,AQo:0.25,AJs:0.25,AJo:0.25',
    call: 'TT:0.25,99:0.75,88-22,AQs:0.25,AJs:0.5,ATs-A6s,A5s:0.25,A4s:0.25,A3s:0.5,A2s,KQs:0.5,KJs:0.75,KTs-K2s,QJs-Q5s,JTs-J7s,T9s-T7s,98s-96s,87s,86s,76s,75s,65s,64s,54s,53s,43s,AQo:0.25,AJo:0.75,ATo,A9o,A8o,A7o:0.5,KQo:0.75,KJo,KTo,K9o:0.5,QJo,QTo,Q9o:0.5,JTo,J9o:0.5,T9o:0.5',
  },
  BB_vs_BTN: {
    raise: 'TT+,AKs,AKo,99:0.5,AQs,AQo,AJs:0.75,ATs:0.5,A5s,A4s,A3s:0.5,A2s:0.5,KQs:0.75,KJs:0.5,KTs:0.25,QJs:0.25,AJo:0.5,KQo:0.5,K5s:0.25,K4s:0.25,K3s:0.25,K2s:0.25',
    allin: '99:0.25,88:0.25,AJo:0.25,ATo:0.25,A9s:0.25',
    call: '99:0.25,88:0.75,77-22,AJs:0.25,ATs:0.5,A9s:0.75,A8s,A7s,A6s,A3s:0.5,A2s:0.5,KQs:0.25,KJs:0.5,KTs:0.75,K9s,K8s,K7s,K6s,K5s:0.75,K4s:0.75,K3s:0.75,K2s:0.75,QJs:0.75,QTs,Q9s,Q8s,Q7s,Q6s,Q5s,Q4s:0.5,Q3s:0.5,Q2s:0.5,JTs,J9s,J8s,J7s,J6s,J5s:0.5,T9s,T8s,T7s,T6s:0.5,98s,97s,96s,87s,86s,85s:0.5,76s,75s,74s:0.5,65s,64s,54s,53s,43s,AJo:0.25,ATo:0.75,A9o,A8o,A7o,A6o,A5o,A4o,A3o:0.5,A2o:0.5,KQo:0.5,KJo,KTo,K9o,K8o:0.5,K7o:0.25,QJo,QTo,Q9o,Q8o:0.5,JTo,J9o,J8o:0.5,T9o,T8o:0.5,98o:0.5,87o:0.25',
  },
  BB_vs_SB: {
    raise: '99+,AKs,AKo,88:0.5,AQs,AQo,AJs,ATs:0.75,A9s:0.5,A5s,A4s,A3s:0.75,A2s:0.5,KQs,KJs:0.75,KTs:0.5,K9s:0.25,QJs:0.5,QTs:0.25,JTs:0.25,AJo:0.75,ATo:0.5,KQo:0.75,KJo:0.5,QJo:0.25',
    allin: '88:0.25,77:0.25,ATo:0.25,A9o:0.25,KJo:0.25',
    call: '88:0.25,77:0.75,66-22,ATs:0.25,A9s:0.5,A8s-A6s,A3s:0.25,A2s:0.5,KJs:0.25,KTs:0.5,K9s:0.75,K8s-K2s,QJs:0.5,QTs:0.75,Q9s-Q2s,JTs:0.75,J9s-J4s,T9s-T5s,98s-95s,87s-85s,76s,75s,74s,65s,64s,63s,54s,53s,43s,AJo:0.25,ATo:0.25,A9o:0.75,A8o-A2o,KQo:0.25,KJo:0.25,KTo,K9o-K5o,QJo:0.75,QTo,Q9o,Q8o,Q7o:0.5,JTo,J9o,J8o,J7o:0.5,T9o,T8o,T7o:0.5,98o,97o:0.5,87o,76o:0.5,65o:0.5',
  },
}

const VS_RFI: Chart[] = [
  c30('VS_RFI', 'CO', V.CO_vs_HJ, 'HJ'),
  c30('VS_RFI', 'BTN', V.BTN_vs_HJ, 'HJ'),
  c30('VS_RFI', 'BTN', V.BTN_vs_CO, 'CO'),
  c30('VS_RFI', 'SB', V.SB_vs_HJ, 'HJ'),
  c30('VS_RFI', 'SB', V.SB_vs_CO, 'CO'),
  c30('VS_RFI', 'SB', V.SB_vs_BTN, 'BTN'),
  c30('VS_RFI', 'BB', V.BB_vs_HJ, 'HJ'),
  c30('VS_RFI', 'BB', V.BB_vs_CO, 'CO'),
  c30('VS_RFI', 'BB', V.BB_vs_BTN, 'BTN'),
  c30('VS_RFI', 'BB', V.BB_vs_SB, 'SB'),
]

// ---------------------------------------------------------------------------
// Opener facing a 3-bet (VS_3BET): 4-bet jam ("allin") or flat ("call"); rest folds.
// When the 3-bet itself is a jam, only the "allin" part continues (see trainer/analyze30).
// ---------------------------------------------------------------------------
const T = {
  EARLY_vs_IP: {
    allin: 'QQ+,AKs,AKo:0.75,JJ:0.5,AQs:0.25,A5s:0.25',
    call: 'JJ:0.5,TT,99,88:0.75,77:0.5,66:0.25,AKo:0.25,AQs:0.75,AQo:0.5,AJs,ATs:0.75,A5s:0.5,A4s:0.5,KQs,KJs:0.75,KTs:0.5,QJs:0.75,JTs:0.75,T9s:0.5,98s:0.5,KQo:0.25',
  },
  EARLY_vs_BLIND: {
    allin: 'QQ+,AKs,AKo,JJ:0.75,TT:0.25,AQs:0.5,AQo:0.25,A5s:0.5',
    call: 'JJ:0.25,TT:0.75,99,88,77:0.75,66:0.5,55:0.25,AQs:0.5,AQo:0.5,AJs,ATs,A9s:0.5,A5s:0.5,A4s:0.5,KQs,KJs,KTs:0.75,QJs,QTs:0.5,JTs,T9s:0.75,98s:0.5,87s:0.5,AJo:0.25,KQo:0.5',
  },
  LATE_vs_BLIND: {
    allin: 'JJ+,AKs,AKo,TT:0.75,99:0.25,AQs:0.75,AQo:0.5,AJs:0.25,A5s:0.5,A4s:0.25,KQs:0.25',
    call: 'TT:0.25,99:0.75,88,77,66,55:0.75,44:0.5,33:0.25,22:0.25,AQs:0.25,AQo:0.5,AJs:0.75,ATs,A9s,A8s:0.75,A7s:0.5,A6s:0.25,A5s:0.5,A4s:0.75,A3s:0.5,A2s:0.5,KQs:0.75,KJs,KTs,K9s:0.75,K8s:0.5,QJs,QTs,Q9s:0.75,JTs,J9s:0.75,T9s,T8s:0.5,98s,87s,76s,65s:0.75,54s:0.5,AJo:0.75,ATo:0.5,KQo:0.75,KJo:0.5,QJo:0.25,JTo:0.25',
  },
  SB_vs_BB: {
    allin: 'TT+,AKs,AKo,99:0.75,88:0.5,AQs,AQo:0.75,AJs:0.5,ATs:0.25,A5s:0.5,A4s:0.5,KQs:0.5,AJo:0.25',
    call: '99:0.25,88:0.5,77,66,55,44:0.75,33:0.5,22:0.5,AQo:0.25,AJs:0.5,ATs:0.75,A9s,A8s,A7s,A6s:0.75,A5s:0.5,A4s:0.5,A3s:0.75,A2s:0.75,KQs:0.5,KJs,KTs,K9s,K8s:0.75,K7s:0.5,K6s:0.5,K5s:0.5,QJs,QTs,Q9s,Q8s:0.5,JTs,J9s,J8s:0.5,T9s,T8s:0.5,98s,97s:0.5,87s,76s,65s,54s,AJo:0.75,ATo,A9o:0.5,KQo,KJo:0.75,KTo:0.5,QJo:0.75,QTo:0.5,JTo:0.5',
  },
}

const VS_3BET: Chart[] = [
  c30('VS_3BET', 'HJ', T.EARLY_vs_IP, 'CO'),
  c30('VS_3BET', 'HJ', T.EARLY_vs_IP, 'BTN'),
  c30('VS_3BET', 'HJ', T.EARLY_vs_BLIND, 'SB'),
  c30('VS_3BET', 'HJ', T.EARLY_vs_BLIND, 'BB'),
  c30('VS_3BET', 'CO', T.EARLY_vs_IP, 'BTN'),
  c30('VS_3BET', 'CO', T.EARLY_vs_BLIND, 'SB'),
  c30('VS_3BET', 'CO', T.EARLY_vs_BLIND, 'BB'),
  c30('VS_3BET', 'BTN', T.LATE_vs_BLIND, 'SB'),
  c30('VS_3BET', 'BTN', T.LATE_vs_BLIND, 'BB'),
  c30('VS_3BET', 'SB', T.SB_vs_BB, 'BB'),
]

// ---------------------------------------------------------------------------
// 3-bettor facing the opener's 4-bet jam (VS_4BET): call or fold.
// ---------------------------------------------------------------------------
const F = {
  IP_3BETTOR: { call: 'JJ+,AKs,AKo,TT:0.75,99:0.25,AQs:0.5,AQo:0.25' },
  BLIND_vs_EARLY: { call: 'JJ+,AKs,AKo,TT:0.5,AQs:0.5,AQo:0.25' },
  BLIND_vs_LATE: { call: 'TT+,AKs,AKo,99:0.75,88:0.25,AQs,AQo:0.75,AJs:0.5,AJo:0.25,KQs:0.25' },
}

const VS_4BET: Chart[] = (() => {
  const out: Chart[] = []
  for (let h = 0; h < SEATS_30BB.length; h++) {
    for (let v = 0; v < h; v++) {
      const hero = SEATS_30BB[h]
      const villain = SEATS_30BB[v]
      const spec = hero === 'SB' || hero === 'BB' ? (villain === 'BTN' || villain === 'SB' ? F.BLIND_vs_LATE : F.BLIND_vs_EARLY) : F.IP_3BETTOR
      out.push(c30('VS_4BET', hero, spec, villain, 'The 4-bet is a jam at 30bb: call or fold.'))
    }
  }
  return out
})()

// ---------------------------------------------------------------------------
// Cold 4-bet spot: an open and a 3-bet in front of hero. Jam the top, flat a sliver.
// Also the generic fallback for off-model lines (e.g. after a limp) when hero faces a jam.
// ---------------------------------------------------------------------------
const COLD: Chart[] = SEATS_30BB.map((hero) =>
  c30('COLD_4BET', hero, { allin: 'KK+,QQ:0.75,AKs,AKo:0.5', call: 'QQ:0.25,JJ:0.5,AKo:0.5,AQs:0.25' }, undefined, 'Generic cold 4-bet range (any opener / 3-bettor).'),
)

export const CHARTS_30BB: Chart[] = [...RFI, ...VS_RFI, ...VS_3BET, ...VS_4BET, ...COLD]

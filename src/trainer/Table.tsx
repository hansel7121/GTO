import { useEffect, useState } from 'react'
import { trim } from '../app/format'
import type { Card } from '../domain/cards'
import type { HandState } from '../domain/engine'
import type { Seat } from '../domain/positions'
import type { Action } from '../domain/types'
import { PlayingCard } from './PlayingCard'

/**
 * Seat slots around the oval as % of the table box, clockwise from the hero at the bottom.
 * Phones get a narrower ellipse so the side pods stay on screen.
 */
function seatSlots(n: number, small: boolean): { x: number; y: number }[] {
  const rx = small ? 34 : 43
  const ry = small ? 39 : 39
  return Array.from({ length: n }, (_, k) => {
    const th = Math.PI / 2 + (2 * Math.PI * k) / n
    return { x: 50 + rx * Math.cos(th), y: 50 + ry * Math.sin(th) }
  })
}

function useIsSmall() {
  const [small, setSmall] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  useEffect(() => {
    const h = () => setSmall(window.innerWidth < 640)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return small
}

function chipPos(slot: { x: number; y: number }, small: boolean) {
  // between the pod and the centre of the felt (further in on phones, where pods are wider relative to the felt)
  const t = small ? 0.55 : slot.y > 50 ? 0.38 : 0.42
  return { x: slot.x + (50 - slot.x) * t, y: slot.y + (50 - slot.y) * t }
}

function actionLabel(a: Action): string {
  switch (a.kind) {
    case 'fold': return 'Fold'
    case 'check': return 'Check'
    case 'call': return 'Call'
    case 'allin': return 'All-in'
    default: return `Raise ${trim(a.amount ?? 0)}`
  }
}

export function Table({
  seats,
  hero,
  cards,
  state,
  actions,
  activeSeat,
  reveal,
  stackBb,
}: {
  seats: Seat[]
  hero: Seat
  cards: Record<string, [Card, Card]>
  state: HandState
  /** Actions visible so far (the state must be computed from exactly these). */
  actions: Action[]
  activeSeat: Seat | null
  /** Show every remaining villain's cards (end of hand). */
  reveal: boolean
  stackBb: number
}) {
  const small = useIsSmall()
  const slots = seatSlots(seats.length, small)
  const heroIdx = seats.indexOf(hero)
  const lastBySeat = new Map<Seat, Action>()
  for (const a of actions) lastBySeat.set(a.seat, a)
  return (
    <div className="relative w-full aspect-[1.25] sm:aspect-[1.7] select-none">
      {/* rim + felt */}
      <div className="absolute inset-[7%_3%] rounded-[50%] pn-rim">
        <div className="absolute inset-[10px] sm:inset-[14px] rounded-[50%] pn-felt flex flex-col items-center justify-center">
          <div className="font-black tracking-[0.15em] text-[clamp(18px,4.5vw,44px)] text-white/15">GTO TRAINER</div>
          <div className="text-[clamp(8px,1.6vw,14px)] text-white/10 -mt-1">
            {seats.length}-max · {trim(stackBb)}bb · preflop
          </div>
        </div>
      </div>
      {/* pot */}
      <div className="absolute left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1f1f1f]/90 border border-[#3a3a3a] text-white text-xs sm:text-sm px-3 py-0.5 tabular-nums">
        {trim(state.pot)}
      </div>
      {seats.map((seat, i) => {
        const slot = slots[(i - heroIdx + seats.length) % seats.length]
        const p = state.players[seat]
        const isHero = seat === hero
        const last = lastBySeat.get(seat)
        const showFace = isHero || (reveal && !p.folded)
        const chip = chipPos(slot, small)
        return (
          <div key={seat} className="contents">
            {p.committed > 0 && (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1"
                style={{ left: `${chip.x}%`, top: `${chip.y}%` }}
              >
                <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#f4d445] border-2 border-[#d9b92a] shadow" />
                <span className="text-[11px] sm:text-xs font-semibold text-[#f4d445] tabular-nums drop-shadow">{trim(p.committed)}</span>
              </div>
            )}
            <div
              className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-end ${isHero ? 'gap-2' : 'gap-1'} ${p.folded ? 'opacity-45' : ''}`}
              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            >
              {(!p.folded || isHero) && (
                <div className={`flex ${isHero ? 'gap-1' : '-space-x-4'} -mb-1`}>
                  <div className={isHero ? '' : '-rotate-6'}>
                    <PlayingCard card={showFace ? cards[seat][0] : undefined} faceDown={!showFace} size={isHero ? 'lg' : 'sm'} />
                  </div>
                  <div className={isHero ? '' : 'rotate-6'}>
                    <PlayingCard card={showFace ? cards[seat][1] : undefined} faceDown={!showFace} size={isHero ? 'lg' : 'sm'} />
                  </div>
                </div>
              )}
              <div
                className={`relative rounded-md px-2.5 py-1 min-w-[64px] sm:min-w-[80px] bg-[#1f1f1f] border ${
                  activeSeat === seat ? 'border-white shadow-[0_0_12px_rgba(255,255,255,.55)]' : 'border-[#3a3a3a]'
                }`}
              >
                <div className="text-[11px] sm:text-sm font-semibold text-white leading-tight whitespace-nowrap">{isHero ? `you · ${seat}` : seat}</div>
                <div className="text-[11px] sm:text-sm text-[#cfcfcf] tabular-nums leading-tight">{trim(p.stack)}</div>
                {last && (
                  <div className={`absolute -top-2.5 right-1 rounded px-1 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide ${
                    last.kind === 'fold' ? 'bg-[#3a3a3a] text-[#bdbdbd]' : last.kind === 'allin' ? 'bg-[#c43c3c] text-white' : 'bg-[#2f9e5f] text-white'
                  }`}>
                    {actionLabel(last)}
                  </div>
                )}
                {seat === 'BTN' && (
                  <span className="absolute -left-2 -top-2 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#3b82f6] text-white text-[9px] sm:text-[10px] font-bold flex items-center justify-center border border-white/60">
                    D
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

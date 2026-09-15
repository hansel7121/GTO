import { useEffect, useState } from 'react'
import { trim } from '../app/format'
import { EPS, type HandState } from '../domain/engine'
import type { Seat } from '../domain/positions'
import type { Action } from '../domain/types'
import { facingAllIn } from './analyze30'
import { legalRaise } from './sim'

const btn = 'whitespace-nowrap rounded-md border-2 bg-[#1e1e1e] px-3 sm:px-5 py-3 uppercase tracking-[0.12em] font-semibold text-xs sm:text-sm transition disabled:cursor-not-allowed'
const green = 'border-[#3f9e5a] text-[#4fc06f] hover:bg-[#233d2b] active:bg-[#2a4a33]'
const red = 'border-[#c43c3c] text-[#e04b4b] hover:bg-[#3d2323] active:bg-[#4a2a2a]'
const grey = 'border-[#3a3a3a] text-[#5a5a5a]'

export function ActionBar({
  state,
  hero,
  enabled,
  onAct,
  presets: extraPresets,
  customNote,
}: {
  state: HandState
  hero: Seat
  enabled: boolean
  onAct: (a: Action) => void
  /** Extra "raise to / bet" presets, e.g. the solver's tree sizes. */
  presets?: { label: string; to: number }[]
  /** Shown under the size panel (e.g. "custom sizes re-solve the spot"). */
  customNote?: string
}) {
  const me = state.players[hero]
  const toCall = Math.max(0, state.currentBet - me.committed)
  const callAmt = Math.min(toCall, me.stack)
  const canCheck = toCall <= EPS
  const maxTo = me.committed + me.stack
  const canRaise = !facingAllIn(state, hero) && state.minRaiseTo < maxTo + EPS
  // remounted by the page for every new decision (key), so no reset effect is needed
  const [raising, setRaising] = useState(false)
  const [to, setTo] = useState(Math.min(maxTo, state.minRaiseTo))

  const postflop = state.street !== 'preflop'
  const isBet = postflop && state.currentBet <= EPS
  const fold = () => onAct({ seat: hero, kind: 'fold' })
  const callOrCheck = () => onAct({ seat: hero, kind: canCheck ? 'check' : 'call' })
  const allin = () => onAct({ seat: hero, kind: 'allin' })
  const confirmRaise = () => {
    const a = legalRaise(state, hero, to)
    onAct(a.kind === 'raise' && isBet ? { ...a, kind: 'bet' } : a)
  }

  useEffect(() => {
    if (!enabled) return
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' && e.key !== 'Enter' && e.key !== 'Escape') return
      switch (e.key.toLowerCase()) {
        case 'f': fold(); break
        case 'c': callOrCheck(); break
        case 'a': allin(); break
        case 'r': if (canRaise) setRaising(true); break
        case 'enter': if (raising) confirmRaise(); break
        case 'escape': setRaising(false); break
        default: return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const pot = state.pot
  const presets: { label: string; to: number }[] = [...(extraPresets ?? [])]
  if (!postflop) {
    if (state.currentBet <= 1 + EPS) {
      presets.push({ label: '2.5x', to: 2.5 }, { label: '3x', to: 3 }, { label: '4x', to: 4 })
    } else {
      presets.push({ label: '2.5x', to: state.currentBet * 2.5 }, { label: '3x', to: state.currentBet * 3 }, { label: '3.5x', to: state.currentBet * 3.5 })
    }
    presets.push({ label: 'Pot', to: pot + toCall + toCall })
  } else if (isBet) {
    for (const f of [0.33, 0.5, 0.75, 1]) presets.push({ label: `${Math.round(f * 100)}%`, to: Math.round(pot * f * 10) / 10 })
  } else {
    presets.push({ label: '2.5x', to: state.currentBet * 2.5 }, { label: 'Pot', to: state.currentBet + pot + toCall })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {raising && canRaise && (
        <div className="w-full sm:w-auto rounded-md bg-[#1e1e1e] border border-[#3a3a3a] p-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="px-2 py-1 rounded bg-[#2a2a2a] text-xs text-[#dedede] hover:bg-[#333]" onClick={() => setTo(state.minRaiseTo)}>
              Min
            </button>
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                className="px-2 py-1 rounded bg-[#2a2a2a] text-xs text-[#dedede] hover:bg-[#333] disabled:opacity-40"
                disabled={p.to < state.minRaiseTo - EPS || p.to > maxTo + EPS}
                onClick={() => setTo(Math.round(p.to * 10) / 10)}
              >
                {p.label}
              </button>
            ))}
            <button type="button" className="px-2 py-1 rounded bg-[#2a2a2a] text-xs text-[#e04b4b] hover:bg-[#333]" onClick={() => setTo(maxTo)}>
              All-in
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={state.minRaiseTo}
              max={maxTo}
              step={0.5}
              value={Math.min(maxTo, Math.max(state.minRaiseTo, to))}
              onChange={(e) => setTo(Number(e.target.value))}
              className="flex-1 accent-[#4fc06f]"
            />
            <input
              type="number"
              inputMode="decimal"
              min={state.minRaiseTo}
              max={maxTo}
              step={0.5}
              value={to}
              onChange={(e) => setTo(Number(e.target.value))}
              className="w-20 rounded bg-[#111] border border-[#3a3a3a] px-2 py-1 text-sm text-white tabular-nums"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" className={`${btn} ${grey} text-[#bdbdbd]`} onClick={() => setRaising(false)}>
              Cancel
            </button>
            <button type="button" className={`${btn} ${green}`} onClick={confirmRaise}>
              {to >= maxTo - EPS ? 'All-in' : `${isBet ? 'Bet' : 'Raise to'} ${trim(Math.min(maxTo, Math.max(state.minRaiseTo, to)))}`}
            </button>
          </div>
          {customNote && <div className="text-[10px] text-[#8a8a8a]">{customNote}</div>}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" disabled={!enabled || canCheck} className={`${btn} ${!enabled || canCheck ? grey : green}`} onClick={callOrCheck}>
          Call {!canCheck && enabled ? trim(callAmt) : ''}
        </button>
        <button type="button" disabled={!enabled || !canRaise} className={`${btn} ${!enabled || !canRaise ? grey : green}`} onClick={() => setRaising((r) => !r)}>
          {isBet ? 'Bet' : 'Raise'}
        </button>
        <button type="button" disabled={!enabled || !canCheck} className={`${btn} ${!enabled || !canCheck ? grey : green}`} onClick={callOrCheck}>
          Check
        </button>
        <button type="button" disabled={!enabled} className={`${btn} ${!enabled ? grey : red}`} onClick={fold}>
          Fold
        </button>
      </div>
      <div className="text-[10px] text-[#6f6f6f] tracking-wide">F fold · C call/check · R raise · A all-in · Enter confirm</div>
    </div>
  )
}

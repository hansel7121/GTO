import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useChartResolver } from '../app/useCharts'
import { handClass } from '../domain/cards'
import { computeState } from '../domain/engine'
import type { Action } from '../domain/types'
import { db, newId } from '../storage/db'
import { ActionBar } from './ActionBar'
import {
  PLAYER_OPTIONS,
  STACK_OPTIONS,
  chartSetLabel,
  engineCfg,
  loadTrainerSettings,
  saveTrainerSettings,
  type TrainerSettings,
} from './config'
import { DecisionFeedback, HandSummary } from './Feedback'
import { Table } from './Table'
import { advance, dealHand, heroAct, makeRng, outcomeOf, type TrainerHand } from './sim'

type Phase = 'dealing' | 'acting' | 'feedback' | 'over'

/** Delay between villain actions being revealed, ms. */
const REVEAL_MS = 380

export function TrainerPage() {
  const resolve = useChartResolver()
  const rng = useRef(makeRng((Date.now() ^ (Math.random() * 1e9)) >>> 0))
  const handRef = useRef<TrainerHand | null>(null)
  const [, bump] = useState(0)
  const rerender = () => bump((v) => v + 1)
  const [phase, setPhase] = useState<Phase>('dealing')
  const [shown, setShown] = useState(0) // number of actions revealed on the table
  const [session, setSession] = useState({ graded: 0, correct: 0 })
  const [settings, setSettings] = useState<TrainerSettings>(loadTrainerSettings)
  const [showSettings, setShowSettings] = useState(false)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const timer = useRef<number | null>(null)

  const allTime = useLiveQuery(async () => {
    const all = await db.drills.toArray()
    return { graded: all.length, correct: all.filter((d) => d.correct).length }
  }, [], { graded: 0, correct: 0 })

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }

  /** Reveal villain actions one by one, then settle into the phase the hand is in. */
  const revealFrom = useCallback((from: number) => {
    const hand = handRef.current!
    const total = hand.actions.length
    const settle = () => {
      const last = hand.decisions[hand.decisions.length - 1]
      setPhase(last && !last.chosen ? 'acting' : 'over')
    }
    const step = (n: number) => {
      setShown(n)
      if (n >= total) {
        settle()
        return
      }
      timer.current = window.setTimeout(() => step(n + 1), REVEAL_MS)
    }
    clearTimer()
    if (from >= total) {
      setShown(total)
      settle()
    } else {
      setPhase('dealing')
      timer.current = window.setTimeout(() => step(from + 1), REVEAL_MS)
    }
  }, [])

  const deal = useCallback(() => {
    // skip hands where hero never gets to act (e.g. everyone folds to hero in the big blind)
    const s = settingsRef.current
    let hand = dealHand(s, rng.current, (handRef.current?.id ?? 0) + 1)
    for (let tries = 0; tries < 50; tries++) {
      advance(hand, resolve, rng.current)
      if (hand.decisions.length > 0) break
      hand = dealHand(s, rng.current, hand.id)
    }
    handRef.current = hand
    setShown(0)
    rerender()
    revealFrom(0)
  }, [resolve, revealFrom])

  useEffect(() => {
    // StrictMode mounts twice: keep the first hand, but restart the reveal its cleanup cancelled
    if (!handRef.current) deal()
    else revealFrom(0)
    return clearTimer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onAct = (a: Action) => {
    const hand = handRef.current!
    if (phase !== 'acting') return
    const d = heroAct(hand, a)
    setShown(hand.actions.length)
    setPhase('feedback')
    rerender()
    if (d.analysis.correct !== undefined) {
      const ok = d.analysis.correct
      setSession((s) => ({ graded: s.graded + 1, correct: s.correct + (ok ? 1 : 0) }))
      const cls = handClass(hand.cards[hand.heroSeat][0], hand.cards[hand.heroSeat][1])
      void db.drills.add({
        id: newId(),
        createdAt: Date.now(),
        heroSeat: hand.heroSeat,
        cls,
        scenario: d.analysis.scenario ?? '',
        chosen: d.analysis.chosenIndex !== undefined ? d.analysis.options[d.analysis.chosenIndex].label : a.kind,
        best: d.analysis.bestIndex >= 0 ? d.analysis.options[d.analysis.bestIndex].label : '',
        correct: ok,
      })
    }
  }

  const applySettings = (next: TrainerSettings) => {
    setSettings(next)
    settingsRef.current = next
    saveTrainerSettings(next)
    deal() // new game shape: start a fresh hand
  }

  const onContinue = () => {
    const hand = handRef.current!
    const from = hand.actions.length
    advance(hand, resolve, rng.current)
    rerender()
    revealFrom(from)
  }

  // Enter / space advance whatever is waiting
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
      if (phase === 'feedback') onContinue()
      else if (phase === 'over') deal()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const hand = handRef.current
  if (!hand) return null
  const cfg = engineCfg(hand.settings)
  const visible = computeState(cfg, 0, hand.actions.slice(0, shown))
  const finalState = computeState(cfg, 0, hand.actions)
  const pending = hand.decisions[hand.decisions.length - 1]
  const heroCls = handClass(hand.cards[hand.heroSeat][0], hand.cards[hand.heroSeat][1])
  const activeSeat = phase === 'acting' ? hand.heroSeat : phase === 'dealing' ? visible.toAct : null
  const pct = (s: { graded: number; correct: number }) => (s.graded ? `${Math.round((100 * s.correct) / s.graded)}%` : '—')

  return (
    <div className="fixed inset-0 overflow-auto bg-[#1b1b1b] text-white">
      <div className="min-h-full flex flex-col px-3 sm:px-6 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/" className="rounded bg-[#262626] border border-[#3a3a3a] px-2 py-1 text-[#dedede] hover:bg-[#303030]">
              ← Home
            </Link>
            <span className="rounded bg-[#262626] border border-[#3a3a3a] px-2 py-1 tabular-nums whitespace-nowrap">
              <span className="hidden sm:inline">Session </span>
              <b>{session.correct}/{session.graded}</b> · {pct(session)}
            </span>
            <span className="hidden sm:inline rounded bg-[#262626] border border-[#3a3a3a] px-2 py-1 tabular-nums text-[#bdbdbd]">
              All-time {allTime.correct}/{allTime.graded} · {pct(allTime)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[#9a9a9a] whitespace-nowrap">
            <span>
              <span className="hidden sm:inline">
                NLH <b className="text-white">0.5 / 1</b> ·{' '}
              </span>
              {hand.settings.stackBb}bb · {hand.settings.players}-max · #{hand.id}
            </span>
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className={`rounded border px-2 py-1 ${showSettings ? 'bg-[#303030] border-[#5a5a5a] text-white' : 'bg-[#262626] border-[#3a3a3a] text-[#dedede] hover:bg-[#303030]'}`}
              aria-label="Trainer settings"
            >
              ⚙
            </button>
          </div>
        </div>
        {showSettings && (
          <div className="mt-2 rounded-md bg-[#1e1e1e] border border-[#3a3a3a] p-3 flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1 text-xs text-[#9a9a9a]">
              Stacks (bb)
              <select
                value={settings.stackBb}
                onChange={(e) => applySettings({ ...settings, stackBb: Number(e.target.value) })}
                className="rounded bg-[#111] border border-[#3a3a3a] px-2 py-1.5 text-sm text-white"
              >
                {STACK_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[#9a9a9a]">
              Players
              <select
                value={settings.players}
                onChange={(e) => applySettings({ ...settings, players: Number(e.target.value) })}
                className="rounded bg-[#111] border border-[#3a3a3a] px-2 py-1.5 text-sm text-white"
              >
                {PLAYER_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="text-xs text-[#9a9a9a] max-w-md">
              Grading: <span className="text-[#dedede]">{chartSetLabel(settings)}</span>. Only 30bb (5-max) and 100bb (6-max / full-ring) chart sets are bundled;
              other depths and seat counts are mapped onto the nearest one. Replace any chart in Settings → Preflop ranges.
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col xl:flex-row xl:items-center gap-3 xl:gap-6 mt-2">
          <div className="w-full max-w-[880px] xl:max-w-none mx-auto xl:mx-0 xl:flex-1 xl:pr-8">
            <Table seats={hand.seats} stackBb={hand.settings.stackBb} hero={hand.heroSeat} cards={hand.cards} state={visible} actions={hand.actions.slice(0, shown)} activeSeat={activeSeat} reveal={phase === 'over'} />
          </div>
          <div className="w-full xl:w-[360px] flex flex-col gap-3">
            {phase === 'feedback' && pending?.chosen && (
              <DecisionFeedback
                decision={pending}
                cls={heroCls}
                onContinue={onContinue}
                continueLabel={finalState.handOver ? 'Show result' : 'Continue'}
              />
            )}
            {phase === 'over' && <HandSummary hand={hand} outcome={outcomeOf(hand, finalState)} onDeal={deal} />}
            {(phase === 'acting' || phase === 'dealing') && (
              <div className="flex flex-col items-end gap-1">
                <div className={`text-[10px] font-bold tracking-[0.2em] uppercase ${phase === 'acting' ? 'text-[#f4d445]' : 'text-[#5a5a5a]'}`}>
                  {phase === 'acting' ? '● Your turn' : 'Dealing…'}
                </div>
                <ActionBar key={`${hand.id}:${hand.actions.length}`} state={finalState} hero={hand.heroSeat} enabled={phase === 'acting'} onAct={onAct} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

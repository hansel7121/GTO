import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useChartResolver } from '../app/useCharts'
import { handClass } from '../domain/cards'
import { computeState, seatsIn } from '../domain/engine'
import type { Action, Settings } from '../domain/types'
import { DEFAULT_SETTINGS } from '../domain/types'
import { solverInfo } from '../solver/client'
import type { SolveProgress } from '../solver/worker'
import { db, loadSettings, newId } from '../storage/db'
import { ActionBar } from '../trainer/ActionBar'
import { chartSetLabel } from '../trainer/config'
import { DecisionFeedback } from '../trainer/Feedback'
import { makeRng } from '../trainer/sim'
import { Table } from '../trainer/Table'
import {
  PLAYER_OPTIONS,
  SOLVER_OPTIONS,
  SOLVE_SECONDS_OPTIONS,
  STACK_OPTIONS,
  STYLE_OPTIONS,
  loadGtoSettings,
  saveGtoSettings,
  type GtoSettings,
} from './config'
import { cfgOf, dealGtoHand, heroAct, pending, runUntilHero, type GameDeps } from './game'
import type { GtoHand } from './hand'
import { PlayingCard } from '../trainer/PlayingCard'
import { CfrHandSolver, resolveSolveMode } from './solver'
import { STYLE_PROFILE } from './style'

type Phase = 'running' | 'acting' | 'feedback' | 'over'

const STEP_MS = 420

export function GtoPage() {
  const resolve = useChartResolver()
  const rng = useRef(makeRng((Date.now() ^ (Math.random() * 1e9)) >>> 0))
  const handRef = useRef<GtoHand | null>(null)
  const [, bump] = useState(0)
  const rerender = () => bump((v) => v + 1)
  const [phase, setPhase] = useState<Phase>('running')
  const [settings, setSettings] = useState<GtoSettings>(loadGtoSettings)
  const [appSettings, setAppSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)
  const [progress, setProgress] = useState<SolveProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState({ graded: 0, correct: 0, evLoss: 0, net: 0, hands: 0 })
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const busy = useRef(false)

  useEffect(() => {
    void loadSettings().then(setAppSettings)
  }, [])

  const allTime = useLiveQuery(async () => {
    const [ds, hs] = await Promise.all([db.gtoDecisions.toArray(), db.gtoHands.toArray()])
    return {
      graded: ds.length,
      correct: ds.filter((d) => d.correct).length,
      evLoss: ds.reduce((a, d) => a + d.evLossBb, 0),
      net: hs.reduce((a, h) => a + h.netBb, 0),
      hands: hs.length,
    }
  }, [], { graded: 0, correct: 0, evLoss: 0, net: 0, hands: 0 })

  const deps = useCallback((): GameDeps => {
    const s = settingsRef.current
    const solver = resolveSolveMode(s, appSettings) === 'off' ? null : new CfrHandSolver(appSettings, s, setProgress)
    return {
      resolve,
      rand: rng.current,
      solver,
      onStep: async () => {
        rerender()
        await new Promise((r) => setTimeout(r, STEP_MS))
      },
    }
  }, [resolve, appSettings])

  const run = useCallback(async () => {
    const hand = handRef.current!
    if (busy.current) return
    busy.current = true
    setPhase('running')
    setError(null)
    try {
      await runUntilHero(hand, deps())
      rerender()
      if (hand.result) {
        setPhase('over')
        setSession((v) => ({ ...v, net: v.net + hand.result!.heroNetBb, hands: v.hands + 1 }))
        void db.gtoHands.add({ id: newId(), createdAt: Date.now(), players: hand.settings.players, stackBb: hand.settings.stackBb, heroSeat: hand.heroSeat, netBb: hand.result.heroNetBb })
      } else setPhase('acting')
    } catch (e) {
      setError((e as Error).message)
      setPhase('over')
    } finally {
      busy.current = false
      setProgress(null)
    }
  }, [deps])

  const deal = useCallback(() => {
    handRef.current = dealGtoHand(settingsRef.current, rng.current, (handRef.current?.id ?? 0) + 1)
    rerender()
    void run()
  }, [run])

  useEffect(() => {
    if (!handRef.current) deal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onAct = async (a: Action) => {
    const hand = handRef.current!
    if (phase !== 'acting' || busy.current) return
    busy.current = true
    setPhase('running')
    try {
      const d = await heroAct(hand, a, deps())
      rerender()
      if (d.analysis.correct !== undefined) {
        const ok = d.analysis.correct
        const loss = d.analysis.evLossBb ?? 0
        setSession((v) => ({ ...v, graded: v.graded + 1, correct: v.correct + (ok ? 1 : 0), evLoss: v.evLoss + loss }))
        void db.gtoDecisions.add({
          id: newId(),
          createdAt: Date.now(),
          handId: String(hand.id),
          street: d.street,
          scenario: d.analysis.scenario ?? '',
          engine: d.analysis.engine,
          correct: ok,
          evLossBb: loss,
        })
      }
      setPhase('feedback')
    } catch (e) {
      setError((e as Error).message)
      setPhase('over')
    } finally {
      busy.current = false
    }
  }

  const applySettings = (next: GtoSettings) => {
    setSettings(next)
    settingsRef.current = next
    saveGtoSettings(next)
    if (!busy.current) deal()
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
      if (phase === 'feedback') void run()
      else if (phase === 'over') deal()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const hand = handRef.current
  if (!hand) return null
  const state = computeState(cfgOf(hand), hand.board.length, hand.actions)
  const last = hand.decisions[hand.decisions.length - 1]
  const pend = pending(hand)
  const heroCls = handClass(hand.cards[hand.heroSeat][0], hand.cards[hand.heroSeat][1])
  const activeSeat = phase === 'acting' ? hand.heroSeat : phase === 'running' ? state.toAct : null
  const pct = (s: { graded: number; correct: number }) => (s.graded ? `${Math.round((100 * s.correct) / s.graded)}%` : '—')
  const fmtNet = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n * 10) / 10}bb`
  const badges: Record<string, string | undefined> = {}
  if (settings.showStyles || phase === 'over') for (const s of hand.seats) if (s !== hand.heroSeat) badges[s] = STYLE_PROFILE[hand.styles[s]].label
  const presets = pend?.analysis.options
    .filter((o) => (o.kind === 'bet' || o.kind === 'raise') && o.amount !== undefined)
    .map((o) => ({ label: o.label.replace(/^(Bet|Raise to) [\d.]+bb /, '').replace(/[()]/g, '') || o.label, to: o.amount! }))
  const mode = resolveSolveMode(settings, appSettings)
  const overlay = progress ? (
    <div className="rounded-md bg-[#141414]/90 border border-[#3a3a3a] px-3 py-2 text-xs text-[#dedede] space-y-1">
      <div className="flex justify-between">
        <span>{progress.phase === 'building' ? 'Building tree…' : `Solving ${state.street}…`}</span>
        <span className="tabular-nums">{(progress.elapsedMs / 1000).toFixed(0)}s</span>
      </div>
      {progress.phase === 'solving' && <div className="text-[#9a9a9a]">exploitability {progress.exploitabilityPct.toFixed(1)}% pot · {solverInfo()?.multithreaded ? `${solverInfo()!.threads} threads` : 'single thread'}</div>}
      <div className="h-1 rounded bg-[#2a2a2a] overflow-hidden">
        <div className="h-full bg-[#4fc06f] transition-all" style={{ width: `${Math.min(100, Math.max(5, 100 - progress.exploitabilityPct * 10))}%` }} />
      </div>
    </div>
  ) : null

  return (
    <div className="fixed inset-0 overflow-auto bg-[#1b1b1b] text-white">
      <div className="min-h-full flex flex-col px-3 sm:px-6 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <Link to="/" className="rounded bg-[#262626] border border-[#3a3a3a] px-2 py-1 text-[#dedede] hover:bg-[#303030]">
              ← Home
            </Link>
            <span className="rounded bg-[#262626] border border-[#3a3a3a] px-2 py-1 tabular-nums whitespace-nowrap">
              <span className="hidden sm:inline">Session </span>
              <b>{session.correct}/{session.graded}</b> · {pct(session)} · <span className={session.net >= 0 ? 'text-[#4fc06f]' : 'text-[#e04b4b]'}>{fmtNet(session.net)}</span>
            </span>
            <span className="hidden md:inline rounded bg-[#262626] border border-[#3a3a3a] px-2 py-1 tabular-nums text-[#bdbdbd]">
              All-time {allTime.correct}/{allTime.graded} · {pct(allTime)} · EV lost {allTime.evLoss.toFixed(1)}bb · {fmtNet(allTime.net)} over {allTime.hands} hands
            </span>
          </div>
          <div className="flex items-center gap-2 text-[#9a9a9a] whitespace-nowrap">
            <span>
              {hand.settings.stackBb}bb · {hand.settings.players}-max · #{hand.id}
            </span>
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className={`rounded border px-2 py-1 ${showSettings ? 'bg-[#303030] border-[#5a5a5a] text-white' : 'bg-[#262626] border-[#3a3a3a] text-[#dedede] hover:bg-[#303030]'}`}
              aria-label="GTO trainer settings"
            >
              ⚙
            </button>
          </div>
        </div>
        {showSettings && (
          <div className="mt-2 rounded-md bg-[#1e1e1e] border border-[#3a3a3a] p-3 flex flex-wrap items-end gap-3 text-sm">
            <Select label="Stacks (bb)" value={settings.stackBb} options={STACK_OPTIONS.map((n) => ({ value: n, label: String(n) }))} onChange={(v) => applySettings({ ...settings, stackBb: Number(v) })} />
            <Select label="Players" value={settings.players} options={PLAYER_OPTIONS.map((n) => ({ value: n, label: String(n) }))} onChange={(v) => applySettings({ ...settings, players: Number(v) })} />
            <Select label="Villains" value={settings.style} options={STYLE_OPTIONS} onChange={(v) => applySettings({ ...settings, style: v as GtoSettings['style'] })} />
            <Select label="Solver" value={settings.solver} options={SOLVER_OPTIONS} onChange={(v) => applySettings({ ...settings, solver: v as GtoSettings['solver'] })} />
            <Select label="Solve budget (s)" value={settings.solveSeconds} options={SOLVE_SECONDS_OPTIONS.map((n) => ({ value: n, label: String(n) }))} onChange={(v) => applySettings({ ...settings, solveSeconds: Number(v) })} />
            <label className="flex items-center gap-2 text-xs text-[#dedede] pb-1.5">
              <input type="checkbox" checked={settings.showStyles} onChange={(e) => applySettings({ ...settings, showStyles: e.target.checked })} />
              show villain styles during the hand
            </label>
            <div className="text-xs text-[#9a9a9a] max-w-xl basis-full">
              Preflop: <span className="text-[#dedede]">{chartSetLabel({ players: settings.players, stackBb: settings.stackBb })}</span>. Postflop: heads-up pots are solved on this device (
              {mode === 'full' ? 'full: one flop solve per hand, ~30–60 s on a laptop' : mode === 'street' ? 'quick: flop graded by equity, turn and river solved in seconds' : 'off'}
              ); multiway pots use equity / pot odds and only grade call-vs-fold. Villains sample the same GTO strategy, tilted by their style:{' '}
              {STYLE_OPTIONS.filter((o) => o.value !== 'mixed').map((o) => `${o.label.toLowerCase()} ${STYLE_PROFILE[o.value as keyof typeof STYLE_PROFILE].blurb}`).join('; ')}.
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col xl:flex-row xl:items-center gap-3 xl:gap-6 mt-2">
          <div className="w-full max-w-[880px] xl:max-w-none mx-auto xl:mx-0 xl:flex-1 xl:pr-8">
            <Table
              seats={hand.seats}
              stackBb={hand.settings.stackBb}
              hero={hand.heroSeat}
              cards={hand.cards}
              state={state}
              actions={hand.actions}
              activeSeat={activeSeat}
              reveal={phase === 'over' && !!hand.result?.showdown}
              board={hand.board}
              badges={badges}
              overlay={overlay}
            />
          </div>
          <div className="w-full xl:w-[380px] flex flex-col gap-3">
            {error && <div className="rounded-md border border-[#c43c3c] bg-[#2a1a1a] p-3 text-sm">{error}</div>}
            {phase === 'feedback' && last?.chosen && (
              <DecisionFeedback
                decision={last}
                cls={heroCls}
                street={last.street}
                explanation={last.explanation}
                onContinue={() => void run()}
                continueLabel="Continue"
              />
            )}
            {phase === 'over' && hand.result && <HandSummary hand={hand} onDeal={deal} />}
            {phase === 'over' && !hand.result && (
              <button type="button" onClick={deal} className="w-full rounded-md border-2 border-[#3f9e5a] text-[#4fc06f] bg-[#1e1e1e] py-2 uppercase tracking-[0.12em] font-semibold text-sm">
                Deal next hand
              </button>
            )}
            {(phase === 'acting' || phase === 'running') && (
              <div className="flex flex-col items-end gap-1">
                <div className={`text-[10px] font-bold tracking-[0.2em] uppercase ${phase === 'acting' ? 'text-[#f4d445]' : 'text-[#5a5a5a]'}`}>
                  {phase === 'acting' ? `● Your turn · ${state.street}` : progress ? 'Solving…' : 'Dealing…'}
                </div>
                <ActionBar
                  key={`${hand.id}:${hand.actions.length}:${hand.board.length}`}
                  state={state}
                  hero={hand.heroSeat}
                  enabled={phase === 'acting'}
                  onAct={(a) => void onAct(a)}
                  presets={presets}
                  customNote={state.street !== 'preflop' && pend?.analysis.engine === 'cfr' ? 'Sizes marked % pot are in the solver tree; any other size is added and re-solved (slow).' : undefined}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Select<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-[#9a9a9a]">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded bg-[#111] border border-[#3a3a3a] px-2 py-1.5 text-sm text-white">
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function HandSummary({ hand, onDeal }: { hand: GtoHand; onDeal: () => void }) {
  const r = hand.result!
  const st = computeState(cfgOf(hand), hand.board.length, hand.actions)
  const graded = hand.decisions.filter((d) => d.chosen)
  const heroWon = r.winners.includes(hand.heroSeat)
  return (
    <div className="rounded-md border border-[#3a3a3a] bg-[#1e1e1e] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className={`font-bold ${r.heroNetBb > 0 ? 'text-[#4fc06f]' : r.heroNetBb < 0 ? 'text-[#e04b4b]' : 'text-[#dedede]'}`}>
          {r.heroNetBb >= 0 ? '+' : ''}
          {Math.round(r.heroNetBb * 10) / 10}bb
        </div>
        <div className="text-xs text-[#9a9a9a]">
          {r.showdown ? `showdown · ${r.winners.join(', ')} win${r.winners.length > 1 ? ' (split)' : ''}` : heroWon ? 'everyone folded' : st.players[hand.heroSeat].folded ? 'you folded' : `${r.winners.join(', ')} takes it`}
        </div>
      </div>
      {hand.board.length > 0 && (
        <div className="flex gap-1">
          {hand.board.map((c) => (
            <PlayingCard key={c} card={c} size="sm" />
          ))}
        </div>
      )}
      {r.shown.length > 0 && (
        <div className="text-xs text-[#bdbdbd] space-y-0.5">
          {r.shown.map((s) => (
            <div key={s.seat} className="flex items-center gap-2">
              <span className={`w-14 ${s.seat === hand.heroSeat ? 'text-white font-semibold' : ''}`}>{s.seat === hand.heroSeat ? 'you' : s.seat}</span>
              <PlayingCard card={hand.cards[s.seat][0]} size="sm" />
              <PlayingCard card={hand.cards[s.seat][1]} size="sm" />
              <span>{s.label}</span>
              {r.winners.includes(s.seat) && <span className="text-[#f4d445]">★</span>}
            </div>
          ))}
        </div>
      )}
      <div className="text-xs text-[#9a9a9a]">
        Villains: {hand.seats.filter((s) => s !== hand.heroSeat).map((s) => `${s} ${STYLE_PROFILE[hand.styles[s]].label.toLowerCase()}`).join(' · ')}
      </div>
      {graded.length > 0 && (
        <div className="text-xs text-[#bdbdbd] space-y-0.5">
          {graded.map((d, i) => (
            <div key={i} className="flex gap-2">
              <span className={d.analysis.correct ? 'text-[#4fc06f]' : d.analysis.correct === false ? 'text-[#e04b4b]' : 'text-[#9a9a9a]'}>
                {d.analysis.correct ? '✓' : d.analysis.correct === false ? '✗' : '·'}
              </span>
              <span>
                {d.street}: {d.analysis.chosenIndex !== undefined ? d.analysis.options[d.analysis.chosenIndex].label.replace(/ \(\d+% pot\)/, '') : d.chosen?.kind}
                {d.analysis.correct === false && d.analysis.bestIndex >= 0 && ` — GTO ${d.analysis.options[d.analysis.bestIndex].label.replace(/ \(\d+% pot\)/, '')}`}
                {typeof d.analysis.evLossBb === 'number' && d.analysis.evLossBb > 0.05 && <span className="text-[#8a8a8a]"> (−{d.analysis.evLossBb.toFixed(1)}bb)</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      {seatsIn(st).length > 2 && hand.board.length > 0 && <div className="text-[10px] text-[#6f6f6f]">Multiway postflop: graded by pot odds only.</div>}
      <button type="button" onClick={onDeal} className="w-full rounded-md border-2 border-[#3f9e5a] text-[#4fc06f] bg-[#1e1e1e] py-2 uppercase tracking-[0.12em] font-semibold text-sm hover:bg-[#233d2b]">
        Deal next hand <span className="text-[#6f6f6f] normal-case tracking-normal font-normal">(Enter)</span>
      </button>
    </div>
  )
}

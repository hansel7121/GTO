import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Card } from '../domain/cards'
import { computeState, type HandState } from '../domain/engine'
import { postflopActIndex, seatsFor, type Seat } from '../domain/positions'
import { DEFAULT_SETTINGS, type Action, type Analysis, type Decision, type Hand, type Session, type Settings, type Street } from '../domain/types'
import { grade } from '../scoring/score'
import { db, loadSettings, newId } from '../storage/db'
import type { SolveProgress } from '../solver/worker'
import { questionForDecision } from '../coach/prompt'
import { useCoach, useOnline } from '../coach/useCoach'
import { AnalysisCard } from '../ui/AnalysisCard'
import { CardChip, CardPicker, REVEAL_MS } from '../ui/Cards'
import { CoachPanel } from '../ui/CoachPanel'
import { analyzeDecision, effectiveMode, engineConfig } from './analyze'
import { makeFmt, trim } from './format'
import { createHand } from './hands'
import { inputCls } from './HomePage'
import { useChartResolver } from './useCharts'

type Live = { key: string; analysis?: Analysis; progress?: SolveProgress; error?: string }

export function HandPage() {
  const { sid, hid } = useParams()
  const nav = useNavigate()
  const session = useLiveQuery(() => db.sessions.get(sid!), [sid])
  const hand = useLiveQuery(() => db.hands.get(hid!), [hid])
  const handsInSession = useLiveQuery(() => db.hands.where('sessionId').equals(sid!).sortBy('handNo'), [sid], [] as Hand[])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  useEffect(() => {
    loadSettings().then(setSettings)
  }, [])
  const resolve = useChartResolver()
  const [picker, setPicker] = useState<null | { kind: 'hero' } | { kind: 'board'; street: Street }>(null)
  const [live, setLive] = useState<Live | null>(null)
  const jobs = useRef(new Map<string, Promise<void>>())
  const [grading, setGrading] = useState<Record<string, SolveProgress | 'running' | undefined>>({})
  const [actionError, setActionError] = useState('')
  // hole cards are face-down by default; a tap peeks at them for a few seconds
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    if (!revealed) return
    const t = setTimeout(() => setRevealed(false), REVEAL_MS)
    return () => clearTimeout(t)
  }, [revealed])

  const save = useCallback(async (patch: Partial<Hand>) => {
    await db.hands.update(hid!, patch)
  }, [hid])

  const fmt = session ? makeFmt(session, settings.showBb) : (x: number) => `${trim(x)}bb`
  const cfg = session && hand ? engineConfig(session, hand) : null
  const coach = useCoach(session, hand, cfg, settings)
  const online = useOnline()
  const state = cfg && hand ? computeState(cfg, hand.board.length, hand.actions) : null
  const heroTurn = !!(state && hand && state.toAct === hand.heroSeat && !state.error)
  const liveKey = hand ? `${hand.id}:${hand.actions.length}:${hand.board.join('.')}:${hand.heroCards?.join('.') ?? ''}` : ''

  // Analyse hero's current decision as soon as it is their turn.
  useEffect(() => {
    if (!session || !hand || !state || !heroTurn || !hand.heroCards) return
    if (live?.key === liveKey) return
    if (jobs.current.has(liveKey)) return
    const actionIndex = hand.actions.length
    setLive({ key: liveKey })
    const job = (async () => {
      try {
        const analysis = await analyzeDecision({
          session,
          hand,
          actionIndex,
          settings,
          resolve,
          onProgress: (p) => setLive((l) => (l && l.key === liveKey ? { ...l, progress: p } : l)),
        })
        // by the time the solver is done, hero may already have acted: grade that decision
        const fresh = await db.hands.get(hand.id)
        if (fresh && fresh.actions.length > actionIndex) {
          await gradeDecision(fresh, actionIndex, analysis)
        }
        setLive((l) => (l && l.key === liveKey ? { ...l, analysis } : l))
      } catch (e) {
        setLive((l) => (l && l.key === liveKey ? { ...l, error: (e as Error).message } : l))
      } finally {
        jobs.current.delete(liveKey)
      }
    })()
    jobs.current.set(liveKey, job)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, heroTurn, session, hand?.heroCards, settings, resolve])

  /** Grade decision at `actionIndex` with `analysis`, re-solving when hero's bet size is missing from the tree. */
  const gradeDecision = useCallback(
    async (h: Hand, actionIndex: number, analysis: Analysis) => {
      const s = session!
      const d = h.decisions.find((x) => x.actionIndex === actionIndex)
      if (!d || !d.chosen) return
      let graded = grade(analysis, d.chosen, d.potBb)
      if (graded.chosenIndex === undefined && analysis.engine === 'cfr' && analysis.bestIndex >= 0) {
        // hero's size is not in the solved tree: solve again with it added
        setGrading((g) => ({ ...g, [d.id]: 'running' }))
        try {
          const a2 = await analyzeDecision({
            session: s,
            hand: h,
            actionIndex,
            includeChosen: true,
            settings,
            resolve,
            onProgress: (p) => setGrading((g) => ({ ...g, [d.id]: p })),
          })
          graded = grade(a2, d.chosen, d.potBb)
        } catch (e) {
          graded.notes = [...graded.notes, `Could not grade your exact size: ${(e as Error).message}`]
        } finally {
          setGrading((g) => ({ ...g, [d.id]: undefined }))
        }
      }
      const fresh = (await db.hands.get(h.id)) ?? h
      const decisions = fresh.decisions.map((x) => (x.id === d.id ? { ...x, analysis: graded } : x))
      await db.hands.update(h.id, { decisions })
    },
    [session, settings, resolve],
  )

  if (!session || !hand || !state || !cfg) return <p className="text-slate-400">Loading…</p>

  const usedCards = [...(hand.heroCards ?? []), ...hand.board]

  const applyAction = async (a: Action) => {
    const actionIndex = hand.actions.length
    const actions = [...hand.actions, a]
    const check = computeState(cfg, hand.board.length, actions)
    if (check.error) {
      setActionError(check.error)
      return
    }
    setActionError('')
    const decisions = [...hand.decisions]
    const isHero = a.seat === hand.heroSeat
    let pending: { d: Decision; analysis: Analysis } | null = null
    if (isHero) {
      const hero = state.players[hand.heroSeat]
      const d: Decision = {
        id: newId(),
        street: state.street,
        actionIndex,
        potBb: state.pot,
        toCallBb: Math.max(0, state.currentBet - hero.committed),
        chosen: a,
      }
      if (live?.key === liveKey && live.analysis) {
        const g = grade(live.analysis, a, d.potBb)
        if (g.chosenIndex !== undefined || live.analysis.engine !== 'cfr' || live.analysis.bestIndex < 0) d.analysis = g
        else pending = { d, analysis: live.analysis }
      }
      decisions.push(d)
    }
    await save({ actions, decisions })
    if (pending) {
      const fresh = await db.hands.get(hand.id)
      if (fresh) void gradeDecision(fresh, actionIndex, pending.analysis)
    }
  }

  const undo = async () => {
    if (hand.actions.length === 0) return
    const idx = hand.actions.length - 1
    await save({ actions: hand.actions.slice(0, idx), decisions: hand.decisions.filter((d) => d.actionIndex !== idx) })
    setLive(null)
  }

  const setBoard = async (street: Street, cards: Card[]) => {
    const start = street === 'flop' ? 0 : street === 'turn' ? 3 : 4
    const board = [...hand.board.slice(0, start), ...cards]
    // analyses done on a different board are stale
    const decisions = hand.decisions.map((d) => (streetIndex(d.street) >= streetIndex(street) ? { ...d, analysis: undefined } : d))
    await save({ board, decisions })
    setLive(null)
  }

  const regrade = async (d: Decision) => {
    setGrading((g) => ({ ...g, [d.id]: 'running' }))
    try {
      const analysis = await analyzeDecision({
        session,
        hand,
        actionIndex: d.actionIndex,
        includeChosen: true,
        settings,
        resolve,
        mode: effectiveMode(settings) === 'off' ? 'off' : 'full',
        onProgress: (p) => setGrading((g) => ({ ...g, [d.id]: p })),
      })
      const graded = d.chosen ? grade(analysis, d.chosen, d.potBb) : analysis
      const fresh = (await db.hands.get(hand.id)) ?? hand
      await db.hands.update(hand.id, { decisions: fresh.decisions.map((x) => (x.id === d.id ? { ...x, analysis: graded } : x)) })
    } catch (e) {
      const fresh = (await db.hands.get(hand.id)) ?? hand
      const failed: Analysis = { engine: 'none', confidence: 'approx', options: [], bestIndex: -1, notes: [`Analysis failed: ${(e as Error).message}`] }
      await db.hands.update(hand.id, { decisions: fresh.decisions.map((x) => (x.id === d.id ? { ...x, analysis: failed } : x)) })
    } finally {
      setGrading((g) => ({ ...g, [d.id]: undefined }))
    }
  }

  const askWhy = (d: Decision) => {
    void coach.ask(questionForDecision(hand, d))
    document.getElementById('coach')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const canAskClaude = online && !!settings.claudeApiKey && !coach.busy

  const nextHand = async () => {
    const h = await createHand(session, handsInSession[handsInSession.length - 1])
    nav(`/session/${session.id}/hand/${h.id}`)
  }

  const deleteHand = async () => {
    await db.hands.delete(hand.id)
    nav(`/session/${session.id}`)
  }

  const canEditSetup = hand.actions.length === 0
  const nextBoardStreet: Street | null = state.needsBoard ? (hand.board.length === 0 ? 'flop' : hand.board.length === 3 ? 'turn' : 'river') : null
  const fullMode = effectiveMode(settings) === 'full'
  const ungraded = hand.decisions.filter(
    (d) =>
      !grading[d.id] &&
      (!d.analysis || (d.analysis.correct === undefined && d.analysis.engine === 'cfr' && d.analysis.bestIndex >= 0) || (fullMode && d.analysis.provisional)),
  )

  return (
    <div className="space-y-3 pb-24">
      <div className="flex items-center justify-between">
        <Link to={`/session/${session.id}`} className="text-sm text-slate-300">
          ← {session.name}
        </Link>
        <span className="text-sm text-slate-400">Hand #{hand.handNo}</span>
      </div>

      {/* Setup: players, seat, cards */}
      <div className="rounded-xl bg-slate-900 p-3 space-y-2">
        <div className="flex gap-2 items-end">
          <label className="text-xs text-slate-400">
            Players
            <select disabled={!canEditSetup} value={hand.tableSize} onChange={(e) => save({ tableSize: Number(e.target.value), heroSeat: seatsFor(Number(e.target.value)).includes(hand.heroSeat) ? hand.heroSeat : 'BB' })} className={inputCls + ' w-20'}>
              {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400 flex-1">
            My seat
            <select disabled={!canEditSetup} value={hand.heroSeat} onChange={(e) => save({ heroSeat: e.target.value as Seat })} className={inputCls}>
              {seatsFor(hand.tableSize).map((s) => (
                <option key={s} value={s}>
                  {s} — {ordinal(postflopActIndex(hand.tableSize, s))} to act postflop
                </option>
              ))}
            </select>
          </label>
          {session.straddle > 0 && (
            <label className="text-xs text-slate-400 flex flex-col items-center">
              Straddle
              <input type="checkbox" disabled={!canEditSetup} checked={hand.straddle} onChange={(e) => save({ straddle: e.target.checked })} className="mt-3 w-5 h-5" />
            </label>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-400 w-14">
            My hand
            {hand.heroCards && (
              <button type="button" onClick={() => { setRevealed(false); setPicker({ kind: 'hero' }) }} className="block text-sky-400 underline">
                change
              </button>
            )}
          </div>
          <div className="flex gap-1">
            {[0, 1].map((i) => (
              <CardChip
                key={i}
                card={hand.heroCards?.[i] ?? null}
                hidden={!revealed}
                onClick={() => (hand.heroCards ? setRevealed((r) => !r) : setPicker({ kind: 'hero' }))}
              />
            ))}
          </div>
          <div className="text-xs text-slate-400 w-12 ml-2">Board</div>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <CardChip key={i} card={hand.board[i] ?? null} size="sm" onClick={() => setPicker({ kind: 'board', street: 'flop' })} />
            ))}
            <span className="w-1" />
            <CardChip card={hand.board[3] ?? null} size="sm" onClick={() => hand.board.length >= 3 && setPicker({ kind: 'board', street: 'turn' })} />
            <span className="w-1" />
            <CardChip card={hand.board[4] ?? null} size="sm" onClick={() => hand.board.length >= 4 && setPicker({ kind: 'board', street: 'river' })} />
          </div>
        </div>
      </div>

      {/* Action log */}
      <ActionLog hand={hand} state={state} fmt={fmt} onUndo={undo} />

      {/* Current turn */}
      {actionError && <div className="rounded-lg bg-rose-950/60 border border-rose-800 p-2 text-sm">{actionError}</div>}
      {state.error ? (
        <div className="rounded-lg bg-rose-950/60 border border-rose-800 p-3 text-sm">
          {state.error}. <button className="underline" onClick={undo}>Undo last action</button>
        </div>
      ) : state.handOver ? (
        <div className="rounded-xl bg-slate-900 p-3 space-y-3">
          <div className="font-semibold">Hand complete · pot {fmt(state.pot)}</div>
          <label className="block text-sm">
            My result (net, optional)
            <input
              inputMode="decimal"
              defaultValue={hand.result !== undefined ? String(hand.result * session.bb) : ''}
              onBlur={(e) => save({ result: e.target.value === '' ? undefined : Number(e.target.value) / session.bb })}
              className={inputCls}
              placeholder={`${session.currency} won or lost`}
            />
          </label>
          <button type="button" onClick={nextHand} className="w-full py-3 rounded-lg bg-emerald-600 font-semibold">
            Next hand →
          </button>
        </div>
      ) : nextBoardStreet ? (
        <button type="button" onClick={() => setPicker({ kind: 'board', street: nextBoardStreet })} className="w-full py-4 rounded-xl bg-sky-700 font-semibold text-lg">
          Enter the {nextBoardStreet}
        </button>
      ) : heroTurn ? (
        <div className="rounded-xl bg-emerald-950/50 border border-emerald-800 p-3 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="font-semibold">Your turn ({hand.heroSeat}, {state.street})</span>
            <span className="text-slate-300">
              pot {fmt(state.pot)}
              {state.currentBet - state.players[hand.heroSeat].committed > 0 ? ` · to call ${fmt(state.currentBet - state.players[hand.heroSeat].committed)}` : ''}
            </span>
          </div>
          {hand.heroCards ? (
            <AnalysisCard analysis={live?.key === liveKey ? live.analysis : undefined} progress={live?.key === liveKey ? live.progress : undefined} error={live?.key === liveKey ? live.error : undefined} fmtBb={fmt} />
          ) : (
            <div className="text-sm text-amber-300">Enter your hole cards to get the analysis (you can still log the action).</div>
          )}
          <ActionButtons state={state} seat={hand.heroSeat} session={session} showBb={settings.showBb} onAction={applyAction} />
        </div>
      ) : state.toAct ? (
        <div className="rounded-xl bg-slate-900 p-3 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="font-semibold">{state.toAct} to act ({state.street})</span>
            <span className="text-slate-300">pot {fmt(state.pot)}</span>
          </div>
          <ActionButtons state={state} seat={state.toAct} session={session} showBb={settings.showBb} onAction={applyAction} />
        </div>
      ) : null}

      {/* Decisions */}
      {hand.decisions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">My decisions</h3>
            {ungraded.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  for (const d of ungraded) await regrade(d)
                }}
                className="text-xs px-2 py-1 rounded bg-slate-800"
              >
                Grade all ({ungraded.length})
              </button>
            )}
          </div>
          {hand.decisions.map((d) => (
            <DecisionCard key={d.id} d={d} fmt={fmt} grading={grading[d.id]} onRegrade={() => regrade(d)} onWhy={canAskClaude ? () => askWhy(d) : undefined} />
          ))}
        </div>
      )}

      {/* Plain-language explanation from Claude (needs Wi-Fi + an API key; answers are saved on the hand) */}
      {(hand.decisions.length > 0 || (hand.coach?.length ?? 0) > 0) && (
        <CoachPanel
          turns={hand.coach ?? []}
          state={{ streaming: coach.streaming, error: coach.error, busy: coach.busy }}
          online={online}
          hasKey={!!settings.claudeApiKey}
          onAsk={(q) => void coach.ask(q)}
          onCancel={coach.cancel}
          onClear={() => void coach.clear()}
        />
      )}

      <div className="pt-6 flex justify-between">
        <button type="button" onClick={deleteHand} className="text-xs text-rose-400">
          Delete hand
        </button>
        <label className="text-xs text-slate-400">
          Note <input defaultValue={hand.note ?? ''} onBlur={(e) => save({ note: e.target.value })} className="ml-1 bg-slate-800 rounded px-2 py-1 text-slate-200" />
        </label>
      </div>

      {picker?.kind === 'hero' && (
        <CardPicker title="Your hole cards" count={2} used={usedCards} initial={hand.heroCards ?? []} onCancel={() => setPicker(null)} onDone={(c) => { save({ heroCards: [c[0], c[1]] }); setLive(null); setRevealed(false); setPicker(null) }} />
      )}
      {picker?.kind === 'board' && (
        <CardPicker
          title={picker.street === 'flop' ? 'Flop' : picker.street === 'turn' ? 'Turn card' : 'River card'}
          count={picker.street === 'flop' ? 3 : 1}
          used={usedCards}
          initial={picker.street === 'flop' ? hand.board.slice(0, 3) : picker.street === 'turn' ? hand.board.slice(3, 4) : hand.board.slice(4, 5)}
          onCancel={() => setPicker(null)}
          onDone={(c) => { setBoard(picker.street, c); setPicker(null) }}
        />
      )}
    </div>
  )
}

function streetIndex(s: Street) {
  return ['preflop', 'flop', 'turn', 'river'].indexOf(s)
}

function ordinal(n: number) {
  return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th')
}

function ActionLog({ hand, state, fmt, onUndo }: { hand: Hand; state: HandState; fmt: (bb: number) => string; onUndo: () => void }) {
  if (hand.actions.length === 0) return null
  const describe = (a: Action) => {
    switch (a.kind) {
      case 'fold': return 'folds'
      case 'check': return 'checks'
      case 'call': return 'calls'
      case 'bet': return `bets ${fmt(a.amount ?? 0)}`
      case 'raise': return `raises to ${fmt(a.amount ?? 0)}`
      case 'allin': return 'all-in'
    }
  }
  return (
    <div className="rounded-xl bg-slate-900 p-3 text-sm space-y-1">
      {state.streets.map((s) => (
        <div key={s.street} className="flex flex-wrap gap-x-2 gap-y-0.5">
          <span className="text-slate-400 w-14 capitalize">{s.street}</span>
          <span className="flex-1">
            {s.actions.map((a, i) => (
              <span key={i} className={`inline-block mr-2 ${a.seat === hand.heroSeat ? 'text-emerald-300 font-medium' : ''}`}>
                {a.seat} {describe(a)}
              </span>
            ))}
            {s.actions.length === 0 && <span className="text-slate-500">—</span>}
          </span>
        </div>
      ))}
      <div className="flex justify-end">
        <button type="button" onClick={onUndo} className="text-xs px-2 py-1 rounded bg-slate-800">
          Undo last
        </button>
      </div>
    </div>
  )
}

function ActionButtons({
  state,
  seat,
  session,
  showBb,
  onAction,
}: {
  state: HandState
  seat: Seat
  session: Session
  showBb: boolean
  onAction: (a: Action) => void
}) {
  const [raising, setRaising] = useState(false)
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState('')
  const p = state.players[seat]
  const toCall = Math.max(0, state.currentBet - p.committed)
  const unit = showBb ? 1 : session.bb
  const fmt = (bb: number) => (showBb ? `${trim(bb)}bb` : `${session.currency}${trim(bb * session.bb)}`)
  const facingBet = state.currentBet > 0 && toCall > 0
  const potNow = state.pot
  const presets: { label: string; bb: number }[] = []
  if (state.street === 'preflop') {
    if (!facingBet || state.currentBet <= 1 + 1e-9 * 0) {
      // open or iso: multiples of the big blind (or of the current bet when limpers/straddle)
      const base = Math.max(1, state.currentBet)
      for (const m of [2.2, 2.5, 3, 3.5, 4]) presets.push({ label: `${m}x`, bb: round2(base * m) })
    } else {
      for (const m of [2.5, 3, 3.5, 4]) presets.push({ label: `${m}x`, bb: round2(state.currentBet * m) })
    }
  } else if (!facingBet) {
    for (const f of [0.33, 0.5, 0.75, 1, 1.5]) presets.push({ label: `${Math.round(f * 100)}%`, bb: round2(potNow * f) })
  } else {
    for (const m of [2.5, 3, 4]) presets.push({ label: `${m}x`, bb: round2(state.currentBet * m) })
    presets.push({ label: 'pot', bb: round2(state.currentBet + (potNow + toCall)) })
  }
  const maxTo = p.committed + p.stack
  const submitRaise = () => {
    const v = Number(amount)
    if (!(v > 0)) return
    const bb = v / unit
    if (bb >= maxTo - 1e-9) {
      onAction({ seat, kind: 'allin' })
    } else {
      if (bb < state.minRaiseTo - 1e-9) {
        setErr(`Minimum ${facingBet ? 'raise' : 'bet'} is ${fmt(state.minRaiseTo)}`)
        return
      }
      onAction({ seat, kind: facingBet || state.currentBet > 0 ? 'raise' : 'bet', amount: bb })
    }
    setRaising(false)
    setAmount('')
    setErr('')
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2">
        <button type="button" onClick={() => onAction({ seat, kind: 'fold' })} className="py-3 rounded-lg bg-sky-800 font-semibold">
          Fold
        </button>
        {toCall > 0 ? (
          <button type="button" onClick={() => onAction({ seat, kind: 'call' })} className="py-3 rounded-lg bg-emerald-700 font-semibold text-sm leading-tight">
            Call
            <br />
            {fmt(Math.min(toCall, p.stack))}
          </button>
        ) : (
          <button type="button" onClick={() => onAction({ seat, kind: 'check' })} className="py-3 rounded-lg bg-emerald-700 font-semibold">
            Check
          </button>
        )}
        <button type="button" onClick={() => setRaising(!raising)} className={`py-3 rounded-lg font-semibold ${raising ? 'bg-rose-500' : 'bg-rose-700'}`}>
          {state.currentBet > 0 ? 'Raise' : 'Bet'}
        </button>
        <button type="button" onClick={() => onAction({ seat, kind: 'allin' })} className="py-3 rounded-lg bg-fuchsia-800 font-semibold text-sm">
          All-in
        </button>
      </div>
      {raising && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {presets
              .filter((x) => x.bb < maxTo)
              .map((x) => (
                <button key={x.label} type="button" onClick={() => setAmount(String(round2(x.bb * unit)))} className="px-2 py-1 rounded bg-slate-800 text-xs">
                  {x.label} = {fmt(x.bb)}
                </button>
              ))}
          </div>
          <div className="flex gap-2">
            <input
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitRaise()}
              placeholder={`${state.currentBet > 0 ? 'raise to' : 'bet'} (${showBb ? 'bb' : session.currency}), min ${fmt(state.minRaiseTo)}`}
              className={inputCls + ' mt-0 flex-1'}
            />
            <button type="button" onClick={submitRaise} className="px-4 rounded-lg bg-rose-600 font-semibold">
              OK
            </button>
          </div>
          {err && <div className="text-xs text-rose-300">{err}</div>}
        </div>
      )}
    </div>
  )
}

function round2(x: number) {
  return Math.round(x * 100) / 100
}

function DecisionCard({
  d,
  fmt,
  grading,
  onRegrade,
  onWhy,
}: {
  d: Decision
  fmt: (bb: number) => string
  grading?: SolveProgress | 'running'
  onRegrade: () => void
  /** Ask Claude to explain this decision (undefined when offline / no API key). */
  onWhy?: () => void
}) {
  const [open, setOpen] = useState(false)
  const a = d.analysis
  const status = grading ? 'solving…' : !a ? 'not analysed' : a.correct === undefined ? 'ungraded' : a.correct ? (a.provisional ? 'OK (quick)' : 'OK') : a.provisional ? 'mistake (quick)' : 'mistake'
  const tone = status.startsWith('OK') ? 'text-emerald-400' : status.startsWith('mistake') ? 'text-rose-400' : 'text-slate-400'
  const chosen = d.chosen ? describeAction(d.chosen, fmt) : '?'
  return (
    <div className="rounded-lg bg-slate-900 p-2 text-sm">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 text-left">
        <span className="capitalize text-slate-400 w-14">{d.street}</span>
        <span className="flex-1">
          {chosen}
          {a && a.bestIndex >= 0 && a.correct === false ? <span className="text-slate-400"> · best: {a.options[a.bestIndex].label.replace(/(\d+(?:\.\d+)?)bb/g, (_, n) => fmt(Number(n)))}</span> : ''}
        </span>
        <span className={tone}>
          {status}
          {a?.evLossBb && a.evLossBb > 0.005 ? ` −${fmt(a.evLossBb)}` : ''}
        </span>
      </button>
      {grading && (
        <div className="text-xs text-slate-400 mt-1">
          {grading === 'running' || grading.phase === 'building' ? 'Solving…' : `Solving… ${(grading.elapsedMs / 1000).toFixed(0)}s · ${grading.exploitabilityPct.toFixed(2)}% pot`}
        </div>
      )}
      {open && (
        <div className="mt-2 space-y-2">
          {a ? <AnalysisCard analysis={a} fmtBb={fmt} /> : <div className="text-slate-400 text-xs">Not analysed yet.</div>}
          {!grading && (
            <div className="flex gap-2">
              <button type="button" onClick={onRegrade} className="text-xs px-2 py-1 rounded bg-slate-800">
                {a ? (a.provisional ? 'Full solve' : 'Re-analyse') : 'Analyse'}
              </button>
              {a && onWhy && (
                <button type="button" onClick={onWhy} className="text-xs px-2 py-1 rounded bg-violet-800">
                  Why? (ask Claude)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function describeAction(a: Action, fmt: (bb: number) => string) {
  switch (a.kind) {
    case 'fold': return 'Fold'
    case 'check': return 'Check'
    case 'call': return 'Call'
    case 'bet': return `Bet ${fmt(a.amount ?? 0)}`
    case 'raise': return `Raise to ${fmt(a.amount ?? 0)}`
    case 'allin': return 'All-in'
  }
}


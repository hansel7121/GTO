import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { handClass } from '../domain/cards'
import type { Hand } from '../domain/types'
import { EV_TOLERANCE_PCT, FREQ_TOLERANCE, handStats, sessionStats } from '../scoring/score'
import { db } from '../storage/db'
import { createHand } from './hands'
import { CardRow, REVEAL_MS } from '../ui/Cards'
import { fmtDate, trim } from './format'

export function SessionPage() {
  const { sid } = useParams()
  const nav = useNavigate()
  const session = useLiveQuery(() => db.sessions.get(sid!), [sid])
  const hands = useLiveQuery(() => db.hands.where('sessionId').equals(sid!).sortBy('handNo'), [sid], [] as Hand[])
  const [showFormula, setShowFormula] = useState(false)
  const [showCards, setShowCards] = useState(false)
  useEffect(() => {
    if (!showCards) return
    const t = setTimeout(() => setShowCards(false), REVEAL_MS)
    return () => clearTimeout(t)
  }, [showCards])
  if (!session) return <p className="text-slate-400">Loading…</p>
  const stats = sessionStats(hands)

  const newHand = async () => {
    const hand = await createHand(session, hands[hands.length - 1])
    nav(`/session/${session.id}/hand/${hand.id}`)
  }

  const exportSession = async () => {
    const data = JSON.stringify({ session, hands }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${session.name.replace(/[^a-z0-9]+/gi, '-')}-${new Date(session.createdAt).toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const deleteSession = async () => {
    if (!confirm('Delete this session and all its hands?')) return
    await db.transaction('rw', db.sessions, db.hands, async () => {
      await db.hands.where('sessionId').equals(session.id).delete()
      await db.sessions.delete(session.id)
    })
    nav('/')
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex justify-between items-baseline">
          <h1 className="text-xl font-semibold">{session.name}</h1>
          <span className="text-sm text-slate-400">{fmtDate(session.createdAt)}</span>
        </div>
        <div className="text-sm text-slate-300">
          {session.currency}
          {session.sb}/{session.currency}
          {session.bb} · {session.tableSize}-handed · {session.stackDepthBb}bb
        </div>
      </div>

      <div className="rounded-xl bg-slate-900 p-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Accuracy" value={stats.graded ? `${Math.round(stats.accuracy * 100)}%` : '—'} tone={stats.accuracy >= 0.8 ? 'good' : stats.graded ? 'warn' : ''} />
          <Stat label="EV lost" value={stats.cfrGraded ? `${trim(stats.evLossBb)}bb` : '—'} />
          <Stat label="Graded" value={`${stats.graded}/${stats.decisions}`} />
        </div>
        {stats.graded > 0 && (
          <div className="mt-2 text-xs text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
            {Object.entries(stats.byStreet).map(([street, b]) => (
              <span key={street}>
                {street}: {b.correct}/{b.graded}
                {b.evLossBb > 0.005 ? ` (−${trim(b.evLossBb)}bb)` : ''}
              </span>
            ))}
            <span>solver-graded: {stats.cfrGraded}</span>
            <span>approx-graded: {stats.approxGraded}</span>
          </div>
        )}
        <button type="button" onClick={() => setShowFormula(!showFormula)} className="mt-2 text-xs text-sky-400 underline">
          how is this scored?
        </button>
        {showFormula && (
          <ul className="mt-1 text-xs text-slate-400 list-disc pl-4 space-y-1">
            <li>Accuracy = correct decisions ÷ graded decisions.</li>
            <li>
              A decision is correct when the solver's EV loss (best action EV − your action EV) is ≤ {EV_TOLERANCE_PCT}% of the pot, or when the GTO strategy takes your action at least {Math.round(FREQ_TOLERANCE * 100)}% of the time (mixed strategies).
            </li>
            <li>EV lost sums the solver EV loss in bb over solver-graded decisions (preflop charts and equity spots carry no EV).</li>
            <li>Decisions with no public GTO model (multiway bet/check, cold 4-bets, limped pots for BB…) are left ungraded and never count against you.</li>
          </ul>
        )}
      </div>

      <button type="button" onClick={newHand} className="w-full py-4 rounded-xl bg-emerald-600 font-semibold text-lg">
        + New hand
      </button>

      {hands.length > 0 && (
        <button type="button" onClick={() => setShowCards((v) => !v)} className="text-xs text-slate-400">
          {showCards ? '🙈 hide my cards' : '👁 show my cards'}
        </button>
      )}
      <div className="space-y-2">
        {hands
          .slice()
          .reverse()
          .map((h) => {
            const hs = handStats(h)
            return (
              <Link key={h.id} to={`/session/${session.id}/hand/${h.id}`} className="flex items-center gap-3 rounded-lg bg-slate-900 p-2">
                <div className="text-slate-400 w-8 text-sm">#{h.handNo}</div>
                {h.heroCards ? <CardRow cards={h.heroCards} size="sm" hidden={!showCards} /> : <span className="text-slate-500 text-sm">no cards</span>}
                <div className="text-sm text-slate-300 flex-1">
                  {h.heroSeat}
                  {h.heroCards && showCards ? ` · ${handClass(h.heroCards[0], h.heroCards[1])}` : ''}
                  {h.board.length > 0 && (
                    <span className="ml-2 inline-flex">
                      <CardRow cards={h.board} size="sm" />
                    </span>
                  )}
                </div>
                <div className="text-xs">
                  {hs.graded > 0 ? (
                    <span className={hs.correct === hs.graded ? 'text-emerald-400' : 'text-amber-400'}>
                      {hs.correct}/{hs.graded}
                      {hs.evLossBb > 0.005 ? ` −${trim(hs.evLossBb)}bb` : ''}
                    </span>
                  ) : (
                    <span className="text-slate-500">{h.decisions.length ? 'ungraded' : ''}</span>
                  )}
                </div>
              </Link>
            )
          })}
      </div>

      <div className="flex gap-2 pt-4">
        <button type="button" onClick={exportSession} className="flex-1 py-2 rounded-lg bg-slate-800 text-sm">
          Export JSON
        </button>
        <button type="button" onClick={deleteSession} className="py-2 px-3 rounded-lg bg-rose-900/60 text-sm">
          Delete session
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className={`text-2xl font-semibold ${tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : ''}`}>{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  )
}

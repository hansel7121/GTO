import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Session } from '../domain/types'
import { sessionStats } from '../scoring/score'
import { db, newId } from '../storage/db'
import { fmtDate } from './format'

export function HomePage() {
  const sessions = useLiveQuery(() => db.sessions.orderBy('createdAt').reverse().toArray(), [], [])
  const hands = useLiveQuery(() => db.hands.toArray(), [], [])
  const [creating, setCreating] = useState(false)
  return (
    <div className="space-y-4">
      {!creating ? (
        <button type="button" onClick={() => setCreating(true)} className="w-full py-4 rounded-xl bg-emerald-600 font-semibold text-lg">
          + New session
        </button>
      ) : (
        <NewSessionForm onClose={() => setCreating(false)} last={sessions[0]} />
      )}
      <div className="space-y-2">
        {sessions.length === 0 && <p className="text-slate-400 text-sm">No sessions yet. Start one when you sit down.</p>}
        {sessions.map((s) => {
          const hs = hands.filter((h) => h.sessionId === s.id)
          const st = sessionStats(hs)
          return (
            <Link key={s.id} to={`/session/${s.id}`} className="block rounded-lg bg-slate-900 p-3">
              <div className="flex justify-between">
                <div className="font-semibold">{s.name}</div>
                <div className="text-sm text-slate-400">{fmtDate(s.createdAt)}</div>
              </div>
              <div className="text-sm text-slate-300 flex gap-3 mt-1">
                <span>
                  {s.currency}
                  {s.sb}/{s.currency}
                  {s.bb}
                  {s.straddle ? ` (+${s.currency}${s.straddle} straddle)` : ''}
                </span>
                <span>{s.tableSize}-handed</span>
                <span>{hs.length} hands</span>
                {st.graded > 0 && <span className={st.accuracy >= 0.8 ? 'text-emerald-400' : 'text-amber-400'}>{Math.round(st.accuracy * 100)}% accuracy</span>}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function NewSessionForm({ onClose, last }: { onClose: () => void; last?: Session }) {
  const nav = useNavigate()
  const [sb, setSb] = useState(String(last?.sb ?? 1))
  const [bb, setBb] = useState(String(last?.bb ?? 2))
  const [straddle, setStraddle] = useState(String(last?.straddle ?? 0))
  const [tableSize, setTableSize] = useState(last?.tableSize ?? 6)
  const [stack, setStack] = useState(String(last?.stackDepthBb ?? 100))
  const [currency, setCurrency] = useState(last?.currency ?? '$')
  const [name, setName] = useState('')
  const submit = async () => {
    const s: Session = {
      id: newId(),
      createdAt: Date.now(),
      name: name.trim() || `${currency}${sb}/${currency}${bb} ${tableSize}-max`,
      sb: Number(sb) || 1,
      bb: Number(bb) || 2,
      straddle: Number(straddle) || 0,
      tableSize,
      stackDepthBb: Number(stack) || 100,
      currency,
    }
    await db.sessions.add(s)
    nav(`/session/${s.id}`)
  }
  return (
    <div className="rounded-xl bg-slate-900 p-3 space-y-3">
      <div className="font-semibold">New session</div>
      <label className="block text-sm">
        Name (optional)
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Friday home game" />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="block text-sm">
          Small blind
          <input inputMode="decimal" value={sb} onChange={(e) => setSb(e.target.value)} className={inputCls} />
        </label>
        <label className="block text-sm">
          Big blind
          <input inputMode="decimal" value={bb} onChange={(e) => setBb(e.target.value)} className={inputCls} />
        </label>
        <label className="block text-sm">
          Straddle (0 = none)
          <input inputMode="decimal" value={straddle} onChange={(e) => setStraddle(e.target.value)} className={inputCls} />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block text-sm">
          Players
          <select value={tableSize} onChange={(e) => setTableSize(Number(e.target.value))} className={inputCls}>
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Stacks (bb)
          <input inputMode="numeric" value={stack} onChange={(e) => setStack(e.target.value)} className={inputCls} />
        </label>
        <label className="block text-sm">
          Currency
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls} />
        </label>
      </div>
      <p className="text-xs text-slate-400">Everyone is assumed to start each hand with the same stack depth (deep-stacked). Number of players can be changed per hand.</p>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 py-3 rounded-lg bg-slate-800">
          Cancel
        </button>
        <button type="button" onClick={submit} className="flex-1 py-3 rounded-lg bg-emerald-600 font-semibold">
          Start
        </button>
      </div>
    </div>
  )
}

export const inputCls = 'mt-1 w-full rounded-md bg-slate-800 border border-slate-700 px-2 py-2 text-base'

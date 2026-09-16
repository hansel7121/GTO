import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type Settings } from '../domain/types'
import { BUNDLED_CHARTS, type Chart } from '../preflop/charts'
import { parseRange, rangePercent } from '../preflop/range'
import { askCoach, COACH_MODELS } from '../coach/client'
import { db, exportAll, importAll, loadSettings, saveSettings } from '../storage/db'
import { solverInfo } from '../solver/client'
import { inputCls } from './HomePage'

export function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null)
  useEffect(() => {
    loadSettings().then(setS)
  }, [])
  if (!s) return null
  const update = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch }
    setS(next)
    void saveSettings(next)
  }
  const info = solverInfo()
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-semibold">Display</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.showBb} onChange={(e) => update({ showBb: e.target.checked })} />
          Show amounts in big blinds instead of currency
        </label>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Postflop solver</h2>
        <p className="text-xs text-slate-400">
          Heads-up postflop spots are solved on-device with the open-source postflop-solver engine (Discounted CFR).
          {info ? ` Running ${info.multithreaded ? `multithreaded (${info.threads} threads)` : 'single-threaded'}.` : ''}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm col-span-2">
            Mode
            <select value={s.solverMode} onChange={(e) => update({ solverMode: e.target.value as Settings['solverMode'] })} className={inputCls}>
              <option value="auto">Auto (full on laptops, quick on phones)</option>
              <option value="full">Full — always solve from the flop (exact, slow on phones)</option>
              <option value="street">Quick — solve turn/river from that street, equity on the flop</option>
              <option value="off">Off — equity / pot odds only</option>
            </select>
          </label>
          <label className="block text-sm">
            Raises per street (tree size)
            <select value={s.maxRaises} onChange={(e) => update({ maxRaises: Number(e.target.value) })} className={inputCls}>
              <option value={1}>1 (bet, then only an all-in re-raise)</option>
              <option value={2}>2 (bet, raise, then all-in) — ~4x memory</option>
              <option value={3}>3</option>
              <option value={0}>unlimited</option>
            </select>
          </label>
          <label className="block text-sm">
            Time budget (seconds)
            <input inputMode="numeric" value={s.solverTimeBudgetSec} onChange={(e) => update({ solverTimeBudgetSec: Number(e.target.value) || 60 })} className={inputCls} />
          </label>
          <label className="block text-sm">
            Target exploitability (% pot)
            <input inputMode="decimal" value={s.solverTargetExploitPct} onChange={(e) => update({ solverTargetExploitPct: Number(e.target.value) || 0.5 })} className={inputCls} />
          </label>
          <label className="block text-sm">
            Flop bet sizes
            <input value={s.flopBetSizes} onChange={(e) => update({ flopBetSizes: e.target.value })} className={inputCls} />
          </label>
          <label className="block text-sm">
            Turn bet sizes
            <input value={s.turnBetSizes} onChange={(e) => update({ turnBetSizes: e.target.value })} className={inputCls} />
          </label>
          <label className="block text-sm">
            River bet sizes
            <input value={s.riverBetSizes} onChange={(e) => update({ riverBetSizes: e.target.value })} className={inputCls} />
          </label>
          <label className="block text-sm">
            Raise sizes
            <input value={s.raiseSizes} onChange={(e) => update({ raiseSizes: e.target.value })} className={inputCls} />
          </label>
        </div>
        <p className="text-xs text-slate-400">
          Sizes use the solver syntax: "33%, 75%" of pot, "2.5x" previous bet, "a" all-in, "e" geometric. All-in is always added automatically and
          the real bet sizes from your hand are always added to the tree. A full flop solve with one size per street needs ~0.5–1 GB and a few
          minutes on a multi-core laptop (far longer single-threaded on a phone) — keep the tree small. Quick results are marked "(quick)" and can be replaced by
          a full solve later with "Grade all".
        </p>
        <button type="button" onClick={() => update({ ...DEFAULT_SETTINGS, showBb: s.showBb })} className="text-xs text-sky-400 underline">
          reset solver defaults
        </button>
      </section>

      <ClaudeSection s={s} update={update} />

      <RangeImporter />

      <DataSection />
    </div>
  )
}

function ClaudeSection({ s, update }: { s: Settings; update: (patch: Partial<Settings>) => void }) {
  const [show, setShow] = useState(false)
  const [msg, setMsg] = useState('')
  const [testing, setTesting] = useState(false)
  const test = async () => {
    setTesting(true)
    setMsg('')
    try {
      await askCoach({
        apiKey: s.claudeApiKey.trim(),
        model: s.claudeModel,
        handText: '(connection test — no hand)',
        turns: [{ role: 'user', text: 'Reply with the single word OK.', at: Date.now() }],
        onText: () => {},
      })
      setMsg('Key works.')
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setTesting(false)
    }
  }
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">Ask Claude</h2>
      <p className="text-xs text-slate-400">
        With an Anthropic API key, any hand can be sent to Claude for a plain-language explanation of why the recommended actions are right
        (needs an internet connection; the answers are saved with the hand). The key is stored on this device only, is never included in backups,
        and is only ever sent to api.anthropic.com. Get one at console.anthropic.com — usage is billed to your account (roughly a few cents per hand).
      </p>
      <label className="block text-sm">
        API key
        <div className="flex gap-2">
          <input
            type={show ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            value={s.claudeApiKey}
            onChange={(e) => update({ claudeApiKey: e.target.value.trim() })}
            placeholder="sk-ant-…"
            className={inputCls + ' flex-1 min-w-0 font-mono text-xs'}
          />
          <button type="button" onClick={() => setShow(!show)} className="mt-1 px-3 rounded-lg bg-slate-800 text-xs">
            {show ? 'hide' : 'show'}
          </button>
        </div>
      </label>
      <label className="block text-sm">
        Model
        <select value={s.claudeModel} onChange={(e) => update({ claudeModel: e.target.value })} className={inputCls}>
          {COACH_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2 items-center">
        <button type="button" disabled={!s.claudeApiKey || testing} onClick={test} className="px-3 py-2 rounded-lg bg-slate-800 text-sm disabled:opacity-40">
          {testing ? 'Testing…' : 'Test key'}
        </button>
        <span className="text-xs text-slate-400">{msg}</span>
      </div>
    </section>
  )
}

function RangeImporter() {
  const overrides = useLiveQuery(() => db.overrides.toArray(), [], [])
  const [key, setKey] = useState(BUNDLED_CHARTS[0].key)
  const chart = BUNDLED_CHARTS.find((c) => c.key === key)!
  const existing = overrides.find((o) => o.id === key)
  const [raise, setRaise] = useState('')
  const [call, setCall] = useState('')
  const [allin, setAllin] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => {
    setRaise(existing?.actions.raise ?? chart.actions.raise ?? '')
    setCall(existing?.actions.call ?? chart.actions.call ?? '')
    setAllin(existing?.actions.allin ?? chart.actions.allin ?? '')
    setMsg('')
  }, [key, existing, chart])

  const check = (str: string) => {
    if (!str.trim()) return null
    try {
      return rangePercent(parseRange(str))
    } catch (e) {
      return String((e as Error).message)
    }
  }
  const save = async () => {
    for (const [label, str] of [['raise', raise], ['call', call], ['all-in', allin]] as const) {
      const r = check(str)
      if (typeof r === 'string') {
        setMsg(`${label}: ${r}`)
        return
      }
    }
    await db.overrides.put({ id: key, actions: { raise: raise.trim() || undefined, call: call.trim() || undefined, allin: allin.trim() || undefined }, updatedAt: Date.now() })
    setMsg('Saved. This chart now uses your ranges.')
  }
  const reset = async () => {
    await db.overrides.delete(key)
    setMsg('Reverted to the bundled chart.')
  }
  const label = (c: Chart) => `${c.format} ${c.scenario} ${c.hero}${c.villain ? ' vs ' + c.villain : ''}${overrides.some((o) => o.id === c.key) ? ' ★' : ''}`
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">Preflop ranges</h2>
      <p className="text-xs text-slate-400">
        Paste ranges exported from GTO Wizard / PioSOLVER (e.g. <code>AA,KK,AQs:0.5,A5s-A2s</code>) to replace any bundled chart. ★ = overridden.
      </p>
      <select value={key} onChange={(e) => setKey(e.target.value)} className={inputCls}>
        {BUNDLED_CHARTS.map((c) => (
          <option key={c.key} value={c.key}>
            {label(c)}
          </option>
        ))}
      </select>
      <div className="text-xs text-slate-400">
        Bundled source: {chart.sourceLabel}{' '}
        <a className="text-sky-400 underline" href={chart.source} target="_blank" rel="noreferrer">
          link
        </a>
        {chart.note ? ` — ${chart.note}` : ''}
      </div>
      <label className="block text-sm">
        {chart.scenario === 'RFI' ? 'Raise' : chart.scenario === 'VS_RFI' ? '3-bet' : chart.scenario === 'VS_3BET' ? '4-bet' : chart.scenario === 'COLD_4BET' ? 'Cold 4-bet' : '5-bet (all-in)'} range{' '}
        <span className="text-slate-400">{fmtPct(check(chart.scenario === 'VS_4BET' ? allin : raise))}</span>
        <textarea
          value={chart.scenario === 'VS_4BET' ? allin : raise}
          onChange={(e) => (chart.scenario === 'VS_4BET' ? setAllin(e.target.value) : setRaise(e.target.value))}
          rows={3}
          className={inputCls + ' font-mono text-xs'}
        />
      </label>
      {chart.scenario !== 'RFI' && (
        <label className="block text-sm">
          Call range <span className="text-slate-400">{fmtPct(check(call))}</span>
          <textarea value={call} onChange={(e) => setCall(e.target.value)} rows={3} className={inputCls + ' font-mono text-xs'} />
        </label>
      )}
      {chart.scenario === 'COLD_4BET' && (
        <label className="block text-sm">
          All-in range <span className="text-slate-400">{fmtPct(check(allin))}</span>
          <textarea value={allin} onChange={(e) => setAllin(e.target.value)} rows={2} className={inputCls + ' font-mono text-xs'} />
        </label>
      )}
      {chart.scenario === 'VS_4BET' && (
        <label className="block text-sm">
          4-bet (non all-in) range <span className="text-slate-400">{fmtPct(check(raise))}</span>
          <textarea value={raise} onChange={(e) => setRaise(e.target.value)} rows={2} className={inputCls + ' font-mono text-xs'} />
        </label>
      )}
      <div className="flex gap-2 items-center">
        <button type="button" onClick={save} className="px-3 py-2 rounded-lg bg-emerald-600 text-sm font-semibold">
          Save override
        </button>
        {existing && (
          <button type="button" onClick={reset} className="px-3 py-2 rounded-lg bg-slate-800 text-sm">
            Revert to bundled
          </button>
        )}
        <span className="text-xs text-slate-400">{msg}</span>
      </div>
    </section>
  )
}

function fmtPct(v: number | string | null) {
  if (v === null) return ''
  if (typeof v === 'string') return `(${v})`
  return `(${v.toFixed(1)}%)`
}

function DataSection() {
  const [msg, setMsg] = useState('')
  const doExport = async () => {
    const json = await exportAll()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gto-trainer-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const doImport = async (file: File) => {
    try {
      const r = await importAll(await file.text())
      setMsg(`Imported ${r.sessions} sessions and ${r.hands} hands.`)
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`)
    }
  }
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">Data</h2>
      <p className="text-xs text-slate-400">Everything is stored on this device only. Export a backup before clearing browser data.</p>
      <div className="flex gap-2 items-center">
        <button type="button" onClick={doExport} className="px-3 py-2 rounded-lg bg-slate-800 text-sm">
          Export backup
        </button>
        <label className="px-3 py-2 rounded-lg bg-slate-800 text-sm cursor-pointer">
          Import backup
          <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
        </label>
        <span className="text-xs text-slate-400">{msg}</span>
      </div>
      <p className="text-xs text-slate-500 pt-4">
        Solver: postflop-solver / wasm-postflop by Wataru Inariba (AGPL-3.0). Hand evaluator: phe (MIT). RFI charts: pokercoaching.com. This app is not affiliated with GTO Wizard.
      </p>
    </section>
  )
}

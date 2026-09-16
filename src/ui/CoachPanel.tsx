import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DEFAULT_QUESTION } from '../coach/prompt'
import type { CoachState } from '../coach/useCoach'
import type { CoachTurn } from '../domain/types'

export function CoachPanel({
  turns,
  state,
  online,
  hasKey,
  onAsk,
  onCancel,
  onClear,
}: {
  turns: CoachTurn[]
  state: CoachState
  online: boolean
  hasKey: boolean
  onAsk: (q: string) => void
  onCancel: () => void
  onClear: () => void
}) {
  const [q, setQ] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  // keep the streamed reply in view while it grows
  useEffect(() => {
    if (state.streaming !== null) endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [state.streaming])
  const canAsk = online && hasKey && !state.busy
  const submit = () => {
    if (!canAsk || !q.trim()) return
    onAsk(q)
    setQ('')
  }
  return (
    <div id="coach" className="rounded-xl bg-slate-900 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Ask Claude</h3>
        {turns.length > 0 && !state.busy && (
          <button type="button" onClick={onClear} className="text-xs text-slate-400 underline">
            clear
          </button>
        )}
      </div>

      {!hasKey ? (
        <p className="text-sm text-amber-300">
          Add your Anthropic API key in{' '}
          <Link to="/settings" className="underline">
            Settings
          </Link>{' '}
          to get plain-language explanations of the analysis.
        </p>
      ) : !online ? (
        <p className="text-sm text-amber-300">
          You&rsquo;re offline &mdash; connect to Wi-Fi to ask Claude.{turns.length > 0 ? ' Earlier answers are saved below.' : ''}
        </p>
      ) : null}

      {turns.map((t, i) => (
        <div key={i} className={t.role === 'user' ? 'text-sm text-sky-200 bg-sky-950/40 rounded-lg px-3 py-2' : 'text-sm'}>
          {t.role === 'user' ? t.text : <Markdown text={t.text} />}
          {t.partial && <div className="text-xs text-amber-400 mt-1">(reply was cut off)</div>}
        </div>
      ))}
      {state.streaming !== null && (
        <div className="text-sm">
          {state.streaming ? <Markdown text={state.streaming} /> : <span className="text-slate-400">Claude is thinking&hellip;</span>}
        </div>
      )}
      {state.error && <div className="rounded-lg bg-rose-950/60 border border-rose-800 p-2 text-sm">{state.error}</div>}
      <div ref={endRef} />

      {state.busy ? (
        <button type="button" onClick={onCancel} className="text-xs px-2 py-1 rounded bg-slate-800">
          Stop
        </button>
      ) : turns.length === 0 ? (
        <button type="button" disabled={!canAsk} onClick={() => onAsk(DEFAULT_QUESTION)} className="w-full py-3 rounded-lg bg-violet-700 font-semibold disabled:opacity-40">
          Ask Claude why
        </button>
      ) : (
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            disabled={!canAsk}
            placeholder="Follow-up question…"
            className="flex-1 min-w-0 bg-slate-800 rounded-lg px-3 py-2 text-sm disabled:opacity-40"
          />
          <button type="button" disabled={!canAsk || !q.trim()} onClick={submit} className="px-4 rounded-lg bg-violet-700 font-semibold text-sm disabled:opacity-40">
            Ask
          </button>
        </div>
      )}
      {hasKey && <p className="text-xs text-slate-500">The hand and the analysis above are sent to Anthropic&rsquo;s API with your key; nothing else leaves the device.</p>}
    </div>
  )
}

/** Just enough markdown for Claude's replies: headings, bullets, bold, code, paragraphs. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: ReactNode[] = []
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="list-disc pl-5 space-y-0.5">
          {list}
        </ul>,
      )
    }
    list = []
  }
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd()
    const m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line)
    if (m) {
      list.push(<li key={i}>{inline(m[1])}</li>)
      return
    }
    flush()
    if (!line.trim()) return
    const h = /^#{1,6}\s+(.*)$/.exec(line)
    if (h) {
      blocks.push(
        <div key={i} className="font-semibold mt-2">
          {inline(h[1])}
        </div>,
      )
    } else {
      blocks.push(<p key={i}>{inline(line)}</p>)
    }
  })
  flush()
  return <div className="space-y-1.5 leading-relaxed">{blocks}</div>
}

function inline(s: string): ReactNode[] {
  // **bold** and `code`
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('`') && p.endsWith('`')) {
      return (
        <code key={i} className="bg-slate-800 px-1 rounded">
          {p.slice(1, -1)}
        </code>
      )
    }
    return p
  })
}

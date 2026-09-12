import type { Analysis } from '../domain/types'
import type { SolveProgress } from '../solver/worker'

const KIND_COLOR: Record<string, string> = {
  fold: 'bg-sky-600',
  check: 'bg-emerald-600',
  call: 'bg-emerald-600',
  bet: 'bg-rose-600',
  raise: 'bg-rose-600',
  allin: 'bg-fuchsia-600',
}

export function EngineBadge({ analysis }: { analysis: Analysis }) {
  const label =
    analysis.engine === 'cfr' ? 'GTO solver' : analysis.engine === 'preflop-chart' ? 'Preflop chart' : analysis.engine === 'equity' ? 'Equity / pot odds' : 'Not graded'
  const tone = analysis.confidence === 'gto' && analysis.engine !== 'none' ? 'bg-emerald-800 text-emerald-100' : 'bg-amber-800 text-amber-100'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${tone}`}>
      {label}
      {analysis.confidence === 'approx' && analysis.engine !== 'none' ? ' · approx' : ''}
    </span>
  )
}

export function AnalysisCard({
  analysis,
  progress,
  error,
  fmtBb,
}: {
  analysis?: Analysis
  progress?: SolveProgress | null
  error?: string | null
  fmtBb: (bb: number) => string
}) {
  if (error) {
    return <div className="rounded-lg bg-rose-950/60 border border-rose-800 p-3 text-sm">{error}</div>
  }
  if (!analysis) {
    return (
      <div className="rounded-lg bg-slate-900 p-3 text-sm text-slate-300">
        {progress ? (
          <div>
            <div className="flex justify-between">
              <span>{progress.phase === 'building' ? 'Building game tree…' : 'Solving…'}</span>
              <span className="tabular-nums">{(progress.elapsedMs / 1000).toFixed(0)}s</span>
            </div>
            {progress.phase === 'solving' && (
              <div className="mt-1 text-xs text-slate-400">
                iteration {progress.iteration} · exploitability {progress.exploitabilityPct.toFixed(2)}% pot
              </div>
            )}
            <div className="mt-2 h-1.5 rounded bg-slate-800 overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, Math.max(5, 100 - progress.exploitabilityPct * 10))}%` }} />
            </div>
          </div>
        ) : (
          'Analysing…'
        )}
      </div>
    )
  }
  const best = analysis.bestIndex >= 0 ? analysis.options[analysis.bestIndex] : null
  // option labels carry bb amounts; show them in the user's preferred unit
  const label = (s: string) => s.replace(/(\d+(?:\.\d+)?)bb/g, (_, n) => fmtBb(Number(n)))
  const hasEv = analysis.options.some((o) => typeof o.ev === 'number')
  return (
    <div className="rounded-lg bg-slate-900 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <EngineBadge analysis={analysis} />
        {analysis.scenario && <span className="text-xs text-slate-400">{label(analysis.scenario)}</span>}
        {typeof analysis.exploitability === 'number' && (
          <span className="text-xs text-slate-400">exploit. {analysis.exploitability.toFixed(2)}%</span>
        )}
        {typeof analysis.equity === 'number' && <span className="text-xs text-slate-400">equity {(analysis.equity * 100).toFixed(1)}%</span>}
      </div>
      {best && (
        <div className="text-sm">
          Best: <span className="font-semibold">{label(best.label)}</span>
          {analysis.correct !== undefined && (
            <span className={`ml-2 px-2 py-0.5 rounded text-xs ${analysis.correct ? 'bg-emerald-700' : 'bg-rose-700'}`}>
              {analysis.correct ? 'You: OK' : 'You: mistake'}
              {typeof analysis.evLossBb === 'number' && analysis.evLossBb > 0.005 ? ` · −${fmtBb(analysis.evLossBb)}` : ''}
            </span>
          )}
        </div>
      )}
      <div className="space-y-1">
        {analysis.options.map((o, i) => (
          <div key={i} className={`flex items-center gap-2 text-sm ${analysis.chosenIndex === i ? 'ring-1 ring-white/60 rounded px-1' : 'px-1'}`}>
            <div className="w-36 shrink-0 truncate">{label(o.label)}</div>
            <div className="flex-1 h-4 bg-slate-800 rounded overflow-hidden">
              <div className={`h-full ${KIND_COLOR[o.kind] ?? 'bg-slate-500'}`} style={{ width: `${Math.round(o.freq * 100)}%` }} />
            </div>
            <div className="w-10 text-right tabular-nums">{Math.round(o.freq * 100)}%</div>
            {hasEv && <div className="w-16 text-right tabular-nums text-slate-300">{typeof o.ev === 'number' ? fmtBb(o.ev) : ''}</div>}
          </div>
        ))}
      </div>
      {analysis.notes.length > 0 && (
        <ul className="text-xs text-slate-400 list-disc pl-4 space-y-0.5">
          {analysis.notes.map((n, i) => (
            <li key={i}>{label(n)}</li>
          ))}
        </ul>
      )}
      {analysis.source && (
        <a href={analysis.source} target="_blank" rel="noreferrer" className="text-xs text-sky-400 underline break-all">
          source
        </a>
      )}
    </div>
  )
}

import { trim } from '../app/format'
import type { Analysis } from '../domain/types'
import type { Outcome, TrainerDecision, TrainerHand } from './sim'

const KIND_COLOR: Record<string, string> = {
  fold: '#4f8fd6',
  check: '#4fc06f',
  call: '#4fc06f',
  raise: '#e0704b',
  allin: '#c43c9e',
}

/** "VS_RFI vs BTN" → "facing BTN open" etc. */
function scenarioText(s?: string): string {
  if (!s) return 'off-model'
  const [kind, , v] = s.split(' ')
  switch (kind) {
    case 'RFI': return 'open (first in)'
    case 'VS_RFI': return `facing ${v} open`
    case 'VS_3BET': return `facing ${v} 3-bet`
    case 'VS_4BET': return `facing ${v} 4-bet jam`
    case 'COLD_4BET': return 'open + 3-bet in front'
    case 'UNKNOWN': return 'off-model line'
    case 'VS_5BET': return 'facing 5-bet'
    default: return s
  }
}

function pct(f: number) {
  return `${Math.round(f * 100)}%`
}

export function DecisionFeedback({
  decision,
  cls,
  onContinue,
  continueLabel,
  explanation,
  street,
}: {
  decision: Pick<TrainerDecision, 'analysis' | 'chosen'>
  cls: string
  onContinue: () => void
  continueLabel: string
  explanation?: string
  street?: string
}) {
  const a = decision.analysis
  const chosen = a.chosenIndex !== undefined ? a.options[a.chosenIndex] : undefined
  const best = a.bestIndex >= 0 ? a.options[a.bestIndex] : undefined
  const ok = a.correct === true
  const mine = actionText(decision)
  return (
    <div className={`rounded-md border p-3 space-y-2 bg-[#1e1e1e] ${ok ? 'border-[#3f9e5a]' : 'border-[#c43c3c]'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className={`font-bold uppercase tracking-wider text-sm ${ok ? 'text-[#4fc06f]' : 'text-[#e04b4b]'}`}>
          {a.correct === undefined ? 'Not graded' : ok ? (a.chosenIndex !== a.bestIndex ? '✓ Fine (mixed)' : '✓ Correct') : '✗ Mistake'}
        </div>
        <div className="text-xs text-[#9a9a9a]">
          {street && street !== 'preflop' ? `${street} · ` : ''}
          {cls} · {a.engine === 'cfr' ? `solver · ${a.scenario ?? ''}` : a.engine === 'equity' ? `equity · ${a.scenario ?? ''}` : scenarioText(a.scenario)}
        </div>
      </div>
      <div className="text-sm text-[#dedede]">
        You: <span className="font-semibold">{mine}</span>
        {chosen && chosen.label !== mine && <span className="text-[#9a9a9a]"> → counted as {chosen.label}</span>}
        {chosen && <span className="text-[#9a9a9a]"> ({pct(chosen.freq)})</span>}
        {best && (
          <>
            {' · '}GTO: <span className="font-semibold">{best.label}</span> <span className="text-[#9a9a9a]">({pct(best.freq)})</span>
          </>
        )}
      </div>
      {best ? <Mix analysis={a} /> : <div className="text-xs text-[#9a9a9a]">{a.notes[0] ?? 'Not graded.'}</div>}
      {explanation && <div className="text-xs text-[#e8e8e8] leading-snug border-l-2 border-[#f4d445] pl-2">{explanation}</div>}
      {a.notes.length > 0 && <ul className="text-[11px] text-[#8a8a8a] list-disc pl-4">{a.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      <button type="button" onClick={onContinue} className="w-full rounded-md border-2 border-[#3f9e5a] text-[#4fc06f] bg-[#1e1e1e] py-2 uppercase tracking-[0.12em] font-semibold text-sm hover:bg-[#233d2b]">
        {continueLabel} <span className="text-[#6f6f6f] normal-case tracking-normal font-normal">(Enter)</span>
      </button>
    </div>
  )
}

function actionText(d: Pick<TrainerDecision, 'chosen'>) {
  const c = d.chosen
  if (!c) return '—'
  if (c.kind === 'raise') return `Raise to ${trim(c.amount ?? 0)}bb`
  if (c.kind === 'bet') return `Bet ${trim(c.amount ?? 0)}bb`
  if (c.kind === 'allin') return 'All-in'
  return c.kind[0].toUpperCase() + c.kind.slice(1)
}

export function Mix({ analysis }: { analysis: Analysis }) {
  const hasEv = analysis.options.some((o) => typeof o.ev === 'number')
  return (
    <div className="space-y-1">
      {analysis.options.map((o, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <div className={`w-28 sm:w-32 truncate ${i === analysis.chosenIndex ? 'text-white font-semibold' : 'text-[#bdbdbd]'}`} title={o.label}>
            {o.label.replace(/ \(\d+% pot\)/, '')}
          </div>
          <div className="flex-1 h-2.5 rounded bg-[#2a2a2a] overflow-hidden">
            <div className="h-full" style={{ width: `${Math.round(o.freq * 100)}%`, background: KIND_COLOR[o.kind] ?? '#888' }} />
          </div>
          <div className="w-9 text-right tabular-nums text-[#bdbdbd]">{pct(o.freq)}</div>
          {hasEv && <div className={`w-14 text-right tabular-nums ${i === analysis.bestIndex ? 'text-[#4fc06f]' : 'text-[#8a8a8a]'}`}>{typeof o.ev === 'number' ? `${o.ev >= 0 ? '+' : ''}${o.ev.toFixed(1)}` : ''}</div>}
        </div>
      ))}
      {hasEv && <div className="text-[10px] text-[#6f6f6f] text-right">EV in bb</div>}
    </div>
  )
}

const OUTCOME_TEXT: Record<Outcome, string> = {
  'hero-folded': 'You folded.',
  'hero-won': 'Everyone folded — you take the pot.',
  'all-in': 'All-in preflop. Showdown is not simulated — preflop is what we train.',
  flop: 'Preflop is over; the hand would go to the flop (not trained here).',
}

export function HandSummary({ hand, outcome, onDeal }: { hand: TrainerHand; outcome: Outcome; onDeal: () => void }) {
  const graded = hand.decisions.filter((d) => d.chosen)
  return (
    <div className="rounded-md border border-[#3a3a3a] bg-[#1e1e1e] p-3 space-y-2">
      <div className="text-sm text-[#dedede]">{OUTCOME_TEXT[outcome]}</div>
      {graded.length > 0 && (
        <div className="text-xs text-[#bdbdbd] space-y-0.5">
          {graded.map((d, i) => (
            <div key={i} className="flex gap-2">
              <span className={d.analysis.correct ? 'text-[#4fc06f]' : d.analysis.correct === false ? 'text-[#e04b4b]' : 'text-[#9a9a9a]'}>
                {d.analysis.correct ? '✓' : d.analysis.correct === false ? '✗' : '·'}
              </span>
              <span>
                {scenarioText(d.analysis.scenario)}: {actionText(d)}
                {d.analysis.correct === false && d.analysis.bestIndex >= 0 && ` — GTO ${d.analysis.options[d.analysis.bestIndex].label}`}
              </span>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={onDeal} className="w-full rounded-md border-2 border-[#3f9e5a] text-[#4fc06f] bg-[#1e1e1e] py-2 uppercase tracking-[0.12em] font-semibold text-sm hover:bg-[#233d2b]">
        Deal next hand <span className="text-[#6f6f6f] normal-case tracking-normal font-normal">(Enter)</span>
      </button>
    </div>
  )
}

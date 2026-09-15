import type { Analysis, AnalysisOption, Street } from '../domain/types'

export interface ExplainCtx {
  street: Street
  cls: string
  handLabel: string
  potBb: number
  toCallBb: number
  stackBb: number
  villainFoldPct: number | null
  players: number
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const bb = (x: number) => `${Math.round(x * 10) / 10}bb`
const isAggro = (o: AnalysisOption) => o.kind === 'bet' || o.kind === 'raise' || o.kind === 'allin'
const isPassive = (o: AnalysisOption) => o.kind === 'call' || o.kind === 'check'
const short = (o: AnalysisOption) => o.label.replace(/ \(\d+% pot\)/, '')

/**
 * One to three sentences on why the best option beats what hero chose, built from the numbers
 * the engine already has (frequencies, EVs, equity, pot odds, villain fold %).
 */
export function explain(a: Analysis, ctx: ExplainCtx): string {
  if (a.bestIndex < 0 || a.chosenIndex === undefined) return ''
  const best = a.options[a.bestIndex]
  const chosen = a.options[a.chosenIndex]
  const parts: string[] = []
  const hasEv = typeof best.ev === 'number' && typeof chosen.ev === 'number'
  const hand = ctx.street === 'preflop' ? ctx.cls : ctx.handLabel ? `${ctx.cls} (${ctx.handLabel})` : ctx.cls

  if (a.engine === 'preflop-chart') {
    parts.push(`The chart plays ${hand} as ${short(best)} ${pct(best.freq)} of the time${chosen.freq > 0 ? ` and ${short(chosen).toLowerCase()} only ${pct(chosen.freq)}` : ` and never ${verb(chosen)}`}.`)
    parts.push(preflopReason(best, chosen, ctx))
    return parts.filter(Boolean).join(' ')
  }

  if (hasEv) {
    const diff = (best.ev ?? 0) - (chosen.ev ?? 0)
    parts.push(`${short(best)} earns ${bb(best.ev!)} vs ${bb(chosen.ev!)} for ${short(chosen).toLowerCase()} — ${bb(diff)} lost (${pct(diff / Math.max(ctx.potBb, 1))} of the pot).`)
  }
  const eq = a.equity
  const need = a.potOdds ?? (ctx.toCallBb > 0 ? ctx.toCallBb / (ctx.potBb + ctx.toCallBb) : undefined)

  if (best.kind === 'fold' && isPassive(chosen)) {
    parts.push(
      eq !== undefined && need !== undefined
        ? `Calling ${bb(ctx.toCallBb)} into ${bb(ctx.potBb)} needs ${pct(need)} equity; ${hand} has about ${pct(eq)} against the range that bets here, so the call loses money.`
        : `${hand} does not have enough equity against the betting range to continue.`,
    )
  } else if (best.kind === 'fold' && isAggro(chosen)) {
    parts.push(`${hand} is too weak to raise as a bluff here: the raising range needs hands that improve or already beat their calling range${ctx.villainFoldPct !== null ? `, and they only fold ${pct(ctx.villainFoldPct)}` : ''}.`)
  } else if (isPassive(best) && chosen.kind === 'fold') {
    parts.push(
      eq !== undefined && need !== undefined
        ? `You only need ${pct(need)} equity to call and ${hand} has about ${pct(eq)} — folding gives up a profitable ${best.kind}.`
        : `${hand} is strong enough to continue; folding forfeits your share of the pot.`,
    )
  } else if (isAggro(best) && chosen.kind === 'fold') {
    parts.push(`${hand} is far too strong to fold${ctx.villainFoldPct !== null ? `: ${short(best).toLowerCase()} makes them fold ${pct(ctx.villainFoldPct)}` : ''} and gets paid by worse when called.`)
  } else if (isAggro(best) && isPassive(chosen)) {
    const why = ctx.villainFoldPct !== null ? `They fold ${pct(ctx.villainFoldPct)} to ${short(best).toLowerCase()}` : `${short(best)} builds the pot`
    parts.push(eq !== undefined && eq >= 0.55
      ? `${hand} is ahead of most of their range (${pct(eq)} equity): ${why.toLowerCase()} and the rest pay you off, while ${chosen.kind}ing lets them realise equity for free.`
      : `${why} — with ${hand} (${eq !== undefined ? pct(eq) + ' equity' : 'little showdown value'}) fold equity is where the money is; ${chosen.kind}ing wins the pot far less often.`)
  } else if (isPassive(best) && isAggro(chosen)) {
    parts.push(eq !== undefined && eq >= 0.5
      ? `${hand} has showdown value (${pct(eq)}) but ${short(chosen).toLowerCase()} folds out their worse hands and only gets action from better${ctx.villainFoldPct !== null ? ` (they fold ${pct(ctx.villainFoldPct)} — mostly hands you already beat)` : ''}; ${best.kind}ing keeps their bluffs and weaker hands in.`
      : `${hand} has too little equity (${eq !== undefined ? pct(eq) : '—'}) to bluff here${ctx.villainFoldPct !== null ? `: they fold only ${pct(ctx.villainFoldPct)}` : ''}; ${best.kind}ing loses less.`)
  } else if (isAggro(best) && isAggro(chosen)) {
    parts.push(`${short(best)} is the right size: ${best.amount !== undefined && chosen.amount !== undefined && chosen.amount > best.amount ? 'the bigger size folds out too much of what pays you and risks more when behind' : 'the smaller size does not charge their draws and worse hands enough'}.`)
  } else if (best.kind === 'call' && chosen.kind === 'check') {
    parts.push('You were facing a bet: a check is not available here, it counts as a call.')
  }
  if (ctx.players > 2 && a.engine === 'equity') parts.push('Multiway pot: graded by pot odds vs the preflop ranges (no multiway GTO solution exists).')
  return parts.filter(Boolean).join(' ')
}

function verb(o: AnalysisOption): string {
  switch (o.kind) {
    case 'fold': return 'folds'
    case 'call': return 'calls'
    case 'check': return 'checks'
    case 'allin': return 'jams'
    default: return 'raises'
  }
}

function preflopReason(best: AnalysisOption, chosen: AnalysisOption, ctx: ExplainCtx): string {
  const deep = ctx.stackBb >= 50
  if (best.kind === 'fold') {
    return `${ctx.cls} does not have the equity or playability to continue from this seat: it is dominated too often by the range you would be up against${chosen.kind === 'call' ? ' and calling invites more players behind you' : ''}.`
  }
  if (chosen.kind === 'fold') {
    return `${ctx.cls} is comfortably inside the continuing range here${best.kind === 'allin' ? ' — at this depth the standard play is to jam' : ''}; folding gives up too much equity.`
  }
  if (isAggro(best) && chosen.kind === 'call') {
    return best.kind === 'allin'
      ? `At ${ctx.stackBb + ctx.toCallBb < 45 ? 'this stack depth' : 'this stack-to-pot ratio'} the hand plays best all-in: jamming denies equity and avoids tough postflop spots out of position.`
      : `${ctx.cls} wants to build the pot and take the initiative; flatting caps your range and lets the blinds squeeze${deep ? '' : ' cheaply'}.`
  }
  if (best.kind === 'call' && isAggro(chosen)) {
    return `${ctx.cls} is a hand that prefers to see a flop: raising it turns it into a bluff that gets called by better and folds out the hands you dominate.`
  }
  if (best.kind === 'raise' && chosen.kind === 'allin') {
    return 'Jamming risks the whole stack where a smaller raise gets the same folds and keeps worse hands in.'
  }
  if (best.kind === 'allin' && chosen.kind === 'raise') {
    return 'A small raise leaves you committed anyway and gives them a cheap jam over you; go all-in instead.'
  }
  return ''
}

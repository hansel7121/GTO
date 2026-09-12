import { useState } from 'react'
import { RANKS, SUIT_SYMBOL, cardToString, rankOf, suitOf, type Card } from '../domain/cards'

const SUIT_BG = ['bg-emerald-600', 'bg-sky-600', 'bg-rose-600', 'bg-slate-600']

export function CardChip({ card, size = 'md', onClick, dim }: { card: Card | null; size?: 'sm' | 'md' | 'lg'; onClick?: () => void; dim?: boolean }) {
  const cls = size === 'sm' ? 'w-7 h-9 text-xs' : size === 'lg' ? 'w-14 h-20 text-2xl' : 'w-10 h-14 text-base'
  if (card === null) {
    return (
      <button type="button" onClick={onClick} className={`${cls} rounded-md border-2 border-dashed border-slate-500 text-slate-400 flex items-center justify-center`}>
        ?
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cls} ${SUIT_BG[suitOf(card)]} ${dim ? 'opacity-40' : ''} rounded-md font-bold text-white flex flex-col items-center justify-center shadow`}
    >
      <span>{RANKS[rankOf(card)]}</span>
      <span className="leading-none">{SUIT_SYMBOL[suitOf(card)]}</span>
    </button>
  )
}

export function CardRow({ cards, size = 'md' }: { cards: Card[]; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className="flex gap-1">
      {cards.map((c) => (
        <CardChip key={c} card={c} size={size} />
      ))}
    </div>
  )
}

/** Full-screen card picker. Picks `count` cards, excluding `used`. */
export function CardPicker({
  title,
  count,
  used,
  initial = [],
  onDone,
  onCancel,
}: {
  title: string
  count: number
  used: Card[]
  initial?: Card[]
  onDone: (cards: Card[]) => void
  onCancel: () => void
}) {
  const [picked, setPicked] = useState<Card[]>(initial)
  const usedSet = new Set(used.filter((c) => !initial.includes(c)))
  const toggle = (c: Card) => {
    setPicked((prev) => {
      if (prev.includes(c)) return prev.filter((x) => x !== c)
      if (prev.length < count) return [...prev, c]
      return [...prev.slice(1), c]
    })
  }
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 flex flex-col p-3 gap-3 overflow-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button type="button" onClick={onCancel} className="px-3 py-1 rounded bg-slate-800">
          Cancel
        </button>
      </div>
      <div className="flex gap-1 min-h-14">
        {Array.from({ length: count }, (_, i) => (
          <CardChip key={i} card={picked[i] ?? null} />
        ))}
      </div>
      <div className="grid grid-cols-[auto_repeat(13,minmax(0,1fr))] gap-1 w-full max-w-lg mx-auto">
        {[3, 2, 1, 0].map((suit) => (
          <div key={suit} className="contents">
            <div className={`flex items-center justify-center text-xl ${suit === 2 ? 'text-rose-400' : suit === 1 ? 'text-sky-400' : suit === 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
              {SUIT_SYMBOL[suit]}
            </div>
            {Array.from({ length: 13 }, (_, i) => 12 - i).map((rank) => {
              const c = rank * 4 + suit
              const isUsed = usedSet.has(c)
              const isPicked = picked.includes(c)
              return (
                <button
                  key={c}
                  type="button"
                  disabled={isUsed}
                  onClick={() => toggle(c)}
                  className={`aspect-[3/4] rounded text-sm font-semibold ${isPicked ? SUIT_BG[suit] + ' text-white ring-2 ring-white' : isUsed ? 'bg-slate-900 text-slate-700' : 'bg-slate-800 text-slate-100'}`}
                  aria-label={cardToString(c)}
                >
                  {RANKS[rank]}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={picked.length !== count}
        onClick={() => onDone(picked)}
        className="mt-auto py-3 rounded-lg bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 font-semibold text-lg"
      >
        Done
      </button>
    </div>
  )
}

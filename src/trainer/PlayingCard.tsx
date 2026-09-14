import { RANKS, SUIT_SYMBOL, rankOf, suitOf, type Card } from '../domain/cards'

/** Four-colour deck like PokerNow: clubs green, diamonds blue, hearts red, spades black. */
const SUIT_HEX = ['#2a9d4b', '#2b6fd6', '#d7263d', '#111111']

export function PlayingCard({ card, size = 'md', faceDown, dim }: { card?: Card; size?: 'sm' | 'md' | 'lg'; faceDown?: boolean; dim?: boolean }) {
  const dims = size === 'lg' ? 'w-12 h-[68px] sm:w-14 sm:h-20' : size === 'sm' ? 'w-7 h-10' : 'w-9 h-[52px] sm:w-10 sm:h-14'
  if (faceDown || card === undefined) {
    return (
      <div
        className={`${dims} rounded-[5px] border border-[#f2a7a3] shadow-[0_1px_3px_rgba(0,0,0,.5)] ${dim ? 'opacity-40' : ''}`}
        style={{ background: 'linear-gradient(160deg,#e8908c,#d9706c)' }}
      >
        <div className="w-full h-full rounded-[4px] border-2 border-[#f7c2bf]/60" />
      </div>
    )
  }
  const color = SUIT_HEX[suitOf(card)]
  const rankCls = size === 'lg' ? 'text-2xl sm:text-3xl' : size === 'sm' ? 'text-sm' : 'text-lg sm:text-xl'
  const suitCls = size === 'lg' ? 'text-xl sm:text-2xl' : size === 'sm' ? 'text-xs' : 'text-base sm:text-lg'
  return (
    <div
      className={`${dims} rounded-[5px] bg-white shadow-[0_1px_3px_rgba(0,0,0,.5)] flex flex-col items-start justify-between px-1 py-0.5 leading-none font-bold ${dim ? 'opacity-40' : ''}`}
      style={{ color }}
    >
      <span className={rankCls}>{RANKS[rankOf(card)]}</span>
      <span className={`${suitCls} self-end`}>{SUIT_SYMBOL[suitOf(card)]}</span>
    </div>
  )
}

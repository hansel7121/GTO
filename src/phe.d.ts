declare module 'phe' {
  export function evaluateCardCodes(codes: number[]): number
  export function evaluateCards(cards: string[]): number
  export function cardCodes(cards: string[]): number[]
  export function handRank(strength: number): number
  export function rankDescription(rank: number): string
}

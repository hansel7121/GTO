import type { Session } from '../domain/types'

/** Formatter for amounts in bb, shown as currency or bb depending on settings. */
export function makeFmt(session: Session, showBb: boolean) {
  return (bb: number) => {
    if (showBb) return `${trim(bb)}bb`
    const v = bb * session.bb
    return `${session.currency}${trim(v)}`
  }
}

export function trim(x: number): string {
  if (Math.abs(x - Math.round(x)) < 0.005) return String(Math.round(x))
  return (Math.round(x * 100) / 100).toString()
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

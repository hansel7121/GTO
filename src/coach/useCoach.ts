import { useCallback, useEffect, useRef, useState } from 'react'
import type { EngineConfig } from '../domain/engine'
import type { CoachTurn, Hand, Session, Settings } from '../domain/types'
import { db } from '../storage/db'
import { askCoach, CoachError } from './client'
import { describeHand } from './prompt'

/** navigator.onLine, kept current with the online/offline events. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export interface CoachState {
  /** Reply being streamed right now (not yet saved on the hand). */
  streaming: string | null
  error: string | null
  busy: boolean
}

const IDLE: CoachState = { streaming: null, error: null, busy: false }

/** Ask Claude about `hand`; every turn is saved on the hand so the conversation can be re-read offline. */
export function useCoach(session: Session | undefined, hand: Hand | undefined, cfg: EngineConfig | null, settings: Settings) {
  // state is tagged with the hand it belongs to, so navigating to another hand starts idle
  const [raw, setRaw] = useState<CoachState & { handId?: string }>(IDLE)
  const handId = hand?.id
  const state: CoachState = raw.handId === handId ? raw : IDLE
  const setState = useCallback((s: CoachState | ((prev: CoachState) => CoachState)) => {
    setRaw((prev) => ({ ...(typeof s === 'function' ? s(prev.handId === handId ? prev : IDLE) : s), handId }))
  }, [handId])
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [handId])

  const ask = useCallback(
    async (question: string) => {
      if (!session || !hand || !cfg || state.busy) return
      const q = question.trim()
      if (!q) return
      const fresh = (await db.hands.get(hand.id)) ?? hand
      const turns: CoachTurn[] = [...(fresh.coach ?? []), { role: 'user', text: q, at: Date.now() }]
      await db.hands.update(hand.id, { coach: turns })
      const ctl = new AbortController()
      abort.current = ctl
      setState({ streaming: '', error: null, busy: true })
      let reply: CoachTurn
      try {
        const r = await askCoach({
          apiKey: settings.claudeApiKey,
          model: settings.claudeModel,
          handText: describeHand(session, fresh, cfg),
          turns,
          signal: ctl.signal,
          onText: (t) => setState((s) => ({ ...s, streaming: t })),
        })
        reply = { role: 'assistant', text: r.text, at: Date.now(), model: r.model }
        setState({ streaming: null, error: null, busy: false })
      } catch (e) {
        const err = e instanceof CoachError ? e : new CoachError((e as Error).message, '')
        setState({ streaming: null, error: err.message, busy: false })
        if (!err.partial) return
        reply = { role: 'assistant', text: err.partial, at: Date.now(), model: settings.claudeModel, partial: true }
      } finally {
        if (abort.current === ctl) abort.current = null
      }
      const latest = (await db.hands.get(hand.id)) ?? fresh
      await db.hands.update(hand.id, { coach: [...(latest.coach ?? []), reply] })
    },
    [session, hand, cfg, settings, state.busy, setState],
  )

  const cancel = useCallback(() => abort.current?.abort(), [])

  const clear = useCallback(async () => {
    if (!hand) return
    abort.current?.abort()
    await db.hands.update(hand.id, { coach: [] })
    setState(IDLE)
  }, [hand, setState])

  return { ...state, ask, cancel, clear }
}

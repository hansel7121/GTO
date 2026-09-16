import Anthropic from '@anthropic-ai/sdk'
import type { CoachTurn } from '../domain/types'

export const COACH_MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5 — best explanations' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — faster, cheaper' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — cheapest' },
]

const SYSTEM = `You are a poker coach explaining a no-limit hold'em cash-game hand to the player who just played it ("hero"), at the table on their phone.

You receive the hand history and, for each hero decision, the output of the app's engine: a preflop chart lookup, an on-device CFR solver (GTO Wizard / PioSOLVER-style heads-up solution), or an equity / pot-odds estimate. Each engine result carries an honesty label (exact vs approximated ranges, quick vs full solve, ungraded).

Your job is to explain WHY the recommended action is right in terms the player can reuse: ranges of both players given the line, position, board texture and range advantage, stack-to-pot ratio, pot odds and minimum defence frequency, blockers, and what the alternative lines lose. Explain mixed strategies (e.g. "check 40% / bet 60%") as a balance, not as indecision. When hero's action was graded a mistake, be concrete about what it costs and when the same line would be fine.

Be honest about the limits of the analysis: if a result is marked approximate, quick, equity-only, or ungraded, say so and lean on general principles rather than pretending the numbers are exact. Do not invent frequencies or EVs that were not given. If you think the engine output looks wrong for the spot, say why.

Style: plain language, short paragraphs, headers only when discussing several decisions, bold the key takeaway of each decision. Use the same units as the hand history (bb; the big blind's value in currency is given). Answer the question that was asked; keep it under ~350 words unless asked for more.`

export interface CoachRequest {
  apiKey: string
  model: string
  /** Plain-text hand history + analysis (see describeHand). */
  handText: string
  /** Conversation so far; the last turn must be the new user question. */
  turns: CoachTurn[]
  signal?: AbortSignal
  /** Called with the full reply so far on every streamed chunk. */
  onText: (soFar: string) => void
}

export class CoachError extends Error {
  /** Text streamed before the failure (may be empty). */
  partial: string
  constructor(message: string, partial: string) {
    super(message)
    this.partial = partial
  }
}

/** Ask Claude about a hand; resolves with the full reply. Rejects with CoachError carrying any partial text. */
export async function askCoach(req: CoachRequest): Promise<{ text: string; model: string }> {
  if (!req.apiKey) throw new CoachError('Add your Anthropic API key in Settings first.', '')
  // The key is the user's own and lives only on their device, so the browser calls the API directly.
  const client = new Anthropic({ apiKey: req.apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 })
  const messages: Anthropic.Beta.BetaMessageParam[] = req.turns.map((t, i) => ({
    role: t.role,
    content: i === 0 ? `<hand>\n${req.handText}\n</hand>\n\n${t.text}` : t.text,
  }))
  const opus = req.model.startsWith('claude-opus-5') || req.model.startsWith('claude-fable')
  let text = ''
  try {
    const stream = client.beta.messages.stream(
      {
        model: req.model,
        max_tokens: 8000,
        system: SYSTEM,
        messages,
        // server-side fallback to another model if a safety classifier declines the request
        ...(opus ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      },
      { signal: req.signal },
    )
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        text += ev.delta.text
        req.onText(text)
      }
    }
    const final = await stream.finalMessage()
    if (final.stop_reason === 'refusal') throw new CoachError('Claude declined to answer this one.', text)
    if (final.stop_reason === 'max_tokens') text += '\n\n[reply was cut off]'
    return { text, model: final.model }
  } catch (e) {
    if (e instanceof CoachError) throw e
    throw new CoachError(friendlyError(e), text)
  }
}

function friendlyError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Claude rejected the API key — check it in Settings.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use that model.'
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited by the API — try again in a minute.'
  if (e instanceof Anthropic.BadRequestError) return `The API rejected the request: ${e.message}`
  if (e instanceof Anthropic.APIUserAbortError) return 'Cancelled.'
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach Claude — are you connected to Wi-Fi?'
  if (e instanceof Anthropic.APIError) return `API error ${e.status ?? ''}: ${e.message}`
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'You are offline — connect to Wi-Fi to ask Claude.'
  return (e as Error).message || 'Something went wrong.'
}

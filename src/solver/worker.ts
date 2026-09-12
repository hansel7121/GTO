import * as Comlink from 'comlink'

type ModST = typeof import('./pkg/solver-st/solver.js')
type ModMT = typeof import('./pkg/solver-mt/solver.js')
type Mod = ModST | ModMT
type TreeMod = typeof import('./pkg/tree/tree.js')

export interface SolveConfig {
  oopRange: Float32Array
  ipRange: Float32Array
  board: Uint8Array // 3 cards (flop) or 4/5 cards to start the solve from the turn/river
  maxRaises: number // bets+raises per street before only fold/call/all-in remain (0 = unlimited)
  startingPot: number
  effectiveStack: number
  flopBet: string
  flopRaise: string
  turnBet: string
  turnRaise: string
  riverBet: string
  riverRaise: string
  addedLines: string
  targetExploitPct: number
  timeBudgetMs: number
  maxIterations: number
}

export interface SolveProgress {
  iteration: number
  exploitabilityPct: number
  elapsedMs: number
  phase: 'building' | 'solving' | 'done'
}

export interface NodeResult {
  player: 'oop' | 'ip' | 'chance' | 'terminal'
  actions: string[] // e.g. ["Fold:0", "Call:0", "Raise:300"]
  hands: string[] // private hands of the player to act (e.g. "AsKd")
  strategy: number[][] // [action][hand]
  evs: number[][] // [action][hand], chips
  equity: number[] // per hand
  weights: number[] // normalized weights per hand
  pot: number // pot including this player's committed amount
  empty: boolean
}

type Game = ReturnType<Mod['GameManager']['new']>
let game: Game | null = null
let treeMod: TreeMod | null = null
let solvedBaseKey = ''
let solvedAdded = ''
let lastExploit = 0

const RANKS = '23456789TJQKA'
const SUITS = 'cdhs'
const cardStr = (c: number) => RANKS[c >> 2] + SUITS[c & 3]

async function init(threads: number): Promise<{ multithreaded: boolean; threads: number }> {
  const tm = (await import('./pkg/tree/tree.js')) as TreeMod
  await tm.default()
  treeMod = tm
  const canMT = threads !== -1 && typeof SharedArrayBuffer !== 'undefined' && (self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated === true
  if (canMT) {
    try {
      const m = (await import('./pkg/solver-mt/solver.js')) as ModMT
      await m.default()
      const n = Math.max(1, threads || Math.min(8, navigator.hardwareConcurrency || 2))
      await m.initThreadPool(n)
      game = m.GameManager.new()
      return { multithreaded: true, threads: n }
    } catch (e) {
      console.warn('MT solver failed, falling back to single-threaded', e)
    }
  }
  const m = (await import('./pkg/solver-st/solver.js')) as ModST
  await m.default()
  game = m.GameManager.new()
  return { multithreaded: false, threads: 1 }
}

function requireGame() {
  if (!game) throw new Error('Solver not initialised')
  return game
}

function initTree(cfg: SolveConfig, addedLines: string): string | undefined {
  const g = requireGame()
  return g.init(
    cfg.oopRange,
    cfg.ipRange,
    cfg.board,
    cfg.startingPot,
    cfg.effectiveStack,
    0,
    0,
    false,
    cfg.flopBet,
    cfg.flopRaise,
    cfg.turnBet,
    cfg.turnRaise,
    '',
    cfg.riverBet,
    cfg.riverRaise,
    '',
    cfg.flopBet,
    cfg.flopRaise,
    cfg.turnBet,
    cfg.turnRaise,
    cfg.riverBet,
    cfg.riverRaise,
    1.5,
    0.15,
    0.1,
    addedLines,
    '',
    cfg.maxRaises,
  )
}

function labelled<T>(label: string, f: () => T): T {
  try {
    return f()
  } catch (e) {
    throw new Error(`${label}: ${(e as Error).message}`)
  }
}

/**
 * `line` entries: {kind:'X'|'C'|'F'|'B'|'R'|'A', amount?} for actions and {kind:'D', card} for
 * chance deals (turn / river cards).
 */
export interface LineStep {
  kind: 'X' | 'C' | 'F' | 'B' | 'R' | 'A' | 'D'
  amount?: number
  card?: number
}

const amountOf = (a: string) => Number(a.split(':')[1])
const isBetLike = (a: string) => /^(Bet|Raise|Allin):/.test(a)

/**
 * Walks `line` through the abstract action tree (no memory needed), adding any bet size that is
 * missing. Returns the solver history (action indices + chance cards) and the added-lines string
 * the game must be initialised with so that the indices match.
 */
function walkLine(cfg: SolveConfig, line: LineStep[], addedLines: string): { history: number[]; addedLines: string } {
  if (!treeMod) throw new Error('Tree module not initialised')
  const t = treeMod.TreeManager.new(
    cfg.board.length, cfg.startingPot, cfg.effectiveStack, false,
    cfg.flopBet, cfg.flopRaise, cfg.turnBet, cfg.turnRaise, '', cfg.riverBet, cfg.riverRaise, '',
    cfg.flopBet, cfg.flopRaise, cfg.turnBet, cfg.turnRaise, cfg.riverBet, cfg.riverRaise,
    1.5, 0.15, 0.1, addedLines, '', cfg.maxRaises,
  )
  try {
    if (t.is_error()) throw new Error('Could not build the action tree (invalid bet sizes?)')
    const history: number[] = []
    for (const step of line) {
      if (step.kind === 'D') {
        history.push(step.card!)
        continue
      }
      if (t.is_terminal_node()) throw new Error('Line continues past a terminal node')
      const acts = t.actions().split('/')
      const amt = step.amount ?? 0
      let idx = -1
      if (step.kind === 'X' || step.kind === 'C' || step.kind === 'F') {
        idx = t.play(step.kind)
        if (idx < 0) throw new Error(`Action ${step.kind} not available at [${acts.join(' ')}]`)
      } else {
        // match an existing bet-like action by amount (1 chip tolerance)
        let match = acts.findIndex((a) => isBetLike(a) && Math.abs(amountOf(a) - amt) <= 1)
        if (match < 0 && step.kind === 'A') match = acts.findIndex((a) => a.startsWith('Allin'))
        if (match < 0) {
          const facingBet = acts.some((a) => a.startsWith('Fold'))
          t.add_bet_action(amt, facingBet)
          const acts2 = t.actions().split('/')
          match = acts2.findIndex((a) => isBetLike(a) && Math.abs(amountOf(a) - amt) <= 1)
          if (match < 0) match = acts2.findIndex((a) => a.startsWith('Allin'))
          if (match < 0) throw new Error(`Could not add bet ${amt} at [${acts.join(' ')}]`)
          idx = t.play(acts2[match].replace(/^Bet:/, 'B').replace(/^Raise:/, 'R').replace(/^Allin:/, 'A'))
        } else {
          idx = t.play(acts[match].replace(/^Bet:/, 'B').replace(/^Raise:/, 'R').replace(/^Allin:/, 'A'))
        }
        if (idx < 0) throw new Error(`Could not play bet ${amt}`)
      }
      history.push(idx)
    }
    return { history, addedLines: t.added_lines() }
  } finally {
    t.free()
  }
}

/**
 * Builds the game for `cfg` (re-using the already solved one when the tree is identical) and makes
 * sure every action of `line` exists.
 */
function ensureLine(cfg: SolveConfig, baseKey: string, line: LineStep[]): { addedLines: string; history: number[]; reused: boolean } {
  const startLines = baseKey === solvedBaseKey ? solvedAdded : cfg.addedLines
  const w = walkLine(cfg, line, startLines)
  if (baseKey === solvedBaseKey && w.addedLines === solvedAdded) {
    return { addedLines: w.addedLines, history: w.history, reused: true }
  }
  const err = initTree(cfg, w.addedLines)
  if (err) throw new Error(`Could not build the game tree: ${err}`)
  solvedBaseKey = ''
  return { addedLines: w.addedLines, history: w.history, reused: false }
}

async function solve(
  cfg: SolveConfig,
  line: LineStep[],
  onProgress: (p: SolveProgress) => void,
): Promise<{ exploitabilityPct: number; history: number[]; addedLines: string; iterations: number; reused: boolean; memoryMb: number }> {
  const g = requireGame()
  onProgress({ iteration: 0, exploitabilityPct: 100, elapsedMs: 0, phase: 'building' })
  const baseKey = JSON.stringify({
    o: Array.from(cfg.oopRange),
    i: Array.from(cfg.ipRange),
    b: Array.from(cfg.board),
    p: cfg.startingPot,
    s: cfg.effectiveStack,
    fb: cfg.flopBet, fr: cfg.flopRaise, tb: cfg.turnBet, tr: cfg.turnRaise, rb: cfg.riverBet, rr: cfg.riverRaise,
    a: cfg.addedLines,
    m: cfg.maxRaises,
  })
  const { addedLines, history, reused } = ensureLine(cfg, baseKey, line)
  if (reused) {
    return { exploitabilityPct: lastExploit, history, addedLines, iterations: 0, reused: true, memoryMb: 0 }
  }
  const memPlain = Number(g.memory_usage(false))
  const memCompressed = Number(g.memory_usage(true))
  const limit = 3.2 * 1024 * 1024 * 1024
  const compress = memPlain > 1024 * 1024 * 1024
  if ((compress ? memCompressed : memPlain) > limit) {
    throw new Error(`Game tree needs ${(memCompressed / 1024 / 1024 / 1024).toFixed(1)} GB; reduce bet sizes in Settings.`)
  }
  g.allocate_memory(compress)
  const start = performance.now()
  const target = cfg.targetExploitPct
  let iteration = 0
  let exploit = 100
  const checkEvery = 5
  while (iteration < cfg.maxIterations) {
    g.solve_step(iteration)
    iteration++
    if (iteration % checkEvery === 0) {
      exploit = (g.exploitability() / cfg.startingPot) * 100
      const elapsed = performance.now() - start
      onProgress({ iteration, exploitabilityPct: exploit, elapsedMs: elapsed, phase: 'solving' })
      if (exploit <= target) break
      if (elapsed > cfg.timeBudgetMs) break
      // yield to the event loop so progress messages flush
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  g.finalize()
  exploit = (g.exploitability() / cfg.startingPot) * 100
  solvedBaseKey = baseKey
  solvedAdded = addedLines
  lastExploit = exploit
  onProgress({ iteration, exploitabilityPct: exploit, elapsedMs: performance.now() - start, phase: 'done' })
  return {
    exploitabilityPct: exploit,
    history,
    addedLines,
    iterations: iteration,
    reused: false,
    memoryMb: (compress ? memCompressed : memPlain) / 1024 / 1024,
  }
}

function query(history: number[]): NodeResult {
  const g = requireGame()
  labelled(`apply_history ${JSON.stringify(history)}`, () => g.apply_history(new Uint32Array(history)))
  const player = g.current_player() as NodeResult['player']
  const actsStr = labelled('actions', () => g.actions_after(new Uint32Array([])))
  const actions = actsStr === 'terminal' || actsStr === 'chance' ? [] : actsStr.split('/')
  const oopCards = g.private_cards(0)
  const ipCards = g.private_cards(1)
  const n0 = oopCards.length
  const n1 = ipCards.length
  const buf = labelled('get_results', () => g.get_results())
  let pos = 0
  const potOop = buf[pos++]
  const potIp = buf[pos++]
  const emptyFlag = buf[pos++]
  const empty = emptyFlag > 0
  const weightsRaw = [Array.from(buf.slice(pos, pos + n0)), Array.from(buf.slice(pos + n0, pos + n0 + n1))]
  pos += n0 + n1
  const normalized = [Array.from(buf.slice(pos, pos + n0)), Array.from(buf.slice(pos + n0, pos + n0 + n1))]
  pos += n0 + n1
  let equity: number[][] = [[], []]
  if (!empty) {
    equity = [Array.from(buf.slice(pos, pos + n0)), Array.from(buf.slice(pos + n0, pos + n0 + n1))]
    pos += n0 + n1
    pos += n0 + n1 // ev (unused; we use per-action detail)
    pos += n0 + n1 // eqr
  }
  const cur = player === 'oop' ? 0 : player === 'ip' ? 1 : -1
  const nCur = cur === 0 ? n0 : cur === 1 ? n1 : 0
  const cards = cur === 0 ? oopCards : ipCards
  const hands: string[] = []
  for (let i = 0; i < nCur; i++) {
    const c1 = cards[i] & 0xff
    const c2 = cards[i] >> 8
    hands.push(cardStr(c1) + cardStr(c2))
  }
  const strategy: number[][] = []
  const evs: number[][] = []
  if (cur >= 0 && actions.length > 0) {
    for (let a = 0; a < actions.length; a++) {
      strategy.push(Array.from(buf.slice(pos + a * nCur, pos + (a + 1) * nCur)) as number[])
    }
    pos += actions.length * nCur
    if (!empty) {
      for (let a = 0; a < actions.length; a++) {
        evs.push(Array.from(buf.slice(pos + a * nCur, pos + (a + 1) * nCur)) as number[])
      }
    }
  }
  return {
    player,
    actions,
    hands,
    strategy,
    evs,
    equity: cur >= 0 ? equity[cur] : [],
    weights: cur >= 0 ? (empty ? weightsRaw[cur] : normalized[cur]) : [],
    pot: cur === 0 ? potOop : potIp,
    empty,
  }
}

function possibleCards(history: number[]): number[] {
  const g = requireGame()
  g.apply_history(new Uint32Array(history))
  const mask = g.possible_cards()
  const out: number[] = []
  for (let c = 0; c < 52; c++) if ((mask >> BigInt(c)) & 1n) out.push(c)
  return out
}

function reset() {
  solvedBaseKey = ''
  solvedAdded = ''
}

const api = { init, solve, query, possibleCards, reset }
export type SolverWorkerApi = typeof api
Comlink.expose(api)

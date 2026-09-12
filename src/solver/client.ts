import * as Comlink from 'comlink'
import type { LineStep, NodeResult, SolveConfig, SolveProgress, SolverWorkerApi } from './worker'

let worker: Worker | null = null
let api: Comlink.Remote<SolverWorkerApi> | null = null
let ready: Promise<{ multithreaded: boolean; threads: number }> | null = null
let info: { multithreaded: boolean; threads: number } | null = null
let queue: Promise<unknown> = Promise.resolve()

export function solverInfo() {
  return info
}

export function getSolver(threads = 0) {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    api = Comlink.wrap<SolverWorkerApi>(worker)
    ready = api.init(localStorage.getItem('forceST') ? -1 : threads).then((i) => {
      info = i
      return i
    })
  }
  return { api: api!, ready: ready! }
}

/** Serialises solver jobs: the worker holds a single game instance. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job)
  queue = run.catch(() => undefined)
  return run
}

export interface SolveOutcome {
  exploitabilityPct: number
  history: number[]
  addedLines: string
  iterations: number
  reused: boolean
  memoryMb: number
  node: NodeResult
}

export function solveAndQuery(
  cfg: SolveConfig,
  line: LineStep[],
  onProgress: (p: SolveProgress) => void,
  threads = 0,
  /** Number of trailing line steps to strip before querying (e.g. hero's own chosen action). */
  dropLast = 0,
): Promise<SolveOutcome> {
  return enqueue(async () => {
    const { api, ready } = getSolver(threads)
    await ready
    const res = await api.solve(cfg, line, Comlink.proxy(onProgress))
    const history = dropLast > 0 ? res.history.slice(0, res.history.length - dropLast) : res.history
    const node = await api.query(history)
    return { ...res, history, node }
  })
}

export function terminateSolver() {
  worker?.terminate()
  worker = null
  api = null
  ready = null
  info = null
}

// Smoke test for the vendored WASM solver: replays the `basic.rs` example from postflop-solver
// (Td9d6h Qc, given ranges) and checks the tree and the strategy sanity assertions from that example.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cardFromString } from '../domain/cards'
import { parseRange, rangeToRaw } from '../preflop/range'
import init, { GameManager } from './pkg/solver-st/solver.js'
import initTree, { TreeManager } from './pkg/tree/tree.js'

const wasm = (p: string) => readFileSync(new URL(p, import.meta.url))

describe('wasm solver', () => {
  it('reproduces the postflop-solver basic example', async () => {
    await init(wasm('./pkg/solver-st/solver_bg.wasm'))
    const oop = rangeToRaw(parseRange('66+,A8s+,A5s-A4s,AJo+,K9s+,KQo,QTs+,JTs,96s+,85s+,75s+,65s,54s'))
    const ip = rangeToRaw(parseRange('QQ-22,AQs-A2s,ATo+,K5s+,KJo+,Q8s+,J8s+,T7s+,96s+,86s+,75s+,64s+,53s+'))
    const board = new Uint8Array(['Td', '9d', '6h', 'Qc'].map(cardFromString))
    const g = GameManager.new()
    const sizes = '60%, e, a'
    const err = g.init(oop, ip, board, 200, 900, 0, 0, false, sizes, '2.5x', sizes, '2.5x', '', sizes, '2.5x', '50%', sizes, '2.5x', sizes, '2.5x', sizes, '2.5x', 1.5, 0.15, 0.1, '', '', 0)
    expect(err).toBeUndefined()
    expect(g.private_cards(1).length).toBe(250)
    g.allocate_memory(false)
    expect(g.actions_after(new Uint32Array([]))).toBe('Check:0/Bet:120/Bet:216/Allin:900')
    expect(g.actions_after(new Uint32Array([1]))).toBe('Fold:0/Call:0/Raise:300')
    for (let i = 0; i < 60; i++) g.solve_step(i)
    g.finalize()
    const exploit = g.exploitability() / 200
    expect(exploit).toBeLessThan(0.05)
    // IP facing the 60% bet never folds the nut straight (KsJs)
    g.apply_history(new Uint32Array([1]))
    const ipCards = g.private_cards(1)
    const ksjs = Array.from(ipCards).findIndex((v) => {
      const c1 = v & 0xff
      const c2 = v >> 8
      return (c1 === cardFromString('Js') && c2 === cardFromString('Ks')) || (c1 === cardFromString('Ks') && c2 === cardFromString('Js'))
    })
    expect(ksjs).toBeGreaterThanOrEqual(0)
    const res = g.get_results()
    // layout: pot(2), flag(1), weights(n0+n1), normalized(n0+n1), equity(n0+n1), ev(n0+n1), eqr(n0+n1), strategy(actions*n1)
    const n0 = g.private_cards(0).length
    const n1 = ipCards.length
    const stratStart = 3 + 5 * (n0 + n1)
    const foldFreq = res[stratStart + ksjs]
    expect(foldFreq).toBeLessThan(0.01)
    g.free()
  }, 120000)

  it('tree module respects the raise cap and reports added lines', async () => {
    await initTree(wasm('./pkg/tree/tree_bg.wasm'))
    const t = TreeManager.new(3, 550, 9750, false, '33%', '2.5x', '75%', '2.5x', '', '75%', '2.5x', '', '33%', '2.5x', '75%', '2.5x', '75%', '2.5x', 1.5, 0.15, 0.1, '', '', 1)
    expect(t.actions()).toBe('Check:0/Bet:182')
    expect(t.play('B182')).toBe(1)
    expect(t.actions()).toBe('Fold:0/Call:0/Allin:9750') // cap = 1: only an all-in re-raise
    t.add_bet_action(500, true)
    expect(t.actions()).toBe('Fold:0/Call:0/Raise:500/Allin:9750')
    expect(t.added_lines()).toBe('B182-R500')
    t.free()
  })
})

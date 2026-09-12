import fs from 'node:fs'
import init, { GameManager } from '../src/solver/pkg/solver-st/solver.js'
await init(fs.readFileSync(new URL('../src/solver/pkg/solver-st/solver_bg.wasm', import.meta.url)))
const mk=(n)=>{const a=new Float32Array(1326); for(let i=0;i<n;i++) a[Math.floor(i*1326/n)]=1; return a}
const board = new Uint8Array([51, 21, 0])
for (const [no,ni] of [[570,460],[300,300],[1326,1326]]) for (const [fb,fr,tb,rb,cap] of [['33%','2.5x','75%','75%',1],['33%, 75%','2.5x','75%','75%',1],['33%','2.5x','50%, 100%','75%',1],['33%','2.5x','75%','75%',2]]) {
  const g = GameManager.new()
  const err = g.init(mk(no), mk(ni), board, 550, 9750, 0, 0, false, fb, fr, tb, fr, '', rb, fr, '', fb, fr, tb, fr, rb, fr, 1.5, 0.15, 0.1, '', '', cap)
  if (err) { console.log('ERR', err); continue }
  console.log(`${no}/${ni} ${fb}|${tb}|${rb} cap=${cap}: ${(Number(g.memory_usage(false))/1e6).toFixed(0)} MB / ${(Number(g.memory_usage(true))/1e6).toFixed(0)} MB compressed`)
  g.free()
}

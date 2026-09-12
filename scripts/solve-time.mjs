import fs from 'node:fs'
import init, { GameManager } from '../src/solver/pkg/solver-st/solver.js'
await init(fs.readFileSync(new URL('../src/solver/pkg/solver-st/solver_bg.wasm', import.meta.url)))
const mk=(n)=>{const a=new Float32Array(1326); for(let i=0;i<n;i++) a[Math.floor(i*1326/n)]=1; return a}
const board = new Uint8Array([51, 21, 0])
const g = GameManager.new()
const err = g.init(mk(570), mk(460), board, 550, 9750, 0, 0, false, '33%','2.5x','75%','2.5x','','75%','2.5x','','33%','2.5x','75%','2.5x','75%','2.5x', 1.5, 0.15, 0.1, '', '', 1)
if (err) throw new Error(err)
g.allocate_memory(false)
const t0=Date.now()
for (let i=0;i<40;i++){ g.solve_step(i); if((i+1)%20===0){ const e=g.exploitability()/550*100; console.log(i+1, e.toFixed(2)+'%', ((Date.now()-t0)/1000).toFixed(1)+'s'); if(e<0.5) break } }
g.finalize()
console.log('actions', g.actions_after(new Uint32Array([])))

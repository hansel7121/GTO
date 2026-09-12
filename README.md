# GTO Trainer

Log the hands you play in a live game and grade every decision against GTO, on your phone at the table or later on a laptop. Mobile-first PWA, no accounts — all data stays on the device (IndexedDB) with JSON export/import.

## What it does

- **Sessions** with blinds, straddle, table size (2–10) and stack depth (everyone is assumed to start each hand deep-stacked at that depth).
- **Hands**: pick your seat (shown with "Nth to act postflop"), your two cards, and log every action seat by seat. The app tracks pot, stacks, who is to act, min-raise, all-ins and street boundaries.
- **Analysis at every hero decision** — with the recommended action mix, EV per action where available, and a grade for what you actually did:
  - **Preflop** — chart lookup (RFI, facing an open, facing a 3-bet, facing a 4-bet). Suggested sizes follow the same source as the charts (2.5bb open / 3bb SB, 3-bet 3.5x IP / 4x OOP, 4-bet 2.3x IP / 2.5x OOP).
  - **Heads-up postflop** — an on-device CFR solver (the open-source `postflop-solver` engine, same Discounted-CFR family as commercial solvers) solves the spot with the preflop ranges implied by the line. Your real bet sizes are always added to the tree. EV loss = EV(best) − EV(your action).
  - **Multiway postflop** — no public GTO solution exists for multiway pots, so the app shows Monte-Carlo equity vs the preflop ranges plus textbook pot-odds / MDF / alpha math and grades call-vs-fold only. Bet/check decisions multiway are informational, not graded.
- **Session accuracy**: correct ÷ graded decisions, total solver EV lost (bb), split by street and by engine (solver vs approximate). The exact rules are shown under "how is this scored?".

Anything that has no reputable model (cold 4-bet spots, limped pots for the big blind, multiway bet/check, 5-bets) is explicitly left **ungraded** instead of being guessed.

### Engines and honesty labels

| Badge | Meaning |
| --- | --- |
| `GTO solver` | CFR solution of the exact heads-up line, solved from the flop. Shows the reached exploitability (% of pot). |
| `GTO solver · approx` | Solver, but the ranges came from an approximated line (limpers, squeeze, mapped seat…). |
| `(quick)` | Quick mode: turn/river solved from that street with un-narrowed preflop ranges, or an equity estimate on the flop. Re-graded exactly with **Grade all** on a laptop. |
| `Preflop chart` | Chart lookup. RFI charts are transcribed verbatim from the cited source; facing-raise / 3-bet / 4-bet charts are bundled approximations of published solver output — import your own ranges in Settings for exact frequencies. |
| `Equity / pot odds · approx` | Multiway / fallback math. |

## Solver modes (Settings)

- **Full** — always solve from the flop (the way GTO Wizard / Pio solutions are built). Needs ~0.5–1 GB and a few minutes per hand on a multi-core laptop; too slow single-threaded on a phone.
- **Quick** — flop decisions get an equity/pot-odds estimate, turn/river are solved from that street in seconds. Marked `(quick)` so you can re-grade later.
- **Auto** (default) — Full on a cross-origin-isolated multi-core desktop, Quick elsewhere.
- **Off** — equity only.

The default tree is deliberately tiny (one bet size per street, one raise then all-in) because tree size explodes at 100bb; the real sizes from your hand are added on top so your line is always solved exactly.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173 (open it from your phone on the same Wi-Fi with --host)
npm test           # unit tests incl. a solver smoke test that reproduces the upstream example
npm run build      # production build in dist/
```

### Deploy (free) on Vercel

```bash
npx vercel          # first time: log in, accept defaults (Vite is auto-detected)
npx vercel --prod
```

`vercel.json` sets the `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers that the multithreaded solver needs (`crossOriginIsolated`), plus SPA rewrites. Open the deployed URL on your phone and "Add to Home Screen" — it installs as a PWA and works offline after the first load.

### Rebuilding the solver WASM (optional)

The compiled `.wasm` packages are committed under `src/solver/pkg/`. To rebuild from source you need Rust nightly with `rust-src` and the `wasm32-unknown-unknown` target, and `wasm-pack`:

```bash
cd vendor/wasm-postflop
rustup run nightly wasm-pack build --target web --out-dir ../../pkg/solver-st rust/solver-st
rustup run nightly wasm-pack build --target web --out-dir ../../pkg/tree      rust/tree
# multithreaded build (shared memory) needs a nightly from before the 2026 target-feature changes:
rustup run nightly-2025-06-01 wasm-pack build --target web --out-dir ../../pkg/solver-mt rust/solver-mt
cp -r pkg/* ../../src/solver/pkg/
```

`vendor/postflop-solver` is a copy of the upstream library with one addition: a per-street raise cap (`set_max_raises`) so trees stay small enough for a browser.

## Sources

- Solver: [postflop-solver](https://github.com/b-inary/postflop-solver) and [wasm-postflop](https://github.com/b-inary/wasm-postflop) by Wataru Inariba — AGPL-3.0-or-later. This project vendors and lightly patches them; see `vendor/`.
- Hand evaluation: [phe](https://github.com/thlorenz/phe) (Cactus-Kev perfect-hash evaluator) — MIT.
- Preflop RFI charts (6-max and full-ring, 100bb cash): the text ranges published on [pokercoaching.com/preflop-charts](https://pokercoaching.com/preflop-charts/), including the sizing guidance used for suggested raise sizes.
- Facing-raise / 3-bet / 4-bet charts: bundled approximations of widely published 100bb 6-max solver output (GTO Wizard-style). They are labelled `approx` in the app; paste your own solver exports in Settings → Preflop ranges to replace any of them (the importer accepts the standard `AA,KK,AQs:0.5,A5s-A2s` syntax used by GTO Wizard and PioSOLVER).
- Pot odds / MDF / alpha: standard definitions (e.g. Chen & Ankenman, *The Mathematics of Poker*).

This app is not affiliated with GTO Wizard.

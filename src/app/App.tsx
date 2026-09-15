import { HashRouter, Link, Route, Routes } from 'react-router-dom'
import { GtoPage } from '../gto/GtoPage'
import { TrainerPage } from '../trainer/TrainerPage'
import { HandPage } from './HandPage'
import { HomePage } from './HomePage'
import { SessionPage } from './SessionPage'
import { SettingsPage } from './SettingsPage'

export function App() {
  return (
    <HashRouter>
      <Routes>
        {/* the trainer draws its own full-width table, outside the phone-sized shell */}
        <Route path="/trainer" element={<TrainerPage />} />
        <Route path="/gto" element={<GtoPage />} />
        <Route path="*" element={<Shell />} />
      </Routes>
    </HashRouter>
  )
}

function Shell() {
  return (
    <div className="min-h-dvh flex flex-col max-w-xl mx-auto px-3 pb-[env(safe-area-inset-bottom)]">
      <header className="flex items-center justify-between py-3">
        <Link to="/" className="font-bold text-lg tracking-tight">
          ♠ GTO Trainer
        </Link>
        <nav className="flex gap-4 text-sm text-slate-300">
          <Link to="/gto">GTO trainer</Link>
          <Link to="/trainer">Preflop drill</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </header>
      <main className="flex-1 flex flex-col gap-3">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/session/:sid" element={<SessionPage />} />
          <Route path="/session/:sid/hand/:hid" element={<HandPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}

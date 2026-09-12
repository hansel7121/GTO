import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { HandPage } from './HandPage'
import { HomePage } from './HomePage'
import { SessionPage } from './SessionPage'
import { SettingsPage } from './SettingsPage'

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-dvh flex flex-col max-w-xl mx-auto px-3 pb-[env(safe-area-inset-bottom)]">
        <header className="flex items-center justify-between py-3">
          <Link to="/" className="font-bold text-lg tracking-tight">
            ♠ GTO Trainer
          </Link>
          <Link to="/settings" className="text-sm text-slate-300">
            Settings
          </Link>
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
    </BrowserRouter>
  )
}

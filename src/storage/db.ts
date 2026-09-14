import Dexie, { type EntityTable } from 'dexie'
import type { Drill, Hand, RangeOverride, Session, Settings } from '../domain/types'
import { DEFAULT_SETTINGS } from '../domain/types'

export const db = new Dexie('gto-trainer') as Dexie & {
  sessions: EntityTable<Session, 'id'>
  hands: EntityTable<Hand, 'id'>
  overrides: EntityTable<RangeOverride, 'id'>
  settings: EntityTable<Settings, 'id'>
  drills: EntityTable<Drill, 'id'>
}

db.version(1).stores({
  sessions: 'id, createdAt',
  hands: 'id, sessionId, createdAt, [sessionId+handNo]',
  overrides: 'id, updatedAt',
  settings: 'id',
})
db.version(2).stores({
  sessions: 'id, createdAt',
  hands: 'id, sessionId, createdAt, [sessionId+handNo]',
  overrides: 'id, updatedAt',
  settings: 'id',
  drills: 'id, createdAt, scenario',
})

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export async function loadSettings(): Promise<Settings> {
  const s = await db.settings.get('settings')
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) }
}

export async function saveSettings(s: Settings): Promise<void> {
  await db.settings.put(s)
}

export async function exportAll(): Promise<string> {
  const [sessions, hands, overrides, settings, drills] = await Promise.all([
    db.sessions.toArray(),
    db.hands.toArray(),
    db.overrides.toArray(),
    db.settings.toArray(),
    db.drills.toArray(),
  ])
  return JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), sessions, hands, overrides, settings, drills }, null, 2)
}

export async function importAll(json: string): Promise<{ sessions: number; hands: number }> {
  const data = JSON.parse(json) as { sessions?: Session[]; hands?: Hand[]; overrides?: RangeOverride[]; settings?: Settings[]; drills?: Drill[] }
  await db.transaction('rw', db.sessions, db.hands, db.overrides, db.settings, db.drills, async () => {
    if (data.sessions) await db.sessions.bulkPut(data.sessions)
    if (data.hands) await db.hands.bulkPut(data.hands)
    if (data.overrides) await db.overrides.bulkPut(data.overrides)
    if (data.settings) await db.settings.bulkPut(data.settings)
    if (data.drills) await db.drills.bulkPut(data.drills)
  })
  return { sessions: data.sessions?.length ?? 0, hands: data.hands?.length ?? 0 }
}

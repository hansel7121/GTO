import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { CHART_INDEX, type Chart } from '../preflop/charts'
import type { ChartResolver } from '../preflop/lookup'
import { db } from '../storage/db'

/** Chart resolver that applies the user's imported ranges on top of the bundled charts. */
export function useChartResolver(): ChartResolver {
  const overrides = useLiveQuery(() => db.overrides.toArray(), [], [])
  return useMemo(() => {
    const map = new Map(overrides.map((o) => [o.id, o]))
    return (key: string): Chart | undefined => {
      const base = CHART_INDEX.get(key)
      const o = map.get(key)
      if (!o) return base
      const [format, scenario, hero, villain] = key.split(':')
      return {
        key,
        format: (base?.format ?? format) as Chart['format'],
        scenario: (base?.scenario ?? scenario) as Chart['scenario'],
        hero: (base?.hero ?? hero) as Chart['hero'],
        villain: (base?.villain ?? villain) as Chart['villain'],
        actions: o.actions,
        source: 'user import',
        sourceLabel: 'Imported range (your solver export)',
        fidelity: 'published',
      }
    }
  }, [overrides])
}

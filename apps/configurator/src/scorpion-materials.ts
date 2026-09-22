import type { ScorpionMaterialDefinition } from '@sls/material-library'

const registryModules = import.meta.glob(
  './material-registry/*.json',
  {
    eager: true,
    import: 'default',
  },
) as Record<string, ScorpionMaterialDefinition>

const registryEntries = Object.entries(registryModules)
  .map(([source, material]) => ({ source, material }))
  .sort((a, b) => a.material.id.localeCompare(b.material.id))

export const scorpionMaterialDefinitions: readonly ScorpionMaterialDefinition[] = Object.freeze(
  registryEntries.map(({ material }) => Object.freeze(material)),
)

export const scorpionMaterialById = new Map(
  scorpionMaterialDefinitions.map((material) => [material.id, material] as const),
)

export const scorpionMaterialSourceById = new Map(
  registryEntries.map(({ source, material }) => [material.id, source] as const),
)

export function preferredMaterialTextureEdge(): 1024 | 2048 {
  if (typeof window === 'undefined') return 1024

  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number }
  const lowMemory = (navigatorWithMemory.deviceMemory ?? 8) <= 4
  const narrowViewport = window.matchMedia('(max-width: 900px)').matches
  const highPixelDensity = window.devicePixelRatio > 1.75

  return lowMemory || narrowViewport || highPixelDensity ? 1024 : 2048
}

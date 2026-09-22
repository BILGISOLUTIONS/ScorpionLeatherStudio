import type { ScorpionMaterialDefinition } from '@sls/material-library'

export const scorpionMaterialDefinitions: readonly ScorpionMaterialDefinition[] = [
  {
    schemaVersion: 1,
    id: 'SCL-DTY',
    label: 'Dark Textured Reference',
    kind: 'leather',
    lifecycle: 'reference-only',
    availability: 'quote',
    previewColor: '#24211d',
    physical: {
      materialType: 'Leather',
      grain: 'Textured',
      finish: 'Dark textured reference',
    },
    provenance: {
      source: 'photographed-product-reference',
      notes: 'Approximation derived from the current Scorpion catalog photo. Replace with calibrated field capture before production color approval.',
    },
    renderer: {
      roughness: 0.86,
      metalness: 0,
      sheen: 0.1,
      sheenRoughness: 0.84,
    },
  },
  {
    schemaVersion: 1,
    id: 'SCL-COGNAC',
    label: 'Cognac Textured Reference',
    kind: 'leather',
    lifecycle: 'reference-only',
    availability: 'quote',
    previewColor: '#8a4e2b',
    physical: {
      materialType: 'Leather',
      grain: 'Textured',
      finish: 'Cognac textured reference',
    },
    provenance: {
      source: 'photographed-product-reference',
      notes: 'Approximation derived from the current Scorpion catalog photo. Replace with calibrated field capture before production color approval.',
    },
    renderer: {
      roughness: 0.8,
      metalness: 0,
      sheen: 0.14,
      sheenRoughness: 0.77,
    },
  },
  {
    schemaVersion: 1,
    id: 'SCL-TAN-SMOOTH',
    label: 'Tan Smooth Reference',
    kind: 'leather',
    lifecycle: 'reference-only',
    availability: 'quote',
    previewColor: '#b5824f',
    physical: {
      materialType: 'Leather',
      grain: 'Smooth',
      finish: 'Tan smooth reference',
    },
    provenance: {
      source: 'photographed-product-reference',
      notes: 'Approximation derived from the current Scorpion catalog photo. Replace with calibrated field capture before production color approval.',
    },
    renderer: {
      roughness: 0.68,
      metalness: 0,
      sheen: 0.18,
      sheenRoughness: 0.67,
    },
  },
  {
    schemaVersion: 1,
    id: 'SCL-TAN-TEXTURED',
    label: 'Tan Textured Reference',
    kind: 'leather',
    lifecycle: 'reference-only',
    availability: 'quote',
    previewColor: '#a87545',
    physical: {
      materialType: 'Leather',
      grain: 'Nap / textured',
      finish: 'Tan textured reference',
    },
    provenance: {
      source: 'photographed-product-reference',
      notes: 'Approximation derived from the current Scorpion catalog photo. Replace with calibrated field capture before production color approval.',
    },
    renderer: {
      roughness: 0.84,
      metalness: 0,
      sheen: 0.1,
      sheenRoughness: 0.82,
    },
  },
  {
    schemaVersion: 1,
    id: 'SCH-001',
    label: 'Nickel Renderer Reference',
    kind: 'metal',
    lifecycle: 'reference-only',
    availability: 'unverified',
    previewColor: '#b7bab8',
    provenance: {
      source: 'synthetic-placeholder',
      notes: 'Renderer reference only. Independent hardware availability has not been confirmed by Scorpion.',
    },
    renderer: {
      roughness: 0.26,
      metalness: 0.92,
      clearcoat: 0.2,
      clearcoatRoughness: 0.2,
    },
  },
  {
    schemaVersion: 1,
    id: 'SCH-002',
    label: 'Brass-tone Renderer Reference',
    kind: 'metal',
    lifecycle: 'reference-only',
    availability: 'unverified',
    previewColor: '#8b6a2f',
    provenance: {
      source: 'synthetic-placeholder',
      notes: 'Renderer reference only. Independent hardware availability has not been confirmed by Scorpion.',
    },
    renderer: {
      roughness: 0.34,
      metalness: 0.86,
      clearcoat: 0.08,
      clearcoatRoughness: 0.35,
    },
  },
  {
    schemaVersion: 1,
    id: 'SGL-001',
    label: 'Welding Lens Placeholder',
    kind: 'glass',
    lifecycle: 'reference-only',
    availability: 'unverified',
    previewColor: '#111b16',
    provenance: {
      source: 'synthetic-placeholder',
      notes: 'Development-only lens material; final optical appearance must be matched to the real visor assembly.',
    },
    renderer: {
      roughness: 0.12,
      metalness: 0,
      opacity: 0.5,
      transmission: 0.32,
    },
  },
]

export const scorpionMaterialById = new Map(
  scorpionMaterialDefinitions.map((material) => [material.id, material] as const),
)

export function preferredMaterialTextureEdge(): 1024 | 2048 {
  if (typeof window === 'undefined') return 1024

  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number }
  const lowMemory = (navigatorWithMemory.deviceMemory ?? 8) <= 4
  const narrowViewport = window.matchMedia('(max-width: 900px)').matches
  const highPixelDensity = window.devicePixelRatio > 1.75

  return lowMemory || narrowViewport || highPixelDensity ? 1024 : 2048
}

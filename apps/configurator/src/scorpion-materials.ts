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
    id: 'SCL-FINE-GRAIN-DEV',
    label: 'Fine Grain Development Leather',
    kind: 'leather',
    lifecycle: 'reference-only',
    availability: 'unverified',
    previewColor: '#d8d0c4',
    physical: { materialType: 'Leather', grain: 'Fine grain procedural study', finish: 'Development-only tint base' },
    provenance: {
      source: 'synthetic-placeholder',
      notes: 'Deterministic procedural PBR grain for G1 visual-reference twins. Development-only; replace or calibrate against approved Scorpion leather before any production material claim.',
    },
    renderer: {
      roughness: 0.74, metalness: 0, sheen: 0.15, sheenRoughness: 0.72, normalScale: 0.88,
      textureRepeat: [5.5, 5.5],
      proceduralSurface: {
        kind: 'leather-grain', pattern: 'fine', seed: 3641, resolution: 256,
        grainScale: 28, amplitude: 0.82, roughnessVariation: 0.16,
      },
    },
  },
  {
    schemaVersion: 1,
    id: 'SCL-PEBBLED-GRAIN-DEV',
    label: 'Pebbled Grain Development Leather',
    kind: 'leather',
    lifecycle: 'reference-only',
    availability: 'unverified',
    previewColor: '#d2c7b8',
    physical: { materialType: 'Leather', grain: 'Pebbled grain procedural study', finish: 'Development-only tint base' },
    provenance: {
      source: 'synthetic-placeholder',
      notes: 'Deterministic procedural PBR pebble structure for G1 visual-reference twins. Development-only; replace or calibrate against approved Scorpion leather before production use.',
    },
    renderer: {
      roughness: 0.78, metalness: 0, sheen: 0.13, sheenRoughness: 0.76, normalScale: 1.08,
      textureRepeat: [4.2, 4.2],
      proceduralSurface: {
        kind: 'leather-grain', pattern: 'pebbled', seed: 7717, resolution: 256,
        grainScale: 14, amplitude: 1.22, roughnessVariation: 0.2,
      },
    },
  },
  {
    schemaVersion: 1,
    id: 'SCL-NEUTRAL-DEV',
    label: 'Neutral Leather Development Base',
    kind: 'leather',
    lifecycle: 'reference-only',
    availability: 'unverified',
    previewColor: '#d7cec1',
    physical: {
      materialType: 'Leather',
      grain: 'Neutral authoring study',
      finish: 'Development-only tint base',
    },
    provenance: {
      source: 'synthetic-placeholder',
      notes: 'Development-only neutral surface used to exercise Structure × Dye × Finish composition. Replace with a calibrated neutral leather capture before any production color claim.',
    },
    renderer: {
      roughness: 0.74,
      metalness: 0,
      sheen: 0.14,
      sheenRoughness: 0.72,
      normalScale: 0.9,
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

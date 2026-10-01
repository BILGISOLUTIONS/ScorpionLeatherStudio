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
    id: 'SCL-FINE-DEV',
    label: 'Fine Grain Development Leather',
    kind: 'leather',
    lifecycle: 'reference-only',
    availability: 'unverified',
    previewColor: '#d4cec3',
    physical: {
      materialType: 'Leather',
      grain: 'Fine grain development surface',
      finish: 'Neutral tintable development base',
    },
    provenance: {
      source: 'synthetic-placeholder',
      notes: 'Deterministic local PBR development surface. Replace with a vetted CC0 or calibrated Scorpion material before production color/material approval.',
    },
    renderer: {
      roughness: 0.72,
      metalness: 0,
      sheen: 0.16,
      sheenRoughness: 0.7,
      normalScale: 0.9,
      textureRepeat: [7, 7],
    },
    textureTiers: [{
      maxEdge: 1024,
      textures: {
        baseColor: 'sls-procedural://fine/baseColor',
        normal: 'sls-procedural://fine/normal',
        roughness: 'sls-procedural://fine/roughness',
      },
    }],
  },
  {
    schemaVersion: 1,
    id: 'SCL-WORN-DEV',
    label: 'Worn Grain Development Leather',
    kind: 'leather',
    lifecycle: 'reference-only',
    availability: 'unverified',
    previewColor: '#c8beb0',
    physical: {
      materialType: 'Leather',
      grain: 'Wrinkled / worn development surface',
      finish: 'Neutral tintable development base',
    },
    provenance: {
      source: 'synthetic-placeholder',
      notes: 'Deterministic local PBR development surface for larger creases and wear response. Replace with vetted CC0 or calibrated Scorpion material before production approval.',
    },
    renderer: {
      roughness: 0.79,
      metalness: 0,
      sheen: 0.13,
      sheenRoughness: 0.78,
      normalScale: 1.05,
      textureRepeat: [4, 4],
    },
    textureTiers: [{
      maxEdge: 1024,
      textures: {
        baseColor: 'sls-procedural://worn/baseColor',
        normal: 'sls-procedural://worn/normal',
        roughness: 'sls-procedural://worn/roughness',
      },
    }],
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

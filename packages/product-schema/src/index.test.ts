import { describe, expect, it } from 'vitest'
import { validateAssetManifest, validateMaterialSlotAssignments, type AssetManifest } from './index'

const manifest: AssetManifest = {
  schemaVersion: 1,
  assetId: 'asset',
  model: '/model.gltf',
  units: 'meters',
  upAxis: 'Y',
  frontAxis: '-Z',
  rootNode: 'Root',
  materialSlots: { Leather: ['Shell'] },
  materialSlotProfiles: {
    Leather: {
      kind: 'leather',
      mapping: 'uv0',
      requiresUv0: true,
      requiresNormals: true,
      tangents: 'recommended',
      metersPerUvUnit: 1,
      uvScaleToleranceRatio: 0.2,
    },
  },
  defaultMaterialVariants: { Leather: 'LEATHER-1' },
  customizationZones: {
    front: {
      label: 'Front panel',
      node: 'Shell',
      purposes: ['tooling', 'text'],
      origin: [0, 0, 0.01],
      normal: [0, 0, 1],
      up: [0, 1, 0],
      sizeMeters: [0.2, 0.16],
      safeInsetMeters: 0.01,
    },
  },
  components: { 'guard.standard': ['Guard'] },
  animations: {
    'visor.open': {
      target: 'Pivot',
      property: 'rotation.x',
      from: 0,
      to: 1,
      durationMs: 300,
      easing: 'easeInOutCubic',
    },
  },
  cameraPresets: {
    hero: { target: [0, 0, 0], position: [0, 0, 1], fov: 35 },
  },
}

describe('asset manifest validation', () => {
  it('accepts a complete manifest against loaded node names', () => {
    expect(validateAssetManifest(manifest, ['LEATHER-1'], ['Root', 'Shell', 'Guard', 'Pivot'])).toEqual([])
  })

  it('reports missing nodes and material variants', () => {
    const issues = validateAssetManifest(manifest, ['OTHER'], ['Root'])
    expect(issues.some((issue) => issue.message.includes('LEATHER-1'))).toBe(true)
    expect(issues.some((issue) => issue.message.includes('Shell'))).toBe(true)
    expect(issues.some((issue) => issue.message.includes('Pivot'))).toBe(true)
  })

  it('rejects invalid physical UV scale and customization-zone geometry', () => {
    const invalid: AssetManifest = {
      ...manifest,
      materialSlotProfiles: {
        Leather: {
          kind: 'leather',
          mapping: 'uv0',
          requiresUv0: true,
          requiresNormals: true,
          tangents: 'recommended',
          metersPerUvUnit: 0,
          uvScaleToleranceRatio: 2,
        },
      },
      customizationZones: {
        bad: {
          label: 'Bad zone',
          node: 'Missing',
          purposes: [],
          origin: [0, 0, 0],
          normal: [0, 1, 0],
          up: [0, 2, 0],
          sizeMeters: [0.2, -0.1],
          safeInsetMeters: 0.2,
        },
      },
    }

    const issues = validateAssetManifest(invalid, ['LEATHER-1'], ['Root', 'Shell', 'Guard', 'Pivot'])
    expect(issues.some((entry) => entry.path.endsWith('metersPerUvUnit'))).toBe(true)
    expect(issues.some((entry) => entry.path.endsWith('uvScaleToleranceRatio'))).toBe(true)
    expect(issues.some((entry) => entry.path.endsWith('customizationZones.bad.node'))).toBe(true)
    expect(issues.some((entry) => entry.message.includes('must not be parallel'))).toBe(true)
    expect(issues.some((entry) => entry.path.endsWith('sizeMeters'))).toBe(true)
  })

  it('rejects ambiguous material ownership and material-kind mismatches', () => {
    const ambiguous: AssetManifest = {
      ...manifest,
      materialSlots: { Leather: ['Shell'], Hardware: ['Shell'] },
      materialSlotProfiles: {
        Leather: { kind: 'leather', mapping: 'uv0', requiresUv0: true, requiresNormals: true, tangents: 'recommended' },
        Hardware: { kind: 'metal', mapping: 'uv0', requiresUv0: true, requiresNormals: true, tangents: 'optional', metersPerUvUnit: 1 },
      },
    }
    expect(validateAssetManifest(ambiguous, [], ['Root', 'Shell', 'Guard', 'Pivot'])
      .some((entry) => entry.message.includes('Material ownership must be unambiguous'))).toBe(true)

    expect(validateMaterialSlotAssignments(
      manifest,
      { Leather: 'METAL-1' },
      {
        'METAL-1': {
          id: 'METAL-1',
          label: 'Metal',
          kind: 'metal',
          color: '#999999',
          roughness: 0.4,
          metalness: 1,
        },
      },
    ).some((entry) => entry.message.includes('requires "leather"'))).toBe(true)
  })
})

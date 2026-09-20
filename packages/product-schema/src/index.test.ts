import { describe, expect, it } from 'vitest'
import { validateAssetManifest, type AssetManifest } from './index'

const manifest: AssetManifest = {
  schemaVersion: 1,
  assetId: 'asset',
  model: '/model.gltf',
  units: 'meters',
  upAxis: 'Y',
  frontAxis: '-Z',
  rootNode: 'Root',
  materialSlots: { Leather: ['Shell'] },
  defaultMaterialVariants: { Leather: 'LEATHER-1' },
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
})

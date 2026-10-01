import { describe, expect, it } from 'vitest'
import type { StudioFamilyKind } from './studio-catalog'
import { family3DAssets } from './family-3d-assets'

const g2Families: Exclude<StudioFamilyKind, 'welding-hood'>[] = [
  'tool-belt',
  'tool-pouch-set',
  'work-harness',
  'radio-harness',
  'carpenter-pouch',
  'thigh-protector',
  'cooler-strap',
]

describe('V0.37 family 3D assets', () => {
  it('keeps the welding hood on its existing G1 asset in this bounded release', () => {
    expect(family3DAssets['welding-hood'].authority).toBe('G1-development-twin')
    expect(family3DAssets['welding-hood'].manifest.model).toBe('/models/placeholder-welding-hood.gltf')
  })

  it.each(g2Families)('binds %s to an isolated G2 model contract', (familyId) => {
    const asset = family3DAssets[familyId]

    expect(asset.authority).toBe('G2-development-twin')
    expect(asset.manifest.model).toBe(`/models/development-g2-${familyId}.gltf`)
    expect(asset.manifest.model).not.toContain('development-product-families.gltf')
    expect(asset.manifest.components).toEqual({
      [`family.${familyId}`]: [expect.stringMatching(/^Family_/u)],
    })
  })

  it.each(g2Families)('keeps %s customization authority bounded to one mapped development zone', (familyId) => {
    const zones = Object.values(family3DAssets[familyId].manifest.customizationZones ?? {})

    expect(zones).toHaveLength(1)
    expect(zones[0]?.placementLabels).toHaveLength(1)
    expect(zones[0]?.sizeMeters.every((value) => value > 0)).toBe(true)
  })
})

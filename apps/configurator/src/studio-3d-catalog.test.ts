import { describe, expect, it } from 'vitest'
import { validateAssetManifest, validateProductDefinition } from '@sls/product-schema'
import { scorpionMaterialDefinitions } from './scorpion-materials'
import { studio3dDefinitions } from './studio-3d-catalog'
describe('V0.36 product-family G1 3D contracts',()=>{
  it('covers every non-hood Studio family',()=>expect([...studio3dDefinitions.keys()].sort()).toEqual(['carpenter-pouch','cooler-strap','radio-harness','thigh-protector','tool-belt','tool-pouch-set','work-harness']))
  it('keeps generated family twins schema-valid and material-slot-safe',()=>{
    const materialIds=scorpionMaterialDefinitions.map(material=>material.id)
    for(const definition of studio3dDefinitions.values()){
      expect(validateProductDefinition(definition.product)).toEqual([])
      expect(validateAssetManifest(definition.manifest,materialIds)).toEqual([])
      expect(definition.authority).toBe('G1-visual-reference')
      expect(definition.manifest.materialSlots.LeatherPrimary?.length).toBeGreaterThan(0)
    }
  })
})

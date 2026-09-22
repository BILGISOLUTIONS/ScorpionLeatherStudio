import { describe, expect, it } from 'vitest'
import { createRendererMaterialMap, validateMaterialDefinition } from '@sls/material-library'
import { preferredMaterialTextureEdge, scorpionMaterialDefinitions } from './scorpion-materials'

describe('Scorpion material registry', () => {
  it('has unique stable material ids', () => {
    const ids = scorpionMaterialDefinitions.map((material) => material.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('passes material lifecycle validation', () => {
    const issues = scorpionMaterialDefinitions.flatMap(validateMaterialDefinition)
    expect(issues).toEqual([])
  })

  it('resolves every registry material into a renderer variant', () => {
    const map = createRendererMaterialMap(scorpionMaterialDefinitions, 1024)
    expect(Object.keys(map)).toHaveLength(scorpionMaterialDefinitions.length)
    for (const material of scorpionMaterialDefinitions) {
      expect(map[material.id]?.id).toBe(material.id)
    }
  })

  it('defaults to the conservative 1K tier outside the browser', () => {
    expect(preferredMaterialTextureEdge()).toBe(1024)
  })
})

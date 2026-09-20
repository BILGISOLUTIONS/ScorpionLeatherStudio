import { describe, expect, it } from 'vitest'
import {
  createConfigurationId,
  createInitialConfiguration,
  createShareToken,
  isSelectionAllowed,
  restoreShareToken,
  setMeasurement,
  setSelection,
} from './index'
import type { ProductDefinition } from '@sls/product-schema'

const product: ProductDefinition = {
  schemaVersion: 1,
  id: 'p1',
  handle: 'p1',
  name: 'P1',
  category: 'test',
  currency: 'USD',
  basePrice: 10000,
  commerce: { defaultMerchandiseId: 'variant', variantStrategy: 'inventory-only' },
  asset: { manifestUrl: '/m.json', defaultCameraPreset: 'hero' },
  optionGroups: [
    { id: 'leather', label: 'Leather', type: 'choice', required: true, defaultValue: 'brown', values: [
      { id: 'brown', label: 'Brown', priceModifier: 0, commerce: { merchandiseId: 'variant-brown', sku: 'BROWN' } },
      { id: 'tan', label: 'Tan', priceModifier: 100, commerce: { merchandiseId: 'variant-tan', sku: 'TAN' } },
    ] },
    { id: 'guard', label: 'Guard', type: 'choice', required: true, defaultValue: 'standard', values: [
      { id: 'standard', label: 'Standard', priceModifier: 0 },
      { id: 'extended', label: 'Extended', priceModifier: 500 },
    ] },
  ],
  compatibilityRules: [{ id: 'r1', when: [{ groupId: 'leather', equals: 'tan' }], disallow: { groupId: 'guard', valueId: 'extended' }, reason: 'No.' }],
  measurements: [{ id: 'head', label: 'Head', unit: 'in', min: 20, max: 27, required: true, instructions: 'Measure.' }],
  sizeRecommendations: [],
}

describe('configurator core', () => {
  it('creates deterministic configuration IDs', () => {
    const config = createInitialConfiguration(product)
    expect(createConfigurationId(config)).toBe(createConfigurationId(config))
  })

  it('resolves selected Shopify merchandise identity', () => {
    let config = createInitialConfiguration(product)
    expect(config.merchandiseId).toBe('variant-brown')
    config = setSelection(product, config, 'leather', 'tan')
    expect(config.merchandiseId).toBe('variant-tan')
  })

  it('rejects incompatible values in either selection order', () => {
    let config = createInitialConfiguration(product)
    config = setSelection(product, config, 'leather', 'tan')
    expect(isSelectionAllowed(product, config, 'guard', 'extended')).toEqual({ allowed: false, reason: 'No.' })
    expect(() => setSelection(product, config, 'guard', 'extended')).toThrow('No.')

    config = createInitialConfiguration(product)
    config = setSelection(product, config, 'guard', 'extended')
    expect(isSelectionAllowed(product, config, 'leather', 'tan')).toEqual({ allowed: false, reason: 'No.' })
    expect(() => setSelection(product, config, 'leather', 'tan')).toThrow('No.')
  })

  it('round-trips a share token without changing the build identity', () => {
    let config = createInitialConfiguration(product)
    config = setSelection(product, config, 'leather', 'tan')
    config = setMeasurement(product, config, 'head', 23.5)

    const restored = restoreShareToken(product, createShareToken(config))
    expect(restored).toEqual(config)
    expect(createConfigurationId(restored)).toBe(createConfigurationId(config))
  })

  it('rejects malformed share tokens', () => {
    expect(() => restoreShareToken(product, 'not-a-valid-build')).toThrow('shared build link')
  })
})

import { describe, expect, it } from 'vitest'
import type { ProductDefinition } from '@sls/product-schema'
import { createInitialConfiguration, setSelection } from '@sls/configurator-core'
import { calculatePrice } from './index'

const product: ProductDefinition = {
  schemaVersion: 1,
  id: 'p1', handle: 'p1', name: 'P1', category: 'test', currency: 'USD', basePrice: 10000,
  commerce: { defaultMerchandiseId: 'variant', variantStrategy: 'inventory-only' },
  asset: { manifestUrl: '/m.json', defaultCameraPreset: 'hero' },
  optionGroups: [{ id: 'finish', label: 'Finish', type: 'choice', required: true, defaultValue: 'base', values: [
    { id: 'base', label: 'Base', priceModifier: 0 },
    { id: 'premium', label: 'Premium', priceModifier: 2500 },
  ] }],
  compatibilityRules: [], measurements: [], sizeRecommendations: [],
}

describe('pricing engine', () => {
  it('adds selected modifiers in minor units', () => {
    let config = createInitialConfiguration(product)
    config = setSelection(product, config, 'finish', 'premium')
    expect(calculatePrice(product, config).total).toBe(12500)
  })
})

import { describe, expect, it } from 'vitest'
import type { ProductDefinition } from '@sls/product-schema'
import { createInitialConfiguration } from '@sls/configurator-core'
import { buildMockCartLine } from './index'

const product: ProductDefinition = {
  schemaVersion: 1,
  id: 'p1', handle: 'p1', name: 'P1', category: 'test', currency: 'USD', basePrice: 10000,
  commerce: { defaultMerchandiseId: 'gid://shopify/ProductVariant/1', variantStrategy: 'inventory-only' },
  asset: { manifestUrl: '/m.json', defaultCameraPreset: 'hero' },
  optionGroups: [{ id: 'leather', label: 'Leather', type: 'choice', required: true, defaultValue: 'brown', values: [{ id: 'brown', label: 'Brown', priceModifier: 0 }] }],
  compatibilityRules: [], measurements: [], sizeRecommendations: [],
}

describe('shopify adapter', () => {
  it('includes a reconstruction payload and configuration id', () => {
    const payload = buildMockCartLine(product, createInitialConfiguration(product))
    expect(payload.merchandiseId).toContain('ProductVariant')
    expect(payload.attributes.some((attribute) => attribute.key === '_sls_configuration')).toBe(true)
    expect(payload.attributes.some((attribute) => attribute.key === '_sls_configuration_id')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  createDefaultPersonalization,
  createOrderRequest,
  createStudioBuildId,
  createStudioShareToken,
  formatOrderSummary,
  restoreStudioShareToken,
  validateOrderDraft,
  type CustomerDraft,
  type StudioBuildDraft,
} from './index'

const build: StudioBuildDraft = {
  schemaVersion: 1,
  familyId: 'radio-harness',
  referenceId: 'radio-black',
  variantId: 'variant-xl',
  quantity: 2,
  personalization: {
    ...createDefaultPersonalization('Front chest panel'),
    textEnabled: true,
    text: 'ZAN',
  },
}

const customer: CustomerDraft = {
  name: 'Test Customer',
  email: 'test@example.com',
  phone: '',
  company: '',
  preferredContact: 'email',
  neededBy: '',
}

describe('order engine', () => {
  it('creates deterministic build IDs and share-token round trips', () => {
    expect(createStudioBuildId(build)).toBe(createStudioBuildId(build))
    expect(restoreStudioShareToken(createStudioShareToken(build))).toEqual(build)
  })

  it('requires customer contact information', () => {
    expect(validateOrderDraft(build, { ...customer, email: '' })[0]?.path).toBe('customer.contact')
  })

  it('validates and preserves construction preferences', () => {
    const customized: StudioBuildDraft = {
      ...build,
      personalization: {
        ...build.personalization,
        construction: {
          ...build.personalization.construction,
          leatherFinish: 'textured',
          leatherColor: 'Dark brown',
          stitching: 'contrast',
          hardware: 'antique-brass',
          edgeTreatment: 'dark',
          notes: 'Reinforce the strap junctions.',
        },
      },
    }

    expect(validateOrderDraft(customized, customer)).toEqual([])
    expect(restoreStudioShareToken(createStudioShareToken(customized))).toEqual(customized)
  })

  it('requires notes for custom construction requests', () => {
    const customized: StudioBuildDraft = {
      ...build,
      personalization: {
        ...build.personalization,
        construction: {
          ...build.personalization.construction,
          hardware: 'custom-request',
          notes: '',
        },
      },
    }

    expect(validateOrderDraft(customized, customer)).toContainEqual({
      path: 'build.personalization.construction.notes',
      message: 'Describe the custom construction request.',
    })
  })

  it('creates a structured request using resolved commerce identity', () => {
    const request = createOrderRequest({
      build,
      customer,
      sourceUrl: 'https://example.com/studio',
      now: new Date('2026-09-20T13:00:00Z'),
      commerce: {
        productTitle: 'Leather Radio Harness',
        referenceTitle: 'Cowhide Radio Harness - Black',
        shopifyProductId: 'gid://shopify/Product/1',
        merchandiseId: 'gid://shopify/ProductVariant/2',
        sku: 'SC-LRH-BLK-XL-002',
        variantTitle: 'X-Large',
        basePriceMinor: 35000,
        listedInventoryQuantity: 4,
        priceStatus: 'catalog',
        priceSource: 'shopify-storefront',
        availabilityStatus: 'available',
        commerceRefreshedAt: '2026-09-22T03:30:00.000Z',
      },
    })

    expect(request.buildId).toBe(createStudioBuildId(build))
    expect(request.commerce.sku).toBe('SC-LRH-BLK-XL-002')
    expect(request.pricing.personalizationRequiresQuote).toBe(true)
    expect(request.pricing.baseSubtotalMinor).toBe(70000)
    expect(request.commerce.listedInventoryQuantity).toBe(4)
    expect(request.commerce.priceSource).toBe('shopify-storefront')
    expect(request.requestId).toMatch(/^SC-REQ-/u)
    const summary = formatOrderSummary(request)
    expect(summary).toContain('Commerce source: shopify-storefront')
    expect(summary).toContain('Availability: available')
    expect(summary).toContain('Leather finish preference: As Photographed')
  })
})

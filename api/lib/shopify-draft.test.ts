import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StudioOrderRequest } from '@sls/order-engine'
import { createShopifyDraftOrder, getShopifyDraftOrderState, isShopifyDraftOrderConfigured, sendShopifyDraftInvoice } from './shopify-draft'

const request: StudioOrderRequest = {
  schemaVersion: 1,
  requestId: 'SC-REQ-20260922040000-ABC123',
  buildId: 'SLS-ABCDEF12',
  createdAt: '2026-09-22T04:00:00.000Z',
  sourceUrl: 'https://studio.example.com/?studio=compact',
  customer: {
    name: 'Test Customer',
    email: 'test@example.com',
    phone: '7135551212',
    company: '',
    preferredContact: 'email',
    neededBy: '',
  },
  build: {
    schemaVersion: 1,
    familyId: 'radio-harness',
    referenceId: 'radio-black',
    variantId: 'gid://shopify/ProductVariant/2',
    quantity: 2,
    personalization: {
      construction: {
        leatherFinish: 'textured',
        leatherColor: 'Dark brown',
        stitching: 'contrast',
        hardware: 'antique-brass',
        edgeTreatment: 'dark',
        notes: 'Reinforce strap junctions.',
      },
      toolingStyle: 'western-floral',
      toolingNotes: 'Floral border',
      textEnabled: true,
      text: 'ZAN CREW',
      textStyle: 'western',
      placement: 'Front chest panel',
      artworkNotes: 'Use attached crew mark.',
      additionalNotes: 'Jobsite use.',
    },
  },
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
  },
  pricing: {
    currency: 'USD',
    basePriceMinor: 35000,
    baseSubtotalMinor: 70000,
    basePriceStatus: 'catalog',
    personalizationRequiresQuote: true,
  },
}

afterEach(() => {
  delete process.env.SHOPIFY_STORE_DOMAIN
  delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
  delete process.env.SHOPIFY_ADMIN_API_VERSION
  vi.unstubAllGlobals()
})

describe('Shopify draft-order adapter', () => {
  it('is optional when server credentials are absent', async () => {
    expect(isShopifyDraftOrderConfigured()).toBe(false)
    await expect(createShopifyDraftOrder(request, 97500)).rejects.toThrow('SHOPIFY_DRAFT_ORDER_NOT_CONFIGURED')
  })

  it('creates one custom quoted line item using the approved total', async () => {
    process.env.SHOPIFY_STORE_DOMAIN = 'scorpion-test.myshopify.com'
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = 'test-token'
    process.env.SHOPIFY_ADMIN_API_VERSION = '2026-07'

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        draftOrderCreate: {
          draftOrder: {
            id: 'gid://shopify/DraftOrder/123',
            name: '#D123',
            invoiceUrl: 'https://example.myshopify.com/checkouts/test',
            status: 'OPEN',
          },
          userErrors: [],
        },
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createShopifyDraftOrder(request, 97500, 'Approved custom quote.')
    expect(result.name).toBe('#D123')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://scorpion-test.myshopify.com/admin/api/2026-07/graphql.json')
    expect((init.headers as Record<string, string>)['X-Shopify-Access-Token']).toBe('test-token')

    const payload = JSON.parse(String(init.body))
    expect(payload.query).toContain('draftOrderCreate')
    expect(payload.variables.input.lineItems[0].originalUnitPriceWithCurrency).toEqual({
      amount: '975.00',
      currencyCode: 'USD',
    })
    expect(payload.variables.input.lineItems[0].customAttributes).toContainEqual({
      key: 'Requested Quantity',
      value: '2',
    })
    expect(payload.variables.input.customAttributes).toContainEqual({
      key: 'Scorpion Request ID',
      value: request.requestId,
    })
  })

  it('sends a reviewed draft invoice through the same GraphQL client', async () => {
    process.env.SHOPIFY_STORE_DOMAIN = 'scorpion-test.myshopify.com'
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = 'test-token'

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        draftOrderInvoiceSend: {
          draftOrder: {
            id: 'gid://shopify/DraftOrder/123',
            name: '#D123',
            invoiceUrl: 'https://example.myshopify.com/checkouts/test',
            status: 'INVOICE_SENT',
          },
          userErrors: [],
        },
      },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendShopifyDraftInvoice('gid://shopify/DraftOrder/123')
    expect(result.status).toBe('INVOICE_SENT')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(String(init.body))
    expect(payload.query).toContain('draftOrderInvoiceSend')
    expect(payload.variables).toEqual({ id: 'gid://shopify/DraftOrder/123' })
  })

  it('rejects malformed draft ids before making a network call', async () => {
    process.env.SHOPIFY_STORE_DOMAIN = 'scorpion-test.myshopify.com'
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = 'test-token'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(sendShopifyDraftInvoice('123')).rejects.toThrow('INVALID_SHOPIFY_DRAFT_ORDER_ID')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reconciles a completed draft to the converted paid order', async () => {
    process.env.SHOPIFY_STORE_DOMAIN = 'scorpion-test.myshopify.com'
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = 'test-token'

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        draftOrder: {
          id: 'gid://shopify/DraftOrder/123',
          name: '#D123',
          invoiceUrl: 'https://example.myshopify.com/checkouts/test',
          invoiceSentAt: '2026-09-22T04:30:00Z',
          completedAt: '2026-09-22T05:00:00Z',
          status: 'COMPLETED',
          order: {
            id: 'gid://shopify/Order/987',
            name: '#1098',
            displayFinancialStatus: 'PAID',
            displayFulfillmentStatus: 'UNFULFILLED',
          },
        },
      },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const state = await getShopifyDraftOrderState('gid://shopify/DraftOrder/123')
    expect(state.status).toBe('COMPLETED')
    expect(state.order?.displayFinancialStatus).toBe('PAID')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(String(init.body))
    expect(payload.query).toContain('query ScorpionDraftOrderState')
    expect(payload.variables).toEqual({ id: 'gid://shopify/DraftOrder/123' })
  })

  it('surfaces Shopify user errors instead of returning false success', async () => {
    process.env.SHOPIFY_STORE_DOMAIN = 'scorpion-test.myshopify.com'
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = 'test-token'

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        draftOrderCreate: {
          draftOrder: null,
          userErrors: [{ field: ['input', 'lineItems'], message: 'Add at least 1 product' }],
        },
      },
    }), { status: 200 })))

    await expect(createShopifyDraftOrder(request, 97500)).rejects.toThrow('SHOPIFY_USER_ERROR')
  })
})

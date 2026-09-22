import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StudioOrderRequest } from '@sls/order-engine'
import { markOrderDelivery, persistOrderRequest } from './order-store'

const request: StudioOrderRequest = {
  schemaVersion: 1,
  requestId: 'SC-REQ-20260922030000-ABC123',
  buildId: 'SLS-ABCDEF12',
  createdAt: '2026-09-22T03:00:00.000Z',
  sourceUrl: 'https://studio.example.com/?studio=compact',
  customer: {
    name: 'Test Customer',
    email: 'test@example.com',
    phone: '',
    company: 'Example Co',
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
        leatherFinish: 'as-photographed',
        leatherColor: '',
        stitching: 'as-photographed',
        hardware: 'as-photographed',
        edgeTreatment: 'as-photographed',
        notes: '',
      },
      toolingStyle: 'western-floral',
      toolingNotes: '',
      textEnabled: true,
      text: 'ZAN',
      textStyle: 'western',
      placement: 'Front chest panel',
      artworkNotes: '',
      additionalNotes: '',
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
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  vi.unstubAllGlobals()
})

describe('order persistence adapter', () => {
  it('is optional and performs no network work when not configured', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(persistOrderRequest(request)).resolves.toEqual({
      configured: false,
      persisted: false,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('upserts validated requests by request_id', async () => {
    process.env.SUPABASE_URL = 'https://project.supabase.co/'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(persistOrderRequest(request, {
      name: 'logo.png',
      type: 'image/png',
      size: 1200,
    })).resolves.toEqual({
      configured: true,
      persisted: true,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/rest/v1/scorpion_custom_order_requests?on_conflict=request_id')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Prefer).toContain('resolution=merge-duplicates')

    const body = JSON.parse(String(init.body))
    expect(body.request_id).toBe(request.requestId)
    expect(body.build_id).toBe(request.buildId)
    expect(body.sku).toBe('SC-LRH-BLK-XL-002')
    expect(body.request_payload).toEqual(request)
    expect(body.artwork_name).toBe('logo.png')
  })

  it('records email delivery state without mutating the request payload', async () => {
    process.env.SUPABASE_URL = 'https://project.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await markOrderDelivery(request.requestId, 'emailed')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`request_id=eq.${request.requestId}`)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body)).delivery_status).toBe('emailed')
  })
})

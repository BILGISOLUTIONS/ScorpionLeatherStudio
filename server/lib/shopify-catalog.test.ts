import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchLiveShopifyVariant } from './shopify-catalog'

afterEach(() => {
  delete process.env.SHOPIFY_STORE_DOMAIN
  delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
  delete process.env.SHOPIFY_ADMIN_API_VERSION
  vi.unstubAllGlobals()
})

describe('live Shopify catalog adapter', () => {
  it('requires a valid Shopify variant id', async () => {
    await expect(fetchLiveShopifyVariant('not-a-gid')).rejects.toThrow('INVALID_SHOPIFY_VARIANT_ID')
  })

  it('returns current public variant facts from Shopify', async () => {
    process.env.SHOPIFY_STORE_DOMAIN = 'scorpion-test.myshopify.com'
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = 'test-token'
    process.env.SHOPIFY_ADMIN_API_VERSION = '2026-07'

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        productVariant: {
          id: 'gid://shopify/ProductVariant/52616019837208',
          title: 'X-Large',
          sku: 'SC-LRH-BLK-XL-002',
          price: '350.00',
          inventoryQuantity: 4,
          product: {
            id: 'gid://shopify/Product/10403653812504',
            title: 'Cowhide Radio Harness - Black',
            status: 'ACTIVE',
          },
        },
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchLiveShopifyVariant(
      'gid://shopify/ProductVariant/52616019837208',
      'gid://shopify/Product/10403653812504',
    )

    expect(result).toMatchObject({
      productId: 'gid://shopify/Product/10403653812504',
      productStatus: 'ACTIVE',
      variantId: 'gid://shopify/ProductVariant/52616019837208',
      variantTitle: 'X-Large',
      sku: 'SC-LRH-BLK-XL-002',
      priceMinor: 35000,
      inventoryQuantity: 4,
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://scorpion-test.myshopify.com/admin/api/2026-07/graphql.json')
    expect((init.headers as Record<string, string>)['X-Shopify-Access-Token']).toBe('test-token')
    expect(JSON.parse(String(init.body)).variables).toEqual({
      id: 'gid://shopify/ProductVariant/52616019837208',
    })
  })

  it('rejects a variant returned for the wrong product', async () => {
    process.env.SHOPIFY_STORE_DOMAIN = 'scorpion-test.myshopify.com'
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = 'test-token'

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        productVariant: {
          id: 'gid://shopify/ProductVariant/2',
          title: 'Large',
          sku: 'OTHER',
          price: '10.00',
          inventoryQuantity: 1,
          product: {
            id: 'gid://shopify/Product/999',
            title: 'Other product',
            status: 'ACTIVE',
          },
        },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    await expect(fetchLiveShopifyVariant(
      'gid://shopify/ProductVariant/2',
      'gid://shopify/Product/1',
    )).rejects.toThrow('SHOPIFY_VARIANT_PRODUCT_MISMATCH')
  })
})

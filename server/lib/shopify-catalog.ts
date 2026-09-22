import { shopifyGraphQl } from './shopify-client'

export interface LiveShopifyVariant {
  productId: string
  productTitle: string
  productStatus: string
  variantId: string
  variantTitle: string
  sku: string
  priceMinor: number
  inventoryQuantity: number | null
  fetchedAt: string
}

function moneyToMinor(value: string): number {
  if (!/^-?\d+(?:\.\d{1,2})?$/u.test(value)) {
    throw new Error('SHOPIFY_INVALID_PRICE')
  }

  const [whole, fraction = ''] = value.split('.')
  const sign = whole.startsWith('-') ? -1 : 1
  const absoluteWhole = whole.replace('-', '')
  const minor = (Number(absoluteWhole) * 100) + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(minor)) throw new Error('SHOPIFY_INVALID_PRICE')
  return sign * minor
}

export async function fetchLiveShopifyVariant(
  variantId: string,
  expectedProductId?: string,
): Promise<LiveShopifyVariant> {
  if (!/^gid:\/\/shopify\/ProductVariant\/\d+$/u.test(variantId)) {
    throw new Error('INVALID_SHOPIFY_VARIANT_ID')
  }
  if (expectedProductId && !/^gid:\/\/shopify\/Product\/\d+$/u.test(expectedProductId)) {
    throw new Error('INVALID_SHOPIFY_PRODUCT_ID')
  }

  const query = `
    query ScorpionLiveCatalogVariant($id: ID!) {
      productVariant(id: $id) {
        id
        title
        sku
        price
        inventoryQuantity
        product {
          id
          title
          status
        }
      }
    }
  `

  const data = await shopifyGraphQl<{
    productVariant?: {
      id: string
      title: string
      sku: string | null
      price: string
      inventoryQuantity: number | null
      product: {
        id: string
        title: string
        status: string
      }
    } | null
  }>(query, { id: variantId })

  const variant = data.productVariant
  if (!variant?.id || !variant.product?.id) {
    throw new Error('SHOPIFY_VARIANT_NOT_FOUND')
  }
  if (expectedProductId && variant.product.id !== expectedProductId) {
    throw new Error('SHOPIFY_VARIANT_PRODUCT_MISMATCH')
  }

  return {
    productId: variant.product.id,
    productTitle: variant.product.title,
    productStatus: variant.product.status,
    variantId: variant.id,
    variantTitle: variant.title,
    sku: variant.sku ?? '',
    priceMinor: moneyToMinor(variant.price),
    inventoryQuantity: variant.inventoryQuantity,
    fetchedAt: new Date().toISOString(),
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node'

interface ShopifyAjaxVariant {
  id?: string | number
  title?: string
  sku?: string | null
  price?: string | number
  available?: boolean
}

interface ShopifyAjaxProduct {
  handle?: string
  title?: string
  variants?: ShopifyAjaxVariant[]
}

function singleQuery(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function normalizePriceMinor(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value))
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d+$/u.test(trimmed)) return Math.max(0, Number(trimmed))

  const decimal = Number(trimmed)
  return Number.isFinite(decimal) ? Math.max(0, Math.round(decimal * 100)) : null
}

function storefrontOrigin(): URL {
  const configured = process.env.SHOPIFY_PUBLIC_ORIGIN?.trim() || 'https://scorpionwesternwear.com'
  const url = new URL(configured)
  return new URL(url.origin)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.setHeader('Cache-Control', 'no-store')
    res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED' })
    return
  }

  const handle = singleQuery(req.query.handle).trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{0,160}$/u.test(handle)) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(400).json({ ok: false, code: 'INVALID_HANDLE' })
    return
  }

  let productUrl: URL
  try {
    productUrl = new URL(`/products/${encodeURIComponent(handle)}.js`, storefrontOrigin())
  } catch {
    res.setHeader('Cache-Control', 'no-store')
    res.status(503).json({ ok: false, code: 'STOREFRONT_ORIGIN_INVALID' })
    return
  }

  try {
    const response = await fetch(productUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ScorpionLeatherStudio/1.0',
      },
      signal: AbortSignal.timeout(3500),
    })

    if (!response.ok) {
      res.setHeader('Cache-Control', 'no-store')
      res.status(502).json({ ok: false, code: 'STOREFRONT_UNAVAILABLE' })
      return
    }

    const product = await response.json() as ShopifyAjaxProduct
    const variants = Array.isArray(product.variants)
      ? product.variants.flatMap((variant) => {
          const priceMinor = normalizePriceMinor(variant.price)
          const id = variant.id === undefined || variant.id === null ? '' : String(variant.id)
          if (!id || priceMinor === null) return []

          return [{
            id,
            title: typeof variant.title === 'string' ? variant.title : '',
            sku: typeof variant.sku === 'string' ? variant.sku : '',
            priceMinor,
            available: Boolean(variant.available),
          }]
        })
      : []

    if (!variants.length) {
      res.setHeader('Cache-Control', 'no-store')
      res.status(502).json({ ok: false, code: 'INVALID_STOREFRONT_PRODUCT' })
      return
    }

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
    res.status(200).json({
      ok: true,
      source: 'shopify-storefront',
      handle,
      title: typeof product.title === 'string' ? product.title : '',
      fetchedAt: new Date().toISOString(),
      variants,
    })
  } catch (error) {
    console.warn('Scorpion live catalog refresh failed', {
      handle,
      error: error instanceof Error ? error.message : String(error),
    })
    res.setHeader('Cache-Control', 'no-store')
    res.status(503).json({ ok: false, code: 'STOREFRONT_REFRESH_FAILED' })
  }
}

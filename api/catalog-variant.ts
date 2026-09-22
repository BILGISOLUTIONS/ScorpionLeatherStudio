import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchLiveShopifyVariant } from '../server/lib/shopify-catalog'

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED' })
    return
  }

  const variantId = single(req.query.variantId).trim()
  const productId = single(req.query.productId).trim()

  if (!variantId) {
    res.status(400).json({ ok: false, code: 'VARIANT_REQUIRED' })
    return
  }

  try {
    const variant = await fetchLiveShopifyVariant(variantId, productId || undefined)

    // Public catalog facts can be cached briefly at the edge while remaining
    // fresh enough for a quote-oriented custom-order workflow.
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
    res.status(200).json({ ok: true, variant })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SHOPIFY_CATALOG_ERROR'
    const clientError = code.startsWith('INVALID_') || code === 'SHOPIFY_VARIANT_PRODUCT_MISMATCH'

    res.setHeader('Cache-Control', 'no-store')
    res.status(clientError ? 400 : code === 'SHOPIFY_VARIANT_NOT_FOUND' ? 404 : 503).json({
      ok: false,
      code,
    })
  }
}

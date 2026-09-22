import { useEffect, useState } from 'react'
import type { StudioReference, StudioVariant } from './studio-catalog'

interface LiveVariantPayload {
  id: string
  title: string
  sku: string
  priceMinor: number
  available: boolean
}

interface LiveProductPayload {
  ok: true
  source: 'shopify-storefront'
  handle: string
  fetchedAt: string
  variants: LiveVariantPayload[]
}

export interface LiveVariantCommerce {
  status: 'snapshot' | 'loading' | 'live'
  priceMinor: number
  available: boolean | null
  fetchedAt?: string
}

const productRequestCache = new Map<string, Promise<LiveProductPayload | null>>()

async function fetchLiveProduct(handle: string): Promise<LiveProductPayload | null> {
  const cached = productRequestCache.get(handle)
  if (cached) return cached

  const request = fetch(`/api/catalog-product?handle=${encodeURIComponent(handle)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) return null
      const payload = await response.json() as Partial<LiveProductPayload>
      if (payload.ok !== true || payload.source !== 'shopify-storefront' || !Array.isArray(payload.variants)) return null
      return payload as LiveProductPayload
    })
    .catch(() => {
      productRequestCache.delete(handle)
      return null
    })

  productRequestCache.set(handle, request)
  return request
}

function variantNumericId(variantId: string): string {
  return variantId.split('/').at(-1) ?? variantId
}

export function useLiveVariantCommerce(
  reference: StudioReference,
  variant: StudioVariant,
): LiveVariantCommerce {
  const enabled = reference.priceStatus === 'catalog'
  const [state, setState] = useState<LiveVariantCommerce>(() => ({
    status: enabled ? 'loading' : 'snapshot',
    priceMinor: variant.priceMinor,
    available: null,
  }))

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'snapshot', priceMinor: variant.priceMinor, available: null })
      return
    }

    let active = true
    setState({ status: 'loading', priceMinor: variant.priceMinor, available: null })

    void fetchLiveProduct(reference.handle).then((product) => {
      if (!active) return

      const targetId = variantNumericId(variant.id)
      const liveVariant = product?.variants.find((candidate) =>
        candidate.id === targetId ||
        candidate.sku === variant.sku ||
        candidate.title.toLowerCase() === variant.title.toLowerCase(),
      )

      if (!product || !liveVariant) {
        setState({ status: 'snapshot', priceMinor: variant.priceMinor, available: null })
        return
      }

      setState({
        status: 'live',
        priceMinor: liveVariant.priceMinor,
        available: liveVariant.available,
        fetchedAt: product.fetchedAt,
      })
    })

    return () => {
      active = false
    }
  }, [enabled, reference.handle, variant.id, variant.priceMinor, variant.sku, variant.title])

  return state
}

export function clearLiveCommerceCache() {
  productRequestCache.clear()
}

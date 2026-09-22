import { useEffect, useState } from 'react'

export interface LiveCatalogVariant {
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

export type LiveCatalogStatus = 'idle' | 'loading' | 'live' | 'fallback'

interface CacheEntry {
  variant: LiveCatalogVariant
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60_000

function cacheKey(productId: string, variantId: string) {
  return `${productId}:${variantId}`
}

export function useLiveCatalogVariant(
  enabled: boolean,
  productId: string,
  variantId: string,
): { variant: LiveCatalogVariant | null; status: LiveCatalogStatus } {
  const key = cacheKey(productId, variantId)
  const cached = enabled ? cache.get(key) : undefined
  const freshCached = cached && cached.expiresAt > Date.now() ? cached.variant : null

  const [variant, setVariant] = useState<LiveCatalogVariant | null>(freshCached)
  const [status, setStatus] = useState<LiveCatalogStatus>(
    !enabled ? 'idle' : freshCached ? 'live' : 'loading',
  )

  useEffect(() => {
    if (!enabled) {
      setVariant(null)
      setStatus('idle')
      return
    }

    const existing = cache.get(key)
    if (existing && existing.expiresAt > Date.now()) {
      setVariant(existing.variant)
      setStatus('live')
      return
    }

    const controller = new AbortController()
    let disposed = false
    setStatus('loading')

    const params = new URLSearchParams({ productId, variantId })

    fetch(`/api/catalog-variant?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`CATALOG_HTTP_${response.status}`)
        return response.json() as Promise<{ ok?: boolean; variant?: LiveCatalogVariant }>
      })
      .then((payload) => {
        if (disposed || !payload.ok || !payload.variant) return
        cache.set(key, {
          variant: payload.variant,
          expiresAt: Date.now() + CACHE_TTL_MS,
        })
        setVariant(payload.variant)
        setStatus('live')
      })
      .catch((error) => {
        if (disposed || controller.signal.aborted) return
        console.warn('Live catalog refresh unavailable; using verified snapshot.', error)
        setVariant(null)
        setStatus('fallback')
      })

    return () => {
      disposed = true
      controller.abort()
    }
  }, [enabled, key, productId, variantId])

  return { variant, status }
}

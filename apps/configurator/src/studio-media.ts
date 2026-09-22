const storefrontImageCache = new Map<string, string>()

export function storefrontImage(url: string, width: number): string {
  const cacheKey = `${width}:${url}`
  const cached = storefrontImageCache.get(cacheKey)
  if (cached) return cached

  let resolved = url
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'cdn.shopify.com') parsed.searchParams.set('width', String(width))
    resolved = parsed.toString()
  } catch {
    // Keep the original URL if it cannot be parsed.
  }

  storefrontImageCache.set(cacheKey, resolved)
  return resolved
}

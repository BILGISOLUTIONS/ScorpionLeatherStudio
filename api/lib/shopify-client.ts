export interface ShopifyConfiguration {
  storeDomain: string
  accessToken: string
  apiVersion: string
}

interface GraphQlEnvelope<T> {
  data?: T
  errors?: Array<{ message: string }>
}

export function getShopifyConfiguration(): ShopifyConfiguration | null {
  const rawDomain = process.env.SHOPIFY_STORE_DOMAIN?.trim()
  const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim()
  if (!rawDomain || !accessToken) return null

  let storeDomain = rawDomain
    .replace(/^https?:\/\//iu, '')
    .replace(/\/$/u, '')
  if (!storeDomain.includes('.')) storeDomain = `${storeDomain}.myshopify.com`

  return {
    storeDomain,
    accessToken,
    apiVersion: process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || '2026-07',
  }
}

export function isShopifyConfigured(): boolean {
  return Boolean(getShopifyConfiguration())
}

export async function shopifyGraphQl<T>(
  query: string,
  variables: Record<string, unknown>,
  init?: { cache?: RequestCache; signal?: AbortSignal },
): Promise<T> {
  const config = getShopifyConfiguration()
  if (!config) throw new Error('SHOPIFY_ADMIN_NOT_CONFIGURED')

  const response = await fetch(
    `https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': config.accessToken,
      },
      body: JSON.stringify({ query, variables }),
      cache: init?.cache,
      signal: init?.signal,
    },
  )

  const payload = await response.json() as GraphQlEnvelope<T>
  if (!response.ok) throw new Error(`SHOPIFY_HTTP_${response.status}`)
  if (payload.errors?.length) {
    throw new Error(`SHOPIFY_GRAPHQL_ERROR: ${payload.errors.map((error) => error.message).join('; ')}`)
  }
  if (!payload.data) throw new Error('SHOPIFY_EMPTY_RESPONSE')
  return payload.data
}

import { createHash } from 'node:crypto'
import type { StudioOrderRequest } from '@sls/order-engine'
import { getSupabaseConfiguration, supabaseHeaders, type SupabaseServerConfiguration } from './supabase'

const ARTWORK_BUCKET = 'scorpion-order-artwork'

export interface ArtworkMetadata {
  name: string
  type: string
  size: number
}

export interface ArtworkPersistenceInput extends ArtworkMetadata {
  buffer?: Buffer
}

export interface PersistenceResult {
  configured: boolean
  persisted: boolean
  artworkStored?: boolean
  artworkStoragePath?: string
  artworkSha256?: string
  artworkError?: string
  error?: string
}

function safeStorageName(name: string): string {
  const safe = name
    .replace(/[^a-zA-Z0-9._-]/gu, '_')
    .replace(/_+/gu, '_')
    .replace(/^\.+/u, '')
    .slice(0, 120)
  return safe || 'artwork'
}

function encodeStoragePath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/')
}

async function persistArtwork(
  config: SupabaseServerConfiguration,
  requestId: string,
  artwork: ArtworkPersistenceInput,
): Promise<{ stored: boolean; path?: string; sha256?: string; error?: string }> {
  if (!artwork.buffer?.length) return { stored: false }

  const sha256 = createHash('sha256').update(artwork.buffer).digest('hex')
  const path = `${requestId}/${sha256.slice(0, 16)}-${safeStorageName(artwork.name)}`

  try {
    const response = await fetch(
      `${config.url}/storage/v1/object/${ARTWORK_BUCKET}/${encodeStoragePath(path)}`,
      {
        method: 'POST',
        headers: {
          ...supabaseHeaders(config.serviceKey),
          'Content-Type': artwork.type,
          'x-upsert': 'true',
        },
        body: artwork.buffer,
      },
    )

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500)
      return {
        stored: false,
        sha256,
        error: `Supabase artwork storage failed (${response.status}): ${detail}`,
      }
    }

    return { stored: true, path, sha256 }
  } catch (error) {
    return {
      stored: false,
      sha256,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function createArtworkSignedUrl(
  storagePath: string | null | undefined,
  expiresIn = 900,
): Promise<string | null> {
  const path = storagePath?.trim()
  if (!path) return null
  const config = getSupabaseConfiguration()
  if (!config) return null

  try {
    const response = await fetch(
      `${config.url}/storage/v1/object/sign/${ARTWORK_BUCKET}/${encodeStoragePath(path)}`,
      {
        method: 'POST',
        headers: supabaseHeaders(config.serviceKey),
        body: JSON.stringify({ expiresIn: Math.max(60, Math.min(3600, Math.floor(expiresIn))) }),
      },
    )
    if (!response.ok) return null

    const payload = await response.json() as { signedURL?: string; signedUrl?: string }
    const signed = payload.signedURL ?? payload.signedUrl
    if (!signed) return null
    if (/^https?:\/\//iu.test(signed)) return signed
    return `${config.url}/storage/v1${signed.startsWith('/') ? signed : '/' + signed}`
  } catch {
    return null
  }
}

export async function persistOrderRequest(
  request: StudioOrderRequest,
  artwork?: ArtworkPersistenceInput | null,
): Promise<PersistenceResult> {
  const config = getSupabaseConfiguration()
  if (!config) return { configured: false, persisted: false }

  const artworkResult = artwork
    ? await persistArtwork(config, request.requestId, artwork)
    : { stored: false as const }

  try {
    const response = await fetch(
      `${config.url}/rest/v1/scorpion_custom_order_requests?on_conflict=request_id`,
      {
        method: 'POST',
        headers: supabaseHeaders(config.serviceKey, 'resolution=merge-duplicates,return=minimal'),
        body: JSON.stringify({
          request_id: request.requestId,
          build_id: request.buildId,
          status: 'received',
          created_at: request.createdAt,
          updated_at: new Date().toISOString(),
          customer_name: request.customer.name,
          customer_email: request.customer.email || null,
          customer_phone: request.customer.phone || null,
          customer_company: request.customer.company || null,
          product_title: request.commerce.productTitle,
          reference_title: request.commerce.referenceTitle,
          sku: request.commerce.sku,
          variant_title: request.commerce.variantTitle,
          quantity: request.build.quantity,
          base_subtotal_minor: request.pricing.baseSubtotalMinor,
          base_price_status: request.pricing.basePriceStatus,
          request_payload: request,
          artwork_name: artwork?.name ?? null,
          artwork_type: artwork?.type ?? null,
          artwork_size: artwork?.size ?? null,
          artwork_storage_path: artworkResult.stored ? artworkResult.path : null,
          artwork_sha256: artworkResult.sha256 ?? null,
        }),
      },
    )

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500)
      return {
        configured: true,
        persisted: false,
        artworkStored: artworkResult.stored,
        artworkStoragePath: artworkResult.path,
        artworkSha256: artworkResult.sha256,
        artworkError: artworkResult.error,
        error: `Supabase persistence failed (${response.status}): ${detail}`,
      }
    }

    return {
      configured: true,
      persisted: true,
      artworkStored: artworkResult.stored,
      artworkStoragePath: artworkResult.path,
      artworkSha256: artworkResult.sha256,
      artworkError: artworkResult.error,
    }
  } catch (error) {
    return {
      configured: true,
      persisted: false,
      artworkStored: artworkResult.stored,
      artworkStoragePath: artworkResult.path,
      artworkSha256: artworkResult.sha256,
      artworkError: artworkResult.error,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function markOrderDelivery(
  requestId: string,
  deliveryStatus: 'emailed' | 'email_failed' | 'stored',
): Promise<void> {
  const config = getSupabaseConfiguration()
  if (!config) return

  try {
    await fetch(
      `${config.url}/rest/v1/scorpion_custom_order_requests?request_id=eq.${encodeURIComponent(requestId)}`,
      {
        method: 'PATCH',
        headers: supabaseHeaders(config.serviceKey, 'return=minimal'),
        body: JSON.stringify({
          delivery_status: deliveryStatus,
          updated_at: new Date().toISOString(),
        }),
      },
    )
  } catch {
    // Delivery status is diagnostic only; never turn a successful order capture
    // into a customer-facing failure because a status annotation failed.
  }
}

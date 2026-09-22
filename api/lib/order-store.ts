import type { StudioOrderRequest } from '@sls/order-engine'

export interface ArtworkMetadata {
  name: string
  type: string
  size: number
}

export interface PersistenceResult {
  configured: boolean
  persisted: boolean
  error?: string
}

function configuration(): { url: string; serviceKey: string } | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/u, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && serviceKey ? { url, serviceKey } : null
}

function headers(serviceKey: string, prefer?: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  }
}

export async function persistOrderRequest(
  request: StudioOrderRequest,
  artwork?: ArtworkMetadata | null,
): Promise<PersistenceResult> {
  const config = configuration()
  if (!config) return { configured: false, persisted: false }

  try {
    const response = await fetch(
      `${config.url}/rest/v1/scorpion_custom_order_requests?on_conflict=request_id`,
      {
        method: 'POST',
        headers: headers(config.serviceKey, 'resolution=merge-duplicates,return=minimal'),
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
        }),
      },
    )

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500)
      return {
        configured: true,
        persisted: false,
        error: `Supabase persistence failed (${response.status}): ${detail}`,
      }
    }

    return { configured: true, persisted: true }
  } catch (error) {
    return {
      configured: true,
      persisted: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function markOrderDelivery(
  requestId: string,
  deliveryStatus: 'emailed' | 'email_failed' | 'stored',
): Promise<void> {
  const config = configuration()
  if (!config) return

  try {
    await fetch(
      `${config.url}/rest/v1/scorpion_custom_order_requests?request_id=eq.${encodeURIComponent(requestId)}`,
      {
        method: 'PATCH',
        headers: headers(config.serviceKey, 'return=minimal'),
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

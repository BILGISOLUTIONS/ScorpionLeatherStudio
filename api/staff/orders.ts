import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { StudioOrderRequest } from '@sls/order-engine'
import {
  buildWorkshopSpecification,
  validateWorkshopResolutions,
  type WorkshopResolutions,
} from '@sls/workshop-spec'
import { createArtworkSignedUrl } from '../../server/lib/order-store'
import { authorizeStaff, isStaffAccessConfigured } from '../../server/lib/staff-auth'
import { getSupabaseConfiguration, supabaseHeaders } from '../../server/lib/supabase'

const STAFF_STATUSES = new Set([
  'received',
  'reviewing',
  'quoted',
  'approved',
  'paid',
  'in_production',
  'completed',
  'cancelled',
])

interface StoredOrder {
  request_id: string
  build_id: string
  status: string
  delivery_status: string
  created_at: string
  updated_at: string
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  customer_company: string | null
  product_title: string
  reference_title: string
  sku: string
  variant_title: string
  quantity: number
  base_subtotal_minor: number
  base_price_status: 'catalog' | 'quote'
  request_payload: StudioOrderRequest
  artwork_name: string | null
  artwork_type: string | null
  artwork_size: number | null
  artwork_storage_path: string | null
  artwork_sha256: string | null
  staff_notes: string | null
  quote_total_minor: number | null
  shopify_financial_status: string | null
  workshop_resolutions: WorkshopResolutions | null
  workshop_release_packet: unknown | null
  workshop_revision_id: string | null
  workshop_released_at: string | null
  workshop_released_by: string | null
  [key: string]: unknown
}

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function unauthorized(res: VercelResponse) {
  res.setHeader('WWW-Authenticate', 'Bearer realm="Scorpion Staff"')
  res.status(401).json({ ok: false, code: 'UNAUTHORIZED' })
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  return typeof req.body === 'string'
    ? JSON.parse(req.body) as Record<string, unknown>
    : (req.body ?? {}) as Record<string, unknown>
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function workshopArtwork(order: StoredOrder) {
  if (!order.artwork_name) return null
  return {
    name: order.artwork_name,
    type: order.artwork_type ?? 'application/octet-stream',
    size: order.artwork_size ?? 0,
    storagePath: order.artwork_storage_path,
    sha256: order.artwork_sha256,
  }
}

function paymentConfirmed(order: StoredOrder): boolean {
  return order.shopify_financial_status === 'PAID' ||
    ['paid', 'in_production', 'completed'].includes(order.status)
}

function workshopPreview(
  order: StoredOrder,
  overrides: {
    quoteTotalMinor?: number | null
    staffNotes?: string | null
    resolutions?: WorkshopResolutions | null
  } = {},
) {
  return buildWorkshopSpecification(order.request_payload, {
    orderStatus: order.status,
    quoteTotalMinor: overrides.quoteTotalMinor === undefined ? order.quote_total_minor : overrides.quoteTotalMinor,
    paymentConfirmed: paymentConfirmed(order),
    staffNotes: overrides.staffNotes === undefined ? order.staff_notes : overrides.staffNotes,
    artwork: workshopArtwork(order),
    resolutions: overrides.resolutions === undefined ? order.workshop_resolutions : overrides.resolutions,
  })
}

async function readOrder(
  config: { url: string; serviceKey: string },
  requestId: string,
): Promise<StoredOrder | null> {
  const params = new URLSearchParams({
    select: '*',
    request_id: `eq.${requestId}`,
    limit: '1',
  })
  const response = await fetch(
    `${config.url}/rest/v1/scorpion_custom_order_requests?${params.toString()}`,
    { headers: supabaseHeaders(config.serviceKey) },
  )
  if (!response.ok) throw new Error(`ORDER_STORE_READ_FAILED_${response.status}`)
  const rows = await response.json() as StoredOrder[]
  return rows[0] ?? null
}

async function enrichDetail(order: StoredOrder) {
  const artworkSignedUrl = await createArtworkSignedUrl(order.artwork_storage_path, 900)
  return {
    ...order,
    artwork_signed_url: artworkSignedUrl,
    workshop_preview: workshopPreview(order),
  }
}

async function listOrders(req: VercelRequest, res: VercelResponse) {
  const config = getSupabaseConfiguration()
  if (!config) {
    res.status(503).json({ ok: false, code: 'ORDER_STORE_NOT_CONFIGURED' })
    return
  }

  const requestId = queryValue(req.query.request_id).trim()
  if (requestId && !/^SC-REQ-/u.test(requestId)) {
    res.status(422).json({ ok: false, code: 'INVALID_REQUEST_ID' })
    return
  }

  const rawLimit = Number(queryValue(req.query.limit) || '100')
  const limit = Math.max(1, Math.min(100, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 100))

  const params = new URLSearchParams()
  params.set(
    'select',
    requestId
      ? '*'
      : [
          'request_id',
          'build_id',
          'status',
          'delivery_status',
          'created_at',
          'updated_at',
          'customer_name',
          'customer_email',
          'customer_phone',
          'customer_company',
          'product_title',
          'reference_title',
          'sku',
          'variant_title',
          'quantity',
          'base_subtotal_minor',
          'base_price_status',
          'artwork_name',
          'artwork_type',
          'artwork_size',
          'artwork_storage_path',
          'staff_notes',
          'quote_total_minor',
          'shopify_draft_order_id',
          'shopify_draft_order_name',
          'shopify_draft_order_invoice_url',
          'shopify_draft_order_state',
          'shopify_invoice_state',
          'shopify_invoice_sent_at',
          'shopify_reconciled_at',
          'shopify_order_id',
          'shopify_order_name',
          'shopify_financial_status',
          'shopify_fulfillment_status',
          'workshop_revision_id',
          'workshop_released_at',
          'workshop_released_by',
        ].join(','),
  )
  params.set('order', 'created_at.desc')
  params.set('limit', requestId ? '1' : String(limit))
  if (requestId) params.set('request_id', `eq.${requestId}`)

  const response = await fetch(
    `${config.url}/rest/v1/scorpion_custom_order_requests?${params.toString()}`,
    { headers: supabaseHeaders(config.serviceKey) },
  )

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500)
    res.status(502).json({ ok: false, code: 'ORDER_STORE_READ_FAILED', detail })
    return
  }

  const rows = await response.json() as StoredOrder[]
  if (requestId && rows[0]) {
    res.status(200).json({ ok: true, orders: [await enrichDetail(rows[0])] })
    return
  }

  res.status(200).json({ ok: true, orders: rows })
}

async function updateOrder(req: VercelRequest, res: VercelResponse) {
  const config = getSupabaseConfiguration()
  if (!config) {
    res.status(503).json({ ok: false, code: 'ORDER_STORE_NOT_CONFIGURED' })
    return
  }

  const body = parseBody(req)
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : ''
  const status = typeof body.status === 'string' ? body.status.trim() : ''
  const notes = typeof body.staffNotes === 'string' ? body.staffNotes.trim() : ''
  const quoteTotalMinor = body.quoteTotalMinor === null || body.quoteTotalMinor === undefined
    ? null
    : Number(body.quoteTotalMinor)
  const releaseToProduction = body.releaseToProduction === true
  const releasedBy = typeof body.releasedBy === 'string' ? body.releasedBy.trim() : ''
  const resolutionObject = body.workshopResolutions === undefined
    ? undefined
    : objectValue(body.workshopResolutions) as WorkshopResolutions | null

  if (!/^SC-REQ-/u.test(requestId)) {
    res.status(422).json({ ok: false, code: 'INVALID_REQUEST_ID' })
    return
  }
  if (!STAFF_STATUSES.has(status)) {
    res.status(422).json({ ok: false, code: 'INVALID_STATUS' })
    return
  }
  if (notes.length > 4000) {
    res.status(422).json({ ok: false, code: 'STAFF_NOTES_TOO_LONG' })
    return
  }
  if (quoteTotalMinor !== null && (!Number.isInteger(quoteTotalMinor) || quoteTotalMinor < 0 || quoteTotalMinor > 100_000_000)) {
    res.status(422).json({ ok: false, code: 'INVALID_QUOTE_TOTAL' })
    return
  }
  if (body.workshopResolutions !== undefined && !resolutionObject) {
    res.status(422).json({ ok: false, code: 'INVALID_WORKSHOP_RESOLUTIONS' })
    return
  }

  const resolutionIssues = validateWorkshopResolutions(resolutionObject)
  if (resolutionIssues.length) {
    res.status(422).json({ ok: false, code: 'INVALID_WORKSHOP_RESOLUTIONS', issues: resolutionIssues })
    return
  }

  let stored: StoredOrder
  try {
    const found = await readOrder(config, requestId)
    if (!found) {
      res.status(404).json({ ok: false, code: 'ORDER_NOT_FOUND' })
      return
    }
    stored = found
  } catch (error) {
    res.status(502).json({
      ok: false,
      code: 'ORDER_STORE_READ_FAILED',
      detail: error instanceof Error ? error.message : String(error),
    })
    return
  }

  if (stored.workshop_released_at && body.workshopResolutions !== undefined) {
    res.status(409).json({
      ok: false,
      code: 'WORKSHOP_PACKET_LOCKED',
      message: 'This build was already released. Create a controlled revision workflow before changing manufacturing resolutions.',
    })
    return
  }

  if (status === 'in_production' && !releaseToProduction) {
    res.status(422).json({
      ok: false,
      code: 'WORKSHOP_RELEASE_REQUIRED',
      message: 'Use Release to Workshop so manufacturing gates are checked before entering production.',
    })
    return
  }

  if (status === 'completed' && !stored.workshop_released_at) {
    res.status(422).json({
      ok: false,
      code: 'WORKSHOP_RELEASE_REQUIRED',
      message: 'An order cannot be completed without a released workshop packet.',
    })
    return
  }

  const resolutions = resolutionObject === undefined
    ? (stored.workshop_resolutions ?? {})
    : resolutionObject
  const nextQuote = body.quoteTotalMinor === undefined ? stored.quote_total_minor : quoteTotalMinor
  const nextNotes = body.staffNotes === undefined ? stored.staff_notes : notes

  const patch: Record<string, unknown> = {
    status,
    staff_notes: nextNotes || null,
    quote_total_minor: nextQuote,
    workshop_resolutions: resolutions,
    updated_at: new Date().toISOString(),
  }

  let releasedPacket: ReturnType<typeof buildWorkshopSpecification> | null = null

  if (releaseToProduction) {
    if (!releasedBy || releasedBy.length > 120) {
      res.status(422).json({ ok: false, code: 'WORKSHOP_RELEASED_BY_REQUIRED' })
      return
    }

    const releasedAt = new Date().toISOString()
    releasedPacket = buildWorkshopSpecification(stored.request_payload, {
      orderStatus: stored.status,
      quoteTotalMinor: nextQuote,
      paymentConfirmed: paymentConfirmed(stored),
      staffNotes: nextNotes,
      artwork: workshopArtwork(stored),
      resolutions,
      releaseRequested: true,
      releasedBy,
      releasedAt,
    }, new Date(releasedAt))

    if (releasedPacket.release.state !== 'released-for-production') {
      res.status(422).json({
        ok: false,
        code: 'WORKSHOP_RELEASE_BLOCKED',
        blockers: releasedPacket.release.blockers,
        warnings: releasedPacket.release.warnings,
        workshopPreview: releasedPacket,
      })
      return
    }

    patch.status = 'in_production'
    patch.workshop_release_packet = releasedPacket
    patch.workshop_revision_id = releasedPacket.revisionId
    patch.workshop_released_at = releasedPacket.release.releasedAt
    patch.workshop_released_by = releasedPacket.release.releasedBy
  }

  const response = await fetch(
    `${config.url}/rest/v1/scorpion_custom_order_requests?request_id=eq.${encodeURIComponent(requestId)}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(config.serviceKey, 'return=representation'),
      body: JSON.stringify(patch),
    },
  )

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500)
    res.status(502).json({ ok: false, code: 'ORDER_STORE_UPDATE_FAILED', detail })
    return
  }

  const rows = await response.json() as StoredOrder[]
  if (!rows.length) {
    res.status(404).json({ ok: false, code: 'ORDER_NOT_FOUND' })
    return
  }

  res.status(200).json({
    ok: true,
    order: await enrichDetail(rows[0]),
    ...(releasedPacket ? { workshopPacket: releasedPacket } : {}),
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (!isStaffAccessConfigured()) {
    res.status(503).json({ ok: false, code: 'STAFF_ACCESS_NOT_CONFIGURED' })
    return
  }

  if (!authorizeStaff(req.headers as Record<string, string | string[] | undefined>)) {
    unauthorized(res)
    return
  }

  try {
    if (req.method === 'GET') {
      await listOrders(req, res)
      return
    }
    if (req.method === 'PATCH') {
      await updateOrder(req, res)
      return
    }

    res.setHeader('Allow', 'GET, PATCH')
    res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED' })
  } catch (error) {
    console.error('Scorpion staff order API failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ ok: false, code: 'STAFF_API_FAILED' })
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authorizeStaff, isStaffAccessConfigured } from '../lib/staff-auth'
import { getSupabaseConfiguration, supabaseHeaders } from '../lib/supabase'

const STAFF_STATUSES = new Set([
  'received',
  'reviewing',
  'quoted',
  'approved',
  'in_production',
  'completed',
  'cancelled',
])

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function unauthorized(res: VercelResponse) {
  res.setHeader('WWW-Authenticate', 'Bearer realm="Scorpion Staff"')
  res.status(401).json({ ok: false, code: 'UNAUTHORIZED' })
}

async function listOrders(req: VercelRequest, res: VercelResponse) {
  const config = getSupabaseConfiguration()
  if (!config) {
    res.status(503).json({ ok: false, code: 'ORDER_STORE_NOT_CONFIGURED' })
    return
  }

  const requestId = queryValue(req.query.request_id).trim()
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
          'staff_notes',
          'quote_total_minor',
        ].join(','),
  )
  params.set('order', 'created_at.desc')
  params.set('limit', requestId ? '1' : String(limit))
  if (requestId) params.set('request_id', `eq.${requestId}`)

  const response = await fetch(
    `${config.url}/rest/v1/scorpion_custom_order_requests?${params.toString()}`,
    {
      headers: supabaseHeaders(config.serviceKey),
    },
  )

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500)
    res.status(502).json({ ok: false, code: 'ORDER_STORE_READ_FAILED', detail })
    return
  }

  const rows = await response.json() as unknown[]
  res.status(200).json({ ok: true, orders: rows })
}

async function updateOrder(req: VercelRequest, res: VercelResponse) {
  const config = getSupabaseConfiguration()
  if (!config) {
    res.status(503).json({ ok: false, code: 'ORDER_STORE_NOT_CONFIGURED' })
    return
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) as Record<string, unknown> : req.body as Record<string, unknown>
  const requestId = typeof body?.requestId === 'string' ? body.requestId.trim() : ''
  const status = typeof body?.status === 'string' ? body.status.trim() : ''
  const notes = typeof body?.staffNotes === 'string' ? body.staffNotes.trim() : ''
  const quoteTotalMinor = body?.quoteTotalMinor === null || body?.quoteTotalMinor === undefined
    ? null
    : Number(body.quoteTotalMinor)

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

  const response = await fetch(
    `${config.url}/rest/v1/scorpion_custom_order_requests?request_id=eq.${encodeURIComponent(requestId)}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(config.serviceKey, 'return=representation'),
      body: JSON.stringify({
        status,
        staff_notes: notes || null,
        quote_total_minor: quoteTotalMinor,
        updated_at: new Date().toISOString(),
      }),
    },
  )

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500)
    res.status(502).json({ ok: false, code: 'ORDER_STORE_UPDATE_FAILED', detail })
    return
  }

  const rows = await response.json() as unknown[]
  if (!rows.length) {
    res.status(404).json({ ok: false, code: 'ORDER_NOT_FOUND' })
    return
  }

  res.status(200).json({ ok: true, order: rows[0] })
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

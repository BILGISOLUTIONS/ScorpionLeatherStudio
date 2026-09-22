import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authorizeStaff, isStaffAccessConfigured } from '../../server/lib/staff-auth'
import { isShopifyDraftOrderConfigured, sendShopifyDraftInvoice } from '../../server/lib/shopify-draft'
import { getSupabaseConfiguration, supabaseHeaders } from '../../server/lib/supabase'

interface StoredOrder {
  request_id: string
  status: string
  customer_email: string | null
  shopify_draft_order_id: string | null
  shopify_draft_order_name: string | null
  shopify_invoice_state: string | null
  shopify_invoice_sent_at: string | null
}

async function patchStoredOrder(
  config: { url: string; serviceKey: string },
  requestId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(
    `${config.url}/rest/v1/scorpion_custom_order_requests?request_id=eq.${encodeURIComponent(requestId)}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(config.serviceKey, 'return=minimal'),
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    },
  )
  if (!response.ok) throw new Error(`ORDER_STORE_UPDATE_FAILED_${response.status}`)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED' })
    return
  }

  if (!isStaffAccessConfigured()) {
    res.status(503).json({ ok: false, code: 'STAFF_ACCESS_NOT_CONFIGURED' })
    return
  }
  if (!authorizeStaff(req.headers as Record<string, string | string[] | undefined>)) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="Scorpion Staff"')
    res.status(401).json({ ok: false, code: 'UNAUTHORIZED' })
    return
  }
  if (!isShopifyDraftOrderConfigured()) {
    res.status(503).json({ ok: false, code: 'SHOPIFY_DRAFT_ORDER_NOT_CONFIGURED' })
    return
  }

  const config = getSupabaseConfiguration()
  if (!config) {
    res.status(503).json({ ok: false, code: 'ORDER_STORE_NOT_CONFIGURED' })
    return
  }

  const body = typeof req.body === 'string'
    ? JSON.parse(req.body) as Record<string, unknown>
    : req.body as Record<string, unknown>
  const requestId = typeof body?.requestId === 'string' ? body.requestId.trim() : ''

  if (!/^SC-REQ-/u.test(requestId)) {
    res.status(422).json({ ok: false, code: 'INVALID_REQUEST_ID' })
    return
  }

  try {
    const params = new URLSearchParams({
      select: [
        'request_id',
        'status',
        'customer_email',
        'shopify_draft_order_id',
        'shopify_draft_order_name',
        'shopify_invoice_state',
        'shopify_invoice_sent_at',
      ].join(','),
      request_id: `eq.${requestId}`,
      limit: '1',
    })

    const readResponse = await fetch(
      `${config.url}/rest/v1/scorpion_custom_order_requests?${params.toString()}`,
      { headers: supabaseHeaders(config.serviceKey) },
    )
    if (!readResponse.ok) {
      res.status(502).json({ ok: false, code: 'ORDER_STORE_READ_FAILED' })
      return
    }

    const rows = await readResponse.json() as StoredOrder[]
    const order = rows[0]
    if (!order) {
      res.status(404).json({ ok: false, code: 'ORDER_NOT_FOUND' })
      return
    }
    if (!order.shopify_draft_order_id) {
      res.status(422).json({ ok: false, code: 'SHOPIFY_DRAFT_ORDER_REQUIRED' })
      return
    }
    if (order.status !== 'approved') {
      res.status(422).json({ ok: false, code: 'ORDER_MUST_BE_APPROVED' })
      return
    }
    if (!order.customer_email) {
      res.status(422).json({ ok: false, code: 'CUSTOMER_EMAIL_REQUIRED' })
      return
    }
    if (order.shopify_invoice_sent_at) {
      res.status(200).json({
        ok: true,
        existing: true,
        sentAt: order.shopify_invoice_sent_at,
        draftOrderName: order.shopify_draft_order_name,
      })
      return
    }
    if (order.shopify_invoice_state === 'sending') {
      res.status(409).json({ ok: false, code: 'SHOPIFY_INVOICE_SEND_IN_PROGRESS' })
      return
    }

    await patchStoredOrder(config, requestId, {
      shopify_invoice_state: 'sending',
      shopify_invoice_error: null,
    })

    try {
      const draft = await sendShopifyDraftInvoice(order.shopify_draft_order_id)
      const sentAt = new Date().toISOString()

      await patchStoredOrder(config, requestId, {
        shopify_invoice_state: 'sent',
        shopify_invoice_sent_at: sentAt,
        shopify_invoice_error: null,
      })

      res.status(200).json({
        ok: true,
        existing: false,
        sentAt,
        draftOrder: draft,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await patchStoredOrder(config, requestId, {
        shopify_invoice_state: 'failed',
        shopify_invoice_error: message.slice(0, 1000),
      }).catch(() => undefined)

      console.error('Scorpion Shopify invoice send failed', {
        requestId,
        error: message,
      })
      res.status(502).json({ ok: false, code: 'SHOPIFY_INVOICE_SEND_FAILED' })
    }
  } catch (error) {
    console.error('Scorpion Shopify invoice API failed', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ ok: false, code: 'SHOPIFY_INVOICE_API_FAILED' })
  }
}

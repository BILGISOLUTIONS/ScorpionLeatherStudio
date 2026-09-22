import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { StudioOrderRequest } from '@sls/order-engine'
import { authorizeStaff, isStaffAccessConfigured } from '../lib/staff-auth'
import { createShopifyDraftOrder, isShopifyDraftOrderConfigured } from '../lib/shopify-draft'
import { isScorpionRequestId, patchStaffOrder, readStaffOrder, requestIdFromBody } from '../lib/staff-order-store'
import { getSupabaseConfiguration } from '../lib/supabase'

interface StoredOrder {
  request_id: string
  status: string
  quote_total_minor: number | null
  staff_notes: string | null
  request_payload: StudioOrderRequest
  shopify_draft_order_id: string | null
  shopify_draft_order_name: string | null
  shopify_draft_order_invoice_url: string | null
  shopify_draft_order_state: string | null
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

  const body = typeof req.body === 'string' ? JSON.parse(req.body) as unknown : req.body
  const requestId = requestIdFromBody(body)
  if (!isScorpionRequestId(requestId)) {
    res.status(422).json({ ok: false, code: 'INVALID_REQUEST_ID' })
    return
  }

  try {
    const order = await readStaffOrder<StoredOrder>(config, requestId, [
      'request_id',
      'status',
      'quote_total_minor',
      'staff_notes',
      'request_payload',
      'shopify_draft_order_id',
      'shopify_draft_order_name',
      'shopify_draft_order_invoice_url',
      'shopify_draft_order_state',
    ])
    if (!order) {
      res.status(404).json({ ok: false, code: 'ORDER_NOT_FOUND' })
      return
    }

    if (order.shopify_draft_order_id) {
      res.status(200).json({
        ok: true,
        existing: true,
        draftOrder: {
          id: order.shopify_draft_order_id,
          name: order.shopify_draft_order_name,
          invoiceUrl: order.shopify_draft_order_invoice_url,
        },
      })
      return
    }

    if (order.shopify_draft_order_state === 'creating') {
      res.status(409).json({ ok: false, code: 'DRAFT_ORDER_CREATION_IN_PROGRESS' })
      return
    }

    if (!['quoted', 'approved'].includes(order.status)) {
      res.status(422).json({ ok: false, code: 'ORDER_MUST_BE_QUOTED_OR_APPROVED' })
      return
    }

    if (!Number.isInteger(order.quote_total_minor) || (order.quote_total_minor ?? 0) <= 0) {
      res.status(422).json({ ok: false, code: 'QUOTE_TOTAL_REQUIRED' })
      return
    }

    await patchStaffOrder(config, requestId, {
      shopify_draft_order_state: 'creating',
      shopify_draft_order_error: null,
    })

    try {
      const draft = await createShopifyDraftOrder(
        order.request_payload,
        order.quote_total_minor as number,
        order.staff_notes ?? '',
      )

      await patchStaffOrder(config, requestId, {
        shopify_draft_order_id: draft.id,
        shopify_draft_order_name: draft.name,
        shopify_draft_order_invoice_url: draft.invoiceUrl,
        shopify_draft_order_state: 'created',
        shopify_draft_order_error: null,
      })

      res.status(201).json({ ok: true, existing: false, draftOrder: draft })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await patchStaffOrder(config, requestId, {
        shopify_draft_order_state: 'failed',
        shopify_draft_order_error: message.slice(0, 1000),
      }).catch(() => undefined)

      console.error('Scorpion Shopify draft order creation failed', {
        requestId,
        error: message,
      })
      res.status(502).json({ ok: false, code: 'SHOPIFY_DRAFT_ORDER_CREATE_FAILED' })
    }
  } catch (error) {
    console.error('Scorpion Shopify draft order API failed', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ ok: false, code: 'DRAFT_ORDER_API_FAILED' })
  }
}

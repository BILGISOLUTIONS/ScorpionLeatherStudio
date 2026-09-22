import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authorizeStaff, isStaffAccessConfigured } from '../../server/lib/staff-auth'
import { getShopifyDraftOrderState, isShopifyDraftOrderConfigured } from '../../server/lib/shopify-draft'
import { getSupabaseConfiguration, supabaseHeaders } from '../../server/lib/supabase'

interface StoredOrder {
  request_id: string
  status: string
  shopify_draft_order_id: string | null
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
      select: 'request_id,status,shopify_draft_order_id',
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
    const stored = rows[0]
    if (!stored) {
      res.status(404).json({ ok: false, code: 'ORDER_NOT_FOUND' })
      return
    }
    if (!stored.shopify_draft_order_id) {
      res.status(422).json({ ok: false, code: 'SHOPIFY_DRAFT_ORDER_REQUIRED' })
      return
    }

    const draft = await getShopifyDraftOrderState(stored.shopify_draft_order_id)
    const paid = draft.status === 'COMPLETED' || draft.order?.displayFinancialStatus === 'PAID'

    const patch: Record<string, unknown> = {
      shopify_draft_order_state: draft.status.toLowerCase(),
      shopify_invoice_sent_at: draft.invoiceSentAt,
      shopify_reconciled_at: new Date().toISOString(),
      shopify_order_id: draft.order?.id ?? null,
      shopify_order_name: draft.order?.name ?? null,
      shopify_financial_status: draft.order?.displayFinancialStatus ?? null,
      shopify_fulfillment_status: draft.order?.displayFulfillmentStatus ?? null,
    }

    if (paid && !['in_production', 'completed', 'cancelled'].includes(stored.status)) {
      patch.status = 'paid'
    }

    await patchStoredOrder(config, requestId, patch)

    res.status(200).json({
      ok: true,
      paid,
      status: paid && !['in_production', 'completed', 'cancelled'].includes(stored.status)
        ? 'paid'
        : stored.status,
      draftOrder: draft,
    })
  } catch (error) {
    console.error('Scorpion Shopify reconciliation failed', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(502).json({ ok: false, code: 'SHOPIFY_RECONCILIATION_FAILED' })
  }
}

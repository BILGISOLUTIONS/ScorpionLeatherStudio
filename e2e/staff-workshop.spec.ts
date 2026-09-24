import { expect, test } from '@playwright/test'

const listOrder = {
  request_id: 'SC-REQ-20260924120000-ABC123',
  build_id: 'SLS-ABCDEF12',
  status: 'paid',
  delivery_status: 'emailed',
  created_at: '2026-09-24T12:00:00.000Z',
  updated_at: '2026-09-24T12:00:00.000Z',
  customer_name: 'Test Customer',
  customer_email: 'test@example.com',
  customer_phone: '',
  customer_company: 'Example Co',
  product_title: 'Leather Welding Hood',
  reference_title: 'Cognac Textured',
  sku: 'SC-WH-CTX-002',
  variant_title: 'Custom Order',
  quantity: 1,
  base_subtotal_minor: 1000,
  base_price_status: 'quote',
  artwork_name: null,
  artwork_type: null,
  artwork_size: null,
  artwork_storage_path: null,
  staff_notes: '',
  quote_total_minor: 45000,
  shopify_draft_order_id: 'gid://shopify/DraftOrder/1',
  shopify_draft_order_name: '#D1',
  shopify_draft_order_invoice_url: null,
  shopify_draft_order_state: 'completed',
  shopify_invoice_state: 'sent',
  shopify_invoice_sent_at: '2026-09-24T12:30:00.000Z',
  shopify_reconciled_at: '2026-09-24T12:40:00.000Z',
  shopify_order_id: 'gid://shopify/Order/1',
  shopify_order_name: '#1001',
  shopify_financial_status: 'PAID',
  shopify_fulfillment_status: 'UNFULFILLED',
  workshop_revision_id: null,
  workshop_released_at: null,
  workshop_released_by: null,
}

const requestPayload = {
  schemaVersion: 1,
  requestId: listOrder.request_id,
  buildId: listOrder.build_id,
  createdAt: listOrder.created_at,
  sourceUrl: 'https://example.com/?studio=test',
  customer: {
    name: 'Test Customer',
    email: 'test@example.com',
    phone: '',
    company: 'Example Co',
    preferredContact: 'email',
    neededBy: '',
  },
  build: {
    schemaVersion: 1,
    familyId: 'welding-hood',
    referenceId: 'hood-cognac',
    variantId: 'gid://shopify/ProductVariant/1',
    quantity: 1,
    personalization: {
      construction: {
        leatherFinish: 'as-photographed',
        leatherColor: '',
        stitching: 'contrast',
        hardware: 'shop-choice',
        edgeTreatment: 'as-photographed',
        notes: '',
      },
      toolingStyle: 'basket-weave',
      toolingNotes: '',
      textEnabled: true,
      text: 'ZAN',
      textStyle: 'western',
      placement: 'Shop recommendation',
      artworkNotes: '',
      additionalNotes: '',
    },
  },
  commerce: {
    productTitle: 'Leather Welding Hood',
    referenceTitle: 'Cognac Textured',
    shopifyProductId: 'gid://shopify/Product/1',
    merchandiseId: 'gid://shopify/ProductVariant/1',
    sku: 'SC-WH-CTX-002',
    variantTitle: 'Custom Order',
    basePriceMinor: 1000,
    listedInventoryQuantity: 0,
    priceStatus: 'quote',
  },
  pricing: {
    currency: 'USD',
    basePriceMinor: 1000,
    baseSubtotalMinor: 1000,
    basePriceStatus: 'quote',
    personalizationRequiresQuote: true,
  },
}

function packet(blockers: Array<{ code: string; message: string }> = [], released = false) {
  return {
    schemaVersion: 1,
    workOrderId: 'SLS-WO-ABCDEF12-ABC123',
    revisionId: 'REV-12345678',
    generatedAt: '2026-09-24T13:00:00.000Z',
    requestId: listOrder.request_id,
    buildId: listOrder.build_id,
    scanPayload: 'SLS:WORKSHOP:1:' + listOrder.request_id + ':REV-12345678',
    release: {
      state: released ? 'released-for-production' : blockers.length ? 'hold-unresolved' : 'draft-review-only',
      orderStatus: released ? 'in_production' : 'paid',
      paymentConfirmed: true,
      blockers,
      warnings: [],
      ...(released ? { releasedBy: 'Ray', releasedAt: '2026-09-24T13:00:00.000Z' } : {}),
    },
    customer: { displayName: 'Test Customer', company: 'Example Co' },
    product: {
      productTitle: 'Leather Welding Hood',
      referenceTitle: 'Cognac Textured',
      sku: 'SC-WH-CTX-002',
      variantTitle: 'Custom Order',
      quantity: 1,
    },
    construction: {
      leatherFinish: { requested:'As photographed', resolved:'Match photographed starting reference', source:'starting-reference', requiresResolution:false },
      leatherColor: { requested:'As photographed', resolved:'Match photographed starting reference', source:'starting-reference', requiresResolution:false },
      stitching: { requested:'Contrast', resolved:'Contrast', source:'customer', requiresResolution:false },
      hardware: { requested:'Shop Choice', resolved:blockers.length ? '' : 'Antique brass', source:blockers.length ? 'customer' : 'staff-resolution', requiresResolution:blockers.length > 0 },
      edgeTreatment: { requested:'As photographed', resolved:'Match photographed starting reference', source:'starting-reference', requiresResolution:false },
    },
    personalization: {
      tooling: { requested:'Basket Weave', resolved:'Basket Weave', source:'customer', requiresResolution:false },
      text:'ZAN',
      textStyle:{ requested:'Western', resolved:'Western', source:'customer', requiresResolution:false },
      placement:{ requested:'Shop recommendation', resolved:blockers.length ? '' : 'Rear panel center', source:blockers.length ? 'customer' : 'staff-resolution', requiresResolution:blockers.length > 0 },
    },
    artwork:{ required:false, durable:false },
    pricing:{ quoteRequired:true, quoteTotalMinor:45000 },
    manufacturingChecklist:[{id:'materials',label:'Verify materials',required:true,status:'pending'}],
    qualityChecklist:[{id:'identity',label:'Verify revision',required:true,status:'pending'}],
  }
}

test('staff workshop release requires resolutions and then locks the released revision', async ({ page }) => {
  let resolved = false
  let released = false

  await page.route('**/api/staff/orders**', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      const isDetail = request.url().includes('request_id=')
      const order = isDetail
        ? {
            ...listOrder,
            request_payload: requestPayload,
            workshop_resolutions: resolved ? { hardware:'Antique brass', placement:'Rear panel center' } : {},
            workshop_release_packet: released ? packet([], true) : null,
            workshop_preview: released
              ? packet([], true)
              : resolved
                ? packet([])
                : packet([
                    { code:'hardware', message:'Hardware requires a shop resolution.' },
                    { code:'placement', message:'Personalization placement requires a shop resolution.' },
                  ]),
            workshop_released_at: released ? '2026-09-24T13:00:00.000Z' : null,
            workshop_released_by: released ? 'Ray' : null,
            workshop_revision_id: released ? 'REV-12345678' : null,
            artwork_signed_url: null,
          }
        : { ...listOrder, status: released ? 'in_production' : 'paid' }
      await route.fulfill({ json: { ok:true, orders:[order] } })
      return
    }

    const body = request.postDataJSON() as Record<string, unknown>
    if (body.releaseToProduction === true) {
      released = true
      const order = {
        ...listOrder,
        status:'in_production',
        request_payload:requestPayload,
        workshop_resolutions:body.workshopResolutions,
        workshop_release_packet:packet([], true),
        workshop_preview:packet([], true),
        workshop_released_at:'2026-09-24T13:00:00.000Z',
        workshop_released_by:'Ray',
        workshop_revision_id:'REV-12345678',
        artwork_signed_url:null,
      }
      await route.fulfill({ json:{ ok:true, order, workshopPacket:packet([], true) } })
      return
    }

    resolved = true
    const order = {
      ...listOrder,
      request_payload:requestPayload,
      workshop_resolutions:body.workshopResolutions,
      workshop_release_packet:null,
      workshop_preview:packet([]),
      artwork_signed_url:null,
    }
    await route.fulfill({ json:{ ok:true, order } })
  })

  page.on('dialog', (dialog) => void dialog.accept())

  await page.goto('/staff.html')
  await page.getByLabel('Staff access token').fill('test-token')
  await page.getByRole('button', { name:'Open order queue' }).click()
  await expect(page.getByText(listOrder.request_id).first()).toBeVisible()
  await page.getByText(listOrder.request_id).first().click()

  await expect(page.getByText('2 release blockers remain.')).toBeVisible()
  await expect(page.getByRole('button', { name:'Release to workshop' })).toBeDisabled()

  await page.locator('#wsHardware').fill('Antique brass')
  await page.locator('#wsPlacement').fill('Rear panel center')
  await page.getByRole('button', { name:'Save production resolutions' }).click()

  await expect(page.getByText('Workshop gate is clear. A named staff member can release this paid build to production.')).toBeVisible()
  await page.locator('#wsReleasedBy').fill('Ray')
  await expect(page.getByRole('button', { name:'Release to workshop' })).toBeEnabled()
  await page.getByRole('button', { name:'Release to workshop' }).click()

  await expect(page.getByText(/Released .* by Ray/)).toBeVisible()
  await expect(page.locator('#editStatus')).toHaveValue('in_production')
  await expect(page.getByRole('button', { name:'Save production resolutions' })).toBeDisabled()
  await expect(page.getByRole('button', { name:'Download packet' })).toBeEnabled()
})

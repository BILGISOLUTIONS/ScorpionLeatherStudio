import { expect, test } from '@playwright/test'

const requestId = 'SC-REQ-20260927000100-SCAN01'
const revisionId = 'REV-SCAN1234'
const scanPayload = `SLS:WORKSHOP:1:${requestId}:${revisionId}`

const packet = {
  schemaVersion: 1,
  workOrderId: 'SLS-WO-SCAN01',
  revisionId,
  requestId,
  buildId: 'SLS-SCANBUILD',
  scanPayload,
  release: {
    state: 'released-for-production',
    orderStatus: 'in_production',
    paymentConfirmed: true,
    blockers: [],
    warnings: [],
    releasedBy: 'Ray',
    releasedAt: '2026-09-27T00:05:00.000Z',
  },
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
    hardware: { requested:'Antique brass', resolved:'Antique brass', source:'staff-resolution', requiresResolution:false },
    edgeTreatment: { requested:'As photographed', resolved:'Match photographed starting reference', source:'starting-reference', requiresResolution:false },
  },
  personalization: {
    tooling: { requested:'None', resolved:'None', source:'customer', requiresResolution:false },
    text:'',
    textStyle:{ requested:'None', resolved:'None', source:'customer', requiresResolution:false },
    placement:{ requested:'None', resolved:'None', source:'customer', requiresResolution:false },
  },
  artwork:{ required:false, durable:false },
  pricing:{ quoteRequired:true, quoteTotalMinor:45000 },
  manufacturingChecklist:[{id:'materials',label:'Verify materials',required:true,status:'pending'}],
  qualityChecklist:[{id:'identity',label:'Verify revision',required:true,status:'pending'}],
}

const detailOrder = {
  request_id: requestId,
  build_id: 'SLS-SCANBUILD',
  status: 'in_production',
  delivery_status: 'emailed',
  created_at: '2026-09-27T00:00:00.000Z',
  updated_at: '2026-09-27T00:05:00.000Z',
  customer_name: 'Scan Test',
  customer_email: 'scan@example.com',
  customer_phone: '',
  customer_company: '',
  product_title: 'Leather Welding Hood',
  reference_title: 'Cognac Textured',
  sku: 'SC-WH-CTX-002',
  variant_title: 'Custom Order',
  quantity: 1,
  base_subtotal_minor: 0,
  base_price_status: 'quote',
  artwork_name: null,
  staff_notes: '',
  quote_total_minor: 45000,
  shopify_draft_order_id: 'gid://shopify/DraftOrder/1',
  shopify_draft_order_name: '#D1',
  shopify_invoice_sent_at: '2026-09-27T00:02:00.000Z',
  shopify_financial_status: 'PAID',
  shopify_order_name: '#1001',
  workshop_revision_id: revisionId,
  workshop_released_at: '2026-09-27T00:05:00.000Z',
  workshop_released_by: 'Ray',
  workshop_release_packet: packet,
  workshop_preview: packet,
  workshop_resolutions: {},
  workshop_schema_ready: true,
  artwork_signed_url: null,
  request_payload: {
    schemaVersion:1,
    requestId,
    buildId:'SLS-SCANBUILD',
    createdAt:'2026-09-27T00:00:00.000Z',
    customer:{name:'Scan Test',email:'scan@example.com'},
    build:{schemaVersion:1,familyId:'welding-hood',referenceId:'hood-cognac',quantity:1,personalization:{}},
    commerce:{productTitle:'Leather Welding Hood',referenceTitle:'Cognac Textured',sku:'SC-WH-CTX-002',variantTitle:'Custom Order',priceStatus:'quote'},
    pricing:{currency:'USD',basePriceMinor:0,baseSubtotalMinor:0,basePriceStatus:'quote',personalizationRequiresQuote:true},
  },
}

test('V0.23 scan lookup opens the exact workshop revision and renders a local QR', async ({ page }, testInfo) => {
  const scriptRequests: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scriptRequests.push(request.url())
  })

  await page.route('**/api/staff/orders**', async (route) => {
    const url = route.request().url()
    const isDetail = url.includes('request_id=')
    await route.fulfill({ json: { ok:true, orders:[isDetail ? detailOrder : detailOrder] } })
  })

  await page.route('**/api/staff/workshop**', async (route) => {
    await route.fulfill({
      json: {
        ok:true,
        schemaReady:true,
        progress:{ manufacturingCompleted:[], qualityCompleted:[] },
        revisionHistory:[],
        auditLog:[],
        qcCompletedAt:null,
        qcCompletedBy:null,
        finalPhotoSignedUrl:null,
      },
    })
  })

  await page.goto('/staff.html')
  await page.getByLabel('Staff access token').fill('test-token')
  await page.getByRole('button', { name:'Open order queue' }).click()

  expect(scriptRequests.some((url) => url.includes('staff-scan-v023'))).toBe(false)

  await page.getByLabel('Workshop scan payload').fill(scanPayload)
  await page.getByRole('button', { name:'Open scanned build' }).click()

  await expect(page.locator('#detailTitle')).toHaveText(requestId)
  await expect(page.getByText(`Matched active workshop revision ${revisionId}.`)).toBeVisible()
  await expect(page.locator('#workshopQr')).toBeVisible()
  await expect(page.locator('#workshopQr svg')).toHaveAttribute('aria-label', 'Workshop QR code')
  await expect(page.locator('#workshopQr code')).toHaveText(scanPayload)

  expect(scriptRequests.some((url) => url.includes('staff-scan-v023'))).toBe(true)

  await page.screenshot({
    path: `playwright-output/screenshots/${testInfo.project.name.includes('mobile') ? 'staff-scan-v023-mobile.png' : 'staff-scan-v023-desktop.png'}`,
    fullPage: true,
  })
})

test('V0.23 scan lookup detects stale workshop revisions', async ({ page }) => {
  await page.route('**/api/staff/orders**', async (route) => {
    await route.fulfill({ json: { ok:true, orders:[detailOrder] } })
  })
  await page.route('**/api/staff/workshop**', async (route) => {
    await route.fulfill({ json: { ok:true, schemaReady:true, progress:{manufacturingCompleted:[],qualityCompleted:[]}, revisionHistory:[], auditLog:[] } })
  })

  await page.goto('/staff.html')
  await page.getByLabel('Staff access token').fill('test-token')
  await page.getByRole('button', { name:'Open order queue' }).click()

  const stalePayload = `SLS:WORKSHOP:1:${requestId}:REV-OLD0001`
  await page.getByLabel('Workshop scan payload').fill(stalePayload)
  await page.getByRole('button', { name:'Open scanned build' }).click()

  await expect(page.getByText(/Revision mismatch:/)).toContainText('REV-OLD0001')
  await expect(page.getByText(/Revision mismatch:/)).toContainText(revisionId)
})

import { expect, test } from '@playwright/test'

const requestId = 'SC-REQ-20260928030000-V025AA'

const packet = {
  schemaVersion: 1,
  workOrderId: 'SLS-WO-V025TEST-V025AA',
  revisionId: 'REV-V025A',
  requestId,
  buildId: 'SLS-V025TEST',
  scanPayload: 'SLS:WORKSHOP:1:' + requestId + ':REV-V025A',
  release: {
    state: 'released-for-production',
    orderStatus: 'in_production',
    paymentConfirmed: true,
    releasedBy: 'Ray',
    releasedAt: '2026-09-28T03:00:00.000Z',
    blockers: [],
    warnings: [],
  },
  customer: { displayName: 'Identity Test', company: 'Scorpion Test' },
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
    hardware: { requested:'Shop Choice', resolved:'Antique brass', source:'staff-resolution', requiresResolution:false },
    edgeTreatment: { requested:'As photographed', resolved:'Match photographed starting reference', source:'starting-reference', requiresResolution:false },
  },
  personalization: {
    tooling: { requested:'None', resolved:'None', source:'none', requiresResolution:false },
    text:null,
    textStyle:{ requested:'None', resolved:'None', source:'none', requiresResolution:false },
    placement:{ requested:'Shop recommendation', resolved:'Rear panel center', source:'staff-resolution', requiresResolution:false },
  },
  artwork:{ required:false, durable:false },
  pricing:{ quoteRequired:true, quoteTotalMinor:45000 },
  manufacturingChecklist:[{id:'materials',label:'Pull materials',required:true,status:'pending'}],
  qualityChecklist:[{id:'identity',label:'Verify revision',required:true,status:'pending'}],
}

const order = {
  request_id: requestId,
  build_id: 'SLS-V025TEST',
  status: 'in_production',
  delivery_status: 'emailed',
  created_at: '2026-09-28T02:50:00.000Z',
  updated_at: '2026-09-28T03:00:00.000Z',
  customer_name: 'Identity Test',
  customer_email: 'identity@example.com',
  customer_phone: '',
  customer_company: 'Scorpion Test',
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
  staff_notes: '',
  quote_total_minor: 45000,
  shopify_draft_order_id: 'gid://shopify/DraftOrder/25',
  shopify_draft_order_name: '#D25',
  shopify_draft_order_invoice_url: null,
  shopify_draft_order_state: 'completed',
  shopify_invoice_state: 'sent',
  shopify_invoice_sent_at: '2026-09-28T02:55:00.000Z',
  shopify_reconciled_at: '2026-09-28T02:56:00.000Z',
  shopify_order_id: 'gid://shopify/Order/25',
  shopify_order_name: '#1025',
  shopify_financial_status: 'PAID',
  shopify_fulfillment_status: 'UNFULFILLED',
  workshop_resolutions: { hardware:'Antique brass', placement:'Rear panel center' },
  workshop_revision_id: 'REV-V025A',
  workshop_released_at: '2026-09-28T03:00:00.000Z',
  workshop_released_by: 'Ray',
  workshop_schema_ready: true,
  workshop_release_packet: packet,
  workshop_preview: packet,
  request_payload: {
    schemaVersion:1,
    requestId,
    buildId:'SLS-V025TEST',
    customer:{name:'Identity Test',email:'identity@example.com',phone:'',company:'Scorpion Test',preferredContact:'email',neededBy:''},
    build:{schemaVersion:1,familyId:'welding-hood',referenceId:'hood-cognac',variantId:'gid://shopify/ProductVariant/1',quantity:1,personalization:{}},
    commerce:{productTitle:'Leather Welding Hood',referenceTitle:'Cognac Textured',shopifyProductId:'gid://shopify/Product/1',merchandiseId:'gid://shopify/ProductVariant/1',sku:'SC-WH-CTX-002',variantTitle:'Custom Order',basePriceMinor:1000,priceStatus:'quote'},
    pricing:{currency:'USD',basePriceMinor:1000,baseSubtotalMinor:1000,basePriceStatus:'quote',personalizationRequiresQuote:true},
  },
}

test('V0.25 individual workshop identity is lazy, visible, and server-role mirrored in the UI', async ({ page }, testInfo) => {
  const scripts: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url())
  })

  const identity = {
    id:'ray',
    name:'Ray',
    roles:['workshop'],
    legacy:false,
  }

  await page.route('**/api/staff/orders**', async (route) => {
    const req = route.request()
    if (req.method() !== 'GET') {
      await route.fulfill({ json:{ ok:true, staffIdentity:identity, order } })
      return
    }
    const detail = req.url().includes('request_id=')
    await route.fulfill({
      json: detail
        ? { ok:true, staffIdentity:identity, orders:[{ ...order, artwork_signed_url:null }] }
        : { ok:true, staffIdentity:identity, workshopSchemaReady:true, orders:[order] },
    })
  })

  await page.route('**/api/staff/workshop**', async (route) => {
    await route.fulfill({
      json:{
        ok:true,
        staffIdentity:identity,
        schemaReady:true,
        progress:{manufacturingCompleted:[],qualityCompleted:[]},
        revisionHistory:[],
        auditLog:[],
        qcCompletedAt:null,
        qcCompletedBy:null,
        finalPhoto:null,
        finalPhotoSignedUrl:null,
        revisionId:'REV-V025A',
        releasedAt:order.workshop_released_at,
        releasedBy:'Ray',
      },
    })
  })

  await page.goto('/staff.html')
  expect(scripts.some((url) => url.includes('staff-identity-v025.js'))).toBe(false)

  await page.getByLabel('Staff access token').fill('ray-individual-secret-token')
  await page.getByRole('button', { name:'Open order queue' }).click()

  await expect(page.locator('#staffIdentity')).toBeVisible()
  await expect(page.locator('#staffIdentity')).toContainText('Ray')
  await expect(page.locator('#staffIdentity')).toContainText('Workshop')
  await expect(page.locator('#connection')).toContainText('Connected · Ray')
  expect(scripts.some((url) => url.includes('staff-identity-v025.js'))).toBe(true)

  await page.getByText(requestId).first().click()

  await expect(page.locator('#wsReleasedBy')).toHaveValue('Ray')
  await expect(page.locator('#wsReleasedBy')).toHaveAttribute('readonly', '')
  await expect(page.locator('#revisionBy')).toHaveValue('Ray')
  await expect(page.locator('#revisionBy')).toHaveAttribute('readonly', '')
  await expect(page.locator('#qcActor')).toHaveValue('Ray')
  await expect(page.locator('#qcActor')).toHaveAttribute('readonly', '')

  await expect(page.locator('#saveOrder')).toBeDisabled()
  await expect(page.locator('#createDraft')).toBeDisabled()
  await expect(page.locator('#sendInvoice')).toBeDisabled()
  await expect(page.locator('#saveQcProgress')).toBeEnabled()
  await expect(page.locator('#uploadQcPhoto')).toBeEnabled()
  await expect(page.locator('#completeWorkshop')).toBeDisabled()
  await expect(page.locator('#createRevision')).toBeEnabled()

  await page.locator('#detail').screenshot({
    path: `playwright-output/screenshots/${testInfo.project.name.includes('mobile') ? 'staff-identity-v025-mobile.png' : 'staff-identity-v025-desktop.png'}`,
  })
})

test('V0.25 staff identity assets never load on the customer Studio', async ({ page }) => {
  const scripts: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url())
  })

  await page.goto('/')
  await expect(page.getByText('Leather Studio').first()).toBeVisible()
  expect(scripts.some((url) => url.includes('staff-identity-v025.js'))).toBe(false)
})

import { expect, test } from '@playwright/test'

const requestId = 'SC-REQ-20260927050000-V024AA'

const packet = {
  schemaVersion: 1,
  workOrderId: 'SLS-WO-V024TEST-V024AA',
  revisionId: 'REV-V024A',
  requestId,
  buildId: 'SLS-V024TEST',
  scanPayload: 'SLS:WORKSHOP:1:' + requestId + ':REV-V024A',
  release: {
    state: 'released-for-production',
    orderStatus: 'in_production',
    paymentConfirmed: true,
    releasedBy: 'Ray',
    releasedAt: '2026-09-27T05:00:00.000Z',
    blockers: [],
    warnings: [],
  },
  customer: { displayName: 'Focus Test', company: 'Scorpion Test' },
  product: {
    productTitle: 'Leather Welding Hood',
    referenceTitle: 'Cognac Textured',
    sku: 'SC-WH-CTX-002',
    variantTitle: 'Custom Order',
    quantity: 2,
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
  manufacturingChecklist:[
    {id:'verify-source',label:'Verify active revision and starting reference',required:true,status:'pending'},
    {id:'materials',label:'Pull and verify specified materials',required:true,status:'pending'},
  ],
  qualityChecklist:[
    {id:'identity',label:'Request/build/revision match',required:true,status:'pending'},
    {id:'photo',label:'Capture final QC photo',required:true,status:'pending'},
  ],
}

const order = {
  request_id: requestId,
  build_id: 'SLS-V024TEST',
  status: 'in_production',
  delivery_status: 'emailed',
  created_at: '2026-09-27T04:50:00.000Z',
  updated_at: '2026-09-27T05:00:00.000Z',
  customer_name: 'Focus Test',
  customer_email: 'focus@example.com',
  customer_phone: '',
  customer_company: 'Scorpion Test',
  product_title: 'Leather Welding Hood',
  reference_title: 'Cognac Textured',
  sku: 'SC-WH-CTX-002',
  variant_title: 'Custom Order',
  quantity: 2,
  base_subtotal_minor: 1000,
  base_price_status: 'quote',
  artwork_name: null,
  artwork_type: null,
  artwork_size: null,
  staff_notes: '',
  quote_total_minor: 45000,
  shopify_draft_order_id: 'gid://shopify/DraftOrder/24',
  shopify_draft_order_name: '#D24',
  shopify_draft_order_state: 'completed',
  shopify_invoice_state: 'sent',
  shopify_invoice_sent_at: '2026-09-27T04:55:00.000Z',
  shopify_order_id: 'gid://shopify/Order/24',
  shopify_order_name: '#1024',
  shopify_financial_status: 'PAID',
  workshop_resolutions: { hardware:'Antique brass', placement:'Rear panel center' },
  workshop_revision_id: 'REV-V024A',
  workshop_released_at: '2026-09-27T05:00:00.000Z',
  workshop_released_by: 'Ray',
  workshop_schema_ready: true,
  workshop_release_packet: packet,
  workshop_preview: packet,
  request_payload: {
    schemaVersion:1,
    requestId,
    buildId:'SLS-V024TEST',
    customer:{name:'Focus Test',email:'focus@example.com',phone:'',company:'Scorpion Test',preferredContact:'email',neededBy:''},
    build:{schemaVersion:1,familyId:'welding-hood',referenceId:'hood-cognac',variantId:'gid://shopify/ProductVariant/1',quantity:2,personalization:{}},
    commerce:{productTitle:'Leather Welding Hood',referenceTitle:'Cognac Textured',shopifyProductId:'gid://shopify/Product/1',merchandiseId:'gid://shopify/ProductVariant/1',sku:'SC-WH-CTX-002',variantTitle:'Custom Order',basePriceMinor:1000,priceStatus:'quote'},
    pricing:{currency:'USD',basePriceMinor:1000,baseSubtotalMinor:2000,basePriceStatus:'quote',personalizationRequiresQuote:true},
  },
}

test('V0.24 workshop focus is lazy, low-distraction, and batches optional auto-save', async ({ page }) => {
  const scripts: string[] = []
  let saveCount = 0
  let progress = { manufacturingCompleted: [] as string[], qualityCompleted: [] as string[] }

  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url())
  })

  await page.route('**/api/staff/orders**', async (route) => {
    const req = route.request()
    if (req.method() !== 'GET') {
      await route.fulfill({ json:{ ok:true, order } })
      return
    }
    const detail = req.url().includes('request_id=')
    await route.fulfill({
      json: detail
        ? { ok:true, orders:[{ ...order, artwork_signed_url:null }] }
        : { ok:true, workshopSchemaReady:true, orders:[order] },
    })
  })

  await page.route('**/api/staff/workshop**', async (route) => {
    const req = route.request()
    const base = {
      ok:true,
      schemaReady:true,
      progress,
      revisionHistory:[],
      auditLog:[],
      qcCompletedAt:null,
      qcCompletedBy:null,
      finalPhoto:null,
      finalPhotoSignedUrl:null,
      revisionId:'REV-V024A',
      releasedAt:order.workshop_released_at,
      releasedBy:'Ray',
    }
    if (req.method() === 'GET') {
      await route.fulfill({ json:base })
      return
    }
    const body = req.postDataJSON() as Record<string, any>
    if (body.action === 'save-progress') {
      saveCount += 1
      progress = body.progress
      await route.fulfill({ json:{ ...base, progress } })
      return
    }
    await route.fulfill({ status:422, json:{ ok:false, code:'INVALID_WORKSHOP_ACTION' } })
  })

  await page.goto('/staff.html')
  await page.getByLabel('Staff access token').fill('test-token')
  await page.getByRole('button', { name:'Open order queue' }).click()
  await page.getByText(requestId).first().click()

  await expect(page.getByRole('button', { name:'Workshop focus' })).toBeEnabled()
  expect(scripts.some((url) => url.includes('staff-focus-v024.js'))).toBe(false)

  await page.getByRole('button', { name:'Workshop focus' }).click()

  await expect(page.getByRole('region', { name:'Workshop focus station' })).toBeVisible()
  await expect(page.locator('#detail')).toHaveClass(/workshop-focus-mode/)
  await expect(page.getByText('SLS-WO-V024TEST-V024AA')).toBeVisible()
  await expect(page.getByText('REV-V024A', { exact:true })).toBeVisible()
  await expect(page.getByText('0/2', { exact:true })).toHaveCount(2)
  expect(scripts.some((url) => url.includes('staff-focus-v024.js'))).toBe(true)

  await page.locator('#qcActor').fill('Wilson')
  await page.getByLabel('Auto-save checklist').check()

  const manufacturing = page.locator('#manufacturingChecks input[type=checkbox]')
  await manufacturing.nth(0).check()
  await manufacturing.nth(1).check()

  await expect(page.getByRole('region', { name:'Workshop focus station' })).toContainText('2/2')
  await expect.poll(() => saveCount, { timeout:3000 }).toBe(1)

  const quality = page.locator('#qualityChecks input[type=checkbox]')
  await quality.nth(0).check()
  await expect(page.getByRole('region', { name:'Workshop focus station' })).toContainText('1/2')

  await page.getByLabel('Auto-save checklist').uncheck()
  await quality.nth(1).check()
  await page.keyboard.press('Control+s')
  await expect.poll(() => saveCount, { timeout:2000 }).toBe(2)

  await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name:'Workshop focus station' })).toBeHidden()
  await expect(page.locator('#detail')).not.toHaveClass(/workshop-focus-mode/)
  await expect(page.locator('#detail')).toHaveAttribute('open', '')
})

test('V0.24 focus module never loads on the customer Studio', async ({ page }) => {
  const scripts: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url())
  })
  await page.goto('/')
  await expect(page.getByText('Leather Studio').first()).toBeVisible()
  expect(scripts.some((url) => url.includes('staff-focus-v024.js'))).toBe(false)
})

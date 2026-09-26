import { expect, test } from '@playwright/test'

const requestId = 'SC-REQ-20260926110000-V021AA'
const buildId = 'SLS-V021TEST'

const order = {
  request_id: requestId,
  build_id: buildId,
  status: 'in_production',
  delivery_status: 'emailed',
  created_at: '2026-09-26T11:00:00.000Z',
  updated_at: '2026-09-26T11:00:00.000Z',
  customer_name: 'Workshop Test',
  customer_email: 'workshop@example.com',
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
  shopify_draft_order_id: 'gid://shopify/DraftOrder/21',
  shopify_draft_order_name: '#D21',
  shopify_draft_order_invoice_url: null,
  shopify_draft_order_state: 'completed',
  shopify_invoice_state: 'sent',
  shopify_invoice_sent_at: '2026-09-26T11:15:00.000Z',
  shopify_reconciled_at: '2026-09-26T11:20:00.000Z',
  shopify_order_id: 'gid://shopify/Order/21',
  shopify_order_name: '#1021',
  shopify_financial_status: 'PAID',
  shopify_fulfillment_status: 'UNFULFILLED',
  workshop_resolutions: {
    hardware: 'Antique brass',
    placement: 'Rear panel center',
  },
  workshop_revision_id: 'REV-V021A',
  workshop_released_at: '2026-09-26T11:30:00.000Z',
  workshop_released_by: 'Ray',
  workshop_schema_ready: true,
}

const packet = {
  schemaVersion: 1,
  workOrderId: 'SLS-WO-V021TEST-V021AA',
  revisionId: 'REV-V021A',
  generatedAt: '2026-09-26T11:30:00.000Z',
  requestId,
  buildId,
  scanPayload: 'SLS:WORKSHOP:1:' + requestId + ':REV-V021A',
  release: {
    state: 'released-for-production',
    orderStatus: 'in_production',
    paymentConfirmed: true,
    releasedBy: 'Ray',
    releasedAt: '2026-09-26T11:30:00.000Z',
    blockers: [],
    warnings: [],
  },
  customer: { displayName: 'Workshop Test', company: 'Scorpion Test' },
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
  manufacturingChecklist:[
    {id:'verify-source',label:'Verify request/revision and photographed starting reference',required:true,status:'pending'},
    {id:'materials',label:'Pull and verify specified materials',required:true,status:'pending'},
  ],
  qualityChecklist:[
    {id:'identity',label:'Request/build/revision match',required:true,status:'pending'},
    {id:'photo',label:'Capture final QC photo',required:true,status:'pending'},
  ],
}

const requestPayload = {
  schemaVersion: 1,
  requestId,
  buildId,
  createdAt: order.created_at,
  sourceUrl: 'https://example.com/?studio=v021',
  customer: {
    name: order.customer_name,
    email: order.customer_email,
    phone: '',
    company: order.customer_company,
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
        leatherFinish:'as-photographed',
        leatherColor:'',
        stitching:'contrast',
        hardware:'shop-choice',
        edgeTreatment:'as-photographed',
        notes:'',
      },
      toolingStyle:'none',
      toolingNotes:'',
      textEnabled:false,
      text:'',
      textStyle:'western',
      placement:'Shop recommendation',
      artworkNotes:'',
      additionalNotes:'',
    },
  },
  commerce: {
    productTitle:order.product_title,
    referenceTitle:order.reference_title,
    shopifyProductId:'gid://shopify/Product/1',
    merchandiseId:'gid://shopify/ProductVariant/1',
    sku:order.sku,
    variantTitle:order.variant_title,
    basePriceMinor:1000,
    listedInventoryQuantity:0,
    priceStatus:'quote',
  },
  pricing:{
    currency:'USD',
    basePriceMinor:1000,
    baseSubtotalMinor:1000,
    basePriceStatus:'quote',
    personalizationRequiresQuote:true,
  },
}

test('V0.21 workshop tracks checklist progress final photo and final QC signoff', async ({ page }) => {
  let progress = { manufacturingCompleted: [] as string[], qualityCompleted: [] as string[] }
  let finalPhoto = false
  let completed = false
  const auditLog: Array<Record<string, unknown>> = []

  await page.route('**/api/staff/orders**', async (route) => {
    const req = route.request()
    if (req.method() !== 'GET') {
      await route.fulfill({ json:{ ok:true, order } })
      return
    }

    const detail = req.url().includes('request_id=')
    if (detail) {
      await route.fulfill({
        json:{
          ok:true,
          orders:[{
            ...order,
            status:completed ? 'completed' : 'in_production',
            request_payload:requestPayload,
            workshop_release_packet:packet,
            workshop_preview:packet,
            artwork_signed_url:null,
          }],
        },
      })
    } else {
      await route.fulfill({ json:{ ok:true, workshopSchemaReady:true, orders:[{...order,status:completed?'completed':'in_production'}] } })
    }
  })

  await page.route('**/api/staff/workshop**', async (route) => {
    const req = route.request()
    const base = {
      ok:true,
      schemaReady:true,
      progress,
      revisionHistory:[],
      auditLog,
      qcCompletedAt:completed ? '2026-09-26T12:30:00.000Z' : null,
      qcCompletedBy:completed ? 'Wilson' : null,
      finalPhoto:finalPhoto ? {
        name:'final-qc.png',
        type:'image/png',
        size:100,
        storagePath:'test/final-qc.png',
        sha256:'a'.repeat(64),
      } : null,
      finalPhotoSignedUrl:finalPhoto ? 'https://example.com/final-qc.png' : null,
      revisionId:'REV-V021A',
      releasedAt:order.workshop_released_at,
      releasedBy:'Ray',
    }

    if (req.method() === 'GET') {
      await route.fulfill({ json:base })
      return
    }

    const body = req.postDataJSON() as Record<string, any>
    if (body.action === 'save-progress') {
      progress = body.progress
      auditLog.push({at:'2026-09-26T12:10:00.000Z',actor:body.actor,action:'progress-saved',revisionId:'REV-V021A'})
      await route.fulfill({ json:{...base,progress,auditLog:[...auditLog]} })
      return
    }
    if (body.action === 'upload-final-photo') {
      finalPhoto = true
      auditLog.push({at:'2026-09-26T12:20:00.000Z',actor:body.actor,action:'final-photo-stored',revisionId:'REV-V021A'})
      await route.fulfill({ json:{...base,progress,finalPhoto:{name:'final-qc.png'},finalPhotoSignedUrl:'https://example.com/final-qc.png',auditLog:[...auditLog]} })
      return
    }
    if (body.action === 'complete') {
      const allDone = progress.manufacturingCompleted.length === 2 && progress.qualityCompleted.length === 2 && finalPhoto
      if (!allDone) {
        await route.fulfill({ status:422, json:{ok:false,code:'WORKSHOP_COMPLETION_BLOCKED',issues:[{message:'QC incomplete'}]} })
        return
      }
      completed = true
      auditLog.push({at:'2026-09-26T12:30:00.000Z',actor:body.actor,action:'final-qc-completed',revisionId:'REV-V021A'})
      await route.fulfill({ json:{...base,qcCompletedAt:'2026-09-26T12:30:00.000Z',qcCompletedBy:body.actor,auditLog:[...auditLog]} })
      return
    }

    await route.fulfill({ status:422, json:{ok:false,code:'INVALID_WORKSHOP_ACTION'} })
  })

  page.on('dialog', (dialog) => void dialog.accept())
  await page.goto('/staff.html')
  await page.getByLabel('Staff access token').fill('test-token')
  await page.getByRole('button', { name:'Open order queue' }).click()
  await page.getByText(requestId).first().click()

  await expect(page.getByText(/Revision REV-V021A/)).toBeVisible()
  await page.locator('#qcActor').fill('Wilson')

  const manufacturing = page.locator('#manufacturingChecks input[type=checkbox]')
  const quality = page.locator('#qualityChecks input[type=checkbox]')
  await expect(manufacturing).toHaveCount(2)
  await expect(quality).toHaveCount(2)
  await manufacturing.nth(0).check()
  await manufacturing.nth(1).check()
  await quality.nth(0).check()
  await quality.nth(1).check()

  await page.getByRole('button', { name:'Save progress' }).click()
  await expect(page.getByText(/manufacturing 2\/2/)).toBeVisible()

  const png = Buffer.from(
    await page.evaluate(() => {
      const canvas=document.createElement('canvas')
      canvas.width=2
      canvas.height=2
      const ctx=canvas.getContext('2d')!
      ctx.fillStyle='#8a4e2b'
      ctx.fillRect(0,0,2,2)
      return canvas.toDataURL('image/png').split(',')[1]
    }),
    'base64',
  )
  await page.locator('#qcPhoto').setInputFiles({name:'final-qc.png',mimeType:'image/png',buffer:png})
  await page.getByRole('button', { name:'Store final photo' }).click()
  await expect(page.locator('#qcState')).toContainText('final photo stored')

  await page.getByRole('button', { name:'Complete final QC' }).click()
  await expect(page.getByText(/Final QC completed/)).toBeVisible()
  await expect(page.locator('#editStatus')).toHaveValue('completed')
  await expect(page.getByText('final qc completed')).toBeVisible()
})

test('V0.21 controlled revision archives the old revision and resets progress', async ({ page }) => {
  let revision = 'REV-V021A'
  let resolutionPlacement = 'Rear panel center'

  await page.route('**/api/staff/orders**', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      const detail = req.url().includes('request_id=')
      await route.fulfill({
        json: detail
          ? {ok:true,orders:[{
              ...order,
              request_payload:requestPayload,
              workshop_resolutions:{hardware:'Antique brass',placement:resolutionPlacement},
              workshop_release_packet:{...packet,revisionId:revision},
              workshop_preview:{...packet,revisionId:revision},
              workshop_revision_id:revision,
              artwork_signed_url:null,
            }]}
          : {ok:true,orders:[order]},
      })
      return
    }
    await route.fulfill({json:{ok:true,order}})
  })

  await page.route('**/api/staff/workshop**', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      await route.fulfill({json:{
        ok:true,schemaReady:true,progress:{manufacturingCompleted:['verify-source'],qualityCompleted:[]},
        revisionHistory:[],auditLog:[],qcCompletedAt:null,qcCompletedBy:null,finalPhoto:null,finalPhotoSignedUrl:null,
        revisionId:revision,releasedAt:order.workshop_released_at,releasedBy:'Ray',
      }})
      return
    }

    const body = req.postDataJSON() as Record<string, any>
    if (body.action === 'create-revision') {
      resolutionPlacement = body.workshopResolutions.placement
      revision = 'REV-V021B'
      await route.fulfill({json:{
        ok:true,
        previousRevisionId:'REV-V021A',
        workshopPacket:{...packet,revisionId:'REV-V021B'},
        schemaReady:true,
        progress:{manufacturingCompleted:[],qualityCompleted:[]},
        revisionHistory:[{revisionId:'REV-V021A',reason:body.reason}],
        auditLog:[{at:'2026-09-26T12:00:00.000Z',actor:body.actor,action:'controlled-revision-created',revisionId:'REV-V021B'}],
        qcCompletedAt:null,qcCompletedBy:null,finalPhoto:null,finalPhotoSignedUrl:null,
        revisionId:'REV-V021B',releasedAt:'2026-09-26T12:00:00.000Z',releasedBy:body.actor,
      }})
      return
    }
    await route.fulfill({status:422,json:{ok:false,code:'INVALID_WORKSHOP_ACTION'}})
  })

  page.on('dialog', (dialog) => void dialog.accept())
  await page.goto('/staff.html')
  await page.getByLabel('Staff access token').fill('test-token')
  await page.getByRole('button', { name:'Open order queue' }).click()
  await page.getByText(requestId).first().click()

  await expect(page.locator('#revisionControls')).toBeVisible()
  await page.locator('#wsPlacement').fill('Left side panel')
  await page.locator('#revisionReason').fill('Customer approved revised placement before cutting.')
  await page.locator('#revisionBy').fill('Ray')
  await page.getByRole('button', { name:'Create controlled revision' }).click()

  await expect(page.getByText(/REV-V021A → REV-V021B/)).toBeVisible()
  await expect(page.getByText(/manufacturing 0\/2/)).toBeVisible()
  await expect(page.locator('#qcAudit').getByText('controlled revision created', { exact:true })).toBeVisible()
})

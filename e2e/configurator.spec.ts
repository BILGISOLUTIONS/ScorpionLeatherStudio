import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'

test.beforeAll(async () => {
  await fs.mkdir('playwright-output/screenshots', { recursive: true })
})

test.beforeEach(async ({ page }) => {
  await page.route('**/api/catalog-variant?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, code: 'TEST_SNAPSHOT_FALLBACK' }),
    })
  })
})

test('multi-product studio builds and captures a customized order request', async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Custom Leather Studio' })).toBeVisible()
  const productRail = page.getByRole('navigation', { name: 'Customizable products' })
  await expect(productRail).toBeVisible()
  await expect(productRail.getByRole('button')).toHaveCount(8)
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByText('3D contract validated')).toHaveText('3D contract validated')

  await page.getByRole('button', { name: /Thigh Protector/i }).click()
  await expect(page.getByRole('heading', { name: 'Leather Thigh Protector - Brown' }).first()).toBeVisible()
  await expect(page.getByTestId('base-price')).toHaveText('$45.99')

  await page.getByRole('button', { name: /Radio Harness/i }).click()
  await expect(page.getByText('Leather Radio Harness', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: /Alligator-print cowhide Scorpion/i })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)

  await page.getByRole('button', { name: /Cowhide Radio Harness - Black/i }).click()
  await page.getByRole('button', { name: /X-Large/i }).click()
  await expect(page.getByTestId('base-price')).toHaveText('$350.00')
  const buildSummary = page.getByRole('region', { name: 'Build summary' })
  await expect(buildSummary.getByText('SC-LRH-BLK-XL-002')).toBeVisible()

  await page.getByLabel('Leather finish preference').selectOption('textured')
  await page.getByLabel('Leather color request').fill('Dark brown')
  await page.getByLabel('Stitching preference').selectOption('contrast')
  await page.getByLabel('Hardware preference').selectOption('antique-brass')
  await page.getByLabel('Edge / binding preference').selectOption('dark')
  await page.getByLabel('Construction notes').fill('Reinforce the shoulder strap junctions.')

  await page.getByRole('button', { name: 'Western floral' }).click()
  await page.getByRole('checkbox', { name: /Add text/i }).check()
  await page.getByPlaceholder('Name, initials, company, unit, etc.').fill('ZAN CREW')
  await page.getByRole('button', { name: 'Block', exact: true }).click()
  await page.getByLabel('Requested placement').selectOption({ label: 'Front chest panel' })

  const artworkInput = page.locator('input[type="file"]')
  await artworkInput.setInputFiles({
    name: 'crew-logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64'),
  })
  await expect(page.getByText('crew-logo.png', { exact: true })).toBeVisible()

  await page.getByRole('spinbutton', { name: 'Quantity' }).fill('2')
  await expect(page.getByTestId('base-price')).toHaveText('$700.00')

  await expect(page.getByText('ZAN CREW').first()).toBeVisible()
  await expect(page.getByText('Western floral').last()).toBeVisible()

  await page.getByRole('button', { name: 'Share build' }).click()
  await expect.poll(() => new URL(page.url()).searchParams.has('studio')).toBe(true)

  await page.reload()
  await expect(page.getByTestId('base-price')).toHaveText('$700.00')
  await expect(page.getByPlaceholder('Name, initials, company, unit, etc.')).toHaveValue('ZAN CREW')
  await expect(page.getByLabel('Leather finish preference')).toHaveValue('textured')
  await expect(page.getByLabel('Leather color request')).toHaveValue('Dark brown')
  await expect(page.getByLabel('Hardware preference')).toHaveValue('antique-brass')
  await expect(page.getByRole('spinbutton', { name: 'Quantity' })).toHaveValue('2')

  const deferredOrder = page.getByTestId('order-capture-deferred')
  if (await deferredOrder.count()) {
    await deferredOrder.scrollIntoViewIfNeeded()
  }
  const requestPanel = page.getByRole('region', { name: 'Custom order request' })
  await expect(requestPanel.getByRole('textbox', { name: /^Name/ })).toBeVisible()
  await requestPanel.getByRole('textbox', { name: /^Name/ }).fill('Test Customer')
  await requestPanel.getByRole('textbox', { name: 'Email', exact: true }).fill('customer@example.com')
  await requestPanel.getByRole('button', { name: 'Create Order Request' }).click()

  await expect(requestPanel.getByText('REQUEST READY')).toBeVisible()
  await expect(requestPanel.locator('pre')).toContainText('SC-LRH-BLK-XL-002')
  await expect(requestPanel.locator('pre')).toContainText('Quantity: 2')
  await expect(requestPanel.locator('pre')).toContainText('ZAN CREW')
  await expect(requestPanel.locator('pre')).toContainText('Leather finish preference: Textured')
  await expect(requestPanel.locator('pre')).toContainText('Leather color request: Dark brown')
  await expect(requestPanel.locator('pre')).toContainText('Hardware preference: Antique Brass')
  await expect(requestPanel.locator('pre')).toContainText('Reinforce the shoulder strap junctions.')
  await expect(requestPanel.locator('pre')).toContainText('western-floral')
  let deliveredRequestId = ''
  let deliveredArtworkName = ''
  await page.route('**/api/order-requests', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      request?: {
        requestId?: string
        commerce?: { sku?: string; referenceImageUrl?: string; listedInventoryQuantity?: number }
        pricing?: { baseSubtotalMinor?: number }
        build?: { personalization?: { construction?: { leatherFinish?: string; leatherColor?: string; hardware?: string } } }
      }
      artwork?: { name?: string; type?: string; dataUrl?: string }
    }
    deliveredRequestId = body.request?.requestId ?? ''
    deliveredArtworkName = body.artwork?.name ?? ''
    expect(body.request?.commerce?.sku).toBe('SC-LRH-BLK-XL-002')
    expect(body.request?.commerce?.referenceImageUrl).toContain('cdn.shopify.com')
    expect(body.request?.commerce?.listedInventoryQuantity).toBe(4)
    expect(body.request?.pricing?.baseSubtotalMinor).toBe(70000)
    expect(body.request?.build?.personalization?.construction?.leatherFinish).toBe('textured')
    expect(body.request?.build?.personalization?.construction?.leatherColor).toBe('Dark brown')
    expect(body.request?.build?.personalization?.construction?.hardware).toBe('antique-brass')
    expect(body.artwork?.type).toBe('image/png')
    expect(body.artwork?.dataUrl).toContain('data:image/png;base64,')
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ accepted: true, requestId: deliveredRequestId, deliveryId: 'test-delivery', artworkAttached: true }),
    })
  })

  const sendButton = requestPanel.getByRole('button', { name: 'Send to Scorpion' })
  await expect(sendButton).toBeDisabled()
  await requestPanel.getByRole('checkbox', { name: /I understand this is a customization request/i }).check()
  await expect(sendButton).toBeEnabled()
  await sendButton.click()
  await expect(requestPanel.getByRole('button', { name: 'Sent to Scorpion' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('sent to Scorpion successfully')
  expect(deliveredRequestId).toMatch(/^SC-REQ-/u)
  expect(deliveredArtworkName).toBe('crew-logo.png')
  await expect(requestPanel.getByRole('button', { name: 'JSON packet' })).toBeVisible()
  await expect(requestPanel.getByRole('button', { name: 'Print packet' })).toBeVisible()
  await expect(requestPanel.getByRole('button', { name: 'Email fallback' })).toBeVisible()

  const screenshotName = testInfo.project.name.includes('mobile') ? 'mobile.png' : 'desktop.png'
  await page.screenshot({
    path: `playwright-output/screenshots/${screenshotName}`,
    fullPage: true,
  })

  expect(consoleErrors, `Browser console errors: ${consoleErrors.join('\n')}`).toEqual([])
})


test('Shopify embed deep link opens the requested real catalog product without loading 3D', async ({ page }) => {
  const scriptRequests: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scriptRequests.push(request.url())
  })

  await page.goto('/?embed=1&product=cowhide-radio-harness-black&variant=SC-LRH-BLK-XL-002')

  await expect(page.getByRole('heading', { name: 'Custom Leather Studio' })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Cowhide Radio Harness - Black' }).first()).toBeVisible()
  await expect(page.getByTestId('base-price')).toHaveText('$350.00')
  await expect(page.getByText('SC-LRH-BLK-XL-002').first()).toBeVisible()
  await expect(page.locator('main')).toHaveClass(/is-embedded/)
  await expect(page.locator('canvas')).toHaveCount(0)
  expect(scriptRequests.some((url) => url.includes('three-renderer') || url.includes('three.module.js'))).toBe(false)
  expect(scriptRequests.some((url) => url.includes('OrderCapture'))).toBe(false)

  const deferredOrder = page.getByTestId('order-capture-deferred')
  await deferredOrder.scrollIntoViewIfNeeded()
  await expect(page.getByRole('region', { name: 'Custom order request' }).getByRole('textbox', { name: /^Name/ })).toBeVisible()
  await expect.poll(() => scriptRequests.some((url) => url.includes('OrderCapture'))).toBe(true)
})


test('staff console stays isolated and locked without credentials', async ({ page }) => {
  await page.goto('/staff.html')
  await expect(page.getByRole('heading', { name: 'Custom Order Queue' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Staff access' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open order queue' })).toBeVisible()
  await expect(page.getByText('Not connected')).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)
})


test('live Shopify reconciliation updates price inventory and order packet', async ({ page }) => {
  await page.unroute('**/api/catalog-variant?*')
  await page.route('**/api/catalog-variant?*', async (route) => {
    const url = new URL(route.request().url())
    expect(url.searchParams.get('productId')).toBe('gid://shopify/Product/10403653812504')
    expect(url.searchParams.get('variantId')).toBe('gid://shopify/ProductVariant/52616019837208')

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        variant: {
          productId: 'gid://shopify/Product/10403653812504',
          productTitle: 'Cowhide Radio Harness - Black',
          productStatus: 'ACTIVE',
          variantId: 'gid://shopify/ProductVariant/52616019837208',
          variantTitle: 'X-Large',
          sku: 'SC-LRH-BLK-XL-002',
          priceMinor: 36000,
          inventoryQuantity: 1,
          fetchedAt: '2026-09-22T04:30:00.000Z',
        },
      }),
    })
  })

  await page.goto('/?product=cowhide-radio-harness-black&variant=SC-LRH-BLK-XL-002')

  await expect(page.getByTestId('catalog-freshness')).toContainText('Live Shopify data')
  await expect(page.getByTestId('base-price')).toHaveText('$360.00')

  const buildSummary = page.getByRole('region', { name: 'Build summary' })
  const stockRow = buildSummary.getByText('Listed stock').locator('..')
  await expect(stockRow.getByText('1', { exact: true })).toBeVisible()

  await page.getByRole('spinbutton', { name: 'Quantity' }).fill('2')
  await expect(page.getByTestId('base-price')).toHaveText('$720.00')
  await expect(buildSummary).toContainText('exceeds the currently listed inventory of 1')

  const requestPanel = page.getByRole('region', { name: 'Custom order request' })
  await requestPanel.scrollIntoViewIfNeeded()
  await expect(requestPanel.getByRole('textbox', { name: /^Name/ })).toBeVisible()
  await requestPanel.getByRole('textbox', { name: /^Name/ }).fill('Live Catalog Customer')
  await requestPanel.getByRole('textbox', { name: 'Email', exact: true }).fill('live@example.com')
  await requestPanel.getByRole('button', { name: 'Create Order Request' }).click()

  await expect(requestPanel.locator('pre')).toContainText('Listed inventory at configuration: 1')
  await expect(requestPanel.locator('pre')).toContainText('Catalog base: $360.00 each · $720.00 base subtotal')
})

test('quote-only products do not request live Shopify pricing', async ({ page }) => {
  let catalogRequests = 0
  page.on('request', (request) => {
    if (request.url().includes('/api/catalog-variant')) catalogRequests += 1
  })

  await page.goto('/?family=welding-hood&reference=hood-cognac')
  await expect(page.getByTestId('base-price')).toHaveText('QUOTE')
  await expect(page.getByTestId('catalog-freshness')).toHaveText('Quote workflow')
  await page.waitForTimeout(250)
  expect(catalogRequests).toBe(0)
})


test('Material Lab inspects the registry without loading customer 3D runtime', async ({ page }, testInfo) => {
  const scriptRequests: string[] = []
  const consoleErrors: string[] = []

  page.on('request', (request) => {
    if (request.resourceType() === 'script') scriptRequests.push(request.url())
  })
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/materials.html')

  await expect(page.getByRole('heading', { name: 'Material Lab' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Material registry' }).locator('.material-card')).toHaveCount(7)
  await expect(page.getByText('SCL-COGNAC')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Cognac Textured Reference' })).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Material library status' }).getByText('Production approved', { exact: true }),
  ).toBeVisible()

  await page.getByRole('searchbox', { name: 'Search materials' }).fill('cognac')
  await expect(page.getByRole('region', { name: 'Material registry' }).locator('.material-card')).toHaveCount(1)

  await page.getByRole('searchbox', { name: 'Search materials' }).fill('')
  await page.getByRole('combobox', { name: 'Filter materials' }).selectOption('unverified')
  await expect(page.getByRole('region', { name: 'Material registry' }).locator('.material-card')).toHaveCount(3)

  expect(scriptRequests.some((url) => url.includes('three-renderer') || url.includes('three.module.js'))).toBe(false)
  expect(scriptRequests.some((url) => url.includes('OrderCapture'))).toBe(false)
  expect(consoleErrors, `Material Lab console errors: ${consoleErrors.join('\n')}`).toEqual([])

  await page.getByRole('combobox', { name: 'Filter materials' }).selectOption('all')
  await expect(page.getByRole('region', { name: 'Material registry' }).locator('.material-card')).toHaveCount(7)

  const screenshotName = testInfo.project.name.includes('mobile')
    ? 'material-lab-mobile.png'
    : 'material-lab-desktop.png'

  await page.screenshot({
    path: `playwright-output/screenshots/${screenshotName}`,
    fullPage: true,
  })
})


test('Field Capture Assistant records a complete swatch session and exports manifests locally', async ({ page }, testInfo) => {
  const scriptRequests: string[] = []
  const consoleErrors: string[] = []

  page.on('request', (request) => {
    if (request.resourceType() === 'script') scriptRequests.push(request.url())
  })
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/capture.html')

  await expect(page.getByRole('heading', { name: 'Field Capture Assistant' })).toBeVisible()
  await page.getByLabel('Material ID *').fill('SCL-005')
  await page.getByLabel('Material label *').fill('Saddle Brown Full Grain')
  await page.getByLabel('Operator *').fill('Field Operator')
  await page.getByLabel('Material type').fill('Cowhide')
  await page.getByLabel('Hide').fill('Cowhide')
  await page.getByLabel('Grain', { exact: true }).fill('Full grain')
  await page.getByLabel('Finish').fill('Matte')
  await page.getByLabel('Thickness (mm)').fill('2.1')
  await page.getByLabel('Supplier', { exact: true }).fill('Test Supplier')
  await page.getByLabel('Color target').fill('ColorChecker')
  await page.getByLabel('Camera / phone').fill('Test Camera')

  const captureFrames = [
    ['Identification file', '00-identification.dng'],
    ['Cross-polarized file', '01-cross-polarized.dng'],
    ['Parallel / reflective file', '02-parallel.dng'],
    ['Directional north file', '03-north.dng'],
    ['Directional east file', '04-east.dng'],
    ['Directional south file', '05-south.dng'],
    ['Directional west file', '06-west.dng'],
    ['Macro grain file', '07-macro.dng'],
    ['Edge / thickness file', '08-edge.dng'],
  ] as const

  for (const [label, name] of captureFrames) {
    await page.getByLabel(label).setInputFiles({
      name,
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(`capture:${name}`),
    })
  }

  const progress = page.getByRole('region', { name: 'Capture progress' })
  await expect(progress).toContainText('9 / 9')
  await expect(progress).toContainText('Ready')

  await page.reload()
  await expect(progress).toContainText('9 / 9')
  await expect(page.getByLabel('Material ID *')).toHaveValue('SCL-005')
  await expect(page.getByText('01-cross-polarized.dng')).toBeVisible()

  const [manifestDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download capture manifest' }).click(),
  ])
  const manifestPath = await manifestDownload.path()
  expect(manifestPath).not.toBeNull()
  const manifest = JSON.parse(await fs.readFile(manifestPath!, 'utf8')) as {
    materialId: string
    capture: { crossPolarized: boolean; directionalLighting: boolean; scaleReference: boolean }
    frames: Record<string, { file: string }>
  }
  expect(manifest.materialId).toBe('SCL-005')
  expect(manifest.capture).toMatchObject({
    crossPolarized: true,
    directionalLighting: true,
    scaleReference: true,
  })
  expect(manifest.frames.crossPolarized.file).toBe('01-cross-polarized.dng')
  expect(manifest.frames.edge.file).toBe('08-edge.dng')

  const [registryDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download registry draft' }).click(),
  ])
  const registryPath = await registryDownload.path()
  expect(registryPath).not.toBeNull()
  const registry = JSON.parse(await fs.readFile(registryPath!, 'utf8')) as {
    id: string
    lifecycle: string
    physical?: { thicknessMm?: number }
    provenance?: { source?: string; crossPolarized?: boolean; directionalLighting?: boolean }
    reviewRequired?: string[]
  }
  expect(registry.id).toBe('SCL-005')
  expect(registry.lifecycle).toBe('captured-master')
  expect(registry.physical?.thicknessMm).toBe(2.1)
  expect(registry.provenance).toMatchObject({
    source: 'field-capture',
    crossPolarized: true,
    directionalLighting: true,
  })
  expect(registry.reviewRequired?.length).toBeGreaterThan(0)

  expect(scriptRequests.some((url) => url.includes('three-renderer') || url.includes('three.module.js'))).toBe(false)
  expect(scriptRequests.some((url) => url.includes('OrderCapture'))).toBe(false)
  expect(consoleErrors, `Field Capture console errors: ${consoleErrors.join('\n')}`).toEqual([])

  const screenshotName = testInfo.project.name.includes('mobile')
    ? 'field-capture-mobile.png'
    : 'field-capture-desktop.png'

  await page.screenshot({
    path: `playwright-output/screenshots/${screenshotName}`,
    fullPage: true,
  })
})


test('Material Processor generates local draft PBR maps without storefront runtime', async ({ page }, testInfo) => {
  const scriptRequests: string[] = []
  const consoleErrors: string[] = []

  page.on('request', (request) => {
    if (request.resourceType() === 'script') scriptRequests.push(request.url())
  })
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/process.html')
  await expect(page.getByRole('heading', { name: 'Material Processor' })).toBeVisible()

  const captureManifest = {
    schemaVersion: 1,
    captureSessionId: 'SC-TEST-001',
    client: 'Scorpion Western Wear',
    materialId: 'SCL-TEST',
    label: 'Test Leather',
    frames: {
      crossPolarized: { file: '01-cross.png' },
      parallel: { file: '02-parallel.png' },
      north: { file: '03-north.png' },
      east: { file: '04-east.png' },
      south: { file: '05-south.png' },
      west: { file: '06-west.png' },
    },
  }

  await page.getByLabel('Capture manifest file').setInputFiles({
    name: 'SC-TEST-capture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(captureManifest)),
  })

  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Test canvas unavailable')
    context.fillStyle = '#808080'
    context.fillRect(0, 0, 2, 2)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const png = Buffer.from(pngBase64, 'base64')

  const workingInputs = [
    'Cross-polarized working image',
    'Parallel / reflective working image',
    'Directional north working image',
    'Directional east working image',
    'Directional south working image',
    'Directional west working image',
  ]

  for (const label of workingInputs) {
    await page.getByLabel(label).setInputFiles({
      name: label.toLowerCase().replaceAll(/[^a-z]+/gu, '-') + '.png',
      mimeType: 'image/png',
      buffer: png,
    })
  }

  const processButton = page.getByRole('button', { name: 'Generate draft PBR maps' })
  await expect(processButton).toBeEnabled()
  await processButton.click()

  await expect(page.locator('.processor-status')).toContainText('Draft PBR maps generated', { timeout: 15_000 })
  await expect(page.getByRole('img', { name: 'Base color preview' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Roughness proxy preview' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Normal draft preview' })).toBeVisible()

  const [processingDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download processing manifest' }).click(),
  ])
  const processingPath = await processingDownload.path()
  expect(processingPath).not.toBeNull()
  const processing = JSON.parse(await fs.readFile(processingPath!, 'utf8')) as {
    materialId: string
    status: string
    processor: { resolution: number; normal: { method: string }; roughness: { method: string } }
    reviewRequired: string[]
  }

  expect(processing.materialId).toBe('SCL-TEST')
  expect(processing.status).toBe('draft-pbr-review-required')
  expect(processing.processor.resolution).toBe(1024)
  expect(processing.processor.normal.method).toBe('four-direction-difference-normal')
  expect(processing.processor.roughness.method).toBe('normalized-reflectance-proxy')
  expect(processing.reviewRequired.length).toBeGreaterThan(3)

  expect(scriptRequests.some((url) => url.includes('three-renderer') || url.includes('three.module.js'))).toBe(false)
  expect(scriptRequests.some((url) => url.includes('OrderCapture'))).toBe(false)
  expect(consoleErrors, `Material Processor console errors: ${consoleErrors.join('\n')}`).toEqual([])

  const screenshotName = testInfo.project.name.includes('mobile')
    ? 'material-processor-mobile.png'
    : 'material-processor-desktop.png'

  await page.screenshot({
    path: `playwright-output/screenshots/${screenshotName}`,
    fullPage: true,
  })
})


test('Material QA renders processed maps and exports an explicit approval packet', async ({ page }, testInfo) => {
  const scriptRequests: string[] = []
  const consoleErrors: string[] = []

  page.on('request', (request) => {
    if (request.resourceType() === 'script') scriptRequests.push(request.url())
  })
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/material-qa.html')
  await expect(page.getByRole('heading', { name: 'Material QA' })).toBeVisible()
  expect(scriptRequests.some((url) => url.includes('MaterialQaViewer'))).toBe(false)

  const processingManifest = {
    schemaVersion: 1,
    materialId: 'SCL-TEST',
    label: 'Test Leather',
    captureSessionId: 'SC-TEST-001',
    processor: { resolution: 1024 },
    outputs: {
      baseColor: 'SCL-TEST-1k-basecolor.png',
      roughness: 'SCL-TEST-1k-roughness.png',
      normal: 'SCL-TEST-1k-normal.png',
    },
  }

  await page.getByLabel('Processing manifest file').setInputFiles({
    name: 'SCL-TEST-processing.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(processingManifest)),
  })

  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 4
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Test canvas unavailable')
    context.fillStyle = '#8A4E2B'
    context.fillRect(0, 0, 4, 4)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const png = Buffer.from(pngBase64, 'base64')

  for (const label of ['Base color map file', 'Roughness map file', 'Normal map file']) {
    await page.getByLabel(label).setInputFiles({
      name: label.toLowerCase().replaceAll(/[^a-z]+/gu, '-') + '.png',
      mimeType: 'image/png',
      buffer: png,
    })
  }

  await page.getByRole('heading', { name: 'Controlled 3D inspection' }).scrollIntoViewIfNeeded()
  await expect(page.getByLabel('3D material QA viewer').locator('canvas')).toBeVisible()
  await expect.poll(() => scriptRequests.some((url) => url.includes('MaterialQaViewer'))).toBe(true)
  await expect(page.getByText('3 / 3')).toBeVisible()

  await page.getByLabel('Lighting').selectOption('raking-left')
  await page.getByLabel('Test shape').selectOption('cylinder')
  await page.getByLabel('Reviewer *').fill('QA Reviewer')

  const checks = page.locator('.qa-check input[type="checkbox"]')
  await expect(checks).toHaveCount(6)
  for (let index = 0; index < 6; index += 1) {
    await checks.nth(index).check()
  }

  await expect(page.getByText('Eligible for registry promotion')).toBeVisible()

  const [approvalDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export QA approval packet' }).click(),
  ])
  const approvalPath = await approvalDownload.path()
  expect(approvalPath).not.toBeNull()

  const approval = JSON.parse(await fs.readFile(approvalPath!, 'utf8')) as {
    materialId: string
    decision: string
    automaticRegistryMutation: boolean
    reviewer: string
    maps: Record<string, { width: number; height: number }>
  }

  expect(approval.materialId).toBe('SCL-TEST')
  expect(approval.decision).toBe('approved-for-registry-promotion')
  expect(approval.automaticRegistryMutation).toBe(false)
  expect(approval.reviewer).toBe('QA Reviewer')
  expect(approval.maps.baseColor).toMatchObject({ width: 4, height: 4 })

  expect(scriptRequests.some((url) => url.includes('OrderCapture'))).toBe(false)
  expect(consoleErrors, `Material QA console errors: ${consoleErrors.join('\n')}`).toEqual([])

  const screenshotName = testInfo.project.name.includes('mobile')
    ? 'material-qa-mobile.png'
    : 'material-qa-desktop.png'

  await page.screenshot({
    path: `playwright-output/screenshots/${screenshotName}`,
    fullPage: true,
  })
})

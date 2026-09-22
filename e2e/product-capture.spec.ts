import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'

test.beforeAll(async () => {
  await fs.mkdir('playwright-output/screenshots', { recursive: true })
})

test('Product Capture gates reconstruction on physical evidence and exports a construction packet', async ({ page }, testInfo) => {
  const scriptRequests: string[] = []
  const consoleErrors: string[] = []

  page.on('request', (request) => {
    if (request.resourceType() === 'script') scriptRequests.push(request.url())
  })
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/product-capture.html')
  await expect(page.getByRole('heading', { name: 'Product Capture' })).toBeVisible()

  await page.getByLabel('Product ID').fill('SC-WH-001')
  await page.getByLabel('Capture operator').fill('QA Capture Operator')

  const dimensionLabels = [
    'Maximum width millimeters',
    'Maximum height millimeters',
    'Maximum depth millimeters',
    'Visor frame width millimeters',
    'Visor frame height millimeters',
    'Visor frame depth millimeters',
    'Lens opening width millimeters',
    'Lens opening height millimeters',
    'Rear / neck guard width millimeters',
    'Rear / neck guard length millimeters',
    'Strap width millimeters',
    'Leather thickness millimeters',
    'Rivet diameter millimeters',
    'Key hardware spacing millimeters',
  ]

  for (const label of dimensionLabels) {
    await page.getByLabel(label).fill('100')
  }

  const requiredReferences = [
    'Straight front',
    'Front-left 45°',
    'Left side',
    'Rear-left 45°',
    'Straight rear',
    'Rear-right 45°',
    'Right side',
    'Front-right 45°',
    'High front',
    'High rear',
    'Low front',
    'Low rear',
    'Visor fully closed',
    'Visor fully open',
    'Left hinge close-up',
    'Right hinge close-up',
    'Interior',
    'Scale / ruler reference',
  ]

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
  for (const label of requiredReferences) {
    await page.getByLabel(label + ' reference file').setInputFiles({
      name: label.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.jpg',
      mimeType: 'image/jpeg',
      buffer: jpeg,
    })
  }

  for (const label of ['Product root', 'Main leather shell', 'Visor pivot', 'Visor frame', 'Visor lens']) {
    await page.getByLabel('Confirm ' + label).check()
  }

  await expect(page.getByText('Capture gate passed')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download construction packet' })).toBeEnabled()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download construction packet' }).click(),
  ])

  const path = await download.path()
  expect(path).not.toBeNull()
  const packet = JSON.parse(await fs.readFile(path!, 'utf8')) as {
    productId: string
    sourceCaptureSessionId: string
    status: string
    automaticAssetMutation: boolean
    dimensionsMm: Record<string, number>
    referenceCoverage: Array<{ key: string }>
    constructionNodes: Array<{ status: string }>
  }

  expect(packet.productId).toBe('SC-WH-001')
  expect(packet.sourceCaptureSessionId).toMatch(/^SC-PROD-/)
  expect(packet.status).toBe('ready-for-digital-twin-reconstruction')
  expect(packet.automaticAssetMutation).toBe(false)
  expect(packet.dimensionsMm.maxWidth).toBe(100)
  expect(packet.referenceCoverage).toHaveLength(18)
  expect(packet.constructionNodes.every((node) => node.status === 'confirmed')).toBe(true)

  expect(scriptRequests.some((url) => url.includes('three-renderer') || url.includes('three.module.js'))).toBe(false)
  expect(scriptRequests.some((url) => url.includes('OrderCapture'))).toBe(false)
  expect(consoleErrors, 'Product Capture console errors: ' + consoleErrors.join('\n')).toEqual([])

  const screenshotName = testInfo.project.name.includes('mobile')
    ? 'product-capture-mobile.png'
    : 'product-capture-desktop.png'

  await page.screenshot({
    path: 'playwright-output/screenshots/' + screenshotName,
    fullPage: true,
  })
})

import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'

test.beforeAll(async () => {
  await fs.mkdir('playwright-output/screenshots', { recursive: true })
})

test('V0.43 Product Capture gates the first physical welding-hood pilot and exports capture authority', async ({ page }, testInfo) => {
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
  const pilot = page.getByRole('region', { name: 'First welding hood production pilot' })
  await expect(pilot).toBeVisible()
  await expect(pilot.getByText(/development placeholder/)).toBeVisible()
  await page.getByLabel('Confirm one exact physical production unit').check()

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
    await page.getByRole('checkbox', { name: 'Confirm ' + label, exact: true }).check()
  }

  const materialSlots = [
    ['Primary leather surface', 'SCL-TEST'],
    ['Primary visor hardware', 'SCH-TEST'],
    ['Visor lens', 'SGL-TEST'],
  ] as const
  for (const [label, materialId] of materialSlots) {
    await page.getByLabel(label + ' material registry ID').fill(materialId)
    await page.getByLabel('Confirm ' + label + ' material slot').check()
  }

  await expect(page.getByRole('heading', { name: '3D authoring contract' })).toBeVisible()
  await expect(page.getByText('1 UV unit = 1 meter on material-ready surfaces')).toBeVisible()
  await expect(page.getByText('Front shell customization area')).toBeVisible()
  await expect(page.getByText(/220 × 240 mm/)).toBeVisible()

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
    materialSlots: Array<{ slotId: string; status: string }>
    provenance: { singlePhysicalUnitConfirmed?: true }
  }

  expect(packet.productId).toBe('SC-WH-001')
  expect(packet.sourceCaptureSessionId).toMatch(/^SC-PROD-/)
  expect(packet.status).toBe('ready-for-digital-twin-reconstruction')
  expect(packet.automaticAssetMutation).toBe(false)
  expect(packet.provenance.singlePhysicalUnitConfirmed).toBe(true)
  expect(packet.dimensionsMm.maxWidth).toBe(100)
  expect(packet.referenceCoverage).toHaveLength(18)
  expect(packet.constructionNodes.every((node) => node.status === 'confirmed')).toBe(true)
  expect(packet.materialSlots).toHaveLength(3)
  expect(packet.materialSlots.every((slot) => slot.status === 'confirmed')).toBe(true)

  const [manifestDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download 3D manifest scaffold' }).click(),
  ])
  const manifestPath = await manifestDownload.path()
  expect(manifestPath).not.toBeNull()
  const manifest = JSON.parse(await fs.readFile(manifestPath!, 'utf8')) as {
    rootNode: string
    assetAuthority: {
      lifecycle: string
      source: string
      sourceCaptureSessionId?: string
      capturePlanId?: string
    }
    materialSlotProfiles: Record<string, { kind: string; requiresUv0: boolean; metersPerUvUnit?: number }>
    customizationZones: Record<string, { node: string; purposes: string[]; sizeMeters: [number, number] }>
    presentation: { orbit: { minDistance: number; maxDistance: number } }
  }
  expect(manifest.rootNode).toBe('SLS_ProductRoot')
  expect(manifest.assetAuthority).toMatchObject({
    lifecycle: 'production-candidate',
    source: 'physical-capture',
    sourceCaptureSessionId: packet.sourceCaptureSessionId,
    capturePlanId: 'scorpion-welding-hood-v1',
  })
  expect(manifest.materialSlotProfiles.LeatherPrimary).toMatchObject({ kind: 'leather', requiresUv0: true, metersPerUvUnit: 1 })
  expect(manifest.customizationZones['front-panel']).toMatchObject({
    node: 'Shell_Main',
    purposes: ['tooling', 'text', 'logo', 'artwork'],
    sizeMeters: [0.22, 0.24],
  })
  expect(manifest.presentation.orbit.maxDistance).toBeGreaterThan(manifest.presentation.orbit.minDistance)

  expect(scriptRequests.some((url) => url.includes('three-renderer') || url.includes('three.module.js'))).toBe(false)
  expect(scriptRequests.some((url) => url.includes('OrderCapture'))).toBe(false)
  expect(consoleErrors, 'Product Capture console errors: ' + consoleErrors.join('\n')).toEqual([])

  await expect(pilot.getByText('Capture package ready')).toBeVisible()

  const screenshotName = testInfo.project.name.includes('mobile')
    ? 'product-capture-v043-mobile.png'
    : 'product-capture-v043-desktop.png'

  await page.screenshot({
    path: 'playwright-output/screenshots/' + screenshotName,
    fullPage: true,
  })
})

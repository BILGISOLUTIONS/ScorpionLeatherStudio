import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'

test.beforeAll(async () => {
  await fs.mkdir('playwright-output/screenshots', { recursive: true })
})

test('V0.46 Product Capture preflights source quality, duplicates and integrity', async ({ page }, testInfo) => {
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
  expect(scriptRequests.some((url) => url.includes('capture-bundle'))).toBe(false)

  await page.getByLabel('Product ID').fill('SC-WH-001')
  await page.getByLabel('Capture operator').fill('QA Capture Operator')
  const pilot = page.getByRole('region', { name: 'First welding hood production pilot' })
  await expect(pilot).toBeVisible()
  await expect(pilot.getByText('The current customer Studio hood remains a development placeholder until a physical-capture candidate passes the complete reconstruction and QA chain.')).toBeVisible()
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

  const requiredBuffer = (index: number) => Buffer.from([0xff, 0xd8, 0x20 + index, 0xff, 0xd9])
  const supplementalA = Buffer.from([0xff, 0xd8, 0xa1, 0xff, 0xd9])
  const supplementalB = Buffer.from([0xff, 0xd8, 0xa2, 0xff, 0xd9])
  for (const [index, label] of requiredReferences.entries()) {
    await page.getByLabel(label + ' reference file').setInputFiles({
      name: label.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.jpg',
      mimeType: 'image/jpeg',
      buffer: requiredBuffer(index),
    })
  }

  await page.getByLabel('Supplemental reconstruction photos').setInputFiles([
    { name: 'supplemental-a.jpg', mimeType: 'image/jpeg', buffer: supplementalA },
    { name: 'supplemental-b.jpg', mimeType: 'image/jpeg', buffer: supplementalB },
  ])
  await expect(page.getByText(/2 supplemental metadata files/)).toBeVisible()

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

  const quality = page.getByRole('region', { name: 'Capture quality preflight' })
  await expect(quality).toBeVisible()
  await expect(quality.getByText('No objective quality blockers')).toBeVisible()

  await page.getByLabel('Straight rear reference file').setInputFiles({
    name: 'straight-rear-duplicate.jpg',
    mimeType: 'image/jpeg',
    buffer: requiredBuffer(0),
  })
  await expect(quality.getByText(/1 blocker must be resolved/)).toBeVisible()
  await expect(quality.getByText(/Exact duplicate source image is assigned more than once/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download verified field evidence bundle (.zip)' })).toBeDisabled()

  await page.getByLabel('Straight rear reference file').setInputFiles({
    name: 'straight-rear.jpg',
    mimeType: 'image/jpeg',
    buffer: requiredBuffer(4),
  })
  await expect(quality.getByText('No objective quality blockers')).toBeVisible()

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
    referenceCoverage: Array<{ key: string; sha256?: string }>
    constructionNodes: Array<{ status: string }>
    materialSlots: Array<{ slotId: string; status: string }>
    provenance: { singlePhysicalUnitConfirmed?: true }
    supplementalReferenceCoverage?: Array<{ name: string; size: number; type: string; sha256?: string }>
  }

  expect(packet.productId).toBe('SC-WH-001')
  expect(packet.sourceCaptureSessionId).toMatch(/^SC-PROD-/)
  expect(packet.status).toBe('ready-for-digital-twin-reconstruction')
  expect(packet.automaticAssetMutation).toBe(false)
  expect(packet.provenance.singlePhysicalUnitConfirmed).toBe(true)
  expect(packet.dimensionsMm.maxWidth).toBe(100)
  expect(packet.referenceCoverage).toHaveLength(18)
  expect(packet.referenceCoverage.every((entry) => /^[a-f0-9]{64}$/u.test(entry.sha256 ?? ''))).toBe(true)
  expect(packet.supplementalReferenceCoverage).toHaveLength(2)
  expect(packet.supplementalReferenceCoverage?.every((entry) => /^[a-f0-9]{64}$/u.test(entry.sha256 ?? ''))).toBe(true)
  expect(packet.supplementalReferenceCoverage?.map((entry) => entry.name)).toEqual([
    'supplemental-a.jpg',
    'supplemental-b.jpg',
  ])
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

  await expect(pilot.getByText('Field evidence bundle ready')).toBeVisible()
  const bundleButton = page.getByRole('button', { name: 'Download verified field evidence bundle (.zip)' })
  await expect(bundleButton).toBeEnabled()
  expect(scriptRequests.some((url) => url.includes('capture-bundle'))).toBe(false)

  const [bundleDownload] = await Promise.all([
    page.waitForEvent('download'),
    bundleButton.click(),
  ])
  expect(bundleDownload.suggestedFilename()).toMatch(/^SC-WH-001-SC-PROD-.*-field-evidence\.zip$/u)
  const bundlePath = await bundleDownload.path()
  expect(bundlePath).not.toBeNull()
  const bundleBytes = await fs.readFile(bundlePath!)
  expect([...bundleBytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
  const bundleText = bundleBytes.toString('utf8')
  expect(bundleText).toContain('metadata/capture-bundle-index.json')
  expect(bundleText).toContain('metadata/construction-packet.json')
  expect(bundleText).toContain('references/01-front.jpg')
  expect(bundleText).toContain('supplemental/001-supplemental-a.jpg')
  expect(bundleText).toContain('\"bundleType\": \"sls-product-capture-evidence\"')
  expect(bundleText).toContain('\"qualityPreflight\"')
  expect(bundleText).toContain('\"duplicateGroups\": 0')
  expect(bundleText).toContain('SHA256SUMS.txt')
  expect(bundleText).toMatch(/[a-f0-9]{64}  references\/01-front\.jpg/u)
  expect(bundleText).toMatch(/"sha256": "[a-f0-9]{64}"/u)
  await expect.poll(() => scriptRequests.some((url) => url.includes('capture-bundle'))).toBe(true)

  const screenshotName = testInfo.project.name.includes('mobile')
    ? 'product-capture-v046-mobile.png'
    : 'product-capture-v046-desktop.png'

  await page.screenshot({
    path: 'playwright-output/screenshots/' + screenshotName,
    fullPage: true,
  })

  await page.reload()
  await expect(page.getByText(/metadata only — reattach source/).first()).toBeVisible()
  await expect(page.getByText(/Source bytes are not attached in this browser session/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download verified field evidence bundle (.zip)' })).toBeDisabled()

  await page.getByLabel('Straight front reference file').setInputFiles({
    name: 'straight-front.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0x99, 0xff, 0xd9]),
  })
  await expect(page.getByRole('status')).toContainText('does not match the original SHA-256 fingerprint')
  await expect(page.getByText(/metadata only — reattach source/).first()).toBeVisible()

  for (const [index, label] of requiredReferences.entries()) {
    await page.getByLabel(label + ' reference file').setInputFiles({
      name: label.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.jpg',
      mimeType: 'image/jpeg',
      buffer: requiredBuffer(index),
    })
  }
  await page.getByLabel('Supplemental reconstruction photos').setInputFiles([
    { name: 'supplemental-b.jpg', mimeType: 'image/jpeg', buffer: supplementalB },
    { name: 'supplemental-a.jpg', mimeType: 'image/jpeg', buffer: supplementalA },
  ])

  await expect(pilot.getByText('Field evidence bundle ready')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download verified field evidence bundle (.zip)' })).toBeEnabled()
  await expect(page.getByRole('status')).toContainText('Supplemental evidence set reattached and SHA-256 verified')

  expect(consoleErrors, 'Product Capture console errors: ' + consoleErrors.join('\n')).toEqual([])
})

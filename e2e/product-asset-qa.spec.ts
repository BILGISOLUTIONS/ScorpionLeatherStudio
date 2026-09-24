import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'

test.beforeAll(async () => {
  await fs.mkdir('playwright-output/screenshots', { recursive: true })
})

test('Digital Twin QA keeps Three.js deferred and inspects a local product asset', async ({ page }, testInfo) => {
  const scriptRequests: string[] = []
  const consoleErrors: string[] = []

  page.on('request', (request) => {
    if (request.resourceType() === 'script') scriptRequests.push(request.url())
  })
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/product-asset-qa.html')
  await expect(page.getByRole('heading', { name: 'Digital Twin QA' })).toBeVisible()
  expect(scriptRequests.some((url) => url.includes('ProductAssetQaViewer'))).toBe(false)

  const construction = {
    schemaVersion: 1,
    productId: 'SC-WH-001',
    productLabel: 'Scorpion Leather Welding Hood',
    productCategory: 'Leather Welding Hood',
    sourceCaptureSessionId: 'SC-PROD-20260924-TEST',
    capturePlanId: 'scorpion-welding-hood-v1',
    generatedAt: '2026-09-24T06:00:00.000Z',
    status: 'ready-for-digital-twin-reconstruction',
    automaticAssetMutation: false,
    provenance: { operator: 'Browser QA', capturedAt: '2026-09-24T05:00:00.000Z' },
    referenceCoverage: [],
    dimensionsMm: {
      maxWidth: 360,
      maxHeight: 670,
      maxDepth: 325,
    },
    constructionNodes: [
      { role: 'product-root', label: 'Product root', nodeName: 'SLS_ProductRoot', status: 'confirmed' },
      { role: 'shell-main', label: 'Main shell', nodeName: 'Shell_Main', status: 'confirmed' },
      { role: 'visor-pivot', label: 'Visor pivot', nodeName: 'Visor_Pivot', status: 'confirmed' },
      { role: 'visor-frame', label: 'Visor frame', nodeName: 'Visor_Frame', status: 'confirmed' },
      { role: 'visor-lens', label: 'Visor lens', nodeName: 'Visor_Lens', status: 'confirmed' },
    ],
    components: [],
    materialSlots: [],
  }

  const manifest = JSON.parse(
    await fs.readFile('apps/configurator/public/models/placeholder-welding-hood.manifest.json', 'utf8'),
  )

  await page.getByLabel('Construction packet JSON').setInputFiles({
    name: 'SC-WH-001-construction-packet.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(construction)),
  })
  await page.getByLabel('Asset manifest JSON').setInputFiles({
    name: 'placeholder-welding-hood.manifest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(manifest)),
  })

  expect(scriptRequests.some((url) => url.includes('ProductAssetQaViewer'))).toBe(false)

  await page.getByLabel('Candidate 3D model').setInputFiles(
    'apps/configurator/public/models/placeholder-welding-hood.gltf',
  )

  await expect(page.getByLabel('Digital twin QA viewer').locator('canvas')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Automated asset metrics' })).toBeVisible()
  await expect(page.getByText(/production blocker/)).toBeVisible()
  await expect(page.getByText('Production assets must be delivered as GLB.')).toBeVisible()
  await expect(page.getByText(/not production-approved/).first()).toBeVisible()

  await expect.poll(() => scriptRequests.some((url) => url.includes('ProductAssetQaViewer'))).toBe(true)

  const screenshotName = testInfo.project.name.includes('mobile')
    ? 'product-asset-qa-mobile.png'
    : 'product-asset-qa-desktop.png'

  await page.screenshot({
    path: 'playwright-output/screenshots/' + screenshotName,
    fullPage: true,
  })

  expect(consoleErrors, 'Digital Twin QA console errors: ' + consoleErrors.join('\n')).toEqual([])
})

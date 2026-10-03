import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'

test.beforeAll(async () => {
  await fs.mkdir('playwright-output/screenshots', { recursive: true })
})

test('V0.42 Digital Twin QA links preparation provenance and keeps Three.js deferred', async ({ page }, testInfo) => {
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
    materialSlots: [
      { slotId: 'LeatherPrimary', label: 'Primary leather surface', materialId: 'SCL-COGNAC', nodeNames: ['Shell_Main'], status: 'confirmed', evidenceFrameKeys: [] },
      { slotId: 'HardwarePrimary', label: 'Primary visor hardware', materialId: 'SCH-002', nodeNames: ['Visor_Frame'], status: 'confirmed', evidenceFrameKeys: [] },
      { slotId: 'Lens', label: 'Visor lens', materialId: 'SGL-001', nodeNames: ['Visor_Lens'], status: 'confirmed', evidenceFrameKeys: [] },
    ],
  }

  const manifest = JSON.parse(
    await fs.readFile('apps/configurator/public/models/placeholder-welding-hood.manifest.json', 'utf8'),
  )
  const modelPath = 'apps/configurator/public/models/placeholder-welding-hood.gltf'
  const modelStat = await fs.stat(modelPath)
  const preparation = {
    schemaVersion: 1,
    stage: 'raw-reconstruction-preparation',
    candidateId: 'SLS-CAND-20261003-E2E42',
    jobId: 'SLS-RECON-20261003-E2E42',
    assetId: manifest.assetId,
    productId: construction.productId,
    sourceCaptureSessionId: construction.sourceCaptureSessionId,
    sourceModelFile: 'provider-raw.glb',
    normalizedModelFile: 'placeholder-welding-hood.gltf',
    productionApproved: false,
    requiresDigitalTwinQa: true,
    status: 'manual-authoring-required',
    authority: {
      uniformScaleOnly: true,
      nonUniformGeometryCorrectionApplied: false,
      realProductRemainsGeometryAuthority: true,
      providerMaterialsRemainReferenceOnly: true,
    },
    physicalEnvelope: {
      targetMeters: { width: 0.36, height: 0.67, depth: 0.325 },
      beforeMeters: { width: 0.34, height: 0.63, depth: 0.31 },
      afterMeters: { width: 0.36, height: 0.667, depth: 0.328 },
      uniformScale: 1.06,
      deviationRatios: { width: 0, height: 0.0045, depth: 0.0092 },
      toleranceRatio: 0.08,
    },
    geometry: {
      trianglesBefore: 98000,
      trianglesAfter: 82000,
      targetTriangles: 150000,
      meshCount: 5,
    },
    blockers: [],
    authoringRequirements: [
      { code: 'semantic_authoring_required', message: 'Semantic authoring completed before final QA.' },
    ],
    warnings: [],
    outputBytes: modelStat.size,
  }

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

  await page.getByLabel('Reconstruction preparation report JSON').setInputFiles({
    name: 'placeholder-welding-hood.prep.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(preparation)),
  })
  const prepRegion = page.getByRole('region', { name: 'Reconstruction preparation provenance' })
  await expect(prepRegion).toBeVisible()
  await expect(prepRegion.getByText('SLS-CAND-20261003-E2E42')).toBeVisible()
  await expect(prepRegion.getByText('manual authoring required')).toBeVisible()

  await page.getByLabel('Candidate 3D model').setInputFiles(modelPath)

  await expect(page.getByLabel('Digital twin QA viewer').locator('canvas')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Automated asset metrics' })).toBeVisible()
  await expect(page.getByText(/production blocker/)).toBeVisible()
  await expect(page.getByText('Production assets must be delivered as GLB.')).toBeVisible()
  await expect(page.getByText(/not production-approved/).first()).toBeVisible()
  await expect(page.getByText('UV0-ready meshes')).toBeVisible()
  await page.getByRole('button', { name: 'UV checker' }).click()
  await expect(page.getByRole('button', { name: 'UV checker' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Normals' }).click()
  await expect(page.getByRole('button', { name: 'Normals' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Placement zones' }).click()
  await expect(page.getByRole('button', { name: 'Placement zones' })).toHaveAttribute('aria-pressed', 'true')
  const metrics = page.getByRole('region', { name: 'Automated asset metrics' })
  await expect(metrics.getByText('Physical UV scale')).toBeVisible()
  await expect(metrics.getByText('Placement zones')).toBeVisible()

  await expect.poll(() => scriptRequests.some((url) => url.includes('ProductAssetQaViewer'))).toBe(true)

  const screenshotName = testInfo.project.name.includes('mobile')
    ? 'product-asset-qa-v042-mobile.png'
    : 'product-asset-qa-v042-desktop.png'

  await page.screenshot({
    path: 'playwright-output/screenshots/' + screenshotName,
    fullPage: true,
  })

  expect(consoleErrors, 'Digital Twin QA console errors: ' + consoleErrors.join('\n')).toEqual([])
})

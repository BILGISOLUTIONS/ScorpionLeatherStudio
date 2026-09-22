import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'

test.beforeAll(async () => {
  await fs.mkdir('playwright-output/screenshots', { recursive: true })
})

test('Material Promotion verifies provenance and emits a production material package', async ({ page }, testInfo) => {
  const scriptRequests: string[] = []
  const consoleErrors: string[] = []

  page.on('request', (request) => {
    if (request.resourceType() === 'script') scriptRequests.push(request.url())
  })
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/promote.html')
  await expect(page.getByRole('heading', { name: 'Material Promotion' })).toBeVisible()

  const capturedMaster = {
    schemaVersion: 1,
    id: 'SCL-005',
    label: 'Saddle Brown Full Grain',
    kind: 'leather',
    lifecycle: 'captured-master',
    availability: 'confirmed',
    previewColor: '#805030',
    physical: {
      materialType: 'Cowhide',
      hide: 'Cowhide',
      grain: 'Full grain',
      finish: 'Matte',
      thicknessMm: 2.1,
    },
    provenance: {
      source: 'field-capture',
      captureSessionId: 'SC-CAP-005',
      capturedAt: '2026-09-22T10:00:00.000Z',
      operator: 'Capture Operator',
      crossPolarized: true,
      directionalLighting: true,
      scaleReference: true,
    },
    renderer: {
      roughness: 0.8,
      metalness: 0,
      sheen: 0.14,
      sheenRoughness: 0.76,
    },
  }

  const processing = {
    schemaVersion: 1,
    materialId: 'SCL-005',
    label: 'Saddle Brown Full Grain',
    captureSessionId: 'SC-CAP-005',
    sourceCaptureManifest: 'SC-CAP-005-SCL-005-capture.json',
    processedAt: '2026-09-22T10:20:00.000Z',
    status: 'draft-pbr-review-required',
    derivedPreviewColor: '#8A4E2B',
    processor: {
      resolution: 1024,
      baseColor: { source: '01-cross.png' },
      roughness: {
        baseRoughness: 0.78,
        responseGain: 1.35,
        method: 'normalized-reflectance-proxy',
      },
      normal: {
        strength: 2.2,
        method: 'four-direction-difference-normal',
      },
    },
    outputs: {
      baseColor: 'SCL-005-1k-basecolor.png',
      roughness: 'SCL-005-1k-roughness.png',
      normal: 'SCL-005-1k-normal.png',
    },
  }

  const qa = {
    schemaVersion: 1,
    materialId: 'SCL-005',
    label: 'Saddle Brown Full Grain',
    captureSessionId: 'SC-CAP-005',
    sourceProcessingManifest: 'SCL-005-processing.json',
    reviewedAt: '2026-09-22T10:30:00.000Z',
    reviewer: 'QA Reviewer',
    decision: 'approved-for-registry-promotion',
    automaticRegistryMutation: false,
    maps: {
      baseColor: { file: 'SCL-005-1k-basecolor.png', width: 1024, height: 1024 },
      roughness: { file: 'SCL-005-1k-roughness.png', width: 1024, height: 1024 },
      normal: { file: 'SCL-005-1k-normal.png', width: 1024, height: 1024 },
    },
    viewer: {
      repeat: 2.5,
      normalScale: 0.9,
      roughnessScalar: 0.82,
    },
    checks: {
      colorMatch: true,
      seamFree: true,
      scaleCorrect: true,
      normalCorrect: true,
      roughnessMatch: true,
      performanceAcceptable: true,
    },
    notes: 'Physical comparison passed.',
  }

  await page.getByLabel('Captured-master draft file').setInputFiles({
    name: 'SCL-005-registry-draft.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(capturedMaster)),
  })
  await page.getByLabel('Processing manifest file').setInputFiles({
    name: 'SCL-005-processing.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(processing)),
  })
  await page.getByLabel('QA approval packet file').setInputFiles({
    name: 'SCL-005-qa-approval.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(qa)),
  })

  await expect(page.getByText('Provenance chain verified')).toBeVisible()

  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Test canvas unavailable')
    context.fillStyle = '#8A4E2B'
    context.fillRect(0, 0, 1024, 1024)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const png = Buffer.from(pngBase64, 'base64')

  const files = [
    ['1K Base color production file', 'source-basecolor.png'],
    ['1K Normal production file', 'source-normal.png'],
    ['1K Roughness production file', 'source-roughness.png'],
  ] as const

  for (const [label, name] of files) {
    await page.getByLabel(label).setInputFiles({
      name,
      mimeType: 'image/png',
      buffer: png,
    })
  }

  await expect(page.getByText('production-approved', { exact: true })).toBeVisible()
  await expect(page.getByText('/materials/SCL-005', { exact: true })).toBeVisible()
  await expect(page.getByText('QA Reviewer', { exact: true })).toBeVisible()

  const [definitionDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download production definition' }).click(),
  ])
  const definitionPath = await definitionDownload.path()
  expect(definitionPath).not.toBeNull()
  const definition = JSON.parse(await fs.readFile(definitionPath!, 'utf8')) as {
    id: string
    lifecycle: string
    previewColor: string
    approval?: { reviewer?: string; sourceQaPacket?: string }
    renderer: { roughness: number; normalScale?: number; textureRepeat?: number[] }
    textureTiers?: Array<{ maxEdge: number; textures: Record<string, string> }>
  }

  expect(definition).toMatchObject({
    id: 'SCL-005',
    lifecycle: 'production-approved',
    previewColor: '#8A4E2B',
    approval: {
      reviewer: 'QA Reviewer',
      sourceQaPacket: 'SCL-005-qa-approval.json',
    },
    renderer: {
      roughness: 0.82,
      normalScale: 0.9,
      textureRepeat: [2.5, 2.5],
    },
  })
  expect(definition.textureTiers).toHaveLength(1)
  expect(definition.textureTiers?.[0]).toMatchObject({
    maxEdge: 1024,
    textures: {
      baseColor: '/materials/SCL-005/1k/basecolor.webp',
      normal: '/materials/SCL-005/1k/normal.png',
      roughness: '/materials/SCL-005/1k/roughness.png',
    },
  })

  const [placementDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download asset placement manifest' }).click(),
  ])
  const placementPath = await placementDownload.path()
  expect(placementPath).not.toBeNull()
  const placement = JSON.parse(await fs.readFile(placementPath!, 'utf8')) as {
    root: string
    files: Array<{ destination: string }>
  }
  expect(placement.root).toBe('/materials/SCL-005')
  expect(placement.files).toHaveLength(3)
  expect(placement.files.map((file) => file.destination)).toContain('/materials/SCL-005/1k/basecolor.webp')

  const [baseColorDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'basecolor.webp' }).click(),
  ])
  expect(baseColorDownload.suggestedFilename()).toBe('basecolor.webp')

  expect(scriptRequests.some((url) => url.includes('three-renderer') || url.includes('three.module.js'))).toBe(false)
  expect(scriptRequests.some((url) => url.includes('OrderCapture'))).toBe(false)
  expect(consoleErrors, 'Material Promotion console errors: ' + consoleErrors.join('\n')).toEqual([])

  const screenshotName = testInfo.project.name.includes('mobile')
    ? 'material-promotion-mobile.png'
    : 'material-promotion-desktop.png'

  await page.screenshot({
    path: 'playwright-output/screenshots/' + screenshotName,
    fullPage: true,
  })
})

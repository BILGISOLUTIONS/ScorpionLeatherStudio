import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { buildStoredZip } from '../apps/configurator/src/capture-bundle'

const construction = {
  schemaVersion: 1,
  productId: 'SC-WH-001',
  productLabel: 'Scorpion Leather Welding Hood',
  productCategory: 'Leather Welding Hood',
  sourceCaptureSessionId: 'SC-PROD-20261002-E2E',
  capturePlanId: 'scorpion-welding-hood-v1',
  generatedAt: '2026-10-02T06:00:00.000Z',
  status: 'ready-for-digital-twin-reconstruction',
  automaticAssetMutation: false,
  provenance: { operator: 'E2E', capturedAt: '2026-10-02T05:00:00.000Z' },
  referenceCoverage: [
    'front','frontLeft45','left','rearLeft45','rear','rearRight45','right','frontRight45',
  ].map((key) => ({ key, name: key + '.png', kind: 'required-view', size: 1000, lastModified: 1 })),
  dimensionsMm: { maxWidth: 320, maxHeight: 410, maxDepth: 250 },
  constructionNodes: [
    { role: 'product-root', label: 'Root', nodeName: 'SLS_ProductRoot', status: 'confirmed' },
    { role: 'shell-main', label: 'Shell', nodeName: 'Shell_Main', status: 'confirmed' },
  ],
  components: [],
  materialSlots: [
    { slotId: 'LeatherPrimary', label: 'Leather', materialId: 'SCL-001', nodeNames: ['Shell_Main'], status: 'confirmed', evidenceFrameKeys: ['front'] },
  ],
}

function digest(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

async function buildFieldBundleFixture(): Promise<Buffer> {
  const sourceKeys = construction.referenceCoverage.map((entry) => entry.key)
  const sourceBuffers = new Map(sourceKeys.map((key, index) => [
    key,
    Buffer.from('verified-field-source-' + index + '-' + key),
  ]))
  const coverage = construction.referenceCoverage.map((entry) => {
    const data = sourceBuffers.get(entry.key)!
    return {
      ...entry,
      size: data.byteLength,
      sha256: digest(data),
      imageWidthPx: 3024,
      imageHeightPx: 4032,
    }
  })
  const packet = {
    ...construction,
    provenance: { ...construction.provenance, singlePhysicalUnitConfirmed: true },
    referenceCoverage: coverage,
  }

  const references = coverage.map((entry, index) => ({
    role: entry.key,
    label: entry.key,
    required: true,
    archivePath: 'references/' + String(index + 1).padStart(2, '0') + '-' + entry.key + '.png',
    originalName: entry.name,
    sizeBytes: entry.size,
    type: 'image/png',
    lastModified: entry.lastModified,
    sha256: entry.sha256,
    imageWidthPx: entry.imageWidthPx,
    imageHeightPx: entry.imageHeightPx,
  }))
  const sourceBytes = references.reduce((sum, entry) => sum + entry.sizeBytes, 0)
  const index = {
    schemaVersion: 1,
    bundleType: 'sls-product-capture-evidence',
    generatedAt: '2026-10-05T20:00:00.000Z',
    productId: packet.productId,
    productLabel: packet.productLabel,
    captureSessionId: packet.sourceCaptureSessionId,
    capturePlanId: packet.capturePlanId,
    assetId: 'sc-wh-001-v1',
    authority: {
      singlePhysicalUnitConfirmed: true,
      physicalProductRemainsGeometryAuthority: true,
      localOnlyPackaging: true,
    },
    totals: {
      roleReferences: references.length,
      supplementalReferences: 0,
      sourceImages: references.length,
      sourceBytes,
    },
    qualityPreflight: { ready: true, blockerCount: 0, warningCount: 1, duplicateGroups: 0 },
    references,
    supplemental: [],
  }

  const payloads: Array<{ path: string; data: string | Blob }> = [
    { path: 'README.txt', data: 'SLS verified field fixture\n' },
    { path: 'metadata/capture-session.json', data: '{"schemaVersion":1}\n' },
    { path: 'metadata/construction-packet.json', data: JSON.stringify(packet, null, 2) + '\n' },
    { path: 'metadata/asset-manifest-scaffold.json', data: '{"schemaVersion":1}\n' },
    { path: 'metadata/capture-bundle-index.json', data: JSON.stringify(index, null, 2) + '\n' },
    ...references.map((entry) => ({
      path: entry.archivePath,
      data: new Blob([sourceBuffers.get(entry.role)!], { type: 'image/png' }),
    })),
  ]
  const checksumLines: string[] = []
  for (const entry of payloads) {
    const buffer = typeof entry.data === 'string'
      ? Buffer.from(entry.data)
      : Buffer.from(await entry.data.arrayBuffer())
    checksumLines.push(digest(buffer) + '  ' + entry.path)
  }
  const zip = await buildStoredZip([
    ...payloads,
    { path: 'SHA256SUMS.txt', data: checksumLines.join('\n') + '\n' },
  ], new Date('2026-10-05T20:00:00.000Z'))
  return Buffer.from(await zip.arrayBuffer())
}

test('V0.47 ingests a verified field bundle into a traceable reconstruction and preparation handoff', async ({ page }, testInfo) => {
  await page.goto('/digital-twin-ingestion.html')

  await page.getByLabel('Verified field evidence ZIP').setInputFiles({
    name: 'SC-WH-001-field-evidence.zip',
    mimeType: 'application/zip',
    buffer: await buildFieldBundleFixture(),
  })

  await expect(page.getByText('VERIFIED FIELD BUNDLE LOADED', { exact: true })).toBeVisible()
  const bundleSummary = page.getByRole('region', { name: 'Verified field bundle summary' })
  await expect(bundleSummary).toBeVisible()
  await expect(bundleSummary.getByText('FIELD EVIDENCE VERIFIED')).toBeVisible()
  await expect(bundleSummary.getByText('SC-PROD-20261002-E2E', { exact: false })).toBeVisible()

  await page.getByLabel('Reconstruction provider').selectOption('meshy')
  await expect(page.getByText('Verified original field source ·', { exact: false }).first()).toBeVisible()

  await page.getByText('Geometry-preserving image prep confirmed').click()
  await page.getByRole('button', { name: 'Create reconstruction job' }).click()
  await expect(page.getByText(/SLS-RECON-/)).toBeVisible()

  const jobDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download job JSON' }).click()
  const jobDownload = await jobDownloadPromise
  const jobPath = await jobDownload.path()
  expect(jobPath).not.toBeNull()
  const jobPacket = JSON.parse(await fs.readFile(jobPath!, 'utf8')) as {
    sourceImages: Array<{ sourceKey: string; captureEvidence?: { archivePath: string; sha256: string; verifiedFieldBundle: boolean } }>
  }
  expect(jobPacket.sourceImages).toHaveLength(4)
  expect(jobPacket.sourceImages.every((entry) => entry.captureEvidence?.verifiedFieldBundle === true)).toBe(true)
  expect(jobPacket.sourceImages.every((entry) => /^[a-f0-9]{64}$/u.test(entry.captureEvidence?.sha256 ?? ''))).toBe(true)
  await expect(page.getByText('Meshy').last()).toBeVisible()
  await expect(page.getByText('Meshy Multi-Image REST runner')).toBeVisible()
  await expect(page.locator('.execution-env span').filter({ hasText: 'MESHY_API_KEY' })).toBeVisible()
  await expect(page.getByText(/meshy_multi_image\.mjs/)).toBeVisible()

  const jobText = await page.locator('.job-ready').locator('strong').first().textContent()
  expect(jobText).toMatch(/^SLS-RECON-/u)
  await page.getByLabel('Provider result metadata JSON').setInputFiles({
    name: 'provider-result.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      schemaVersion: 1,
      provider: 'meshy',
      jobId: jobText,
      taskId: 'meshy-task-e2e',
      status: 'SUCCEEDED',
    })),
  })
  await expect(page.getByPlaceholder('Task ID, model ID, or URL (no secret tokens)')).toHaveValue('meshy-task-e2e')

  await page.getByLabel('Reconstruction candidate model').setInputFiles({
    name: 'welding-hood-raw.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from('raw-glb-placeholder'),
  })

  for (const label of [
    'Source photos are authorized for this client/product',
    'Commercial use is permitted for this generated asset',
    'The provider/account grants the required export/use rights',
    'Provider terms / license were reviewed for this candidate',
  ]) {
    await page.getByText(label, { exact: true }).click()
  }

  await page.getByRole('button', { name: 'Accept raw candidate' }).click()
  await expect(page.getByText('Raw reconstruction candidate recorded')).toBeVisible()
  await expect(page.getByText(/not production authority/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Raw reconstruction preparation' })).toBeVisible()
  await expect(page.getByText(/sls_reconstruction_prepare\.py/)).toBeVisible()
  await expect(page.getByText('sc-wh-001-v1-normalized.glb', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy Blender prep command' })).toBeVisible()

  const handoffDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Blender / QA handoff' }).click()
  const download = await handoffDownload
  expect(download.suggestedFilename()).toMatch(/processing-handoff\.json$/u)

  await fs.mkdir('playwright-output/screenshots', { recursive: true })
  await page.screenshot({ path: 'playwright-output/screenshots/v047-ingestion-' + testInfo.project.name + '.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'

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

test('V0.39 builds a traceable provider-agnostic reconstruction handoff', async ({ page }, testInfo) => {
  await page.goto('/digital-twin-ingestion.html')

  await page.getByLabel('Construction packet JSON').setInputFiles({
    name: 'construction.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(construction)),
  })

  await expect(page.getByText('PHYSICAL PROVENANCE LOADED')).toBeVisible()
  await page.getByLabel('Reconstruction provider').selectOption('meshy')

  for (const key of ['front', 'rear', 'left', 'right']) {
    await page.getByLabel(key + ' prepared image').setInputFiles({
      name: key + '-prepared.png',
      mimeType: 'image/png',
      buffer: Buffer.from('prepared-image-' + key),
    })
  }

  await page.getByText('Geometry-preserving image prep confirmed').click()
  await page.getByRole('button', { name: 'Create reconstruction job' }).click()
  await expect(page.getByText(/SLS-RECON-/)).toBeVisible()
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

  const handoffDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Blender / QA handoff' }).click()
  const download = await handoffDownload
  expect(download.suggestedFilename()).toMatch(/processing-handoff\.json$/u)

  await fs.mkdir('playwright-output/screenshots', { recursive: true })
  await page.screenshot({ path: 'playwright-output/screenshots/v039-ingestion-' + testInfo.project.name + '.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

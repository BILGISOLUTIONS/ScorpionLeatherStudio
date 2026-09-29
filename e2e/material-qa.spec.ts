import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'

test.beforeAll(async () => {
  await fs.mkdir('playwright-output/screenshots', { recursive: true })
})

test('Material QA records measured physical tile scale in the approval packet', async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/material-qa.html')
  await expect(page.getByRole('heading', { name: 'Material QA' })).toBeVisible()

  const manifest = {
    materialId: 'SCL-QA-TEST',
    label: 'QA Test Leather',
    captureSessionId: 'SC-CAP-QA-TEST',
    processor: { resolution: 1024 },
    outputs: {
      baseColor: 'base.png',
      roughness: 'roughness.png',
      normal: 'normal.png',
    },
  }
  await page.getByLabel('Processing manifest file').setInputFiles({
    name: 'SCL-QA-TEST-processing.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(manifest)),
  })

  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas unavailable')
    context.fillStyle = '#805030'
    context.fillRect(0, 0, 32, 32)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const png = Buffer.from(pngBase64, 'base64')

  for (const label of ['Base color map file', 'Roughness map file', 'Normal map file']) {
    await page.getByLabel(label).setInputFiles({
      name: label.toLowerCase().replaceAll(' ', '-') + '.png',
      mimeType: 'image/png',
      buffer: png,
    })
  }

  await page.getByLabel('Physical tile width (mm)').fill('400')
  await page.getByLabel('Physical tile height (mm)').fill('250')
  await page.getByLabel('Reviewer *').fill('Browser QA')

  const reviewLabels = [
    'Color visually matches the physical swatch under controlled light',
    'No unacceptable seams or repeating capture artifacts are visible',
    'Leather grain scale matches the measured physical texture tile',
    'Normal direction/strength is correct under raking light',
    'Roughness response matches the physical finish',
    '1K/2K material remains responsive on the target device',
  ]
  for (const label of reviewLabels) await page.getByRole('checkbox', { name: label }).check()

  await expect(page.getByText('Eligible for registry promotion')).toBeVisible()
  const exportButton = page.getByRole('button', { name: 'Export QA approval packet' })
  await expect(exportButton).toBeEnabled()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exportButton.click(),
  ])
  const outputPath = await download.path()
  expect(outputPath).not.toBeNull()
  const packet = JSON.parse(await fs.readFile(outputPath!, 'utf8')) as {
    physicalTextureTileSizeMm: [number, number]
    viewer: { repeat: number }
    decision: string
  }
  expect(packet.physicalTextureTileSizeMm).toEqual([400, 250])
  expect(packet.decision).toBe('approved-for-registry-promotion')
  expect(packet.viewer.repeat).toBeGreaterThan(0)

  const screenshotName = testInfo.project.name.includes('mobile')
    ? 'material-qa-physical-scale-mobile.png'
    : 'material-qa-physical-scale-desktop.png'
  await page.screenshot({
    path: 'playwright-output/screenshots/' + screenshotName,
    fullPage: true,
  })

  expect(consoleErrors, 'Material QA console errors: ' + consoleErrors.join('\n')).toEqual([])
})

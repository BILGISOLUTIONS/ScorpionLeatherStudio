import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/catalog-variant?*', (route) => route.fulfill({ json: { ok: false } }))
})

test('V0.28 share links are portable and stale standalone tokens are cleared', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          window.sessionStorage.setItem('v028-share-url', value)
        },
      },
    })
  })

  await page.goto('/?embed=1&product=ignored&family=ignored&reference=ignored&variant=ignored#studio-customization')
  await page.getByLabel('Build notes').fill('Portable build handoff')
  await page.getByRole('button', { name: 'Share build' }).click()

  const shared = await page.evaluate(() => window.sessionStorage.getItem('v028-share-url'))
  expect(shared).toBeTruthy()
  const sharedUrl = new URL(shared!)
  expect(sharedUrl.searchParams.get('studio')).toBeTruthy()
  for (const parameter of ['embed', 'product', 'family', 'reference', 'variant', 'build']) {
    expect(sharedUrl.searchParams.has(parameter)).toBe(false)
  }
  expect(sharedUrl.hash).toBe('')
  expect(new URL(page.url()).searchParams.get('embed')).toBe('1')

  await page.goto('/')
  await page.getByLabel('Build notes').fill('Standalone share state')
  await page.getByRole('button', { name: 'Share build' }).click()
  await expect.poll(() => new URL(page.url()).searchParams.has('studio')).toBe(true)
  await page.getByRole('button', { name: 'Increase quantity' }).click()
  await expect.poll(() => new URL(page.url()).searchParams.has('studio')).toBe(false)
})

test('V0.28 build files round-trip across a fresh studio without artwork or customer data', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByLabel('Leather color request').fill('Chestnut')
  await page.getByLabel('Build notes').fill('Cross-device field handoff')
  await page.getByLabel('Quantity').fill('3')

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save build file' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^SLS-[A-F0-9]{8}\.sls-build\.json$/u)
  const path = await download.path()
  expect(path).toBeTruthy()
  const exportedText = await fs.readFile(path!, 'utf8')
  const exported = JSON.parse(exportedText) as {
    kind: string
    version: number
    buildId: string
    build: { quantity: number; personalization: { additionalNotes: string; construction: { leatherColor: string } } }
    customer?: unknown
    artwork?: unknown
  }
  expect(exported.kind).toBe('scorpion-leather-studio-build')
  expect(exported.version).toBe(1)
  expect(exported.build.quantity).toBe(3)
  expect(exported.build.personalization.additionalNotes).toBe('Cross-device field handoff')
  expect(exported.build.personalization.construction.leatherColor).toBe('Chestnut')
  expect(exported.customer).toBeUndefined()
  expect(exported.artwork).toBeUndefined()

  await page.getByRole('button', { name: 'Reset studio' }).click()
  await expect(page.getByLabel('Build notes')).toHaveValue('')
  await expect(page.getByLabel('Quantity')).toHaveValue('1')

  await page.getByTestId('build-file-input').setInputFiles({
    name: 'handoff.sls-build.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exportedText),
  })

  await expect(page.getByLabel('Build notes')).toHaveValue('Cross-device field handoff')
  await expect(page.getByLabel('Leather color request')).toHaveValue('Chestnut')
  await expect(page.getByLabel('Quantity')).toHaveValue('3')
  await expect(page.getByRole('status')).toContainText(/Loaded SLS-/u)
  expect(new URL(page.url()).searchParams.has('studio')).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await fs.mkdir('playwright-output/screenshots', { recursive: true })
  await page.screenshot({ path: `playwright-output/screenshots/v028-portability-${testInfo.project.name}.png` })
})

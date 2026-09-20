import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'

test.beforeAll(async () => {
  await fs.mkdir('playwright-output/screenshots', { recursive: true })
})

test('configurator renders, persists, shares, and prepares the live build', async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Leather Studio' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Custom Leather Welding Hood' })).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByText('Asset contract validated')).toBeVisible()

  await expect(page.getByTestId('build-total')).toHaveText('$207.00')
  await page.getByRole('button', { name: /Black Full Grain/i }).click()
  await expect(page.getByTestId('build-total')).toHaveText('$219.00')

  await page.getByRole('button', { name: 'Front' }).click()
  await page.getByRole('button', { name: 'Visor' }).click()
  await page.getByRole('button', { name: 'Auto spin' }).click()
  await expect(page.getByRole('button', { name: 'Stop spin' })).toBeVisible()

  await page.getByRole('button', { name: 'Open visor' }).click()
  await expect(page.getByRole('button', { name: 'Close visor' })).toBeVisible()

  const measurement = page.getByLabel('Head circumference')
  await measurement.fill('23.5')
  await expect(page.getByText('Recommended L')).toBeVisible()

  await page.getByRole('button', { name: 'Share build' }).click()
  await expect.poll(() => new URL(page.url()).searchParams.has('build')).toBe(true)

  await page.reload()
  await expect(page.getByTestId('build-total')).toHaveText('$219.00')
  await expect(page.getByLabel('Head circumference')).toHaveValue('23.5')
  await expect(page.getByText('Recommended L')).toBeVisible()

  await page.getByRole('button', { name: 'Prepare Shopify Build' }).click()
  await expect(page.getByRole('status')).toContainText('Shopify-ready build prepared: SC-')

  const screenshotName = testInfo.project.name.includes('mobile') ? 'mobile.png' : 'desktop.png'
  await page.screenshot({
    path: `playwright-output/screenshots/${screenshotName}`,
    fullPage: true,
  })

  expect(consoleErrors, `Browser console errors: ${consoleErrors.join('\n')}`).toEqual([])
})

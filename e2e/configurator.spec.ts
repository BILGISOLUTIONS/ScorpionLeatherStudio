import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'

test.beforeAll(async () => {
  await fs.mkdir('playwright-output/screenshots', { recursive: true })
})

test('catalog-linked configurator restores the selected Scorpion build', async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Leather Studio' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Scorpion Leather Welding Hood' })).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByText('Asset contract validated')).toHaveText('Asset contract validated')
  await expect(page.getByText('Measurement rules pending physical verification')).toBeVisible()

  await expect(page.getByTestId('build-total')).toHaveText('$10.00')
  await expect(page.getByText('NOT APPROVED RETAIL PRICING')).toBeVisible()
  await expect(page.getByText('SC-WH-CTX-002')).toBeVisible()

  await page.getByRole('button', { name: /Tan Smooth/i }).click()
  await expect(page.getByText('SC-WH-TSM-003')).toBeVisible()
  await expect(page.getByText('83915544')).toBeVisible()

  await page.getByRole('button', { name: 'Open visor' }).click()
  await expect(page.getByRole('button', { name: 'Close visor' })).toBeVisible()
  await page.getByRole('button', { name: 'Close visor' }).click()

  const frontView = page.getByRole('button', { name: 'Front', exact: true })
  await frontView.click()
  await expect(frontView).toHaveClass(/is-active/)

  await page.getByRole('button', { name: 'Share build' }).click()
  await expect.poll(() => new URL(page.url()).searchParams.has('build')).toBe(true)

  await page.reload()
  await expect(page.getByTestId('build-total')).toHaveText('$10.00')
  await expect(page.getByText('SC-WH-TSM-003')).toBeVisible()
  await expect(page.getByText('83915544')).toBeVisible()

  await page.getByRole('button', { name: 'Prepare Shopify Build' }).click()
  await expect(page.getByRole('status')).toContainText('Shopify build prepared for SC-WH-TSM-003: SC-')

  const screenshotName = testInfo.project.name.includes('mobile') ? 'mobile.png' : 'desktop.png'
  await page.screenshot({
    path: `playwright-output/screenshots/${screenshotName}`,
    fullPage: true,
  })

  expect(consoleErrors, `Browser console errors: ${consoleErrors.join('\n')}`).toEqual([])
})

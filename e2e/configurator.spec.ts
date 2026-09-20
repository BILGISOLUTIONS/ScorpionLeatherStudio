import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'

test.beforeAll(async () => {
  await fs.mkdir('playwright-output/screenshots', { recursive: true })
})

test('multi-product studio builds and captures a customized order request', async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Custom Leather Studio' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Customizable products' })).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByText('3D contract validated')).toHaveText('3D contract validated')

  await page.getByRole('button', { name: /Radio Harness/i }).click()
  await expect(page.getByText('Leather Radio Harness', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: /Alligator-print cowhide Scorpion/i })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)

  await page.getByRole('button', { name: /Cowhide Radio Harness - Black/i }).click()
  await page.getByRole('button', { name: /X-Large/i }).click()
  await expect(page.getByTestId('base-price')).toHaveText('$350.00')
  const buildSummary = page.getByRole('region', { name: 'Build summary' })
  await expect(buildSummary.getByText('SC-LRH-BLK-XL-002')).toBeVisible()

  await page.getByRole('button', { name: 'Western floral' }).click()
  await page.getByRole('checkbox', { name: /Add text/i }).check()
  await page.getByPlaceholder('Name, initials, company, unit, etc.').fill('ZAN CREW')
  await page.getByRole('button', { name: 'Block', exact: true }).click()
  await page.getByLabel('Requested placement').selectOption({ label: 'Front chest panel' })
  await page.getByLabel('Quantity').fill('2')

  await expect(page.getByText('ZAN CREW').first()).toBeVisible()
  await expect(page.getByText('Western floral').last()).toBeVisible()

  await page.getByRole('button', { name: 'Share build' }).click()
  await expect.poll(() => new URL(page.url()).searchParams.has('studio')).toBe(true)

  await page.reload()
  await expect(page.getByTestId('base-price')).toHaveText('$350.00')
  await expect(page.getByPlaceholder('Name, initials, company, unit, etc.')).toHaveValue('ZAN CREW')
  await expect(page.getByLabel('Quantity')).toHaveValue('2')

  await page.getByLabel(/^Name/).fill('Test Customer')
  await page.getByLabel('Email').fill('customer@example.com')
  await page.getByRole('button', { name: 'Create Order Request' }).click()

  await expect(page.getByText('REQUEST READY')).toBeVisible()
  const requestPanel = page.getByRole('region', { name: 'Custom order request' })
  await expect(requestPanel.locator('pre')).toContainText('SC-LRH-BLK-XL-002')
  await expect(requestPanel.locator('pre')).toContainText('Quantity: 2')
  await expect(requestPanel.locator('pre')).toContainText('ZAN CREW')
  await expect(requestPanel.locator('pre')).toContainText('western-floral')
  await expect(page.getByRole('button', { name: 'Email Scorpion' })).toBeVisible()

  const screenshotName = testInfo.project.name.includes('mobile') ? 'mobile.png' : 'desktop.png'
  await page.screenshot({
    path: `playwright-output/screenshots/${screenshotName}`,
    fullPage: true,
  })

  expect(consoleErrors, `Browser console errors: ${consoleErrors.join('\n')}`).toEqual([])
})

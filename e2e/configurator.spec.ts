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

  const artworkInput = page.locator('input[type="file"]')
  await artworkInput.setInputFiles({
    name: 'crew-logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64'),
  })
  await expect(page.getByText('crew-logo.png', { exact: true })).toBeVisible()

  await page.getByRole('spinbutton', { name: 'Quantity' }).fill('2')

  await expect(page.getByText('ZAN CREW').first()).toBeVisible()
  await expect(page.getByText('Western floral').last()).toBeVisible()

  await page.getByRole('button', { name: 'Share build' }).click()
  await expect.poll(() => new URL(page.url()).searchParams.has('studio')).toBe(true)

  await page.reload()
  await expect(page.getByTestId('base-price')).toHaveText('$350.00')
  await expect(page.getByPlaceholder('Name, initials, company, unit, etc.')).toHaveValue('ZAN CREW')
  await expect(page.getByRole('spinbutton', { name: 'Quantity' })).toHaveValue('2')

  const requestPanel = page.getByRole('region', { name: 'Custom order request' })
  await requestPanel.getByRole('textbox', { name: /^Name/ }).fill('Test Customer')
  await requestPanel.getByRole('textbox', { name: 'Email', exact: true }).fill('customer@example.com')
  await requestPanel.getByRole('button', { name: 'Create Order Request' }).click()

  await expect(requestPanel.getByText('REQUEST READY')).toBeVisible()
  await expect(requestPanel.locator('pre')).toContainText('SC-LRH-BLK-XL-002')
  await expect(requestPanel.locator('pre')).toContainText('Quantity: 2')
  await expect(requestPanel.locator('pre')).toContainText('ZAN CREW')
  await expect(requestPanel.locator('pre')).toContainText('western-floral')
  let deliveredRequestId = ''
  let deliveredArtworkName = ''
  await page.route('**/api/order-requests', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      request?: { requestId?: string; commerce?: { sku?: string; referenceImageUrl?: string } }
      artwork?: { name?: string; type?: string; dataUrl?: string }
    }
    deliveredRequestId = body.request?.requestId ?? ''
    deliveredArtworkName = body.artwork?.name ?? ''
    expect(body.request?.commerce?.sku).toBe('SC-LRH-BLK-XL-002')
    expect(body.request?.commerce?.referenceImageUrl).toContain('cdn.shopify.com')
    expect(body.artwork?.type).toBe('image/png')
    expect(body.artwork?.dataUrl).toContain('data:image/png;base64,')
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ accepted: true, requestId: deliveredRequestId, deliveryId: 'test-delivery', artworkAttached: true }),
    })
  })

  const sendButton = requestPanel.getByRole('button', { name: 'Send to Scorpion' })
  await expect(sendButton).toBeDisabled()
  await requestPanel.getByRole('checkbox', { name: /I understand this is a customization request/i }).check()
  await expect(sendButton).toBeEnabled()
  await sendButton.click()
  await expect(requestPanel.getByRole('button', { name: 'Sent to Scorpion' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('sent to Scorpion successfully')
  expect(deliveredRequestId).toMatch(/^SC-REQ-/u)
  expect(deliveredArtworkName).toBe('crew-logo.png')
  await expect(requestPanel.getByRole('button', { name: 'JSON packet' })).toBeVisible()
  await expect(requestPanel.getByRole('button', { name: 'Print packet' })).toBeVisible()
  await expect(requestPanel.getByRole('button', { name: 'Email fallback' })).toBeVisible()

  const screenshotName = testInfo.project.name.includes('mobile') ? 'mobile.png' : 'desktop.png'
  await page.screenshot({
    path: `playwright-output/screenshots/${screenshotName}`,
    fullPage: true,
  })

  expect(consoleErrors, `Browser console errors: ${consoleErrors.join('\n')}`).toEqual([])
})

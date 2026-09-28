import { expect, test } from '@playwright/test'

test('V0.25 production overview stays lazy and renders compact workshop analytics', async ({ page }) => {
  const scripts: string[] = []
  const styles: string[] = []
  let analyticsRequests = 0

  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url())
    if (request.resourceType() === 'stylesheet') styles.push(request.url())
  })

  await page.route('**/api/staff/orders**', async (route) => {
    const url = new URL(route.request().url())

    if (url.searchParams.get('view') === 'workshop-analytics') {
      analyticsRequests += 1
      await route.fulfill({
        json: {
          ok: true,
          analytics: {
            generatedAt: '2026-09-27T12:00:00.000Z',
            sourceCount: 4,
            releasedCount: 3,
            activeCount: 2,
            completedCount: 1,
            completedLast30Days: 1,
            activeUnits: 5,
            totalRevisionCount: 2,
            averageReleaseToQcHours: 31.5,
            oldestActiveHours: 52,
            checklist: {
              manufacturingDone: 3,
              manufacturingTotal: 6,
              qualityDone: 1,
              qualityTotal: 4,
            },
            products: [
              { productTitle: 'Leather Welding Hood', orders: 2, units: 4 },
              { productTitle: 'Tool Belt Rig', orders: 1, units: 1 },
            ],
            queue: [
              {
                requestId: 'SC-REQ-V025-A',
                workOrderId: 'SLS-WO-V025-A',
                revisionId: 'REV-A',
                productTitle: 'Leather Welding Hood',
                referenceTitle: 'Cognac Textured',
                quantity: 2,
                releasedAt: '2026-09-25T08:00:00.000Z',
                ageHours: 52,
                manufacturingDone: 2,
                manufacturingTotal: 3,
                qualityDone: 1,
                qualityTotal: 2,
                revisionCount: 1,
              },
              {
                requestId: 'SC-REQ-V025-B',
                workOrderId: 'SLS-WO-V025-B',
                revisionId: 'REV-B',
                productTitle: 'Leather Welding Hood',
                referenceTitle: 'Dark Textured',
                quantity: 3,
                releasedAt: '2026-09-26T08:00:00.000Z',
                ageHours: 28,
                manufacturingDone: 1,
                manufacturingTotal: 3,
                qualityDone: 0,
                qualityTotal: 2,
                revisionCount: 1,
              },
            ],
          },
        },
      })
      return
    }

    await route.fulfill({
      json: {
        ok: true,
        workshopSchemaReady: true,
        orders: [],
      },
    })
  })

  await page.goto('/staff.html')
  await page.getByLabel('Staff access token').fill('test-token')
  await page.getByRole('button', { name: 'Open order queue' }).click()

  expect(scripts.some((url) => url.includes('staff-analytics-v025.js'))).toBe(false)
  expect(styles.some((url) => url.includes('staff-analytics-v025.css'))).toBe(false)

  await page.getByRole('button', { name: 'Production overview' }).click()

  const dialog = page.getByRole('dialog', { name: 'Workshop production overview' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Active builds').locator('..')).toContainText('2')
  await expect(dialog.getByText('5 units')).toBeVisible()
  await expect(dialog.getByText('31.5 hr')).toBeVisible()
  await expect(dialog.getByText('SLS-WO-V025-A')).toBeVisible()
  await expect(dialog.getByText('Leather Welding Hood').first()).toBeVisible()
  await expect(dialog.getByText('3 / 6')).toBeVisible()
  await expect(dialog.getByText('1 / 4')).toBeVisible()

  await expect.poll(() => scripts.some((url) => url.includes('staff-analytics-v025.js'))).toBe(true)
  await expect.poll(() => styles.some((url) => url.includes('staff-analytics-v025.css'))).toBe(true)
  expect(analyticsRequests).toBe(1)

  await page.waitForTimeout(700)
  expect(analyticsRequests).toBe(1)

  await dialog.getByRole('button', { name: 'Refresh' }).click()
  await expect.poll(() => analyticsRequests).toBe(2)

  await expect(dialog).not.toContainText('@')
  await expect(dialog).not.toContainText('phone')
})

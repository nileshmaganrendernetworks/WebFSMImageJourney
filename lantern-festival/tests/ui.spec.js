import { expect, test } from '@playwright/test'

test('observer mode stays side by side and solves without console/network errors', async ({ page }) => {
  const requests = []
  const consoleErrors = []

  page.on('request', (request) => requests.push(request.url()))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: /lantern festival/i })).toBeVisible()

  const viewShell = page.getByTestId('view-shell')
  const layout = await viewShell.evaluate((element) => getComputedStyle(element).gridTemplateColumns)
  expect(layout.split(' ').length).toBeGreaterThanOrEqual(2)


  await page.getByRole('button', { name: /Watch full demo/i }).click()
  await expect(page.getByText(/demo complete/i)).toBeVisible({ timeout: 30000 })
  await expect(page.getByText(/Goal complete/i)).toBeVisible()

  const summary = await page.evaluate(() => window.__LANTERN_FESTIVAL_SUMMARY__())
  expect(summary).toMatchObject({
    players: { A: 'reunion', B: 'reunion' },
    beaconLit: true,
    win: true,
  })

  const externalRequests = requests.filter((url) => !url.startsWith('http://127.0.0.1:4173'))
  expect(externalRequests).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('touch-friendly controls work at mobile landscape width', async ({ page }) => {
  await page.setViewportSize({ width: 932, height: 430 })
  await page.goto('/')

  await page.getByRole('button', { name: 'A Garden Walk' }).click()
  await page.getByRole('button', { name: 'Shared Plaza' }).nth(0).click()
  await page.getByRole('button', { name: 'West Bank Lantern' }).nth(0).click()
  await page.getByRole('button', { name: /Illuminate West Paper Wheel/i }).click()

  await expect(page.getByText(/West Paper Wheel becomes solid/i)).toBeVisible()
  await expect(page.locator('#input-A')).toContainText(/tap/i)
})

import { expect, test } from '@playwright/test'

test('demo walkthrough shows in-between motion and active input callouts', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Watch full demo/i }).click()
  await page.waitForFunction(() => {
    const presentation = window.__LANTERN_FESTIVAL_PRESENTATION__?.()
    return Boolean(
      presentation &&
      presentation.focus.playerId === 'A' &&
      presentation.players.A.moving &&
      presentation.players.A.x > -14 &&
      presentation.players.A.x < -11
    )
  })

  await expect(page.locator('#callout-A')).toContainText(/Demo tap/i)
  const presentation = await page.evaluate(() => window.__LANTERN_FESTIVAL_PRESENTATION__())
  expect(presentation.focus.playerId).toBe('A')
  expect(presentation.players.A.moving).toBe(true)
})

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
  await page.waitForFunction(() => window.__LANTERN_FESTIVAL_SUMMARY__?.().win === true, null, { timeout: 40000 })
  await expect(page.getByText(/demo complete/i)).toBeVisible()
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

test('pause locks controls until take control, then manual input works', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Watch full demo/i }).click()
  await page.getByRole('button', { name: 'Pause demo' }).click()
  await expect(page.getByRole('button', { name: 'Resume demo' })).toBeVisible()
  await expect(page.getByText(/playback is frozen/i)).toBeVisible()
  const firstMove = page.getByTestId('panel-A').locator('.move-button').first()
  await expect(firstMove).toBeDisabled()
  await page.getByRole('button', { name: 'Take control' }).click()
  await expect(page.getByText(/Manual control returned/i)).toBeVisible()
  await expect(firstMove).toBeEnabled()
  const before = await page.locator('#position-A').textContent()
  await firstMove.click()
  await expect(page.locator('#position-A')).not.toHaveText(before ?? '')
})

test('touch-friendly controls work at mobile landscape width', async ({ page }) => {
  await page.setViewportSize({ width: 932, height: 430 })
  await page.goto('/')

  await page.getByTestId('panel-A').getByRole('button', { name: 'A Garden Walk' }).click()
  await expect(page.getByTestId('panel-A').getByRole('button', { name: 'Shared Plaza' })).toBeEnabled()
  await page.getByTestId('panel-A').getByRole('button', { name: 'Shared Plaza' }).click()
  await expect(page.getByTestId('panel-A').getByRole('button', { name: 'West Bank Lantern' })).toBeEnabled()
  await page.getByTestId('panel-A').getByRole('button', { name: 'West Bank Lantern' }).click()
  await expect(page.getByTestId('panel-A').getByRole('button', { name: /Illuminate West Paper Wheel/i })).toBeEnabled()
  await page.getByTestId('panel-A').getByRole('button', { name: /Illuminate West Paper Wheel/i }).click()

  await expect(page.getByText(/West Paper Wheel becomes solid/i)).toBeVisible()
  await expect(page.locator('#input-A')).toContainText(/tap/i)
})

test('startup fallback renders a readable error card when WebGL scene creation fails', async ({ page }) => {
  await page.addInitScript(() => {
    window.__LANTERN_FESTIVAL_FORCE_RENDERER_ERROR__ = true
  })

  await page.goto('/')

  await expect(page.getByRole('heading', { name: /Unable to start the lantern festival/i })).toBeVisible()
  await expect(page.locator('.error-card p')).toContainText(/could not create a working WebGL scene/i)

  const startupError = await page.evaluate(() => window.__LANTERN_FESTIVAL_STARTUP_ERROR__)
  const startupException = await page.evaluate(() => window.__LANTERN_FESTIVAL_STARTUP_EXCEPTION__)
  expect(startupError).toMatch(/could not create a working WebGL scene/i)
  expect(startupException).toMatch(/Forced renderer startup failure/i)
})

test('render-loop failures also fall back to the readable error card', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /lantern festival/i })).toBeVisible()

  await page.evaluate(() => {
    window.__LANTERN_FESTIVAL_FORCE_RENDER_ERROR__ = true
  })

  await expect(page.getByRole('heading', { name: /Unable to start the lantern festival/i })).toBeVisible()
  await expect(page.locator('.error-card p')).toContainText(/could not create a working WebGL scene/i)
  const startupException = await page.evaluate(() => window.__LANTERN_FESTIVAL_STARTUP_EXCEPTION__)
  expect(startupException).toMatch(/Forced render loop failure/i)
})

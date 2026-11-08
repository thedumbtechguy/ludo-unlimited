import { expect, test, type Page } from '@playwright/test'

const label = (page: Page) => page.locator('.turn-label')

test('two people play in a room, and one leaves and comes back', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  const bContext = await browser.newContext()
  let b = await bContext.newPage()

  // Ama makes a 2-player room with the quick timer; she sits on red as its creator.
  await a.goto('/')
  await a.getByRole('button', { name: 'Play online' }).click()
  await a.getByLabel('Your name').fill('Ama')
  await a.getByRole('button', { name: 'Next' }).click()
  await a.getByRole('button', { name: 'Create a room' }).click()
  await a.getByRole('button', { name: /^Players/ }).click()
  await a.getByRole('radio', { name: '2 players' }).click()
  await a.getByRole('button', { name: /^Turn timer/ }).click()
  await a.getByRole('radio', { name: 'Quick' }).click()
  await a.getByRole('button', { name: 'Create room' }).click()
  const code = (await a.locator('.room-code').textContent())!.trim()
  expect(code).toMatch(/^[A-Z]{4}$/)

  // Kofi opens the link, joins and takes the free seat.
  await b.goto(`/r/${code}`)
  await b.getByLabel('Your name').fill('Kofi')
  await b.getByRole('button', { name: 'Next' }).click()
  await b.getByRole('button', { name: /^Tap to sit as/ }).click()
  await expect(a.getByText(': Kofi')).toBeVisible()
  await a.getByRole('button', { name: 'Start' }).click()

  // Red (Ama) has the first turn on both screens, and both see the dice.
  await expect(label(a)).toHaveText(/Your turn/, { timeout: 15_000 })
  await expect(label(b)).toHaveText(/Ama's turn/, { timeout: 15_000 })
  await expect(a.getByRole('button', { name: /^Roll dice/ })).toBeEnabled()
  await expect(b.getByRole('button', { name: /^Roll dice/ })).toBeDisabled()

  // Ama plays her turn (a six means a move and another roll) until it is Kofi's.
  await expect(async () => {
    const dice = a.getByRole('button', { name: /^Roll dice/ })
    if (await dice.isEnabled()) await dice.click({ timeout: 1000 })
    const piece = a.getByRole('button', { name: /move this piece/ }).first()
    if (await piece.isVisible()) await piece.click({ timeout: 1000 })
    await expect(label(b)).toHaveText(/Your turn/, { timeout: 2000 })
  }).toPass({ timeout: 60_000 })
  await expect(label(a)).toHaveText(/Kofi's turn/)

  // Kofi leaves: the host is told, and can pause.
  await b.close()
  await expect(a.getByText('Kofi left. A computer is playing for them')).toBeVisible({ timeout: 15_000 })
  await expect(a.getByRole('button', { name: 'Pause and wait' })).toBeVisible()

  // Kofi comes back on the same device, with his saved name, and is a player again.
  b = await bContext.newPage()
  await b.goto(`/r/${code}`)
  await expect(label(b)).toBeVisible({ timeout: 15_000 })
  await expect(b.getByRole('button', { name: /^Roll dice/ })).toBeVisible()
  await expect(label(b)).not.toHaveText(/Watching/)
  await expect(a.getByText('Kofi left. A computer is playing for them')).toHaveCount(0, { timeout: 15_000 })
})

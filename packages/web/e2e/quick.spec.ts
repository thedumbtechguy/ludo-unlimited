import { expect, test, type Page } from '@playwright/test'

const label = (page: Page) => page.locator('.turn-label')

async function quickMatch(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Quick match' }).click()
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: /^Rules/ }).click()
  await page.getByRole('radio', { name: 'Classic' }).click()
  await page.getByRole('button', { name: 'Go' }).click()
}

// It expects no other open Classic rooms: the e2e server starts with empty state each run.
test('two people quick match into one room, and a third finds it', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()
  const c = await (await browser.newContext()).newPage()

  await quickMatch(a, 'Ama')
  await expect(a.getByText(/Starting in \d+ s/)).toBeVisible({ timeout: 15_000 })
  await quickMatch(b, 'Kofi')

  // Both in one room: each sees the other, and the game starts by itself.
  await expect(a.getByText(/Kofi/).first()).toBeVisible({ timeout: 15_000 })
  await expect(b.getByText(/Ama/).first()).toBeVisible()
  await expect(label(a)).toBeVisible({ timeout: 40_000 })
  await expect(label(b)).toBeVisible({ timeout: 40_000 })

  // Esi finds it in the list and gets a computer's seat.
  await c.goto('/')
  await c.getByRole('button', { name: 'Find a game' }).click()
  await c.getByLabel('Your name').fill('Esi')
  await c.getByRole('button', { name: 'Next' }).click()
  const row = c.getByTestId('listing').filter({ hasText: 'Classic · Quick' }).filter({ hasText: 'Playing' }).first()
  await row.click({ timeout: 15_000 })
  await expect(label(c)).toBeVisible({ timeout: 15_000 })
  await expect(label(c)).not.toHaveText(/Watching/, { timeout: 15_000 })
})

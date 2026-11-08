import { expect, test } from '@playwright/test'

test('four computers play a game to the end', async ({ page }) => {
  await page.goto('/?seed=7&fast')
  await page.getByRole('button', { name: 'New game' }).click()
  await page.getByRole('button', { name: 'Red player: You' }).click()
  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(page.getByRole('heading', { name: 'Game over' })).toBeVisible({ timeout: 100_000 })
  await expect(page.getByRole('listitem')).toHaveCount(4)
})

test('the board fits the screen without sideways scrolling', async ({ page }) => {
  await page.goto('/?seed=7')
  await page.getByRole('button', { name: 'New game' }).click()
  await page.getByRole('button', { name: 'Start game' }).click()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBe(0)
})

import type { Page } from '@playwright/test'

export async function skillRequestJoin(page: Page, matchId: string) {
  await page.goto(`/matches/${matchId}`, { waitUntil: 'domcontentloaded' })

  const btn = page.getByTestId('request-join')
  if (await btn.count()) {
    await btn.click()
  } else {
    await page.getByRole('button', { name: /request join|request to join/i }).click()
  }
}

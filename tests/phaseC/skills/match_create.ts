import type { Page } from '@playwright/test'

export async function skillCreateMatchAndGetId(page: Page): Promise<string> {
  await page.goto('/matches/new', { waitUntil: 'domcontentloaded' })

  // required-count 在你页面里有重复（Duration 也用了同一个 testid）
  await page.getByTestId('required-count').first().fill('4')

  // 你页面按钮文字是 "Create Match"，没有 testid 也没关系
  await page.getByRole('button', { name: /create match/i }).click()

  await page.waitForURL(/\/matches\/[0-9a-f-]{36}/, { timeout: 30_000 })
  const url = page.url()
  const matchId = url.split('/matches/')[1]
  if (!matchId) throw new Error('Cannot parse matchId from URL: ' + url)
  return matchId
}

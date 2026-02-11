import type { Page } from '@playwright/test'

export async function skillApproveFirstPending(page: Page, matchId: string) {
  await page.goto(`/matches/${matchId}`, { waitUntil: 'domcontentloaded' })

  // 你可以按自己 UI 的实现选一个稳定的 testid
  const byTestIdCandidates = ['approve-first-pending', 'approve-participant', 'approve']
  for (const id of byTestIdCandidates) {
    const loc = page.getByTestId(id)
    if (await loc.count()) {
      await loc.first().click()
      return
    }
  }

  // fallback：按钮文字
  await page.getByRole('button', { name: /approve/i }).first().click()
}

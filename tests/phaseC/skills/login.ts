import type { Page } from '@playwright/test'

function storageHasSbToken(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || ''
      if (/^sb-.*-auth-token$/.test(k)) return true
    }
  } catch {}
  return false
}

async function contextHasSbCookie(page: Page): Promise<boolean> {
  const cookies = await page.context().cookies()
  return cookies.some((c) => /^sb-.*-auth-token$/.test(c.name))
}

export async function skillLogin(page: Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })

  const emailInput =
    (await page.getByTestId('login-email').count()) > 0
      ? page.getByTestId('login-email')
      : page.getByLabel('Email')

  const passInput =
    (await page.getByTestId('login-password').count()) > 0
      ? page.getByTestId('login-password')
      : page.getByLabel('Password')

  await emailInput.fill(email)
  await passInput.fill(password)

  const submitBtn =
    (await page.getByTestId('login-submit').count()) > 0
      ? page.getByTestId('login-submit')
      : page.getByRole('button', { name: /sign in|login/i })

  await submitBtn.click()

  // 等待三选一：URL 变化 / localStorage token / cookie token
  const timeoutMs = 15_000

  const waitUrl = page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: timeoutMs }).catch(() => null)

  const waitLocalStorage = page
    .waitForFunction(() => {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || ''
          if (/^sb-.*-auth-token$/.test(k)) return true
        }
      } catch {}
      return false
    }, null, { timeout: timeoutMs })
    .catch(() => null)

  const waitCookie = (async () => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await contextHasSbCookie(page)) return true
      await page.waitForTimeout(150)
    }
    return null
  })()

  const winner = await Promise.race([waitUrl, waitLocalStorage, waitCookie])

  // 成功条件：URL 离开 login 或 storage/cookie 有 token
  const nowUrl = page.url()
  const ok =
    (winner !== null && !nowUrl.includes('/login')) ||
    (await contextHasSbCookie(page)) ||
    (await page.evaluate(storageHasSbToken).catch(() => false))

  if (ok) return

  // ——失败：dump debug
  const cookies = await page.context().cookies()
  const cookieNames = cookies.map((c) => c.name).join(', ')
  const lsKeys = await page
    .evaluate(() => Object.keys(localStorage))
    .catch(() => []) as string[]

  const authErr = page.locator('[data-testid="auth-error"]')
  const authErrText = (await authErr.count())
    ? await authErr.first().innerText().catch(() => '')
    : ''

  const bodyText = (await page.textContent('body').catch(() => '')) || ''

  throw new Error(
    `Login failed.\n` +
      `url=${nowUrl}\n` +
      `cookies=[${cookieNames}]\n` +
      `localStorageKeys=[${lsKeys.join(', ')}]\n` +
      `authError=${authErrText}\n` +
      `bodyHint=${bodyText.slice(0, 200)}`
  )
}

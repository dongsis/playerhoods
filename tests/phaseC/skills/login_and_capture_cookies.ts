import type { BrowserContext, Cookie } from '@playwright/test'

function pickHint(s: string) {
  return s.replace(/\s+/g, ' ').trim().slice(0, 200)
}

export async function skillLoginAndCaptureCookies(
  ctx: BrowserContext,
  email: string,
  password: string
): Promise<Cookie[]> {
  const page = await ctx.newPage()

  await page.goto('/login', { waitUntil: 'domcontentloaded' })

  // 尽量兼容：testid 或 label
  const emailInput =
    (await page.getByTestId('login-email').count()) > 0
      ? page.getByTestId('login-email')
      : page.getByLabel(/email/i)

  const passInput =
    (await page.getByTestId('login-password').count()) > 0
      ? page.getByTestId('login-password')
      : page.getByLabel(/password/i)

  await emailInput.fill(email)
  await passInput.fill(password)

  // 点击登录按钮（testid 优先，否则文本兜底）
  const loginBtn =
    (await page.getByTestId('login-submit').count()) > 0
      ? page.getByTestId('login-submit')
      : page.getByRole('button', { name: /sign in|login/i })

  await loginBtn.click()

  // 给 SPA 一点时间更新状态
  await page.waitForTimeout(500)

  // 如果仍在 /login，判为失败并给诊断
  const nowUrl = page.url()
  if (nowUrl.includes('/login')) {
    const body = (await page.textContent('body').catch(() => '')) || ''
    const maybeError = page.locator(
      '[data-testid="auth-error"], [role="alert"], text=/invalid|failed|error|credentials/i'
    )
    const errText = (await maybeError.first().isVisible().catch(() => false))
      ? await maybeError.first().innerText().catch(() => '')
      : ''

    throw new Error(
      `Login stuck on /login.\nurl=${nowUrl}\nerror=${pickHint(errText)}\nbodyHint=${pickHint(body)}`
    )
  }

  // 登录成功后，cookies 应该已存在
  const cookies = await ctx.cookies()
  if (!cookies.length) {
    throw new Error(`Login success-ish but no cookies found. url=${page.url()}`)
  }

  await page.close()
  return cookies
}

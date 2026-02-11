import type { BrowserContext, Cookie } from '@playwright/test'

export async function cloneCookiesToContext(targetCtx: BrowserContext, cookies: Cookie[]) {
  // Playwright 要求每条 cookie 至少有 url 或 domain+path
  // ctx.cookies() 取出来的一般都有 domain/path，直接 addCookies 即可
  await targetCtx.addCookies(
    cookies.map((c) => ({
      ...c,
      // 某些 cookie 可能带 expires:-1 或 undefined，Playwright 可接受
    }))
  )
}

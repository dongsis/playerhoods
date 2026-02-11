import { defineConfig } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.phasec' })

export default defineConfig({
  testDir: 'tests/phaseC',
  use: {
    baseURL: process.env.PHASEC_BASE_URL || 'http://localhost:3000',
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  retries: 1,
  reporter: [['list']],
})

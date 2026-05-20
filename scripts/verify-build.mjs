import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const env = {
  ...process.env,
  NEXT_DIST_DIR: '.next-build',
}

const nextBin = process.platform === 'win32'
  ? join(process.cwd(), 'node_modules', '.bin', 'next.cmd')
  : join(process.cwd(), 'node_modules', '.bin', 'next')

const result = process.platform === 'win32'
  ? spawnSync(`"${nextBin}" build`, {
      stdio: 'inherit',
      env,
      shell: true,
    })
  : spawnSync(nextBin, ['build'], {
      stdio: 'inherit',
      env,
    })

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

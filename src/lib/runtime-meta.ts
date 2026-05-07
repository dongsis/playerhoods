import { readFile } from 'node:fs/promises'
import path from 'node:path'

let cachedBuildId: string | null = null

export async function getCurrentBuildId() {
  if (cachedBuildId) return cachedBuildId

  const distDir = process.env.NEXT_DIST_DIR?.trim() || '.next'
  const buildIdPath = path.join(process.cwd(), distDir, 'BUILD_ID')

  try {
    cachedBuildId = (await readFile(buildIdPath, 'utf8')).trim()
    return cachedBuildId
  } catch {
    cachedBuildId = 'dev'
    return cachedBuildId
  }
}

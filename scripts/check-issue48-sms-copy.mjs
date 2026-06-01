import { readFileSync } from 'node:fs'

const sourcePath = 'src/lib/notifications/channels/sms/render-notification-sms.ts'
const source = readFileSync(sourcePath, 'utf8')

function extractFunction(name) {
  const start = source.indexOf(`export function ${name}`)
  if (start === -1) {
    throw new Error(`${name} not found`)
  }

  const nextExport = source.indexOf('\nexport function ', start + 1)
  return source.slice(start, nextExport === -1 ? source.length : nextExport)
}

const criticalUpdate = extractFunction('renderCriticalUpdateSms')
const cancellation = extractFunction('renderCancellationSms')
const forbiddenCriticalSnippets = [
  'YES',
  'NO',
  'to join',
  'to decline',
]

const failures = []

for (const snippet of forbiddenCriticalSnippets) {
  if (criticalUpdate.includes(snippet)) {
    failures.push(`renderCriticalUpdateSms contains ${JSON.stringify(snippet)}`)
  }
}

if (!criticalUpdate.includes('Reply OUT ${match.replyCode}')) {
  failures.push('renderCriticalUpdateSms does not include OUT reply copy')
}

if (cancellation.includes('Reply OUT')) {
  failures.push('renderCancellationSms asks for OUT')
}

if (failures.length > 0) {
  console.error('Issue #48 SMS copy regression failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Issue #48 SMS copy regression passed')

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename } from 'node:path'

const container = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_playerhoods_codex'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  })

  if (result.status !== 0) {
    const stderr = result.stderr?.trim()
    const stdout = result.stdout?.trim()
    throw new Error(
      [
        `Command failed: ${command} ${args.join(' ')}`,
        stdout ? `stdout:\n${stdout}` : null,
        stderr ? `stderr:\n${stderr}` : null,
      ].filter(Boolean).join('\n\n'),
    )
  }

  return result.stdout.trim()
}

function loadSqlFile(filePath) {
  const sql = readFileSync(filePath, 'utf8')
  run(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: sql },
  )
  console.log(`Loaded ${basename(filePath)}`)
}

function runSuite(functionName) {
  const output = run('docker', [
    'exec',
    container,
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-t',
    '-A',
    '-c',
    `select json_build_object(
      'total', count(*),
      'failed', count(*) filter (where not ok),
      'failures', coalesce(
        json_agg(json_build_object('test_name', test_name, 'details', details) order by test_name) filter (where not ok),
        '[]'::json
      )
    )::text
    from public.${functionName}();`,
  ])

  return JSON.parse(output)
}

const suites = [
  {
    file: 'tests/test_runner_161.sql',
    functionName: 'test_runner_v161',
  },
  {
    file: 'tests/test_runner_match_regression_v2.sql',
    functionName: 'test_runner_match_regression_v2',
  },
  {
    file: 'tests/test_runner_participant_controls_template.sql',
    functionName: 'test_runner_participant_controls_template',
  },
  {
    file: 'tests/test_runner_contact_claimed_flow.sql',
    functionName: 'test_runner_contact_claimed_flow',
  },
  {
    file: 'tests/test_runner_privacy_invite_notification_formation.sql',
    functionName: 'test_runner_privacy_invite_notification_formation',
  },
  {
    file: 'tests/test_runner_qa_core_business_logic.sql',
    functionName: 'test_runner_qa_core_business_logic',
  },
  {
    file: 'tests/test_runner_issue48_sms_rsvp_hotfix.sql',
    functionName: 'test_runner_issue48_sms_rsvp_hotfix',
  },
  {
    file: 'tests/test_runner_issue58_reminder_only_drain.sql',
    functionName: 'test_runner_issue58_reminder_only_drain',
  },
  {
    file: 'tests/test_runner_issue61_sms_copy_payload_rpc.sql',
    functionName: 'test_runner_issue61_sms_copy_payload_rpc',
  },
]

for (const suite of suites) {
  loadSqlFile(suite.file)
  const result = runSuite(suite.functionName)
  const label = `${suite.functionName}: ${result.total - result.failed}/${result.total} passed`

  if (result.failed > 0) {
    console.error(label)
    for (const failure of result.failures) {
      console.error(`- ${failure.test_name}: ${failure.details}`)
    }
    process.exitCode = 1
  } else {
    console.log(label)
  }
}

if (process.exitCode) {
  process.exit(process.exitCode)
}

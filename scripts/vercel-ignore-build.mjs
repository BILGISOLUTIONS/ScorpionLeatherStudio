import { spawnSync } from 'node:child_process'

const previousSha = process.env.VERCEL_GIT_PREVIOUS_SHA?.trim()
const currentSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || 'HEAD'

const deploymentInputs = [
  'apps/configurator',
  'packages',
  'api',
  'server',
  'assets',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vercel.json',
  '.vercelignore',
  'scripts/vercel-ignore-build.mjs',
]

function continueBuild(reason) {
  console.log(`[vercel-ignore] build required: ${reason}`)
  process.exit(1)
}

function ignoreBuild(reason) {
  console.log(`[vercel-ignore] build skipped: ${reason}`)
  process.exit(0)
}

if (!previousSha || /^0+$/.test(previousSha)) {
  continueBuild('no previous successful deployment SHA is available')
}

if (previousSha === currentSha) {
  ignoreBuild('current commit already matches the previous successful deployment')
}

const result = spawnSync(
  'git',
  ['diff', '--quiet', previousSha, currentSha, '--', ...deploymentInputs],
  { stdio: 'inherit' },
)

if (result.error) {
  continueBuild(`git diff could not run (${result.error.message})`)
}

if (result.status === 0) {
  ignoreBuild('no Vercel runtime/build inputs changed')
}

if (result.status === 1) {
  continueBuild('Vercel runtime/build inputs changed')
}

continueBuild(`git diff returned unexpected status ${String(result.status)}`)

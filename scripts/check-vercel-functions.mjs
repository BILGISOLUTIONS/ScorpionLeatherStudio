import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const API_DIR = join(process.cwd(), 'api')
const LIMIT = 12
const CODE_EXTENSIONS = /\.(?:ts|tsx|js|mjs|cjs)$/u

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const functions = walk(API_DIR)
  .filter((path) => CODE_EXTENSIONS.test(path))
  .map((path) => relative(process.cwd(), path).replaceAll('\\\\', '/'))
  .sort()

console.log('Vercel API function candidates: ' + functions.length + '/' + LIMIT)
for (const file of functions) console.log(' - ' + file)

if (functions.length > LIMIT) {
  console.error(
    'Vercel Hobby supports at most ' + LIMIT + ' Serverless Functions. ' +
    'Move shared libraries/tests outside /api or consolidate endpoints.',
  )
  process.exit(1)
}

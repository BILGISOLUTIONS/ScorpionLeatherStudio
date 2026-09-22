import { gzipSync } from 'node:zlib'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dist = new URL('../apps/configurator/dist/', import.meta.url)
const assets = new URL('assets/', dist)
const html = readFileSync(new URL('index.html', dist), 'utf8')

const entryMatch = html.match(/<script[^>]+src="\/assets\/([^"]+\.js)"/u)
if (!entryMatch) {
  throw new Error('Could not identify the configurator entry JavaScript from dist/index.html.')
}

const assetDir = assets.pathname
const files = readdirSync(assetDir)
const entryFile = entryMatch[1]

function bytes(path) {
  return statSync(path).size
}

function gzipBytes(path) {
  return gzipSync(readFileSync(path), { level: 9 }).byteLength
}

function kb(value) {
  return (value / 1024).toFixed(1)
}

function enforce(label, actual, limit) {
  if (actual > limit) {
    throw new Error(`${label} exceeded budget: ${kb(actual)} kB > ${kb(limit)} kB`)
  }
  console.log(`✓ ${label}: ${kb(actual)} kB / ${kb(limit)} kB`)
}

const entryPath = join(assetDir, entryFile)
const jsFiles = files.filter((file) => file.endsWith('.js'))
const cssFiles = files.filter((file) => file.endsWith('.css'))
const lazyJs = jsFiles.filter((file) => file !== entryFile)

const ENTRY_RAW_LIMIT = 325 * 1024
const ENTRY_GZIP_LIMIT = 100 * 1024
const CSS_RAW_LIMIT = 50 * 1024
const CSS_GZIP_LIMIT = 15 * 1024
const LAZY_CHUNK_RAW_LIMIT = 1100 * 1024
const STAFF_HTML_RAW_LIMIT = 40 * 1024
const STAFF_HTML_GZIP_LIMIT = 10 * 1024

enforce('Initial JS (raw)', bytes(entryPath), ENTRY_RAW_LIMIT)
enforce('Initial JS (gzip)', gzipBytes(entryPath), ENTRY_GZIP_LIMIT)

const cssRaw = cssFiles.reduce((sum, file) => sum + bytes(join(assetDir, file)), 0)
const cssGzip = cssFiles.reduce((sum, file) => sum + gzipBytes(join(assetDir, file)), 0)
enforce('CSS total (raw)', cssRaw, CSS_RAW_LIMIT)
enforce('CSS total (gzip)', cssGzip, CSS_GZIP_LIMIT)

for (const file of lazyJs) {
  enforce(`Lazy JS chunk ${file} (raw)`, bytes(join(assetDir, file)), LAZY_CHUNK_RAW_LIMIT)
}

const staffPath = new URL('staff.html', dist).pathname
enforce('Staff console HTML (raw)', bytes(staffPath), STAFF_HTML_RAW_LIMIT)
enforce('Staff console HTML (gzip)', gzipBytes(staffPath), STAFF_HTML_GZIP_LIMIT)

console.log(`Entry: ${entryFile}`)
console.log(`Lazy JS chunks: ${lazyJs.length}`)
console.log('Performance budgets passed.')

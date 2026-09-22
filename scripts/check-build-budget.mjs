import { gzipSync } from 'node:zlib'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dist = new URL('../apps/configurator/dist/', import.meta.url)
const assets = new URL('assets/', dist)
const manifest = JSON.parse(readFileSync(new URL('.vite/manifest.json', dist), 'utf8'))

const assetDir = assets.pathname
const files = readdirSync(assetDir)

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

function findEntry(source) {
  const match = Object.entries(manifest).find(([, value]) =>
    value?.isEntry && (value.src === source || value.name === source.replace(/\.html$/u, '')),
  )
  if (!match) throw new Error(`Could not identify Vite entry for ${source}.`)
  return match[0]
}

function collectEntryGraph(entryKey) {
  const visited = new Set()
  const js = new Set()
  const css = new Set()

  const visit = (key) => {
    if (visited.has(key)) return
    visited.add(key)

    const chunk = manifest[key]
    if (!chunk) throw new Error(`Vite manifest references missing chunk ${key}.`)
    if (chunk.file?.endsWith('.js')) js.add(chunk.file)
    for (const file of chunk.css ?? []) css.add(file)
    for (const imported of chunk.imports ?? []) visit(imported)
  }

  visit(entryKey)
  return { js, css }
}

function sumAssetSet(assetSet, measure) {
  return [...assetSet].reduce((sum, file) => sum + measure(join(dist.pathname, file)), 0)
}

const studioGraph = collectEntryGraph(findEntry('index.html'))
const materialLabGraph = collectEntryGraph(findEntry('materials.html'))
const captureGraph = collectEntryGraph(findEntry('capture.html'))
const processorGraph = collectEntryGraph(findEntry('process.html'))
const materialQaGraph = collectEntryGraph(findEntry('material-qa.html'))
const promotionGraph = collectEntryGraph(findEntry('promote.html'))

const STUDIO_JS_RAW_LIMIT = 285 * 1024
const STUDIO_JS_GZIP_LIMIT = 88 * 1024
const STUDIO_CSS_RAW_LIMIT = 50 * 1024
const STUDIO_CSS_GZIP_LIMIT = 15 * 1024

const MATERIAL_LAB_JS_RAW_LIMIT = 300 * 1024
const MATERIAL_LAB_JS_GZIP_LIMIT = 95 * 1024
const MATERIAL_LAB_CSS_RAW_LIMIT = 24 * 1024
const MATERIAL_LAB_CSS_GZIP_LIMIT = 8 * 1024

const CAPTURE_JS_RAW_LIMIT = 320 * 1024
const CAPTURE_JS_GZIP_LIMIT = 100 * 1024
const CAPTURE_CSS_RAW_LIMIT = 28 * 1024
const CAPTURE_CSS_GZIP_LIMIT = 9 * 1024

const PROCESSOR_JS_RAW_LIMIT = 340 * 1024
const PROCESSOR_JS_GZIP_LIMIT = 105 * 1024
const PROCESSOR_CSS_RAW_LIMIT = 30 * 1024
const PROCESSOR_CSS_GZIP_LIMIT = 10 * 1024

const MATERIAL_QA_JS_RAW_LIMIT = 1250 * 1024
const MATERIAL_QA_JS_GZIP_LIMIT = 360 * 1024
const MATERIAL_QA_CSS_RAW_LIMIT = 32 * 1024
const MATERIAL_QA_CSS_GZIP_LIMIT = 11 * 1024

const PROMOTION_JS_RAW_LIMIT = 330 * 1024
const PROMOTION_JS_GZIP_LIMIT = 105 * 1024
const PROMOTION_CSS_RAW_LIMIT = 34 * 1024
const PROMOTION_CSS_GZIP_LIMIT = 11 * 1024

const LAZY_CHUNK_RAW_LIMIT = 1100 * 1024
const LAZY_CHUNK_GZIP_LIMIT = 300 * 1024
const ORDER_CAPTURE_RAW_LIMIT = 24 * 1024
const ORDER_CAPTURE_GZIP_LIMIT = 10 * 1024

const STAFF_HTML_RAW_LIMIT = 10 * 1024
const STAFF_HTML_GZIP_LIMIT = 4 * 1024
const STAFF_ASSETS_RAW_LIMIT = 28 * 1024
const STAFF_ASSETS_GZIP_LIMIT = 9 * 1024

enforce('Studio initial JS graph (raw)', sumAssetSet(studioGraph.js, bytes), STUDIO_JS_RAW_LIMIT)
enforce('Studio initial JS graph (gzip)', sumAssetSet(studioGraph.js, gzipBytes), STUDIO_JS_GZIP_LIMIT)
enforce('Studio initial CSS graph (raw)', sumAssetSet(studioGraph.css, bytes), STUDIO_CSS_RAW_LIMIT)
enforce('Studio initial CSS graph (gzip)', sumAssetSet(studioGraph.css, gzipBytes), STUDIO_CSS_GZIP_LIMIT)

enforce('Material Lab initial JS graph (raw)', sumAssetSet(materialLabGraph.js, bytes), MATERIAL_LAB_JS_RAW_LIMIT)
enforce('Material Lab initial JS graph (gzip)', sumAssetSet(materialLabGraph.js, gzipBytes), MATERIAL_LAB_JS_GZIP_LIMIT)
enforce('Material Lab CSS graph (raw)', sumAssetSet(materialLabGraph.css, bytes), MATERIAL_LAB_CSS_RAW_LIMIT)
enforce('Material Lab CSS graph (gzip)', sumAssetSet(materialLabGraph.css, gzipBytes), MATERIAL_LAB_CSS_GZIP_LIMIT)

enforce('Field Capture initial JS graph (raw)', sumAssetSet(captureGraph.js, bytes), CAPTURE_JS_RAW_LIMIT)
enforce('Field Capture initial JS graph (gzip)', sumAssetSet(captureGraph.js, gzipBytes), CAPTURE_JS_GZIP_LIMIT)
enforce('Field Capture CSS graph (raw)', sumAssetSet(captureGraph.css, bytes), CAPTURE_CSS_RAW_LIMIT)
enforce('Field Capture CSS graph (gzip)', sumAssetSet(captureGraph.css, gzipBytes), CAPTURE_CSS_GZIP_LIMIT)

enforce('Material Processor initial JS graph (raw)', sumAssetSet(processorGraph.js, bytes), PROCESSOR_JS_RAW_LIMIT)
enforce('Material Processor initial JS graph (gzip)', sumAssetSet(processorGraph.js, gzipBytes), PROCESSOR_JS_GZIP_LIMIT)
enforce('Material Processor CSS graph (raw)', sumAssetSet(processorGraph.css, bytes), PROCESSOR_CSS_RAW_LIMIT)
enforce('Material Processor CSS graph (gzip)', sumAssetSet(processorGraph.css, gzipBytes), PROCESSOR_CSS_GZIP_LIMIT)

enforce('Material QA initial JS graph (raw)', sumAssetSet(materialQaGraph.js, bytes), MATERIAL_QA_JS_RAW_LIMIT)
enforce('Material QA initial JS graph (gzip)', sumAssetSet(materialQaGraph.js, gzipBytes), MATERIAL_QA_JS_GZIP_LIMIT)
enforce('Material QA CSS graph (raw)', sumAssetSet(materialQaGraph.css, bytes), MATERIAL_QA_CSS_RAW_LIMIT)
enforce('Material QA CSS graph (gzip)', sumAssetSet(materialQaGraph.css, gzipBytes), MATERIAL_QA_CSS_GZIP_LIMIT)

enforce('Material Promotion initial JS graph (raw)', sumAssetSet(promotionGraph.js, bytes), PROMOTION_JS_RAW_LIMIT)
enforce('Material Promotion initial JS graph (gzip)', sumAssetSet(promotionGraph.js, gzipBytes), PROMOTION_JS_GZIP_LIMIT)
enforce('Material Promotion CSS graph (raw)', sumAssetSet(promotionGraph.css, bytes), PROMOTION_CSS_RAW_LIMIT)
enforce('Material Promotion CSS graph (gzip)', sumAssetSet(promotionGraph.css, gzipBytes), PROMOTION_CSS_GZIP_LIMIT)

const jsFiles = files.filter((file) => file.endsWith('.js'))
for (const file of jsFiles) {
  const path = join(assetDir, file)
  enforce(`JS chunk ${file} (raw)`, bytes(path), LAZY_CHUNK_RAW_LIMIT)
  enforce(`JS chunk ${file} (gzip)`, gzipBytes(path), LAZY_CHUNK_GZIP_LIMIT)

  if (file.startsWith('OrderCapture-')) {
    enforce('Order capture chunk (raw)', bytes(path), ORDER_CAPTURE_RAW_LIMIT)
    enforce('Order capture chunk (gzip)', gzipBytes(path), ORDER_CAPTURE_GZIP_LIMIT)
  }
}

const staffPath = new URL('staff.html', dist).pathname
const staffCssPath = new URL('staff.css', dist).pathname
const staffJsPath = new URL('staff.js', dist).pathname
enforce('Staff console HTML (raw)', bytes(staffPath), STAFF_HTML_RAW_LIMIT)
enforce('Staff console HTML (gzip)', gzipBytes(staffPath), STAFF_HTML_GZIP_LIMIT)

const staffAssetsRaw = bytes(staffCssPath) + bytes(staffJsPath)
const staffAssetsGzip = gzipBytes(staffCssPath) + gzipBytes(staffJsPath)
enforce('Staff console assets (raw)', staffAssetsRaw, STAFF_ASSETS_RAW_LIMIT)
enforce('Staff console assets (gzip)', staffAssetsGzip, STAFF_ASSETS_GZIP_LIMIT)

console.log(`Studio initial JS files: ${[...studioGraph.js].join(', ')}`)
console.log(`Material Lab initial JS files: ${[...materialLabGraph.js].join(', ')}`)
console.log(`Field Capture initial JS files: ${[...captureGraph.js].join(', ')}`)
console.log(`Material Processor initial JS files: ${[...processorGraph.js].join(', ')}`)
console.log(`Material QA initial JS files: ${[...materialQaGraph.js].join(', ')}`)
console.log(`Material Promotion initial JS files: ${[...promotionGraph.js].join(', ')}`)
console.log(`Emitted JS chunks: ${jsFiles.length}`)
console.log('Performance budgets passed.')

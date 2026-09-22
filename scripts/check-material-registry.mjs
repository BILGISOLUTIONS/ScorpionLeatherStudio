import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

const root = process.cwd()
const registryDir = join(root, 'apps/configurator/src/material-registry')
const publicDir = join(root, 'apps/configurator/public')

const lifecycleValues = new Set(['reference-only', 'captured-master', 'production-approved'])
const availabilityValues = new Set(['confirmed', 'quote', 'unverified'])
const requiredLeatherMaps = ['baseColor', 'normal', 'roughness']

const tierBudgets = {
  1024: 4 * 1024 * 1024,
  2048: 12 * 1024 * 1024,
  4096: 30 * 1024 * 1024,
}

function fail(message) {
  throw new Error(message)
}

function readRegistry() {
  return readdirSync(registryDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const path = join(registryDir, name)
      const material = JSON.parse(readFileSync(path, 'utf8'))
      return { name, path, material }
    })
}

function publicAssetPath(url) {
  if (typeof url !== 'string' || !url.startsWith('/')) {
    fail('Material texture URL must be root-relative: ' + String(url))
  }

  const assetPath = resolve(publicDir, url.replace(/^\/+/, ''))
  const allowedRoot = resolve(publicDir) + sep
  if (!assetPath.startsWith(allowedRoot)) {
    fail('Material texture URL escapes the public asset root: ' + url)
  }
  return assetPath
}

const records = readRegistry()
const ids = new Set()

for (const { name, material } of records) {
  if (material.schemaVersion !== 1) fail(name + ': unsupported schemaVersion')
  if (typeof material.id !== 'string' || !material.id.trim()) fail(name + ': material id is required')
  if (name !== material.id + '.json') fail(name + ': filename must match material id ' + material.id)
  if (ids.has(material.id)) fail(name + ': duplicate material id ' + material.id)
  ids.add(material.id)

  if (!lifecycleValues.has(material.lifecycle)) fail(name + ': invalid lifecycle ' + material.lifecycle)
  if (!availabilityValues.has(material.availability)) fail(name + ': invalid availability ' + material.availability)
  if (!/^#[0-9a-f]{6}$/i.test(material.previewColor ?? '')) fail(name + ': invalid previewColor')

  if (material.lifecycle !== 'production-approved') continue

  if (!material.approval?.reviewer?.trim()) fail(name + ': production material requires approval reviewer')
  if (!material.approval?.reviewedAt) fail(name + ': production material requires approval timestamp')
  if (material.approval?.decision !== 'approved-for-registry-promotion') {
    fail(name + ': production material requires approved-for-registry-promotion decision')
  }

  if (material.kind === 'leather') {
    const tiers = Array.isArray(material.textureTiers) ? material.textureTiers : []
    if (!tiers.some((tier) => tier.maxEdge === 1024)) fail(name + ': production leather requires 1K tier')

    for (const tier of tiers) {
      if (![1024, 2048, 4096].includes(tier.maxEdge)) {
        fail(name + ': unsupported texture tier ' + tier.maxEdge)
      }

      let totalBytes = 0
      for (const mapName of requiredLeatherMaps) {
        const url = tier.textures?.[mapName]
        if (!url) fail(name + ': ' + tier.maxEdge + 'px tier missing ' + mapName)

        const assetPath = publicAssetPath(url)
        if (!existsSync(assetPath)) {
          fail(name + ': missing production asset ' + url)
        }
        totalBytes += statSync(assetPath).size
      }

      const limit = tierBudgets[tier.maxEdge]
      if (totalBytes > limit) {
        fail(
          name + ': ' + tier.maxEdge + 'px texture tier exceeds budget ' +
          (totalBytes / 1024 / 1024).toFixed(2) + ' MB > ' +
          (limit / 1024 / 1024).toFixed(2) + ' MB'
        )
      }

      console.log(
        '✓ ' + material.id + ' ' + tier.maxEdge + 'px tier: ' +
        (totalBytes / 1024).toFixed(1) + ' kB'
      )
    }
  }
}

console.log('Material registry records: ' + records.length)
console.log('Material registry validation passed.')

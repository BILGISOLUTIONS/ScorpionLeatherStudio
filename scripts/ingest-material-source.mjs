#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const POLY_HAVEN_API = 'https://api.polyhaven.com'
const POLY_HAVEN_ASSET = 'https://polyhaven.com/a'
const POLY_HAVEN_LICENSE = 'https://creativecommons.org/publicdomain/zero/1.0/'
const SOURCE_SCHEMA_VERSION = 1
const KTX_SCHEMA_VERSION = 1
const CHANNEL_ORDER = ['baseColor', 'normal', 'roughness', 'ambientOcclusion', 'height', 'metalness']
const KTX_CHANNELS = new Set(['baseColor', 'normal', 'roughness', 'ambientOcclusion'])
const RESOLUTION_ORDER = ['1k', '2k', '4k', '8k', '16k']

function parseArgs(argv) {
  const result = {
    provider: 'polyhaven',
    query: '',
    asset: '',
    out: '.sls-material-sources',
    resolution: '1k',
    limit: 12,
    download: false,
    dryRun: false,
    selfTest: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--provider') result.provider = argv[++index] ?? ''
    else if (value === '--query') result.query = argv[++index] ?? ''
    else if (value === '--asset') result.asset = argv[++index] ?? ''
    else if (value === '--out') result.out = argv[++index] ?? ''
    else if (value === '--resolution') result.resolution = (argv[++index] ?? '').toLowerCase()
    else if (value === '--limit') result.limit = Number.parseInt(argv[++index] ?? '', 10)
    else if (value === '--download') result.download = true
    else if (value === '--dry-run') result.dryRun = true
    else if (value === '--self-test') result.selfTest = true
    else throw new Error(`Unknown argument: ${value}`)
  }

  if (result.provider !== 'polyhaven') throw new Error('V0.35 currently implements only provider "polyhaven".')
  if (!RESOLUTION_ORDER.includes(result.resolution)) {
    throw new Error(`Unsupported resolution "${result.resolution}". Use one of: ${RESOLUTION_ORDER.join(', ')}.`)
  }
  if (!Number.isInteger(result.limit) || result.limit < 1 || result.limit > 100) {
    throw new Error('--limit must be an integer from 1 to 100.')
  }
  return result
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function md5Bytes(bytes) {
  return createHash('md5').update(bytes).digest('hex')
}

function normalizeQuery(query) {
  const normalized = String(query ?? '').trim().toLowerCase().replace(/\s+/gu, ' ')
  if (!normalized) throw new Error('Search query is required.')
  if (normalized.length > 100) throw new Error('Search query must be 100 characters or fewer.')
  return normalized
}

function polyHavenSearchUrl(query, limit) {
  const url = new URL('/search', POLY_HAVEN_API)
  url.searchParams.set('q', normalizeQuery(query))
  url.searchParams.set('t', 'textures')
  url.searchParams.set('future', 'false')
  url.searchParams.set('limit', String(limit))
  return url.toString()
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'ScorpionLeatherStudio-MaterialIngest/0.35',
    },
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status} for ${url}${body ? `: ${body.slice(0, 240)}` : ''}`)
  }
  return response.json()
}

function flattenFileTree(node, segments = [], output = []) {
  if (!isRecord(node)) return output

  if (typeof node.url === 'string') {
    output.push({
      path: segments.join('/'),
      url: node.url,
      md5: typeof node.md5 === 'string' ? node.md5.toLowerCase() : undefined,
      bytes: Number.isFinite(node.size) ? Number(node.size) : undefined,
    })
    return output
  }

  for (const [key, value] of Object.entries(node)) {
    flattenFileTree(value, [...segments, key], output)
  }
  return output
}

function extensionOf(file) {
  try {
    const pathname = new URL(file.url).pathname
    const extension = path.extname(pathname).slice(1).toLowerCase()
    if (extension) return extension
  } catch {}
  return path.extname(file.path).slice(1).toLowerCase()
}

function resolutionOf(file) {
  const haystack = `${file.path} ${file.url}`.toLowerCase()
  const match = haystack.match(/(?:^|[^0-9])(1k|2k|4k|8k|16k)(?:[^0-9]|$)/u)
  return match?.[1]
}

function channelOf(file) {
  const haystack = `${file.path} ${file.url}`.toLowerCase()
  if (/nor[_-]?dx|normal[_-]?(dx|directx)/u.test(haystack)) return null
  if (/nor[_-]?gl|normal[_-]?(gl|opengl)|(?:^|[^a-z])normal(?:[^a-z]|$)/u.test(haystack)) return 'normal'
  if (/(?:^|[^a-z])(diff|diffuse|albedo|basecolor|base[_-]?color)(?:[^a-z]|$)/u.test(haystack)) return 'baseColor'
  if (/rough/u.test(haystack)) return 'roughness'
  if (/(?:^|[^a-z])(ao|ambient[_-]?occlusion)(?:[^a-z]|$)/u.test(haystack)) return 'ambientOcclusion'
  if (/(?:^|[^a-z])(disp|displacement|height)(?:[^a-z]|$)/u.test(haystack)) return 'height'
  if (/metal/u.test(haystack)) return 'metalness'
  return null
}

function formatScore(channel, extension) {
  const lossless = ['png', 'tif', 'tiff', 'exr']
  const compact = ['jpg', 'jpeg', 'webp']
  if (channel === 'baseColor') {
    const preference = ['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'exr']
    const score = preference.indexOf(extension)
    return score === -1 ? 100 : score
  }
  if (lossless.includes(extension)) return lossless.indexOf(extension)
  if (compact.includes(extension)) return 20 + compact.indexOf(extension)
  return 100
}

function resolutionDistance(resolution, preferred) {
  const value = RESOLUTION_ORDER.indexOf(resolution ?? '')
  const target = RESOLUTION_ORDER.indexOf(preferred)
  if (value === -1) return 100
  return Math.abs(value - target)
}

function selectPolyHavenTextureFiles(fileTree, preferredResolution = '1k') {
  const leaves = flattenFileTree(fileTree)
  const candidates = leaves
    .map((file) => ({
      ...file,
      channel: channelOf(file),
      resolution: resolutionOf(file),
      format: extensionOf(file),
    }))
    .filter((file) => file.channel)

  const selected = []
  for (const channel of CHANNEL_ORDER) {
    const matches = candidates
      .filter((file) => file.channel === channel)
      .sort((a, b) => {
        const res = resolutionDistance(a.resolution, preferredResolution) - resolutionDistance(b.resolution, preferredResolution)
        if (res !== 0) return res
        return formatScore(channel, a.format) - formatScore(channel, b.format)
      })
    if (!matches.length) continue
    const winner = matches[0]
    selected.push({
      role: channel,
      sourcePath: winner.path,
      url: winner.url,
      ...(winner.md5 ? { md5: winner.md5 } : {}),
      ...(winner.bytes !== undefined ? { bytes: winner.bytes } : {}),
      ...(winner.resolution ? { resolution: winner.resolution } : {}),
      ...(winner.format ? { format: winner.format } : {}),
      ...(channel === 'normal' ? { normalConvention: 'opengl' } : {}),
    })
  }
  return selected
}

function positiveDimensionPair(dimensions) {
  if (!Array.isArray(dimensions) || dimensions.length < 2) return undefined
  const pair = [Number(dimensions[0]), Number(dimensions[1])]
  return pair.every((value) => Number.isFinite(value) && value > 0) ? pair : undefined
}

function createPolyHavenSourceManifest({ assetId, info, files, preferredResolution = '1k', acquiredAt }) {
  if (!String(assetId).trim()) throw new Error('Poly Haven asset id is required.')
  if (!isRecord(info)) throw new Error('Poly Haven info payload must be an object.')
  if (Number(info.type) !== 1) throw new Error('Poly Haven source must be a texture asset.')
  const selected = selectPolyHavenTextureFiles(files, preferredResolution)
  if (!selected.some((file) => file.role === 'baseColor')) throw new Error('Poly Haven texture has no selectable diffuse/base-color map.')
  if (!selected.some((file) => file.role === 'normal')) throw new Error('Poly Haven texture has no selectable OpenGL normal map.')
  if (!selected.some((file) => file.role === 'roughness')) throw new Error('Poly Haven texture has no selectable roughness map.')

  const physicalDimensionsMm = positiveDimensionPair(info.dimensions)
  const manifest = {
    schemaVersion: SOURCE_SCHEMA_VERSION,
    provider: 'poly-haven',
    assetId,
    assetType: 'texture',
    label: String(info.name ?? assetId),
    sourceUrl: `${POLY_HAVEN_ASSET}/${encodeURIComponent(assetId)}`,
    providerApiUrl: POLY_HAVEN_API,
    license: {
      id: 'CC0-1.0',
      name: 'Creative Commons CC0 1.0 Universal',
      url: POLY_HAVEN_LICENSE,
      commercialUse: true,
      rawRedistribution: true,
    },
    access: {
      method: 'api',
      liveApiCreditRequired: true,
      credit: 'Powered by Poly Haven',
    },
    authority: 'development-reference',
    physicalScale: physicalDimensionsMm
      ? { confidence: 'provider-measured', dimensionsMm: physicalDimensionsMm }
      : { confidence: 'unknown' },
    preferredResolution,
    ...(typeof info.files_hash === 'string' ? { providerFilesHash: info.files_hash } : {}),
    ...(typeof info.thumbnail_url === 'string' ? { thumbnailUrl: info.thumbnail_url } : {}),
    ...(Array.isArray(info.tags) ? { tags: info.tags.filter((tag) => typeof tag === 'string') } : {}),
    ...(typeof info.category === 'string' ? { category: info.category } : {}),
    ...(acquiredAt ? { acquiredAt } : {}),
    files: selected,
  }

  const issues = validateSourceManifest(manifest)
  if (issues.length) throw new Error(`Generated source manifest is invalid: ${issues.join(' | ')}`)
  return manifest
}

function validateSourceManifest(manifest) {
  const issues = []
  if (!isRecord(manifest)) return ['manifest must be an object']
  if (manifest.schemaVersion !== SOURCE_SCHEMA_VERSION) issues.push('schemaVersion must be 1')
  if (!String(manifest.provider ?? '').trim()) issues.push('provider is required')
  if (!String(manifest.assetId ?? '').trim()) issues.push('assetId is required')
  if (manifest.assetType !== 'texture') issues.push('V0.35 source manifest currently supports texture assets only')
  if (manifest.authority !== 'development-reference') issues.push('external source assets must remain development-reference')
  if (!String(manifest.sourceUrl ?? '').startsWith('https://')) issues.push('sourceUrl must use HTTPS')
  if (manifest.license?.id !== 'CC0-1.0' && manifest.provider === 'poly-haven') issues.push('Poly Haven assets must be recorded as CC0-1.0')
  if (!manifest.license?.commercialUse) issues.push('commercial use permission must be explicit')
  if (!Array.isArray(manifest.files) || !manifest.files.length) issues.push('at least one source file is required')

  const dimensions = manifest.physicalScale?.dimensionsMm
  if (manifest.physicalScale?.confidence === 'provider-measured') {
    if (!Array.isArray(dimensions) || dimensions.length !== 2 || dimensions.some((value) => !Number.isFinite(value) || value <= 0)) {
      issues.push('provider-measured physical scale requires two positive millimeter dimensions')
    }
  }

  const seen = new Set()
  for (const file of manifest.files ?? []) {
    const key = `${file.role}:${file.resolution ?? ''}`
    if (seen.has(key)) issues.push(`duplicate source file role/resolution: ${key}`)
    seen.add(key)
    if (!CHANNEL_ORDER.includes(file.role)) issues.push(`unsupported file role: ${file.role}`)
    if (!String(file.url ?? '').startsWith('https://')) issues.push(`${file.role} URL must use HTTPS`)
    if (file.md5 && !/^[0-9a-f]{32}$/u.test(file.md5)) issues.push(`${file.role} md5 must be 32 lowercase hex characters`)
    if (file.role === 'normal' && file.normalConvention !== 'opengl') issues.push('normal map must use OpenGL convention')
  }
  return issues
}

function safeFilename(file) {
  const role = file.role.replace(/[^a-z0-9_-]/giu, '-')
  const extension = file.format?.replace(/[^a-z0-9]/giu, '') || 'bin'
  return `${role}.${extension}`
}

async function hashFile(filePath, algorithm) {
  const bytes = await readFile(filePath)
  return createHash(algorithm).update(bytes).digest('hex')
}

async function downloadOne(file, destination) {
  const response = await fetch(file.url, {
    headers: { 'User-Agent': 'ScorpionLeatherStudio-MaterialIngest/0.35' },
  })
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}) for ${file.url}`)

  const temporary = `${destination}.part`
  await rm(temporary, { force: true })
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary))
  const fileStat = await stat(temporary)
  if (file.bytes !== undefined && fileStat.size !== file.bytes) {
    await rm(temporary, { force: true })
    throw new Error(`Size mismatch for ${file.role}: expected ${file.bytes}, received ${fileStat.size}.`)
  }
  const md5 = await hashFile(temporary, 'md5')
  if (file.md5 && md5 !== file.md5) {
    await rm(temporary, { force: true })
    throw new Error(`MD5 mismatch for ${file.role}: expected ${file.md5}, received ${md5}.`)
  }
  const sha256 = await hashFile(temporary, 'sha256')
  await rename(temporary, destination)
  return { bytes: fileStat.size, md5, sha256 }
}

function createKtx2Manifest(sourceManifest, rawDirectory, runtimeDirectory, manifestRoot) {
  const jobs = sourceManifest.files
    .filter((file) => KTX_CHANNELS.has(file.role) && file.localPath)
    .map((file) => ({
      channel: file.role,
      input: path.relative(manifestRoot, path.join(rawDirectory, file.localPath)).replaceAll(path.sep, '/'),
      output: path.relative(manifestRoot, path.join(runtimeDirectory, `${file.role}.ktx2`)).replaceAll(path.sep, '/'),
    }))

  return {
    schemaVersion: KTX_SCHEMA_VERSION,
    materialId: `SLS-EXT-${sourceManifest.provider.toUpperCase()}-${sourceManifest.assetId.toUpperCase().replace(/[^A-Z0-9]+/gu, '-')}`,
    sourceManifest: 'source-manifest.json',
    jobs,
    report: 'ktx2-build-report.json',
  }
}

async function ingestPolyHavenAsset(assetId, options) {
  const encoded = encodeURIComponent(assetId)
  const [info, fileTree] = await Promise.all([
    fetchJson(`${POLY_HAVEN_API}/info/${encoded}`),
    fetchJson(`${POLY_HAVEN_API}/files/${encoded}`),
  ])
  const acquiredAt = options.download ? new Date().toISOString() : undefined
  const manifest = createPolyHavenSourceManifest({
    assetId,
    info,
    files: fileTree,
    preferredResolution: options.resolution,
    acquiredAt,
  })

  const assetRoot = path.resolve(options.out, 'poly-haven', assetId)
  const rawDirectory = path.join(assetRoot, 'raw')
  const runtimeDirectory = path.join(assetRoot, 'runtime', options.resolution)

  if (options.dryRun) {
    process.stdout.write(JSON.stringify({ assetRoot, manifest }, null, 2) + '\n')
    return
  }

  await mkdir(rawDirectory, { recursive: true })
  await mkdir(runtimeDirectory, { recursive: true })

  if (options.download) {
    for (const file of manifest.files) {
      const filename = safeFilename(file)
      const destination = path.join(rawDirectory, filename)
      process.stdout.write(`Downloading ${file.role} (${file.resolution ?? 'unknown'}) -> ${destination}\n`)
      const digest = await downloadOne(file, destination)
      file.localPath = filename
      file.downloadedBytes = digest.bytes
      file.verifiedMd5 = digest.md5
      file.sha256 = digest.sha256
    }
  }

  const sourcePath = path.join(assetRoot, 'source-manifest.json')
  await writeFile(sourcePath, JSON.stringify(manifest, null, 2) + '\n')

  if (options.download) {
    const ktxManifest = createKtx2Manifest(manifest, rawDirectory, runtimeDirectory, assetRoot)
    if (!ktxManifest.jobs.length) throw new Error('No KTX2-compatible maps were downloaded.')
    const ktxPath = path.join(assetRoot, 'material.ktx2.json')
    await writeFile(ktxPath, JSON.stringify(ktxManifest, null, 2) + '\n')
    process.stdout.write(`\nSource manifest: ${sourcePath}\nKTX2 manifest: ${ktxPath}\n`)
    process.stdout.write(`Next: npm run material:ktx2 -- --manifest ${ktxPath}\n`)
  } else {
    process.stdout.write(`Source manifest: ${sourcePath}\nUse --download to vendor and checksum the selected maps.\n`)
  }
}

async function searchPolyHaven(query, limit) {
  const url = polyHavenSearchUrl(query, limit)
  const payload = await fetchJson(url)
  const results = Array.isArray(payload?.results) ? payload.results : []
  process.stdout.write(`Powered by Poly Haven — ${payload?.total ?? results.length} matches\n`)
  for (const result of results) {
    const slug = String(result?.slug ?? '')
    const score = Number.isFinite(result?.score) ? Number(result.score).toFixed(4) : 'n/a'
    process.stdout.write(`${slug}\t${score}\t${POLY_HAVEN_ASSET}/${encodeURIComponent(slug)}\n`)
  }
}

function selfTest() {
  if (normalizeQuery('  Leather   Grain ') !== 'leather grain') throw new Error('Query normalization self-test failed.')
  const url = polyHavenSearchUrl('Leather Grain', 8)
  if (!url.includes('q=leather+grain') || !url.includes('t=textures') || !url.includes('limit=8')) {
    throw new Error('Poly Haven search URL self-test failed.')
  }

  const fixtureInfo = {
    name: 'Leather Test 01',
    type: 1,
    files_hash: 'abc123',
    dimensions: [1200, 900],
    tags: ['leather', 'grain'],
    category: 'Fabric & Leather/Leather',
    thumbnail_url: 'https://cdn.polyhaven.com/example.webp',
  }
  const fixtureFiles = {
    Diff: {
      '1k': {
        jpg: { url: 'https://cdn.polyhaven.com/test_diff_1k.jpg', md5: '11111111111111111111111111111111', size: 100 },
        png: { url: 'https://cdn.polyhaven.com/test_diff_1k.png', md5: '22222222222222222222222222222222', size: 200 },
      },
      '2k': { png: { url: 'https://cdn.polyhaven.com/test_diff_2k.png', md5: '33333333333333333333333333333333', size: 400 } },
    },
    nor_gl: { '1k': { png: { url: 'https://cdn.polyhaven.com/test_nor_gl_1k.png', md5: '44444444444444444444444444444444', size: 210 } } },
    nor_dx: { '1k': { png: { url: 'https://cdn.polyhaven.com/test_nor_dx_1k.png', md5: '55555555555555555555555555555555', size: 210 } } },
    Rough: { '1k': { png: { url: 'https://cdn.polyhaven.com/test_rough_1k.png', md5: '66666666666666666666666666666666', size: 120 } } },
    AO: { '1k': { png: { url: 'https://cdn.polyhaven.com/test_ao_1k.png', md5: '77777777777777777777777777777777', size: 110 } } },
    Displacement: { '1k': { png: { url: 'https://cdn.polyhaven.com/test_disp_1k.png', md5: '88888888888888888888888888888888', size: 130 } } },
  }
  const manifest = createPolyHavenSourceManifest({
    assetId: 'leather_test_01',
    info: fixtureInfo,
    files: fixtureFiles,
    preferredResolution: '1k',
    acquiredAt: '2026-09-30T00:00:00.000Z',
  })
  if (validateSourceManifest(manifest).length) throw new Error('Source manifest validation self-test failed.')
  if (manifest.files.find((file) => file.role === 'baseColor')?.format !== 'png') throw new Error('Base-color format preference self-test failed.')
  if (!manifest.files.find((file) => file.role === 'normal')?.url.includes('nor_gl')) throw new Error('OpenGL normal selection self-test failed.')
  if (manifest.files.some((file) => file.url.includes('nor_dx'))) throw new Error('DirectX normal exclusion self-test failed.')
  if (manifest.physicalScale.confidence !== 'provider-measured' || manifest.physicalScale.dimensionsMm[0] !== 1200) {
    throw new Error('Physical scale self-test failed.')
  }

  const bad = structuredClone(manifest)
  bad.authority = 'production-authority'
  if (!validateSourceManifest(bad).includes('external source assets must remain development-reference')) {
    throw new Error('Authority safety self-test failed.')
  }

  const ktxFixture = structuredClone(manifest)
  for (const file of ktxFixture.files) file.localPath = safeFilename(file)
  const ktx = createKtx2Manifest(
    ktxFixture,
    '/tmp/source/poly-haven/leather_test_01/raw',
    '/tmp/source/poly-haven/leather_test_01/runtime/1k',
    '/tmp/source/poly-haven/leather_test_01',
  )
  const baseJob = ktx.jobs.find((job) => job.channel === 'baseColor')
  if (baseJob?.input !== 'raw/baseColor.png' || baseJob?.output !== 'runtime/1k/baseColor.ktx2') {
    throw new Error('KTX2 manifest path self-test failed.')
  }
  if (ktx.sourceManifest !== 'source-manifest.json') throw new Error('KTX2 source-manifest path self-test failed.')

  const checksumBytes = Buffer.from('scorpion')
  if (sha256Bytes(checksumBytes).length !== 64 || md5Bytes(checksumBytes).length !== 32) {
    throw new Error('Checksum self-test failed.')
  }

  process.stdout.write('Material source ingestion self-test passed.\n')
}

const args = parseArgs(process.argv.slice(2))
if (args.selfTest) {
  selfTest()
} else if (args.query) {
  await searchPolyHaven(args.query, args.limit)
} else if (args.asset) {
  await ingestPolyHavenAsset(args.asset, args)
} else {
  process.stderr.write('Usage:\n')
  process.stderr.write('  npm run material:source -- --query "leather" [--limit 12]\n')
  process.stderr.write('  npm run material:source -- --asset <polyhaven-slug> [--resolution 1k] [--out <dir>] [--download] [--dry-run]\n')
  process.stderr.write('  npm run material:source:selftest\n')
  process.exitCode = 2
}

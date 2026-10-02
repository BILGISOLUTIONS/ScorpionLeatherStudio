#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { extname, resolve, dirname, basename } from 'node:path'

const API_ROOT = 'https://api.meshy.ai/openapi/v1/multi-image-to-3d'
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELED'])

function parseArgs(argv) {
  const out = { inputDir: '.', geometryResolution: null, pollSeconds: 10, timeoutSeconds: 1200, dryRun: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--job') out.job = argv[++i]
    else if (arg === '--input-dir') out.inputDir = argv[++i]
    else if (arg === '--output') out.output = argv[++i]
    else if (arg === '--geometry-resolution') out.geometryResolution = argv[++i]
    else if (arg === '--poll-seconds') out.pollSeconds = Number(argv[++i])
    else if (arg === '--timeout-seconds') out.timeoutSeconds = Number(argv[++i])
    else throw new Error('Unknown argument: ' + arg)
  }
  if (!out.job || !out.output) throw new Error('Usage: --job <job.json> --input-dir <dir> --output <model.glb> [--geometry-resolution standard|2k]')
  if (out.geometryResolution && !['standard', '2k'].includes(out.geometryResolution)) throw new Error('--geometry-resolution must be standard or 2k.')
  return out
}

function mimeFor(path) {
  const ext = extname(path).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  throw new Error('Unsupported prepared image format for Meshy runner: ' + ext)
}

async function dataUri(path) {
  const bytes = await readFile(path)
  return 'data:' + mimeFor(path) + ';base64,' + bytes.toString('base64')
}

async function responseJson(response) {
  const text = await response.text()
  let body
  try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text } }
  if (!response.ok) {
    const message = body?.message || body?.task_error?.message || body?.raw || response.statusText
    const error = new Error('Meshy API ' + response.status + ': ' + message)
    error.status = response.status
    error.retryAfter = response.headers.get('retry-after')
    throw error
  }
  return body
}

async function request(url, options, attempts = 4) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await responseJson(await fetch(url, options))
    } catch (error) {
      lastError = error
      const retryable = error?.status === 429 || (error?.status >= 500 && error?.status <= 599)
      if (!retryable || attempt === attempts) throw error
      const retryAfter = Number(error.retryAfter)
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(30000, 1500 * (2 ** (attempt - 1)))
      console.warn('[SLS] Meshy transient error; retrying in ' + Math.round(delayMs / 1000) + 's…')
      await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs))
    }
  }
  throw lastError
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const job = JSON.parse(await readFile(args.job, 'utf8'))
  if (job?.schemaVersion !== 1 || job?.status !== 'ready-for-external-reconstruction') throw new Error('Job is not a supported SLS reconstruction packet.')
  if (job?.provider?.id !== 'meshy') throw new Error('This runner only accepts provider.id=meshy jobs.')
  const sources = job.sourceImages ?? []
  if (sources.length < 1 || sources.length > 4) throw new Error('Meshy Multi-Image runner requires 1-4 prepared source images.')

  const geometryResolution = args.geometryResolution || (job.intent === 'draft' ? 'standard' : '2k')
  const sourcePaths = sources.map((source) => resolve(args.inputDir, source.preparedFileName))
  const plan = {
    endpoint: API_ROOT,
    jobId: job.jobId,
    sourceFiles: sourcePaths,
    aiModel: 'meshy-7.1',
    geometryResolution,
    shouldTexture: true,
    enablePbr: true,
    targetFormats: ['glb'],
    output: resolve(args.output),
    apiKeyConfigured: Boolean(process.env.MESHY_API_KEY),
  }

  if (args.dryRun) {
    console.log(JSON.stringify(plan, null, 2))
    return
  }

  const apiKey = process.env.MESHY_API_KEY
  if (!apiKey) throw new Error('MESHY_API_KEY is required in the environment. It must not be added to the SLS job JSON.')

  const imageUrls = []
  for (const path of sourcePaths) imageUrls.push(await dataUri(path))

  console.log('[SLS] Creating Meshy Multi-Image task with ' + imageUrls.length + ' prepared views…')
  const created = await request(API_ROOT, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_urls: imageUrls,
      ai_model: 'meshy-7.1',
      geometry_resolution: geometryResolution,
      should_texture: true,
      enable_pbr: true,
      remove_lighting: true,
      target_formats: ['glb'],
    }),
  })
  const taskId = created?.result
  if (!taskId) throw new Error('Meshy create response did not include a task ID.')

  const started = Date.now()
  let task
  while (Date.now() - started < args.timeoutSeconds * 1000) {
    task = await request(API_ROOT + '/' + encodeURIComponent(taskId), {
      headers: { Authorization: 'Bearer ' + apiKey },
    })
    const status = String(task?.status || '')
    const progress = Number(task?.progress || 0)
    console.log('[SLS] Meshy ' + status + ' · ' + progress + '%' + (task?.preceding_tasks ? ' · queue ahead ' + task.preceding_tasks : ''))
    if (TERMINAL.has(status)) break
    await new Promise((resolvePromise) => setTimeout(resolvePromise, Math.max(5, args.pollSeconds) * 1000))
  }

  if (!task || !TERMINAL.has(String(task.status))) throw new Error('Meshy task timed out before reaching a terminal state: ' + taskId)
  if (task.status !== 'SUCCEEDED') throw new Error('Meshy task ended as ' + task.status + ': ' + (task?.task_error?.message || 'no provider error message'))
  const glbUrl = task?.model_urls?.glb
  if (!glbUrl) throw new Error('Meshy task succeeded but did not return model_urls.glb.')

  const output = resolve(args.output)
  await mkdir(dirname(output), { recursive: true })
  console.log('[SLS] Downloading Meshy GLB…')
  const glbResponse = await fetch(glbUrl)
  if (!glbResponse.ok) throw new Error('GLB download failed: HTTP ' + glbResponse.status)
  await writeFile(output, Buffer.from(await glbResponse.arrayBuffer()))

  const metadataPath = output + '.provider.json'
  const metadata = {
    schemaVersion: 1,
    provider: 'meshy',
    jobId: job.jobId,
    taskId,
    status: task.status,
    progress: task.progress,
    consumedCredits: task.consumed_credits,
    createdAt: task.created_at,
    startedAt: task.started_at,
    finishedAt: task.finished_at,
    expiresAt: task.expires_at,
    geometryResolution,
    outputFile: basename(output),
  }
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf8')
  console.log('[SLS] Raw candidate: ' + output)
  console.log('[SLS] Provider metadata: ' + metadataPath)
  console.log('[SLS] Provider task reference: ' + taskId)
  console.log('[SLS] Next: intake as raw candidate, then Blender cleanup/preflight and Digital Twin QA.')
}

main().catch((error) => {
  console.error('[SLS] Meshy runner failed: ' + (error?.message || error))
  process.exitCode = 1
})

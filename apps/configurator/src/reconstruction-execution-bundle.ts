import type { ReconstructionJobPacket } from './digital-twin-ingestion-core'
import { buildProviderExecutionRecipe, type ProviderExecutionRecipe } from './reconstruction-provider-adapters'
import { buildStoredZip } from './capture-bundle'
import { sha256Hex } from './capture-integrity'

export interface ReconstructionExecutionBundleResult {
  blob: Blob
  fileName: string
  workspaceJob: ReconstructionJobPacket
  recipe: ProviderExecutionRecipe
  manifest: {
    schemaVersion: 1
    bundleType: 'sls-reconstruction-execution'
    jobId: string
    assetId: string
    providerId: string
    generatedAt: string
    sourceFiles: Array<{
      sourceKey: string
      archivePath: string
      originalPreparedFileName: string
      sizeBytes: number
      sha256: string
    }>
  }
}

function safePart(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-_]+/gu, '-').replace(/^-+|-+$/gu, '')
  return normalized || fallback
}

function extension(name: string): string {
  const match = name.toLowerCase().match(/(\.[a-z0-9]{1,8})$/u)
  return match?.[1] ?? '.bin'
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n'
}

export async function buildReconstructionExecutionBundle(args: {
  job: ReconstructionJobPacket
  preparedFiles: Readonly<Record<string, File>>
  generatedAt?: string
}): Promise<ReconstructionExecutionBundleResult> {
  const generatedAt = args.generatedAt ?? new Date().toISOString()
  const canonicalSources: Array<{
    sourceKey: string
    archivePath: string
    originalPreparedFileName: string
    sizeBytes: number
    sha256: string
    file: File
  }> = []

  for (let index = 0; index < args.job.sourceImages.length; index += 1) {
    const source = args.job.sourceImages[index]!
    const file = args.preparedFiles[source.sourceKey]
    if (!file) throw new Error('Missing prepared source bytes for ' + source.sourceKey + '.')
    if (file.name !== source.preparedFileName || file.size !== source.sizeBytes) {
      throw new Error('Prepared source bytes no longer match the reconstruction job: ' + source.sourceKey + '.')
    }

    const archivePath = 'sources/' + String(index + 1).padStart(2, '0') + '-' + safePart(source.sourceKey, 'source') + extension(file.name)
    canonicalSources.push({
      sourceKey: source.sourceKey,
      archivePath,
      originalPreparedFileName: source.preparedFileName,
      sizeBytes: file.size,
      sha256: await sha256Hex(file),
      file,
    })
  }

  const sourceByKey = new Map(canonicalSources.map((source) => [source.sourceKey, source]))
  const workspaceJob: ReconstructionJobPacket = {
    ...args.job,
    sourceImages: args.job.sourceImages.map((source) => ({
      ...source,
      preparedFileName: sourceByKey.get(source.sourceKey)!.archivePath,
    })),
  }
  const recipe = buildProviderExecutionRecipe(workspaceJob)
  const jobFileName = recipe.jobFileName
  const manifest = {
    schemaVersion: 1 as const,
    bundleType: 'sls-reconstruction-execution' as const,
    jobId: workspaceJob.jobId,
    assetId: workspaceJob.assetId,
    providerId: workspaceJob.provider.id,
    generatedAt,
    sourceFiles: canonicalSources.map(({ file: _file, ...source }) => source),
  }

  const readme = [
    'Scorpion Leather Studio — Reconstruction Execution Bundle',
    '',
    'Job: ' + workspaceJob.jobId,
    'Asset: ' + workspaceJob.assetId,
    'Provider: ' + workspaceJob.provider.label + ' (' + workspaceJob.provider.id + ')',
    'Generated: ' + generatedAt,
    '',
    'PURPOSE',
    'This workspace freezes the exact reconstruction job and exact prepared source bytes selected in Digital Twin Ingestion.',
    'The external provider output remains a raw reconstruction candidate and never becomes production authority automatically.',
    '',
    'CONTENTS',
    '- ' + jobFileName + ' — runner-ready reconstruction job; source paths point into sources/.',
    '- execution-recipe.json — provider adapter recipe and environment requirements.',
    '- execution-manifest.json — SHA-256 identity of every prepared source byte sequence.',
    '- SHA256SUMS.txt — integrity ledger for all bundle members except the ledger itself.',
    '- sources/ — canonical role-prefixed prepared inputs.',
    '',
    'RUN FROM THE EXTRACTED DIRECTORY',
    ...(recipe.installCommands.length ? ['Install:', ...recipe.installCommands.map((line) => '  ' + line)] : []),
    ...(recipe.requiredEnvironment.length ? ['Required environment: ' + recipe.requiredEnvironment.join(', ')] : ['Required environment: none']),
    ...(recipe.optionalEnvironment.length ? ['Optional environment: ' + recipe.optionalEnvironment.join(', ')] : []),
    recipe.command ? 'Command: ' + recipe.command : 'This provider has no vetted automated SLS runner; follow execution-recipe.json.',
    '',
    'SECURITY / AUTHORITY',
    '- No API key, token or provider credential is stored in this bundle.',
    '- Verify SHA256SUMS.txt after transfer before execution.',
    '- Do not rename or replace files under sources/ without creating a new SLS execution bundle.',
    '- Provider-generated geometry/materials remain candidate/reference data until cleanup and Digital Twin QA complete.',
    '',
  ].join('\n')

  const entries: Array<{ path: string; data: Blob | string | Uint8Array }> = [
    { path: 'README.txt', data: readme },
    { path: jobFileName, data: json(workspaceJob) },
    { path: 'execution-recipe.json', data: json(recipe) },
    { path: 'execution-manifest.json', data: json(manifest) },
    ...canonicalSources.map((source) => ({ path: source.archivePath, data: source.file })),
  ]

  const knownSourceHashes = new Map(canonicalSources.map((source) => [source.archivePath, source.sha256]))
  const checksums: string[] = []
  for (const entry of entries) {
    const digest = knownSourceHashes.get(entry.path) ?? await sha256Hex(entry.data)
    checksums.push(digest + '  ' + entry.path)
  }
  entries.push({ path: 'SHA256SUMS.txt', data: checksums.join('\n') + '\n' })

  const blob = await buildStoredZip(entries, new Date(generatedAt))
  return {
    blob,
    fileName: safePart(workspaceJob.jobId, 'sls-reconstruction-job') + '-execution.zip',
    workspaceJob,
    recipe,
    manifest,
  }
}

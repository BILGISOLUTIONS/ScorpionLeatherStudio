export type AdapterProviderId = 'trellis2' | 'meshy' | 'stable-fast-3d' | 'spar3d' | 'other'
export type AdapterIntent = 'draft' | 'production-candidate' | 'source-master'

export interface ReconstructionJobForAdapter {
  jobId: string
  assetId: string
  intent: AdapterIntent
  provider: {
    id: AdapterProviderId
    label: string
  }
  sourceImages: Array<{
    sourceKey: string
    preparedFileName: string
  }>
  outputRequest: {
    preferredFormat: 'glb'
    targetWebTriangles: number
    targetTextureEdge: number
  }
}

export interface ProviderExecutionRecipe {
  schemaVersion: 1
  jobId: string
  assetId: string
  providerId: AdapterProviderId
  label: string
  automation: 'automated' | 'manual'
  runner?: 'trellis2-gradio-python' | 'meshy-rest-node'
  runnerPath?: string
  jobFileName: string
  sourceFiles: string[]
  expectedOutputFile: string
  command?: string
  installCommands: string[]
  requiredEnvironment: string[]
  optionalEnvironment: string[]
  credentialsStoredInJob: false
  externalUploadRequired: true
  summary: string
  notes: string[]
  settings?: Record<string, string | number | boolean>
}

function q(value: string): string {
  return '"' + value.replaceAll('"', '\\"') + '"'
}

function boundedFaceTarget(value: number): number {
  if (!Number.isFinite(value)) return 150_000
  return Math.max(100_000, Math.min(1_000_000, Math.round(value / 10_000) * 10_000))
}

function boundedTextureTarget(value: number): number {
  if (!Number.isFinite(value)) return 2048
  if (value <= 1024) return 1024
  if (value >= 4096) return 4096
  return 2048
}

function deterministicSeed(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 1
}

export function buildProviderExecutionRecipe(job: ReconstructionJobForAdapter): ProviderExecutionRecipe {
  const jobFileName = job.jobId.toLowerCase() + '.json'
  const sourceFiles = job.sourceImages.map((image) => image.preparedFileName)
  const outputBase = job.assetId.trim() || 'sls-digital-twin'
  const faces = boundedFaceTarget(job.outputRequest.targetWebTriangles)
  const texture = boundedTextureTarget(job.outputRequest.targetTextureEdge)

  if (job.provider.id === 'trellis2') {
    const resolution = job.intent === 'draft' ? 512 : job.intent === 'source-master' ? 1536 : 1024
    const output = outputBase + '-trellis2.glb'
    return {
      schemaVersion: 1,
      jobId: job.jobId,
      assetId: job.assetId,
      providerId: job.provider.id,
      label: 'TRELLIS.2 Gradio runner',
      automation: 'automated',
      runner: 'trellis2-gradio-python',
      runnerPath: 'scripts/reconstruction/trellis2_gradio.py',
      jobFileName,
      sourceFiles,
      expectedOutputFile: output,
      command: [
        'python scripts/reconstruction/trellis2_gradio.py',
        '--job ' + q(jobFileName),
        '--input-dir ' + q('.'),
        '--output ' + q(output),
        '--resolution ' + resolution,
        '--faces ' + faces,
        '--texture ' + texture,
      ].join(' '),
      installCommands: ['python -m pip install --upgrade gradio_client'],
      requiredEnvironment: [],
      optionalEnvironment: ['HF_TOKEN'],
      credentialsStoredInJob: false,
      externalUploadRequired: true,
      summary: 'Runs the public Microsoft TRELLIS.2 Gradio workflow locally from the exported SLS job packet.',
      notes: [
        'Keep the same Gradio client session for generation and GLB extraction because the hosted Space carries generated state between calls.',
        'Public Hugging Face ZeroGPU capacity can queue, rate-limit, or fail independently of SLS; rerun without mutating the SLS job packet.',
        'The extracted GLB is still a raw reconstruction candidate and must pass the normal SLS cleanup and QA gates.',
      ],
      settings: {
        resolution,
        seed: deterministicSeed(job.jobId),
        decimationTarget: faces,
        textureSize: texture,
        ssGuidanceStrength: 7.5,
        ssGuidanceRescale: 0.7,
        ssSamplingSteps: 12,
        ssRescaleT: 5,
        shapeGuidanceStrength: 7.5,
        shapeGuidanceRescale: 0.5,
        shapeSamplingSteps: 12,
        shapeRescaleT: 3,
        textureGuidanceStrength: 1,
        textureGuidanceRescale: 0,
        textureSamplingSteps: 12,
        textureRescaleT: 3,
      },
    }
  }

  if (job.provider.id === 'meshy') {
    const geometryResolution = job.intent === 'draft' ? 'standard' : '2k'
    const output = outputBase + '-meshy.glb'
    return {
      schemaVersion: 1,
      jobId: job.jobId,
      assetId: job.assetId,
      providerId: job.provider.id,
      label: 'Meshy Multi-Image REST runner',
      automation: 'automated',
      runner: 'meshy-rest-node',
      runnerPath: 'scripts/reconstruction/meshy_multi_image.mjs',
      jobFileName,
      sourceFiles,
      expectedOutputFile: output,
      command: [
        'node scripts/reconstruction/meshy_multi_image.mjs',
        '--job ' + q(jobFileName),
        '--input-dir ' + q('.'),
        '--output ' + q(output),
        '--geometry-resolution ' + geometryResolution,
      ].join(' '),
      installCommands: [],
      requiredEnvironment: ['MESHY_API_KEY'],
      optionalEnvironment: [],
      credentialsStoredInJob: false,
      externalUploadRequired: true,
      summary: 'Creates a Meshy Multi-Image to 3D task from the exact SLS prepared-view set, polls it, and downloads the returned GLB.',
      notes: [
        'The API key is read only from MESHY_API_KEY and is never written into SLS job/candidate JSON.',
        'Local prepared images are encoded as data URIs for the API request so SLS does not need a separate public image host.',
        'A sibling provider-result JSON is written with task ID/status/credit metadata for provenance intake.',
      ],
      settings: {
        aiModel: 'meshy-7.1',
        geometryResolution,
        shouldTexture: true,
        enablePbr: true,
        targetFormat: 'glb',
      },
    }
  }

  const providerLabel = job.provider.label || job.provider.id
  return {
    schemaVersion: 1,
    jobId: job.jobId,
    assetId: job.assetId,
    providerId: job.provider.id,
    label: providerLabel + ' manual execution',
    automation: 'manual',
    jobFileName,
    sourceFiles,
    expectedOutputFile: outputBase + '-raw.glb',
    installCommands: [],
    requiredEnvironment: [],
    optionalEnvironment: [],
    credentialsStoredInJob: false,
    externalUploadRequired: true,
    summary: 'No vetted SLS runner is enabled for this provider yet. Use the job packet as the authoritative input manifest.',
    notes: [
      'Submit only the source images listed by the reconstruction job.',
      'Record the provider task/result reference and license/export terms when the model returns.',
      'Do not bypass raw-candidate intake or Digital Twin QA.',
    ],
  }
}

import { describe, expect, it } from 'vitest'
import {
  buildProviderExecutionRecipe,
  parseProviderResultMetadata,
  providerResultReference,
  type ReconstructionJobForAdapter,
} from './reconstruction-provider-adapters'

function job(providerId: ReconstructionJobForAdapter['provider']['id'], intent: ReconstructionJobForAdapter['intent'] = 'production-candidate'): ReconstructionJobForAdapter {
  return {
    jobId: 'SLS-RECON-20261002-ABC123',
    assetId: 'sc-wh-001-v1',
    intent,
    provider: { id: providerId, label: providerId === 'trellis2' ? 'Microsoft TRELLIS.2' : providerId === 'meshy' ? 'Meshy' : 'Other' },
    sourceImages: providerId === 'meshy'
      ? [
          { sourceKey: 'frontLeft45', preparedFileName: 'front-left.png' },
          { sourceKey: 'rearRight45', preparedFileName: 'rear-right.png' },
        ]
      : [{ sourceKey: 'frontLeft45', preparedFileName: 'front-left.png' }],
    outputRequest: {
      preferredFormat: 'glb',
      targetWebTriangles: 150_000,
      targetTextureEdge: 2048,
    },
  }
}

describe('reconstruction provider execution recipes', () => {
  it('builds a stateful TRELLIS.2 runner recipe without embedding credentials', () => {
    const recipe = buildProviderExecutionRecipe(job('trellis2'))
    expect(recipe.automation).toBe('automated')
    expect(recipe.runner).toBe('trellis2-gradio-python')
    expect(recipe.command).toContain('trellis2_gradio.py')
    expect(recipe.command).toContain('--faces 150000')
    expect(recipe.optionalEnvironment).toContain('HF_TOKEN')
    expect(recipe.credentialsStoredInJob).toBe(false)
    expect(recipe.settings?.resolution).toBe(1024)
  })

  it('uses higher TRELLIS resolution for source-master intent', () => {
    expect(buildProviderExecutionRecipe(job('trellis2', 'source-master')).settings?.resolution).toBe(1536)
  })

  it('builds a Meshy multi-image runner with environment-only API key', () => {
    const recipe = buildProviderExecutionRecipe(job('meshy'))
    expect(recipe.runner).toBe('meshy-rest-node')
    expect(recipe.requiredEnvironment).toEqual(['MESHY_API_KEY'])
    expect(recipe.command).toContain('--geometry-resolution 2k')
    expect(recipe.sourceFiles).toEqual(['front-left.png', 'rear-right.png'])
    expect(recipe.settings?.enablePbr).toBe(true)
  })

  it('keeps unvetted providers manual instead of inventing an API contract', () => {
    const recipe = buildProviderExecutionRecipe(job('other'))
    expect(recipe.automation).toBe('manual')
    expect(recipe.command).toBeUndefined()
  })

  it('accepts provider metadata only for the exact active job', () => {
    const active = job('meshy')
    const metadata = parseProviderResultMetadata({
      schemaVersion: 1,
      provider: 'meshy',
      jobId: active.jobId,
      taskId: 'task-123',
      status: 'SUCCEEDED',
    }, active)
    expect(providerResultReference(metadata)).toBe('task-123')
    expect(() => parseProviderResultMetadata({
      schemaVersion: 1,
      provider: 'meshy',
      jobId: 'wrong-job',
      taskId: 'task-123',
    }, active)).toThrow(/job ID/u)
  })
})

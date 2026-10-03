import { describe, expect, it } from 'vitest'
import { buildReconstructionPrepRecipe } from './reconstruction-prep-recipe'

describe('reconstruction preparation recipe', () => {
  it('builds a deterministic Blender normalization command without claiming approval', () => {
    const recipe = buildReconstructionPrepRecipe({
      candidateId: 'SLS-CAND-20261002-ABC123',
      assetId: 'sc-wh-001-v1',
      modelFile: { name: 'welding-hood-raw.glb' },
    })
    expect(recipe.handoffFile).toBe('sls-cand-20261002-abc123-processing-handoff.json')
    expect(recipe.normalizedModelFile).toBe('sc-wh-001-v1-normalized.glb')
    expect(recipe.command).toContain('sls_reconstruction_prepare.py')
    expect(recipe.command).toContain('--input "welding-hood-raw.glb"')
    expect(recipe.command).toContain('--save-blend "sc-wh-001-v1-normalized.blend"')
    expect(recipe.productionApproved).toBe(false)
  })

  it('rejects incomplete candidate identity', () => {
    expect(() => buildReconstructionPrepRecipe({
      candidateId: '',
      assetId: 'asset',
      modelFile: { name: 'raw.glb' },
    })).toThrow(/Candidate ID/u)
  })
})

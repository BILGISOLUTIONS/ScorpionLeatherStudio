import { describe, expect, it } from 'vitest'
import {
  createRendererMaterialMap,
  selectTextureTier,
  validateMaterialDefinition,
  type ScorpionMaterialDefinition,
} from './index'

const capturedLeather: ScorpionMaterialDefinition = {
  schemaVersion: 1,
  id: 'SCL-TEST',
  label: 'Captured Test Leather',
  kind: 'leather',
  lifecycle: 'production-approved',
  availability: 'confirmed',
  previewColor: '#8a4e2b',
  physical: {
    materialType: 'Cowhide',
    hide: 'Cowhide',
    grain: 'Textured',
    finish: 'Matte',
    thicknessMm: 2.1,
  },
  provenance: {
    source: 'field-capture',
    captureSessionId: 'CAP-001',
    crossPolarized: true,
    directionalLighting: true,
    scaleReference: true,
  },
  approval: {
    reviewer: 'QA Reviewer',
    reviewedAt: '2026-09-22T10:00:00.000Z',
    decision: 'approved-for-registry-promotion',
  },
  renderer: {
    roughness: 0.8,
    metalness: 0,
    sheen: 0.14,
    sheenRoughness: 0.77,
    normalScale: 0.8,
    textureRepeat: [2, 2],
  },
  textureTiers: [
    {
      maxEdge: 1024,
      textures: {
        baseColor: '/materials/SCL-TEST/1k/basecolor.webp',
        normal: '/materials/SCL-TEST/1k/normal.webp',
        roughness: '/materials/SCL-TEST/1k/roughness.webp',
      },
    },
    {
      maxEdge: 2048,
      textures: {
        baseColor: '/materials/SCL-TEST/2k/basecolor.webp',
        normal: '/materials/SCL-TEST/2k/normal.webp',
        roughness: '/materials/SCL-TEST/2k/roughness.webp',
      },
    },
  ],
}

describe('material library', () => {
  it('selects the best texture tier without exceeding the target', () => {
    expect(selectTextureTier(capturedLeather, 1600)?.maxEdge).toBe(1024)
    expect(selectTextureTier(capturedLeather, 2048)?.maxEdge).toBe(2048)
    expect(selectTextureTier(capturedLeather, 512)?.maxEdge).toBe(1024)
  })

  it('resolves material definitions into renderer variants', () => {
    const map = createRendererMaterialMap([capturedLeather], 1024)
    expect(map['SCL-TEST']).toMatchObject({
      id: 'SCL-TEST',
      label: 'Captured Test Leather',
      kind: 'leather',
      color: '#8a4e2b',
      roughness: 0.8,
      metalness: 0,
    })
    expect(map['SCL-TEST'].textures?.baseColor).toContain('/1k/')
  })

  it('does not allow reference-only placeholders to masquerade as production-approved material captures', () => {
    const invalid: ScorpionMaterialDefinition = {
      ...capturedLeather,
      lifecycle: 'production-approved',
      provenance: { source: 'synthetic-placeholder' },
      textureTiers: [],
    }

    expect(validateMaterialDefinition(invalid).map((issue) => issue.path)).toEqual(
      expect.arrayContaining(['provenance.source', 'textureTiers']),
    )
  })
})

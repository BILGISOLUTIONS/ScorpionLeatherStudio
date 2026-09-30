import { describe, expect, it } from 'vitest'
import {
  composeLeatherMaterialVariant,
  createRendererMaterialMap,
  mixHexColor,
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
    textureTileSizeMm: [200, 250],
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

  it('derives renderer repeat from the calibrated physical texture tile when no override is supplied', () => {
    const material: ScorpionMaterialDefinition = {
      ...capturedLeather,
      renderer: {
        roughness: 0.8,
        metalness: 0,
      },
    }

    const map = createRendererMaterialMap([material], 1024)
    expect(map['SCL-TEST'].textureRepeat).toEqual([5, 4])
  })

  it('requires physical texture scale metadata for mapped production leather', () => {
    const invalid: ScorpionMaterialDefinition = {
      ...capturedLeather,
      physical: { ...capturedLeather.physical, textureTileSizeMm: undefined },
    }

    expect(validateMaterialDefinition(invalid).map((issue) => issue.path)).toContain('physical.textureTileSizeMm')
  })

  it('rejects manual production repeat overrides that could change real-world grain scale', () => {
    const invalid: ScorpionMaterialDefinition = {
      ...capturedLeather,
      renderer: { ...capturedLeather.renderer, textureRepeat: [7, 7] },
    }

    expect(validateMaterialDefinition(invalid).map((issue) => issue.path)).toContain('renderer.textureRepeat')
  })

  it('composes a neutral leather structure with dye and finish without changing physical texture scale', () => {
    const neutral: ScorpionMaterialDefinition = {
      ...capturedLeather,
      id: 'SCL-NEUTRAL',
      previewColor: '#ffffff',
      lifecycle: 'captured-master',
      approval: undefined,
    }
    const result = composeLeatherMaterialVariant({
      structure: {
        id: 'neutral-cowhide',
        label: 'Neutral cowhide',
        materialId: neutral.id,
        compositionPolicy: 'tintable',
        availability: 'captured',
      },
      dye: {
        id: 'oxblood',
        label: 'Oxblood',
        mode: 'tint',
        color: '#4a0e17',
        tintStrength: 1,
        roughnessMultiplier: 1.04,
        availability: 'development',
      },
      finish: {
        id: 'satin',
        label: 'Satin',
        mode: 'finish',
        roughnessMultiplier: 0.82,
        sheenMultiplier: 1.25,
        clearcoatAdd: 0.04,
        normalScaleMultiplier: 0.95,
        availability: 'development',
      },
      materials: { [neutral.id]: neutral },
      preferredMaxEdge: 1024,
    })

    expect(result.dyeApplied).toBe(true)
    expect(result.finishApplied).toBe(true)
    expect(result.developmentOnly).toBe(true)
    expect(result.variant.color).toBe('#4a0e17')
    expect(result.variant.metalness).toBe(0)
    expect(result.variant.textureRepeat).toEqual([5, 4])
    expect(result.variant.textures?.baseColor).toContain('/1k/')
    expect(result.variant.roughness).toBeLessThan(neutral.renderer.roughness)
  })

  it('does not recolor a locked photographed leather structure', () => {
    const result = composeLeatherMaterialVariant({
      structure: {
        id: 'captured-cognac',
        label: 'Captured cognac',
        materialId: capturedLeather.id,
        compositionPolicy: 'locked',
        availability: 'captured',
      },
      dye: {
        id: 'emerald',
        label: 'Emerald',
        mode: 'tint',
        color: '#0b4632',
        tintStrength: 1,
        availability: 'development',
      },
      finish: {
        id: 'matte',
        label: 'Matte',
        mode: 'finish',
        roughnessMultiplier: 1.15,
        sheenMultiplier: 0.7,
        availability: 'development',
      },
      materials: { [capturedLeather.id]: capturedLeather },
    })

    expect(result.dyeApplied).toBe(false)
    expect(result.finishApplied).toBe(false)
    expect(result.variant.color).toBe(capturedLeather.previewColor)
    expect(result.warnings).toHaveLength(2)
  })

  it('mixes dye color deterministically for partial pigment strength', () => {
    expect(mixHexColor('#ffffff', '#000000', 0.5)).toBe('#808080')
    expect(mixHexColor('#ffffff', '#4a0e17', 1)).toBe('#4a0e17')
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

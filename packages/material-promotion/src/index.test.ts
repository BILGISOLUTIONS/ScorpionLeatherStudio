import { describe, expect, it } from 'vitest'
import type { ScorpionMaterialDefinition } from '@sls/material-library'
import {
  promoteMaterial,
  validatePromotionChain,
  validatePromotionTiers,
  type ProcessingManifest,
  type QaApprovalPacket,
} from './index'

const draft: ScorpionMaterialDefinition = {
  schemaVersion: 1,
  id: 'SCL-005',
  label: 'Saddle Brown Full Grain',
  kind: 'leather',
  lifecycle: 'captured-master',
  availability: 'confirmed',
  previewColor: '#805030',
  physical: {
    materialType: 'Cowhide',
    hide: 'Cowhide',
    grain: 'Full grain',
    finish: 'Matte',
    thicknessMm: 2.1,
  },
  provenance: {
    source: 'field-capture',
    captureSessionId: 'SC-CAP-005',
    capturedAt: '2026-09-22T10:00:00.000Z',
    operator: 'Capture Operator',
    crossPolarized: true,
    directionalLighting: true,
    scaleReference: true,
  },
  renderer: {
    roughness: 0.8,
    metalness: 0,
    sheen: 0.14,
    sheenRoughness: 0.76,
  },
}

const processing: ProcessingManifest = {
  schemaVersion: 1,
  materialId: 'SCL-005',
  label: draft.label,
  captureSessionId: 'SC-CAP-005',
  status: 'draft-pbr-review-required',
  derivedPreviewColor: '#8A4E2B',
  processor: {
    resolution: 1024,
    roughness: { baseRoughness: 0.78, method: 'normalized-reflectance-proxy' },
    normal: { strength: 2.2, method: 'four-direction-difference-normal' },
  },
  outputs: {
    baseColor: 'SCL-005-1k-basecolor.png',
    roughness: 'SCL-005-1k-roughness.png',
    normal: 'SCL-005-1k-normal.png',
  },
}

const qa: QaApprovalPacket = {
  schemaVersion: 1,
  materialId: 'SCL-005',
  label: draft.label,
  captureSessionId: 'SC-CAP-005',
  reviewedAt: '2026-09-22T10:30:00.000Z',
  reviewer: 'QA Reviewer',
  decision: 'approved-for-registry-promotion',
  automaticRegistryMutation: false,
  maps: {
    baseColor: { file: 'SCL-005-1k-basecolor.png', width: 1024, height: 1024 },
    roughness: { file: 'SCL-005-1k-roughness.png', width: 1024, height: 1024 },
    normal: { file: 'SCL-005-1k-normal.png', width: 1024, height: 1024 },
  },
  viewer: {
    repeat: 2.5,
    normalScale: 0.9,
    roughnessScalar: 0.82,
  },
  checks: {
    colorMatch: true,
    seamFree: true,
    scaleCorrect: true,
    normalCorrect: true,
    roughnessMatch: true,
    performanceAcceptable: true,
  },
}

describe('material promotion', () => {
  it('rejects mismatched provenance chains', () => {
    const mismatched = { ...qa, materialId: 'SCL-999' }
    expect(validatePromotionChain(draft, processing, mismatched).map((entry) => entry.path)).toContain('materialId')
  })

  it('requires the 1K baseline tier', () => {
    expect(validatePromotionTiers([
      { maxEdge: 2048, baseColor: 'b.webp', normal: 'n.png', roughness: 'r.png' },
    ]).map((entry) => entry.path)).toContain('tiers.1024')
  })

  it('creates a production-approved record and deterministic asset placement', () => {
    const result = promoteMaterial({
      draft,
      processing,
      qa,
      tiers: [
        {
          maxEdge: 1024,
          baseColor: 'source-base.png',
          normal: 'source-normal.png',
          roughness: 'source-roughness.png',
        },
        {
          maxEdge: 2048,
          baseColor: 'source-base-2k.png',
          normal: 'source-normal-2k.png',
          roughness: 'source-roughness-2k.png',
        },
      ],
      sourceQaPacket: 'SCL-005-qa-approval.json',
    })

    expect(result.material).toMatchObject({
      id: 'SCL-005',
      lifecycle: 'production-approved',
      previewColor: '#8A4E2B',
      approval: {
        reviewer: 'QA Reviewer',
        decision: 'approved-for-registry-promotion',
      },
      renderer: {
        roughness: 0.82,
        normalScale: 0.9,
        textureRepeat: [2.5, 2.5],
      },
    })
    expect(result.registryDestination).toBe('apps/configurator/src/material-registry/SCL-005.json')
    expect(result.assetPlacement.registryDestination).toBe('apps/configurator/src/material-registry/SCL-005.json')
    expect(result.material.textureTiers?.map((tier) => tier.maxEdge)).toEqual([1024, 2048])
    expect(result.assetPlacement.files).toContainEqual({
      tier: 1024,
      kind: 'baseColor',
      source: 'source-base.png',
      destination: '/materials/SCL-005/1k/basecolor.webp',
    })
  })

  it('requires a valid QA roughness scalar for production', () => {
    const invalid = {
      ...qa,
      viewer: { ...qa.viewer, roughnessScalar: 1.2 },
    }
    expect(validatePromotionChain(draft, processing, invalid).map((entry) => entry.path))
      .toContain('qa.viewer.roughnessScalar')
  })
})

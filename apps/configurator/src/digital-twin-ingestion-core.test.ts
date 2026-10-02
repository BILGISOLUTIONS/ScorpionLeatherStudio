import { describe, expect, it } from 'vitest'
import type { ProductConstructionPacket } from '@sls/product-capture'
import {
  buildDigitalTwinCandidatePacket,
  buildReconstructionJobPacket,
  buildReconstructionProcessingHandoff,
  evaluateDigitalTwinCandidate,
  recommendedReconstructionSourceKeys,
  type ReconstructionSourceFile,
} from './digital-twin-ingestion-core'

function construction(): ProductConstructionPacket {
  const refs = ['front', 'frontLeft45', 'left', 'rearLeft45', 'rear', 'rearRight45', 'right', 'frontRight45']
  return {
    schemaVersion: 1,
    productId: 'SC-WH-001',
    productLabel: 'Scorpion Leather Welding Hood',
    productCategory: 'Leather Welding Hood',
    sourceCaptureSessionId: 'SC-PROD-20261002-TEST',
    capturePlanId: 'scorpion-welding-hood-v1',
    generatedAt: '2026-10-02T06:00:00.000Z',
    status: 'ready-for-digital-twin-reconstruction',
    automaticAssetMutation: false,
    provenance: { operator: 'QA', capturedAt: '2026-10-02T05:00:00.000Z' },
    referenceCoverage: refs.map((key) => ({
      key,
      name: key + '.png',
      kind: 'required-view' as const,
      size: 1000,
      lastModified: 1,
    })),
    dimensionsMm: {
      maxWidth: 320,
      maxHeight: 410,
      maxDepth: 250,
    },
    constructionNodes: [
      { role: 'product-root', label: 'Root', nodeName: 'SLS_ProductRoot', status: 'confirmed' },
      { role: 'shell-main', label: 'Shell', nodeName: 'Shell_Main', status: 'confirmed' },
    ],
    components: [],
    materialSlots: [
      {
        slotId: 'LeatherPrimary',
        label: 'Leather',
        materialId: 'SCL-001',
        nodeNames: ['Shell_Main'],
        status: 'confirmed',
        evidenceFrameKeys: ['front'],
      },
    ],
  }
}

function source(key: string): ReconstructionSourceFile {
  return {
    sourceKey: key,
    sourceLabel: key,
    captureReferenceName: key + '.png',
    preparedFileName: key + '-prepared.png',
    sizeBytes: 2_000_000,
    type: 'image/png',
    lastModified: 1,
    geometryPreservedConfirmed: true,
  }
}

describe('digital twin ingestion', () => {
  it('recommends provider-appropriate source coverage', () => {
    const packet = construction()
    expect(recommendedReconstructionSourceKeys(packet, 'trellis2')).toEqual(['frontLeft45'])
    expect(recommendedReconstructionSourceKeys(packet, 'meshy')).toEqual([
      'front',
      'rear',
      'left',
      'right',
    ])
  })

  it('builds a bounded reconstruction job from physical provenance', () => {
    const job = buildReconstructionJobPacket({
      construction: construction(),
      providerId: 'meshy',
      sourceFiles: ['frontLeft45', 'rearRight45', 'frontRight45', 'rearLeft45'].map(source),
      jobId: 'SLS-RECON-TEST',
      assetId: 'sc-wh-001-v1',
      createdAt: '2026-10-02T06:10:00.000Z',
      intent: 'production-candidate',
    })
    expect(job.provider.inputMode).toBe('multi-image')
    expect(job.authority.realProductIsGeometryAuthority).toBe(true)
    expect(job.authority.aiGeneratedMaterialsAreReferenceOnly).toBe(true)
    expect(job.outputRequest.targetWebTriangles).toBe(150_000)
  })

  it('requires rights before a raw candidate can enter processing', () => {
    const packet = construction()
    const job = buildReconstructionJobPacket({
      construction: packet,
      providerId: 'trellis2',
      sourceFiles: [source('frontLeft45')],
      jobId: 'SLS-RECON-TEST',
      assetId: 'sc-wh-001-v1',
      createdAt: '2026-10-02T06:10:00.000Z',
      intent: 'production-candidate',
    })
    expect(() => buildDigitalTwinCandidatePacket({
      job,
      candidateId: 'SLS-CAND-TEST',
      generatedAt: '2026-10-02T06:11:00.000Z',
      modelFile: { name: 'hood.glb', sizeBytes: 12_000_000, type: 'model/gltf-binary' },
      rights: {
        sourcePhotosAuthorized: true,
        commercialUseConfirmed: false,
        exportRightsConfirmed: true,
        providerTermsReviewed: true,
      },
    })).toThrow(/commercialUseConfirmed/u)
  })

  it('generates the Blender/QA handoff from a valid candidate', () => {
    const packet = construction()
    const job = buildReconstructionJobPacket({
      construction: packet,
      providerId: 'trellis2',
      sourceFiles: [source('frontLeft45')],
      jobId: 'SLS-RECON-TEST',
      assetId: 'sc-wh-001-v1',
      createdAt: '2026-10-02T06:10:00.000Z',
      intent: 'production-candidate',
    })
    const candidate = buildDigitalTwinCandidatePacket({
      job,
      candidateId: 'SLS-CAND-TEST',
      generatedAt: '2026-10-02T06:11:00.000Z',
      modelFile: { name: 'hood.glb', sizeBytes: 12_000_000, type: 'model/gltf-binary' },
      rights: {
        sourcePhotosAuthorized: true,
        commercialUseConfirmed: true,
        exportRightsConfirmed: true,
        providerTermsReviewed: true,
      },
    })
    expect(evaluateDigitalTwinCandidate(job, candidate).filter((entry) => entry.severity === 'error')).toHaveLength(0)
    const handoff = buildReconstructionProcessingHandoff({ construction: packet, job, candidate })
    expect(handoff.authoritativeDimensionsMeters).toEqual({ width: 0.32, height: 0.41, depth: 0.25 })
    expect(handoff.semanticContract.requiredNodeNames).toContain('Shell_Main')
    expect(handoff.deliveryTarget.maxTriangles).toBe(150_000)
    expect(handoff.requiredStages.at(-1)).toBe('run-digital-twin-qa')
  })
})

import { describe, expect, it } from 'vitest'
import type { ReconstructionJobPacket } from './digital-twin-ingestion-core'
import { buildReconstructionExecutionBundle } from './reconstruction-execution-bundle'
import { readStoredZip } from './stored-zip-reader'

function job(): ReconstructionJobPacket {
  return {
    schemaVersion: 1,
    jobId: 'SLS-RECON-20261006-ABC123',
    assetId: 'sc-wh-001-v1',
    productId: 'SC-WH-001',
    productLabel: 'Scorpion Leather Welding Hood',
    sourceCaptureSessionId: 'SC-PROD-20261006-001',
    capturePlanId: 'scorpion-welding-hood-v1',
    createdAt: '2026-10-06T11:00:00.000Z',
    status: 'ready-for-external-reconstruction',
    provider: {
      id: 'meshy',
      label: 'Meshy',
      inputMode: 'multi-image',
      externalRuntime: true,
      credentialsStoredInPacket: false,
    },
    intent: 'production-candidate',
    sourceImages: [
      {
        sourceKey: 'front',
        sourceLabel: 'front',
        captureReferenceName: 'IMG_1001.jpg',
        preparedFileName: 'same-name.jpg',
        sizeBytes: 5,
        type: 'image/jpeg',
        lastModified: 1,
        geometryPreservedConfirmed: true,
      },
      {
        sourceKey: 'rear',
        sourceLabel: 'rear',
        captureReferenceName: 'IMG_1002.jpg',
        preparedFileName: 'same-name.jpg',
        sizeBytes: 4,
        type: 'image/jpeg',
        lastModified: 2,
        geometryPreservedConfirmed: true,
      },
    ],
    authority: {
      dimensionsMm: { maxWidth: 320, maxHeight: 410, maxDepth: 250 },
      confirmedSemanticNodes: ['SLS_ProductRoot'],
      confirmedMaterialSlots: ['LeatherPrimary'],
      realProductIsGeometryAuthority: true,
      aiGeneratedMaterialsAreReferenceOnly: true,
      automaticProductionPromotion: false,
    },
    outputRequest: {
      preferredFormat: 'glb',
      targetWebTriangles: 150000,
      targetTextureEdge: 2048,
      preservePbrWhenAvailable: true,
    },
  }
}

describe('V0.48 reconstruction execution bundle', () => {
  it('freezes exact source bytes into collision-safe canonical workspace paths', async () => {
    const front = new File(['front'], 'same-name.jpg', { type: 'image/jpeg', lastModified: 1 })
    const rear = new File(['rear'], 'same-name.jpg', { type: 'image/jpeg', lastModified: 2 })
    const packet = job()
    packet.sourceImages[0]!.sizeBytes = front.size
    packet.sourceImages[1]!.sizeBytes = rear.size

    const result = await buildReconstructionExecutionBundle({
      job: packet,
      preparedFiles: { front, rear },
      generatedAt: '2026-10-06T11:15:00.000Z',
    })

    expect(result.fileName).toBe('sls-recon-20261006-abc123-execution.zip')
    expect(result.workspaceJob.sourceImages.map((entry) => entry.preparedFileName)).toEqual([
      'sources/01-front.jpg',
      'sources/02-rear.jpg',
    ])
    expect(result.recipe.sourceFiles).toEqual(['sources/01-front.jpg', 'sources/02-rear.jpg'])
    expect(result.recipe.command).toContain('--input-dir "."')
    expect(result.manifest.sourceFiles.every((entry) => /^[a-f0-9]{64}$/u.test(entry.sha256))).toBe(true)

    const archive = await readStoredZip(result.blob)
    expect(archive.files.has('sources/01-front.jpg')).toBe(true)
    expect(archive.files.has('sources/02-rear.jpg')).toBe(true)
    expect(archive.files.has(result.recipe.jobFileName)).toBe(true)
    expect(archive.files.has('execution-recipe.json')).toBe(true)
    expect(archive.files.has('execution-manifest.json')).toBe(true)
    expect(archive.files.has('SHA256SUMS.txt')).toBe(true)

    const workspaceJob = JSON.parse(await archive.files.get(result.recipe.jobFileName)!.blob.text()) as ReconstructionJobPacket
    expect(workspaceJob.sourceImages[0]?.preparedFileName).toBe('sources/01-front.jpg')
    expect(workspaceJob.sourceImages[1]?.preparedFileName).toBe('sources/02-rear.jpg')

    const checksums = await archive.files.get('SHA256SUMS.txt')!.blob.text()
    expect(checksums).toMatch(/[a-f0-9]{64}  sources\/01-front\.jpg/u)
    expect(checksums).toMatch(/[a-f0-9]{64}  execution-manifest\.json/u)
  })

  it('rejects missing or changed prepared bytes instead of packaging a stale job', async () => {
    const packet = job()
    await expect(buildReconstructionExecutionBundle({
      job: packet,
      preparedFiles: {},
    })).rejects.toThrow(/Missing prepared source bytes/u)

    const changed = new File(['different-size'], 'same-name.jpg', { type: 'image/jpeg', lastModified: 1 })
    await expect(buildReconstructionExecutionBundle({
      job: packet,
      preparedFiles: { front: changed, rear: changed },
    })).rejects.toThrow(/no longer match the reconstruction job/u)
  })
})

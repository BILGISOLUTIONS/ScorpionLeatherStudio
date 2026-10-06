import { describe, expect, it } from 'vitest'
import { buildStoredZip } from './capture-bundle'
import { sha256Hex } from './capture-integrity'
import { loadVerifiedFieldEvidenceBundle } from './field-evidence-bundle'

async function buildBundle(overrides: { badSourceHash?: boolean; badLedger?: boolean } = {}): Promise<File> {
  const source = new Blob(['field-photo-front'], { type: 'image/jpeg' })
  const sourceSha = await sha256Hex(source)
  const construction = {
    schemaVersion: 1,
    productId: 'SC-WH-001',
    productLabel: 'Scorpion Leather Welding Hood',
    productCategory: 'Leather Welding Hood',
    sourceCaptureSessionId: 'SC-PROD-20261005-TEST',
    capturePlanId: 'scorpion-welding-hood-v1',
    generatedAt: '2026-10-05T20:00:00.000Z',
    status: 'ready-for-digital-twin-reconstruction',
    automaticAssetMutation: false,
    provenance: {
      operator: 'QA',
      capturedAt: '2026-10-05T19:00:00.000Z',
      singlePhysicalUnitConfirmed: true,
    },
    referenceCoverage: [{
      key: 'front',
      name: 'front.jpg',
      kind: 'required-view',
      size: source.size,
      lastModified: 1,
      sha256: sourceSha,
      imageWidthPx: 3024,
      imageHeightPx: 4032,
    }],
    dimensionsMm: { maxWidth: 320, maxHeight: 410, maxDepth: 250 },
    constructionNodes: [
      { role: 'product-root', label: 'Root', nodeName: 'SLS_ProductRoot', status: 'confirmed' },
    ],
    components: [],
    materialSlots: [
      { slotId: 'LeatherPrimary', label: 'Leather', materialId: 'SCL-001', nodeNames: ['SLS_ProductRoot'], status: 'confirmed', evidenceFrameKeys: ['front'] },
    ],
  }
  const index = {
    schemaVersion: 1,
    bundleType: 'sls-product-capture-evidence',
    generatedAt: '2026-10-05T20:00:00.000Z',
    productId: construction.productId,
    productLabel: construction.productLabel,
    captureSessionId: construction.sourceCaptureSessionId,
    capturePlanId: construction.capturePlanId,
    assetId: 'sc-wh-001-v1',
    authority: {
      singlePhysicalUnitConfirmed: true,
      physicalProductRemainsGeometryAuthority: true,
      localOnlyPackaging: true,
    },
    totals: {
      roleReferences: 1,
      supplementalReferences: 0,
      sourceImages: 1,
      sourceBytes: source.size,
    },
    qualityPreflight: {
      ready: true,
      blockerCount: 0,
      warningCount: 1,
      duplicateGroups: 0,
    },
    references: [{
      role: 'front',
      label: 'Straight front',
      required: true,
      archivePath: 'references/01-front.jpg',
      originalName: 'front.jpg',
      sizeBytes: source.size,
      type: 'image/jpeg',
      lastModified: 1,
      sha256: overrides.badSourceHash ? 'b'.repeat(64) : sourceSha,
      imageWidthPx: 3024,
      imageHeightPx: 4032,
    }],
    supplemental: [],
  }

  const payloads: Array<[string, Blob | string]> = [
    ['README.txt', 'SLS test bundle\n'],
    ['metadata/capture-session.json', '{"schemaVersion":1}\n'],
    ['metadata/construction-packet.json', JSON.stringify(construction, null, 2) + '\n'],
    ['metadata/asset-manifest-scaffold.json', '{"schemaVersion":1}\n'],
    ['metadata/capture-bundle-index.json', JSON.stringify(index, null, 2) + '\n'],
    ['references/01-front.jpg', source],
  ]

  const checksums: string[] = []
  for (const [path, data] of payloads) {
    const digest = await sha256Hex(typeof data === 'string' ? data : data)
    checksums.push((overrides.badLedger && path === 'README.txt' ? 'c'.repeat(64) : digest) + '  ' + path)
  }

  const zip = await buildStoredZip([
    ...payloads.map(([path, data]) => ({ path, data })),
    { path: 'SHA256SUMS.txt', data: checksums.join('\n') + '\n' },
  ], new Date('2026-10-05T20:00:00.000Z'))

  return new File([zip], 'SC-WH-001-field-evidence.zip', { type: 'application/zip' })
}

describe('V0.47 verified field-bundle intake', () => {
  it('verifies the complete bundle and reconstructs role/source provenance', async () => {
    const bundle = await loadVerifiedFieldEvidenceBundle(await buildBundle())
    expect(bundle.construction.productId).toBe('SC-WH-001')
    expect(bundle.index.assetId).toBe('sc-wh-001-v1')
    expect(bundle.roleSources.get('front')?.index.originalName).toBe('front.jpg')
    expect(bundle.roleSources.get('front')?.index.imageWidthPx).toBe(3024)
    expect(bundle.roleSources.get('front')?.blob.size).toBeGreaterThan(0)
    expect(bundle.verifiedFiles).toBe(6)
  })

  it('rejects a field bundle when any ledger checksum fails', async () => {
    await expect(loadVerifiedFieldEvidenceBundle(await buildBundle({ badLedger: true })))
      .rejects.toThrow(/SHA-256 verification failed/u)
  })

  it('rejects a source whose bundle index hash disagrees with the verified file ledger', async () => {
    await expect(loadVerifiedFieldEvidenceBundle(await buildBundle({ badSourceHash: true })))
      .rejects.toThrow(/source SHA-256 does not match its index/u)
  })
})

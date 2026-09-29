import { describe, expect, it } from 'vitest'
import {
  buildAssetManifestScaffold,
  buildProductConstructionPacket,
  getProductTypeAuthoringTemplate,
  productTypeAuthoringTemplates,
  validateProductCapture,
  weldingHoodCapturePlan,
  type ProductCaptureSession,
} from './index'

function completeSession(): ProductCaptureSession {
  return {
    schemaVersion: 1,
    capturePlanId: weldingHoodCapturePlan.id,
    captureSessionId: 'SC-PROD-20260922-0001',
    productId: 'SC-WH-001',
    productLabel: 'Scorpion Leather Welding Hood',
    productCategory: 'Leather Welding Hood',
    sourceSku: 'SC-WH-001',
    operator: 'Capture Operator',
    capturedAt: '2026-09-22T12:00:00.000Z',
    references: Object.fromEntries(
      weldingHoodCapturePlan.referenceRequirements
        .filter((requirement) => requirement.required)
        .map((requirement) => [
          requirement.key,
          {
            name: requirement.key + '.jpg',
            size: 1_000_000,
            type: 'image/jpeg',
            lastModified: 1,
            kind: requirement.kind,
          },
        ]),
    ),
    dimensions: weldingHoodCapturePlan.dimensionRequirements.map((requirement) => ({
      id: requirement.id,
      label: requirement.label,
      valueMm: 100,
    })),
    constructionNodes: weldingHoodCapturePlan.nodeRequirements.map((requirement) => ({
      role: requirement.role,
      label: requirement.label,
      nodeName: requirement.suggestedNodeName ?? requirement.role,
      status: 'confirmed',
    })),
    components: [],
    materialSlots: (weldingHoodCapturePlan.materialSlotRequirements ?? []).map((requirement) => ({
      slotId: requirement.slotId,
      label: requirement.label,
      materialId: requirement.kind === 'leather' ? 'SCL-TEST' : requirement.kind === 'metal' ? 'SCH-TEST' : 'SGL-TEST',
      nodeNames: requirement.nodeRoles.map((role) => (
        weldingHoodCapturePlan.nodeRequirements.find((node) => node.role === role)?.suggestedNodeName ?? role
      )),
      status: 'confirmed',
      evidenceFrameKeys: [],
    })),
    notes: 'Physical product captured without mixing construction versions.',
  }
}

describe('product capture validation', () => {
  it('accepts a complete welding-hood capture session', () => {
    expect(validateProductCapture(completeSession(), weldingHoodCapturePlan)).toEqual([])
  })

  it('rejects missing reference coverage, dimensions and semantic node confirmation', () => {
    const session = completeSession()
    delete session.references.front
    session.dimensions = session.dimensions.filter((dimension) => dimension.id !== 'maxWidth')
    session.constructionNodes[0] = { ...session.constructionNodes[0], status: 'pending' }

    const paths = validateProductCapture(session, weldingHoodCapturePlan).map((entry) => entry.path)
    expect(paths).toContain('references.front')
    expect(paths).toContain('dimensions.maxWidth')
    expect(paths).toContain('constructionNodes.product-root.status')
  })

  it('rejects component evidence that is not part of the capture session', () => {
    const session = completeSession()
    session.components = [{
      groupId: 'neckGuard',
      valueId: 'standard',
      label: 'Standard neck guard',
      nodeNames: ['NeckGuard_Standard'],
      status: 'confirmed',
      evidenceFrameKeys: ['missing-frame'],
    }]

    expect(validateProductCapture(session, weldingHoodCapturePlan).map((entry) => entry.path))
      .toContain('components.neckGuard.standard.evidenceFrameKeys')
  })

  it('requires the material-ready surface contract to be confirmed', () => {
    const session = completeSession()
    session.materialSlots[0] = { ...session.materialSlots[0], status: 'pending' }
    expect(validateProductCapture(session, weldingHoodCapturePlan).map((entry) => entry.path))
      .toContain('materialSlots.LeatherPrimary.status')
  })

  it('exposes reusable authoring conventions for the main leather-product families', () => {
    expect(productTypeAuthoringTemplates.map((entry) => entry.id)).toEqual([
      'welding-hood',
      'radio-harness',
      'belt',
      'pouch',
      'strap',
    ])
    expect(getProductTypeAuthoringTemplate('radio-harness')).toMatchObject({
      rootNode: 'SLS_ProductRoot',
      physicalUvMetersPerUnit: 1,
      materialSlots: ['LeatherPrimary', 'HardwarePrimary'],
    })
  })

  it('builds a deterministic reconstruction packet without mutating the asset library', () => {
    const packet = buildProductConstructionPacket({
      session: completeSession(),
      plan: weldingHoodCapturePlan,
      generatedAt: '2026-09-22T12:30:00.000Z',
    })

    expect(packet).toMatchObject({
      schemaVersion: 1,
      productId: 'SC-WH-001',
      sourceCaptureSessionId: 'SC-PROD-20260922-0001',
      status: 'ready-for-digital-twin-reconstruction',
      automaticAssetMutation: false,
      generatedAt: '2026-09-22T12:30:00.000Z',
      dimensionsMm: {
        maxWidth: 100,
        visorFrameWidth: 100,
      },
    })
    expect(packet.referenceCoverage).toHaveLength(
      weldingHoodCapturePlan.referenceRequirements.filter((requirement) => requirement.required).length,
    )
    expect(packet.materialSlots).toHaveLength(3)

    const manifest = buildAssetManifestScaffold({
      construction: packet,
      plan: weldingHoodCapturePlan,
      assetId: 'sc-wh-001-v1',
      modelFileName: 'model.glb',
    })
    expect(manifest).toMatchObject({
      assetId: 'sc-wh-001-v1',
      model: 'model.glb',
      rootNode: 'SLS_ProductRoot',
      materialSlotProfiles: {
        LeatherPrimary: { kind: 'leather', mapping: 'uv0', requiresUv0: true, metersPerUvUnit: 1 },
      },
      customizationZones: {
        'front-panel': {
          node: 'Shell_Main',
          purposes: ['tooling', 'text', 'logo', 'artwork'],
        },
      },
    })
    expect(manifest.presentation?.orbit?.maxDistance).toBeGreaterThan(manifest.presentation?.orbit?.minDistance ?? 0)
  })
})

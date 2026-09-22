import { describe, expect, it } from 'vitest'
import {
  buildProductConstructionPacket,
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
    materialSlots: [],
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
  })
})

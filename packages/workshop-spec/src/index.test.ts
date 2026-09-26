import {
  createWorkshopRevisionArchiveEntry,
  evaluateWorkshopCompletion, describe, expect, it } from 'vitest'
import type { StudioOrderRequest } from '@sls/order-engine'
import {
  buildWorkshopSpecification,
  formatWorkshopSpecification,
  validateWorkshopResolutions,
} from './index'

const request: StudioOrderRequest = {
  schemaVersion: 1,
  requestId: 'SC-REQ-20260924090000-ABC123',
  buildId: 'SLS-ABCDEF12',
  createdAt: '2026-09-24T09:00:00.000Z',
  sourceUrl: 'https://studio.example.com/?studio=test',
  customer: {
    name: 'Test Customer',
    email: 'private@example.com',
    phone: '555-555-0100',
    company: 'Example Co',
    preferredContact: 'email',
    neededBy: '2026-10-15',
  },
  build: {
    schemaVersion: 1,
    familyId: 'welding-hood',
    referenceId: 'hood-cognac',
    variantId: 'gid://shopify/ProductVariant/1',
    quantity: 1,
    personalization: {
      construction: {
        leatherFinish: 'as-photographed',
        leatherColor: '',
        stitching: 'contrast',
        hardware: 'shop-choice',
        edgeTreatment: 'as-photographed',
        notes: '',
      },
      toolingStyle: 'basket-weave',
      toolingNotes: '',
      textEnabled: true,
      text: 'ZAN',
      textStyle: 'western',
      placement: 'Shop recommendation',
      artworkNotes: '',
      additionalNotes: '',
    },
  },
  commerce: {
    productTitle: 'Leather Welding Hood',
    referenceTitle: 'Cognac Textured',
    referenceImageUrl: 'https://cdn.example.com/hood.png',
    shopifyProductId: 'gid://shopify/Product/1',
    merchandiseId: 'gid://shopify/ProductVariant/1',
    sku: 'SC-WH-CTX-002',
    variantTitle: 'Custom Order',
    basePriceMinor: 1000,
    listedInventoryQuantity: 0,
    priceStatus: 'quote',
  },
  pricing: {
    currency: 'USD',
    basePriceMinor: 1000,
    baseSubtotalMinor: 1000,
    basePriceStatus: 'quote',
    personalizationRequiresQuote: true,
  },
}

describe('workshop specification', () => {
  it('keeps customer contact data out of the workshop packet', () => {
    const packet = buildWorkshopSpecification(request, {
      orderStatus: 'reviewing',
      quoteTotalMinor: null,
    }, new Date('2026-09-24T10:00:00Z'))

    const serialized = JSON.stringify(packet)
    expect(serialized).not.toContain('private@example.com')
    expect(serialized).not.toContain('555-555-0100')
    expect(packet.customer.displayName).toBe('Test Customer')
  })

  it('blocks production when payment or shop resolutions are missing', () => {
    const packet = buildWorkshopSpecification(request, {
      orderStatus: 'approved',
      quoteTotalMinor: 45000,
      releaseRequested: true,
      releasedBy: 'Ray',
    })

    expect(packet.release.state).toBe('hold-unresolved')
    expect(packet.release.blockers.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      'hardware',
      'placement',
      'payment-not-confirmed',
    ]))
  })

  it('releases only a fully resolved paid build', () => {
    const packet = buildWorkshopSpecification(request, {
      orderStatus: 'paid',
      quoteTotalMinor: 45000,
      releaseRequested: true,
      releasedBy: 'Ray',
      releasedAt: '2026-09-24T11:00:00Z',
      resolutions: {
        hardware: 'Antique brass hardware set',
        placement: 'Rear panel centered 2 in below top seam',
        productionNotes: 'Match approved cognac reference.',
      },
    }, new Date('2026-09-24T11:00:00Z'))

    expect(packet.release.state).toBe('released-for-production')
    expect(packet.release.blockers).toEqual([])
    expect(packet.workOrderId).toMatch(/^SLS-WO-/u)
    expect(packet.revisionId).toMatch(/^REV-/u)
    expect(packet.scanPayload).toContain(packet.revisionId)
    expect(formatWorkshopSpecification(packet)).toContain('FINAL QC')
  })

  it('requires durable artwork when artwork exists', () => {
    const withArtwork = {
      ...request,
      build: {
        ...request.build,
        personalization: {
          ...request.build.personalization,
          artworkNotes: 'Use attached logo on rear panel.',
        },
      },
    }
    const packet = buildWorkshopSpecification(withArtwork, {
      orderStatus: 'paid',
      quoteTotalMinor: 45000,
      releaseRequested: true,
      releasedBy: 'Ray',
      artwork: {
        name: 'logo.png',
        type: 'image/png',
        size: 1000,
      },
      resolutions: {
        hardware: 'Antique brass',
        placement: 'Rear panel',
      },
    })

    expect(packet.release.blockers.some((entry) => entry.code === 'artwork-not-durable')).toBe(true)
    expect(packet.release.state).toBe('hold-unresolved')
  })

  it('changes revision identity when production resolutions change', () => {
    const a = buildWorkshopSpecification(request, {
      orderStatus: 'paid',
      quoteTotalMinor: 45000,
      resolutions: { hardware: 'Brass', placement: 'Rear center' },
    })
    const b = buildWorkshopSpecification(request, {
      orderStatus: 'paid',
      quoteTotalMinor: 45000,
      resolutions: { hardware: 'Nickel', placement: 'Rear center' },
    })
    expect(a.revisionId).not.toBe(b.revisionId)
  })

  it('bounds free-form workshop resolutions', () => {
    expect(validateWorkshopResolutions({ productionNotes: 'x'.repeat(2001) })[0]?.code)
      .toBe('resolution-productionNotes-too-long')
  })
})


describe('workshop progress and completion', () => {
  it('requires every required checklist item, final photo, and named QC signer', () => {
    const packet = buildWorkshopSpecification(request, {
      orderStatus: 'paid',
      quoteTotalMinor: 45000,
      paymentConfirmed: true,
      resolutions: {
        hardware: 'Antique brass',
        placement: 'Rear panel center',
      },
      releaseRequested: true,
      releasedBy: 'Ray',
      releasedAt: '2026-09-24T13:00:00.000Z',
    }, new Date('2026-09-24T13:00:00.000Z'))

    const result = evaluateWorkshopCompletion(packet, {
      manufacturingCompleted: packet.manufacturingChecklist.filter((item) => item.required).map((item) => item.id),
      qualityCompleted: packet.qualityChecklist.filter((item) => item.required).map((item) => item.id),
      updatedBy: 'Wilson',
      updatedAt: '2026-09-24T15:00:00.000Z',
    }, 'Wilson', {
      name: 'final.jpg',
      type: 'image/jpeg',
      size: 120000,
      storagePath: 'SC-REQ/final.jpg',
      sha256: 'a'.repeat(64),
    }, new Date('2026-09-24T15:15:00.000Z'))

    expect(result).toMatchObject({
      ready: true,
      completedBy: 'Wilson',
      completedAt: '2026-09-24T15:15:00.000Z',
      revisionId: packet.revisionId,
    })
  })

  it('blocks completion when QC or durable final-photo evidence is missing', () => {
    const packet = buildWorkshopSpecification(request, {
      orderStatus: 'paid',
      quoteTotalMinor: 45000,
      paymentConfirmed: true,
      resolutions: {
        hardware: 'Antique brass',
        placement: 'Rear panel center',
      },
      releaseRequested: true,
      releasedBy: 'Ray',
    })

    const result = evaluateWorkshopCompletion(packet, {
      manufacturingCompleted: [],
      qualityCompleted: [],
    }, '', null)

    expect(result.ready).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['qc-signer-required', 'final-photo-required', 'manufacturing-verify-source', 'quality-identity']),
    )
  })

  it('archives the released packet before a controlled revision', () => {
    const packet = buildWorkshopSpecification(request, {
      orderStatus: 'paid',
      quoteTotalMinor: 45000,
      paymentConfirmed: true,
      resolutions: {
        hardware: 'Antique brass',
        placement: 'Rear panel center',
      },
      releaseRequested: true,
      releasedBy: 'Ray',
    })

    const archive = createWorkshopRevisionArchiveEntry(
      packet,
      'Customer approved a revised placement before cutting.',
      'Ray',
      new Date('2026-09-24T16:00:00.000Z'),
    )

    expect(archive).toMatchObject({
      revisionId: packet.revisionId,
      archivedBy: 'Ray',
      reason: 'Customer approved a revised placement before cutting.',
      archivedAt: '2026-09-24T16:00:00.000Z',
    })
  })
})

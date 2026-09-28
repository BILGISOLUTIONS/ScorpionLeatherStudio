import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appendDeliveryDiagnostic,
  createRecoveryBundle,
  loadRecoveryCandidate,
  storeDeliveryReceipt,
  storePreparedRequest,
  supportReference,
} from './order-recovery'

const request = {
  schemaVersion: 1,
  requestId: 'SC-REQ-TEST-RECOVERY',
  buildId: 'SLS-RECOVERY-BUILD',
  createdAt: '2026-09-28T05:00:00.000Z',
  sourceUrl: 'https://example.test/',
  customer: {
    name: 'Recovery Customer',
    email: 'customer@example.com',
    phone: '',
    company: '',
    preferredContact: 'email',
    neededBy: '',
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
        stitching: 'as-photographed',
        hardware: 'as-photographed',
        edgeTreatment: 'as-photographed',
        notes: '',
      },
      toolingStyle: 'none',
      toolingNotes: '',
      textEnabled: false,
      text: '',
      textStyle: 'western',
      placement: 'Shop recommendation',
      artworkNotes: '',
      additionalNotes: '',
    },
  },
  commerce: {
    productTitle: 'Leather Welding Hood',
    referenceTitle: 'Cognac Textured',
    shopifyProductId: 'gid://shopify/Product/1',
    merchandiseId: 'gid://shopify/ProductVariant/1',
    sku: 'SC-WH-CTX-002',
    variantTitle: 'Custom Order',
    basePriceMinor: 1000,
    priceStatus: 'quote',
  },
  pricing: {
    currency: 'USD',
    basePriceMinor: 1000,
    baseSubtotalMinor: 1000,
    basePriceStatus: 'quote',
    personalizationRequiresQuote: true,
  },
} as const

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: storage(),
      sessionStorage: storage(),
    },
  })
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-28T05:10:00.000Z'))
})

describe('order recovery', () => {
  it('stores and restores the latest prepared request for the same deterministic build', () => {
    storePreparedRequest(request as any)
    expect(loadRecoveryCandidate('SLS-RECOVERY-BUILD')?.request.requestId).toBe('SC-REQ-TEST-RECOVERY')
    expect(loadRecoveryCandidate('SLS-OTHER')).toBeNull()
  })

  it('preserves accepted delivery receipt and server trace identity', () => {
    storePreparedRequest(request as any)
    storeDeliveryReceipt({
      requestId: request.requestId,
      buildId: request.buildId,
      state: 'accepted',
      at: '2026-09-28T05:09:00.000Z',
      traceId: 'trace-server-123',
      deliveryStatus: 'stored',
      persisted: true,
      emailSent: false,
    })

    const recovered = loadRecoveryCandidate(request.buildId)
    expect(recovered?.receipt).toMatchObject({
      state: 'accepted',
      traceId: 'trace-server-123',
      persisted: true,
    })
  })

  it('records only bounded structured diagnostics and produces a support reference', () => {
    const event = appendDeliveryDiagnostic({
      stage: 'response',
      outcome: 'error',
      requestId: request.requestId,
      buildId: request.buildId,
      traceId: 'trace-abc',
      code: 'DELIVERY_FAILED',
      httpStatus: 502,
      online: true,
    })

    expect(event).not.toHaveProperty('customer')
    expect(event).not.toHaveProperty('email')
    expect(supportReference(null, [event])).toBe('trace-abc')
  })

  it('exports a private recovery bundle with request/artwork plus sanitized diagnostics', () => {
    appendDeliveryDiagnostic({
      stage: 'network',
      outcome: 'error',
      requestId: request.requestId,
      buildId: request.buildId,
      code: 'NETWORK_ERROR',
      online: false,
    })

    const bundle = createRecoveryBundle(
      request as any,
      { name:'logo.png', type:'image/png', size:4, dataUrl:'data:image/png;base64,AAAA' },
      null,
    )

    expect(bundle.kind).toBe('scorpion-order-recovery')
    expect(bundle.request.customer.email).toBe('customer@example.com')
    expect(bundle.artwork?.dataUrl).toContain('base64')
    expect(bundle.diagnostics[0]).not.toHaveProperty('customer')
    expect(bundle.privacyNotice).toContain('private recovery file')
  })
})

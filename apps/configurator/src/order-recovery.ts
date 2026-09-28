import type { StudioOrderRequest } from '@sls/order-engine'
import type { ArtworkAttachment } from './studio-types'

export const REQUEST_STORAGE_KEY = 'scorpion-leather-studio:v004-requests'
const DELIVERY_RECEIPT_KEY = 'scorpion-leather-studio:v026-delivery-receipts'
const DIAGNOSTIC_SESSION_KEY = 'scorpion-leather-studio:v026-diagnostics'
const MAX_REQUESTS = 20
const MAX_RECEIPTS = 30
const MAX_DIAGNOSTICS = 24

export type DeliveryReceiptState = 'prepared' | 'accepted' | 'failed' | 'unavailable'

export interface DeliveryReceipt {
  requestId: string
  buildId: string
  state: DeliveryReceiptState
  at: string
  traceId?: string
  code?: string
  deliveryStatus?: string
  persisted?: boolean
  emailSent?: boolean
}

export interface DeliveryDiagnostic {
  eventId: string
  at: string
  stage: 'prepare' | 'submit' | 'response' | 'network' | 'recovery'
  outcome: 'info' | 'success' | 'warning' | 'error'
  requestId?: string
  buildId?: string
  traceId?: string
  code?: string
  httpStatus?: number
  online?: boolean
  persisted?: boolean
  emailSent?: boolean
}

export interface RecoveryCandidate {
  request: StudioOrderRequest
  receipt: DeliveryReceipt | null
}

function safeArray<T>(raw: string | null): T[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

function eventId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}`
  } catch {
    return `local-${Date.now()}`
  }
}

export function storePreparedRequest(request: StudioOrderRequest): void {
  try {
    const saved = safeArray<StudioOrderRequest>(window.localStorage.getItem(REQUEST_STORAGE_KEY))
    const next = [request, ...saved.filter((item) => item?.requestId !== request.requestId)].slice(0, MAX_REQUESTS)
    window.localStorage.setItem(REQUEST_STORAGE_KEY, JSON.stringify(next))
    storeDeliveryReceipt({
      requestId: request.requestId,
      buildId: request.buildId,
      state: 'prepared',
      at: new Date().toISOString(),
    })
  } catch {
    // Local recovery is best-effort; in-memory request flow remains functional.
  }
}

export function loadRecoveryCandidate(buildId: string): RecoveryCandidate | null {
  try {
    const requests = safeArray<StudioOrderRequest>(window.localStorage.getItem(REQUEST_STORAGE_KEY))
    const request = requests.find((item) =>
      item?.schemaVersion === 1 &&
      item.buildId === buildId &&
      /^SC-REQ-/u.test(item.requestId ?? ''),
    )
    if (!request) return null

    const receipts = safeArray<DeliveryReceipt>(window.localStorage.getItem(DELIVERY_RECEIPT_KEY))
    const receipt = receipts.find((item) => item?.requestId === request.requestId) ?? null
    return { request, receipt }
  } catch {
    return null
  }
}

export function storeDeliveryReceipt(receipt: DeliveryReceipt): void {
  try {
    const saved = safeArray<DeliveryReceipt>(window.localStorage.getItem(DELIVERY_RECEIPT_KEY))
    const next = [receipt, ...saved.filter((item) => item?.requestId !== receipt.requestId)].slice(0, MAX_RECEIPTS)
    window.localStorage.setItem(DELIVERY_RECEIPT_KEY, JSON.stringify(next))
  } catch {
    // Recovery receipt is optional.
  }
}

export function appendDeliveryDiagnostic(
  diagnostic: Omit<DeliveryDiagnostic, 'eventId' | 'at'> & Partial<Pick<DeliveryDiagnostic, 'eventId' | 'at'>>,
): DeliveryDiagnostic {
  const next: DeliveryDiagnostic = {
    eventId: diagnostic.eventId ?? eventId(),
    at: diagnostic.at ?? new Date().toISOString(),
    stage: diagnostic.stage,
    outcome: diagnostic.outcome,
    ...(diagnostic.requestId ? { requestId: diagnostic.requestId } : {}),
    ...(diagnostic.buildId ? { buildId: diagnostic.buildId } : {}),
    ...(diagnostic.traceId ? { traceId: diagnostic.traceId } : {}),
    ...(diagnostic.code ? { code: diagnostic.code } : {}),
    ...(diagnostic.httpStatus !== undefined ? { httpStatus: diagnostic.httpStatus } : {}),
    ...(diagnostic.online !== undefined ? { online: diagnostic.online } : {}),
    ...(diagnostic.persisted !== undefined ? { persisted: diagnostic.persisted } : {}),
    ...(diagnostic.emailSent !== undefined ? { emailSent: diagnostic.emailSent } : {}),
  }

  try {
    const saved = safeArray<DeliveryDiagnostic>(window.sessionStorage.getItem(DIAGNOSTIC_SESSION_KEY))
    window.sessionStorage.setItem(DIAGNOSTIC_SESSION_KEY, JSON.stringify([next, ...saved].slice(0, MAX_DIAGNOSTICS)))
  } catch {
    // Diagnostics are convenience-only and intentionally session-scoped.
  }

  return next
}

export function loadDeliveryDiagnostics(requestId?: string): DeliveryDiagnostic[] {
  try {
    const saved = safeArray<DeliveryDiagnostic>(window.sessionStorage.getItem(DIAGNOSTIC_SESSION_KEY))
    return requestId ? saved.filter((item) => item.requestId === requestId) : saved
  } catch {
    return []
  }
}

export function supportReference(receipt: DeliveryReceipt | null, diagnostics: DeliveryDiagnostic[]): string {
  if (receipt?.traceId) return receipt.traceId
  const traced = diagnostics.find((item) => item.traceId)?.traceId
  if (traced) return traced
  const local = diagnostics[0]?.eventId
  return local ? `LOCAL-${local.slice(0, 12).toUpperCase()}` : 'LOCAL-NO-TRACE'
}

export function createRecoveryBundle(
  request: StudioOrderRequest,
  artwork: ArtworkAttachment | null,
  receipt: DeliveryReceipt | null,
) {
  return {
    schemaVersion: 1,
    kind: 'scorpion-order-recovery',
    exportedAt: new Date().toISOString(),
    request,
    artwork: artwork ?? null,
    delivery: receipt,
    diagnostics: loadDeliveryDiagnostics(request.requestId),
    privacyNotice: 'This private recovery file can contain customer contact information and uploaded artwork. Share it only with Scorpion Western Wear support.',
  }
}

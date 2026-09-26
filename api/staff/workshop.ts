import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { StudioOrderRequest } from '@sls/order-engine'
import {
  buildWorkshopSpecification,
  createWorkshopRevisionArchiveEntry,
  evaluateWorkshopCompletion,
  normalizeWorkshopProgress,
  validateWorkshopProgress,
  validateWorkshopResolutions,
  type WorkshopProgress,
  type WorkshopResolutions,
  type WorkshopSpecification,
} from '@sls/workshop-spec'
import {
  createWorkshopFinalPhotoSignedUrl,
  persistWorkshopFinalPhoto,
} from '../../server/lib/order-store'
import { authorizeStaff, isStaffAccessConfigured } from '../../server/lib/staff-auth'
import { getSupabaseConfiguration, supabaseHeaders } from '../../server/lib/supabase'

const MAX_PHOTO_BYTES = 2 * 1024 * 1024
const ALLOWED_PHOTO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

interface StoredOrder {
  request_id: string
  status: string
  request_payload: StudioOrderRequest
  quote_total_minor: number | null
  staff_notes: string | null
  shopify_financial_status: string | null
  artwork_name: string | null
  artwork_type: string | null
  artwork_size: number | null
  artwork_storage_path?: string | null
  artwork_sha256?: string | null
  workshop_resolutions?: WorkshopResolutions | null
  workshop_release_packet?: WorkshopSpecification | null
  workshop_revision_id?: string | null
  workshop_released_at?: string | null
  workshop_released_by?: string | null
  workshop_progress?: WorkshopProgress | null
  workshop_revision_history?: unknown[] | null
  workshop_audit_log?: unknown[] | null
  workshop_qc_completed_at?: string | null
  workshop_qc_completed_by?: string | null
  workshop_final_photo_name?: string | null
  workshop_final_photo_type?: string | null
  workshop_final_photo_size?: number | null
  workshop_final_photo_storage_path?: string | null
  workshop_final_photo_sha256?: string | null
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  return typeof req.body === 'string'
    ? JSON.parse(req.body) as Record<string, unknown>
    : (req.body ?? {}) as Record<string, unknown>
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function unauthorized(res: VercelResponse) {
  res.setHeader('WWW-Authenticate', 'Bearer realm="Scorpion Staff"')
  res.status(401).json({ ok: false, code: 'UNAUTHORIZED' })
}

function v021Ready(order: StoredOrder): boolean {
  return [
    'workshop_progress',
    'workshop_revision_history',
    'workshop_audit_log',
    'workshop_qc_completed_at',
    'workshop_qc_completed_by',
    'workshop_final_photo_storage_path',
    'workshop_final_photo_sha256',
  ].every((key) => Object.prototype.hasOwnProperty.call(order, key))
}

function artworkReference(order: StoredOrder) {
  if (!order.artwork_name) return null
  return {
    name: order.artwork_name,
    type: order.artwork_type ?? 'application/octet-stream',
    size: order.artwork_size ?? 0,
    storagePath: order.artwork_storage_path,
    sha256: order.artwork_sha256,
  }
}

function finalPhotoReference(order: StoredOrder) {
  if (!order.workshop_final_photo_name) return null
  return {
    name: order.workshop_final_photo_name,
    type: order.workshop_final_photo_type ?? 'application/octet-stream',
    size: order.workshop_final_photo_size ?? 0,
    storagePath: order.workshop_final_photo_storage_path,
    sha256: order.workshop_final_photo_sha256,
  }
}

function paymentConfirmed(order: StoredOrder): boolean {
  return order.shopify_financial_status === 'PAID' ||
    ['paid', 'in_production', 'completed'].includes(order.status)
}

function auditEntry(
  actor: string,
  action: string,
  revisionId: string | null | undefined,
  detail?: string,
) {
  return {
    at: new Date().toISOString(),
    actor: actor.trim(),
    action,
    revisionId: revisionId ?? null,
    ...(detail ? { detail: detail.slice(0, 800) } : {}),
  }
}

function appendAudit(order: StoredOrder, entry: ReturnType<typeof auditEntry>) {
  const existing = Array.isArray(order.workshop_audit_log) ? order.workshop_audit_log : []
  return [...existing.slice(-99), entry]
}

async function readOrder(
  config: { url: string; serviceKey: string },
  requestId: string,
): Promise<StoredOrder | null> {
  const params = new URLSearchParams({
    select: '*',
    request_id: `eq.${requestId}`,
    limit: '1',
  })
  const response = await fetch(
    `${config.url}/rest/v1/scorpion_custom_order_requests?${params.toString()}`,
    { headers: supabaseHeaders(config.serviceKey) },
  )
  if (!response.ok) throw new Error(`ORDER_STORE_READ_FAILED_${response.status}`)
  const rows = await response.json() as StoredOrder[]
  return rows[0] ?? null
}

async function patchOrder(
  config: { url: string; serviceKey: string },
  requestId: string,
  patch: Record<string, unknown>,
): Promise<StoredOrder> {
  const response = await fetch(
    `${config.url}/rest/v1/scorpion_custom_order_requests?request_id=eq.${encodeURIComponent(requestId)}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(config.serviceKey, 'return=representation'),
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    },
  )
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500)
    throw new Error(`ORDER_STORE_UPDATE_FAILED_${response.status}: ${detail}`)
  }
  const rows = await response.json() as StoredOrder[]
  if (!rows.length) throw new Error('ORDER_NOT_FOUND')
  return rows[0]
}

function decodePhoto(value: unknown): {
  name: string
  type: string
  size: number
  buffer: Buffer
} {
  const record = objectValue(value)
  if (!record) throw new Error('FINAL_PHOTO_REQUIRED')
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const type = typeof record.type === 'string' ? record.type.trim().toLowerCase() : ''
  const declaredSize = Number(record.size)
  const dataUrl = typeof record.dataUrl === 'string' ? record.dataUrl : ''

  if (!name || name.length > 160) throw new Error('INVALID_FINAL_PHOTO_NAME')
  if (!ALLOWED_PHOTO_TYPES.has(type)) throw new Error('INVALID_FINAL_PHOTO_TYPE')
  if (!Number.isInteger(declaredSize) || declaredSize <= 0 || declaredSize > MAX_PHOTO_BYTES) {
    throw new Error('INVALID_FINAL_PHOTO_SIZE')
  }

  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/u.exec(dataUrl)
  if (!match || match[1] !== type) throw new Error('INVALID_FINAL_PHOTO_DATA')
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length || buffer.length > MAX_PHOTO_BYTES || buffer.length !== declaredSize) {
    throw new Error('FINAL_PHOTO_SIZE_MISMATCH')
  }

  return { name, type, size: declaredSize, buffer }
}

async function responseState(order: StoredOrder) {
  return {
    schemaReady: v021Ready(order),
    progress: normalizeWorkshopProgress(order.workshop_progress),
    revisionHistory: Array.isArray(order.workshop_revision_history) ? order.workshop_revision_history : [],
    auditLog: Array.isArray(order.workshop_audit_log) ? order.workshop_audit_log : [],
    qcCompletedAt: order.workshop_qc_completed_at ?? null,
    qcCompletedBy: order.workshop_qc_completed_by ?? null,
    finalPhoto: finalPhotoReference(order),
    finalPhotoSignedUrl: await createWorkshopFinalPhotoSignedUrl(order.workshop_final_photo_storage_path, 900),
    revisionId: order.workshop_revision_id ?? null,
    releasedAt: order.workshop_released_at ?? null,
    releasedBy: order.workshop_released_by ?? null,
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const config = getSupabaseConfiguration()
  if (!config) {
    res.status(503).json({ ok: false, code: 'ORDER_STORE_NOT_CONFIGURED' })
    return
  }
  const raw = Array.isArray(req.query.request_id) ? req.query.request_id[0] : req.query.request_id
  const requestId = (raw ?? '').trim()
  if (!/^SC-REQ-/u.test(requestId)) {
    res.status(422).json({ ok: false, code: 'INVALID_REQUEST_ID' })
    return
  }
  const order = await readOrder(config, requestId)
  if (!order) {
    res.status(404).json({ ok: false, code: 'ORDER_NOT_FOUND' })
    return
  }
  res.status(200).json({ ok: true, ...(await responseState(order)) })
}

async function handlePatch(req: VercelRequest, res: VercelResponse) {
  const config = getSupabaseConfiguration()
  if (!config) {
    res.status(503).json({ ok: false, code: 'ORDER_STORE_NOT_CONFIGURED' })
    return
  }

  const body = parseBody(req)
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : ''
  const action = typeof body.action === 'string' ? body.action.trim() : ''
  const actor = typeof body.actor === 'string' ? body.actor.trim() : ''

  if (!/^SC-REQ-/u.test(requestId)) {
    res.status(422).json({ ok: false, code: 'INVALID_REQUEST_ID' })
    return
  }
  if (!actor || actor.length > 120) {
    res.status(422).json({ ok: false, code: 'WORKSHOP_ACTOR_REQUIRED' })
    return
  }

  const order = await readOrder(config, requestId)
  if (!order) {
    res.status(404).json({ ok: false, code: 'ORDER_NOT_FOUND' })
    return
  }
  if (!v021Ready(order)) {
    res.status(503).json({
      ok: false,
      code: 'WORKSHOP_V021_SCHEMA_NOT_MIGRATED',
      message: 'Apply the V0.21 workshop migration before using QC, revisions, and audit tracking.',
    })
    return
  }
  const packet = order.workshop_release_packet
  if (!packet || packet.release?.state !== 'released-for-production') {
    res.status(409).json({ ok: false, code: 'WORKSHOP_PACKET_NOT_RELEASED' })
    return
  }

  if (action === 'save-progress') {
    const progressObject = objectValue(body.progress)
    if (!progressObject) {
      res.status(422).json({ ok: false, code: 'INVALID_WORKSHOP_PROGRESS' })
      return
    }
    const progress = normalizeWorkshopProgress({
      manufacturingCompleted: progressObject.manufacturingCompleted as string[] | undefined,
      qualityCompleted: progressObject.qualityCompleted as string[] | undefined,
      updatedBy: actor,
      updatedAt: new Date().toISOString(),
    })
    const issues = validateWorkshopProgress(packet, progress)
    if (issues.length) {
      res.status(422).json({ ok: false, code: 'INVALID_WORKSHOP_PROGRESS', issues })
      return
    }

    const next = await patchOrder(config, requestId, {
      workshop_progress: progress,
      workshop_audit_log: appendAudit(order, auditEntry(actor, 'progress-saved', packet.revisionId)),
    })
    res.status(200).json({ ok: true, ...(await responseState(next)) })
    return
  }

  if (action === 'upload-final-photo') {
    let photo
    try {
      photo = decodePhoto(body.photo)
    } catch (error) {
      res.status(422).json({
        ok: false,
        code: error instanceof Error ? error.message : 'INVALID_FINAL_PHOTO',
      })
      return
    }

    const stored = await persistWorkshopFinalPhoto(requestId, photo)
    if (!stored.stored || !stored.path || !stored.sha256) {
      res.status(502).json({
        ok: false,
        code: 'FINAL_PHOTO_STORAGE_FAILED',
        detail: stored.error,
      })
      return
    }

    const next = await patchOrder(config, requestId, {
      workshop_final_photo_name: photo.name,
      workshop_final_photo_type: photo.type,
      workshop_final_photo_size: photo.size,
      workshop_final_photo_storage_path: stored.path,
      workshop_final_photo_sha256: stored.sha256,
      workshop_audit_log: appendAudit(order, auditEntry(actor, 'final-photo-stored', packet.revisionId, photo.name)),
    })
    res.status(200).json({ ok: true, ...(await responseState(next)) })
    return
  }

  if (action === 'complete') {
    const progress = normalizeWorkshopProgress(order.workshop_progress)
    const result = evaluateWorkshopCompletion(
      packet,
      progress,
      actor,
      finalPhotoReference(order),
    )
    if (!result.ready) {
      res.status(422).json({ ok: false, code: 'WORKSHOP_COMPLETION_BLOCKED', issues: result.issues })
      return
    }

    const next = await patchOrder(config, requestId, {
      status: 'completed',
      workshop_qc_completed_at: result.completedAt,
      workshop_qc_completed_by: result.completedBy,
      workshop_audit_log: appendAudit(order, auditEntry(actor, 'final-qc-completed', packet.revisionId)),
    })
    res.status(200).json({ ok: true, completed: result, ...(await responseState(next)) })
    return
  }

  if (action === 'create-revision') {
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    const resolutionRecord = objectValue(body.workshopResolutions)
    if (!resolutionRecord) {
      res.status(422).json({ ok: false, code: 'INVALID_WORKSHOP_RESOLUTIONS' })
      return
    }
    const resolutions = resolutionRecord as WorkshopResolutions
    const issues = validateWorkshopResolutions(resolutions)
    if (issues.length) {
      res.status(422).json({ ok: false, code: 'INVALID_WORKSHOP_RESOLUTIONS', issues })
      return
    }

    let archive
    try {
      archive = createWorkshopRevisionArchiveEntry(packet, reason, actor)
    } catch (error) {
      res.status(422).json({
        ok: false,
        code: 'INVALID_REVISION_REQUEST',
        message: error instanceof Error ? error.message : String(error),
      })
      return
    }

    const now = new Date()
    const nextPacket = buildWorkshopSpecification(order.request_payload, {
      orderStatus: order.status,
      quoteTotalMinor: order.quote_total_minor,
      paymentConfirmed: paymentConfirmed(order),
      staffNotes: order.staff_notes,
      artwork: artworkReference(order),
      resolutions,
      releaseRequested: true,
      releasedBy: actor,
      releasedAt: now.toISOString(),
    }, now)

    if (nextPacket.release.state !== 'released-for-production') {
      res.status(422).json({
        ok: false,
        code: 'WORKSHOP_REVISION_BLOCKED',
        blockers: nextPacket.release.blockers,
        warnings: nextPacket.release.warnings,
      })
      return
    }
    if (nextPacket.revisionId === packet.revisionId) {
      res.status(409).json({
        ok: false,
        code: 'WORKSHOP_REVISION_UNCHANGED',
        message: 'The proposed manufacturing resolutions do not change the released revision.',
      })
      return
    }

    const history = Array.isArray(order.workshop_revision_history) ? order.workshop_revision_history : []
    const next = await patchOrder(config, requestId, {
      workshop_resolutions: resolutions,
      workshop_release_packet: nextPacket,
      workshop_revision_id: nextPacket.revisionId,
      workshop_released_at: nextPacket.release.releasedAt,
      workshop_released_by: actor,
      workshop_revision_history: [...history.slice(-19), archive],
      workshop_progress: { manufacturingCompleted: [], qualityCompleted: [], updatedBy: actor, updatedAt: now.toISOString() },
      workshop_qc_completed_at: null,
      workshop_qc_completed_by: null,
      workshop_final_photo_name: null,
      workshop_final_photo_type: null,
      workshop_final_photo_size: null,
      workshop_final_photo_storage_path: null,
      workshop_final_photo_sha256: null,
      workshop_audit_log: appendAudit(
        order,
        auditEntry(actor, 'controlled-revision-created', nextPacket.revisionId, `${packet.revisionId} -> ${nextPacket.revisionId}: ${reason}`),
      ),
    })
    res.status(200).json({
      ok: true,
      previousRevisionId: packet.revisionId,
      workshopPacket: nextPacket,
      ...(await responseState(next)),
    })
    return
  }

  res.status(422).json({ ok: false, code: 'INVALID_WORKSHOP_ACTION' })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (!isStaffAccessConfigured()) {
    res.status(503).json({ ok: false, code: 'STAFF_ACCESS_NOT_CONFIGURED' })
    return
  }
  if (!authorizeStaff(req.headers as Record<string, string | string[] | undefined>)) {
    unauthorized(res)
    return
  }

  try {
    if (req.method === 'GET') {
      await handleGet(req, res)
      return
    }
    if (req.method === 'PATCH') {
      await handlePatch(req, res)
      return
    }
    res.setHeader('Allow', 'GET, PATCH')
    res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED' })
  } catch (error) {
    console.error('Scorpion workshop API failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ ok: false, code: 'WORKSHOP_API_FAILED' })
  }
}

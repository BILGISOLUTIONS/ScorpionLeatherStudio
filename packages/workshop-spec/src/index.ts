import type { StudioOrderRequest } from '@sls/order-engine'

export interface WorkshopResolutions {
  leatherFinish?: string
  leatherColor?: string
  stitching?: string
  hardware?: string
  edgeTreatment?: string
  tooling?: string
  placement?: string
  textExecution?: string
  artworkInstructions?: string
  productionNotes?: string
}

export interface WorkshopArtworkReference {
  name: string
  type: string
  size: number
  storagePath?: string | null
  sha256?: string | null
}

export type WorkshopOrderStatus =
  | 'received'
  | 'reviewing'
  | 'quoted'
  | 'approved'
  | 'paid'
  | 'in_production'
  | 'completed'
  | 'cancelled'

export interface WorkshopContext {
  orderStatus: WorkshopOrderStatus | string
  quoteTotalMinor?: number | null
  paymentConfirmed?: boolean
  staffNotes?: string | null
  artwork?: WorkshopArtworkReference | null
  resolutions?: WorkshopResolutions | null
  releaseRequested?: boolean
  releasedBy?: string | null
  releasedAt?: string | null
}

export interface WorkshopDecision {
  requested: string
  resolved: string
  source: 'customer' | 'starting-reference' | 'staff-resolution' | 'none'
  requiresResolution: boolean
}

export interface WorkshopChecklistItem {
  id: string
  label: string
  required: boolean
  status: 'pending'
}

export interface WorkshopReleaseIssue {
  code: string
  message: string
}

export interface WorkshopSpecification {
  schemaVersion: 1
  workOrderId: string
  revisionId: string
  generatedAt: string
  requestId: string
  buildId: string
  scanPayload: string
  release: {
    state: 'draft-review-only' | 'hold-unresolved' | 'released-for-production'
    orderStatus: string
    paymentConfirmed: boolean
    releasedBy?: string
    releasedAt?: string
    blockers: WorkshopReleaseIssue[]
    warnings: WorkshopReleaseIssue[]
  }
  customer: {
    displayName: string
    company?: string
    neededBy?: string
  }
  product: {
    productTitle: string
    referenceTitle: string
    referenceImageUrl?: string
    sku: string
    variantTitle: string
    quantity: number
  }
  construction: {
    leatherFinish: WorkshopDecision
    leatherColor: WorkshopDecision
    stitching: WorkshopDecision
    hardware: WorkshopDecision
    edgeTreatment: WorkshopDecision
  }
  personalization: {
    tooling: WorkshopDecision
    text: string | null
    textStyle: WorkshopDecision
    placement: WorkshopDecision
    toolingNotes?: string
    artworkNotes?: string
    additionalNotes?: string
  }
  artwork: {
    required: boolean
    durable: boolean
    name?: string
    type?: string
    size?: number
    storagePath?: string
    sha256?: string
    instructions?: string
  }
  productSpecificConfiguration?: unknown
  productionNotes?: string
  staffNotes?: string
  pricing: {
    quoteRequired: boolean
    quoteTotalMinor?: number
  }
  manufacturingChecklist: WorkshopChecklistItem[]
  qualityChecklist: WorkshopChecklistItem[]
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return '{' + Object.keys(record)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonicalJson(record[key]))
      .join(',') + '}'
  }
  return JSON.stringify(value)
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase()
}

function label(value: string): string {
  return value
    .split('-')
    .map((part) => part ? part[0]!.toUpperCase() + part.slice(1) : part)
    .join(' ')
}

function trimmed(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function decision(
  requested: string,
  override: string | undefined,
  options: {
    ambiguous?: string[]
    asPhotographed?: boolean
    noneValue?: string
  } = {},
): WorkshopDecision {
  const requestedValue = requested.trim()
  const overrideValue = trimmed(override)
  if (overrideValue) {
    return {
      requested: requestedValue || 'Not specified',
      resolved: overrideValue,
      source: 'staff-resolution',
      requiresResolution: false,
    }
  }

  if (options.noneValue && requestedValue === options.noneValue) {
    return {
      requested: label(requestedValue),
      resolved: 'None',
      source: 'none',
      requiresResolution: false,
    }
  }

  if (options.asPhotographed && requestedValue === 'as-photographed') {
    return {
      requested: 'As photographed',
      resolved: 'Match photographed starting reference',
      source: 'starting-reference',
      requiresResolution: false,
    }
  }

  if ((options.ambiguous ?? []).includes(requestedValue) || !requestedValue) {
    return {
      requested: requestedValue ? label(requestedValue) : 'Not specified',
      resolved: '',
      source: 'customer',
      requiresResolution: true,
    }
  }

  return {
    requested: label(requestedValue),
    resolved: label(requestedValue),
    source: 'customer',
    requiresResolution: false,
  }
}

function stableWorkOrderId(request: StudioOrderRequest): string {
  const requestSuffix = request.requestId.split('-').at(-1) ?? 'REQ'
  const buildSuffix = request.buildId.replace(/^SLS-/u, '')
  return `SLS-WO-${buildSuffix}-${requestSuffix}`
}

function validTimestamp(value: string | null | undefined): boolean {
  return Boolean(value && Number.isFinite(Date.parse(value)))
}

function releaseIssue(code: string, message: string): WorkshopReleaseIssue {
  return { code, message }
}

function requiresDurableArtwork(request: StudioOrderRequest, artwork: WorkshopArtworkReference | null | undefined): boolean {
  const p = request.build.personalization
  return Boolean(artwork || trimmed(p.artworkNotes))
}

function checklist(
  toolingRequired: boolean,
  personalizationRequired: boolean,
  artworkRequired: boolean,
): { manufacturing: WorkshopChecklistItem[]; quality: WorkshopChecklistItem[] } {
  return {
    manufacturing: [
      { id: 'verify-source', label: 'Verify request/revision and photographed starting reference', required: true, status: 'pending' },
      { id: 'materials', label: 'Pull and verify specified leather, thread, hardware and edge materials', required: true, status: 'pending' },
      { id: 'cut', label: 'Cut required leather panels/components', required: true, status: 'pending' },
      { id: 'tooling', label: 'Complete approved tooling pattern and placement', required: toolingRequired, status: 'pending' },
      { id: 'personalization', label: 'Complete approved lettering/personalization', required: personalizationRequired, status: 'pending' },
      { id: 'artwork', label: 'Apply/translate approved customer artwork', required: artworkRequired, status: 'pending' },
      { id: 'stitching', label: 'Complete stitching/binding to specification', required: true, status: 'pending' },
      { id: 'hardware', label: 'Install specified hardware and functional components', required: true, status: 'pending' },
      { id: 'assembly', label: 'Complete assembly and mechanical-function check', required: true, status: 'pending' },
      { id: 'finish', label: 'Clean, finish and prepare for final QC', required: true, status: 'pending' },
    ],
    quality: [
      { id: 'identity', label: 'Request ID, build ID and revision match the physical work order', required: true, status: 'pending' },
      { id: 'dimensions', label: 'Dimensions/fit-critical measurements match approved specification', required: true, status: 'pending' },
      { id: 'materials', label: 'Leather, hardware, stitching and edge treatment match specification', required: true, status: 'pending' },
      { id: 'construction', label: 'Panel construction, seams, reinforcements and hardware are correct', required: true, status: 'pending' },
      { id: 'tooling', label: 'Tooling style, depth and placement match approval', required: toolingRequired, status: 'pending' },
      { id: 'personalization', label: 'Text spelling, style and placement are correct', required: personalizationRequired, status: 'pending' },
      { id: 'artwork', label: 'Artwork orientation, scale and placement match approved source', required: artworkRequired, status: 'pending' },
      { id: 'function', label: 'Straps, buckles, visor/mechanical parts and fit functions pass', required: true, status: 'pending' },
      { id: 'surface', label: 'No unintended scratches, stains, glue, marks or finish defects', required: true, status: 'pending' },
      { id: 'photo', label: 'Capture final QC photo before packing/release', required: true, status: 'pending' },
    ],
  }
}

export function validateWorkshopResolutions(value: WorkshopResolutions | null | undefined): WorkshopReleaseIssue[] {
  if (!value) return []
  const issues: WorkshopReleaseIssue[] = []
  const limits: Record<keyof WorkshopResolutions, number> = {
    leatherFinish: 180,
    leatherColor: 180,
    stitching: 180,
    hardware: 180,
    edgeTreatment: 180,
    tooling: 400,
    placement: 240,
    textExecution: 240,
    artworkInstructions: 700,
    productionNotes: 2000,
  }
  for (const [key, max] of Object.entries(limits) as Array<[keyof WorkshopResolutions, number]>) {
    const entry = value[key]
    if (entry !== undefined && typeof entry !== 'string') {
      issues.push(releaseIssue(`resolution-${key}-invalid`, `Workshop resolution "${key}" must be text.`))
    } else if ((entry ?? '').length > max) {
      issues.push(releaseIssue(`resolution-${key}-too-long`, `Workshop resolution "${key}" exceeds ${max} characters.`))
    }
  }
  return issues
}

export function buildWorkshopSpecification(
  request: StudioOrderRequest,
  context: WorkshopContext,
  now = new Date(),
): WorkshopSpecification {
  const resolutions = context.resolutions ?? {}
  const p = request.build.personalization
  const construction = p.construction
  const artworkRequired = requiresDurableArtwork(request, context.artwork)

  const leatherFinish = decision(construction.leatherFinish, resolutions.leatherFinish, {
    ambiguous: ['shop-choice', 'custom-request'],
    asPhotographed: true,
  })
  const leatherColor = trimmed(resolutions.leatherColor)
    ? {
        requested: construction.leatherColor.trim() || 'Starting-reference color',
        resolved: trimmed(resolutions.leatherColor),
        source: 'staff-resolution' as const,
        requiresResolution: false,
      }
    : {
        requested: construction.leatherColor.trim() || 'As photographed',
        resolved: construction.leatherColor.trim() || 'Match photographed starting reference',
        source: construction.leatherColor.trim() ? 'customer' as const : 'starting-reference' as const,
        requiresResolution: false,
      }
  const stitching = decision(construction.stitching, resolutions.stitching, {
    ambiguous: ['shop-choice', 'custom-request'],
    asPhotographed: true,
  })
  const hardware = decision(construction.hardware, resolutions.hardware, {
    ambiguous: ['shop-choice', 'custom-request'],
    asPhotographed: true,
  })
  const edgeTreatment = decision(construction.edgeTreatment, resolutions.edgeTreatment, {
    ambiguous: ['shop-choice', 'custom-request'],
    asPhotographed: true,
  })
  const tooling = decision(p.toolingStyle, resolutions.tooling, {
    ambiguous: ['custom-concept'],
    noneValue: 'none',
  })
  const placement = decision(p.placement, resolutions.placement, {
    ambiguous: ['Shop recommendation'],
  })
  const textStyle = p.textEnabled
    ? decision(p.textStyle, resolutions.textExecution, { ambiguous: ['shop-choice'] })
    : {
        requested: 'None',
        resolved: 'None',
        source: 'none' as const,
        requiresResolution: false,
      }

  const blockers: WorkshopReleaseIssue[] = [
    ...validateWorkshopResolutions(resolutions),
  ]
  const warnings: WorkshopReleaseIssue[] = []

  const decisions = [
    ['leather-finish', 'Leather finish requires a shop resolution.', leatherFinish],
    ['stitching', 'Stitching requires a shop resolution.', stitching],
    ['hardware', 'Hardware requires a shop resolution.', hardware],
    ['edge-treatment', 'Edge treatment requires a shop resolution.', edgeTreatment],
    ['tooling', 'Custom tooling requires a shop-approved production resolution.', tooling],
    ['placement', 'Personalization placement requires a shop resolution.', placement],
    ['text-execution', 'Text execution/style requires a shop resolution.', textStyle],
  ] as const
  for (const [code, message, entry] of decisions) {
    if (entry.requiresResolution) blockers.push(releaseIssue(code, message))
  }

  const paymentConfirmed = Boolean(context.paymentConfirmed || ['paid', 'in_production', 'completed'].includes(context.orderStatus))
  if (!paymentConfirmed) {
    blockers.push(releaseIssue('payment-not-confirmed', 'Payment must be confirmed before release to workshop.'))
  }

  const quoteRequired = request.pricing.personalizationRequiresQuote || request.pricing.basePriceStatus === 'quote'
  const quoteTotalMinor = context.quoteTotalMinor ?? undefined
  if (quoteRequired && (!Number.isInteger(quoteTotalMinor) || (quoteTotalMinor ?? 0) <= 0)) {
    blockers.push(releaseIssue('quote-not-finalized', 'A positive final quote is required before production release.'))
  }

  const artwork = context.artwork
  if (artworkRequired) {
    if (!artwork) {
      blockers.push(releaseIssue('artwork-source-missing', 'Artwork/custom-art direction exists but no durable source artwork is attached to the order.'))
    } else if (!trimmed(artwork.storagePath)) {
      blockers.push(releaseIssue('artwork-not-durable', 'The artwork file exists only as metadata/email context and is not stored in durable order storage.'))
    }
    if (!trimmed(resolutions.artworkInstructions) && trimmed(p.artworkNotes)) {
      warnings.push(releaseIssue('artwork-instructions-unconfirmed', 'Customer artwork notes are present; verify final scale/orientation/placement before production.'))
    }
  }

  if (trimmed(construction.notes)) {
    warnings.push(releaseIssue('construction-notes', 'Customer supplied free-form construction notes; verify they are reflected in production decisions.'))
  }
  if (trimmed(p.additionalNotes)) {
    warnings.push(releaseIssue('additional-notes', 'Customer supplied additional notes; review them before workshop release.'))
  }

  const releaseRequested = Boolean(context.releaseRequested)
  const canRelease = blockers.length === 0
  const releasedBy = trimmed(context.releasedBy)
  const releasedAt = context.releasedAt

  if (releaseRequested && !releasedBy) {
    blockers.push(releaseIssue('released-by-required', 'A named staff member must release the packet to production.'))
  }
  if (releaseRequested && releasedAt && !validTimestamp(releasedAt)) {
    blockers.push(releaseIssue('released-at-invalid', 'Production release timestamp is invalid.'))
  }

  const releaseState: WorkshopSpecification['release']['state'] =
    releaseRequested && blockers.length === 0
      ? 'released-for-production'
      : blockers.length > 0
        ? 'hold-unresolved'
        : 'draft-review-only'

  const revisionSource = {
    requestId: request.requestId,
    buildId: request.buildId,
    build: request.build,
    resolutions,
    quoteTotalMinor: context.quoteTotalMinor ?? null,
    artwork: artwork ? {
      name: artwork.name,
      size: artwork.size,
      storagePath: artwork.storagePath ?? null,
      sha256: artwork.sha256 ?? null,
    } : null,
    productionNotes: resolutions.productionNotes ?? '',
  }
  const revisionId = `REV-${fnv1a(canonicalJson(revisionSource))}`
  const workOrderId = stableWorkOrderId(request)
  const lists = checklist(
    p.toolingStyle !== 'none',
    p.textEnabled,
    artworkRequired,
  )

  return {
    schemaVersion: 1,
    workOrderId,
    revisionId,
    generatedAt: now.toISOString(),
    requestId: request.requestId,
    buildId: request.buildId,
    scanPayload: `SLS:WORKSHOP:1:${request.requestId}:${revisionId}`,
    release: {
      state: releaseState,
      orderStatus: context.orderStatus,
      paymentConfirmed,
      ...(releaseState === 'released-for-production'
        ? {
            releasedBy,
            releasedAt: validTimestamp(releasedAt) ? new Date(releasedAt!).toISOString() : now.toISOString(),
          }
        : {}),
      blockers,
      warnings,
    },
    customer: {
      displayName: request.customer.name,
      ...(trimmed(request.customer.company) ? { company: request.customer.company.trim() } : {}),
      ...(trimmed(request.customer.neededBy) ? { neededBy: request.customer.neededBy.trim() } : {}),
    },
    product: {
      productTitle: request.commerce.productTitle,
      referenceTitle: request.commerce.referenceTitle,
      ...(request.commerce.referenceImageUrl ? { referenceImageUrl: request.commerce.referenceImageUrl } : {}),
      sku: request.commerce.sku,
      variantTitle: request.commerce.variantTitle,
      quantity: request.build.quantity,
    },
    construction: {
      leatherFinish,
      leatherColor,
      stitching,
      hardware,
      edgeTreatment,
    },
    personalization: {
      tooling,
      text: p.textEnabled ? p.text.trim() : null,
      textStyle,
      placement,
      ...(trimmed(p.toolingNotes) ? { toolingNotes: p.toolingNotes.trim() } : {}),
      ...(trimmed(p.artworkNotes) ? { artworkNotes: p.artworkNotes.trim() } : {}),
      ...(trimmed(p.additionalNotes) ? { additionalNotes: p.additionalNotes.trim() } : {}),
    },
    artwork: {
      required: artworkRequired,
      durable: Boolean(artwork?.storagePath),
      ...(artwork ? {
        name: artwork.name,
        type: artwork.type,
        size: artwork.size,
        ...(artwork.storagePath ? { storagePath: artwork.storagePath } : {}),
        ...(artwork.sha256 ? { sha256: artwork.sha256 } : {}),
      } : {}),
      ...(trimmed(resolutions.artworkInstructions) ? { instructions: resolutions.artworkInstructions!.trim() } : {}),
    },
    ...(request.build.hoodConfiguration === undefined ? {} : { productSpecificConfiguration: request.build.hoodConfiguration }),
    ...(trimmed(resolutions.productionNotes) ? { productionNotes: resolutions.productionNotes!.trim() } : {}),
    ...(trimmed(context.staffNotes) ? { staffNotes: context.staffNotes!.trim() } : {}),
    pricing: {
      quoteRequired,
      ...(Number.isInteger(quoteTotalMinor) && (quoteTotalMinor ?? 0) >= 0 ? { quoteTotalMinor } : {}),
    },
    manufacturingChecklist: lists.manufacturing,
    qualityChecklist: lists.quality,
  }
}

export function formatWorkshopSpecification(packet: WorkshopSpecification): string {
  const decisionLine = (name: string, value: WorkshopDecision) =>
    `${name}: ${value.resolved || '[UNRESOLVED]'}${value.requested !== value.resolved && value.requested ? ` · requested: ${value.requested}` : ''}`

  const lines = [
    'SCORPION LEATHER STUDIO — WORKSHOP BUILD PACKET',
    `Work order: ${packet.workOrderId}`,
    `Revision: ${packet.revisionId}`,
    `Request: ${packet.requestId}`,
    `Build: ${packet.buildId}`,
    `Release: ${packet.release.state}`,
    packet.release.releasedBy ? `Released by: ${packet.release.releasedBy}` : '',
    packet.release.releasedAt ? `Released at: ${packet.release.releasedAt}` : '',
    '',
    `Customer: ${packet.customer.displayName}${packet.customer.company ? ' · ' + packet.customer.company : ''}`,
    packet.customer.neededBy ? `Needed by: ${packet.customer.neededBy}` : '',
    '',
    `Product: ${packet.product.productTitle}`,
    `Starting reference: ${packet.product.referenceTitle}`,
    `SKU / variant: ${packet.product.sku} · ${packet.product.variantTitle}`,
    `Quantity: ${packet.product.quantity}`,
    '',
    decisionLine('Leather finish', packet.construction.leatherFinish),
    decisionLine('Leather color', packet.construction.leatherColor),
    decisionLine('Stitching', packet.construction.stitching),
    decisionLine('Hardware', packet.construction.hardware),
    decisionLine('Edge / binding', packet.construction.edgeTreatment),
    decisionLine('Tooling', packet.personalization.tooling),
    packet.personalization.text ? `Text: ${packet.personalization.text}` : 'Text: None',
    decisionLine('Text execution', packet.personalization.textStyle),
    decisionLine('Placement', packet.personalization.placement),
    packet.personalization.toolingNotes ? `Tooling notes: ${packet.personalization.toolingNotes}` : '',
    packet.personalization.artworkNotes ? `Artwork notes: ${packet.personalization.artworkNotes}` : '',
    packet.personalization.additionalNotes ? `Additional notes: ${packet.personalization.additionalNotes}` : '',
    '',
    `Artwork source: ${packet.artwork.required ? packet.artwork.durable ? packet.artwork.name ?? 'Durable source' : '[HOLD — durable source missing]' : 'None required'}`,
    packet.artwork.instructions ? `Artwork execution: ${packet.artwork.instructions}` : '',
    packet.productionNotes ? `Production notes: ${packet.productionNotes}` : '',
    packet.staffNotes ? `Staff notes: ${packet.staffNotes}` : '',
    '',
    'MANUFACTURING CHECKLIST',
    ...packet.manufacturingChecklist.filter((entry) => entry.required).map((entry) => `[ ] ${entry.label}`),
    '',
    'FINAL QC',
    ...packet.qualityChecklist.filter((entry) => entry.required).map((entry) => `[ ] ${entry.label}`),
    '',
    `Machine reference: ${packet.scanPayload}`,
  ]
  return lines.filter((line, index, all) => line || (index > 0 && all[index - 1] !== '')).join('\n')
}

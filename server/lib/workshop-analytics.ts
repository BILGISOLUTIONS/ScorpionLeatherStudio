interface ChecklistItem {
  id?: string
}

interface WorkshopPacketLike {
  workOrderId?: string
  revisionId?: string
  manufacturingChecklist?: ChecklistItem[]
  finalQcChecklist?: ChecklistItem[]
}

interface WorkshopProgressLike {
  manufacturingCompleted?: string[]
  qualityCompleted?: string[]
}

export interface WorkshopAnalyticsRow {
  request_id: string
  status: string
  product_title: string
  reference_title: string
  quantity: number
  workshop_released_at: string | null
  workshop_revision_id: string | null
  workshop_progress?: WorkshopProgressLike | null
  workshop_qc_completed_at?: string | null
  workshop_release_packet?: WorkshopPacketLike | null
  workshop_revision_history?: unknown[] | null
}

export interface WorkshopAnalyticsSummary {
  generatedAt: string
  sourceCount: number
  releasedCount: number
  activeCount: number
  completedCount: number
  completedLast30Days: number
  activeUnits: number
  totalRevisionCount: number
  averageReleaseToQcHours: number | null
  oldestActiveHours: number | null
  checklist: {
    manufacturingDone: number
    manufacturingTotal: number
    qualityDone: number
    qualityTotal: number
  }
  products: Array<{
    productTitle: string
    orders: number
    units: number
  }>
  queue: Array<{
    requestId: string
    workOrderId: string | null
    revisionId: string | null
    productTitle: string
    referenceTitle: string
    quantity: number
    releasedAt: string
    ageHours: number
    manufacturingDone: number
    manufacturingTotal: number
    qualityDone: number
    qualityTotal: number
    revisionCount: number
  }>
}

function ids(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function items(value: unknown): ChecklistItem[] {
  return Array.isArray(value)
    ? value.filter((item): item is ChecklistItem => Boolean(item && typeof item === 'object'))
    : []
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function hoursBetween(start: string, endMs: number): number | null {
  const startMs = Date.parse(start)
  if (!Number.isFinite(startMs) || endMs < startMs) return null
  return (endMs - startMs) / 3_600_000
}

export function summarizeWorkshopAnalytics(
  rows: readonly WorkshopAnalyticsRow[],
  now = new Date(),
): WorkshopAnalyticsSummary {
  const nowMs = now.getTime()
  const last30DaysMs = nowMs - 30 * 24 * 3_600_000
  const released = rows.filter((row) => Boolean(row.workshop_released_at))
  const active = released.filter((row) =>
    !row.workshop_qc_completed_at && row.status !== 'cancelled' && row.status !== 'completed',
  )
  const completed = rows.filter((row) => Boolean(row.workshop_qc_completed_at))

  const cycleHours = completed
    .map((row) => {
      if (!row.workshop_released_at || !row.workshop_qc_completed_at) return null
      return hoursBetween(row.workshop_released_at, Date.parse(row.workshop_qc_completed_at))
    })
    .filter((value): value is number => value !== null)

  const activeAges = active
    .map((row) => row.workshop_released_at ? hoursBetween(row.workshop_released_at, nowMs) : null)
    .filter((value): value is number => value !== null)

  let manufacturingDone = 0
  let manufacturingTotal = 0
  let qualityDone = 0
  let qualityTotal = 0

  for (const row of active) {
    const packet = row.workshop_release_packet ?? {}
    const progress = row.workshop_progress ?? {}
    const manufacturingIds = new Set(items(packet.manufacturingChecklist).map((item) => item.id).filter(Boolean))
    const qualityIds = new Set(items(packet.finalQcChecklist).map((item) => item.id).filter(Boolean))
    const completedManufacturing = ids(progress.manufacturingCompleted).filter((id) => manufacturingIds.has(id))
    const completedQuality = ids(progress.qualityCompleted).filter((id) => qualityIds.has(id))

    manufacturingDone += completedManufacturing.length
    manufacturingTotal += manufacturingIds.size
    qualityDone += completedQuality.length
    qualityTotal += qualityIds.size
  }

  const productMap = new Map<string, { productTitle: string; orders: number; units: number }>()
  for (const row of released) {
    const key = row.product_title || row.reference_title || 'Unknown product'
    const current = productMap.get(key) ?? { productTitle: key, orders: 0, units: 0 }
    current.orders += 1
    current.units += Math.max(0, Number(row.quantity) || 0)
    productMap.set(key, current)
  }

  const products = [...productMap.values()]
    .sort((a, b) => b.units - a.units || b.orders - a.orders || a.productTitle.localeCompare(b.productTitle))

  const queue = active
    .map((row) => {
      const packet = row.workshop_release_packet ?? {}
      const progress = row.workshop_progress ?? {}
      const manufacturingIds = new Set(items(packet.manufacturingChecklist).map((item) => item.id).filter(Boolean))
      const qualityIds = new Set(items(packet.finalQcChecklist).map((item) => item.id).filter(Boolean))
      const releasedAt = row.workshop_released_at!
      return {
        requestId: row.request_id,
        workOrderId: packet.workOrderId ?? null,
        revisionId: row.workshop_revision_id ?? packet.revisionId ?? null,
        productTitle: row.product_title,
        referenceTitle: row.reference_title,
        quantity: row.quantity,
        releasedAt,
        ageHours: round1(hoursBetween(releasedAt, nowMs) ?? 0),
        manufacturingDone: ids(progress.manufacturingCompleted).filter((id) => manufacturingIds.has(id)).length,
        manufacturingTotal: manufacturingIds.size,
        qualityDone: ids(progress.qualityCompleted).filter((id) => qualityIds.has(id)).length,
        qualityTotal: qualityIds.size,
        revisionCount: Array.isArray(row.workshop_revision_history) ? row.workshop_revision_history.length : 0,
      }
    })
    .sort((a, b) => Date.parse(a.releasedAt) - Date.parse(b.releasedAt))

  return {
    generatedAt: now.toISOString(),
    sourceCount: rows.length,
    releasedCount: released.length,
    activeCount: active.length,
    completedCount: completed.length,
    completedLast30Days: completed.filter((row) => {
      const completedMs = Date.parse(row.workshop_qc_completed_at ?? '')
      return Number.isFinite(completedMs) && completedMs >= last30DaysMs && completedMs <= nowMs
    }).length,
    activeUnits: active.reduce((sum, row) => sum + Math.max(0, Number(row.quantity) || 0), 0),
    totalRevisionCount: released.reduce(
      (sum, row) => sum + (Array.isArray(row.workshop_revision_history) ? row.workshop_revision_history.length : 0),
      0,
    ),
    averageReleaseToQcHours: cycleHours.length
      ? round1(cycleHours.reduce((sum, value) => sum + value, 0) / cycleHours.length)
      : null,
    oldestActiveHours: activeAges.length ? round1(Math.max(...activeAges)) : null,
    checklist: {
      manufacturingDone,
      manufacturingTotal,
      qualityDone,
      qualityTotal,
    },
    products,
    queue,
  }
}

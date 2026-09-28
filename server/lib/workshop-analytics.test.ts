import { describe, expect, it } from 'vitest'
import { summarizeWorkshopAnalytics, type WorkshopAnalyticsRow } from './workshop-analytics'

const packet = {
  workOrderId: 'SLS-WO-1',
  revisionId: 'REV-A',
  manufacturingChecklist: [{ id: 'cut' }, { id: 'stitch' }],
  finalQcChecklist: [{ id: 'finish' }],
}

const rows: WorkshopAnalyticsRow[] = [
  {
    request_id: 'SC-REQ-1',
    status: 'in_production',
    product_title: 'Leather Hood',
    reference_title: 'Cognac Hood',
    quantity: 2,
    workshop_released_at: '2026-09-25T00:00:00.000Z',
    workshop_revision_id: 'REV-A',
    workshop_progress: { manufacturingCompleted: ['cut'], qualityCompleted: [] },
    workshop_release_packet: packet,
    workshop_revision_history: [{ revisionId: 'REV-OLD' }],
  },
  {
    request_id: 'SC-REQ-2',
    status: 'completed',
    product_title: 'Leather Hood',
    reference_title: 'Black Hood',
    quantity: 1,
    workshop_released_at: '2026-09-20T00:00:00.000Z',
    workshop_revision_id: 'REV-B',
    workshop_progress: { manufacturingCompleted: ['cut', 'stitch'], qualityCompleted: ['finish'] },
    workshop_release_packet: { ...packet, workOrderId: 'SLS-WO-2', revisionId: 'REV-B' },
    workshop_revision_history: [],
    workshop_qc_completed_at: '2026-09-21T12:00:00.000Z',
  },
]

describe('workshop analytics', () => {
  it('summarizes active production without customer PII', () => {
    const summary = summarizeWorkshopAnalytics(rows, new Date('2026-09-27T00:00:00.000Z'))

    expect(summary).toMatchObject({
      sourceCount: 2,
      releasedCount: 2,
      activeCount: 1,
      completedCount: 1,
      completedLast30Days: 1,
      activeUnits: 2,
      totalRevisionCount: 1,
      averageReleaseToQcHours: 36,
      oldestActiveHours: 48,
      checklist: {
        manufacturingDone: 1,
        manufacturingTotal: 2,
        qualityDone: 0,
        qualityTotal: 1,
      },
    })
    expect(summary.products[0]).toMatchObject({ productTitle: 'Leather Hood', orders: 2, units: 3 })
    expect(summary.queue[0]).toMatchObject({
      requestId: 'SC-REQ-1',
      workOrderId: 'SLS-WO-1',
      revisionId: 'REV-A',
      ageHours: 48,
      manufacturingDone: 1,
      manufacturingTotal: 2,
    })
    expect(JSON.stringify(summary)).not.toContain('customer')
  })

  it('ignores unknown checklist ids and cancelled released work from active queue', () => {
    const summary = summarizeWorkshopAnalytics([
      {
        ...rows[0],
        status: 'cancelled',
        workshop_progress: { manufacturingCompleted: ['unknown'], qualityCompleted: ['unknown'] },
      },
    ], new Date('2026-09-27T00:00:00.000Z'))

    expect(summary.activeCount).toBe(0)
    expect(summary.queue).toEqual([])
    expect(summary.checklist.manufacturingDone).toBe(0)
  })
})

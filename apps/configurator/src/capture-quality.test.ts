import { describe, expect, it } from 'vitest'
import type { CapturedReferenceFrame } from '@sls/product-capture'
import { captureQualityPolicy, evaluateCaptureQuality } from './capture-quality'

function frame(overrides: Partial<CapturedReferenceFrame> = {}): CapturedReferenceFrame {
  return {
    name: 'capture.jpg',
    size: 2_000_000,
    type: 'image/jpeg',
    lastModified: 1,
    kind: 'required-view',
    sha256: 'a'.repeat(64),
    imageWidthPx: 3000,
    imageHeightPx: 2000,
    ...overrides,
  }
}

describe('V0.46 capture quality preflight', () => {
  it('treats the same source assigned to two required roles as a blocker', () => {
    const report = evaluateCaptureQuality([
      { id: 'front', label: 'Front', required: true, frame: frame() },
      { id: 'rear', label: 'Rear', required: true, frame: frame({ name: 'rear.jpg' }) },
    ])

    expect(report.ready).toBe(false)
    expect(report.duplicateGroups).toBe(1)
    expect(report.blockers.some((entry) => entry.code === 'required_exact_duplicate')).toBe(true)
  })

  it('keeps a required-to-supplemental duplicate as a warning rather than a blocker', () => {
    const report = evaluateCaptureQuality([
      { id: 'front', label: 'Front', required: true, frame: frame() },
      { id: 'supp-1', label: 'Supplemental 001', required: false, frame: frame({ kind: 'supplemental-reference' }) },
    ])

    expect(report.ready).toBe(true)
    expect(report.warnings.some((entry) => entry.code === 'exact_duplicate')).toBe(true)
  })

  it('reports low resolution, cautious format, tiny derivatives and unavailable dimensions', () => {
    const report = evaluateCaptureQuality([
      {
        id: 'low',
        label: 'Low',
        required: true,
        frame: frame({
          sha256: 'b'.repeat(64),
          imageWidthPx: 900,
          imageHeightPx: 700,
          size: 40_000,
          type: 'image/heic',
        }),
      },
      {
        id: 'unknown',
        label: 'Unknown',
        required: false,
        frame: frame({
          sha256: 'c'.repeat(64),
          imageWidthPx: undefined,
          imageHeightPx: undefined,
          size: 200_000,
        }),
      },
    ])

    const codes = report.warnings.map((entry) => entry.code)
    expect(codes).toContain('low_resolution')
    expect(codes).toContain('cautious_format')
    expect(codes).toContain('suspiciously_small_file')
    expect(codes).toContain('dimensions_unavailable')
    expect(report.lowResolutionImages).toBe(1)
    expect(report.cautiousFormatImages).toBe(1)
  })

  it('recognizes recommended-resolution evidence and the 60–120 count target', () => {
    const sources = Array.from({ length: captureQualityPolicy.recommendedImageCountMin }, (_, index) => ({
      id: 'source-' + index,
      label: 'Source ' + index,
      required: index < 18,
      frame: frame({
        name: 'source-' + index + '.jpg',
        sha256: index.toString(16).padStart(64, '0'),
      }),
    }))
    const report = evaluateCaptureQuality(sources)

    expect(report.ready).toBe(true)
    expect(report.recommendedResolutionImages).toBe(sources.length)
    expect(report.info.some((entry) => entry.code === 'capture_count_in_target')).toBe(true)
    expect(report.warnings.some((entry) => entry.code === 'capture_count_below_target')).toBe(false)
  })

  it('blocks a source set that approaches the classic ZIP size limit', () => {
    const report = evaluateCaptureQuality([
      {
        id: 'huge',
        label: 'Huge',
        required: true,
        frame: frame({
          sha256: 'd'.repeat(64),
          size: captureQualityPolicy.classicZipRiskBytes,
        }),
      },
    ])

    expect(report.ready).toBe(false)
    expect(report.blockers.some((entry) => entry.code === 'classic_zip_size_risk')).toBe(true)
  })
})

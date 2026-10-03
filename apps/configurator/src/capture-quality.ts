import type { CapturedReferenceFrame } from '@sls/product-capture'

export const captureQualityPolicy = {
  recommendedImageCountMin: 60,
  recommendedImageCountMax: 120,
  minimumPixels: 2_000_000,
  minimumShortEdgePx: 1080,
  recommendedPixels: 4_000_000,
  recommendedShortEdgePx: 1440,
  suspiciouslySmallBytes: 75_000,
  largeBundleWarningBytes: 1_500_000_000,
  classicZipRiskBytes: 3_500_000_000,
  preferredMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as const,
}

export type CaptureQualitySeverity = 'blocker' | 'warning' | 'info'

export interface CaptureQualitySource {
  id: string
  label: string
  required: boolean
  frame: CapturedReferenceFrame
}

export interface CaptureQualityFinding {
  severity: CaptureQualitySeverity
  code: string
  message: string
  sourceIds?: string[]
}

export interface CaptureQualityReport {
  sourceCount: number
  totalBytes: number
  inspectableImages: number
  recommendedResolutionImages: number
  lowResolutionImages: number
  cautiousFormatImages: number
  duplicateGroups: number
  blockers: CaptureQualityFinding[]
  warnings: CaptureQualityFinding[]
  info: CaptureQualityFinding[]
  ready: boolean
}

export interface CaptureImageInspection {
  widthPx?: number
  heightPx?: number
  inspectable: boolean
  reason?: string
}

function finitePositive(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function preferredMime(type: string): boolean {
  return (captureQualityPolicy.preferredMimeTypes as readonly string[]).includes(type.toLowerCase())
}

function sourceResolutionState(source: CaptureQualitySource): 'recommended' | 'adequate' | 'low' | 'unknown' {
  const width = source.frame.imageWidthPx
  const height = source.frame.imageHeightPx
  if (!finitePositive(width) || !finitePositive(height)) return 'unknown'

  const pixels = width * height
  const shortEdge = Math.min(width, height)
  if (pixels < captureQualityPolicy.minimumPixels || shortEdge < captureQualityPolicy.minimumShortEdgePx) {
    return 'low'
  }
  if (pixels >= captureQualityPolicy.recommendedPixels && shortEdge >= captureQualityPolicy.recommendedShortEdgePx) {
    return 'recommended'
  }
  return 'adequate'
}

export function evaluateCaptureQuality(sources: readonly CaptureQualitySource[]): CaptureQualityReport {
  const blockers: CaptureQualityFinding[] = []
  const warnings: CaptureQualityFinding[] = []
  const info: CaptureQualityFinding[] = []
  const totalBytes = sources.reduce((sum, source) => sum + Math.max(0, source.frame.size || 0), 0)

  const duplicateByHash = new Map<string, CaptureQualitySource[]>()
  for (const source of sources) {
    const hash = source.frame.sha256
    if (!hash || !/^[a-f0-9]{64}$/u.test(hash)) continue
    const group = duplicateByHash.get(hash) ?? []
    group.push(source)
    duplicateByHash.set(hash, group)
  }

  let duplicateGroups = 0
  for (const group of duplicateByHash.values()) {
    if (group.length < 2) continue
    duplicateGroups += 1
    const requiredCount = group.filter((source) => source.required).length
    const labels = group.map((source) => source.label)
    const finding: CaptureQualityFinding = {
      severity: requiredCount >= 2 ? 'blocker' : 'warning',
      code: requiredCount >= 2 ? 'required_exact_duplicate' : 'exact_duplicate',
      message: 'Exact duplicate source image is assigned more than once: ' + labels.join(' / ') + '.',
      sourceIds: group.map((source) => source.id),
    }
    if (finding.severity === 'blocker') blockers.push(finding)
    else warnings.push(finding)
  }

  let inspectableImages = 0
  let recommendedResolutionImages = 0
  let lowResolutionImages = 0
  let cautiousFormatImages = 0

  for (const source of sources) {
    const resolutionState = sourceResolutionState(source)
    if (resolutionState !== 'unknown') inspectableImages += 1
    if (resolutionState === 'recommended') recommendedResolutionImages += 1
    if (resolutionState === 'low') {
      lowResolutionImages += 1
      warnings.push({
        severity: 'warning',
        code: 'low_resolution',
        message: source.label + ' is below the SLS field guideline of 2 MP / 1080 px short edge.',
        sourceIds: [source.id],
      })
    } else if (resolutionState === 'unknown') {
      warnings.push({
        severity: 'warning',
        code: 'dimensions_unavailable',
        message: source.label + ' could not be dimension-checked in this browser session.',
        sourceIds: [source.id],
      })
    }

    if (!preferredMime(source.frame.type)) {
      cautiousFormatImages += 1
      warnings.push({
        severity: 'warning',
        code: 'cautious_format',
        message: source.label + ' uses ' + (source.frame.type || 'an unknown format') + '; JPEG, PNG or WebP is preferred for provider portability.',
        sourceIds: [source.id],
      })
    }

    if (source.frame.size > 0 && source.frame.size < captureQualityPolicy.suspiciouslySmallBytes) {
      warnings.push({
        severity: 'warning',
        code: 'suspiciously_small_file',
        message: source.label + ' is unusually small (' + Math.round(source.frame.size / 1024) + ' KB); confirm it is not a thumbnail or aggressively compressed derivative.',
        sourceIds: [source.id],
      })
    }
  }

  if (sources.length < captureQualityPolicy.recommendedImageCountMin) {
    warnings.push({
      severity: 'warning',
      code: 'capture_count_below_target',
      message: 'Current evidence set has ' + sources.length + ' image(s). For the first hood, target roughly 60–120 sharp source photographs when practical.',
    })
  } else if (sources.length > captureQualityPolicy.recommendedImageCountMax) {
    warnings.push({
      severity: 'warning',
      code: 'capture_count_above_target',
      message: 'Current evidence set has ' + sources.length + ' image(s), above the 60–120 working target. Keep only useful overlap/detail coverage.',
    })
  } else {
    info.push({
      severity: 'info',
      code: 'capture_count_in_target',
      message: 'Source-image count is within the 60–120 first-hood working target.',
    })
  }

  if (totalBytes >= captureQualityPolicy.classicZipRiskBytes) {
    blockers.push({
      severity: 'blocker',
      code: 'classic_zip_size_risk',
      message: 'Estimated source evidence is near the classic ZIP 4 GB limit. Split/reduce the source set before field export.',
    })
  } else if (totalBytes >= captureQualityPolicy.largeBundleWarningBytes) {
    warnings.push({
      severity: 'warning',
      code: 'large_bundle',
      message: 'Estimated source evidence exceeds 1.5 GB. Expect slower hashing/export and verify available device storage.',
    })
  }

  return {
    sourceCount: sources.length,
    totalBytes,
    inspectableImages,
    recommendedResolutionImages,
    lowResolutionImages,
    cautiousFormatImages,
    duplicateGroups,
    blockers,
    warnings,
    info,
    ready: blockers.length === 0,
  }
}

export async function inspectImageDimensions(file: File): Promise<CaptureImageInspection> {
  if (!file.type.startsWith('image/')) {
    return { inspectable: false, reason: 'Selected file is not an image MIME type.' }
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      const result = { inspectable: true, widthPx: bitmap.width, heightPx: bitmap.height }
      bitmap.close()
      return result
    } catch {
      // Fall through to browser image decoding where available.
    }
  }

  if (typeof Image !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      const result = await new Promise<CaptureImageInspection>((resolve) => {
        image.onload = () => resolve({
          inspectable: true,
          widthPx: image.naturalWidth,
          heightPx: image.naturalHeight,
        })
        image.onerror = () => resolve({
          inspectable: false,
          reason: 'Browser could not decode image dimensions.',
        })
        image.src = url
      })
      return result
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  return { inspectable: false, reason: 'Image dimension decoder is unavailable in this environment.' }
}

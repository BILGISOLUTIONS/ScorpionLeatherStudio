import {
  validateMaterialDefinition,
  type MaterialTextureTier,
  type ScorpionMaterialDefinition,
} from '@sls/material-library'

export interface ProcessingManifest {
  schemaVersion: 1
  materialId: string
  label?: string
  captureSessionId: string
  sourceCaptureManifest?: string
  processedAt?: string
  status: 'draft-pbr-review-required'
  derivedPreviewColor: string
  processor: {
    resolution: number
    baseColor?: { source?: string }
    roughness?: {
      diffuseSource?: string
      reflectiveSource?: string
      baseRoughness?: number
      responseGain?: number
      method?: string
    }
    normal?: {
      north?: string
      east?: string
      south?: string
      west?: string
      strength?: number
      method?: string
    }
  }
  outputs: {
    baseColor: string
    roughness: string
    normal: string
  }
}

export interface QaApprovalPacket {
  schemaVersion: 1
  materialId: string
  label?: string
  captureSessionId: string
  sourceProcessingManifest?: string
  reviewedAt: string
  reviewer: string
  decision: 'approved-for-registry-promotion'
  automaticRegistryMutation: false
  maps: {
    baseColor: { file: string; width: number; height: number }
    roughness: { file: string; width: number; height: number }
    normal: { file: string; width: number; height: number }
  }
  viewer: {
    repeat: number
    normalScale: number
    roughnessScalar: number
  }
  checks: Record<string, boolean>
  notes?: string
}

export interface PromotionTierInput {
  maxEdge: 1024 | 2048 | 4096
  baseColor: string
  normal: string
  roughness: string
}

export interface PromotionIssue {
  path: string
  message: string
}

export interface PromotionResult {
  material: ScorpionMaterialDefinition
  assetPlacement: {
    materialId: string
    root: string
    files: Array<{
      tier: number
      kind: 'baseColor' | 'normal' | 'roughness'
      source: string
      destination: string
    }>
  }
}

function issue(path: string, message: string): PromotionIssue {
  return { path, message }
}

function validHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/iu.test(value)
}

function sameNonEmpty(values: Array<string | undefined>): boolean {
  const normalized = values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim())
  return normalized.length > 0 && new Set(normalized).size === 1
}

export function validatePromotionChain(
  draft: ScorpionMaterialDefinition,
  processing: ProcessingManifest,
  qa: QaApprovalPacket,
): PromotionIssue[] {
  const issues: PromotionIssue[] = []

  if (draft.lifecycle !== 'captured-master') {
    issues.push(issue('draft.lifecycle', 'Promotion requires a captured-master material draft.'))
  }
  if (draft.provenance.source !== 'field-capture' && draft.provenance.source !== 'supplier-reference') {
    issues.push(issue('draft.provenance.source', 'Promotion requires field-capture or supplier-reference provenance.'))
  }

  if (!sameNonEmpty([draft.id, processing.materialId, qa.materialId])) {
    issues.push(issue('materialId', 'Captured draft, processing manifest, and QA packet must use the same material ID.'))
  }

  if (
    draft.provenance.source === 'field-capture' &&
    !sameNonEmpty([draft.provenance.captureSessionId, processing.captureSessionId, qa.captureSessionId])
  ) {
    issues.push(issue('captureSessionId', 'Capture-session IDs must match across the full provenance chain.'))
  }

  if (processing.status !== 'draft-pbr-review-required') {
    issues.push(issue('processing.status', 'Processing manifest must still be in draft PBR review state.'))
  }

  if (!validHex(processing.derivedPreviewColor)) {
    issues.push(issue('processing.derivedPreviewColor', 'Processed preview color must be a six-digit hex value.'))
  }

  if (qa.decision !== 'approved-for-registry-promotion') {
    issues.push(issue('qa.decision', 'QA packet does not contain a promotion approval decision.'))
  }
  if (qa.automaticRegistryMutation !== false) {
    issues.push(issue('qa.automaticRegistryMutation', 'QA packet must explicitly preserve manual registry promotion.'))
  }
  if (!qa.reviewer?.trim()) {
    issues.push(issue('qa.reviewer', 'QA packet requires a named reviewer.'))
  }
  if (!qa.reviewedAt) {
    issues.push(issue('qa.reviewedAt', 'QA packet requires a review timestamp.'))
  }

  const failedChecks = Object.entries(qa.checks ?? {}).filter(([, passed]) => !passed)
  if (!Object.keys(qa.checks ?? {}).length || failedChecks.length) {
    issues.push(issue('qa.checks', 'Every physical-swatch QA check must be explicitly passed.'))
  }

  const qaMaps = [qa.maps?.baseColor, qa.maps?.normal, qa.maps?.roughness].filter(Boolean)
  if (qaMaps.length !== 3) {
    issues.push(issue('qa.maps', 'QA packet must contain base-color, normal, and roughness map metadata.'))
  } else {
    const dimensions = new Set(qaMaps.map((map) => `${map.width}x${map.height}`))
    if (dimensions.size !== 1) {
      issues.push(issue('qa.maps', 'QA map dimensions must match.'))
    }
  }

  if (!Number.isFinite(qa.viewer.repeat) || qa.viewer.repeat <= 0 || qa.viewer.repeat > 16) {
    issues.push(issue('qa.viewer.repeat', 'QA texture repeat must be greater than zero and no more than 16.'))
  }
  if (!Number.isFinite(qa.viewer.normalScale) || qa.viewer.normalScale < 0 || qa.viewer.normalScale > 4) {
    issues.push(issue('qa.viewer.normalScale', 'QA normal scale must be between 0 and 4.'))
  }
  if (!Number.isFinite(qa.viewer.roughnessScalar) || qa.viewer.roughnessScalar < 0 || qa.viewer.roughnessScalar > 1) {
    issues.push(issue('qa.viewer.roughnessScalar', 'QA roughness scalar must be between 0 and 1 for production rendering.'))
  }

  return issues
}

export function validatePromotionTiers(tiers: readonly PromotionTierInput[]): PromotionIssue[] {
  const issues: PromotionIssue[] = []
  const edges = new Set<number>()

  if (!tiers.length) {
    issues.push(issue('tiers', 'At least one production texture tier is required.'))
    return issues
  }

  for (const tier of tiers) {
    if (edges.has(tier.maxEdge)) {
      issues.push(issue(`tiers.${tier.maxEdge}`, 'Duplicate production texture tier.'))
    }
    edges.add(tier.maxEdge)

    if (!tier.baseColor.trim()) issues.push(issue(`tiers.${tier.maxEdge}.baseColor`, 'Base-color file is required.'))
    if (!tier.normal.trim()) issues.push(issue(`tiers.${tier.maxEdge}.normal`, 'Normal file is required.'))
    if (!tier.roughness.trim()) issues.push(issue(`tiers.${tier.maxEdge}.roughness`, 'Roughness file is required.'))
  }

  if (!edges.has(1024)) {
    issues.push(issue('tiers.1024', 'A 1K tier is required as the efficient baseline.'))
  }

  return issues
}

function normalizedRoot(materialId: string, root?: string): string {
  const fallback = `/materials/${materialId}`
  const value = (root?.trim() || fallback).replace(/\/+$/u, '')
  return value.startsWith('/') ? value : '/' + value
}

function tierToMaterialTextureTier(root: string, tier: PromotionTierInput): MaterialTextureTier {
  const folder = tier.maxEdge === 1024 ? '1k' : tier.maxEdge === 2048 ? '2k' : '4k'
  return {
    maxEdge: tier.maxEdge,
    textures: {
      baseColor: `${root}/${folder}/basecolor.webp`,
      normal: `${root}/${folder}/normal.png`,
      roughness: `${root}/${folder}/roughness.png`,
    },
  }
}

export function promoteMaterial(args: {
  draft: ScorpionMaterialDefinition
  processing: ProcessingManifest
  qa: QaApprovalPacket
  tiers: readonly PromotionTierInput[]
  assetRoot?: string
  sourceQaPacket?: string
}): PromotionResult {
  const chainIssues = validatePromotionChain(args.draft, args.processing, args.qa)
  const tierIssues = validatePromotionTiers(args.tiers)
  const allIssues = [...chainIssues, ...tierIssues]
  if (allIssues.length) {
    throw new Error(allIssues.map((entry) => `${entry.path}: ${entry.message}`).join('\n'))
  }

  const root = normalizedRoot(args.draft.id, args.assetRoot)
  const materialTiers = [...args.tiers]
    .sort((a, b) => a.maxEdge - b.maxEdge)
    .map((tier) => tierToMaterialTextureTier(root, tier))

  const roughness = Math.max(0, Math.min(1, args.qa.viewer.roughnessScalar))
  const normalScale = Math.max(0, Math.min(4, args.qa.viewer.normalScale))
  const repeat = Math.max(0.1, Math.min(16, args.qa.viewer.repeat))

  const qaNotes = args.qa.notes?.trim()
  const provenanceNotes = [
    args.draft.provenance.notes?.trim(),
    qaNotes ? `QA: ${qaNotes}` : '',
  ].filter(Boolean).join(' ')

  const material: ScorpionMaterialDefinition = {
    ...args.draft,
    lifecycle: 'production-approved',
    previewColor: args.processing.derivedPreviewColor,
    provenance: {
      ...args.draft.provenance,
      notes: provenanceNotes || undefined,
    },
    approval: {
      reviewer: args.qa.reviewer.trim(),
      reviewedAt: args.qa.reviewedAt,
      decision: 'approved-for-registry-promotion',
      sourceQaPacket: args.sourceQaPacket,
    },
    renderer: {
      ...args.draft.renderer,
      roughness,
      normalScale,
      textureRepeat: [repeat, repeat],
    },
    textureTiers: materialTiers,
  }

  const definitionIssues = validateMaterialDefinition(material)
  if (definitionIssues.length) {
    throw new Error(definitionIssues.map((entry) => `${entry.path}: ${entry.message}`).join('\n'))
  }

  const assetPlacement = {
    materialId: material.id,
    root,
    files: args.tiers.flatMap((tier) => {
      const folder = tier.maxEdge === 1024 ? '1k' : tier.maxEdge === 2048 ? '2k' : '4k'
      return [
        { tier: tier.maxEdge, kind: 'baseColor' as const, source: tier.baseColor, destination: `${root}/${folder}/basecolor.webp` },
        { tier: tier.maxEdge, kind: 'normal' as const, source: tier.normal, destination: `${root}/${folder}/normal.png` },
        { tier: tier.maxEdge, kind: 'roughness' as const, source: tier.roughness, destination: `${root}/${folder}/roughness.png` },
      ]
    }),
  }

  return { material, assetPlacement }
}

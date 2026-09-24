import { validateAssetManifest, type AssetManifest } from '@sls/product-schema'
import type { ProductConstructionPacket } from '@sls/product-capture'

export type ProductAssetQaSeverity = 'error' | 'warning'

export interface ProductAssetQaIssue {
  severity: ProductAssetQaSeverity
  path: string
  message: string
}

export interface ProductAssetInspection {
  schemaVersion: 1
  assetId: string
  inspectedAt: string
  modelFile: {
    name: string
    sizeBytes: number
    type: string
  }
  boundsMeters: {
    width: number
    height: number
    depth: number
  }
  rootScale: [number, number, number]
  nodeNames: string[]
  duplicateNodeNames: string[]
  meshCount: number
  triangleCount: number
  materialCount: number
  textureCount: number
  maxTextureEdge?: number
  unnamedMeshCount: number
  nonUniformScaleNodes: string[]
  negativeScaleNodes: string[]
  animationClipNames: string[]
}

export interface ProductAssetQaPolicy {
  maxModelBytes: number
  maxTriangles: number
  warningTriangles: number
  maxMeshes: number
  maxMaterials: number
  maxTextures: number
  maxTextureEdge: number
  dimensionToleranceRatio: number
  requireGlb: boolean
}

export const defaultProductAssetQaPolicy: ProductAssetQaPolicy = {
  maxModelBytes: 8 * 1024 * 1024,
  maxTriangles: 150_000,
  warningTriangles: 120_000,
  maxMeshes: 48,
  maxMaterials: 16,
  maxTextures: 24,
  maxTextureEdge: 2048,
  dimensionToleranceRatio: 0.08,
  requireGlb: true,
}

export type ProductAssetReviewCheck =
  | 'visualFidelity'
  | 'constructionAccuracy'
  | 'materialRealism'
  | 'mechanicalMotion'
  | 'uvAndNormals'
  | 'cameraFraming'
  | 'configurationState'
  | 'mobilePerformance'

export const productAssetReviewLabels: Record<ProductAssetReviewCheck, string> = {
  visualFidelity: 'Silhouette and proportions match the physical product',
  constructionAccuracy: 'Seams, hardware, panels and construction details are faithful',
  materialRealism: 'Leather, hardware and lens materials match approved references',
  mechanicalMotion: 'Mechanical pivots and motion ranges behave correctly',
  uvAndNormals: 'UVs, normals and texture seams are visually clean',
  cameraFraming: 'Camera presets frame the product consistently and usefully',
  configurationState: 'All configurable states resolve to the intended geometry/materials',
  mobilePerformance: 'The asset remains responsive on the target mobile performance tier',
}

export interface ProductAssetHumanReview {
  reviewer: string
  reviewedAt: string
  checks: Record<ProductAssetReviewCheck, boolean>
  notes?: string
}

export interface ProductAssetQaApprovalPacket {
  schemaVersion: 1
  productId: string
  assetId: string
  sourceCaptureSessionId: string
  capturePlanId: string
  sourceModelFile: string
  reviewedAt: string
  reviewer: string
  decision: 'approved-for-production-asset-promotion'
  automaticRegistryMutation: false
  automated: {
    blockers: number
    warnings: number
    policy: ProductAssetQaPolicy
  }
  checks: Record<ProductAssetReviewCheck, boolean>
  notes?: string
}

export interface ProductionProductAssetRecord {
  schemaVersion: 1
  productId: string
  assetId: string
  lifecycle: 'production-approved'
  sourceCaptureSessionId: string
  capturePlanId: string
  promotedAt: string
  reviewer: string
  qaReviewedAt: string
  automaticRegistryMutation: false
  assetRoot: string
  manifest: AssetManifest
}

export interface ProductAssetPromotionResult {
  record: ProductionProductAssetRecord
  assetPlacement: {
    productId: string
    assetId: string
    root: string
    files: Array<{
      kind: 'model' | 'manifest' | 'qa-approval' | 'construction-provenance'
      source: string
      destination: string
    }>
  }
}

function issue(severity: ProductAssetQaSeverity, path: string, message: string): ProductAssetQaIssue {
  return { severity, path, message }
}

function validTimestamp(value: string | undefined): boolean {
  return Boolean(value && Number.isFinite(Date.parse(value)))
}

function fileExtension(value: string): string {
  const clean = value.split(/[?#]/u)[0] ?? value
  const last = clean.split('/').at(-1) ?? clean
  const dot = last.lastIndexOf('.')
  return dot >= 0 ? last.slice(dot).toLowerCase() : ''
}

function fileBaseName(value: string): string {
  const clean = value.split(/[?#]/u)[0] ?? value
  return clean.split('/').at(-1) ?? clean
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function near(value: number, target: number, epsilon = 0.001): boolean {
  return Math.abs(value - target) <= epsilon
}

function normalizeRoot(productId: string, assetId: string, root?: string): string {
  const fallback = `/assets/products/${productId}/${assetId}`
  const normalized = (root?.trim() || fallback).replace(/\/+$/u, '')
  return normalized.startsWith('/') ? normalized : '/' + normalized
}

function materialLifecycleEntries(
  values: Readonly<Record<string, 'reference-only' | 'captured-master' | 'production-approved'>> | undefined,
) {
  return values ? Object.entries(values) : []
}

export function evaluateProductAssetQa(args: {
  construction: ProductConstructionPacket
  manifest: AssetManifest
  inspection: ProductAssetInspection
  materialLifecycleById?: Readonly<Record<string, 'reference-only' | 'captured-master' | 'production-approved'>>
  policy?: ProductAssetQaPolicy
}): ProductAssetQaIssue[] {
  const { construction, manifest, inspection } = args
  const policy = args.policy ?? defaultProductAssetQaPolicy
  const issues: ProductAssetQaIssue[] = []

  if (construction.schemaVersion !== 1) {
    issues.push(issue('error', 'construction.schemaVersion', 'Unsupported construction-packet schema version.'))
  }
  if (construction.status !== 'ready-for-digital-twin-reconstruction') {
    issues.push(issue('error', 'construction.status', 'Construction packet is not reconstruction-ready.'))
  }
  if (!construction.productId.trim()) issues.push(issue('error', 'construction.productId', 'Construction packet requires a product ID.'))
  if (!construction.sourceCaptureSessionId.trim()) {
    issues.push(issue('error', 'construction.sourceCaptureSessionId', 'Construction provenance requires a capture-session ID.'))
  }

  if (inspection.schemaVersion !== 1) {
    issues.push(issue('error', 'inspection.schemaVersion', 'Unsupported asset-inspection schema version.'))
  }
  if (!validTimestamp(inspection.inspectedAt)) {
    issues.push(issue('error', 'inspection.inspectedAt', 'Asset inspection requires a valid timestamp.'))
  }
  if (manifest.assetId !== inspection.assetId) {
    issues.push(issue('error', 'assetId', 'Manifest and inspected model must use the same asset ID.'))
  }

  const modelExtension = fileExtension(inspection.modelFile.name)
  if (policy.requireGlb && modelExtension !== '.glb') {
    issues.push(issue('error', 'inspection.modelFile.name', 'Production assets must be delivered as GLB.'))
  } else if (modelExtension !== '.glb') {
    issues.push(issue('warning', 'inspection.modelFile.name', 'GLB is preferred for production delivery.'))
  }

  const manifestModelName = fileBaseName(manifest.model)
  if (manifestModelName && manifestModelName !== inspection.modelFile.name) {
    issues.push(issue(
      'warning',
      'manifest.model',
      `Manifest model "${manifestModelName}" differs from inspected file "${inspection.modelFile.name}". Promotion will normalize the production path.`,
    ))
  }

  if (!Number.isFinite(inspection.modelFile.sizeBytes) || inspection.modelFile.sizeBytes <= 0) {
    issues.push(issue('error', 'inspection.modelFile.sizeBytes', 'Model file size must be greater than zero.'))
  } else if (inspection.modelFile.sizeBytes > policy.maxModelBytes) {
    issues.push(issue(
      'error',
      'inspection.modelFile.sizeBytes',
      `Model exceeds the ${Math.round(policy.maxModelBytes / 1024 / 1024)} MB production budget.`,
    ))
  }

  if (inspection.triangleCount > policy.maxTriangles) {
    issues.push(issue('error', 'inspection.triangleCount', `Triangle count exceeds the ${policy.maxTriangles.toLocaleString()} production budget.`))
  } else if (inspection.triangleCount > policy.warningTriangles) {
    issues.push(issue('warning', 'inspection.triangleCount', 'Triangle count is approaching the production ceiling; verify mobile GPU cost.'))
  }

  if (inspection.meshCount > policy.maxMeshes) {
    issues.push(issue('error', 'inspection.meshCount', `Mesh count exceeds the ${policy.maxMeshes} mesh production budget.`))
  }
  if (inspection.materialCount > policy.maxMaterials) {
    issues.push(issue('error', 'inspection.materialCount', `Material count exceeds the ${policy.maxMaterials} material production budget.`))
  }
  if (inspection.textureCount > policy.maxTextures) {
    issues.push(issue('error', 'inspection.textureCount', `Texture count exceeds the ${policy.maxTextures} texture production budget.`))
  }
  if ((inspection.maxTextureEdge ?? 0) > policy.maxTextureEdge) {
    issues.push(issue('error', 'inspection.maxTextureEdge', `Texture edge exceeds the default ${policy.maxTextureEdge}px production ceiling.`))
  }

  if (inspection.meshCount <= 0 || inspection.triangleCount <= 0) {
    issues.push(issue('error', 'inspection.geometry', 'Inspected asset must contain renderable triangle geometry.'))
  }

  if (!inspection.boundsMeters || ![
    inspection.boundsMeters.width,
    inspection.boundsMeters.height,
    inspection.boundsMeters.depth,
  ].every(finitePositive)) {
    issues.push(issue('error', 'inspection.boundsMeters', 'Asset bounds must be finite positive meter values.'))
  }

  const expectedDimensions = {
    width: construction.dimensionsMm.maxWidth,
    height: construction.dimensionsMm.maxHeight,
    depth: construction.dimensionsMm.maxDepth,
  }
  for (const [axis, expectedMm] of Object.entries(expectedDimensions)) {
    if (!finitePositive(expectedMm)) {
      issues.push(issue('error', `construction.dimensionsMm.max${axis[0]?.toUpperCase()}${axis.slice(1)}`, `Construction packet is missing authoritative maximum ${axis}.`))
      continue
    }
    const actualMeters = inspection.boundsMeters[axis as keyof typeof inspection.boundsMeters]
    if (!finitePositive(actualMeters)) continue
    const expectedMeters = expectedMm / 1000
    const delta = Math.abs(actualMeters - expectedMeters) / expectedMeters
    if (delta > policy.dimensionToleranceRatio) {
      issues.push(issue(
        'error',
        `inspection.boundsMeters.${axis}`,
        `Model ${axis} differs from the physical construction packet by ${Math.round(delta * 100)}% (allowed ${Math.round(policy.dimensionToleranceRatio * 100)}%).`,
      ))
    }
  }

  if (!inspection.rootScale.every((value) => near(value, 1))) {
    issues.push(issue('error', 'inspection.rootScale', 'Production root scale must be applied/frozen at [1, 1, 1].'))
  }

  if (inspection.nonUniformScaleNodes.length) {
    issues.push(issue(
      'warning',
      'inspection.nonUniformScaleNodes',
      `${inspection.nonUniformScaleNodes.length} node(s) retain non-uniform scale; verify transforms were intentionally preserved.`,
    ))
  }
  if (inspection.negativeScaleNodes.length) {
    issues.push(issue(
      'warning',
      'inspection.negativeScaleNodes',
      `${inspection.negativeScaleNodes.length} node(s) retain negative scale; inspect normals, handedness and animation behavior.`,
    ))
  }
  if (inspection.unnamedMeshCount > 0) {
    issues.push(issue('warning', 'inspection.unnamedMeshCount', `${inspection.unnamedMeshCount} mesh(es) are unnamed; semantic names are required for runtime-controlled geometry.`))
  }
  if (inspection.animationClipNames.length > 0) {
    issues.push(issue('warning', 'inspection.animationClipNames', 'Embedded animation clips exist. SLS prefers manifest-controlled mechanical motion for customer-facing states.'))
  }

  const knownMaterialIds = materialLifecycleEntries(args.materialLifecycleById).map(([id]) => id)
  for (const manifestIssue of validateAssetManifest(manifest, knownMaterialIds, inspection.nodeNames)) {
    issues.push(issue('error', `manifest.${manifestIssue.path}`, manifestIssue.message))
  }

  const semanticNodeNames = new Set(construction.constructionNodes
    .filter((node) => node.status === 'confirmed')
    .map((node) => node.nodeName.trim())
    .filter(Boolean))

  const nodeNames = new Set(inspection.nodeNames)
  for (const name of semanticNodeNames) {
    if (!nodeNames.has(name)) {
      issues.push(issue('error', 'inspection.nodeNames', `Required construction semantic node "${name}" is missing from the model.`))
    }
  }

  const referencedNodeNames = new Set<string>([
    manifest.rootNode,
    ...Object.values(manifest.materialSlots).flat(),
    ...Object.values(manifest.components).flat(),
    ...Object.values(manifest.animations).map((animation) => animation.target),
    ...semanticNodeNames,
  ])
  for (const duplicate of inspection.duplicateNodeNames) {
    if (referencedNodeNames.has(duplicate)) {
      issues.push(issue('error', 'inspection.duplicateNodeNames', `Semantic node "${duplicate}" is duplicated; runtime resolution would be ambiguous.`))
    } else {
      issues.push(issue('warning', 'inspection.duplicateNodeNames', `Node name "${duplicate}" is duplicated.`))
    }
  }

  for (const slot of construction.materialSlots.filter((entry) => entry.status === 'confirmed')) {
    if (!manifest.materialSlots[slot.slotId]) {
      issues.push(issue('error', `manifest.materialSlots.${slot.slotId}`, `Confirmed construction material slot "${slot.slotId}" is absent from the asset manifest.`))
    }
  }

  for (const component of construction.components.filter((entry) => entry.status === 'confirmed')) {
    const key = `${component.groupId}.${component.valueId}`
    if (!manifest.components[key]) {
      issues.push(issue('error', `manifest.components.${key}`, `Confirmed construction component "${key}" is absent from the asset manifest.`))
    }
  }

  if (args.materialLifecycleById) {
    for (const [slot, materialId] of Object.entries(manifest.defaultMaterialVariants ?? {})) {
      const lifecycle = args.materialLifecycleById[materialId]
      if (!lifecycle) {
        issues.push(issue('error', `manifest.defaultMaterialVariants.${slot}`, `Material "${materialId}" is not present in the Scorpion material registry.`))
      } else if (lifecycle !== 'production-approved') {
        issues.push(issue('error', `manifest.defaultMaterialVariants.${slot}`, `Material "${materialId}" is "${lifecycle}", not production-approved.`))
      }
    }
  }

  return issues
}

export function buildProductAssetQaApproval(args: {
  construction: ProductConstructionPacket
  manifest: AssetManifest
  inspection: ProductAssetInspection
  review: ProductAssetHumanReview
  materialLifecycleById?: Readonly<Record<string, 'reference-only' | 'captured-master' | 'production-approved'>>
  policy?: ProductAssetQaPolicy
}): ProductAssetQaApprovalPacket {
  const policy = args.policy ?? defaultProductAssetQaPolicy
  const issues = evaluateProductAssetQa({ ...args, policy })
  const blockers = issues.filter((entry) => entry.severity === 'error')
  if (blockers.length) {
    throw new Error(blockers.map((entry) => `${entry.path}: ${entry.message}`).join('\n'))
  }
  if (!args.review.reviewer.trim()) throw new Error('review.reviewer: A named reviewer is required.')
  if (!validTimestamp(args.review.reviewedAt)) throw new Error('review.reviewedAt: A valid review timestamp is required.')

  const failedChecks = Object.entries(args.review.checks).filter(([, passed]) => !passed)
  if (failedChecks.length || Object.keys(args.review.checks).length !== Object.keys(productAssetReviewLabels).length) {
    throw new Error('review.checks: Every visual/functional QA check must be explicitly passed.')
  }

  return {
    schemaVersion: 1,
    productId: args.construction.productId,
    assetId: args.manifest.assetId,
    sourceCaptureSessionId: args.construction.sourceCaptureSessionId,
    capturePlanId: args.construction.capturePlanId,
    sourceModelFile: args.inspection.modelFile.name,
    reviewedAt: new Date(args.review.reviewedAt).toISOString(),
    reviewer: args.review.reviewer.trim(),
    decision: 'approved-for-production-asset-promotion',
    automaticRegistryMutation: false,
    automated: {
      blockers: 0,
      warnings: issues.filter((entry) => entry.severity === 'warning').length,
      policy,
    },
    checks: { ...args.review.checks },
    notes: args.review.notes?.trim() || undefined,
  }
}

export function promoteProductAsset(args: {
  construction: ProductConstructionPacket
  manifest: AssetManifest
  inspection: ProductAssetInspection
  approval: ProductAssetQaApprovalPacket
  promotedAt: string
  assetRoot?: string
}): ProductAssetPromotionResult {
  if (args.approval.decision !== 'approved-for-production-asset-promotion') {
    throw new Error('approval.decision: Asset QA packet does not approve production promotion.')
  }
  if (args.approval.automaticRegistryMutation !== false) {
    throw new Error('approval.automaticRegistryMutation: Manual production-asset promotion must remain explicit.')
  }
  if (!validTimestamp(args.promotedAt)) throw new Error('promotedAt: A valid promotion timestamp is required.')

  const expected = [
    ['productId', args.construction.productId, args.approval.productId],
    ['assetId', args.manifest.assetId, args.inspection.assetId],
    ['approval.assetId', args.manifest.assetId, args.approval.assetId],
    ['captureSessionId', args.construction.sourceCaptureSessionId, args.approval.sourceCaptureSessionId],
    ['capturePlanId', args.construction.capturePlanId, args.approval.capturePlanId],
  ] as const
  for (const [path, left, right] of expected) {
    if (!left || !right || left !== right) throw new Error(`${path}: Product-asset promotion provenance does not match.`)
  }

  if (args.approval.sourceModelFile !== args.inspection.modelFile.name) {
    throw new Error('approval.sourceModelFile: QA approval does not reference the inspected model file.')
  }

  const root = normalizeRoot(args.construction.productId, args.manifest.assetId, args.assetRoot)
  const modelDestination = `${root}/model.glb`
  const productionManifest: AssetManifest = {
    ...args.manifest,
    model: modelDestination,
  }

  const record: ProductionProductAssetRecord = {
    schemaVersion: 1,
    productId: args.construction.productId,
    assetId: args.manifest.assetId,
    lifecycle: 'production-approved',
    sourceCaptureSessionId: args.construction.sourceCaptureSessionId,
    capturePlanId: args.construction.capturePlanId,
    promotedAt: new Date(args.promotedAt).toISOString(),
    reviewer: args.approval.reviewer,
    qaReviewedAt: args.approval.reviewedAt,
    automaticRegistryMutation: false,
    assetRoot: root,
    manifest: productionManifest,
  }

  return {
    record,
    assetPlacement: {
      productId: record.productId,
      assetId: record.assetId,
      root,
      files: [
        { kind: 'model', source: args.inspection.modelFile.name, destination: modelDestination },
        { kind: 'manifest', source: `${args.manifest.assetId}-manifest.json`, destination: `${root}/manifest.json` },
        { kind: 'qa-approval', source: `${args.manifest.assetId}-qa-approval.json`, destination: `${root}/qa-approval.json` },
        { kind: 'construction-provenance', source: `${args.construction.productId}-construction-packet.json`, destination: `${root}/construction-provenance.json` },
      ],
    },
  }
}

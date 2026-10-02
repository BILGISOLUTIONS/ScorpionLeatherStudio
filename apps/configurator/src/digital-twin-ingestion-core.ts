import { defaultProductAssetQaPolicy } from '@sls/product-asset-qa'
import type { ProductConstructionPacket } from '@sls/product-capture'

export type ReconstructionProviderId =
  | 'trellis2'
  | 'meshy'
  | 'stable-fast-3d'
  | 'spar3d'
  | 'other'

export type ReconstructionInputMode = 'single-image' | 'multi-image' | 'provider-dependent'
export type ReconstructionIntent = 'draft' | 'production-candidate' | 'source-master'

export interface ReconstructionProviderProfile {
  id: ReconstructionProviderId
  label: string
  inputMode: ReconstructionInputMode
  recommendedImageCount: number
  maxImages?: number
  launchUrl?: string
  notes: readonly string[]
}

export const reconstructionProviderProfiles: readonly ReconstructionProviderProfile[] = [
  {
    id: 'trellis2',
    label: 'Microsoft TRELLIS.2',
    inputMode: 'single-image',
    recommendedImageCount: 1,
    launchUrl: 'https://huggingface.co/spaces/microsoft/TRELLIS.2',
    notes: [
      'Current hosted workflow is best treated as a single-image reconstruction source.',
      'Use a clean three-quarter source image and preserve the rest of the capture set as physical QA evidence.',
    ],
  },
  {
    id: 'meshy',
    label: 'Meshy',
    inputMode: 'multi-image',
    recommendedImageCount: 4,
    maxImages: 4,
    launchUrl: 'https://www.meshy.ai/',
    notes: [
      'Prefer multi-image reconstruction for products with important rear/side construction.',
      'Export rights and commercial-use terms must be confirmed for the account/plan used.',
    ],
  },
  {
    id: 'stable-fast-3d',
    label: 'Stable Fast 3D',
    inputMode: 'single-image',
    recommendedImageCount: 1,
    launchUrl: 'https://huggingface.co/spaces/stabilityai/stable-fast-3d',
    notes: [
      'Useful as a fast single-image baseline and for comparing reconstruction quality.',
      'Keep physical dimensions and additional angles available for downstream correction.',
    ],
  },
  {
    id: 'spar3d',
    label: 'SPAR3D',
    inputMode: 'single-image',
    recommendedImageCount: 1,
    notes: [
      'Use as a reconstruction candidate only; hidden construction remains unverified until compared with capture evidence.',
    ],
  },
  {
    id: 'other',
    label: 'Other / manual reconstruction',
    inputMode: 'provider-dependent',
    recommendedImageCount: 4,
    notes: [
      'Document the exact tool/version, source views, export format, rights, and generation reference.',
    ],
  },
]

export interface ReconstructionSourceFile {
  sourceKey: string
  sourceLabel: string
  captureReferenceName: string
  preparedFileName: string
  sizeBytes: number
  type: string
  lastModified: number
  geometryPreservedConfirmed: boolean
}

export interface ReconstructionJobPacket {
  schemaVersion: 1
  jobId: string
  assetId: string
  productId: string
  productLabel: string
  sourceCaptureSessionId: string
  capturePlanId: string
  createdAt: string
  status: 'ready-for-external-reconstruction'
  provider: {
    id: ReconstructionProviderId
    label: string
    inputMode: ReconstructionInputMode
    externalRuntime: true
    credentialsStoredInPacket: false
  }
  intent: ReconstructionIntent
  sourceImages: ReconstructionSourceFile[]
  authority: {
    dimensionsMm: Record<string, number>
    confirmedSemanticNodes: string[]
    confirmedMaterialSlots: string[]
    realProductIsGeometryAuthority: true
    aiGeneratedMaterialsAreReferenceOnly: true
    automaticProductionPromotion: false
  }
  outputRequest: {
    preferredFormat: 'glb'
    targetWebTriangles: number
    targetTextureEdge: number
    preservePbrWhenAvailable: true
  }
  operatorNotes?: string
}

export interface ReconstructionIssue {
  severity: 'error' | 'warning'
  path: string
  message: string
}

export interface DigitalTwinCandidatePacket {
  schemaVersion: 1
  candidateId: string
  jobId: string
  assetId: string
  productId: string
  sourceCaptureSessionId: string
  capturePlanId: string
  generatedAt: string
  provider: {
    id: ReconstructionProviderId
    label: string
    resultReference?: string
  }
  sourceImages: Array<{
    sourceKey: string
    preparedFileName: string
  }>
  modelFile: {
    name: string
    sizeBytes: number
    type: string
    format: string
  }
  rights: {
    sourcePhotosAuthorized: boolean
    commercialUseConfirmed: boolean
    exportRightsConfirmed: boolean
    providerTermsReviewed: boolean
    notes?: string
  }
  lifecycle: 'raw-reconstruction-candidate'
  productionAuthority: false
  requiresDigitalTwinQa: true
  automaticProductionPromotion: false
}

export interface ReconstructionProcessingHandoff {
  schemaVersion: 1
  candidateId: string
  jobId: string
  assetId: string
  productId: string
  sourceCaptureSessionId: string
  sourceModelFile: string
  authoritativeDimensionsMeters: {
    width: number
    height: number
    depth: number
  }
  semanticContract: {
    requiredNodeNames: string[]
    materialSlots: Array<{
      slotId: string
      nodeNames: string[]
      materialId?: string
    }>
  }
  deliveryTarget: {
    format: 'glb'
    units: 'meters'
    upAxis: 'Y'
    rootScale: [1, 1, 1]
    maxModelBytes: number
    maxTriangles: number
    warningTriangles: number
    maxMeshes: number
    maxMaterials: number
    maxTextures: number
    maxTextureEdge: number
    dimensionToleranceRatio: number
  }
  surfaceAuthority: {
    aiGeneratedAppearance: 'reference-only'
    productionMaterials: 'approved-scorpion-material-registry'
    physicalUvScaleRequired: true
  }
  requiredStages: readonly [
    'compare-against-capture-evidence',
    'correct-scale-and-proportions',
    'clean-topology-and-hidden-garbage',
    'retopologize-or-decimate',
    'author-semantic-nodes-and-material-slots',
    'author-or-verify-uv0-and-normals',
    'author-customization-zones',
    'export-glb',
    'run-blender-preflight',
    'run-digital-twin-qa'
  ]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim())
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value))
}

function extension(name: string): string {
  const match = name.trim().toLowerCase().match(/(\.[a-z0-9]+)$/u)
  return match?.[1] ?? ''
}

export function getReconstructionProviderProfile(id: ReconstructionProviderId): ReconstructionProviderProfile {
  const profile = reconstructionProviderProfiles.find((entry) => entry.id === id)
  if (!profile) throw new Error('Unknown reconstruction provider: ' + id)
  return profile
}

export function parseProductConstructionPacket(input: unknown): ProductConstructionPacket {
  const record = asRecord(input)
  if (!record) throw new Error('Construction packet must be a JSON object.')
  if (record.schemaVersion !== 1) throw new Error('Unsupported construction-packet schema version.')
  if (record.status !== 'ready-for-digital-twin-reconstruction') {
    throw new Error('Construction packet is not ready for digital-twin reconstruction.')
  }
  if (!nonEmpty(record.productId) || !nonEmpty(record.productLabel)) {
    throw new Error('Construction packet is missing product identity.')
  }
  if (!nonEmpty(record.sourceCaptureSessionId) || !nonEmpty(record.capturePlanId)) {
    throw new Error('Construction packet is missing capture provenance.')
  }
  const dimensions = asRecord(record.dimensionsMm)
  if (!dimensions || !positive(dimensions.maxWidth) || !positive(dimensions.maxHeight) || !positive(dimensions.maxDepth)) {
    throw new Error('Construction packet requires authoritative maximum width, height, and depth.')
  }
  if (!Array.isArray(record.referenceCoverage) || record.referenceCoverage.length === 0) {
    throw new Error('Construction packet does not contain reference coverage.')
  }
  if (!Array.isArray(record.constructionNodes) || !Array.isArray(record.materialSlots)) {
    throw new Error('Construction packet is missing the semantic/model surface contract.')
  }
  return input as ProductConstructionPacket
}

function availableReferenceKeys(construction: ProductConstructionPacket): Set<string> {
  return new Set(construction.referenceCoverage.map((entry) => entry.key))
}

export function recommendedReconstructionSourceKeys(
  construction: ProductConstructionPacket,
  providerId: ReconstructionProviderId,
): string[] {
  const profile = getReconstructionProviderProfile(providerId)
  const available = availableReferenceKeys(construction)
  const threeQuarter = ['frontLeft45', 'rearRight45', 'frontRight45', 'rearLeft45'].filter((key) => available.has(key))
  const cardinal = ['front', 'rear', 'left', 'right'].filter((key) => available.has(key))
  const fallback = construction.referenceCoverage
    .filter((entry) => entry.kind === 'required-view')
    .map((entry) => entry.key)

  if (profile.inputMode === 'single-image') {
    const preferred = ['frontLeft45', 'frontRight45', 'front'].find((key) => available.has(key))
    return preferred ? [preferred] : fallback.slice(0, 1)
  }

  const candidates = [...threeQuarter, ...cardinal, ...fallback]
  const unique = [...new Set(candidates)]
  return unique.slice(0, profile.recommendedImageCount)
}

export function evaluateReconstructionJob(packet: ReconstructionJobPacket): ReconstructionIssue[] {
  const issues: ReconstructionIssue[] = []
  const profile = getReconstructionProviderProfile(packet.provider.id)

  if (!packet.jobId.trim()) issues.push({ severity: 'error', path: 'jobId', message: 'Job ID is required.' })
  if (!packet.assetId.trim()) issues.push({ severity: 'error', path: 'assetId', message: 'Asset ID is required.' })
  if (!validTimestamp(packet.createdAt)) issues.push({ severity: 'error', path: 'createdAt', message: 'A valid job timestamp is required.' })
  if (!packet.sourceImages.length) {
    issues.push({ severity: 'error', path: 'sourceImages', message: 'At least one prepared reconstruction image is required.' })
  }
  if (profile.inputMode === 'single-image' && packet.sourceImages.length !== 1) {
    issues.push({ severity: 'error', path: 'sourceImages', message: profile.label + ' is configured here as a single-image provider.' })
  }
  if (profile.inputMode === 'multi-image' && packet.sourceImages.length < 2) {
    issues.push({ severity: 'error', path: 'sourceImages', message: profile.label + ' requires a multi-image source set in this pipeline.' })
  }
  if (profile.maxImages && packet.sourceImages.length > profile.maxImages) {
    issues.push({ severity: 'error', path: 'sourceImages', message: profile.label + ' is configured for at most ' + profile.maxImages + ' source images.' })
  }

  const keys = new Set<string>()
  for (const source of packet.sourceImages) {
    if (keys.has(source.sourceKey)) {
      issues.push({ severity: 'error', path: 'sourceImages.' + source.sourceKey, message: 'A reconstruction view may only be included once.' })
    }
    keys.add(source.sourceKey)
    if (!source.geometryPreservedConfirmed) {
      issues.push({
        severity: 'error',
        path: 'sourceImages.' + source.sourceKey + '.geometryPreservedConfirmed',
        message: 'Prepared images must be confirmed as geometry-preserving retouches.',
      })
    }
    if (!source.preparedFileName.trim() || source.sizeBytes <= 0) {
      issues.push({ severity: 'error', path: 'sourceImages.' + source.sourceKey, message: 'Prepared image metadata is incomplete.' })
    }
    if (source.preparedFileName !== source.captureReferenceName) {
      issues.push({
        severity: 'warning',
        path: 'sourceImages.' + source.sourceKey + '.preparedFileName',
        message: 'Prepared derivative filename differs from the original capture reference; provenance is retained through the source key.',
      })
    }
    if (source.sizeBytes > 25 * 1024 * 1024) {
      issues.push({
        severity: 'warning',
        path: 'sourceImages.' + source.sourceKey + '.sizeBytes',
        message: 'Prepared image exceeds 25 MB; provider upload limits or unnecessary resolution may become a problem.',
      })
    }
  }
  return issues
}

export function buildReconstructionJobPacket(args: {
  construction: ProductConstructionPacket
  providerId: ReconstructionProviderId
  sourceFiles: ReconstructionSourceFile[]
  jobId: string
  assetId: string
  createdAt: string
  intent: ReconstructionIntent
  operatorNotes?: string
}): ReconstructionJobPacket {
  const profile = getReconstructionProviderProfile(args.providerId)
  const knownReferences = new Map(args.construction.referenceCoverage.map((entry) => [entry.key, entry]))
  for (const source of args.sourceFiles) {
    if (!knownReferences.has(source.sourceKey)) {
      throw new Error('sourceFiles.' + source.sourceKey + ': Source role is not present in the physical capture packet.')
    }
  }

  const packet: ReconstructionJobPacket = {
    schemaVersion: 1,
    jobId: args.jobId.trim(),
    assetId: args.assetId.trim(),
    productId: args.construction.productId,
    productLabel: args.construction.productLabel,
    sourceCaptureSessionId: args.construction.sourceCaptureSessionId,
    capturePlanId: args.construction.capturePlanId,
    createdAt: new Date(args.createdAt).toISOString(),
    status: 'ready-for-external-reconstruction',
    provider: {
      id: profile.id,
      label: profile.label,
      inputMode: profile.inputMode,
      externalRuntime: true,
      credentialsStoredInPacket: false,
    },
    intent: args.intent,
    sourceImages: args.sourceFiles.map((source) => ({ ...source })),
    authority: {
      dimensionsMm: { ...args.construction.dimensionsMm },
      confirmedSemanticNodes: args.construction.constructionNodes
        .filter((node) => node.status === 'confirmed')
        .map((node) => node.nodeName.trim())
        .filter(Boolean),
      confirmedMaterialSlots: args.construction.materialSlots
        .filter((slot) => slot.status === 'confirmed')
        .map((slot) => slot.slotId),
      realProductIsGeometryAuthority: true,
      aiGeneratedMaterialsAreReferenceOnly: true,
      automaticProductionPromotion: false,
    },
    outputRequest: {
      preferredFormat: 'glb',
      targetWebTriangles: defaultProductAssetQaPolicy.maxTriangles,
      targetTextureEdge: defaultProductAssetQaPolicy.maxTextureEdge,
      preservePbrWhenAvailable: true,
    },
    operatorNotes: args.operatorNotes?.trim() || undefined,
  }

  const blockers = evaluateReconstructionJob(packet).filter((entry) => entry.severity === 'error')
  if (blockers.length) {
    throw new Error(blockers.map((entry) => entry.path + ': ' + entry.message).join('\n'))
  }
  return packet
}

export function evaluateDigitalTwinCandidate(
  job: ReconstructionJobPacket,
  candidate: DigitalTwinCandidatePacket,
): ReconstructionIssue[] {
  const issues: ReconstructionIssue[] = []
  const expected: Array<[string, string, string]> = [
    ['jobId', job.jobId, candidate.jobId],
    ['assetId', job.assetId, candidate.assetId],
    ['productId', job.productId, candidate.productId],
    ['sourceCaptureSessionId', job.sourceCaptureSessionId, candidate.sourceCaptureSessionId],
    ['capturePlanId', job.capturePlanId, candidate.capturePlanId],
  ]
  for (const [path, left, right] of expected) {
    if (!left || !right || left !== right) {
      issues.push({ severity: 'error', path, message: 'Candidate provenance does not match the reconstruction job.' })
    }
  }

  if (!validTimestamp(candidate.generatedAt)) {
    issues.push({ severity: 'error', path: 'generatedAt', message: 'A valid candidate generation timestamp is required.' })
  }
  if (!candidate.modelFile.name.trim() || candidate.modelFile.sizeBytes <= 0) {
    issues.push({ severity: 'error', path: 'modelFile', message: 'Candidate model metadata is incomplete.' })
  }

  const format = candidate.modelFile.format.toLowerCase()
  const allowed = new Set(['glb', 'gltf', 'obj', 'fbx', 'ply'])
  if (!allowed.has(format)) {
    issues.push({ severity: 'error', path: 'modelFile.format', message: 'Unsupported reconstruction candidate format.' })
  } else if (format !== 'glb') {
    issues.push({
      severity: 'warning',
      path: 'modelFile.format',
      message: 'Raw reconstruction may be processed from this format, but SLS production delivery must end as GLB.',
    })
  }

  for (const [field, confirmed] of Object.entries(candidate.rights)) {
    if (field === 'notes') continue
    if (confirmed !== true) {
      issues.push({ severity: 'error', path: 'rights.' + field, message: 'Production candidate intake requires this rights/terms confirmation.' })
    }
  }

  if (candidate.modelFile.sizeBytes > 150 * 1024 * 1024) {
    issues.push({
      severity: 'warning',
      path: 'modelFile.sizeBytes',
      message: 'Raw reconstruction exceeds 150 MB. Keep it as an archival source master and create a reduced working copy before web QA.',
    })
  }

  return issues
}

export function buildDigitalTwinCandidatePacket(args: {
  job: ReconstructionJobPacket
  candidateId: string
  generatedAt: string
  modelFile: {
    name: string
    sizeBytes: number
    type: string
  }
  resultReference?: string
  rights: DigitalTwinCandidatePacket['rights']
}): DigitalTwinCandidatePacket {
  const format = extension(args.modelFile.name).replace('.', '')
  const candidate: DigitalTwinCandidatePacket = {
    schemaVersion: 1,
    candidateId: args.candidateId.trim(),
    jobId: args.job.jobId,
    assetId: args.job.assetId,
    productId: args.job.productId,
    sourceCaptureSessionId: args.job.sourceCaptureSessionId,
    capturePlanId: args.job.capturePlanId,
    generatedAt: new Date(args.generatedAt).toISOString(),
    provider: {
      id: args.job.provider.id,
      label: args.job.provider.label,
      resultReference: args.resultReference?.trim() || undefined,
    },
    sourceImages: args.job.sourceImages.map((source) => ({
      sourceKey: source.sourceKey,
      preparedFileName: source.preparedFileName,
    })),
    modelFile: {
      ...args.modelFile,
      format,
    },
    rights: {
      ...args.rights,
      notes: args.rights.notes?.trim() || undefined,
    },
    lifecycle: 'raw-reconstruction-candidate',
    productionAuthority: false,
    requiresDigitalTwinQa: true,
    automaticProductionPromotion: false,
  }

  if (!candidate.candidateId) throw new Error('candidateId: Candidate ID is required.')
  const blockers = evaluateDigitalTwinCandidate(args.job, candidate).filter((entry) => entry.severity === 'error')
  if (blockers.length) {
    throw new Error(blockers.map((entry) => entry.path + ': ' + entry.message).join('\n'))
  }
  return candidate
}

export function buildReconstructionProcessingHandoff(args: {
  construction: ProductConstructionPacket
  job: ReconstructionJobPacket
  candidate: DigitalTwinCandidatePacket
}): ReconstructionProcessingHandoff {
  const blockers = evaluateDigitalTwinCandidate(args.job, args.candidate).filter((entry) => entry.severity === 'error')
  if (blockers.length) throw new Error(blockers.map((entry) => entry.path + ': ' + entry.message).join('\n'))

  const dimensions = args.construction.dimensionsMm
  if (!positive(dimensions.maxWidth) || !positive(dimensions.maxHeight) || !positive(dimensions.maxDepth)) {
    throw new Error('construction.dimensionsMm: Authoritative physical envelope is incomplete.')
  }

  return {
    schemaVersion: 1,
    candidateId: args.candidate.candidateId,
    jobId: args.job.jobId,
    assetId: args.job.assetId,
    productId: args.job.productId,
    sourceCaptureSessionId: args.job.sourceCaptureSessionId,
    sourceModelFile: args.candidate.modelFile.name,
    authoritativeDimensionsMeters: {
      width: dimensions.maxWidth / 1000,
      height: dimensions.maxHeight / 1000,
      depth: dimensions.maxDepth / 1000,
    },
    semanticContract: {
      requiredNodeNames: args.construction.constructionNodes
        .filter((node) => node.status === 'confirmed')
        .map((node) => node.nodeName.trim())
        .filter(Boolean),
      materialSlots: args.construction.materialSlots
        .filter((slot) => slot.status === 'confirmed')
        .map((slot) => ({
          slotId: slot.slotId,
          nodeNames: slot.nodeNames.map((name) => name.trim()).filter(Boolean),
          materialId: slot.materialId?.trim() || undefined,
        })),
    },
    deliveryTarget: {
      format: 'glb',
      units: 'meters',
      upAxis: 'Y',
      rootScale: [1, 1, 1],
      maxModelBytes: defaultProductAssetQaPolicy.maxModelBytes,
      maxTriangles: defaultProductAssetQaPolicy.maxTriangles,
      warningTriangles: defaultProductAssetQaPolicy.warningTriangles,
      maxMeshes: defaultProductAssetQaPolicy.maxMeshes,
      maxMaterials: defaultProductAssetQaPolicy.maxMaterials,
      maxTextures: defaultProductAssetQaPolicy.maxTextures,
      maxTextureEdge: defaultProductAssetQaPolicy.maxTextureEdge,
      dimensionToleranceRatio: defaultProductAssetQaPolicy.dimensionToleranceRatio,
    },
    surfaceAuthority: {
      aiGeneratedAppearance: 'reference-only',
      productionMaterials: 'approved-scorpion-material-registry',
      physicalUvScaleRequired: true,
    },
    requiredStages: [
      'compare-against-capture-evidence',
      'correct-scale-and-proportions',
      'clean-topology-and-hidden-garbage',
      'retopologize-or-decimate',
      'author-semantic-nodes-and-material-slots',
      'author-or-verify-uv0-and-normals',
      'author-customization-zones',
      'export-glb',
      'run-blender-preflight',
      'run-digital-twin-qa',
    ],
  }
}

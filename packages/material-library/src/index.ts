import type { MaterialTextures, MaterialVariant } from '@sls/product-schema'

export type MaterialLifecycle = 'reference-only' | 'captured-master' | 'production-approved'
export type MaterialAvailability = 'confirmed' | 'quote' | 'unverified'
export type CaptureSource = 'photographed-product-reference' | 'field-capture' | 'supplier-reference' | 'synthetic-placeholder'

export interface MaterialTextureTier {
  maxEdge: 1024 | 2048 | 4096
  textures: MaterialTextures
}

export interface MaterialCaptureProvenance {
  source: CaptureSource
  captureSessionId?: string
  capturedAt?: string
  operator?: string
  colorTarget?: string
  crossPolarized?: boolean
  directionalLighting?: boolean
  scaleReference?: boolean
  notes?: string
}

export interface PhysicalMaterialMetadata {
  materialType?: string
  hide?: string
  grain?: string
  finish?: string
  thicknessMm?: number
  textureTileSizeMm?: [number, number]
  supplier?: string
  supplierItem?: string
}

export interface MaterialApprovalMetadata {
  reviewer: string
  reviewedAt: string
  decision: 'approved-for-registry-promotion'
  sourceQaPacket?: string
}

export interface ScorpionMaterialDefinition {
  schemaVersion: 1
  id: string
  label: string
  kind: MaterialVariant['kind']
  lifecycle: MaterialLifecycle
  availability: MaterialAvailability
  previewColor: string
  physical?: PhysicalMaterialMetadata
  provenance: MaterialCaptureProvenance
  approval?: MaterialApprovalMetadata
  renderer: Omit<MaterialVariant, 'id' | 'label' | 'kind' | 'color' | 'textures'>
  textureTiers?: MaterialTextureTier[]
}

export interface MaterialValidationIssue {
  materialId: string
  path: string
  message: string
}

export function validateMaterialDefinition(material: ScorpionMaterialDefinition): MaterialValidationIssue[] {
  const issues: MaterialValidationIssue[] = []
  const issue = (path: string, message: string) => issues.push({ materialId: material.id, path, message })

  if (material.schemaVersion !== 1) issue('schemaVersion', 'Unsupported material schema version.')
  if (!material.id.trim()) issue('id', 'Material id is required.')
  if (!material.label.trim()) issue('label', 'Material label is required.')
  if (!/^#[0-9a-f]{6}$/iu.test(material.previewColor)) issue('previewColor', 'Preview color must be a six-digit hex color.')

  if (material.lifecycle === 'production-approved') {
    if (material.provenance.source !== 'field-capture' && material.provenance.source !== 'supplier-reference') {
      issue('provenance.source', 'Production-approved materials must come from a field capture or supplier reference.')
    }
    if (!material.approval?.reviewer.trim()) {
      issue('approval.reviewer', 'Production-approved materials require a named reviewer.')
    }
    if (!material.approval?.reviewedAt) {
      issue('approval.reviewedAt', 'Production-approved materials require a review timestamp.')
    }
    if (material.approval?.decision !== 'approved-for-registry-promotion') {
      issue('approval.decision', 'Production-approved materials require an explicit QA promotion decision.')
    }

    if (material.provenance.source === 'field-capture') {
      if (!material.provenance.captureSessionId) {
        issue('provenance.captureSessionId', 'Field-captured production materials require a capture session id.')
      }
      if (!material.provenance.crossPolarized) {
        issue('provenance.crossPolarized', 'Field-captured production materials require a cross-polarized source frame.')
      }
      if (!material.provenance.directionalLighting) {
        issue('provenance.directionalLighting', 'Field-captured production materials require the directional lighting set.')
      }
      if (!material.provenance.scaleReference) {
        issue('provenance.scaleReference', 'Field-captured production materials require a scale reference for texture sizing.')
      }
    }

    if (material.kind === 'leather') {
      if (material.renderer.textureRepeat) {
        issue('renderer.textureRepeat', 'Production leather repeat must be derived from physical.textureTileSizeMm, not a manual renderer override.')
      }
      if (!material.textureTiers?.length) {
        issue('textureTiers', 'Production-approved leather requires at least one texture tier.')
      }
      if (!material.textureTiers?.some((tier) => tier.maxEdge === 1024)) {
        issue('textureTiers.1024', 'Production-approved leather requires a 1K baseline tier for efficient delivery.')
      }
    }
  }

  if (material.physical?.thicknessMm !== undefined && material.physical.thicknessMm <= 0) {
    issue('physical.thicknessMm', 'Material thickness must be greater than zero.')
  }
  if (
    material.physical?.textureTileSizeMm &&
    material.physical.textureTileSizeMm.some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    issue('physical.textureTileSizeMm', 'Texture tile physical width and height must be positive millimeter values.')
  }
  if (material.lifecycle === 'production-approved' && material.kind === 'leather' && material.textureTiers?.length) {
    if (!material.physical?.textureTileSizeMm) {
      issue('physical.textureTileSizeMm', 'Production leather with texture maps requires the physical tile size used by the captured maps.')
    }
  }

  const seenEdges = new Set<number>()
  for (const tier of material.textureTiers ?? []) {
    if (seenEdges.has(tier.maxEdge)) issue('textureTiers', `Duplicate ${tier.maxEdge}px texture tier.`)
    seenEdges.add(tier.maxEdge)

    if (material.kind === 'leather' && !tier.textures.baseColor) {
      issue(`textureTiers.${tier.maxEdge}.baseColor`, 'Leather texture tiers require a base-color map.')
    }
    if (material.lifecycle === 'production-approved' && material.kind === 'leather' && !tier.textures.normal) {
      issue(`textureTiers.${tier.maxEdge}.normal`, 'Production leather texture tiers require a normal map.')
    }
    if (material.lifecycle === 'production-approved' && material.kind === 'leather' && !tier.textures.roughness) {
      issue(`textureTiers.${tier.maxEdge}.roughness`, 'Production leather texture tiers require a roughness map.')
    }
  }

  return issues
}

export function selectTextureTier(
  material: ScorpionMaterialDefinition,
  preferredMaxEdge = 2048,
): MaterialTextureTier | undefined {
  const tiers = [...(material.textureTiers ?? [])].sort((a, b) => a.maxEdge - b.maxEdge)
  if (!tiers.length) return undefined

  const eligible = tiers.filter((tier) => tier.maxEdge <= preferredMaxEdge)
  return eligible.at(-1) ?? tiers[0]
}

export function toMaterialVariant(
  material: ScorpionMaterialDefinition,
  preferredMaxEdge = 2048,
): MaterialVariant {
  const tier = selectTextureTier(material, preferredMaxEdge)
  const physicalTile = material.physical?.textureTileSizeMm
  const physicalRepeat = physicalTile
    ? [1000 / physicalTile[0], 1000 / physicalTile[1]] as [number, number]
    : undefined

  return {
    id: material.id,
    label: material.label,
    kind: material.kind,
    color: material.previewColor,
    ...material.renderer,
    ...(!material.renderer.textureRepeat && physicalRepeat ? { textureRepeat: physicalRepeat } : {}),
    ...(tier ? { textures: tier.textures } : {}),
  }
}

export function createRendererMaterialMap(
  materials: readonly ScorpionMaterialDefinition[],
  preferredMaxEdge = 2048,
): Record<string, MaterialVariant> {
  return Object.fromEntries(materials.map((material) => [material.id, toMaterialVariant(material, preferredMaxEdge)]))
}


export type LeatherCompositionPolicy = 'locked' | 'tintable'
export type LeatherSurfaceAvailability = 'captured' | 'development'

export interface LeatherStructureDefinition {
  id: string
  label: string
  materialId: string
  compositionPolicy: LeatherCompositionPolicy
  availability: LeatherSurfaceAvailability
  description?: string
}

export interface LeatherDyeDefinition {
  id: string
  label: string
  mode: 'captured' | 'tint'
  color: string
  tintStrength: number
  roughnessMultiplier?: number
  availability: LeatherSurfaceAvailability
}

export interface LeatherFinishDefinition {
  id: string
  label: string
  mode: 'captured' | 'finish'
  roughnessMultiplier: number
  sheenMultiplier: number
  clearcoatAdd?: number
  clearcoatRoughness?: number
  normalScaleMultiplier?: number
  availability: LeatherSurfaceAvailability
}

export interface LeatherCompositionSelection {
  structureId: string
  dyeId: string
  finishId: string
}

export interface LeatherCompositionResult {
  variant: MaterialVariant
  structure: LeatherStructureDefinition
  dye: LeatherDyeDefinition
  finish: LeatherFinishDefinition
  dyeApplied: boolean
  finishApplied: boolean
  developmentOnly: boolean
  warnings: string[]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseHex(value: string): [number, number, number] {
  const normalized = value.replace('#', '')
  if (!/^[0-9a-f]{6}$/iu.test(normalized)) throw new Error(`Invalid six-digit hex color: ${value}`)
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ]
}

function toHexChannel(value: number): string {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')
}

export function mixHexColor(from: string, to: string, amount: number): string {
  const [fr, fg, fb] = parseHex(from)
  const [tr, tg, tb] = parseHex(to)
  const t = clamp(amount, 0, 1)
  return `#${toHexChannel(fr + (tr - fr) * t)}${toHexChannel(fg + (tg - fg) * t)}${toHexChannel(fb + (tb - fb) * t)}`
}

export function composeLeatherMaterialVariant(args: {
  structure: LeatherStructureDefinition
  dye: LeatherDyeDefinition
  finish: LeatherFinishDefinition
  materials: Readonly<Record<string, ScorpionMaterialDefinition>>
  preferredMaxEdge?: number
}): LeatherCompositionResult {
  const source = args.materials[args.structure.materialId]
  if (!source) throw new Error(`Leather structure "${args.structure.id}" references missing material "${args.structure.materialId}".`)
  if (source.kind !== 'leather') throw new Error(`Leather structure "${args.structure.id}" must reference a leather material.`)

  const base = toMaterialVariant(source, args.preferredMaxEdge ?? 2048)
  const tintable = args.structure.compositionPolicy === 'tintable'
  const wantsDye = args.dye.mode === 'tint'
  const wantsFinish = args.finish.mode === 'finish'
  const dyeApplied = tintable && wantsDye
  const finishApplied = tintable && wantsFinish
  const warnings: string[] = []

  if (wantsDye && !tintable) {
    warnings.push('This captured structure keeps its photographed color. Select a tintable neutral capture to preview another dye.')
  }
  if (wantsFinish && !tintable) {
    warnings.push('This captured structure keeps its photographed finish. Select a tintable neutral capture to preview another finish.')
  }

  const dyeRoughness = dyeApplied ? (args.dye.roughnessMultiplier ?? 1) : 1
  const finishRoughness = finishApplied ? args.finish.roughnessMultiplier : 1
  const finishSheen = finishApplied ? args.finish.sheenMultiplier : 1
  const finishNormal = finishApplied ? (args.finish.normalScaleMultiplier ?? 1) : 1

  const color = dyeApplied
    ? mixHexColor('#ffffff', args.dye.color, clamp(args.dye.tintStrength, 0, 1))
    : base.color

  const variant: MaterialVariant = {
    ...base,
    id: `SLS-CMP-${args.structure.id}-${args.dye.id}-${args.finish.id}`,
    label: [args.structure.label, dyeApplied ? args.dye.label : '', finishApplied ? args.finish.label : '']
      .filter(Boolean)
      .join(' · '),
    color,
    metalness: 0,
    roughness: clamp(base.roughness * dyeRoughness * finishRoughness, 0.04, 1),
    sheen: clamp((base.sheen ?? 0) * finishSheen, 0, 1),
    clearcoat: clamp((base.clearcoat ?? 0) + (finishApplied ? (args.finish.clearcoatAdd ?? 0) : 0), 0, 1),
    clearcoatRoughness: finishApplied && args.finish.clearcoatRoughness !== undefined
      ? clamp(args.finish.clearcoatRoughness, 0, 1)
      : base.clearcoatRoughness,
    normalScale: clamp((base.normalScale ?? 1) * finishNormal, 0, 4),
  }

  return {
    variant,
    structure: args.structure,
    dye: args.dye,
    finish: args.finish,
    dyeApplied,
    finishApplied,
    developmentOnly:
      args.structure.availability === 'development' ||
      (dyeApplied && args.dye.availability === 'development') ||
      (finishApplied && args.finish.availability === 'development'),
    warnings,
  }
}

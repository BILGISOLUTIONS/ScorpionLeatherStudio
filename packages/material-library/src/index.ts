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
  supplier?: string
  supplierItem?: string
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
    if (material.kind === 'leather' && !material.textureTiers?.length) {
      issue('textureTiers', 'Production-approved leather requires at least one texture tier.')
    }
  }

  if (material.physical?.thicknessMm !== undefined && material.physical.thicknessMm <= 0) {
    issue('physical.thicknessMm', 'Material thickness must be greater than zero.')
  }

  const seenEdges = new Set<number>()
  for (const tier of material.textureTiers ?? []) {
    if (seenEdges.has(tier.maxEdge)) issue('textureTiers', `Duplicate ${tier.maxEdge}px texture tier.`)
    seenEdges.add(tier.maxEdge)

    if (material.kind === 'leather' && !tier.textures.baseColor) {
      issue(`textureTiers.${tier.maxEdge}.baseColor`, 'Leather texture tiers require a base-color map.')
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

  return {
    id: material.id,
    label: material.label,
    kind: material.kind,
    color: material.previewColor,
    ...material.renderer,
    ...(tier ? { textures: tier.textures } : {}),
  }
}

export function createRendererMaterialMap(
  materials: readonly ScorpionMaterialDefinition[],
  preferredMaxEdge = 2048,
): Record<string, MaterialVariant> {
  return Object.fromEntries(materials.map((material) => [material.id, toMaterialVariant(material, preferredMaxEdge)]))
}

export type Money = number
export type MaterialKind = 'leather' | 'metal' | 'glass' | 'generic'

export type OptionControlType = 'swatch' | 'choice' | 'toggle' | 'select'

export interface VisualDirective {
  materialSlot?: string
  materialVariant?: string
  componentGroup?: string
  componentValue?: string
}

export interface OptionReferenceImage {
  url: string
  alt: string
}

export interface OptionCommerceReference {
  shopifyProductId?: string
  merchandiseId?: string
  sku?: string
}

export interface OptionValue {
  id: string
  label: string
  description?: string
  priceModifier: Money
  swatch?: string
  visual?: VisualDirective
  manufacturingCode?: string
  referenceImage?: OptionReferenceImage
  commerce?: OptionCommerceReference
}

export interface OptionGroup {
  id: string
  label: string
  type: OptionControlType
  required: boolean
  defaultValue: string
  visibility?: 'customer' | 'development'
  values: OptionValue[]
}

export interface CompatibilityCondition {
  groupId: string
  equals: string
}

export interface CompatibilityRule {
  id: string
  when: CompatibilityCondition[]
  disallow: { groupId: string; valueId: string }
  reason: string
}

export interface MeasurementDefinition {
  id: string
  label: string
  unit: 'in' | 'cm'
  min: number
  max: number
  required: boolean
  status?: 'confirmed' | 'development'
  instructions: string
}

export interface SizeRecommendationRule {
  id: string
  measurementId: string
  minInclusive: number
  maxInclusive: number
  recommendedSize: string
  message: string
}

export interface ProductDefinition {
  schemaVersion: 1
  id: string
  handle: string
  name: string
  category: string
  currency: 'USD'
  basePrice: Money
  commerce: {
    shopifyProductId?: string
    defaultMerchandiseId: string
    variantStrategy: 'inventory-only' | 'selected-options'
    priceStatus?: 'approved' | 'test' | 'quote'
    priceNote?: string
  }
  asset: { manifestUrl: string; defaultCameraPreset: string }
  optionGroups: OptionGroup[]
  compatibilityRules: CompatibilityRule[]
  measurements: MeasurementDefinition[]
  sizeRecommendations: SizeRecommendationRule[]
}

export type AssetTangentPolicy = 'optional' | 'recommended' | 'required'

export interface AssetMaterialSlotProfile {
  kind: MaterialKind
  mapping: 'uv0'
  requiresUv0: boolean
  requiresNormals: boolean
  tangents: AssetTangentPolicy
  metersPerUvUnit?: number
  uvScaleToleranceRatio?: number
}

export type AssetCustomizationPurpose = 'tooling' | 'text' | 'logo' | 'artwork'

export interface AssetCustomizationZone {
  label: string
  node: string
  purposes: AssetCustomizationPurpose[]
  origin: [number, number, number]
  normal: [number, number, number]
  up: [number, number, number]
  sizeMeters: [number, number]
  safeInsetMeters?: number
}

export interface AssetPresentation {
  groundY?: number
  shadowScale?: number
  orbit?: {
    minDistance?: number
    maxDistance?: number
    minPolarAngle?: number
    maxPolarAngle?: number
  }
}

export interface AssetManifest {
  schemaVersion: 1
  assetId: string
  model: string
  units: 'meters'
  upAxis: 'Y'
  frontAxis: '-Z' | 'Z'
  rootNode: string
  materialSlots: Record<string, string[]>
  materialSlotProfiles?: Record<string, AssetMaterialSlotProfile>
  defaultMaterialVariants?: Record<string, string>
  customizationZones?: Record<string, AssetCustomizationZone>
  components: Record<string, string[]>
  animations: Record<string, {
    target: string
    property: 'rotation.x' | 'rotation.y' | 'rotation.z'
    from: number
    to: number
    durationMs: number
    easing: 'easeInOutCubic'
  }>
  cameraPresets: Record<string, {
    label?: string
    target: [number, number, number]
    position: [number, number, number]
    fov: number
  }>
  presentation?: AssetPresentation
}

export interface MaterialTextures {
  baseColor?: string
  normal?: string
  roughness?: string
  metalness?: string
  ambientOcclusion?: string
}

export interface MaterialVariant {
  id: string
  label: string
  kind: MaterialKind
  color: string
  roughness: number
  metalness: number
  opacity?: number
  transmission?: number
  clearcoat?: number
  clearcoatRoughness?: number
  sheen?: number
  sheenRoughness?: number
  normalScale?: number
  textureRepeat?: [number, number]
  textures?: MaterialTextures
}

export interface ValidationIssue {
  path: string
  message: string
}

export function validateProductDefinition(product: ProductDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (product.schemaVersion !== 1) issues.push({ path: 'schemaVersion', message: 'Unsupported schema version.' })
  if (!product.id.trim()) issues.push({ path: 'id', message: 'Product id is required.' })
  if (!Number.isInteger(product.basePrice) || product.basePrice < 0) {
    issues.push({ path: 'basePrice', message: 'Base price must be a non-negative integer in minor units.' })
  }

  const groupIds = new Set<string>()
  const valuesByGroup = new Map<string, Set<string>>()

  for (const group of product.optionGroups) {
    if (groupIds.has(group.id)) issues.push({ path: `optionGroups.${group.id}`, message: 'Option group id must be unique.' })
    groupIds.add(group.id)
    const valueIds = new Set(group.values.map((value) => value.id))
    valuesByGroup.set(group.id, valueIds)

    if (!valueIds.has(group.defaultValue)) {
      issues.push({ path: `optionGroups.${group.id}.defaultValue`, message: 'Default value must exist in the group.' })
    }
    for (const value of group.values) {
      if (!Number.isInteger(value.priceModifier)) {
        issues.push({ path: `optionGroups.${group.id}.${value.id}.priceModifier`, message: 'Price modifiers must use integer minor units.' })
      }
    }
  }

  for (const rule of product.compatibilityRules) {
    const disallowValues = valuesByGroup.get(rule.disallow.groupId)
    if (!disallowValues) {
      issues.push({ path: `compatibilityRules.${rule.id}`, message: 'Disallow target references an unknown group.' })
    } else if (!disallowValues.has(rule.disallow.valueId)) {
      issues.push({ path: `compatibilityRules.${rule.id}`, message: 'Disallow target references an unknown option value.' })
    }

    for (const condition of rule.when) {
      const values = valuesByGroup.get(condition.groupId)
      if (!values) {
        issues.push({ path: `compatibilityRules.${rule.id}`, message: 'Rule condition references an unknown group.' })
      } else if (!values.has(condition.equals)) {
        issues.push({ path: `compatibilityRules.${rule.id}`, message: 'Rule condition references an unknown option value.' })
      }
    }
  }

  return issues
}

export function validateAssetManifest(
  manifest: AssetManifest,
  knownMaterialIds: Iterable<string> = [],
  availableNodeNames?: Iterable<string>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const knownMaterials = new Set(knownMaterialIds)
  const nodes = availableNodeNames ? new Set(availableNodeNames) : undefined

  if (manifest.schemaVersion !== 1) issues.push({ path: 'schemaVersion', message: 'Unsupported asset manifest version.' })
  if (!manifest.assetId.trim()) issues.push({ path: 'assetId', message: 'Asset id is required.' })
  if (!manifest.model.trim()) issues.push({ path: 'model', message: 'Model URI is required.' })
  if (!manifest.rootNode.trim()) issues.push({ path: 'rootNode', message: 'Root node is required.' })
  if (nodes && !nodes.has(manifest.rootNode)) {
    issues.push({ path: 'rootNode', message: `Root node "${manifest.rootNode}" was not found in the loaded model.` })
  }

  const slotByNode = new Map<string, string>()
  for (const [slot, nodeNames] of Object.entries(manifest.materialSlots)) {
    if (nodeNames.length === 0) issues.push({ path: `materialSlots.${slot}`, message: 'Material slot must reference at least one node.' })
    for (const nodeName of nodeNames) {
      if (nodes && !nodes.has(nodeName)) {
        issues.push({ path: `materialSlots.${slot}`, message: `Node "${nodeName}" was not found in the loaded model.` })
      }
      const previous = slotByNode.get(nodeName)
      if (previous && previous !== slot) {
        issues.push({
          path: `materialSlots.${slot}`,
          message: `Node "${nodeName}" is assigned to both "${previous}" and "${slot}". Material ownership must be unambiguous.`,
        })
      } else {
        slotByNode.set(nodeName, slot)
      }
    }
  }

  for (const [slot, profile] of Object.entries(manifest.materialSlotProfiles ?? {})) {
    if (!manifest.materialSlots[slot]) {
      issues.push({ path: `materialSlotProfiles.${slot}`, message: 'Material slot profile references an unknown material slot.' })
      continue
    }
    if (!['leather', 'metal', 'glass', 'generic'].includes(profile.kind)) {
      issues.push({ path: `materialSlotProfiles.${slot}.kind`, message: 'Material slot profile has an unsupported material kind.' })
    }
    if (profile.mapping !== 'uv0') {
      issues.push({ path: `materialSlotProfiles.${slot}.mapping`, message: 'Only UV0 material mapping is currently supported.' })
    }
    if (!['optional', 'recommended', 'required'].includes(profile.tangents)) {
      issues.push({ path: `materialSlotProfiles.${slot}.tangents`, message: 'Unsupported tangent policy.' })
    }
    if (profile.metersPerUvUnit !== undefined && (!Number.isFinite(profile.metersPerUvUnit) || profile.metersPerUvUnit <= 0)) {
      issues.push({ path: `materialSlotProfiles.${slot}.metersPerUvUnit`, message: 'Physical UV scale must be a positive meter value.' })
    }
    if (
      profile.uvScaleToleranceRatio !== undefined &&
      (!Number.isFinite(profile.uvScaleToleranceRatio) || profile.uvScaleToleranceRatio <= 0 || profile.uvScaleToleranceRatio > 1)
    ) {
      issues.push({ path: `materialSlotProfiles.${slot}.uvScaleToleranceRatio`, message: 'UV scale tolerance must be greater than 0 and no more than 1.' })
    }
  }

  const vectorLength = (value: [number, number, number]) => Math.hypot(value[0], value[1], value[2])
  for (const [zoneId, zone] of Object.entries(manifest.customizationZones ?? {})) {
    const prefix = `customizationZones.${zoneId}`
    if (!zoneId.trim()) issues.push({ path: prefix, message: 'Customization zone id is required.' })
    if (!zone.label.trim()) issues.push({ path: `${prefix}.label`, message: 'Customization zone label is required.' })
    if (!zone.node.trim()) issues.push({ path: `${prefix}.node`, message: 'Customization zone node is required.' })
    if (nodes && !nodes.has(zone.node)) {
      issues.push({ path: `${prefix}.node`, message: `Customization zone node "${zone.node}" was not found in the loaded model.` })
    }
    if (!zone.purposes.length || zone.purposes.some((purpose) => !['tooling', 'text', 'logo', 'artwork'].includes(purpose))) {
      issues.push({ path: `${prefix}.purposes`, message: 'Customization zone must declare at least one supported purpose.' })
    }
    if (![...zone.origin, ...zone.normal, ...zone.up, ...zone.sizeMeters].every(Number.isFinite)) {
      issues.push({ path: prefix, message: 'Customization zone coordinates and size must be finite.' })
      continue
    }
    const normalLength = vectorLength(zone.normal)
    const upLength = vectorLength(zone.up)
    if (normalLength <= 0.0001 || upLength <= 0.0001) {
      issues.push({ path: prefix, message: 'Customization zone normal and up vectors must be non-zero.' })
    } else {
      const dot = Math.abs(
        (zone.normal[0] * zone.up[0] + zone.normal[1] * zone.up[1] + zone.normal[2] * zone.up[2]) /
        (normalLength * upLength),
      )
      if (dot > 0.98) issues.push({ path: prefix, message: 'Customization zone normal and up vectors must not be parallel.' })
    }
    if (zone.sizeMeters.some((value) => value <= 0)) {
      issues.push({ path: `${prefix}.sizeMeters`, message: 'Customization zone width and height must be positive.' })
    }
    if (
      zone.safeInsetMeters !== undefined &&
      (!Number.isFinite(zone.safeInsetMeters) || zone.safeInsetMeters < 0 || zone.safeInsetMeters * 2 >= Math.min(...zone.sizeMeters))
    ) {
      issues.push({ path: `${prefix}.safeInsetMeters`, message: 'Customization zone safe inset must fit inside the zone.' })
    }
  }

  for (const [slot, materialId] of Object.entries(manifest.defaultMaterialVariants ?? {})) {
    if (!manifest.materialSlots[slot]) {
      issues.push({ path: `defaultMaterialVariants.${slot}`, message: 'Default material references an unknown material slot.' })
    }
    if (knownMaterials.size > 0 && !knownMaterials.has(materialId)) {
      issues.push({ path: `defaultMaterialVariants.${slot}`, message: `Unknown material variant "${materialId}".` })
    }
  }

  for (const [componentKey, nodeNames] of Object.entries(manifest.components)) {
    if (!componentKey.includes('.')) {
      issues.push({ path: `components.${componentKey}`, message: 'Component keys must use group.value format.' })
    }
    for (const nodeName of nodeNames) {
      if (nodes && !nodes.has(nodeName)) {
        issues.push({ path: `components.${componentKey}`, message: `Node "${nodeName}" was not found in the loaded model.` })
      }
    }
  }

  for (const [animationKey, animation] of Object.entries(manifest.animations)) {
    if (nodes && !nodes.has(animation.target)) {
      issues.push({ path: `animations.${animationKey}.target`, message: `Node "${animation.target}" was not found in the loaded model.` })
    }
    if (!Number.isFinite(animation.from) || !Number.isFinite(animation.to) || animation.durationMs <= 0) {
      issues.push({ path: `animations.${animationKey}`, message: 'Animation range and duration must be valid finite values.' })
    }
  }

  for (const [presetKey, preset] of Object.entries(manifest.cameraPresets)) {
    if (preset.fov <= 5 || preset.fov >= 120) {
      issues.push({ path: `cameraPresets.${presetKey}.fov`, message: 'Camera FOV must be between 5 and 120 degrees.' })
    }
    if (![...preset.target, ...preset.position].every(Number.isFinite)) {
      issues.push({ path: `cameraPresets.${presetKey}`, message: 'Camera coordinates must be finite numbers.' })
    }
  }

  const presentation = manifest.presentation
  if (presentation?.groundY !== undefined && !Number.isFinite(presentation.groundY)) {
    issues.push({ path: 'presentation.groundY', message: 'Ground position must be finite.' })
  }
  if (presentation?.shadowScale !== undefined && (!Number.isFinite(presentation.shadowScale) || presentation.shadowScale <= 0)) {
    issues.push({ path: 'presentation.shadowScale', message: 'Shadow scale must be a positive finite value.' })
  }
  const orbit = presentation?.orbit
  if (orbit?.minDistance !== undefined && (!Number.isFinite(orbit.minDistance) || orbit.minDistance <= 0)) {
    issues.push({ path: 'presentation.orbit.minDistance', message: 'Orbit minimum distance must be positive.' })
  }
  if (orbit?.maxDistance !== undefined && (!Number.isFinite(orbit.maxDistance) || orbit.maxDistance <= 0)) {
    issues.push({ path: 'presentation.orbit.maxDistance', message: 'Orbit maximum distance must be positive.' })
  }
  if (orbit?.minDistance !== undefined && orbit?.maxDistance !== undefined && orbit.minDistance >= orbit.maxDistance) {
    issues.push({ path: 'presentation.orbit', message: 'Orbit minimum distance must be smaller than maximum distance.' })
  }

  return issues
}

export function validateMaterialSlotAssignments(
  manifest: AssetManifest,
  assignments: Readonly<Record<string, string>>,
  materials: Readonly<Record<string, MaterialVariant>>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  for (const [slot, materialId] of Object.entries(assignments)) {
    if (!manifest.materialSlots[slot]) {
      issues.push({ path: `materialAssignments.${slot}`, message: 'Material assignment targets an unknown slot.' })
      continue
    }
    const material = materials[materialId]
    if (!material) {
      issues.push({ path: `materialAssignments.${slot}`, message: `Material variant "${materialId}" is not available.` })
      continue
    }
    const profile = manifest.materialSlotProfiles?.[slot]
    if (profile && material.kind !== profile.kind) {
      issues.push({
        path: `materialAssignments.${slot}`,
        message: `Material "${materialId}" is "${material.kind}" but slot "${slot}" requires "${profile.kind}".`,
      })
    }
  }

  return issues
}

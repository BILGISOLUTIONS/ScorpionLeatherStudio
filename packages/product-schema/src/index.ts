export type Money = number

export type OptionControlType = 'swatch' | 'choice' | 'toggle' | 'select'

export interface VisualDirective {
  materialSlot?: string
  materialVariant?: string
  componentGroup?: string
  componentValue?: string
}

export interface OptionValue {
  id: string
  label: string
  description?: string
  priceModifier: Money
  swatch?: string
  visual?: VisualDirective
  manufacturingCode?: string
}

export interface OptionGroup {
  id: string
  label: string
  type: OptionControlType
  required: boolean
  defaultValue: string
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
  }
  asset: { manifestUrl: string; defaultCameraPreset: string }
  optionGroups: OptionGroup[]
  compatibilityRules: CompatibilityRule[]
  measurements: MeasurementDefinition[]
  sizeRecommendations: SizeRecommendationRule[]
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
  defaultMaterialVariants?: Record<string, string>
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
  kind: 'leather' | 'metal' | 'glass' | 'generic'
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

  for (const [slot, nodeNames] of Object.entries(manifest.materialSlots)) {
    if (nodeNames.length === 0) issues.push({ path: `materialSlots.${slot}`, message: 'Material slot must reference at least one node.' })
    for (const nodeName of nodeNames) {
      if (nodes && !nodes.has(nodeName)) {
        issues.push({ path: `materialSlots.${slot}`, message: `Node "${nodeName}" was not found in the loaded model.` })
      }
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

  return issues
}

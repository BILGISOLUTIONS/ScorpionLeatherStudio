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
    target: [number, number, number]
    position: [number, number, number]
    fov: number
  }>
}

export interface MaterialVariant {
  id: string
  label: string
  color: string
  roughness: number
  metalness: number
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
  for (const group of product.optionGroups) {
    if (groupIds.has(group.id)) issues.push({ path: `optionGroups.${group.id}`, message: 'Option group id must be unique.' })
    groupIds.add(group.id)
    const valueIds = new Set(group.values.map((value) => value.id))
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
    if (!groupIds.has(rule.disallow.groupId)) {
      issues.push({ path: `compatibilityRules.${rule.id}`, message: 'Disallow target references an unknown group.' })
    }
    for (const condition of rule.when) {
      if (!groupIds.has(condition.groupId)) {
        issues.push({ path: `compatibilityRules.${rule.id}`, message: 'Rule condition references an unknown group.' })
      }
    }
  }

  return issues
}

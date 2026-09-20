import type { AssetManifest, MaterialVariant, ProductDefinition } from '@sls/product-schema'

export const sampleProduct: ProductDefinition = {
  schemaVersion: 1,
  id: 'welding-hood-001',
  handle: 'custom-leather-welding-hood',
  name: 'Custom Leather Welding Hood',
  category: 'Welding Protection',
  currency: 'USD',
  basePrice: 18900,
  commerce: {
    defaultMerchandiseId: 'gid://shopify/ProductVariant/PLACEHOLDER',
    variantStrategy: 'inventory-only',
  },
  asset: {
    manifestUrl: '/models/placeholder-welding-hood.manifest.json',
    defaultCameraPreset: 'hero',
  },
  optionGroups: [
    {
      id: 'leather',
      label: 'Leather',
      type: 'swatch',
      required: true,
      defaultValue: 'brown',
      values: [
        { id: 'brown', label: 'Saddle Brown', priceModifier: 0, swatch: '#6f4128', visual: { materialSlot: 'LeatherPrimary', materialVariant: 'SCL-002' }, manufacturingCode: 'SCL-002' },
        { id: 'black', label: 'Black Full Grain', priceModifier: 1200, swatch: '#171717', visual: { materialSlot: 'LeatherPrimary', materialVariant: 'SCL-001' }, manufacturingCode: 'SCL-001' },
        { id: 'tan', label: 'Natural Tan', priceModifier: 1800, swatch: '#b9824f', visual: { materialSlot: 'LeatherPrimary', materialVariant: 'SCL-004' }, manufacturingCode: 'SCL-004' },
      ],
    },
    {
      id: 'hardware',
      label: 'Hardware',
      type: 'choice',
      required: true,
      defaultValue: 'brass',
      values: [
        { id: 'brass', label: 'Antique Brass', priceModifier: 1800, visual: { materialSlot: 'HardwarePrimary', materialVariant: 'SCH-002' }, manufacturingCode: 'SCH-002' },
        { id: 'nickel', label: 'Nickel', priceModifier: 0, visual: { materialSlot: 'HardwarePrimary', materialVariant: 'SCH-001' }, manufacturingCode: 'SCH-001' },
      ],
    },
    {
      id: 'neckGuard',
      label: 'Neck Guard',
      type: 'choice',
      required: true,
      defaultValue: 'standard',
      values: [
        { id: 'standard', label: 'Standard', priceModifier: 0, visual: { componentGroup: 'neckGuard', componentValue: 'standard' } },
        { id: 'extended', label: 'Extended', priceModifier: 2500, visual: { componentGroup: 'neckGuard', componentValue: 'extended' } },
      ],
    },
  ],
  compatibilityRules: [
    {
      id: 'tan-no-extended-demo',
      when: [{ groupId: 'leather', equals: 'tan' }],
      disallow: { groupId: 'neckGuard', valueId: 'extended' },
      reason: 'Natural Tan + Extended Guard is disabled in this MVP sample to prove compatibility rules.',
    },
  ],
  measurements: [
    {
      id: 'headCircumference',
      label: 'Head circumference',
      unit: 'in',
      min: 20,
      max: 27,
      required: true,
      instructions: 'Measure around the widest part of the head, keeping the tape level and comfortably snug.',
    },
  ],
  sizeRecommendations: [
    { id: 'head-m', measurementId: 'headCircumference', minInclusive: 20, maxInclusive: 22.25, recommendedSize: 'M', message: 'Your entered head circumference currently maps to the Medium sample range.' },
    { id: 'head-l', measurementId: 'headCircumference', minInclusive: 22.26, maxInclusive: 24.25, recommendedSize: 'L', message: 'Your entered head circumference currently maps to the Large sample range.' },
    { id: 'head-xl', measurementId: 'headCircumference', minInclusive: 24.26, maxInclusive: 27, recommendedSize: 'XL', message: 'Your entered head circumference currently maps to the XL sample range.' },
  ],
}

export const sampleManifest: AssetManifest = {
  schemaVersion: 1,
  assetId: 'placeholder-welding-hood-v1',
  model: '/models/placeholder-welding-hood.gltf',
  units: 'meters',
  upAxis: 'Y',
  frontAxis: '-Z',
  rootNode: 'SLS_ProductRoot',
  materialSlots: {
    LeatherPrimary: ['Shell_Main', 'NeckGuard_Standard', 'NeckGuard_Extended'],
    HardwarePrimary: ['Visor_Frame', 'Rivets'],
    Lens: ['Visor_Lens'],
  },
  components: {
    'neckGuard.standard': ['NeckGuard_Standard'],
    'neckGuard.extended': ['NeckGuard_Extended'],
  },
  animations: {
    'visor.open': { target: 'Visor_Pivot', property: 'rotation.x', from: 0, to: -1.72, durationMs: 420, easing: 'easeInOutCubic' },
  },
  cameraPresets: {
    hero: { target: [0, 0.05, 0], position: [0.48, 0.28, 0.68], fov: 35 },
    rear: { target: [0, 0.05, 0], position: [0, 0.22, -0.82], fov: 35 },
  },
}

export const sampleMaterials: Record<string, MaterialVariant> = {
  'SCL-001': { id: 'SCL-001', label: 'Black Full Grain', color: '#171717', roughness: 0.78, metalness: 0 },
  'SCL-002': { id: 'SCL-002', label: 'Saddle Brown', color: '#6f4128', roughness: 0.74, metalness: 0 },
  'SCL-004': { id: 'SCL-004', label: 'Natural Tan', color: '#b9824f', roughness: 0.72, metalness: 0 },
  'SCH-001': { id: 'SCH-001', label: 'Nickel', color: '#b7bab8', roughness: 0.28, metalness: 0.88 },
  'SCH-002': { id: 'SCH-002', label: 'Antique Brass', color: '#8b6a2f', roughness: 0.34, metalness: 0.82 },
}

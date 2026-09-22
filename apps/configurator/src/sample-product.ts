import type { AssetManifest, ProductDefinition } from '@sls/product-schema'

export const sampleProduct: ProductDefinition = {
  schemaVersion: 1,
  id: 'scorpion-welding-hood-studio',
  handle: 'scorpion-leather-welding-hood-studio',
  name: 'Scorpion Leather Welding Hood',
  category: 'Leather Welding Hood',
  currency: 'USD',
  basePrice: 1000,
  commerce: {
    defaultMerchandiseId: 'gid://shopify/ProductVariant/52705483882776',
    variantStrategy: 'selected-options',
    priceStatus: 'test',
    priceNote: 'Current Shopify welding-hood records use a $10 development price and remain tagged for pricing confirmation.',
  },
  asset: {
    manifestUrl: '/models/placeholder-welding-hood.manifest.json',
    defaultCameraPreset: 'hero',
  },
  optionGroups: [
    {
      id: 'catalogBuild',
      label: 'Photographed Build',
      type: 'choice',
      required: true,
      defaultValue: 'cognac-textured',
      values: [
        {
          id: 'dark-textured-yellow-trim',
          label: 'Dark Textured / Yellow Trim',
          description: 'Existing Scorpion catalog reference with dark textured leather and yellow contrast binding.',
          priceModifier: 0,
          swatch: '#24211d',
          visual: { materialSlot: 'LeatherPrimary', materialVariant: 'SCL-DTY' },
          manufacturingCode: 'SC-WH-DTY-001',
          referenceImage: {
            url: 'https://cdn.shopify.com/s/files/1/0985/0345/9096/files/scorpion-leather-welding-hood-dark-textured-yellow-trim_860acb8b-9642-4401-9b94-fbb34be622e6.png?v=1789735338',
            alt: 'Dark textured Scorpion leather welding hood with yellow trim on a dark studio background',
          },
          commerce: {
            shopifyProductId: 'gid://shopify/Product/10425860587800',
            merchandiseId: 'gid://shopify/ProductVariant/52705483817240',
            sku: 'SC-WH-DTY-001',
          },
        },
        {
          id: 'cognac-textured',
          label: 'Cognac Textured',
          description: 'Existing Scorpion catalog reference with a warm cognac textured leather finish.',
          priceModifier: 0,
          swatch: '#8a4e2b',
          visual: { materialSlot: 'LeatherPrimary', materialVariant: 'SCL-COGNAC' },
          manufacturingCode: 'SC-WH-CTX-002',
          referenceImage: {
            url: 'https://cdn.shopify.com/s/files/1/0985/0345/9096/files/scorpion-leather-welding-hood-cognac-textured_56cef53a-e663-48da-ba94-ba6eb0c74fb9.png?v=1789735343',
            alt: 'Cognac textured Scorpion leather welding hood on a dark studio background',
          },
          commerce: {
            shopifyProductId: 'gid://shopify/Product/10425860653336',
            merchandiseId: 'gid://shopify/ProductVariant/52705483882776',
            sku: 'SC-WH-CTX-002',
          },
        },
        {
          id: 'tan-smooth',
          label: 'Tan Smooth',
          description: 'Existing Scorpion catalog reference with a smooth tan leather finish.',
          priceModifier: 0,
          swatch: '#b5824f',
          visual: { materialSlot: 'LeatherPrimary', materialVariant: 'SCL-TAN-SMOOTH' },
          manufacturingCode: 'SC-WH-TSM-003',
          referenceImage: {
            url: 'https://cdn.shopify.com/s/files/1/0985/0345/9096/files/scorpion-leather-welding-hood-tan-smooth_423ae3ab-0bc3-41ae-80f9-7cf9814be11c.png?v=1789735350',
            alt: 'Tan smooth Scorpion leather welding hood on a dark studio background',
          },
          commerce: {
            shopifyProductId: 'gid://shopify/Product/10425860686104',
            merchandiseId: 'gid://shopify/ProductVariant/52705483915544',
            sku: 'SC-WH-TSM-003',
          },
        },
        {
          id: 'tan-textured',
          label: 'Tan Textured',
          description: 'Existing Scorpion catalog reference with a tan nap-textured leather finish.',
          priceModifier: 0,
          swatch: '#a87545',
          visual: { materialSlot: 'LeatherPrimary', materialVariant: 'SCL-TAN-TEXTURED' },
          manufacturingCode: 'SC-WH-TXT-004',
          referenceImage: {
            url: 'https://cdn.shopify.com/s/files/1/0985/0345/9096/files/scorpion-leather-welding-hood-tan-suede_e08bbbe8-f8cc-4293-b721-0b77429490a4.png?v=1789735356',
            alt: 'Tan textured Scorpion leather welding hood on a dark studio background',
          },
          commerce: {
            shopifyProductId: 'gid://shopify/Product/10425860718872',
            merchandiseId: 'gid://shopify/ProductVariant/52705483948312',
            sku: 'SC-WH-TXT-004',
          },
        },
      ],
    },
    {
      id: 'hardwarePrototype',
      label: 'Prototype Hardware',
      type: 'choice',
      required: true,
      defaultValue: 'brass',
      visibility: 'development',
      values: [
        {
          id: 'brass',
          label: 'Brass-tone',
          description: 'Development renderer control only; independent hardware availability is not yet confirmed.',
          priceModifier: 0,
          visual: { materialSlot: 'HardwarePrimary', materialVariant: 'SCH-002' },
        },
        {
          id: 'nickel',
          label: 'Nickel',
          description: 'Development renderer control only; independent hardware availability is not yet confirmed.',
          priceModifier: 0,
          visual: { materialSlot: 'HardwarePrimary', materialVariant: 'SCH-001' },
        },
      ],
    },
    {
      id: 'neckGuardPrototype',
      label: 'Prototype Neck Guard',
      type: 'choice',
      required: true,
      defaultValue: 'standard',
      visibility: 'development',
      values: [
        {
          id: 'standard',
          label: 'Standard',
          description: 'Development geometry control only.',
          priceModifier: 0,
          visual: { componentGroup: 'neckGuard', componentValue: 'standard' },
        },
        {
          id: 'extended',
          label: 'Extended',
          description: 'Development geometry control only; availability is not yet confirmed.',
          priceModifier: 0,
          visual: { componentGroup: 'neckGuard', componentValue: 'extended' },
        },
      ],
    },
  ],
  compatibilityRules: [],
  measurements: [
    {
      id: 'headCircumference',
      label: 'Head circumference',
      unit: 'in',
      min: 20,
      max: 27,
      required: false,
      status: 'development',
      instructions: 'Development fitting field only. Final fit ranges must be confirmed from Scorpion measurements before launch.',
    },
  ],
  sizeRecommendations: [
    { id: 'head-m', measurementId: 'headCircumference', minInclusive: 20, maxInclusive: 22.25, recommendedSize: 'M', message: 'Development-only sample range; not an approved Scorpion sizing rule.' },
    { id: 'head-l', measurementId: 'headCircumference', minInclusive: 22.26, maxInclusive: 24.25, recommendedSize: 'L', message: 'Development-only sample range; not an approved Scorpion sizing rule.' },
    { id: 'head-xl', measurementId: 'headCircumference', minInclusive: 24.26, maxInclusive: 27, recommendedSize: 'XL', message: 'Development-only sample range; not an approved Scorpion sizing rule.' },
  ],
}

export const sampleManifest: AssetManifest = {
  schemaVersion: 1,
  assetId: 'placeholder-welding-hood-v3',
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
  defaultMaterialVariants: {
    LeatherPrimary: 'SCL-COGNAC',
    HardwarePrimary: 'SCH-002',
    Lens: 'SGL-001',
  },
  components: {
    'neckGuard.standard': ['NeckGuard_Standard'],
    'neckGuard.extended': ['NeckGuard_Extended'],
  },
  animations: {
    'visor.open': { target: 'Visor_Pivot', property: 'rotation.x', from: 0, to: -1.72, durationMs: 420, easing: 'easeInOutCubic' },
  },
  cameraPresets: {
    hero: { label: 'Hero', target: [0, 0.04, 0], position: [0.48, 0.28, 0.68], fov: 35 },
    front: { label: 'Front', target: [0, 0.04, 0], position: [0, 0.08, 0.82], fov: 34 },
    rear: { label: 'Rear', target: [0, 0.04, 0], position: [0, 0.08, -0.82], fov: 34 },
    detail: { label: 'Visor', target: [0, 0.12, 0.13], position: [0.34, 0.24, 0.48], fov: 27 },
  },
}

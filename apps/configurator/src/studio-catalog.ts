export type CatalogPriceStatus = 'catalog' | 'quote'
export type StudioFamilyKind =
  | 'welding-hood'
  | 'tool-belt'
  | 'tool-pouch-set'
  | 'work-harness'
  | 'radio-harness'
  | 'carpenter-pouch'

export interface StudioVariant {
  id: string
  title: string
  sku: string
  priceMinor: number
  inventoryQuantity: number | null
}

export interface StudioReference {
  id: string
  shopifyProductId: string
  title: string
  handle: string
  productType: string
  image: string
  imageAlt: string
  priceStatus: CatalogPriceStatus
  basePriceMinor: number
  variants: StudioVariant[]
}

export interface StudioProductFamily {
  id: StudioFamilyKind
  title: string
  shortTitle: string
  description: string
  references: StudioReference[]
  supports3D: boolean
  personalization: {
    tooling: boolean
    text: boolean
    artwork: boolean
    placementOptions: string[]
  }
}

const quoteVariant = (
  id: string,
  sku: string,
): StudioVariant => ({ id, title: 'Custom Order', sku, priceMinor: 1000, inventoryQuantity: 0 })

export const studioFamilies: StudioProductFamily[] = [
  {
    id: 'welding-hood',
    title: 'Leather Welding Hood',
    shortTitle: 'Welding Hood',
    description: 'Build from Scorpion’s photographed welding-hood configurations and request tooling, lettering, and other leatherwork details.',
    supports3D: true,
    personalization: {
      tooling: true,
      text: true,
      artwork: true,
      placementOptions: ['Forehead panel', 'Left side panel', 'Right side panel', 'Rear panel', 'Shop recommendation'],
    },
    references: [
      {
        id: 'hood-dark-yellow',
        shopifyProductId: 'gid://shopify/Product/10425860587800',
        title: 'Dark Textured / Yellow Trim',
        handle: 'leather-welding-hood-dark-textured-yellow-trim',
        productType: 'Leather Welding Hood',
        image: 'https://cdn.shopify.com/s/files/1/0985/0345/9096/files/scorpion-leather-welding-hood-dark-textured-yellow-trim_860acb8b-9642-4401-9b94-fbb34be622e6.png?v=1789735338',
        imageAlt: 'Dark textured Scorpion leather welding hood with yellow trim',
        priceStatus: 'quote',
        basePriceMinor: 1000,
        variants: [quoteVariant('gid://shopify/ProductVariant/52705483817240', 'SC-WH-DTY-001')],
      },
      {
        id: 'hood-cognac',
        shopifyProductId: 'gid://shopify/Product/10425860653336',
        title: 'Cognac Textured',
        handle: 'leather-welding-hood-cognac-textured',
        productType: 'Leather Welding Hood',
        image: 'https://cdn.shopify.com/s/files/1/0985/0345/9096/files/scorpion-leather-welding-hood-cognac-textured_56cef53a-e663-48da-ba94-ba6eb0c74fb9.png?v=1789735343',
        imageAlt: 'Cognac textured Scorpion leather welding hood',
        priceStatus: 'quote',
        basePriceMinor: 1000,
        variants: [quoteVariant('gid://shopify/ProductVariant/52705483882776', 'SC-WH-CTX-002')],
      },
      {
        id: 'hood-tan-smooth',
        shopifyProductId: 'gid://shopify/Product/10425860686104',
        title: 'Tan Smooth',
        handle: 'leather-welding-hood-tan-smooth',
        productType: 'Leather Welding Hood',
        image: 'https://cdn.shopify.com/s/files/1/0985/0345/9096/files/scorpion-leather-welding-hood-tan-smooth_423ae3ab-0bc3-41ae-80f9-7cf9814be11c.png?v=1789735350',
        imageAlt: 'Tan smooth Scorpion leather welding hood',
        priceStatus: 'quote',
        basePriceMinor: 1000,
        variants: [quoteVariant('gid://shopify/ProductVariant/52705483915544', 'SC-WH-TSM-003')],
      },
      {
        id: 'hood-tan-textured',
        shopifyProductId: 'gid://shopify/Product/10425860718872',
        title: 'Tan Textured',
        handle: 'leather-welding-hood-tan-textured',
        productType: 'Leather Welding Hood',
        image: 'https://cdn.shopify.com/s/files/1/0985/0345/9096/files/scorpion-leather-welding-hood-tan-suede_e08bbbe8-f8cc-4293-b721-0b77429490a4.png?v=1789735356',
        imageAlt: 'Tan textured Scorpion leather welding hood',
        priceStatus: 'quote',
        basePriceMinor: 1000,
        variants: [quoteVariant('gid://shopify/ProductVariant/52705483948312', 'SC-WH-TXT-004')],
      },
    ],
  },
  {
    id: 'tool-belt',
    title: 'Leather Tool Belt Rig',
    shortTitle: 'Tool Belt',
    description: 'Configure Scorpion’s multi-pouch work rig and submit tooling, name, company, or artwork requests for shop review.',
    supports3D: false,
    personalization: {
      tooling: true,
      text: true,
      artwork: true,
      placementOptions: ['Belt center', 'Primary pouch face', 'Secondary pouch face', 'Shop recommendation'],
    },
    references: [
      {
        id: 'tool-belt-black',
        shopifyProductId: 'gid://shopify/Product/10425860915480',
        title: 'Black Leather Tool Belt Rig',
        handle: 'black-leather-tool-belt-rig',
        productType: 'Leather Tool Belt Rig',
        image: 'https://cdn.shopify.com/s/files/1/0985/0345/9096/files/scorpion-black-leather-tool-belt-rig.png?v=1789735374',
        imageAlt: 'Black Scorpion leather tool belt rig',
        priceStatus: 'quote',
        basePriceMinor: 1000,
        variants: [quoteVariant('gid://shopify/ProductVariant/52705485062424', 'SC-LTB-BLK-001')],
      },
    ],
  },
  {
    id: 'tool-pouch-set',
    title: 'Leather Tool Pouch Set',
    shortTitle: 'Pouch Set',
    description: 'Start from the matched textured pouch set and specify tooling, lettering, logo/artwork direction, and placement preferences.',
    supports3D: false,
    personalization: {
      tooling: true,
      text: true,
      artwork: true,
      placementOptions: ['Large pouch face', 'Small pouch face', 'Pocket flap', 'Belt attachment', 'Shop recommendation'],
    },
    references: [
      {
        id: 'pouch-set-brown',
        shopifyProductId: 'gid://shopify/Product/10425860882712',
        title: 'Brown Textured Leather Tool Pouch Set',
        handle: 'brown-textured-leather-tool-pouch-set',
        productType: 'Leather Tool Pouch Set',
        image: 'https://cdn.shopify.com/s/files/1/0985/0345/9096/files/scorpion-brown-textured-leather-tool-pouch-set.png?v=1789735368',
        imageAlt: 'Brown textured Scorpion leather tool pouch set',
        priceStatus: 'quote',
        basePriceMinor: 1000,
        variants: [quoteVariant('gid://shopify/ProductVariant/52705485029656', 'SC-LTP-BRN-SET-001')],
      },
    ],
  },
  {
    id: 'work-harness',
    title: 'Leather Work Harness',
    shortTitle: 'Work Harness',
    description: 'Choose a Scorpion work-harness starting point, then request text, tooling, or artwork placement before the shop confirms the build.',
    supports3D: false,
    personalization: {
      tooling: true,
      text: true,
      artwork: true,
      placementOptions: ['Back panel', 'Shoulder strap', 'Lower carry panel', 'Chest area', 'Shop recommendation'],
    },
    references: [
      {
        id: 'harness-texas-back',
        shopifyProductId: 'gid://shopify/Product/10425882149144',
        title: 'Texas-Back Leather Work Harness — Brown / Tan',
        handle: 'texas-back-leather-work-harness-brown-tan',
        productType: 'Leather Work Harness',
        image: 'https://cdn.shopify.com/s/files/1/0985/0345/9096/files/scorpion-texas-back-leather-work-harness.png?v=1789736569',
        imageAlt: 'Texas-back Scorpion leather work harness in brown and tan',
        priceStatus: 'quote',
        basePriceMinor: 1000,
        variants: [quoteVariant('gid://shopify/ProductVariant/52705514979608', 'SC-LWH-TX-BRTN-001')],
      },
      {
        id: 'harness-brown',
        shopifyProductId: 'gid://shopify/Product/10403653845272',
        title: 'Cowhide Harness - Brown',
        handle: 'cowhide-harness-brown',
        productType: 'Leather Harness',
        image: 'https://cdn.shopify.com/s/files/1/0985/0345/9096/files/scorpion-brown-cowhide-harness.png?v=1788599197',
        imageAlt: 'Brown cowhide Scorpion work harness',
        priceStatus: 'catalog',
        basePriceMinor: 25000,
        variants: [
          { id: 'gid://shopify/ProductVariant/52616019869976', title: 'Large', sku: 'SC-LH-BRN-L-001', priceMinor: 25000, inventoryQuantity: 2 },
        ],
      },
      {
        id: 'harness-tan',
        shopifyProductId: 'gid://shopify/Product/10403653878040',
        title: 'Cowhide Harness - Tan',
        handle: 'cowhide-harness-tan',
        productType: 'Leather Harness',
        image: 'https://cdn.shopify.com/s/files/1/0985/0345/9096/files/scorpion-tan-cowhide-harness.png?v=1788599210',
        imageAlt: 'Tan cowhide Scorpion work harness',
        priceStatus: 'catalog',
        basePriceMinor: 29900,
        variants: [
          { id: 'gid://shopify/ProductVariant/52616020033816', title: 'Large', sku: 'SC-LH-TAN-L-001', priceMinor: 29900, inventoryQuantity: 1 },
        ],
      },
    ],
  },
  {
    id: 'radio-harness',
    title: 'Leather Radio Harness',
    shortTitle: 'Radio Harness',
    description: 'Choose the harness finish and size, then layer in custom text, tooling, or artwork requests for a quote-ready build.',
    supports3D: false,
    personalization: {
      tooling: true,
      text: true,
      artwork: true,
      placementOptions: ['Front chest panel', 'Radio pocket face', 'Shoulder strap', 'Back strap', 'Shop recommendation'],
    },
    references: [
      {
        id: 'radio-alligator',
        shopifyProductId: 'gid://shopify/Product/10403653746968',
        title: 'Cowhide Alligator Print Double Radio Harness',
        handle: 'cowhide-alligator-print-double-radio-harness',
        productType: 'Leather Radio Harness',
        image: 'https://cdn.shopify.com/s/files/1/0985/0345/9096/files/scorpion-alligator-print-double-radio-harness.png?v=1788599169',
        imageAlt: 'Alligator-print cowhide Scorpion double radio harness',
        priceStatus: 'catalog',
        basePriceMinor: 39900,
        variants: [
          { id: 'gid://shopify/ProductVariant/52616019443992', title: 'Large', sku: 'SC-LRH-ALG-L-001', priceMinor: 39900, inventoryQuantity: 2 },
          { id: 'gid://shopify/ProductVariant/52616019476760', title: 'X-Large', sku: 'SC-LRH-ALG-XL-002', priceMinor: 39900, inventoryQuantity: 2 },
          { id: 'gid://shopify/ProductVariant/52616019509528', title: 'XX-Large', sku: 'SC-LRH-ALG-2XL-003', priceMinor: 39900, inventoryQuantity: 2 },
        ],
      },
      {
        id: 'radio-black',
        shopifyProductId: 'gid://shopify/Product/10403653812504',
        title: 'Cowhide Radio Harness - Black',
        handle: 'cowhide-radio-harness-black',
        productType: 'Leather Radio Harness',
        image: 'https://cdn.shopify.com/s/files/1/0985/0345/9096/files/scorpion-black-cowhide-radio-harness.png?v=1788599184',
        imageAlt: 'Black cowhide Scorpion radio harness',
        priceStatus: 'catalog',
        basePriceMinor: 35000,
        variants: [
          { id: 'gid://shopify/ProductVariant/52616019804440', title: 'Large', sku: 'SC-LRH-BLK-L-001', priceMinor: 35000, inventoryQuantity: 1 },
          { id: 'gid://shopify/ProductVariant/52616019837208', title: 'X-Large', sku: 'SC-LRH-BLK-XL-002', priceMinor: 35000, inventoryQuantity: 4 },
        ],
      },
    ],
  },
  {
    id: 'carpenter-pouch',
    title: 'Carpenter Tool Pouch',
    shortTitle: 'Carpenter Pouch',
    description: 'Choose a stocked Scorpion pouch color and turn it into a custom-order request with lettering or tooling instructions.',
    supports3D: false,
    personalization: {
      tooling: true,
      text: true,
      artwork: true,
      placementOptions: ['Front pouch face', 'Upper panel', 'Pocket flap', 'Belt loop', 'Shop recommendation'],
    },
    references: [
      {
        id: 'carpenter-green',
        shopifyProductId: 'gid://shopify/Product/10403653976344',
        title: 'Carpenter Tool Pouch - Forest Green Leather',
        handle: 'carpenter-tool-pouch-forest-green-leather',
        productType: 'Carpenter Tool Pouch',
        image: 'https://cdn.shopify.com/s/files/1/0985/0345/9096/files/scorpion-forest-green-carpenter-tool-pouch.png?v=1789703059',
        imageAlt: 'Forest green Scorpion leather carpenter tool pouch',
        priceStatus: 'catalog',
        basePriceMinor: 5500,
        variants: [
          { id: 'gid://shopify/ProductVariant/52616020230424', title: 'Default', sku: 'SC-CTP-GRN-001', priceMinor: 5500, inventoryQuantity: 1 },
        ],
      },
      {
        id: 'carpenter-burgundy',
        shopifyProductId: 'gid://shopify/Product/10403654009112',
        title: 'Carpenter Tool Pouch - Burgundy Leather',
        handle: 'carpenter-tool-pouch-burgundy-leather',
        productType: 'Carpenter Tool Pouch',
        image: 'https://cdn.shopify.com/s/files/1/0985/0345/9096/files/scorpion-burgundy-carpenter-tool-pouch.png?v=1788599266',
        imageAlt: 'Burgundy Scorpion leather carpenter tool pouch',
        priceStatus: 'catalog',
        basePriceMinor: 5500,
        variants: [
          { id: 'gid://shopify/ProductVariant/52616020295960', title: 'Default', sku: 'SC-CTP-BURG-001', priceMinor: 5500, inventoryQuantity: 2 },
        ],
      },
      {
        id: 'carpenter-white',
        shopifyProductId: 'gid://shopify/Product/10403654041880',
        title: 'Carpenter Tool Pouch - White Leather',
        handle: 'carpenter-tool-pouch-white-leather',
        productType: 'Carpenter Tool Pouch',
        image: 'https://cdn.shopify.com/s/files/1/0985/0345/9096/files/scorpion-white-carpenter-tool-pouch.png?v=1788599277',
        imageAlt: 'White Scorpion leather carpenter tool pouch',
        priceStatus: 'catalog',
        basePriceMinor: 5500,
        variants: [
          { id: 'gid://shopify/ProductVariant/52616020328728', title: 'Default', sku: 'SC-CTP-WHT-001', priceMinor: 5500, inventoryQuantity: 2 },
        ],
      },
    ],
  },
]

export function getFamily(familyId: string): StudioProductFamily {
  return studioFamilies.find((family) => family.id === familyId) ?? studioFamilies[0]
}

export function getReference(family: StudioProductFamily, referenceId: string): StudioReference {
  return family.references.find((reference) => reference.id === referenceId) ?? family.references[0]
}

export function getVariant(reference: StudioReference, variantId: string): StudioVariant {
  return reference.variants.find((variant) => variant.id === variantId) ?? reference.variants[0]
}

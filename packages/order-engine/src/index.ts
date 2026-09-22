export type ToolingStyle =
  | 'none'
  | 'western-floral'
  | 'basket-weave'
  | 'geometric'
  | 'border'
  | 'custom-concept'

export type TextStyle = 'block' | 'western' | 'script' | 'monogram' | 'shop-choice'

export type LeatherFinishPreference =
  | 'as-photographed'
  | 'smooth'
  | 'textured'
  | 'roughout-suede'
  | 'shop-choice'
  | 'custom-request'

export type StitchingPreference =
  | 'as-photographed'
  | 'matching'
  | 'contrast'
  | 'heavy-contrast'
  | 'shop-choice'
  | 'custom-request'

export type HardwarePreference =
  | 'as-photographed'
  | 'antique-brass'
  | 'brass'
  | 'nickel'
  | 'black'
  | 'shop-choice'
  | 'custom-request'

export type EdgePreference =
  | 'as-photographed'
  | 'natural'
  | 'dark'
  | 'contrast'
  | 'shop-choice'
  | 'custom-request'

export interface ConstructionPreferences {
  leatherFinish: LeatherFinishPreference
  leatherColor: string
  stitching: StitchingPreference
  hardware: HardwarePreference
  edgeTreatment: EdgePreference
  notes: string
}

export interface StudioPersonalization {
  construction: ConstructionPreferences
  toolingStyle: ToolingStyle
  toolingNotes: string
  textEnabled: boolean
  text: string
  textStyle: TextStyle
  placement: string
  artworkNotes: string
  additionalNotes: string
}

export interface StudioBuildDraft {
  schemaVersion: 1
  familyId: string
  referenceId: string
  variantId: string
  quantity: number
  personalization: StudioPersonalization
  hoodConfiguration?: unknown
}

export interface CustomerDraft {
  name: string
  email: string
  phone: string
  company: string
  preferredContact: 'email' | 'phone' | 'either'
  neededBy: string
}

export interface CommerceResolution {
  productTitle: string
  referenceTitle: string
  referenceImageUrl?: string
  shopifyProductId: string
  merchandiseId: string
  sku: string
  variantTitle: string
  basePriceMinor: number
  listedInventoryQuantity?: number | null
  priceStatus: 'catalog' | 'quote'
}

export interface StudioOrderRequest {
  schemaVersion: 1
  requestId: string
  buildId: string
  createdAt: string
  sourceUrl: string
  customer: CustomerDraft
  build: StudioBuildDraft
  commerce: CommerceResolution
  pricing: {
    currency: 'USD'
    basePriceMinor: number
    baseSubtotalMinor: number
    basePriceStatus: 'catalog' | 'quote'
    personalizationRequiresQuote: boolean
  }
}

export interface DraftIssue {
  path: string
  message: string
}

export function createDefaultPersonalization(placement = 'Shop recommendation'): StudioPersonalization {
  return {
    construction: {
      leatherFinish: 'as-photographed',
      leatherColor: '',
      stitching: 'as-photographed',
      hardware: 'as-photographed',
      edgeTreatment: 'as-photographed',
      notes: '',
    },
    toolingStyle: 'none',
    toolingNotes: '',
    textEnabled: false,
    text: '',
    textStyle: 'western',
    placement,
    artworkNotes: '',
    additionalNotes: '',
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase()
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function decodeBase64Url(value: string): string {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
}

export function createStudioBuildId(build: StudioBuildDraft): string {
  return `SLS-${fnv1a(stableJson(build))}`
}

type CompactShareTokenV2 = [
  2,
  string,
  string,
  string,
  number,
  [
    LeatherFinishPreference,
    string,
    StitchingPreference,
    HardwarePreference,
    EdgePreference,
    string,
    ToolingStyle,
    string,
    0 | 1,
    string,
    TextStyle,
    string,
    string,
    string,
  ],
  unknown?,
]

function compactShareBuild(build: StudioBuildDraft): CompactShareTokenV2 {
  const p = build.personalization
  const construction = p.construction

  return [
    2,
    build.familyId,
    build.referenceId,
    build.variantId,
    build.quantity,
    [
      construction.leatherFinish,
      construction.leatherColor,
      construction.stitching,
      construction.hardware,
      construction.edgeTreatment,
      construction.notes,
      p.toolingStyle,
      p.toolingNotes,
      p.textEnabled ? 1 : 0,
      p.text,
      p.textStyle,
      p.placement,
      p.artworkNotes,
      p.additionalNotes,
    ],
    build.hoodConfiguration ?? null,
  ]
}

function expandShareBuild(value: unknown): StudioBuildDraft {
  if (Array.isArray(value) && value[0] === 2) {
    const [
      ,
      familyId,
      referenceId,
      variantId,
      quantity,
      personalization,
      hoodConfiguration,
    ] = value as CompactShareTokenV2

    if (!Array.isArray(personalization) || personalization.length < 14) {
      throw new Error('invalid')
    }

    const [
      leatherFinish,
      leatherColor,
      stitching,
      hardware,
      edgeTreatment,
      constructionNotes,
      toolingStyle,
      toolingNotes,
      textEnabled,
      text,
      textStyle,
      placement,
      artworkNotes,
      additionalNotes,
    ] = personalization

    return {
      schemaVersion: 1,
      familyId,
      referenceId,
      variantId,
      quantity,
      personalization: {
        construction: {
          leatherFinish,
          leatherColor,
          stitching,
          hardware,
          edgeTreatment,
          notes: constructionNotes,
        },
        toolingStyle,
        toolingNotes,
        textEnabled: textEnabled === 1,
        text,
        textStyle,
        placement,
        artworkNotes,
        additionalNotes,
      },
      ...(hoodConfiguration === undefined || hoodConfiguration === null ? {} : { hoodConfiguration }),
    }
  }

  return value as StudioBuildDraft
}

function validateSharedBuild(parsed: StudioBuildDraft): StudioBuildDraft {
  if (
    parsed.schemaVersion !== 1 ||
    typeof parsed.familyId !== 'string' ||
    typeof parsed.referenceId !== 'string' ||
    typeof parsed.variantId !== 'string' ||
    !Number.isInteger(parsed.quantity) ||
    parsed.quantity < 1 ||
    typeof parsed.personalization !== 'object' ||
    !parsed.personalization ||
    typeof parsed.personalization.construction !== 'object' ||
    !parsed.personalization.construction
  ) {
    throw new Error('invalid')
  }
  return parsed
}

export function createStudioShareToken(build: StudioBuildDraft): string {
  return encodeBase64Url(stableJson(compactShareBuild(build)))
}

export function restoreStudioShareToken(token: string): StudioBuildDraft {
  try {
    return validateSharedBuild(expandShareBuild(JSON.parse(decodeBase64Url(token))))
  } catch {
    throw new Error('This shared Scorpion build is invalid or incompatible.')
  }
}

export function validateOrderDraft(build: StudioBuildDraft, customer: CustomerDraft): DraftIssue[] {
  const issues: DraftIssue[] = []

  if (!customer.name.trim()) {
    issues.push({ path: 'customer.name', message: 'Name is required.' })
  }
  if (!customer.email.trim() && !customer.phone.trim()) {
    issues.push({ path: 'customer.contact', message: 'Enter an email address or phone number.' })
  }
  if (customer.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(customer.email.trim())) {
    issues.push({ path: 'customer.email', message: 'Enter a valid email address.' })
  }
  if (!Number.isInteger(build.quantity) || build.quantity < 1 || build.quantity > 99) {
    issues.push({ path: 'build.quantity', message: 'Quantity must be between 1 and 99.' })
  }
  if (build.personalization.textEnabled && !build.personalization.text.trim()) {
    issues.push({ path: 'build.personalization.text', message: 'Enter the text you want personalized.' })
  }
  if (build.personalization.text.length > 40) {
    issues.push({ path: 'build.personalization.text', message: 'Personalization text must be 40 characters or fewer.' })
  }
  if (build.personalization.toolingStyle === 'custom-concept' && !build.personalization.toolingNotes.trim()) {
    issues.push({ path: 'build.personalization.toolingNotes', message: 'Describe the custom tooling concept.' })
  }
  if (build.personalization.construction.leatherColor.length > 80) {
    issues.push({ path: 'build.personalization.construction.leatherColor', message: 'Leather color request must be 80 characters or fewer.' })
  }
  if (build.personalization.construction.notes.length > 700) {
    issues.push({ path: 'build.personalization.construction.notes', message: 'Construction notes must be 700 characters or fewer.' })
  }

  const customConstruction = [
    build.personalization.construction.leatherFinish,
    build.personalization.construction.stitching,
    build.personalization.construction.hardware,
    build.personalization.construction.edgeTreatment,
  ].includes('custom-request')
  if (customConstruction && !build.personalization.construction.notes.trim()) {
    issues.push({ path: 'build.personalization.construction.notes', message: 'Describe the custom construction request.' })
  }

  return issues
}

function requestId(now: Date): string {
  const stamp = now.toISOString().replace(/[-:TZ.]/gu, '').slice(0, 14)
  const random = crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()
  return `SC-REQ-${stamp}-${random}`
}

export function createOrderRequest(args: {
  build: StudioBuildDraft
  customer: CustomerDraft
  commerce: CommerceResolution
  sourceUrl: string
  now?: Date
}): StudioOrderRequest {
  const issues = validateOrderDraft(args.build, args.customer)
  if (issues.length) throw new Error(issues[0].message)

  const now = args.now ?? new Date()
  return {
    schemaVersion: 1,
    requestId: requestId(now),
    buildId: createStudioBuildId(args.build),
    createdAt: now.toISOString(),
    sourceUrl: args.sourceUrl,
    customer: {
      ...args.customer,
      name: args.customer.name.trim(),
      email: args.customer.email.trim(),
      phone: args.customer.phone.trim(),
      company: args.customer.company.trim(),
    },
    build: args.build,
    commerce: args.commerce,
    pricing: {
      currency: 'USD',
      basePriceMinor: args.commerce.basePriceMinor,
      baseSubtotalMinor: args.commerce.basePriceMinor * args.build.quantity,
      basePriceStatus: args.commerce.priceStatus,
      personalizationRequiresQuote: true,
    },
  }
}

function formatUsdMinor(amountMinor: number): string {
  return String.fromCharCode(36) + (amountMinor / 100).toFixed(2)
}

function preferenceLabel(value: string): string {
  return value
    .split('-')
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ')
}
export function formatOrderSummary(request: StudioOrderRequest): string {
  const p = request.build.personalization
  const construction = p.construction
  const lines = [
    'SCORPION WESTERN WEAR — CUSTOM ORDER REQUEST',
    `Request: ${request.requestId}`,
    `Build: ${request.buildId}`,
    '',
    `Customer: ${request.customer.name}`,
    request.customer.company ? `Company: ${request.customer.company}` : '',
    request.customer.email ? `Email: ${request.customer.email}` : '',
    request.customer.phone ? `Phone: ${request.customer.phone}` : '',
    `Preferred contact: ${request.customer.preferredContact}`,
    request.customer.neededBy ? `Needed by: ${request.customer.neededBy}` : '',
    '',
    `Product: ${request.commerce.productTitle}`,
    `Starting build: ${request.commerce.referenceTitle}`,
    request.commerce.referenceImageUrl ? `Product reference image: ${request.commerce.referenceImageUrl}` : '',
    `Variant: ${request.commerce.variantTitle}`,
    `SKU: ${request.commerce.sku}`,
    `Quantity: ${request.build.quantity}`,
    `Leather finish preference: ${preferenceLabel(construction.leatherFinish)}`,
    `Leather color request: ${construction.leatherColor.trim() || 'As photographed'}`,
    `Stitching preference: ${preferenceLabel(construction.stitching)}`,
    `Hardware preference: ${preferenceLabel(construction.hardware)}`,
    `Edge / binding preference: ${preferenceLabel(construction.edgeTreatment)}`,
    construction.notes ? `Construction notes: ${construction.notes}` : '',
    request.commerce.listedInventoryQuantity === null || request.commerce.listedInventoryQuantity === undefined
      ? ''
      : `Listed inventory at configuration: ${request.commerce.listedInventoryQuantity}`,
    request.commerce.priceStatus === 'catalog'
      ? `Catalog base: ${formatUsdMinor(request.pricing.basePriceMinor)} each · ${formatUsdMinor(request.pricing.baseSubtotalMinor)} base subtotal`
      : 'Base product pricing: Quote required',
    '',
    `Tooling request: ${p.toolingStyle}`,
    p.toolingNotes ? `Tooling notes: ${p.toolingNotes}` : '',
    `Text personalization: ${p.textEnabled ? p.text : 'None'}`,
    p.textEnabled ? `Text style: ${p.textStyle}` : '',
    `Requested placement: ${p.placement}`,
    p.artworkNotes ? `Logo/artwork notes: ${p.artworkNotes}` : '',
    p.additionalNotes ? `Additional notes: ${p.additionalNotes}` : '',
    '',
    `Base price status: ${request.commerce.priceStatus === 'catalog' ? 'Current catalog base price' : 'Quote required'}`,
    'Custom tooling/text/artwork pricing: Quote required',
    '',
    `Source build: ${request.sourceUrl}`,
  ]
  return lines.filter((line, index, all) => line || (index > 0 && all[index - 1] !== '')).join('\n')
}
 + (amountMinor / 100).toFixed(2)
}

function preferenceLabel(value: string): string {
  return value
    .split('-')
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ')
}

export function formatOrderSummary(request: StudioOrderRequest): string {
  const p = request.build.personalization
  const construction = p.construction
  const lines = [
    'SCORPION WESTERN WEAR — CUSTOM ORDER REQUEST',
    `Request: ${request.requestId}`,
    `Build: ${request.buildId}`,
    '',
    `Customer: ${request.customer.name}`,
    request.customer.company ? `Company: ${request.customer.company}` : '',
    request.customer.email ? `Email: ${request.customer.email}` : '',
    request.customer.phone ? `Phone: ${request.customer.phone}` : '',
    `Preferred contact: ${request.customer.preferredContact}`,
    request.customer.neededBy ? `Needed by: ${request.customer.neededBy}` : '',
    '',
    `Product: ${request.commerce.productTitle}`,
    `Starting build: ${request.commerce.referenceTitle}`,
    request.commerce.referenceImageUrl ? `Product reference image: ${request.commerce.referenceImageUrl}` : '',
    `Variant: ${request.commerce.variantTitle}`,
    `SKU: ${request.commerce.sku}`,
    `Quantity: ${request.build.quantity}`,
    `Leather finish preference: ${preferenceLabel(construction.leatherFinish)}`,
    `Leather color request: ${construction.leatherColor.trim() || 'As photographed'}`,
    `Stitching preference: ${preferenceLabel(construction.stitching)}`,
    `Hardware preference: ${preferenceLabel(construction.hardware)}`,
    `Edge / binding preference: ${preferenceLabel(construction.edgeTreatment)}`,
    construction.notes ? `Construction notes: ${construction.notes}` : '',
    request.commerce.listedInventoryQuantity === null || request.commerce.listedInventoryQuantity === undefined
      ? ''
      : `Listed inventory at configuration: ${request.commerce.listedInventoryQuantity}`,
    request.commerce.priceStatus === 'catalog'
      ? `Catalog base: ${(request.pricing.basePriceMinor / 100).toFixed(2)} each · ${(request.pricing.baseSubtotalMinor / 100).toFixed(2)} base subtotal`
      : 'Base product pricing: Quote required',
    '',
    `Tooling request: ${p.toolingStyle}`,
    p.toolingNotes ? `Tooling notes: ${p.toolingNotes}` : '',
    `Text personalization: ${p.textEnabled ? p.text : 'None'}`,
    p.textEnabled ? `Text style: ${p.textStyle}` : '',
    `Requested placement: ${p.placement}`,
    p.artworkNotes ? `Logo/artwork notes: ${p.artworkNotes}` : '',
    p.additionalNotes ? `Additional notes: ${p.additionalNotes}` : '',
    '',
    `Base price status: ${request.commerce.priceStatus === 'catalog' ? 'Current catalog base price' : 'Quote required'}`,
    'Custom tooling/text/artwork pricing: Quote required',
    '',
    `Source build: ${request.sourceUrl}`,
  ]
  return lines.filter((line, index, all) => line || (index > 0 && all[index - 1] !== '')).join('\n')
}

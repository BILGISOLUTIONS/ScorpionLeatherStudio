import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import {
  createDefaultPersonalization,
  createOrderRequest,
  createStudioBuildId,
  createStudioShareToken,
  formatOrderSummary,
  restoreStudioShareToken,
  validateOrderDraft,
  type CustomerDraft,
  type EdgePreference,
  type HardwarePreference,
  type LeatherFinishPreference,
  type StitchingPreference,
  type StudioBuildDraft,
  type StudioOrderRequest,
  type TextStyle,
  type ToolingStyle,
} from '@sls/order-engine'
import { formatMoney } from '@sls/pricing-engine'
import {
  findFamily,
  findReferenceByHandle,
  getFamily,
  getReference,
  getVariant,
  studioFamilies,
  type StudioProductFamily,
  type StudioReference,
  type StudioVariant,
} from './studio-catalog'

const WeldingHoodViewer = lazy(() => import('./WeldingHoodViewer'))

const BUILD_STORAGE_KEY = 'scorpion-leather-studio:v004-build'
const CUSTOMER_STORAGE_KEY = 'scorpion-leather-studio:v004-customer'
const REQUEST_STORAGE_KEY = 'scorpion-leather-studio:v004-requests'
const ARTWORK_SESSION_KEY = 'scorpion-leather-studio:v006-artwork'

const toolingLabels: Record<ToolingStyle, string> = {
  none: 'No tooling',
  'western-floral': 'Western floral',
  'basket-weave': 'Basket weave',
  geometric: 'Geometric',
  border: 'Border tooling',
  'custom-concept': 'Custom concept',
}

const textStyleLabels: Record<TextStyle, string> = {
  block: 'Block',
  western: 'Western',
  script: 'Script',
  monogram: 'Monogram',
  'shop-choice': 'Shop choice',
}

const leatherFinishLabels: Record<LeatherFinishPreference, string> = {
  'as-photographed': 'As photographed',
  smooth: 'Smooth',
  textured: 'Textured / grain',
  'roughout-suede': 'Roughout / suede',
  'shop-choice': 'Let Scorpion recommend',
  'custom-request': 'Custom request',
}

const stitchingLabels: Record<StitchingPreference, string> = {
  'as-photographed': 'As photographed',
  matching: 'Matching thread',
  contrast: 'Contrast thread',
  'heavy-contrast': 'Heavy contrast stitch',
  'shop-choice': 'Let Scorpion recommend',
  'custom-request': 'Custom request',
}

const hardwareLabels: Record<HardwarePreference, string> = {
  'as-photographed': 'As photographed',
  'antique-brass': 'Antique brass',
  brass: 'Brass',
  nickel: 'Nickel / silver',
  black: 'Black hardware',
  'shop-choice': 'Let Scorpion recommend',
  'custom-request': 'Custom request',
}

const edgeLabels: Record<EdgePreference, string> = {
  'as-photographed': 'As photographed',
  natural: 'Natural edge',
  dark: 'Dark edge / binding',
  contrast: 'Contrast edge / binding',
  'shop-choice': 'Let Scorpion recommend',
  'custom-request': 'Custom request',
}

interface ArtworkAttachment {
  name: string
  type: string
  size: number
  dataUrl: string
}

const ARTWORK_MAX_BYTES = 2 * 1024 * 1024
const ARTWORK_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])

function loadSessionArtwork(): ArtworkAttachment | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(ARTWORK_SESSION_KEY)
    return raw ? JSON.parse(raw) as ArtworkAttachment : null
  } catch {
    return null
  }
}

function useDebouncedLocalStorage(key: string, value: unknown, delayMs = 180) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // Persistence is a convenience and must never block configuration.
      }
    }, delayMs)

    return () => window.clearTimeout(timer)
  }, [delayMs, key, value])
}

async function readArtworkFile(file: File): Promise<ArtworkAttachment> {
  if (!ARTWORK_TYPES.has(file.type)) {
    throw new Error('Artwork must be PNG, JPG, WEBP, or PDF.')
  }
  if (file.size > ARTWORK_MAX_BYTES) {
    throw new Error('Artwork files must be 2 MB or smaller.')
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Artwork could not be read.'))
    reader.onerror = () => reject(new Error('Artwork could not be read.'))
    reader.readAsDataURL(file)
  })

  return { name: file.name, type: file.type, size: file.size, dataUrl }
}

function defaultBuild(): StudioBuildDraft {
  const family = studioFamilies[0]
  const reference = family.references[1] ?? family.references[0]
  return {
    schemaVersion: 1,
    familyId: family.id,
    referenceId: reference.id,
    variantId: reference.variants[0].id,
    quantity: 1,
    personalization: createDefaultPersonalization(family.personalization.placementOptions.at(-1) ?? 'Shop recommendation'),
  }
}

function normalizeBuild(input: StudioBuildDraft): StudioBuildDraft {
  const family = getFamily(input.familyId)
  const reference = getReference(family, input.referenceId)
  const variant = getVariant(reference, input.variantId)
  const allowedPlacement = family.personalization.placementOptions.includes(input.personalization?.placement)
    ? input.personalization.placement
    : family.personalization.placementOptions.at(-1) ?? 'Shop recommendation'

  return {
    schemaVersion: 1,
    familyId: family.id,
    referenceId: reference.id,
    variantId: variant.id,
    quantity: Math.min(99, Math.max(1, Number.isInteger(input.quantity) ? input.quantity : 1)),
    personalization: {
      ...createDefaultPersonalization(allowedPlacement),
      ...(input.personalization ?? {}),
      placement: allowedPlacement,
    },
  }
}

function buildFromCatalogTarget(url: URL): StudioBuildDraft | null {
  const productHandle = url.searchParams.get('product')?.trim()
  const familyId = url.searchParams.get('family')?.trim()
  const referenceId = url.searchParams.get('reference')?.trim()
  const variantTarget = url.searchParams.get('variant')?.trim()

  let family: StudioProductFamily | undefined
  let reference: StudioReference | undefined

  if (productHandle) {
    const target = findReferenceByHandle(productHandle)
    family = target?.family
    reference = target?.reference
  }

  if (!family && familyId) {
    family = findFamily(familyId)
    if (family) {
      reference = referenceId
        ? family.references.find((item) => item.id === referenceId)
        : family.references[0]
    }
  }

  if (!family || !reference) return null

  const variant = variantTarget
    ? reference.variants.find((item) =>
        item.id === variantTarget ||
        item.id.endsWith(`/${variantTarget}`) ||
        item.sku === variantTarget ||
        item.title.toLowerCase() === variantTarget.toLowerCase(),
      ) ?? reference.variants[0]
    : reference.variants[0]

  return {
    schemaVersion: 1,
    familyId: family.id,
    referenceId: reference.id,
    variantId: variant.id,
    quantity: 1,
    personalization: createDefaultPersonalization(
      family.personalization.placementOptions.at(-1) ?? 'Shop recommendation',
    ),
  }
}

function loadInitialBuild(): StudioBuildDraft {
  if (typeof window === 'undefined') return defaultBuild()

  const url = new URL(window.location.href)
  const token = url.searchParams.get('studio')
  if (token) {
    try {
      return normalizeBuild(restoreStudioShareToken(token))
    } catch {
      // Fall through to an explicit catalog target or local state.
    }
  }

  const targetedBuild = buildFromCatalogTarget(url)
  if (targetedBuild) return targetedBuild

  try {
    const saved = window.localStorage.getItem(BUILD_STORAGE_KEY)
    if (saved) return normalizeBuild(JSON.parse(saved) as StudioBuildDraft)
  } catch {
    // Local persistence is optional.
  }

  return defaultBuild()
}

function embeddedMode(): boolean {
  if (typeof window === 'undefined') return false
  return new URL(window.location.href).searchParams.get('embed') === '1'
}

function defaultCustomer(): CustomerDraft {
  return {
    name: '',
    email: '',
    phone: '',
    company: '',
    preferredContact: 'either',
    neededBy: '',
  }
}

function loadCustomer(): CustomerDraft {
  if (typeof window === 'undefined') return defaultCustomer()
  try {
    const saved = window.localStorage.getItem(CUSTOMER_STORAGE_KEY)
    if (!saved) return defaultCustomer()
    return { ...defaultCustomer(), ...(JSON.parse(saved) as Partial<CustomerDraft>) }
  } catch {
    return defaultCustomer()
  }
}

function resolveStudio(
  build: StudioBuildDraft,
): { family: StudioProductFamily; reference: StudioReference; variant: StudioVariant } {
  const family = getFamily(build.familyId)
  const reference = getReference(family, build.referenceId)
  const variant = getVariant(reference, build.variantId)
  return { family, reference, variant }
}

function buildShareUrl(build: StudioBuildDraft): string {
  const url = new URL(window.location.href)
  url.searchParams.set('studio', createStudioShareToken(build))
  url.searchParams.delete('build')
  return url.toString()
}

const storefrontImageCache = new Map<string, string>()

function storefrontImage(url: string, width: number): string {
  const cacheKey = `${width}:${url}`
  const cached = storefrontImageCache.get(cacheKey)
  if (cached) return cached

  let resolved = url
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'cdn.shopify.com') parsed.searchParams.set('width', String(width))
    resolved = parsed.toString()
  } catch {
    // Keep the original URL if it cannot be parsed.
  }

  storefrontImageCache.set(cacheKey, resolved)
  return resolved
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(href)
}

function ReferenceStage({
  family,
  reference,
  build,
  artwork,
}: {
  family: StudioProductFamily
  reference: StudioReference
  build: StudioBuildDraft
  artwork: ArtworkAttachment | null
}) {
  const p = build.personalization
  const tooling = toolingLabels[p.toolingStyle]

  return (
    <div className="photo-stage" aria-label="Photographed product preview">
      <img
        src={storefrontImage(reference.image, 1200)}
        srcSet={`${storefrontImage(reference.image, 640)} 640w, ${storefrontImage(reference.image, 960)} 960w, ${storefrontImage(reference.image, 1400)} 1400w`}
        sizes="(max-width: 900px) 100vw, 60vw"
        alt={reference.imageAlt}
        decoding="async"
      />
      {p.toolingStyle !== 'none' ? (
        <div className={`tooling-concept tooling-${p.toolingStyle}`} aria-hidden="true" />
      ) : null}
      {(p.textEnabled && p.text.trim()) || p.toolingStyle !== 'none' || artwork ? (
        <div className="mock-personalization" aria-label="Personalization concept preview">
          <span className="mock-label">CONCEPT PREVIEW · FINAL ART / PLACEMENT CONFIRMED BY SHOP</span>
          {artwork && artwork.type.startsWith('image/') ? (
            <img className="mock-artwork" src={artwork.dataUrl} alt="Uploaded artwork concept" />
          ) : artwork ? (
            <span className="mock-file">{artwork.name}</span>
          ) : null}
          {p.textEnabled && p.text.trim() ? (
            <strong className={`mock-text mock-text-${p.textStyle}`}>{p.text}</strong>
          ) : null}
          {p.toolingStyle !== 'none' ? <span>{tooling}</span> : null}
          <small>{p.placement}</small>
        </div>
      ) : null}
      <div className="photo-stage-meta">
        <span>PHOTOGRAPHED SCORPION PRODUCT</span>
        <strong>{family.shortTitle}</strong>
      </div>
    </div>
  )
}

const ProductFamilyRail = memo(function ProductFamilyRail({
  selectedId,
  onSelect,
}: {
  selectedId: string
  onSelect: (family: StudioProductFamily) => void
}) {
  return (
    <nav className="family-rail" aria-label="Customizable products">
      {studioFamilies.map((family) => (
        <button
          type="button"
          key={family.id}
          className={selectedId === family.id ? 'is-selected' : ''}
          onClick={() => onSelect(family)}
        >
          <img src={storefrontImage(family.references[0].image, 160)} alt="" loading="lazy" decoding="async" />
          <span>
            <strong>{family.shortTitle}</strong>
            <small>{family.references.length} starting build{family.references.length === 1 ? '' : 's'}</small>
          </span>
        </button>
      ))}
    </nav>
  )
})

const ReferencePicker = memo(function ReferencePicker({
  family,
  selectedId,
  onSelect,
}: {
  family: StudioProductFamily
  selectedId: string
  onSelect: (reference: StudioReference) => void
}) {
  return (
    <fieldset className="studio-section">
      <div className="section-title-row">
        <legend>1. Starting build</legend>
        <span>{family.references.length} Scorpion catalog reference{family.references.length === 1 ? '' : 's'}</span>
      </div>
      <div className="reference-grid">
        {family.references.map((reference) => (
          <button
            type="button"
            key={reference.id}
            className={selectedId === reference.id ? 'reference-choice is-selected' : 'reference-choice'}
            onClick={() => onSelect(reference)}
            aria-pressed={selectedId === reference.id}
          >
            <img src={storefrontImage(reference.image, 480)} alt="" loading="lazy" decoding="async" />
            <span>
              <strong>{reference.title}</strong>
              <small>{reference.priceStatus === 'quote' ? 'Custom quote' : `Base ${formatMoney(reference.basePriceMinor)}`}</small>
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  )
})

const VariantPicker = memo(function VariantPicker({
  reference,
  selectedId,
  onSelect,
}: {
  reference: StudioReference
  selectedId: string
  onSelect: (variant: StudioVariant) => void
}) {
  const meaningfulVariants =
    reference.variants.length > 1 ||
    reference.variants.some((variant) => !['Default', 'Custom Order'].includes(variant.title))

  if (!meaningfulVariants) return null

  return (
    <fieldset className="studio-section">
      <div className="section-title-row">
        <legend>2. Size / variant</legend>
        <span>Live catalog identity</span>
      </div>
      <div className="variant-grid">
        {reference.variants.map((variant) => (
          <button
            type="button"
            key={variant.id}
            className={selectedId === variant.id ? 'variant-choice is-selected' : 'variant-choice'}
            onClick={() => onSelect(variant)}
            aria-pressed={selectedId === variant.id}
          >
            <strong>{variant.title}</strong>
            <small>
              {variant.sku}
              {reference.priceStatus === 'catalog' && variant.inventoryQuantity !== null
                ? ` · ${variant.inventoryQuantity} listed`
                : ''}
            </small>
          </button>
        ))}
      </div>
    </fieldset>
  )
})

function PersonalizationEditor({
  family,
  build,
  artwork,
  onArtworkChange,
  onStatus,
  onChange,
}: {
  family: StudioProductFamily
  build: StudioBuildDraft
  artwork: ArtworkAttachment | null
  onArtworkChange: (next: ArtworkAttachment | null) => void
  onStatus: (message: string) => void
  onChange: (next: StudioBuildDraft['personalization']) => void
}) {
  const p = build.personalization
  const update = (patch: Partial<StudioBuildDraft['personalization']>) => onChange({ ...p, ...patch })
  const updateConstruction = (patch: Partial<StudioBuildDraft['personalization']['construction']>) => {
    update({ construction: { ...p.construction, ...patch } })
  }

  return (
    <fieldset className="studio-section personalization-section">
      <div className="section-title-row">
        <legend>3. Construction & personalization</legend>
        <span>Preferences are reviewed before production</span>
      </div>

      <div className="personalization-block construction-block">
        <div className="field-heading">
          <strong>Construction preferences</strong>
          <small>These are requests, not guaranteed material inventory. Scorpion confirms feasibility, availability, and final price.</small>
        </div>
        <div className="construction-grid">
          <label className="field-label">
            Leather finish preference
            <select
              value={p.construction.leatherFinish}
              onChange={(event) => updateConstruction({ leatherFinish: event.target.value as LeatherFinishPreference })}
            >
              {(Object.keys(leatherFinishLabels) as LeatherFinishPreference[]).map((value) => (
                <option key={value} value={value}>{leatherFinishLabels[value]}</option>
              ))}
            </select>
          </label>

          <label className="field-label">
            Leather color request
            <input
              type="text"
              value={p.construction.leatherColor}
              onChange={(event) => updateConstruction({ leatherColor: event.target.value.slice(0, 80) })}
              placeholder="Leave blank to use photographed color"
              maxLength={80}
            />
          </label>

          <label className="field-label">
            Stitching preference
            <select
              value={p.construction.stitching}
              onChange={(event) => updateConstruction({ stitching: event.target.value as StitchingPreference })}
            >
              {(Object.keys(stitchingLabels) as StitchingPreference[]).map((value) => (
                <option key={value} value={value}>{stitchingLabels[value]}</option>
              ))}
            </select>
          </label>

          <label className="field-label">
            Hardware preference
            <select
              value={p.construction.hardware}
              onChange={(event) => updateConstruction({ hardware: event.target.value as HardwarePreference })}
            >
              {(Object.keys(hardwareLabels) as HardwarePreference[]).map((value) => (
                <option key={value} value={value}>{hardwareLabels[value]}</option>
              ))}
            </select>
          </label>

          <label className="field-label">
            Edge / binding preference
            <select
              value={p.construction.edgeTreatment}
              onChange={(event) => updateConstruction({ edgeTreatment: event.target.value as EdgePreference })}
            >
              {(Object.keys(edgeLabels) as EdgePreference[]).map((value) => (
                <option key={value} value={value}>{edgeLabels[value]}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="field-label construction-notes">
          Construction notes
          <textarea
            value={p.construction.notes}
            onChange={(event) => updateConstruction({ notes: event.target.value.slice(0, 700) })}
            placeholder="Describe any custom leather, stitching, hardware, binding, reinforcement, fit, or construction request."
            maxLength={700}
          />
        </label>
      </div>

      {family.personalization.tooling ? (
        <div className="personalization-block">
          <div className="field-heading">
            <strong>Leather tooling request</strong>
            <small>Choose a direction. Scorpion confirms feasibility and price.</small>
          </div>
          <div className="tooling-grid">
            {(Object.keys(toolingLabels) as ToolingStyle[]).map((style) => (
              <button
                type="button"
                key={style}
                className={p.toolingStyle === style ? 'choice-chip is-selected' : 'choice-chip'}
                onClick={() => update({ toolingStyle: style })}
                aria-pressed={p.toolingStyle === style}
              >
                {toolingLabels[style]}
              </button>
            ))}
          </div>
          {p.toolingStyle !== 'none' ? (
            <textarea
              value={p.toolingNotes}
              onChange={(event) => update({ toolingNotes: event.target.value })}
              placeholder={p.toolingStyle === 'custom-concept' ? 'Describe the custom tooling concept…' : 'Optional tooling details, border ideas, motifs, depth, etc…'}
              maxLength={500}
            />
          ) : null}
        </div>
      ) : null}

      {family.personalization.text ? (
        <div className="personalization-block">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={p.textEnabled}
              onChange={(event) => update({ textEnabled: event.target.checked })}
            />
            <span>
              <strong>Add text / name / monogram</strong>
              <small>Preview is conceptual; shop confirms exact tooling/font/placement.</small>
            </span>
          </label>

          {p.textEnabled ? (
            <>
              <label className="field-label">
                Personalization text
                <input
                  type="text"
                  value={p.text}
                  onChange={(event) => update({ text: event.target.value.slice(0, 40) })}
                  placeholder="Name, initials, company, unit, etc."
                  maxLength={40}
                />
                <small>{p.text.length}/40</small>
              </label>
              <div className="text-style-row">
                {(Object.keys(textStyleLabels) as TextStyle[]).map((style) => (
                  <button
                    type="button"
                    key={style}
                    className={p.textStyle === style ? 'choice-chip is-selected' : 'choice-chip'}
                    onClick={() => update({ textStyle: style })}
                    aria-pressed={p.textStyle === style}
                  >
                    {textStyleLabels[style]}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="personalization-block">
        <label className="field-label">
          Requested placement
          <select value={p.placement} onChange={(event) => update({ placement: event.target.value })}>
            {family.personalization.placementOptions.map((placement) => (
              <option key={placement} value={placement}>{placement}</option>
            ))}
          </select>
        </label>
      </div>

      {family.personalization.artwork ? (
        <div className="personalization-block">
          <div className="field-heading">
            <strong>Logo / artwork</strong>
            <small>Attach a PNG, JPG, WEBP, or PDF up to 2 MB. The file is sent only with the order request and is not embedded in share links.</small>
          </div>
          <label className="artwork-upload">
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                try {
                  const next = await readArtworkFile(file)
                  onArtworkChange(next)
                  onStatus(`Artwork attached: ${next.name}`)
                } catch (error) {
                  onArtworkChange(null)
                  onStatus(error instanceof Error ? error.message : 'Artwork could not be attached.')
                } finally {
                  event.target.value = ''
                }
              }}
            />
            <span>{artwork ? 'Replace artwork' : 'Attach artwork'}</span>
          </label>
          {artwork ? (
            <div className="artwork-file-card">
              {artwork.type.startsWith('image/') ? <img src={artwork.dataUrl} alt="Uploaded artwork preview" /> : <div className="artwork-pdf">PDF</div>}
              <div>
                <strong>{artwork.name}</strong>
                <small>{Math.max(1, Math.round(artwork.size / 1024))} KB · {artwork.type}</small>
              </div>
              <button type="button" onClick={() => onArtworkChange(null)}>Remove</button>
            </div>
          ) : null}
          <label className="field-label">
            Artwork instructions
            <textarea
              value={p.artworkNotes}
              onChange={(event) => update({ artworkNotes: event.target.value })}
              placeholder="Describe how the logo, emblem, patch, symbol, or artwork should be used."
              maxLength={700}
            />
          </label>
        </div>
      ) : null}

      <div className="personalization-block">
        <label className="field-label">
          Build notes
          <textarea
            value={p.additionalNotes}
            onChange={(event) => update({ additionalNotes: event.target.value })}
            placeholder="Special use case, fit notes, job requirements, deadlines, or anything else the shop should know."
            maxLength={1000}
          />
        </label>
      </div>
    </fieldset>
  )
}

function OrderCapture({
  build,
  family,
  reference,
  variant,
  artwork,
  setStatus,
}: {
  build: StudioBuildDraft
  family: StudioProductFamily
  reference: StudioReference
  variant: StudioVariant
  artwork: ArtworkAttachment | null
  setStatus: (message: string) => void
}) {
  const [customer, setCustomer] = useState<CustomerDraft>(loadCustomer)
  const [request, setRequest] = useState<StudioOrderRequest | null>(null)
  const [deliveryState, setDeliveryState] = useState<'idle' | 'sending' | 'sent' | 'unavailable' | 'failed'>('idle')
  const [website, setWebsite] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)

  const issues = validateOrderDraft(build, customer)
  const issueMap = Object.fromEntries(issues.map((issue) => [issue.path, issue.message]))
  useDebouncedLocalStorage(CUSTOMER_STORAGE_KEY, customer, 250)

  useEffect(() => {
    setRequest(null)
    setDeliveryState('idle')
    setAcknowledged(false)
  }, [build])

  const prepareRequest = () => {
    try {
      const sourceUrl = buildShareUrl(build)
      window.history.replaceState({}, '', sourceUrl)
      const next = createOrderRequest({
        build,
        customer,
        sourceUrl,
        commerce: {
          productTitle: family.title,
          referenceTitle: reference.title,
          referenceImageUrl: storefrontImage(reference.image, 1000),
          shopifyProductId: reference.shopifyProductId,
          merchandiseId: variant.id,
          sku: variant.sku,
          variantTitle: variant.title,
          basePriceMinor: variant.priceMinor,
          listedInventoryQuantity: variant.inventoryQuantity,
          priceStatus: reference.priceStatus,
        },
      })
      setRequest(next)
      setDeliveryState('idle')
      setAcknowledged(false)
      setStatus(`Order request ${next.requestId} prepared.`)

      try {
        const saved = JSON.parse(window.localStorage.getItem(REQUEST_STORAGE_KEY) ?? '[]') as StudioOrderRequest[]
        window.localStorage.setItem(REQUEST_STORAGE_KEY, JSON.stringify([next, ...saved].slice(0, 20)))
      } catch {
        // The request still exists in memory if local storage is unavailable.
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Complete the required order details.')
    }
  }

  const summary = request ? formatOrderSummary(request) : ''

  const copySummary = async () => {
    if (!request) return
    try {
      await navigator.clipboard.writeText(summary)
      setStatus('Order request copied to the clipboard.')
    } catch {
      setStatus('Clipboard access was unavailable. Download the build sheet instead.')
    }
  }

  const sendRequest = async () => {
    if (!request || deliveryState === 'sending') return
    setDeliveryState('sending')
    setStatus('Sending custom order request to Scorpion…')

    try {
      const response = await fetch('/api/order-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request, website, artwork }),
      })
      const payload = await response.json().catch(() => ({})) as { accepted?: boolean; code?: string; deliveryId?: string }

      if (response.ok && payload.accepted) {
        setDeliveryState('sent')
        setStatus(`Request ${request.requestId} sent to Scorpion successfully.`)
        return
      }

      if (response.status === 503 && payload.code === 'ORDER_TRANSPORT_NOT_CONFIGURED') {
        setDeliveryState('unavailable')
        setStatus('Direct delivery is not configured on this deployment yet. Use the email fallback below.')
        return
      }

      setDeliveryState('failed')
      setStatus('The server could not deliver this request. Your build sheet is still safe; use the email fallback.')
    } catch {
      setDeliveryState('failed')
      setStatus('Could not reach the order server. Your build sheet is still safe; use the email fallback.')
    }
  }

  const emailRequest = () => {
    if (!request) return
    const subject = encodeURIComponent(`Custom Leather Order Request — ${request.requestId}`)
    const body = encodeURIComponent(summary)
    window.location.href = `mailto:orders@scorpionwesternwear.com?subject=${subject}&body=${body}`
  }

  const downloadJson = () => {
    if (!request) return
    downloadText(`${request.requestId}.json`, JSON.stringify({ request, artwork: artwork ? { name: artwork.name, type: artwork.type, size: artwork.size } : null }, null, 2))
  }

  const printPacket = () => {
    if (!request) return
    const popup = window.open('', '_blank')
    if (!popup) {
      setStatus('The browser blocked the print packet. Allow popups for this site and try again.')
      return
    }

    try { popup.opener = null } catch { /* best-effort opener isolation */ }

    const escape = (value: string) => value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')

    popup.document.write(`<!doctype html><html><head><title>${escape(request.requestId)}</title><style>
      body{font-family:Arial,sans-serif;margin:32px;color:#171717}h1{margin:0 0 6px}small{color:#666}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:20px 0}.meta div{border:1px solid #ccc;padding:10px}
      pre{white-space:pre-wrap;border:1px solid #bbb;padding:16px;font-size:12px;line-height:1.45}
      img{max-width:260px;max-height:180px;object-fit:contain;border:1px solid #ccc;padding:8px}
      @media print{button{display:none}}
    </style></head><body>
      <h1>Scorpion Western Wear — Custom Order Packet</h1>
      <small>${escape(request.requestId)} · ${escape(request.buildId)}</small>
      ${request.commerce.referenceImageUrl ? `<img src="${escape(request.commerce.referenceImageUrl)}" alt="Photographed Scorpion product reference">` : ''}
      <div class="meta">
        <div><strong>Product</strong><br>${escape(request.commerce.referenceTitle)}</div>
        <div><strong>SKU / Variant</strong><br>${escape(request.commerce.sku)} · ${escape(request.commerce.variantTitle)}</div>
        <div><strong>Customer</strong><br>${escape(request.customer.name)}${request.customer.company ? ` · ${escape(request.customer.company)}` : ''}</div>
        <div><strong>Contact</strong><br>${escape(request.customer.email || request.customer.phone)}</div>
      </div>
      ${artwork && artwork.type.startsWith('image/') ? `<h2>Attached Artwork</h2><img src="${artwork.dataUrl}" alt="Artwork">` : artwork ? `<p><strong>Artwork attachment:</strong> ${escape(artwork.name)}</p>` : ''}
      <h2>Build Specification</h2><pre>${escape(summary)}</pre>
      <button onclick="window.print()">Print packet</button>
    </body></html>`)
    popup.document.close()
  }

  return (
    <section className="order-capture" aria-label="Custom order request">
      <div className="order-capture-heading">
        <div>
          <p className="eyebrow">ORDER CAPTURE</p>
          <h2>Turn this build into a shop-ready request</h2>
        </div>
        <span>{createStudioBuildId(build)}</span>
      </div>

      <label className="hp-field" aria-hidden="true">
        Website
        <input
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </label>

      <div className="order-form-grid">
        <label>
          Name *
          <input
            value={customer.name}
            onChange={(event) => setCustomer({ ...customer, name: event.target.value })}
            autoComplete="name"
          />
          {issueMap['customer.name'] ? <small className="field-error">{issueMap['customer.name']}</small> : null}
        </label>
        <label>
          Company
          <input
            value={customer.company}
            onChange={(event) => setCustomer({ ...customer, company: event.target.value })}
            autoComplete="organization"
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={customer.email}
            onChange={(event) => setCustomer({ ...customer, email: event.target.value })}
            autoComplete="email"
          />
          {issueMap['customer.email'] ? <small className="field-error">{issueMap['customer.email']}</small> : null}
        </label>
        <label>
          Phone
          <input
            type="tel"
            value={customer.phone}
            onChange={(event) => setCustomer({ ...customer, phone: event.target.value })}
            autoComplete="tel"
          />
        </label>
        <label>
          Preferred contact
          <select
            value={customer.preferredContact}
            onChange={(event) => setCustomer({ ...customer, preferredContact: event.target.value as CustomerDraft['preferredContact'] })}
          >
            <option value="either">Either</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
          </select>
        </label>
        <label>
          Needed by
          <input
            type="date"
            value={customer.neededBy}
            onChange={(event) => setCustomer({ ...customer, neededBy: event.target.value })}
          />
        </label>
      </div>

      {issueMap['customer.contact'] ? <p className="field-error contact-error">{issueMap['customer.contact']}</p> : null}

      <div className="order-action-row">
        <button className="primary-action" type="button" onClick={prepareRequest}>
          Create Order Request
        </button>
        <p>
          This creates a structured Scorpion build sheet. Tooling, text, artwork, and quote-only products require shop confirmation before production.
        </p>
      </div>

      {request ? (
        <div className="request-ready">
          <div className="request-ready-head">
            <div>
              <span>REQUEST READY</span>
              <strong>{request.requestId}</strong>
            </div>
            <span>{request.commerce.sku}</span>
          </div>
          <pre>{summary}</pre>
          <label className="request-acknowledgement">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
            <span>I understand this is a customization request. Scorpion must confirm design feasibility, availability, lead time, fit, and final price before production.</span>
          </label>
          <div className="request-actions">
            <button type="button" onClick={copySummary}>Copy summary</button>
            <button type="button" onClick={() => downloadText(`${request.requestId}.txt`, summary)}>Text build sheet</button>
            <button type="button" onClick={downloadJson}>JSON packet</button>
            <button type="button" onClick={printPacket}>Print packet</button>
            <button
              type="button"
              className="request-send"
              onClick={sendRequest}
              disabled={!acknowledged || deliveryState === 'sending' || deliveryState === 'sent'}
            >
              {deliveryState === 'sending' ? 'Sending…' : deliveryState === 'sent' ? 'Sent to Scorpion' : 'Send to Scorpion'}
            </button>
            <button type="button" onClick={emailRequest}>Email fallback</button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export function App() {
  const [embedded] = useState(embeddedMode)
  const [build, setBuild] = useState<StudioBuildDraft>(loadInitialBuild)
  const [artwork, setArtwork] = useState<ArtworkAttachment | null>(loadSessionArtwork)
  const [status, setStatus] = useState('')

  const { family, reference, variant } = useMemo(() => resolveStudio(build), [build])
  const construction = build.personalization.construction
  const constructionRequested =
    construction.leatherFinish !== 'as-photographed' ||
    Boolean(construction.leatherColor.trim()) ||
    construction.stitching !== 'as-photographed' ||
    construction.hardware !== 'as-photographed' ||
    construction.edgeTreatment !== 'as-photographed' ||
    Boolean(construction.notes.trim())

  const customWorkRequested =
    constructionRequested ||
    build.personalization.toolingStyle !== 'none' ||
    build.personalization.textEnabled ||
    Boolean(build.personalization.artworkNotes.trim()) ||
    Boolean(build.personalization.additionalNotes.trim())

  useDebouncedLocalStorage(BUILD_STORAGE_KEY, build)

  useEffect(() => {
    if (!embedded || window.parent === window) return

    let frame = 0
    let lastHeight = 0
    const sendHeight = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const height = Math.ceil(Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
          document.documentElement.offsetHeight,
        ))
        if (Math.abs(height - lastHeight) < 2) return
        lastHeight = height
        window.parent.postMessage({
          type: 'scorpion-leather-studio:resize',
          version: 1,
          height,
        }, '*')
      })
    }

    const observer = new ResizeObserver(sendHeight)
    observer.observe(document.documentElement)
    observer.observe(document.body)
    window.addEventListener('resize', sendHeight)
    sendHeight()

    window.parent.postMessage({
      type: 'scorpion-leather-studio:ready',
      version: 1,
    }, '*')

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', sendHeight)
      cancelAnimationFrame(frame)
    }
  }, [embedded])


  useEffect(() => {
    try {
      if (artwork) {
        window.sessionStorage.setItem(ARTWORK_SESSION_KEY, JSON.stringify(artwork))
      } else {
        window.sessionStorage.removeItem(ARTWORK_SESSION_KEY)
      }
    } catch {
      // Artwork persistence is best-effort. The request still works without it.
    }
  }, [artwork])

  const chooseFamily = useCallback((nextFamily: StudioProductFamily) => {
    const nextReference = nextFamily.references[0]
    setBuild({
      schemaVersion: 1,
      familyId: nextFamily.id,
      referenceId: nextReference.id,
      variantId: nextReference.variants[0].id,
      quantity: 1,
      personalization: createDefaultPersonalization(
        nextFamily.personalization.placementOptions.at(-1) ?? 'Shop recommendation',
      ),
    })
    setArtwork(null)
    setStatus('')
  }, [])

  const chooseReference = useCallback((nextReference: StudioReference) => {
    setBuild((current) => ({
      ...current,
      referenceId: nextReference.id,
      variantId: nextReference.variants[0].id,
    }))
    setStatus('')
  }, [])

  const chooseVariant = useCallback((nextVariant: StudioVariant) => {
    setBuild((current) => ({ ...current, variantId: nextVariant.id }))
  }, [])

  const changePersonalization = useCallback((personalization: StudioBuildDraft['personalization']) => {
    setBuild((current) => ({ ...current, personalization }))
  }, [])

  const shareBuild = async () => {
    const url = buildShareUrl(build)
    window.history.replaceState({}, '', url)
    try {
      await navigator.clipboard.writeText(url)
      setStatus('Shareable build link copied.')
    } catch {
      setStatus('Shareable build is in the address bar. Copy the current URL.')
    }
  }

  const resetBuild = () => {
    const next = defaultBuild()
    setBuild(next)
    setArtwork(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('studio')
    url.searchParams.delete('build')
    window.history.replaceState({}, '', url)
    setStatus('Studio reset.')
  }

  return (
    <main className={`studio-shell multi-studio ${embedded ? 'is-embedded' : ''}`}>
      <header className="studio-header">
        <div>
          <p className="eyebrow">SCORPION WESTERN WEAR</p>
          <h1>Custom Leather Studio</h1>
          <p className="studio-subtitle">
            Select a real Scorpion leather product, personalize the concept, choose the catalog variant, and produce a structured custom-order request for the shop.
          </p>
        </div>
        <div className="header-build">
          <div className="prototype-badge">ORDER STUDIO · V0.8</div>
          <div className="configuration-id">
            <span>BUILD</span>
            <strong>{createStudioBuildId(build)}</strong>
          </div>
        </div>
      </header>

      <ProductFamilyRail selectedId={family.id} onSelect={chooseFamily} />

      <section className="studio-grid">
        <div className="viewer-column">
          {family.supports3D ? (
            <Suspense fallback={<div className="viewer-loading">Loading 3D studio…</div>}>
              <WeldingHoodViewer referenceId={reference.id} />
            </Suspense>
          ) : (
            <ReferenceStage family={family} reference={reference} build={build} artwork={artwork} />
          )}

          {family.supports3D ? <ReferenceStage family={family} reference={reference} build={build} artwork={artwork} /> : null}

          <section className="viewer-build-card">
            <div>
              <span>SELECTED SCORPION PRODUCT</span>
              <h2>{reference.title}</h2>
              <p>{family.description}</p>
            </div>
            <dl>
              <div><dt>SKU</dt><dd>{variant.sku}</dd></div>
              <div><dt>Variant</dt><dd>{variant.title}</dd></div>
              <div>
                <dt>Base price</dt>
                <dd>{reference.priceStatus === 'quote' ? 'Quote required' : formatMoney(variant.priceMinor)}</dd>
              </div>
              <div><dt>Customization</dt><dd>{customWorkRequested ? 'Custom quote' : 'Available to request'}</dd></div>
            </dl>
          </section>
        </div>

        <aside className="controls-panel multi-controls">
          <div className="product-heading">
            <div className="product-kicker">
              <p className="eyebrow">CUSTOMIZE</p>
              <span>{family.title}</span>
            </div>
            <h2>{reference.title}</h2>
            <p>
              Start with a real Scorpion catalog item. Tooling, lettering, artwork, non-stock modifications, and quote-only products are submitted as requests for shop confirmation.
            </p>
          </div>

          <ReferencePicker family={family} selectedId={reference.id} onSelect={chooseReference} />

          <VariantPicker
            reference={reference}
            selectedId={variant.id}
            onSelect={chooseVariant}
          />

          <PersonalizationEditor
            family={family}
            build={build}
            artwork={artwork}
            onArtworkChange={setArtwork}
            onStatus={setStatus}
            onChange={changePersonalization}
          />

          <fieldset className="studio-section quantity-section">
            <div className="section-title-row">
              <legend>4. Quantity</legend>
              <span>1–99 pieces</span>
            </div>
            <div className="quantity-control">
              <button
                type="button"
                onClick={() => setBuild((current) => ({ ...current, quantity: Math.max(1, current.quantity - 1) }))}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <input
                aria-label="Quantity"
                type="number"
                min={1}
                max={99}
                value={build.quantity}
                onChange={(event) => {
                  const value = Math.max(1, Math.min(99, Number(event.target.value) || 1))
                  setBuild((current) => ({ ...current, quantity: value }))
                }}
              />
              <button
                type="button"
                onClick={() => setBuild((current) => ({ ...current, quantity: Math.min(99, current.quantity + 1) }))}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </fieldset>

          <section className="studio-summary" aria-label="Build summary">
            <div className="summary-price">
              <span>{reference.priceStatus === 'quote' ? 'Base product' : build.quantity > 1 ? 'Catalog base subtotal' : 'Catalog base'}</span>
              <strong data-testid="base-price">
                {reference.priceStatus === 'quote' ? 'QUOTE' : formatMoney(variant.priceMinor * build.quantity)}
              </strong>
            </div>
            <div className="summary-notice">
              {reference.priceStatus === 'quote'
                ? 'This Shopify record currently carries a development/test price. The customer-facing studio does not present it as retail pricing.'
                : build.quantity > (variant.inventoryQuantity ?? Number.POSITIVE_INFINITY)
                  ? `Requested quantity exceeds the currently listed inventory of ${variant.inventoryQuantity}. Scorpion must confirm availability before accepting the order.`
                  : 'Current catalog base subtotal shown. Any custom tooling, text, artwork, material changes, or shop modifications require a separate quote.'}
            </div>
            <div className="summary-spec">
              <div><span>SKU</span><strong>{variant.sku}</strong></div>
              <div><span>Qty</span><strong>{build.quantity}</strong></div>
              {reference.priceStatus === 'catalog' && variant.inventoryQuantity !== null ? (
                <div><span>Listed stock</span><strong>{variant.inventoryQuantity}</strong></div>
              ) : null}
              <div><span>Leather</span><strong>{leatherFinishLabels[construction.leatherFinish]}{construction.leatherColor.trim() ? ` · ${construction.leatherColor.trim()}` : ''}</strong></div>
              <div><span>Stitching</span><strong>{stitchingLabels[construction.stitching]}</strong></div>
              <div><span>Hardware</span><strong>{hardwareLabels[construction.hardware]}</strong></div>
              <div><span>Tooling</span><strong>{toolingLabels[build.personalization.toolingStyle]}</strong></div>
              <div><span>Text</span><strong>{build.personalization.textEnabled ? build.personalization.text || 'Pending' : 'None'}</strong></div>
              <div><span>Placement</span><strong>{build.personalization.placement}</strong></div>
            </div>
            <div className="secondary-actions">
              <button type="button" onClick={shareBuild}>Share build</button>
              <button type="button" onClick={resetBuild}>Reset studio</button>
            </div>
            <p className="status" role="status" aria-live="polite">
              {status || 'Build changes save automatically on this device.'}
            </p>
          </section>
        </aside>
      </section>

      <OrderCapture
        build={build}
        family={family}
        reference={reference}
        variant={variant}
        artwork={artwork}
        setStatus={setStatus}
      />
    </main>
  )
}

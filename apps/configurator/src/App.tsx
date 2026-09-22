import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createDefaultPersonalization,
  createStudioBuildId,
  restoreStudioShareToken,
  type EdgePreference,
  type HardwarePreference,
  type LeatherFinishPreference,
  type StitchingPreference,
  type StudioBuildDraft,
  type TextStyle,
  type ToolingStyle,
} from '@sls/order-engine'
import { formatMoney } from '@sls/pricing-engine'
import { storefrontImage } from './studio-media'
import type { ArtworkAttachment } from './studio-types'
import { buildShareUrl } from './studio-url'
import { useDebouncedLocalStorage } from './useDebouncedLocalStorage'
import { useLiveCatalogVariant } from './useLiveCatalogVariant'
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
const OrderCapture = lazy(() => import('./OrderCapture'))

const BUILD_STORAGE_KEY = 'scorpion-leather-studio:v004-build'
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

function resolveStudio(
  build: StudioBuildDraft,
): { family: StudioProductFamily; reference: StudioReference; variant: StudioVariant } {
  const family = getFamily(build.familyId)
  const reference = getReference(family, build.referenceId)
  const variant = getVariant(reference, build.variantId)
  return { family, reference, variant }
}

function ReferenceStage({
  family,
  reference,
}: {
  family: StudioProductFamily
  reference: StudioReference
}) {
  return (
    <div className="photo-stage" aria-label="Photographed product preview">
      <img
        src={storefrontImage(reference.image, 1200)}
        srcSet={`${storefrontImage(reference.image, 640)} 640w, ${storefrontImage(reference.image, 960)} 960w, ${storefrontImage(reference.image, 1400)} 1400w`}
        sizes="(max-width: 900px) 100vw, 60vw"
        alt={reference.imageAlt}
        decoding="async"
      />
      <div className="photo-stage-meta">
        <span>PHOTOGRAPHED SCORPION PRODUCT</span>
        <strong>{family.shortTitle}</strong>
      </div>
    </div>
  )
}

function ConceptSummary({
  build,
  artwork,
}: {
  build: StudioBuildDraft
  artwork: ArtworkAttachment | null
}) {
  const p = build.personalization
  const hasText = p.textEnabled && Boolean(p.text.trim())
  const hasTooling = p.toolingStyle !== 'none'
  const hasArtwork = Boolean(artwork)

  if (!hasText && !hasTooling && !hasArtwork) return null

  return (
    <section className="concept-summary" aria-label="Customization concept">
      <div className="concept-summary-heading">
        <div>
          <span>YOUR CONCEPT</span>
          <strong>Selections stay beside the product — never on top of it.</strong>
        </div>
        <small>Final artwork, scale and placement are confirmed by Scorpion before production.</small>
      </div>
      <div className="concept-summary-items">
        {hasTooling ? (
          <div className="concept-item">
            <span className={`concept-swatch concept-swatch-${p.toolingStyle}`} aria-hidden="true" />
            <span><small>Tooling</small><strong>{toolingLabels[p.toolingStyle]}</strong></span>
          </div>
        ) : null}
        {hasText ? (
          <div className="concept-item">
            <span className="concept-glyph" aria-hidden="true">Aa</span>
            <span><small>Text</small><strong className={`concept-text concept-text-${p.textStyle}`}>{p.text}</strong></span>
          </div>
        ) : null}
        {hasArtwork ? (
          <div className="concept-item">
            {artwork?.type.startsWith('image/') ? (
              <img className="concept-artwork" src={artwork.dataUrl} alt="" />
            ) : (
              <span className="concept-glyph" aria-hidden="true">PDF</span>
            )}
            <span><small>Artwork</small><strong>{artwork?.name}</strong></span>
          </div>
        ) : null}
        <div className="concept-item concept-placement">
          <span className="concept-glyph" aria-hidden="true">⌖</span>
          <span><small>Requested placement</small><strong>{p.placement}</strong></span>
        </div>
      </div>
    </section>
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

function DeferredOrderCapture({
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
  const anchorRef = useRef<HTMLElement | null>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (active) return

    const node = anchorRef.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setActive(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setActive(true)
        observer.disconnect()
      },
      { rootMargin: '600px 0px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [active])

  if (!active) {
    return (
      <section
        ref={anchorRef}
        className="order-capture order-capture-loading"
        aria-label="Custom order request"
        data-testid="order-capture-deferred"
      >
        <div>
          <p className="eyebrow">ORDER CAPTURE</p>
          <h2>Ready when you are</h2>
          <p>Order tools load as you approach this section.</p>
        </div>
      </section>
    )
  }

  return (
    <Suspense fallback={<section className="order-capture order-capture-loading" aria-label="Custom order request">Loading order tools…</section>}>
      <OrderCapture
        build={build}
        family={family}
        reference={reference}
        variant={variant}
        artwork={artwork}
        setStatus={setStatus}
      />
    </Suspense>
  )
}

export function App() {
  const [embedded] = useState(embeddedMode)
  const [build, setBuild] = useState<StudioBuildDraft>(loadInitialBuild)
  const [artwork, setArtwork] = useState<ArtworkAttachment | null>(loadSessionArtwork)
  const [status, setStatus] = useState('')
  const [viewerMode, setViewerMode] = useState<'photo' | '3d'>('photo')

  const { family, reference, variant } = useMemo(() => resolveStudio(build), [build])
  const liveCatalog = useLiveCatalogVariant(
    reference.priceStatus === 'catalog',
    reference.shopifyProductId,
    variant.id,
  )
  const effectiveVariant = useMemo<StudioVariant>(() => {
    const live = liveCatalog.variant
    if (!live || live.variantId !== variant.id) return variant

    return {
      ...variant,
      title: live.variantTitle || variant.title,
      sku: live.sku || variant.sku,
      priceMinor: live.priceMinor,
      inventoryQuantity: live.inventoryQuantity,
    }
  }, [liveCatalog.variant, variant])
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
    setViewerMode('photo')
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
          <div className="studio-title-row">
            <h1>Scorpion Leather Studio</h1>
            <span className="sls-shortmark" aria-label="SLS">SLS</span>
          </div>
          <p className="studio-subtitle">
            Start with a real Scorpion product, make it yours, and send the shop a clear build request without losing sight of the product you are customizing.
          </p>
        </div>
        <div className="header-build">
          <div className="prototype-badge">SLS · CUSTOM STUDIO</div>
          <div className="configuration-id">
            <span>BUILD</span>
            <strong>{createStudioBuildId(build)}</strong>
          </div>
        </div>
      </header>

      <ProductFamilyRail selectedId={family.id} onSelect={chooseFamily} />

      <section className="studio-grid">
        <div className={`viewer-column ${family.supports3D ? 'has-3d' : 'is-static-preview'}`}>
          {family.supports3D ? (
            <div className="preview-mode-switch" role="tablist" aria-label="Product preview mode">
              <button
                type="button"
                role="tab"
                aria-selected={viewerMode === 'photo'}
                className={viewerMode === 'photo' ? 'is-active' : ''}
                onClick={() => setViewerMode('photo')}
              >
                Photographed product
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewerMode === '3d'}
                className={viewerMode === '3d' ? 'is-active' : ''}
                onClick={() => setViewerMode('3d')}
              >
                Interactive 3D
              </button>
            </div>
          ) : null}

          {family.supports3D && viewerMode === '3d' ? (
            <Suspense fallback={<div className="viewer-panel viewer-loading">Loading interactive 3D…</div>}>
              <WeldingHoodViewer referenceId={reference.id} />
            </Suspense>
          ) : (
            <ReferenceStage family={family} reference={reference} />
          )}

          <ConceptSummary build={build} artwork={artwork} />

          <section className="viewer-build-card">
            <div>
              <span>SELECTED SCORPION PRODUCT</span>
              <h2>{reference.title}</h2>
              <p>{family.description}</p>
            </div>
            <dl>
              <div><dt>SKU</dt><dd>{effectiveVariant.sku}</dd></div>
              <div><dt>Variant</dt><dd>{effectiveVariant.title}</dd></div>
              <div>
                <dt>Base price</dt>
                <dd>{reference.priceStatus === 'quote' ? 'Quote required' : formatMoney(effectiveVariant.priceMinor)}</dd>
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
                {reference.priceStatus === 'quote' ? 'QUOTE' : formatMoney(effectiveVariant.priceMinor * build.quantity)}
              </strong>
            </div>
            <div className="catalog-freshness" data-testid="catalog-freshness">
              {reference.priceStatus === 'quote'
                ? 'Quote workflow'
                : liveCatalog.status === 'live'
                  ? `Live Shopify data · ${liveCatalog.variant?.productStatus ?? 'ACTIVE'}`
                  : liveCatalog.status === 'loading'
                    ? 'Checking live Shopify catalog…'
                    : 'Verified snapshot fallback'}
            </div>
            <div className="summary-notice">
              {reference.priceStatus === 'quote'
                ? 'This Shopify record currently carries a development/test price. The customer-facing studio does not present it as retail pricing.'
                : build.quantity > (effectiveVariant.inventoryQuantity ?? Number.POSITIVE_INFINITY)
                  ? `Requested quantity exceeds the currently listed inventory of ${effectiveVariant.inventoryQuantity}. Scorpion must confirm availability before accepting the order.`
                  : 'Current catalog base subtotal shown. Any custom tooling, text, artwork, material changes, or shop modifications require a separate quote.'}
            </div>
            <div className="summary-spec">
              <div><span>SKU</span><strong>{effectiveVariant.sku}</strong></div>
              <div><span>Qty</span><strong>{build.quantity}</strong></div>
              {reference.priceStatus === 'catalog' && effectiveVariant.inventoryQuantity !== null ? (
                <div><span>Listed stock</span><strong>{effectiveVariant.inventoryQuantity}</strong></div>
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

      <DeferredOrderCapture
        build={build}
        family={family}
        reference={reference}
        variant={effectiveVariant}
        artwork={artwork}
        setStatus={setStatus}
      />
    </main>
  )
}

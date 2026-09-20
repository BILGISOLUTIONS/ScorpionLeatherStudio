import { useEffect, useMemo, useState } from 'react'
import {
  createInitialConfiguration,
  createShareToken,
  isSelectionAllowed,
  resolveConfiguration,
  restoreConfiguration,
  restoreShareToken,
  serializeConfiguration,
  setMeasurement,
  setSelection,
  type ConfigurationState,
} from '@sls/configurator-core'
import { recommendFit, validateMeasurement } from '@sls/fitting-engine'
import { calculatePrice, formatMoney } from '@sls/pricing-engine'
import { buildMockCartLine } from '@sls/shopify-adapter'
import { ThreeProductViewer } from '@sls/three-renderer'
import type { OptionGroup, OptionValue, ValidationIssue } from '@sls/product-schema'
import { sampleManifest, sampleMaterials, sampleProduct } from './sample-product'

const STORAGE_KEY = 'scorpion-leather-studio:welding-hood-v3'

function loadInitialConfiguration(): ConfigurationState {
  const fallback = createInitialConfiguration(sampleProduct)
  if (typeof window === 'undefined') return fallback

  const token = new URL(window.location.href).searchParams.get('build')
  if (token) {
    try {
      return restoreShareToken(sampleProduct, token)
    } catch {
      // Fall through to a local saved build if the shared token is invalid.
    }
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved) return restoreConfiguration(sampleProduct, saved)
  } catch {
    // Persistence is optional and must never block the configurator.
  }

  return fallback
}

function OptionControl({
  group,
  configuration,
  onChoose,
}: {
  group: OptionGroup
  configuration: ConfigurationState
  onChoose: (groupId: string, valueId: string) => void
}) {
  return (
    <fieldset className="option-group">
      <legend>{group.label}</legend>
      <div className={`option-list ${group.values.some((value) => value.referenceImage) ? 'option-list-reference' : ''}`}>
        {group.values.map((value) => {
          const permission = isSelectionAllowed(sampleProduct, configuration, group.id, value.id)
          const selected = configuration.selections[group.id] === value.id

          return (
            <button
              type="button"
              key={value.id}
              className={`option-button ${value.referenceImage ? 'reference-option' : ''} ${selected ? 'is-selected' : ''}`}
              disabled={!permission.allowed}
              onClick={() => onChoose(group.id, value.id)}
              title={!permission.allowed ? permission.reason : value.description}
              aria-pressed={selected}
            >
              {value.referenceImage ? (
                <img src={value.referenceImage.url} alt="" loading="lazy" className="option-reference-image" />
              ) : value.swatch ? (
                <span className="swatch" style={{ background: value.swatch }} aria-hidden="true" />
              ) : null}
              <span className="option-copy">
                <strong>{value.label}</strong>
                {value.commerce?.sku ? <small>{value.commerce.sku}</small> : null}
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export function App() {
  const [configuration, setConfiguration] = useState<ConfigurationState>(loadInitialConfiguration)
  const [status, setStatus] = useState<string>('')
  const [visorOpen, setVisorOpen] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [cameraPreset, setCameraPreset] = useState(sampleProduct.asset.defaultCameraPreset)
  const [assetIssues, setAssetIssues] = useState<ValidationIssue[]>([])

  const showDevelopmentControls = useMemo(() => {
    if (typeof window === 'undefined') return false
    return new URL(window.location.href).searchParams.get('debug') === '1'
  }, [])

  const resolved = useMemo(() => resolveConfiguration(sampleProduct, configuration), [configuration])
  const price = useMemo(() => calculatePrice(sampleProduct, configuration), [configuration])

  const customerGroups = useMemo(
    () => sampleProduct.optionGroups.filter((group) => group.visibility !== 'development'),
    [],
  )
  const developmentGroups = useMemo(
    () => sampleProduct.optionGroups.filter((group) => group.visibility === 'development'),
    [],
  )

  const catalogGroup = sampleProduct.optionGroups.find((group) => group.id === 'catalogBuild')
  const selectedReference = catalogGroup?.values.find(
    (value) => value.id === configuration.selections.catalogBuild,
  )

  const developmentMeasurement = sampleProduct.measurements.find((measurement) => measurement.status === 'development')
  const developmentMeasurementValue = developmentMeasurement
    ? configuration.measurements[developmentMeasurement.id]
    : undefined
  const developmentMeasurementValidation = developmentMeasurement
    ? validateMeasurement(developmentMeasurement, developmentMeasurementValue)
    : { valid: true as const }
  const developmentFit = showDevelopmentControls
    ? recommendFit(sampleProduct, configuration)
    : undefined

  const selectedOptions = useMemo(() => customerGroups.map((group) => {
    const value = group.values.find((candidate) => candidate.id === configuration.selections[group.id])
    return {
      id: group.id,
      label: group.label,
      value: value?.label ?? configuration.selections[group.id],
      code: value?.commerce?.sku ?? value?.manufacturingCode,
    }
  }), [configuration.selections, customerGroups])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeConfiguration(configuration))
    } catch {
      // Persistence is a convenience, not a core dependency.
    }
  }, [configuration])

  const chooseOption = (groupId: string, valueId: string) => {
    try {
      setConfiguration((current) => setSelection(sampleProduct, current, groupId, valueId))
      setStatus('')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'That combination is not available.')
    }
  }

  const shareBuild = async () => {
    const token = createShareToken(configuration)
    const url = new URL(window.location.href)
    url.searchParams.set('build', token)
    window.history.replaceState({}, '', url)

    try {
      await navigator.clipboard.writeText(url.toString())
      setStatus('Build link copied. Anyone opening this URL will see this configuration.')
    } catch {
      setStatus('Build link is ready in the address bar. Copy the current URL to share it.')
    }
  }

  const resetBuild = () => {
    const fresh = createInitialConfiguration(sampleProduct)
    setConfiguration(fresh)
    setVisorOpen(false)
    setAutoRotate(false)
    setCameraPreset(sampleProduct.asset.defaultCameraPreset)

    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore unavailable storage.
    }

    const url = new URL(window.location.href)
    url.searchParams.delete('build')
    window.history.replaceState({}, '', url)
    setStatus('Build reset to the Scorpion starting configuration.')
  }

  const showCartPayload = () => {
    const payload = buildMockCartLine(sampleProduct, configuration)
    const configurationId = payload.attributes.find((item) => item.key === '_sls_configuration_id')?.value
    const sku = selectedReference?.commerce?.sku
    setStatus(`Shopify build prepared${sku ? ` for ${sku}` : ''}: ${configurationId}`)
  }

  const renderReference = (value: OptionValue | undefined) => {
    if (!value?.referenceImage) return null

    return (
      <section className="reference-card" aria-label="Photographed Scorpion reference">
        <div className="reference-image-wrap">
          <img src={value.referenceImage.url} alt={value.referenceImage.alt} />
        </div>
        <div className="reference-copy">
          <div className="reference-badges">
            <span>SHOPIFY-LINKED</span>
            <span>PHOTOGRAPHED REFERENCE</span>
          </div>
          <h3>{value.label}</h3>
          <p>{value.description}</p>
          <dl>
            <div><dt>Scorpion SKU</dt><dd>{value.commerce?.sku ?? 'Pending'}</dd></div>
            <div><dt>Store variant</dt><dd>{configuration.merchandiseId.split('/').at(-1)}</dd></div>
          </dl>
        </div>
      </section>
    )
  }

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <div>
          <p className="eyebrow">SCORPION WESTERN WEAR</p>
          <h1>Leather Studio</h1>
          <p className="studio-subtitle">
            Build from photographed Scorpion configurations now; the production digital twin will replace the development geometry without changing the commerce engine.
          </p>
        </div>
        <div className="header-build">
          <div className="prototype-badge">3D DIGITAL TWIN IN DEVELOPMENT</div>
          <div className="configuration-id" aria-label="Configuration identifier">
            <span>BUILD</span>
            <strong>{resolved.configurationId}</strong>
          </div>
        </div>
      </header>

      <section className="studio-grid">
        <div className="viewer-column">
          <div className="viewer-panel" aria-label="Interactive 3D product viewer">
            <ThreeProductViewer
              product={sampleProduct}
              manifest={sampleManifest}
              materials={sampleMaterials}
              selections={configuration.selections}
              animationStates={{ 'visor.open': visorOpen }}
              cameraPreset={cameraPreset}
              autoRotate={autoRotate}
              onAssetIssues={setAssetIssues}
            />

            <div className="view-selector" aria-label="Product views">
              {Object.entries(sampleManifest.cameraPresets).map(([key, preset]) => (
                <button
                  type="button"
                  key={key}
                  className={cameraPreset === key ? 'is-active' : ''}
                  onClick={() => {
                    setCameraPreset(key)
                    setAutoRotate(false)
                  }}
                >
                  {preset.label ?? key}
                </button>
              ))}
            </div>

            <div className="viewer-actions">
              <button
                type="button"
                className={autoRotate ? 'is-active' : ''}
                onClick={() => setAutoRotate((value) => !value)}
              >
                {autoRotate ? 'Stop spin' : 'Auto spin'}
              </button>
              <button type="button" onClick={() => setVisorOpen((open) => !open)}>
                {visorOpen ? 'Close visor' : 'Open visor'}
              </button>
            </div>

            <div className="viewer-caption">Development 3D · Drag to rotate · Scroll or pinch to zoom</div>
            <div className={`asset-status ${assetIssues.length ? 'has-issues' : ''}`}>
              {assetIssues.length
                ? `${assetIssues.length} asset contract issue${assetIssues.length === 1 ? '' : 's'}`
                : 'Asset contract validated'}
            </div>
          </div>
        </div>

        <aside className="controls-panel">
          <div className="product-heading">
            <div className="product-kicker">
              <p className="eyebrow">CONFIGURE FROM REAL CATALOG REFERENCES</p>
              <span>V0.3</span>
            </div>
            <h2>{sampleProduct.name}</h2>
            <p>
              These four starting builds are linked to actual Scorpion Shopify products and SKUs. The 3D geometry remains temporary; the photographed reference is the visual authority.
            </p>
          </div>

          {renderReference(selectedReference)}

          {customerGroups.map((group) => (
            <OptionControl
              key={group.id}
              group={group}
              configuration={configuration}
              onChoose={chooseOption}
            />
          ))}

          <section className="fit-pending">
            <div>
              <span className="eyebrow">FIT SYSTEM</span>
              <h3>Measurement rules pending physical verification</h3>
            </div>
            <p>
              We are not publishing invented size recommendations. Final measurement ranges will be enabled after the real Scorpion hood is measured and Scorpion confirms the fitting rules.
            </p>
          </section>

          {showDevelopmentControls ? (
            <section className="engineering-panel">
              <div className="section-heading">
                <span>ENGINEERING CONTROLS</span>
                <strong>?debug=1</strong>
              </div>
              {developmentGroups.map((group) => (
                <OptionControl
                  key={group.id}
                  group={group}
                  configuration={configuration}
                  onChoose={chooseOption}
                />
              ))}
              {developmentMeasurement ? (
                <fieldset className="option-group measurement-group">
                  <legend>Prototype fit input</legend>
                  <label htmlFor="head-circumference">{developmentMeasurement.label}</label>
                  <div className="measurement-row">
                    <input
                      id="head-circumference"
                      type="number"
                      inputMode="decimal"
                      min={developmentMeasurement.min}
                      max={developmentMeasurement.max}
                      step="0.01"
                      value={developmentMeasurementValue ?? ''}
                      onChange={(event) => {
                        const next = event.target.value === '' ? undefined : Number(event.target.value)
                        setConfiguration((current) => setMeasurement(sampleProduct, current, developmentMeasurement.id, next))
                        setStatus('')
                      }}
                    />
                    <span>{developmentMeasurement.unit}</span>
                  </div>
                  <p className="helper-text">{developmentMeasurement.instructions}</p>
                  {!developmentMeasurementValidation.valid && developmentMeasurementValue !== undefined ? (
                    <p className="validation">{developmentMeasurementValidation.message}</p>
                  ) : null}
                  {developmentFit ? (
                    <div className="fit-result">
                      <strong>Prototype recommendation {developmentFit.size}</strong>
                      <span>{developmentFit.message}</span>
                    </div>
                  ) : null}
                </fieldset>
              ) : null}
            </section>
          ) : null}

          <section className="build-spec" aria-label="Current build specification">
            <div className="section-heading">
              <span>BUILD SPECIFICATION</span>
              <strong>{resolved.configurationId}</strong>
            </div>
            <div className="spec-grid">
              {selectedOptions.map((option) => (
                <div className="spec-row" key={option.id}>
                  <span>{option.label}</span>
                  <div>
                    <strong>{option.value}</strong>
                    {option.code ? <small>{option.code}</small> : null}
                  </div>
                </div>
              ))}
              <div className="spec-row">
                <span>Shopify merchandise</span>
                <div><strong>{configuration.merchandiseId.split('/').at(-1)}</strong></div>
              </div>
            </div>
          </section>

          <section className="summary-panel" aria-label="Build summary">
            <div className="summary-price">
              <span>{sampleProduct.commerce.priceStatus === 'test' ? 'Catalog test price' : 'Current build'}</span>
              <strong data-testid="build-total">{formatMoney(price.total, price.currency)}</strong>
            </div>

            {sampleProduct.commerce.priceStatus === 'test' ? (
              <div className="price-warning">
                <strong>NOT APPROVED RETAIL PRICING</strong>
                <span>{sampleProduct.commerce.priceNote}</span>
              </div>
            ) : null}

            <button className="primary-action" type="button" onClick={showCartPayload}>Prepare Shopify Build</button>
            <div className="secondary-actions">
              <button type="button" onClick={shareBuild}>Share build</button>
              <button type="button" onClick={resetBuild}>Reset</button>
            </div>
            <p className="status" role="status" aria-live="polite">
              {status || 'Your selected Scorpion catalog build is automatically saved on this device.'}
            </p>
          </section>
        </aside>
      </section>
    </main>
  )
}

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
import type { ValidationIssue } from '@sls/product-schema'
import { sampleManifest, sampleMaterials, sampleProduct } from './sample-product'

const STORAGE_KEY = 'scorpion-leather-studio:welding-hood-001'

function loadInitialConfiguration(): ConfigurationState {
  const fallback = createInitialConfiguration(sampleProduct)
  if (typeof window === 'undefined') return fallback

  const token = new URL(window.location.href).searchParams.get('build')
  if (token) {
    try {
      return restoreShareToken(sampleProduct, token)
    } catch {
      // Fall through to the local saved build.
    }
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved) return restoreConfiguration(sampleProduct, saved)
  } catch {
    // Local persistence is optional; a storage failure must never block the configurator.
  }

  return fallback
}

export function App() {
  const [configuration, setConfiguration] = useState<ConfigurationState>(loadInitialConfiguration)
  const [status, setStatus] = useState<string>('')
  const [visorOpen, setVisorOpen] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [cameraPreset, setCameraPreset] = useState(sampleProduct.asset.defaultCameraPreset)
  const [assetIssues, setAssetIssues] = useState<ValidationIssue[]>([])

  const resolved = useMemo(() => resolveConfiguration(sampleProduct, configuration), [configuration])
  const price = useMemo(() => calculatePrice(sampleProduct, configuration), [configuration])
  const fit = useMemo(() => recommendFit(sampleProduct, configuration), [configuration])
  const headDefinition = sampleProduct.measurements[0]
  const headValue = configuration.measurements[headDefinition.id]
  const headValidation = validateMeasurement(headDefinition, headValue)

  const selectedOptions = useMemo(() => sampleProduct.optionGroups.map((group) => {
    const value = group.values.find((candidate) => candidate.id === configuration.selections[group.id])
    return {
      id: group.id,
      label: group.label,
      value: value?.label ?? configuration.selections[group.id],
      code: value?.manufacturingCode,
    }
  }), [configuration.selections])

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
    if (!headValidation.valid) {
      setStatus(headValidation.message ?? 'Complete the required measurements first.')
      return
    }
    const payload = buildMockCartLine(sampleProduct, configuration)
    setStatus(`Shopify-ready build prepared: ${payload.attributes.find((item) => item.key === '_sls_configuration_id')?.value}`)
  }

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <div>
          <p className="eyebrow">SCORPION WESTERN WEAR</p>
          <h1>Leather Studio</h1>
          <p className="studio-subtitle">Configure the material, hardware, fit, and construction of your Scorpion build.</p>
        </div>
        <div className="header-build">
          <div className="prototype-badge">DEVELOPMENT MODEL</div>
          <div className="configuration-id" aria-label="Configuration identifier">
            <span>BUILD</span>
            <strong>{resolved.configurationId}</strong>
          </div>
        </div>
      </header>

      <section className="studio-grid">
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

          <div className="viewer-caption">Drag to rotate · Scroll or pinch to zoom</div>
          <div className={`asset-status ${assetIssues.length ? 'has-issues' : ''}`}>
            {assetIssues.length ? `${assetIssues.length} asset contract issue${assetIssues.length === 1 ? '' : 's'}` : 'Asset contract validated'}
          </div>
        </div>

        <aside className="controls-panel">
          <div className="product-heading">
            <div className="product-kicker">
              <p className="eyebrow">BUILD YOURS</p>
              <span>V0.2</span>
            </div>
            <h2>{sampleProduct.name}</h2>
            <p>The current geometry is a development stand-in. Every control already runs through the production configuration, pricing, 3D, and Shopify data contracts.</p>
          </div>

          {sampleProduct.optionGroups.map((group) => (
            <fieldset className="option-group" key={group.id}>
              <legend>{group.label}</legend>
              <div className={`option-list ${group.type === 'swatch' ? 'option-list-swatches' : ''}`}>
                {group.values.map((value) => {
                  const permission = isSelectionAllowed(sampleProduct, configuration, group.id, value.id)
                  const selected = configuration.selections[group.id] === value.id
                  return (
                    <button
                      type="button"
                      key={value.id}
                      className={`option-button ${selected ? 'is-selected' : ''}`}
                      disabled={!permission.allowed}
                      onClick={() => chooseOption(group.id, value.id)}
                      title={!permission.allowed ? permission.reason : value.description}
                      aria-pressed={selected}
                    >
                      {value.swatch ? <span className="swatch" style={{ background: value.swatch }} aria-hidden="true" /> : null}
                      <span>{value.label}</span>
                      <small>{value.priceModifier ? `+${formatMoney(value.priceModifier)}` : 'Included'}</small>
                    </button>
                  )
                })}
              </div>
            </fieldset>
          ))}

          <fieldset className="option-group measurement-group">
            <legend>Fit</legend>
            <label htmlFor="head-circumference">{headDefinition.label}</label>
            <div className="measurement-row">
              <input
                id="head-circumference"
                type="number"
                inputMode="decimal"
                min={headDefinition.min}
                max={headDefinition.max}
                step="0.01"
                value={headValue ?? ''}
                onChange={(event) => {
                  const next = event.target.value === '' ? undefined : Number(event.target.value)
                  setConfiguration((current) => setMeasurement(sampleProduct, current, headDefinition.id, next))
                  setStatus('')
                }}
              />
              <span>{headDefinition.unit}</span>
            </div>
            <p className="helper-text">{headDefinition.instructions}</p>
            {!headValidation.valid && headValue !== undefined ? <p className="validation">{headValidation.message}</p> : null}
            {fit ? <div className="fit-result"><strong>Recommended {fit.size}</strong><span>{fit.message}</span></div> : null}
          </fieldset>

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
              {fit ? (
                <div className="spec-row">
                  <span>Recommended fit</span>
                  <div><strong>{fit.size}</strong></div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="summary-panel" aria-label="Build summary">
            <div className="summary-price">
              <span>Current build</span>
              <strong data-testid="build-total">{formatMoney(price.total, price.currency)}</strong>
            </div>
            <dl>
              <div><dt>Base</dt><dd>{formatMoney(price.basePrice, price.currency)}</dd></div>
              {price.lines.map((line) => <div key={line.id}><dt>{line.label}</dt><dd>+{formatMoney(line.amount, price.currency)}</dd></div>)}
            </dl>

            <button className="primary-action" type="button" onClick={showCartPayload}>Prepare Shopify Build</button>
            <div className="secondary-actions">
              <button type="button" onClick={shareBuild}>Share build</button>
              <button type="button" onClick={resetBuild}>Reset</button>
            </div>
            <p className="status" role="status" aria-live="polite">{status || 'Your build is automatically saved on this device.'}</p>
          </section>
        </aside>
      </section>
    </main>
  )
}

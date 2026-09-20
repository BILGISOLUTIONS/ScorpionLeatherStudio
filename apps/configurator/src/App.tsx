import { useMemo, useState } from 'react'
import {
  createInitialConfiguration,
  isSelectionAllowed,
  resolveConfiguration,
  setMeasurement,
  setSelection,
  type ConfigurationState,
} from '@sls/configurator-core'
import { recommendFit, validateMeasurement } from '@sls/fitting-engine'
import { calculatePrice, formatMoney } from '@sls/pricing-engine'
import { buildMockCartLine } from '@sls/shopify-adapter'
import { ThreeProductViewer } from '@sls/three-renderer'
import { sampleManifest, sampleMaterials, sampleProduct } from './sample-product'

export function App() {
  const [configuration, setConfiguration] = useState<ConfigurationState>(() => createInitialConfiguration(sampleProduct))
  const [status, setStatus] = useState<string>('')
  const [visorOpen, setVisorOpen] = useState(false)

  const resolved = useMemo(() => resolveConfiguration(sampleProduct, configuration), [configuration])
  const price = useMemo(() => calculatePrice(sampleProduct, configuration), [configuration])
  const fit = useMemo(() => recommendFit(sampleProduct, configuration), [configuration])
  const headDefinition = sampleProduct.measurements[0]
  const headValue = configuration.measurements[headDefinition.id]
  const headValidation = validateMeasurement(headDefinition, headValue)

  const chooseOption = (groupId: string, valueId: string) => {
    try {
      setConfiguration((current) => setSelection(sampleProduct, current, groupId, valueId))
      setStatus('')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'That combination is not available.')
    }
  }

  const showCartPayload = () => {
    if (!headValidation.valid) {
      setStatus(headValidation.message ?? 'Complete the required measurements first.')
      return
    }
    const payload = buildMockCartLine(sampleProduct, configuration)
    setStatus(`Mock Shopify payload ready: ${payload.attributes.find((item) => item.key === '_sls_configuration_id')?.value}`)
  }

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <div>
          <p className="eyebrow">SCORPION WESTERN WEAR</p>
          <h1>Leather Studio</h1>
        </div>
        <div className="configuration-id" aria-label="Configuration identifier">
          <span>BUILD</span>
          <strong>{resolved.configurationId}</strong>
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
          />
          <div className="viewer-actions">
            <button type="button" onClick={() => setVisorOpen((open) => !open)}>
              {visorOpen ? 'Close visor' : 'Open visor'}
            </button>
          </div>
          <div className="viewer-caption">Drag to rotate · Scroll or pinch to zoom</div>
        </div>

        <aside className="controls-panel">
          <div className="product-heading">
            <p className="eyebrow">CONFIGURE</p>
            <h2>{sampleProduct.name}</h2>
            <p>This is the V0.1 engine proof using a deliberately simple placeholder 3D asset.</p>
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

          <section className="summary-panel" aria-label="Build summary">
            <div className="summary-price">
              <span>Current build</span>
              <strong>{formatMoney(price.total, price.currency)}</strong>
            </div>
            <dl>
              <div><dt>Base</dt><dd>{formatMoney(price.basePrice, price.currency)}</dd></div>
              {price.lines.map((line) => <div key={line.id}><dt>{line.label}</dt><dd>+{formatMoney(line.amount, price.currency)}</dd></div>)}
            </dl>
            <button className="primary-action" type="button" onClick={showCartPayload}>Prepare Shopify Build</button>
            <p className="status" role="status" aria-live="polite">{status || 'Shopify checkout is intentionally mocked in V0.1.'}</p>
          </section>
        </aside>
      </section>
    </main>
  )
}

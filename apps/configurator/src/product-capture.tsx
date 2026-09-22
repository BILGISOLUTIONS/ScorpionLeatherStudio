import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  buildProductConstructionPacket,
  validateProductCapture,
  weldingHoodCapturePlan,
  type CapturedReferenceFrame,
  type ProductCaptureSession,
} from '@sls/product-capture'
import './product-capture.css'

const STORAGE_KEY = 'scorpion-product-capture:v1'

function localDateTimeValue() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function newSessionId() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 4).toUpperCase()
  return `SC-PROD-${stamp}-${suffix}`
}

function defaultSession(): ProductCaptureSession {
  return {
    schemaVersion: 1,
    capturePlanId: weldingHoodCapturePlan.id,
    captureSessionId: newSessionId(),
    productId: '',
    productLabel: 'Scorpion Leather Welding Hood',
    productCategory: 'Leather Welding Hood',
    sourceSku: '',
    operator: '',
    capturedAt: localDateTimeValue(),
    references: {},
    dimensions: weldingHoodCapturePlan.dimensionRequirements.map((requirement) => ({
      id: requirement.id,
      label: requirement.label,
    })),
    constructionNodes: weldingHoodCapturePlan.nodeRequirements.map((requirement) => ({
      role: requirement.role,
      label: requirement.label,
      nodeName: requirement.suggestedNodeName ?? '',
      status: 'pending',
    })),
    components: [],
    materialSlots: [],
    notes: '',
  }
}

function normalizeSession(input: Partial<ProductCaptureSession>): ProductCaptureSession {
  const fresh = defaultSession()
  if (input.capturePlanId && input.capturePlanId !== weldingHoodCapturePlan.id) return fresh

  const dimensionsById = new Map((input.dimensions ?? []).map((item) => [item.id, item]))
  const nodesByRole = new Map((input.constructionNodes ?? []).map((item) => [item.role, item]))

  return {
    ...fresh,
    ...input,
    schemaVersion: 1,
    capturePlanId: weldingHoodCapturePlan.id,
    references: input.references ?? {},
    dimensions: weldingHoodCapturePlan.dimensionRequirements.map((requirement) => ({
      id: requirement.id,
      label: requirement.label,
      ...dimensionsById.get(requirement.id),
    })),
    constructionNodes: weldingHoodCapturePlan.nodeRequirements.map((requirement) => ({
      role: requirement.role,
      label: requirement.label,
      nodeName: requirement.suggestedNodeName ?? '',
      status: 'pending' as const,
      ...nodesByRole.get(requirement.role),
    })),
    components: input.components ?? [],
    materialSlots: input.materialSlots ?? [],
  }
}

function loadSession(): ProductCaptureSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultSession()
    return normalizeSession(JSON.parse(raw) as Partial<ProductCaptureSession>)
  } catch {
    return defaultSession()
  }
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function safeFilePart(value: string, fallback: string) {
  const normalized = value.trim().replace(/[^a-z0-9-_]+/giu, '-').replace(/^-+|-+$/gu, '')
  return normalized || fallback
}

function ProductCaptureAssistant() {
  const [session, setSession] = useState<ProductCaptureSession>(loadSession)
  const [status, setStatus] = useState('Draft stored locally in this browser.')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  }, [session])

  const issues = useMemo(
    () => validateProductCapture(session, weldingHoodCapturePlan),
    [session],
  )

  const requiredReferences = weldingHoodCapturePlan.referenceRequirements.filter((requirement) => requirement.required)
  const capturedRequiredReferences = requiredReferences.filter((requirement) => Boolean(session.references[requirement.key])).length
  const requiredDimensions = weldingHoodCapturePlan.dimensionRequirements.filter((requirement) => requirement.required)
  const completeDimensions = requiredDimensions.filter((requirement) => {
    const value = session.dimensions.find((dimension) => dimension.id === requirement.id)?.valueMm
    return Number.isFinite(value) && (value ?? 0) > 0
  }).length
  const requiredNodes = weldingHoodCapturePlan.nodeRequirements.filter((requirement) => requirement.required)
  const confirmedNodes = requiredNodes.filter((requirement) => {
    const node = session.constructionNodes.find((entry) => entry.role === requirement.role)
    return node?.status === 'confirmed' && Boolean(node.nodeName.trim())
  }).length

  function setDimension(id: string, value: string) {
    const parsed = value.trim() === '' ? undefined : Number(value)
    setSession((current) => ({
      ...current,
      dimensions: current.dimensions.map((dimension) =>
        dimension.id === id
          ? { ...dimension, valueMm: Number.isFinite(parsed) ? parsed : undefined }
          : dimension,
      ),
    }))
  }

  function setReference(key: string, file: File | undefined) {
    const requirement = weldingHoodCapturePlan.referenceRequirements.find((entry) => entry.key === key)
    if (!requirement) return

    setSession((current) => {
      const references = { ...current.references }
      if (!file) {
        delete references[key]
      } else {
        const frame: CapturedReferenceFrame = {
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          lastModified: file.lastModified,
          kind: requirement.kind,
        }
        references[key] = frame
      }
      return { ...current, references }
    })
  }

  function clearSession() {
    const next = defaultSession()
    setSession(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setStatus('New product-capture session started.')
  }

  function exportConstructionPacket() {
    try {
      const packet = buildProductConstructionPacket({
        session,
        plan: weldingHoodCapturePlan,
        generatedAt: new Date().toISOString(),
      })
      const productId = safeFilePart(session.productId, 'product')
      downloadJson(`${productId}-construction-packet.json`, packet)
      setStatus('Validated construction packet downloaded. No production assets were modified.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Construction packet could not be generated.')
    }
  }

  return (
    <main className="product-capture-shell">
      <header className="product-capture-header">
        <div>
          <p className="eyebrow">SCORPION LEATHER STUDIO · V0.18</p>
          <h1>Product Capture</h1>
          <p>
            Convert a real Scorpion product into a measured, evidence-backed construction specification before any
            reconstruction or production GLB is trusted.
          </p>
        </div>
        <nav aria-label="Studio tools">
          <a href="/">Customer Studio</a>
          <a href="/capture.html">Material Capture</a>
          <a href="/materials.html">Material Lab</a>
          <a href="/material-qa.html">Material QA</a>
        </nav>
      </header>

      <p className="local-note">
        Local-first capture: selected photographs are not uploaded by this tool. Only filename/size metadata is stored
        in the browser draft and JSON export.
      </p>

      <section className="capture-metrics" aria-label="Capture readiness">
        <div><span>Session</span><strong>{session.captureSessionId}</strong></div>
        <div><span>Required views</span><strong>{capturedRequiredReferences} / {requiredReferences.length}</strong></div>
        <div><span>Dimensions</span><strong>{completeDimensions} / {requiredDimensions.length}</strong></div>
        <div><span>Semantic nodes</span><strong>{confirmedNodes} / {requiredNodes.length}</strong></div>
      </section>

      <section className="product-capture-panel">
        <div className="section-heading">
          <span>01</span>
          <div>
            <h2>Product identity & provenance</h2>
            <p>Identify the exact physical unit being captured. Do not mix photographs from different construction versions.</p>
          </div>
        </div>

        <div className="form-grid">
          <label>Product ID
            <input value={session.productId} onChange={(event) => setSession({ ...session, productId: event.target.value })} placeholder="SC-WH-001" />
          </label>
          <label>Product label
            <input value={session.productLabel} onChange={(event) => setSession({ ...session, productLabel: event.target.value })} />
          </label>
          <label>Category
            <input value={session.productCategory} onChange={(event) => setSession({ ...session, productCategory: event.target.value })} />
          </label>
          <label>Internal SKU / shop code
            <input value={session.sourceSku ?? ''} onChange={(event) => setSession({ ...session, sourceSku: event.target.value })} placeholder="Optional until confirmed" />
          </label>
          <label>Capture operator
            <input value={session.operator} onChange={(event) => setSession({ ...session, operator: event.target.value })} />
          </label>
          <label>Captured at
            <input type="datetime-local" value={session.capturedAt.slice(0, 16)} onChange={(event) => setSession({ ...session, capturedAt: event.target.value })} />
          </label>
        </div>
      </section>

      <section className="product-capture-panel">
        <div className="section-heading">
          <span>02</span>
          <div>
            <h2>Authoritative dimensions</h2>
            <p>Record direct physical measurements in millimeters. Photographs are evidence; they are not the authority for scale.</p>
          </div>
        </div>

        {(['envelope', 'visor', 'construction'] as const).map((group) => (
          <div className="dimension-group" key={group}>
            <h3>{group === 'envelope' ? 'Overall envelope' : group === 'visor' ? 'Visor & lens' : 'Construction'}</h3>
            <div className="dimension-grid">
              {weldingHoodCapturePlan.dimensionRequirements
                .filter((requirement) => requirement.group === group)
                .map((requirement) => {
                  const dimension = session.dimensions.find((entry) => entry.id === requirement.id)
                  return (
                    <label key={requirement.id}>
                      {requirement.label} <span>mm</span>
                      <input
                        aria-label={`${requirement.label} millimeters`}
                        inputMode="decimal"
                        type="number"
                        min="0"
                        step="0.1"
                        value={dimension?.valueMm ?? ''}
                        onChange={(event) => setDimension(requirement.id, event.target.value)}
                      />
                    </label>
                  )
                })}
            </div>
          </div>
        ))}
      </section>

      <section className="product-capture-panel">
        <div className="section-heading">
          <span>03</span>
          <div>
            <h2>Reference coverage</h2>
            <p>Capture the real construction from enough angles to prevent the reconstruction stage from inventing seams, hardware, shape or movement.</p>
          </div>
        </div>

        <div className="reference-list">
          {weldingHoodCapturePlan.referenceRequirements.map((requirement, index) => {
            const selected = session.references[requirement.key]
            return (
              <div className={`reference-row${selected ? ' is-captured' : ''}`} key={requirement.key}>
                <span className="reference-code">{String(index + 1).padStart(2, '0')}</span>
                <div className="reference-info">
                  <strong>{requirement.label}{requirement.required ? ' · Required' : ' · Optional'}</strong>
                  <p>{requirement.purpose}</p>
                  {selected ? <small>{selected.name} · {(selected.size / 1024 / 1024).toFixed(1)} MB</small> : null}
                </div>
                <label className="file-button">
                  <input
                    aria-label={`${requirement.label} reference file`}
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      setReference(requirement.key, event.target.files?.[0])
                      event.target.value = ''
                    }}
                  />
                  <span>{selected ? 'Replace' : 'Select photo'}</span>
                </label>
                {selected ? (
                  <button type="button" className="clear-button" onClick={() => setReference(requirement.key, undefined)}>Clear</button>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      <section className="product-capture-panel">
        <div className="section-heading">
          <span>04</span>
          <div>
            <h2>Semantic model contract</h2>
            <p>Confirm the stable names the future production asset must expose. Suggested names are conventions, not proof of real construction.</p>
          </div>
        </div>

        <div className="node-list">
          {weldingHoodCapturePlan.nodeRequirements.map((requirement) => {
            const node = session.constructionNodes.find((entry) => entry.role === requirement.role)
            if (!node) return null
            return (
              <div className={`node-row${node.status === 'confirmed' ? ' is-confirmed' : ''}`} key={requirement.role}>
                <div className="node-role">
                  <strong>{requirement.label}</strong>
                  <small>{requirement.role}</small>
                </div>
                <label>
                  Semantic node name
                  <input
                    aria-label={`${requirement.label} semantic node name`}
                    value={node.nodeName}
                    onChange={(event) => setSession((current) => ({
                      ...current,
                      constructionNodes: current.constructionNodes.map((entry) =>
                        entry.role === requirement.role ? { ...entry, nodeName: event.target.value } : entry,
                      ),
                    }))}
                  />
                </label>
                <label className="confirm-node">
                  <input
                    aria-label={`Confirm ${requirement.label}`}
                    type="checkbox"
                    checked={node.status === 'confirmed'}
                    onChange={(event) => setSession((current) => ({
                      ...current,
                      constructionNodes: current.constructionNodes.map((entry) =>
                        entry.role === requirement.role
                          ? { ...entry, status: event.target.checked ? 'confirmed' : 'pending' }
                          : entry,
                      ),
                    }))}
                  />
                  <span>Confirmed</span>
                </label>
              </div>
            )
          })}
        </div>
      </section>

      <section className="product-capture-panel">
        <div className="section-heading">
          <span>05</span>
          <div>
            <h2>Validation & export</h2>
            <p>A reconstruction-ready packet is created only when the capture plan passes. This remains a manual gate before any GLB or manifest promotion.</p>
          </div>
        </div>

        <label className="notes-field">
          Construction notes
          <textarea
            rows={5}
            value={session.notes ?? ''}
            onChange={(event) => setSession({ ...session, notes: event.target.value })}
            placeholder="Document version differences, uncertain details, repair history, sample defects or anything the modeler must not infer."
          />
        </label>

        <div className={`validation-state${issues.length === 0 ? ' is-ready' : ''}`}>
          <div>
            <strong>{issues.length === 0 ? 'Capture gate passed' : `${issues.length} validation item${issues.length === 1 ? '' : 's'} remaining`}</strong>
            <p>{issues.length === 0
              ? 'The physical-product record is ready for controlled digital-twin reconstruction.'
              : 'Complete the required evidence before treating this product as reconstruction-ready.'}</p>
          </div>
          {issues.length ? (
            <ul>
              {issues.slice(0, 8).map((entry) => <li key={entry.path + entry.message}>{entry.message}</li>)}
              {issues.length > 8 ? <li>+ {issues.length - 8} additional validation items</li> : null}
            </ul>
          ) : null}
        </div>

        <div className="export-actions">
          <button
            type="button"
            onClick={() => {
              const productId = safeFilePart(session.productId, 'product')
              downloadJson(`${productId}-capture-session.json`, session)
              setStatus('Raw product-capture session downloaded.')
            }}
          >
            Download capture session
          </button>
          <button type="button" className="primary" disabled={issues.length > 0} onClick={exportConstructionPacket}>
            Download construction packet
          </button>
          <button type="button" className="danger" onClick={clearSession}>New / clear session</button>
        </div>

        <p className="status-line" role="status">{status}</p>
      </section>
    </main>
  )
}

const root = document.getElementById('product-capture-root')
if (root) createRoot(root).render(<ProductCaptureAssistant />)

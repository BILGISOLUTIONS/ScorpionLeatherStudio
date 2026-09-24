import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { AssetManifest } from '@sls/product-schema'
import type { ProductConstructionPacket } from '@sls/product-capture'
import {
  buildProductAssetQaApproval,
  defaultProductAssetQaPolicy,
  evaluateProductAssetQa,
  productAssetReviewLabels,
  promoteProductAsset,
  type ProductAssetHumanReview,
  type ProductAssetInspection,
  type ProductAssetQaApprovalPacket,
  type ProductAssetReviewCheck,
} from '@sls/product-asset-qa'
import { scorpionMaterialDefinitions } from './scorpion-materials'
import './product-asset-qa.css'

const ProductAssetQaViewer = lazy(() => import('./ProductAssetQaViewer'))

const lifecycleById = Object.fromEntries(
  scorpionMaterialDefinitions.map((material) => [material.id, material.lifecycle]),
)

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

async function readJsonFile<T>(file: File): Promise<T> {
  return JSON.parse(await file.text()) as T
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(2)} MB`
}

function defaultChecks(): ProductAssetHumanReview['checks'] {
  return Object.fromEntries(
    (Object.keys(productAssetReviewLabels) as ProductAssetReviewCheck[]).map((key) => [key, false]),
  ) as ProductAssetHumanReview['checks']
}

function AssetQaApp() {
  const [construction, setConstruction] = useState<ProductConstructionPacket | null>(null)
  const [manifest, setManifest] = useState<AssetManifest | null>(null)
  const [modelFile, setModelFile] = useState<File | null>(null)
  const [inspection, setInspection] = useState<ProductAssetInspection | null>(null)
  const [viewerError, setViewerError] = useState('')
  const [reviewer, setReviewer] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [checks, setChecks] = useState<ProductAssetHumanReview['checks']>(defaultChecks)
  const [approval, setApproval] = useState<ProductAssetQaApprovalPacket | null>(null)
  const [status, setStatus] = useState('Load the physical construction packet, asset manifest, and candidate model.')

  const onInspection = useCallback((next: ProductAssetInspection) => {
    setInspection(next)
    setViewerError('')
    setApproval(null)
    setStatus('Model inspected locally. Review automated blockers and warnings.')
  }, [])

  const onViewerError = useCallback((message: string) => {
    setInspection(null)
    setApproval(null)
    setViewerError(message)
    setStatus('The candidate model could not be inspected.')
  }, [])

  const issues = useMemo(() => {
    if (!construction || !manifest || !inspection) return []
    return evaluateProductAssetQa({
      construction,
      manifest,
      inspection,
      materialLifecycleById: lifecycleById,
    })
  }, [construction, manifest, inspection])

  const blockers = issues.filter((entry) => entry.severity === 'error')
  const warnings = issues.filter((entry) => entry.severity === 'warning')
  const reviewComplete = Object.values(checks).every(Boolean)

  async function selectConstruction(file: File | undefined) {
    if (!file) return
    try {
      setConstruction(await readJsonFile<ProductConstructionPacket>(file))
      setApproval(null)
      setStatus('Construction provenance loaded.')
    } catch {
      setConstruction(null)
      setApproval(null)
      setStatus('Construction packet is not valid JSON.')
    }
  }

  async function selectManifest(file: File | undefined) {
    if (!file) return
    try {
      setManifest(await readJsonFile<AssetManifest>(file))
      setInspection(null)
      setApproval(null)
      setViewerError('')
      setStatus('Asset manifest loaded.')
    } catch {
      setManifest(null)
      setInspection(null)
      setApproval(null)
      setStatus('Asset manifest is not valid JSON.')
    }
  }

  function selectModel(file: File | undefined) {
    if (!file) return
    setModelFile(file)
    setInspection(null)
    setApproval(null)
    setViewerError('')
    setStatus('Candidate model selected. Local 3D inspection will begin when the manifest is available.')
  }

  function createApproval() {
    if (!construction || !manifest || !inspection) return
    try {
      const packet = buildProductAssetQaApproval({
        construction,
        manifest,
        inspection,
        materialLifecycleById: lifecycleById,
        review: {
          reviewer,
          reviewedAt: new Date().toISOString(),
          checks,
          notes: reviewNotes,
        },
      })
      setApproval(packet)
      setStatus('QA approval packet created. Production remains a separate explicit promotion step.')
    } catch (error) {
      setApproval(null)
      setStatus(error instanceof Error ? error.message : 'QA approval could not be created.')
    }
  }

  function exportPromotion(kind: 'record' | 'placement') {
    if (!construction || !manifest || !inspection || !approval) return
    try {
      const result = promoteProductAsset({
        construction,
        manifest,
        inspection,
        approval,
        promotedAt: new Date().toISOString(),
      })
      if (kind === 'record') {
        downloadJson(`${manifest.assetId}-production-asset.json`, result.record)
      } else {
        downloadJson(`${manifest.assetId}-asset-placement.json`, result.assetPlacement)
      }
      setStatus('Production promotion metadata exported. Repository assets were not modified automatically.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Production metadata could not be generated.')
    }
  }

  return (
    <main className="asset-qa-shell">
      <header className="asset-qa-header">
        <div>
          <p className="eyebrow">SCORPION LEATHER STUDIO · V0.19</p>
          <h1>Digital Twin QA</h1>
          <p>
            Validate the reconstructed product against physical capture provenance, semantic model contracts,
            production material lifecycle, geometry budgets, and explicit human review before it can be promoted.
          </p>
        </div>
        <nav aria-label="Studio tools">
          <a href="/">Customer Studio</a>
          <a href="/product-capture.html">Product Capture</a>
          <a href="/material-qa.html">Material QA</a>
          <a href="/promote.html">Material Promotion</a>
        </nav>
      </header>

      <section className="qa-principle">
        <strong>Local-first QA.</strong>
        <span>The selected model and provenance files stay in this browser. This tool generates review and placement metadata; it never silently writes production assets.</span>
      </section>

      <section className="input-grid" aria-label="Digital twin inputs">
        <label className={construction ? 'input-card is-ready' : 'input-card'}>
          <span>01 · PHYSICAL PROVENANCE</span>
          <strong>{construction?.productLabel ?? 'Construction packet'}</strong>
          <small>{construction ? construction.sourceCaptureSessionId : 'Load the validated output from Product Capture.'}</small>
          <input
            aria-label="Construction packet JSON"
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              void selectConstruction(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <em>{construction ? 'Replace JSON' : 'Select JSON'}</em>
        </label>

        <label className={manifest ? 'input-card is-ready' : 'input-card'}>
          <span>02 · RUNTIME CONTRACT</span>
          <strong>{manifest?.assetId ?? 'Asset manifest'}</strong>
          <small>{manifest ? `${manifest.rootNode} · ${Object.keys(manifest.cameraPresets ?? {}).length} cameras` : 'Load the manifest that describes nodes, slots, components and motion.'}</small>
          <input
            aria-label="Asset manifest JSON"
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              void selectManifest(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <em>{manifest ? 'Replace JSON' : 'Select JSON'}</em>
        </label>

        <label className={modelFile ? 'input-card is-ready' : 'input-card'}>
          <span>03 · CANDIDATE DIGITAL TWIN</span>
          <strong>{modelFile?.name ?? 'GLB model'}</strong>
          <small>{modelFile ? formatBytes(modelFile.size) : 'Production delivery requires GLB. Embedded glTF is accepted only for development inspection.'}</small>
          <input
            aria-label="Candidate 3D model"
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            onChange={(event) => {
              selectModel(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <em>{modelFile ? 'Replace model' : 'Select model'}</em>
        </label>
      </section>

      {modelFile && manifest ? (
        <section className="viewer-panel">
          <div className="section-heading">
            <span>04</span>
            <div>
              <h2>Local model inspection</h2>
              <p>Three.js is loaded only after a candidate model is selected. Rotate and inspect the same asset that generates the automated geometry report.</p>
            </div>
          </div>
          <Suspense fallback={<div className="viewer-loading">Loading QA renderer…</div>}>
            <ProductAssetQaViewer
              file={modelFile}
              manifest={manifest}
              onInspection={onInspection}
              onError={onViewerError}
            />
          </Suspense>
          {viewerError ? <div className="viewer-error" role="alert">{viewerError}</div> : null}
        </section>
      ) : null}

      {inspection ? (
        <>
          <section className="metrics" aria-label="Automated asset metrics">
            <div><span>Bounds</span><strong>{(inspection.boundsMeters.width * 1000).toFixed(0)} × {(inspection.boundsMeters.height * 1000).toFixed(0)} × {(inspection.boundsMeters.depth * 1000).toFixed(0)} mm</strong></div>
            <div><span>Triangles</span><strong>{formatNumber(inspection.triangleCount)}</strong></div>
            <div><span>Meshes</span><strong>{inspection.meshCount}</strong></div>
            <div><span>Materials</span><strong>{inspection.materialCount}</strong></div>
            <div><span>Textures</span><strong>{inspection.textureCount}</strong></div>
            <div><span>Largest texture</span><strong>{inspection.maxTextureEdge ? `${inspection.maxTextureEdge}px` : 'Embedded / none'}</strong></div>
          </section>

          <section className="qa-panel">
            <div className="section-heading">
              <span>05</span>
              <div>
                <h2>Automated production gate</h2>
                <p>Physical dimensions, semantic nodes, manifest references, material lifecycle and web budgets are evaluated together.</p>
              </div>
            </div>

            <div className={blockers.length ? 'gate-state has-blockers' : 'gate-state is-clear'}>
              <div>
                <strong>{blockers.length ? `${blockers.length} production blocker${blockers.length === 1 ? '' : 's'}` : 'Automated gate clear'}</strong>
                <span>{warnings.length} warning{warnings.length === 1 ? '' : 's'} · {formatBytes(inspection.modelFile.sizeBytes)} model</span>
              </div>
              <small>
                Policy: ≤ {Math.round(defaultProductAssetQaPolicy.maxModelBytes / 1024 / 1024)} MB · ≤ {formatNumber(defaultProductAssetQaPolicy.maxTriangles)} triangles · ≤ {defaultProductAssetQaPolicy.maxTextureEdge}px textures · ±{Math.round(defaultProductAssetQaPolicy.dimensionToleranceRatio * 100)}% physical envelope
              </small>
            </div>

            {issues.length ? (
              <div className="issue-list">
                {issues.map((entry, index) => (
                  <div className={`issue-row is-${entry.severity}`} key={entry.path + entry.message + index}>
                    <span>{entry.severity}</span>
                    <div><strong>{entry.path}</strong><p>{entry.message}</p></div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">No automated blockers or warnings.</p>
            )}

            <button
              type="button"
              className="secondary"
              onClick={() => downloadJson(`${inspection.assetId}-inspection.json`, inspection)}
            >
              Download inspection report
            </button>
          </section>

          <section className="qa-panel">
            <div className="section-heading">
              <span>06</span>
              <div>
                <h2>Human fidelity review</h2>
                <p>Automation cannot determine whether a seam, rivet, fold, lens, leather response or silhouette actually matches the physical product. A named reviewer must confirm it.</p>
              </div>
            </div>

            <div className="review-grid">
              {(Object.keys(productAssetReviewLabels) as ProductAssetReviewCheck[]).map((key) => (
                <label className={checks[key] ? 'review-check is-checked' : 'review-check'} key={key}>
                  <input
                    type="checkbox"
                    checked={checks[key]}
                    onChange={(event) => {
                      setChecks((current) => ({ ...current, [key]: event.target.checked }))
                      setApproval(null)
                    }}
                  />
                  <span>{productAssetReviewLabels[key]}</span>
                </label>
              ))}
            </div>

            <div className="review-fields">
              <label>
                Reviewer
                <input
                  aria-label="Asset QA reviewer"
                  value={reviewer}
                  onChange={(event) => {
                    setReviewer(event.target.value)
                    setApproval(null)
                  }}
                  placeholder="Name of the person accepting the asset"
                />
              </label>
              <label>
                QA notes
                <textarea
                  value={reviewNotes}
                  onChange={(event) => {
                    setReviewNotes(event.target.value)
                    setApproval(null)
                  }}
                  placeholder="Document known limitations, approved exceptions, device tests, or visual findings."
                />
              </label>
            </div>

            <div className="action-row">
              <button
                type="button"
                className="primary"
                disabled={blockers.length > 0 || !reviewComplete || !reviewer.trim()}
                onClick={createApproval}
              >
                Create QA approval
              </button>
              {approval ? (
                <button type="button" onClick={() => downloadJson(`${approval.assetId}-qa-approval.json`, approval)}>
                  Download QA approval
                </button>
              ) : null}
            </div>
          </section>

          <section className="qa-panel promotion-panel">
            <div className="section-heading">
              <span>07</span>
              <div>
                <h2>Controlled production promotion</h2>
                <p>Promotion generates deterministic production metadata and file placement. GitHub/asset storage remains a deliberate final operation.</p>
              </div>
            </div>

            <div className="promotion-summary">
              <div><span>Product</span><strong>{construction?.productId ?? '—'}</strong></div>
              <div><span>Asset</span><strong>{manifest?.assetId ?? '—'}</strong></div>
              <div><span>QA</span><strong>{approval ? 'Approved' : 'Not approved'}</strong></div>
              <div><span>Registry mutation</span><strong>Manual only</strong></div>
            </div>

            <div className="action-row">
              <button type="button" disabled={!approval} onClick={() => exportPromotion('record')}>Download production record</button>
              <button type="button" disabled={!approval} onClick={() => exportPromotion('placement')}>Download placement plan</button>
            </div>
          </section>
        </>
      ) : null}

      <p className="status-line" role="status">{status}</p>
    </main>
  )
}

const root = document.getElementById('product-asset-qa-root')
if (root) createRoot(root).render(<AssetQaApp />)

import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ProductConstructionPacket } from '@sls/product-capture'
import {
  buildProviderExecutionRecipe,
  parseProviderResultMetadata,
  providerResultReference,
} from './reconstruction-provider-adapters'
import { buildReconstructionPrepRecipe } from './reconstruction-prep-recipe'
import {
  loadVerifiedFieldEvidenceBundle,
  type VerifiedFieldEvidenceBundle,
} from './field-evidence-bundle'
import {
  buildDigitalTwinCandidatePacket,
  buildReconstructionJobPacket,
  buildReconstructionProcessingHandoff,
  evaluateDigitalTwinCandidate,
  getReconstructionProviderProfile,
  parseProductConstructionPacket,
  recommendedReconstructionSourceKeys,
  reconstructionProviderProfiles,
  type DigitalTwinCandidatePacket,
  type ReconstructionIntent,
  type ReconstructionJobPacket,
  type ReconstructionProviderId,
  type ReconstructionSourceFile,
} from './digital-twin-ingestion-core'
import './digital-twin-ingestion.css'

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function downloadJson(filename: string, value: unknown) {
  downloadBlob(filename, new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }))
}

function safePart(value: string, fallback: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-_]+/gu, '-').replace(/^-+|-+$/gu, '')
  return normalized || fallback
}

function shortId(prefix: string) {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  return prefix + '-' + stamp + '-' + crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB'
  return (value / 1024 / 1024).toFixed(1) + ' MB'
}

function DigitalTwinIngestionApp() {
  const [construction, setConstruction] = useState<ProductConstructionPacket | null>(null)
  const [fieldBundle, setFieldBundle] = useState<VerifiedFieldEvidenceBundle | null>(null)
  const [providerId, setProviderId] = useState<ReconstructionProviderId>('trellis2')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [preparedFiles, setPreparedFiles] = useState<Record<string, File>>({})
  const [geometryPreserved, setGeometryPreserved] = useState(false)
  const [intent, setIntent] = useState<ReconstructionIntent>('production-candidate')
  const [assetId, setAssetId] = useState('')
  const [notes, setNotes] = useState('')
  const [job, setJob] = useState<ReconstructionJobPacket | null>(null)
  const [executionBundleBusy, setExecutionBundleBusy] = useState(false)
  const [modelFile, setModelFile] = useState<File | null>(null)
  const [resultReference, setResultReference] = useState('')
  const [rights, setRights] = useState({
    sourcePhotosAuthorized: false,
    commercialUseConfirmed: false,
    exportRightsConfirmed: false,
    providerTermsReviewed: false,
  })
  const [rightsNotes, setRightsNotes] = useState('')
  const [candidate, setCandidate] = useState<DigitalTwinCandidatePacket | null>(null)
  const [status, setStatus] = useState('Load a validated Product Capture construction packet to begin.')

  const provider = getReconstructionProviderProfile(providerId)
  const references = construction?.referenceCoverage ?? []

  useEffect(() => {
    if (!construction) {
      setSelectedKeys([])
      setPreparedFiles({})
      return
    }
    const keys = recommendedReconstructionSourceKeys(construction, providerId)
    setSelectedKeys(keys)
    const bundled: Record<string, File> = {}
    if (fieldBundle && fieldBundle.construction.sourceCaptureSessionId === construction.sourceCaptureSessionId) {
      for (const key of keys) {
        const source = fieldBundle.roleSources.get(key)
        if (!source) continue
        bundled[key] = new File([source.blob], source.index.originalName, {
          type: source.index.type,
          lastModified: source.index.lastModified,
        })
      }
    }
    setPreparedFiles(bundled)
    setJob(null)
    setCandidate(null)
    setModelFile(null)
  }, [construction, providerId, fieldBundle])

  const sourceFiles = useMemo<ReconstructionSourceFile[]>(() => {
    if (!construction) return []
    const referencesByKey = new Map(construction.referenceCoverage.map((entry) => [entry.key, entry]))
    return selectedKeys.flatMap((key) => {
      const file = preparedFiles[key]
      const reference = referencesByKey.get(key)
      if (!file || !reference) return []
      const bundleSource = fieldBundle?.roleSources.get(key)
      return [{
        sourceKey: key,
        sourceLabel: key,
        captureReferenceName: reference.name,
        preparedFileName: file.name,
        sizeBytes: file.size,
        type: file.type || 'application/octet-stream',
        lastModified: file.lastModified,
        geometryPreservedConfirmed: geometryPreserved,
        captureEvidence: bundleSource ? {
          archivePath: bundleSource.index.archivePath,
          originalName: bundleSource.index.originalName,
          sha256: bundleSource.index.sha256,
          sizeBytes: bundleSource.index.sizeBytes,
          verifiedFieldBundle: true as const,
        } : undefined,
      }]
    })
  }, [construction, selectedKeys, preparedFiles, geometryPreserved, fieldBundle])

  const allSelectedFilesReady = selectedKeys.length > 0 && sourceFiles.length === selectedKeys.length
  const candidateIssues = useMemo(
    () => job && candidate ? evaluateDigitalTwinCandidate(job, candidate) : [],
    [job, candidate],
  )
  const executionRecipe = useMemo(
    () => job ? buildProviderExecutionRecipe(job) : null,
    [job],
  )
  const prepRecipe = useMemo(
    () => candidate ? buildReconstructionPrepRecipe(candidate) : null,
    [candidate],
  )

  async function loadFieldBundle(file: File | undefined) {
    if (!file) return
    setStatus('Verifying field evidence ZIP locally: CRC, SHA-256 ledger, source index and construction provenance…')
    try {
      const verified = await loadVerifiedFieldEvidenceBundle(file)
      setFieldBundle(verified)
      setConstruction(verified.construction)
      setAssetId(verified.index.assetId)
      setStatus('Verified field bundle loaded. ' + verified.verifiedFiles + ' archived files passed integrity checks; reconstruction sources are available without reattaching the field photos.')
    } catch (error) {
      setFieldBundle(null)
      setConstruction(null)
      setJob(null)
      setCandidate(null)
      setStatus(error instanceof Error ? error.message : 'Field evidence bundle could not be verified.')
    }
  }

  async function loadConstruction(file: File | undefined) {
    if (!file) return
    try {
      const parsed = parseProductConstructionPacket(JSON.parse(await file.text()))
      setFieldBundle(null)
      setConstruction(parsed)
      setAssetId(safePart(parsed.productId, 'product') + '-v1')
      setStatus('Physical construction provenance loaded. Select the reconstruction provider and prepared source views.')
    } catch (error) {
      setFieldBundle(null)
      setConstruction(null)
      setJob(null)
      setCandidate(null)
      setStatus(error instanceof Error ? error.message : 'Construction packet could not be loaded.')
    }
  }

  function toggleSource(key: string, checked: boolean) {
    if (!construction) return
    const next = checked ? [...selectedKeys, key] : selectedKeys.filter((entry) => entry !== key)
    const unique = [...new Set(next)]
    if (provider.inputMode === 'single-image' && unique.length > 1) {
      setSelectedKeys([key])
      setPreparedFiles((current) => current[key] ? { [key]: current[key] } : {})
      setStatus(provider.label + ' is configured as a single-image provider; the newest selected view replaced the previous one.')
      setJob(null)
      setCandidate(null)
      return
    }
    if (provider.maxImages && unique.length > provider.maxImages) {
      setStatus(provider.label + ' accepts at most ' + provider.maxImages + ' source views in this pipeline.')
      return
    }
    setSelectedKeys(unique)
    setJob(null)
    setCandidate(null)
  }

  function attachPreparedFile(key: string, file: File | undefined) {
    setPreparedFiles((current) => {
      const next = { ...current }
      if (file) next[key] = file
      else delete next[key]
      return next
    })
    setJob(null)
    setCandidate(null)
  }

  function restoreVerifiedBundleSource(key: string) {
    const source = fieldBundle?.roleSources.get(key)
    if (!source) return
    const file = new File([source.blob], source.index.originalName, {
      type: source.index.type,
      lastModified: source.index.lastModified,
    })
    attachPreparedFile(key, file)
    setStatus('Verified original field source restored for ' + key + '. Geometry-preserving prep attestation is still required before job creation.')
  }

  function createJob() {
    if (!construction) return
    try {
      const packet = buildReconstructionJobPacket({
        construction,
        providerId,
        sourceFiles,
        jobId: shortId('SLS-RECON'),
        assetId,
        createdAt: new Date().toISOString(),
        intent,
        operatorNotes: notes,
      })
      setJob(packet)
      setCandidate(null)
      setStatus('Reconstruction job packet created. Send only the listed prepared images to the selected external provider.')
    } catch (error) {
      setJob(null)
      setCandidate(null)
      setStatus(error instanceof Error ? error.message : 'Reconstruction job could not be created.')
    }
  }

  async function downloadExecutionBundle() {
    if (!job) return
    setExecutionBundleBusy(true)
    setStatus('Hashing and packaging the exact prepared reconstruction inputs locally…')
    try {
      const { buildReconstructionExecutionBundle } = await import('./reconstruction-execution-bundle')
      const result = await buildReconstructionExecutionBundle({
        job,
        preparedFiles,
        generatedAt: new Date().toISOString(),
      })
      downloadBlob(result.fileName, result.blob)
      setStatus('Reconstruction execution ZIP downloaded. Exact prepared source bytes, runner-ready job, provider recipe and SHA-256 ledger are frozen together.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Reconstruction execution bundle could not be created.')
    } finally {
      setExecutionBundleBusy(false)
    }
  }

  async function copyRunnerCommand() {
    if (!executionRecipe?.command) return
    try {
      await navigator.clipboard.writeText(executionRecipe.command)
      setStatus('Provider runner command copied. Credentials remain environment-only.')
    } catch {
      setStatus('Clipboard access was unavailable. Use the visible runner command instead.')
    }
  }

  async function loadProviderMetadata(file: File | undefined) {
    if (!file || !job) return
    try {
      const metadata = parseProviderResultMetadata(JSON.parse(await file.text()), job)
      setResultReference(providerResultReference(metadata))
      setCandidate(null)
      setStatus('Provider result metadata matched to this reconstruction job.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Provider result metadata could not be loaded.')
    }
  }

  async function copyPrepCommand() {
    if (!prepRecipe) return
    try {
      await navigator.clipboard.writeText(prepRecipe.command)
      setStatus('Blender reconstruction-preparation command copied.')
    } catch {
      setStatus('Clipboard access was unavailable. Use the visible preparation command instead.')
    }
  }

  function createCandidate() {
    if (!job || !modelFile) return
    try {
      const packet = buildDigitalTwinCandidatePacket({
        job,
        candidateId: shortId('SLS-CAND'),
        generatedAt: new Date().toISOString(),
        modelFile: {
          name: modelFile.name,
          sizeBytes: modelFile.size,
          type: modelFile.type || 'application/octet-stream',
        },
        resultReference,
        rights: { ...rights, notes: rightsNotes },
      })
      setCandidate(packet)
      setStatus('Raw reconstruction candidate accepted into the controlled SLS processing pipeline. It is not production-approved.')
    } catch (error) {
      setCandidate(null)
      setStatus(error instanceof Error ? error.message : 'Candidate provenance could not be created.')
    }
  }

  function downloadHandoff() {
    if (!construction || !job || !candidate) return
    try {
      const handoff = buildReconstructionProcessingHandoff({ construction, job, candidate })
      downloadJson(candidate.candidateId.toLowerCase() + '-processing-handoff.json', handoff)
      setStatus('Blender / Digital Twin QA processing handoff downloaded.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Processing handoff could not be generated.')
    }
  }

  const readyRights = Object.values(rights).every(Boolean)

  return (
    <main className="ingestion-shell">
      <header className="ingestion-header">
        <div>
          <p className="eyebrow">SCORPION LEATHER STUDIO · V0.48</p>
          <h1>Digital Twin Ingestion</h1>
          <p>
            Turn controlled product photography into a traceable reconstruction candidate, then hand it to the
            existing Blender preflight and Digital Twin QA system without allowing an AI model to become production
            truth by accident.
          </p>
        </div>
        <nav aria-label="Studio tools">
          <a href="/">Customer Studio</a>
          <a href="/product-capture.html">Product Capture</a>
          <a href="/product-asset-qa.html">Digital Twin QA</a>
          <a href="/materials.html">Material Lab</a>
        </nav>
      </header>

      <section className="authority-note">
        <strong>Authority chain</strong>
        <span>Real product + measurements → geometry-preserving photos → reconstruction candidate → cleanup / retopology → GLB QA → SLS.</span>
      </section>

      <section className="pipeline-rail" aria-label="Digital twin ingestion stages">
        {['Physical capture', 'Prepared views', 'Reconstruction', 'Candidate intake', 'Blender / QA'].map((label, index) => (
          <div key={label} className={index === 0 && construction ? 'is-ready' : index === 1 && allSelectedFilesReady ? 'is-ready' : index === 2 && job ? 'is-ready' : index === 3 && candidate ? 'is-ready' : ''}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </section>

      <section className="ingestion-panel">
        <div className="section-heading">
          <span>01</span>
          <div>
            <h2>Load verified physical provenance</h2>
            <p>Prefer the complete Product Capture field ZIP. SLS verifies the archive, integrity ledger, source index and construction lineage locally before reconstruction can begin.</p>
          </div>
        </div>
        <div className="provenance-intake-grid">
          <label className={fieldBundle ? 'drop-card is-ready bundle-intake' : 'drop-card bundle-intake'}>
            <input
              aria-label="Verified field evidence ZIP"
              type="file"
              accept=".zip,application/zip"
              onChange={(event) => {
                void loadFieldBundle(event.target.files?.[0])
                event.target.value = ''
              }}
            />
            <span>{fieldBundle ? 'VERIFIED FIELD BUNDLE LOADED' : 'PREFERRED · SELECT FIELD EVIDENCE ZIP'}</span>
            <strong>{fieldBundle?.fileName ?? 'Product Capture field-evidence.zip'}</strong>
            <small>{fieldBundle
              ? fieldBundle.verifiedFiles + ' archived files verified · ' + fieldBundle.index.totals.sourceImages + ' source images · SHA-256 ledger passed'
              : 'Verifies CRC, SHA256SUMS, source index, construction packet and capture lineage entirely in this browser.'}</small>
          </label>

          <label className={!fieldBundle && construction ? 'drop-card is-ready' : 'drop-card'}>
            <input
              aria-label="Construction packet JSON"
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                void loadConstruction(event.target.files?.[0])
                event.target.value = ''
              }}
            />
            <span>{!fieldBundle && construction ? 'LEGACY / MANUAL PROVENANCE LOADED' : 'FALLBACK · CONSTRUCTION PACKET ONLY'}</span>
            <strong>{!fieldBundle && construction ? construction.productLabel : 'Product Capture construction JSON'}</strong>
            <small>Use this only when no verified V0.45+ field ZIP exists. Source photographs must then be attached manually.</small>
          </label>
        </div>
        {fieldBundle ? (
          <section className="bundle-verification" aria-label="Verified field bundle summary">
            <div>
              <span>FIELD EVIDENCE VERIFIED</span>
              <strong>{fieldBundle.index.productLabel}</strong>
              <small>{fieldBundle.index.captureSessionId} · {fieldBundle.index.assetId}</small>
            </div>
            <div className="bundle-verification__metrics">
              <div><span>Ledger files</span><strong>{fieldBundle.verifiedFiles}</strong></div>
              <div><span>Role sources</span><strong>{fieldBundle.index.references.length}</strong></div>
              <div><span>Supplemental</span><strong>{fieldBundle.index.supplemental.length}</strong></div>
              <div><span>Quality blockers</span><strong>{fieldBundle.index.qualityPreflight?.blockerCount ?? 0}</strong></div>
            </div>
            <p>Original capture bytes remain local. Selected provider inputs start from the verified originals and may be replaced with geometry-preserving prepared derivatives without losing the upstream field-source SHA-256 identity.</p>
          </section>
        ) : null}
        {construction ? (
          <div className="provenance-grid">
            <div><span>Product</span><strong>{construction.productId}</strong></div>
            <div><span>Capture plan</span><strong>{construction.capturePlanId}</strong></div>
            <div><span>Views</span><strong>{construction.referenceCoverage.length}</strong></div>
            <div><span>Envelope</span><strong>{construction.dimensionsMm.maxWidth} × {construction.dimensionsMm.maxHeight} × {construction.dimensionsMm.maxDepth} mm</strong></div>
          </div>
        ) : null}
      </section>

      <section className="ingestion-panel">
        <div className="section-heading">
          <span>02</span>
          <div>
            <h2>Prepare reconstruction job</h2>
            <p>Choose the external reconstruction engine. Verified field sources are loaded directly from the bundle; replace them only with geometry-preserving prepared derivatives when useful.</p>
          </div>
        </div>

        <div className="job-controls">
          <label>
            Reconstruction provider
            <select
              aria-label="Reconstruction provider"
              value={providerId}
              disabled={!construction}
              onChange={(event) => setProviderId(event.target.value as ReconstructionProviderId)}
            >
              {reconstructionProviderProfiles.map((entry) => <option value={entry.id} key={entry.id}>{entry.label}</option>)}
            </select>
          </label>
          <label>
            Reconstruction intent
            <select value={intent} disabled={!construction} onChange={(event) => { setIntent(event.target.value as ReconstructionIntent); setJob(null); setCandidate(null) }}>
              <option value="draft">Draft comparison</option>
              <option value="production-candidate">Production candidate</option>
              <option value="source-master">High-detail source master</option>
            </select>
          </label>
          <label>
            Target asset ID
            <input value={assetId} disabled={!construction} onChange={(event) => { setAssetId(event.target.value); setJob(null); setCandidate(null) }} />
          </label>
        </div>

        <div className="provider-card">
          <div>
            <span>{provider.inputMode.replace('-', ' ').toUpperCase()}</span>
            <strong>{provider.label}</strong>
            <small>Recommended starting set: {provider.recommendedImageCount} image{provider.recommendedImageCount === 1 ? '' : 's'}{provider.maxImages ? ' · maximum ' + provider.maxImages : ''}</small>
          </div>
          {provider.launchUrl ? <a href={provider.launchUrl} target="_blank" rel="noreferrer">Open provider ↗</a> : <em>Manual provider</em>}
          <ul>{provider.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        </div>

        {construction ? (
          <div className="source-view-list">
            {references
              .filter((reference) => reference.kind === 'required-view')
              .map((reference) => {
                const selected = selectedKeys.includes(reference.key)
                const file = preparedFiles[reference.key]
                const bundleSource = fieldBundle?.roleSources.get(reference.key)
                const usingVerifiedOriginal = Boolean(
                  bundleSource
                  && file
                  && file.name === bundleSource.index.originalName
                  && file.size === bundleSource.index.sizeBytes
                )
                return (
                  <div className={selected ? 'source-view is-selected' : 'source-view'} key={reference.key}>
                    <label className="source-toggle">
                      <input type="checkbox" checked={selected} onChange={(event) => toggleSource(reference.key, event.target.checked)} />
                      <span>
                        <strong>{reference.key}</strong>
                        <small>Capture: {reference.name}</small>
                        {bundleSource ? <small className="verified-source">Verified source · SHA-256 {bundleSource.index.sha256.slice(0, 14)}…</small> : null}
                      </span>
                    </label>
                    {selected ? (
                      <div className="prepared-source-stack">
                        <label className={file ? 'prepared-file is-ready' : 'prepared-file'}>
                          <input
                            aria-label={reference.key + ' prepared image'}
                            type="file"
                            accept="image/*"
                            onChange={(event) => {
                              attachPreparedFile(reference.key, event.target.files?.[0])
                              event.target.value = ''
                            }}
                          />
                          <span>{file ? file.name : 'Attach prepared image'}</span>
                          <small>{file
                            ? (usingVerifiedOriginal ? 'Verified original field source · ' : 'Prepared derivative · ') + formatBytes(file.size)
                            : 'Retouched for presentation/reconstruction, not reshaped.'}</small>
                        </label>
                        {bundleSource && !usingVerifiedOriginal ? (
                          <button type="button" className="restore-source" onClick={() => restoreVerifiedBundleSource(reference.key)}>
                            Restore verified original
                          </button>
                        ) : null}
                      </div>
                    ) : <span className="not-used">Not sent to provider</span>}
                  </div>
                )
              })}
          </div>
        ) : <p className="empty-state">Load a construction packet to expose the captured source views.</p>}

        <label className="attestation">
          <input
            type="checkbox"
            checked={geometryPreserved}
            disabled={!construction}
            onChange={(event) => { setGeometryPreserved(event.target.checked); setJob(null); setCandidate(null) }}
          />
          <span>
            <strong>Geometry-preserving image prep confirmed</strong>
            <small>Background/exposure cleanup is allowed. Silhouette, seams, hardware, proportions, openings and construction were not generated, stretched, removed or redesigned.</small>
          </span>
        </label>

        <label className="notes-field">
          Operator notes
          <textarea value={notes} disabled={!construction} onChange={(event) => { setNotes(event.target.value); setJob(null); setCandidate(null) }} placeholder="Provider settings, unusual capture conditions, known limitations, or reconstruction instructions." />
        </label>

        <div className="action-row">
          <button type="button" className="primary" disabled={!construction || !allSelectedFilesReady || !geometryPreserved || !assetId.trim()} onClick={createJob}>
            Create reconstruction job
          </button>
          {job ? <button type="button" onClick={() => downloadJson(job.jobId.toLowerCase() + '.json', job)}>Download job JSON</button> : null}
        </div>

        {job ? (
          <>
            <div className="job-ready">
              <div><span>Job</span><strong>{job.jobId}</strong></div>
              <div><span>Provider</span><strong>{job.provider.label}</strong></div>
              <div><span>Inputs</span><strong>{job.sourceImages.length}</strong></div>
              <div><span>Requested output</span><strong>GLB · ≤ {job.outputRequest.targetWebTriangles.toLocaleString()} web triangles after processing</strong></div>
            </div>
            {executionRecipe ? (
              <section className={executionRecipe.automation === 'automated' ? 'execution-card is-automated' : 'execution-card'} aria-label="Provider execution recipe">
                <div className="execution-card__heading">
                  <div>
                    <span>{executionRecipe.automation === 'automated' ? 'LOCAL AUTOMATION READY' : 'MANUAL PROVIDER STEP'}</span>
                    <strong>{executionRecipe.label}</strong>
                    <small>{executionRecipe.summary}</small>
                  </div>
                  <em>{executionRecipe.credentialsStoredInJob ? 'Credential risk' : 'No credentials in job JSON'}</em>
                </div>
                {executionRecipe.installCommands.length ? (
                  <div className="execution-prereqs">
                    <span>One-time setup</span>
                    {executionRecipe.installCommands.map((command) => <code key={command}>{command}</code>)}
                  </div>
                ) : null}
                {executionRecipe.requiredEnvironment.length || executionRecipe.optionalEnvironment.length ? (
                  <div className="execution-env">
                    {executionRecipe.requiredEnvironment.map((name) => <span key={name}><b>Required env</b> {name}</span>)}
                    {executionRecipe.optionalEnvironment.map((name) => <span key={name}><b>Optional env</b> {name}</span>)}
                  </div>
                ) : null}
                {executionRecipe.command ? <pre><code>{executionRecipe.command}</code></pre> : null}
                <ul>
                  {executionRecipe.notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
                <div className="execution-bundle-note">
                  <strong>Preferred handoff</strong>
                  <span>Package this job with the exact prepared source bytes so the runner workspace cannot drift from the SLS job packet.</span>
                </div>
                <div className="action-row compact-actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={executionBundleBusy}
                    onClick={() => void downloadExecutionBundle()}
                  >
                    {executionBundleBusy ? 'Building execution ZIP…' : 'Download execution bundle (.zip)'}
                  </button>
                  <button type="button" onClick={() => downloadJson(job.jobId.toLowerCase() + '-execution.json', executionRecipe)}>Download recipe only</button>
                  {executionRecipe.command ? <button type="button" onClick={() => void copyRunnerCommand()}>Copy runner command</button> : null}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="ingestion-panel">
        <div className="section-heading">
          <span>03</span>
          <div>
            <h2>Receive reconstruction candidate</h2>
            <p>Record exactly what came back from the provider. Large/high-poly output is acceptable here because this is raw source intake, not customer delivery.</p>
          </div>
        </div>

        <div className="candidate-grid">
          <label className={modelFile ? 'drop-card compact is-ready' : 'drop-card compact'}>
            <input
              aria-label="Reconstruction candidate model"
              type="file"
              accept=".glb,.gltf,.obj,.fbx,.ply,model/gltf-binary,model/gltf+json"
              disabled={!job}
              onChange={(event) => {
                setModelFile(event.target.files?.[0] ?? null)
                setCandidate(null)
                event.target.value = ''
              }}
            />
            <span>RAW MODEL</span>
            <strong>{modelFile?.name ?? 'Select provider output'}</strong>
            <small>{modelFile ? formatBytes(modelFile.size) : 'GLB preferred; GLTF / OBJ / FBX / PLY can enter cleanup before final GLB export.'}</small>
          </label>
          <div className="provider-result-fields">
            <label>
              Provider result / task reference
              <input value={resultReference} disabled={!job} onChange={(event) => { setResultReference(event.target.value); setCandidate(null) }} placeholder="Task ID, model ID, or URL (no secret tokens)" />
            </label>
            <label className="provider-result-import">
              <input
                aria-label="Provider result metadata JSON"
                type="file"
                accept=".json,application/json"
                disabled={!job}
                onChange={(event) => {
                  void loadProviderMetadata(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
              <span>Import runner metadata JSON</span>
              <small>Matches provider + job ID before filling the result reference.</small>
            </label>
          </div>
        </div>

        <div className="rights-grid">
          {([
            ['sourcePhotosAuthorized', 'Source photos are authorized for this client/product'],
            ['commercialUseConfirmed', 'Commercial use is permitted for this generated asset'],
            ['exportRightsConfirmed', 'The provider/account grants the required export/use rights'],
            ['providerTermsReviewed', 'Provider terms / license were reviewed for this candidate'],
          ] as const).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={rights[key]}
                disabled={!job}
                onChange={(event) => {
                  setRights((current) => ({ ...current, [key]: event.target.checked }))
                  setCandidate(null)
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <label className="notes-field">
          Rights / provenance notes
          <textarea value={rightsNotes} disabled={!job} onChange={(event) => { setRightsNotes(event.target.value); setCandidate(null) }} placeholder="Plan name, license note, export limitation, attribution requirement, or other provenance information." />
        </label>

        <div className="action-row">
          <button type="button" className="primary" disabled={!job || !modelFile || !readyRights} onClick={createCandidate}>
            Accept raw candidate
          </button>
          {candidate ? <button type="button" onClick={() => downloadJson(candidate.candidateId.toLowerCase() + '.json', candidate)}>Download candidate provenance</button> : null}
        </div>

        {candidate ? (
          <>
            <div className="candidate-state">
              <strong>Raw reconstruction candidate recorded</strong>
              <span>{candidate.candidateId} · {candidate.provider.label} · {candidate.modelFile.format.toUpperCase()} · {formatBytes(candidate.modelFile.sizeBytes)}</span>
              <small>This object is explicitly <b>not</b> production authority and cannot bypass Digital Twin QA.</small>
            </div>
            {candidateIssues.filter((entry) => entry.severity === 'warning').map((entry) => (
              <div className="warning-row" key={entry.path + entry.message}><strong>{entry.path}</strong><span>{entry.message}</span></div>
            ))}
          </>
        ) : null}
      </section>

      <section className="ingestion-panel final-panel">
        <div className="section-heading">
          <span>04</span>
          <div>
            <h2>Processing & QA handoff</h2>
            <p>Translate provider output into the exact physical, semantic and web-delivery contract expected by the existing SLS production gate.</p>
          </div>
        </div>
        <div className="handoff-flow">
          <div><span>1</span><strong>Compare</strong><small>Check every side against real capture evidence.</small></div>
          <div><span>2</span><strong>Correct</strong><small>Apply real dimensions; repair hallucinated/incorrect construction.</small></div>
          <div><span>3</span><strong>Optimize</strong><small>Retopology/decimation, semantic meshes, UV0, normals, slots.</small></div>
          <div><span>4</span><strong>Export</strong><small>Final production candidate as bounded GLB.</small></div>
          <div><span>5</span><strong>QA</strong><small>Blender preflight + SLS Digital Twin QA + human review.</small></div>
        </div>
        <div className="action-row">
          <button type="button" disabled={!candidate} onClick={downloadHandoff}>Download Blender / QA handoff</button>
          <a className={candidate ? 'button-link is-ready' : 'button-link is-disabled'} href={candidate ? '/product-asset-qa.html' : undefined}>Open Digital Twin QA</a>
        </div>
        {prepRecipe ? (
          <section className="prep-card" aria-label="Raw reconstruction preparation">
            <div className="prep-card__heading">
              <div>
                <span>V0.41 · NORMALIZE BEFORE AUTHORING</span>
                <strong>Raw reconstruction preparation</strong>
                <small>Uniform physical scale, origin cleanup, bounded geometry reduction, and blocker reporting. No semantic parts or product construction are guessed.</small>
              </div>
              <em>Not production approval</em>
            </div>
            <div className="prep-files">
              <div><span>Input</span><strong>{prepRecipe.sourceModelFile}</strong></div>
              <div><span>Handoff</span><strong>{prepRecipe.handoffFile}</strong></div>
              <div><span>Normalized GLB</span><strong>{prepRecipe.normalizedModelFile}</strong></div>
              <div><span>Editable source</span><strong>{prepRecipe.blenderFile}</strong></div>
            </div>
            <pre><code>{prepRecipe.command}</code></pre>
            <ul>{prepRecipe.notes.map((note) => <li key={note}>{note}</li>)}</ul>
            <div className="action-row compact-actions">
              <button type="button" onClick={() => downloadJson(prepRecipe.assetId + '-prep-recipe.json', prepRecipe)}>Download prep recipe</button>
              <button type="button" onClick={() => void copyPrepCommand()}>Copy Blender prep command</button>
            </div>
          </section>
        ) : null}
      </section>

      <p className="status-line" role="status">{status}</p>
    </main>
  )
}

const root = document.getElementById('digital-twin-ingestion-root')
if (root) createRoot(root).render(<DigitalTwinIngestionApp />)

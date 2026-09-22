import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ScorpionMaterialDefinition } from '@sls/material-library'
import {
  promoteMaterial,
  validatePromotionChain,
  validatePromotionTiers,
  type ProcessingManifest,
  type QaApprovalPacket,
  type PromotionTierInput,
} from '@sls/material-promotion'
import './material-promotion.css'

type MapKey = 'baseColor' | 'normal' | 'roughness'
type TierEdge = 1024 | 2048

interface FileMeta {
  file: File
  width: number
  height: number
}

type TierFiles = Partial<Record<MapKey, FileMeta>>

function downloadBlob(filename: string, blob: Blob) {
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(href)
}

function downloadJson(filename: string, value: unknown) {
  downloadBlob(
    filename,
    new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }),
  )
}

async function readJson<T>(file: File): Promise<T> {
  return JSON.parse(await file.text()) as T
}

async function inspectImage(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  try {
    return { width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}

async function convertBaseColorToWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas export unavailable.')
    context.drawImage(bitmap, 0, 0)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Could not encode base color as WebP.'))
      }, 'image/webp', 0.92)
    })
  } finally {
    bitmap.close()
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function JsonInput<T>({
  label,
  value,
  filename,
  onLoad,
}: {
  label: string
  value: T | null
  filename: string
  onLoad: (value: T | null, filename: string) => void
}) {
  return (
    <label className={value ? 'json-card is-loaded' : 'json-card'}>
      <input
        type="file"
        accept="application/json,.json"
        aria-label={`${label} file`}
        onChange={async (event) => {
          const file = event.target.files?.[0]
          if (!file) return
          try {
            onLoad(await readJson<T>(file), file.name)
          } catch {
            onLoad(null, '')
          }
        }}
      />
      <strong>{label}</strong>
      <span>{value ? 'Loaded' : 'Select JSON'}</span>
      <small>{filename || 'Required provenance document'}</small>
    </label>
  )
}

function TierInput({
  edge,
  files,
  onFile,
}: {
  edge: TierEdge
  files: TierFiles
  onFile: (key: MapKey, file: File | null) => void
}) {
  return (
    <article className="tier-card">
      <div className="tier-head">
        <div>
          <span>{edge / 1024}K</span>
          <strong>{edge === 1024 ? 'Required baseline' : 'Optional desktop tier'}</strong>
        </div>
        <span className={Object.keys(files).length === 3 ? 'tier-state is-ready' : 'tier-state'}>
          {Object.keys(files).length} / 3
        </span>
      </div>

      {([
        ['baseColor', 'Base color', 'image/png,image/jpeg,image/webp'],
        ['normal', 'Normal', 'image/png'],
        ['roughness', 'Roughness', 'image/png'],
      ] as const).map(([key, label, accept]) => {
        const meta = files[key]
        return (
          <label className={meta ? 'asset-file is-loaded' : 'asset-file'} key={key}>
            <input
              type="file"
              accept={accept}
              aria-label={`${edge / 1024}K ${label} production file`}
              onChange={(event) => onFile(key, event.target.files?.[0] ?? null)}
            />
            <span>{label}</span>
            <strong>{meta?.file.name || 'Select'}</strong>
            <small>{meta ? `${meta.width}×${meta.height} · ${formatBytes(meta.file.size)}` : key === 'baseColor' ? 'PNG/JPEG/WebP · exported to WebP' : 'PNG required'}</small>
          </label>
        )
      })}
    </article>
  )
}

function MaterialPromotion() {
  const [draft, setDraft] = useState<ScorpionMaterialDefinition | null>(null)
  const [draftName, setDraftName] = useState('')
  const [processing, setProcessing] = useState<ProcessingManifest | null>(null)
  const [processingName, setProcessingName] = useState('')
  const [qa, setQa] = useState<QaApprovalPacket | null>(null)
  const [qaName, setQaName] = useState('')
  const [tier1k, setTier1k] = useState<TierFiles>({})
  const [tier2k, setTier2k] = useState<TierFiles>({})
  const [assetRoot, setAssetRoot] = useState('')
  const [status, setStatus] = useState('Load the captured-master draft, processing manifest, QA approval packet, and production map files. Nothing is uploaded.')

  const effectiveRoot = assetRoot.trim() || (draft?.id ? `/materials/${draft.id}` : '/materials/MATERIAL-ID')

  const chainIssues = useMemo(
    () => draft && processing && qa ? validatePromotionChain(draft, processing, qa) : [],
    [draft, processing, qa],
  )

  const tierInputs = useMemo<PromotionTierInput[]>(() => {
    const tiers: PromotionTierInput[] = []

    if (tier1k.baseColor && tier1k.normal && tier1k.roughness) {
      tiers.push({
        maxEdge: 1024,
        baseColor: tier1k.baseColor.file.name,
        normal: tier1k.normal.file.name,
        roughness: tier1k.roughness.file.name,
      })
    }

    if (tier2k.baseColor && tier2k.normal && tier2k.roughness) {
      tiers.push({
        maxEdge: 2048,
        baseColor: tier2k.baseColor.file.name,
        normal: tier2k.normal.file.name,
        roughness: tier2k.roughness.file.name,
      })
    }

    return tiers
  }, [tier1k, tier2k])

  const fileIssues = useMemo(() => {
    const issues: Array<{ path: string; message: string }> = []

    const inspectTier = (edge: TierEdge, files: TierFiles, required: boolean) => {
      const count = Object.keys(files).length
      if (!required && count === 0) return
      if (count !== 3) {
        issues.push({ path: `files.${edge}`, message: `${edge / 1024}K tier must include all three maps or none.` })
        return
      }

      for (const [key, meta] of Object.entries(files) as Array<[MapKey, FileMeta]>) {
        if (meta.width !== edge || meta.height !== edge) {
          issues.push({
            path: `files.${edge}.${key}`,
            message: `${key} must be exactly ${edge}×${edge}; received ${meta.width}×${meta.height}.`,
          })
        }
        if ((key === 'normal' || key === 'roughness') && meta.file.type !== 'image/png') {
          issues.push({
            path: `files.${edge}.${key}`,
            message: `${key} must remain PNG to avoid lossy map artifacts.`,
          })
        }
      }
    }

    inspectTier(1024, tier1k, true)
    inspectTier(2048, tier2k, false)

    return issues
  }, [tier1k, tier2k])

  const tierIssues = useMemo(() => validatePromotionTiers(tierInputs), [tierInputs])
  const allIssues = [...chainIssues, ...fileIssues, ...tierIssues]

  const promotion = useMemo(() => {
    if (!draft || !processing || !qa || allIssues.length) return null
    try {
      return promoteMaterial({
        draft,
        processing,
        qa,
        tiers: tierInputs,
        assetRoot: effectiveRoot,
        sourceQaPacket: qaName,
      })
    } catch {
      return null
    }
  }, [allIssues.length, draft, effectiveRoot, processing, qa, qaName, tierInputs])

  const setTierFile = async (
    edge: TierEdge,
    key: MapKey,
    file: File | null,
  ) => {
    const setter = edge === 1024 ? setTier1k : setTier2k

    if (!file) {
      setter((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
      return
    }

    try {
      const dimensions = await inspectImage(file)
      setter((current) => ({ ...current, [key]: { file, ...dimensions } }))
      setStatus(`${edge / 1024}K ${key} loaded locally.`)
    } catch {
      setStatus(`Could not decode ${file.name}.`)
    }
  }

  const downloadTierAsset = async (edge: TierEdge, key: MapKey) => {
    const files = edge === 1024 ? tier1k : tier2k
    const meta = files[key]
    if (!meta) return

    if (key === 'baseColor') {
      const webp = await convertBaseColorToWebp(meta.file)
      downloadBlob('basecolor.webp', webp)
      setStatus(`${edge / 1024}K base color normalized to production WebP.`)
      return
    }

    downloadBlob(key === 'normal' ? 'normal.png' : 'roughness.png', meta.file)
    setStatus(`${edge / 1024}K ${key} downloaded with production filename.`)
  }

  const copyDefinition = async () => {
    if (!promotion) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(promotion.material, null, 2))
      setStatus('Production material definition copied to the clipboard.')
    } catch {
      setStatus('Clipboard unavailable. Download the production definition instead.')
    }
  }

  const progress = [
    Boolean(draft && processing && qa),
    chainIssues.length === 0 && Boolean(draft && processing && qa),
    fileIssues.length === 0 && tierIssues.length === 0 && tierInputs.length > 0,
    Boolean(promotion),
  ]

  return (
    <main className="promotion-shell">
      <header className="promotion-header">
        <div>
          <p className="eyebrow">SCORPION WESTERN WEAR · CONTROLLED MATERIAL RELEASE</p>
          <h1>Material Promotion</h1>
          <p>Cross-check provenance, package approved texture tiers, and generate the final production material record without silently mutating the registry.</p>
        </div>
        <nav>
          <a href="/material-qa.html">Material QA</a>
          <a href="/materials.html">Material Lab</a>
          <a href="/">Customer Studio</a>
        </nav>
      </header>

      <div className="promotion-status" role="status">{status}</div>

      <section className="promotion-progress" aria-label="Promotion progress">
        {['Documents', 'Provenance', 'Assets', 'Release'].map((label, index) => (
          <div className={progress[index] ? 'progress-step is-complete' : 'progress-step'} key={label}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </section>

      <section className="promotion-panel">
        <div className="section-heading">
          <span>01</span>
          <div><h2>Provenance chain</h2><p>All three documents must identify the same physical material and capture session.</p></div>
        </div>
        <div className="json-grid">
          <JsonInput label="Captured-master draft" value={draft} filename={draftName} onLoad={(value, filename) => {
            setDraft(value)
            setDraftName(filename)
            if (value?.id && !assetRoot.trim()) setAssetRoot(`/materials/${value.id}`)
          }} />
          <JsonInput label="Processing manifest" value={processing} filename={processingName} onLoad={(value, filename) => {
            setProcessing(value)
            setProcessingName(filename)
          }} />
          <JsonInput label="QA approval packet" value={qa} filename={qaName} onLoad={(value, filename) => {
            setQa(value)
            setQaName(filename)
          }} />
        </div>

        {draft && processing && qa ? (
          <div className={chainIssues.length ? 'chain-result has-errors' : 'chain-result is-ready'}>
            <strong>{chainIssues.length ? `${chainIssues.length} provenance issue${chainIssues.length === 1 ? '' : 's'}` : 'Provenance chain verified'}</strong>
            <span>{draft.id} · {draft.provenance.captureSessionId || 'supplier reference'}</span>
          </div>
        ) : null}
      </section>

      <section className="promotion-panel">
        <div className="section-heading">
          <span>02</span>
          <div><h2>Production texture tiers</h2><p>1K is mandatory for efficient delivery. Add 2K only when QA proves the extra detail is useful.</p></div>
        </div>

        <div className="tier-grid">
          <TierInput edge={1024} files={tier1k} onFile={(key, file) => void setTierFile(1024, key, file)} />
          <TierInput edge={2048} files={tier2k} onFile={(key, file) => void setTierFile(2048, key, file)} />
        </div>

        <label className="asset-root-field">
          Production asset root
          <input
            value={assetRoot}
            onChange={(event) => setAssetRoot(event.target.value)}
            placeholder={draft?.id ? `/materials/${draft.id}` : '/materials/MATERIAL-ID'}
          />
          <small>Final renderer URLs are generated from this path. The source images remain local.</small>
        </label>

        {(fileIssues.length || tierIssues.length) ? (
          <div className="issue-list">
            {[...fileIssues, ...tierIssues].map((entry) => (
              <div key={entry.path + entry.message}><strong>{entry.path}</strong><span>{entry.message}</span></div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="promotion-panel">
        <div className="section-heading">
          <span>03</span>
          <div><h2>Release review</h2><p>The final definition is derived from approved QA controls and retains the full capture provenance.</p></div>
        </div>

        {allIssues.length ? (
          <div className="release-blocked">
            <strong>Promotion blocked</strong>
            <ul>
              {allIssues.map((entry) => <li key={entry.path + entry.message}><code>{entry.path}</code> {entry.message}</li>)}
            </ul>
          </div>
        ) : promotion ? (
          <>
            <div className="release-summary">
              <div><span>Material</span><strong>{promotion.material.id}</strong></div>
              <div><span>Lifecycle</span><strong>{promotion.material.lifecycle}</strong></div>
              <div><span>Preview color</span><strong>{promotion.material.previewColor}</strong></div>
              <div><span>Reviewer</span><strong>{promotion.material.approval?.reviewer}</strong></div>
              <div><span>Texture tiers</span><strong>{promotion.material.textureTiers?.map((tier) => `${tier.maxEdge / 1024}K`).join(' · ')}</strong></div>
              <div><span>Asset root</span><strong>{promotion.assetPlacement.root}</strong></div>
            </div>

            <details className="definition-preview">
              <summary>Inspect production material JSON</summary>
              <pre>{JSON.stringify(promotion.material, null, 2)}</pre>
            </details>

            <div className="production-assets">
              {[1024, 2048].map((edge) => {
                const files = edge === 1024 ? tier1k : tier2k
                if (Object.keys(files).length !== 3) return null
                return (
                  <div className="production-tier" key={edge}>
                    <strong>{edge / 1024}K production files</strong>
                    <button type="button" onClick={() => void downloadTierAsset(edge as TierEdge, 'baseColor')}>basecolor.webp</button>
                    <button type="button" onClick={() => void downloadTierAsset(edge as TierEdge, 'normal')}>normal.png</button>
                    <button type="button" onClick={() => void downloadTierAsset(edge as TierEdge, 'roughness')}>roughness.png</button>
                  </div>
                )
              })}
            </div>

            <div className="release-actions">
              <button type="button" className="primary" onClick={() => downloadJson(`${promotion.material.id}-production-material.json`, promotion.material)}>Download production definition</button>
              <button type="button" onClick={() => downloadJson(`${promotion.material.id}-asset-placement.json`, promotion.assetPlacement)}>Download asset placement manifest</button>
              <button type="button" onClick={copyDefinition}>Copy definition</button>
            </div>

            <p className="manual-gate">
              <strong>Manual registry gate preserved.</strong> This page produces the approved release package but does not write to GitHub or alter the deployed material registry.
            </p>
          </>
        ) : null}
      </section>
    </main>
  )
}

const root = document.getElementById('promotion-root')
if (root) createRoot(root).render(<MaterialPromotion />)

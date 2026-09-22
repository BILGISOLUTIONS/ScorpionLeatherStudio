import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type {
  MaterialQaLightingPreset,
  MaterialQaMapAsset,
  MaterialQaMapKey,
  MaterialQaShape,
} from './material-qa-types'
import './material-qa.css'

const MaterialQaViewer = lazy(() => import('./MaterialQaViewer'))

interface ProcessingManifest {
  materialId?: string
  label?: string
  captureSessionId?: string
  derivedPreviewColor?: string
  processor?: {
    resolution?: number
  }
  outputs?: Record<string, string>
}

interface QaChecks {
  colorMatch: boolean
  seamFree: boolean
  scaleCorrect: boolean
  normalCorrect: boolean
  roughnessMatch: boolean
  performanceAcceptable: boolean
}

const checkLabels: Array<[keyof QaChecks, string]> = [
  ['colorMatch', 'Color visually matches the physical swatch under controlled light'],
  ['seamFree', 'No unacceptable seams or repeating capture artifacts are visible'],
  ['scaleCorrect', 'Leather grain scale looks physically believable on the product'],
  ['normalCorrect', 'Normal direction/strength is correct under raking light'],
  ['roughnessMatch', 'Roughness response matches the physical finish'],
  ['performanceAcceptable', '1K/2K material remains responsive on the target device'],
]

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(href)
}

async function inspectImage(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  try {
    return { width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}

function DeferredQaViewer({
  enabled,
  maps,
  shape,
  lighting,
  repeat,
  normalScale,
  roughnessScalar,
}: {
  enabled: boolean
  maps: Partial<Record<MaterialQaMapKey, MaterialQaMapAsset>>
  shape: MaterialQaShape
  lighting: MaterialQaLightingPreset
  repeat: number
  normalScale: number
  roughnessScalar: number
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!enabled || active) return
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
      { rootMargin: '480px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [active, enabled])

  if (!enabled) {
    return (
      <div ref={anchorRef} className="qa-viewer qa-viewer-placeholder" data-testid="material-qa-viewer-deferred">
        <strong>3D inspection is sleeping</strong>
        <span>Load matching base-color, roughness, and normal maps to enable the WebGL reviewer.</span>
      </div>
    )
  }

  if (!active) {
    return (
      <div ref={anchorRef} className="qa-viewer qa-viewer-placeholder" data-testid="material-qa-viewer-deferred">
        <strong>3D inspection ready</strong>
        <span>The WebGL runtime loads only when this review surface approaches the viewport.</span>
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div className="qa-viewer qa-viewer-placeholder">
          <strong>Loading 3D inspection…</strong>
          <span>Three.js is being loaded on demand.</span>
        </div>
      }
    >
      <MaterialQaViewer
        maps={maps}
        shape={shape}
        lighting={lighting}
        repeat={repeat}
        normalScale={normalScale}
        roughnessScalar={roughnessScalar}
      />
    </Suspense>
  )
}

function MaterialQa() {
  const [manifest, setManifest] = useState<ProcessingManifest | null>(null)
  const [manifestName, setManifestName] = useState('')
  const [maps, setMaps] = useState<Partial<Record<MaterialQaMapKey, MaterialQaMapAsset>>>({})
  const [shape, setShape] = useState<MaterialQaShape>('sphere')
  const [lighting, setLighting] = useState<MaterialQaLightingPreset>('studio')
  const [repeat, setRepeat] = useState(2)
  const [normalScale, setNormalScale] = useState(1)
  const [roughnessScalar, setRoughnessScalar] = useState(1)
  const [reviewer, setReviewer] = useState('')
  const [notes, setNotes] = useState('')
  const [checks, setChecks] = useState<QaChecks>({
    colorMatch: false,
    seamFree: false,
    scaleCorrect: false,
    normalCorrect: false,
    roughnessMatch: false,
    performanceAcceptable: false,
  })
  const [status, setStatus] = useState('Load the processor manifest and its three draft maps. Files stay on this device.')
  const mapsRef = useRef(maps)
  mapsRef.current = maps

  useEffect(() => () => {
    for (const map of Object.values(mapsRef.current)) {
      if (map?.url) URL.revokeObjectURL(map.url)
    }
  }, [])

  const allMapsLoaded = Boolean(maps.baseColor && maps.roughness && maps.normal)
  const matchingDimensions = useMemo(() => {
    const assets = Object.values(maps).filter(Boolean) as MaterialQaMapAsset[]
    if (assets.length < 2) return true
    return assets.every((asset) => asset.width === assets[0].width && asset.height === assets[0].height)
  }, [maps])

  const approved = Object.values(checks).every(Boolean) && Boolean(reviewer.trim()) && allMapsLoaded && matchingDimensions

  const loadMap = async (key: MaterialQaMapKey, file: File) => {
    try {
      const dimensions = await inspectImage(file)
      const url = URL.createObjectURL(file)
      setMaps((current) => {
        if (current[key]?.url) URL.revokeObjectURL(current[key]!.url)
        return { ...current, [key]: { file, url, ...dimensions } }
      })
      setStatus(`${key} map loaded at ${dimensions.width}×${dimensions.height}.`)
    } catch {
      setStatus(`Could not decode ${file.name} as an image.`)
    }
  }

  const exportPacket = () => {
    if (!manifest?.materialId || !approved) return

    downloadJson(`${manifest.materialId}-qa-approval.json`, {
      schemaVersion: 1,
      materialId: manifest.materialId,
      label: manifest.label ?? '',
      captureSessionId: manifest.captureSessionId ?? '',
      sourceProcessingManifest: manifestName,
      reviewedAt: new Date().toISOString(),
      reviewer: reviewer.trim(),
      decision: 'approved-for-registry-promotion',
      automaticRegistryMutation: false,
      maps: Object.fromEntries(
        (['baseColor', 'roughness', 'normal'] as const).map((key) => [
          key,
          {
            file: maps[key]?.file.name ?? '',
            width: maps[key]?.width ?? null,
            height: maps[key]?.height ?? null,
          },
        ]),
      ),
      viewer: {
        repeat,
        normalScale,
        roughnessScalar,
      },
      checks,
      notes: notes.trim(),
      nextAction: 'Promote captured-master to production-approved only after applying this packet to the material registry.',
    })
    setStatus('QA approval packet downloaded. The registry has not been modified automatically.')
  }

  return (
    <main className="qa-shell">
      <header className="qa-header">
        <div>
          <p className="eyebrow">SCORPION WESTERN WEAR · MATERIAL QUALITY GATE</p>
          <h1>Material QA</h1>
          <p>Inspect processed leather maps under controlled 3D lighting before they are eligible for production use.</p>
        </div>
        <nav>
          <a href="/process.html">Material Processor</a>
          <a href="/promote.html">Material Promotion</a>
          <a href="/materials.html">Material Lab</a>
          <a href="/">Customer Studio</a>
        </nav>
      </header>

      <div className="qa-status" role="status">{status}</div>

      <section className="qa-panel setup-panel">
        <div className="section-heading">
          <span>01</span>
          <div><h2>Load review package</h2><p>Use the processing manifest and exact maps produced in the prior stage.</p></div>
        </div>

        <div className="load-grid">
          <label className={manifest ? 'load-card is-loaded' : 'load-card'}>
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Processing manifest file"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                try {
                  const parsed = JSON.parse(await file.text()) as ProcessingManifest
                  if (!parsed.materialId) throw new Error('Processing manifest is missing materialId.')
                  setManifest(parsed)
                  setManifestName(file.name)
                  setStatus(`Loaded processing manifest for ${parsed.materialId}.`)
                } catch (error) {
                  setManifest(null)
                  setManifestName('')
                  setStatus(error instanceof Error ? error.message : 'Could not read processing manifest.')
                }
              }}
            />
            <strong>Processing manifest</strong>
            <span>{manifest ? `${manifest.materialId} · ${manifest.label || 'Unnamed'}` : 'Select JSON'}</span>
            <small>{manifestName || 'Links this QA session to processing provenance.'}</small>
          </label>

          {([
            ['baseColor', 'Base color'],
            ['roughness', 'Roughness'],
            ['normal', 'Normal'],
          ] as const).map(([key, label]) => (
            <label className={maps[key] ? 'load-card is-loaded' : 'load-card'} key={key}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label={`${label} map file`}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void loadMap(key, file)
                }}
              />
              <strong>{label} map</strong>
              <span>{maps[key]?.file.name || 'Select image'}</span>
              <small>{maps[key] ? `${maps[key]!.width} × ${maps[key]!.height}` : 'Required for approval'}</small>
            </label>
          ))}
        </div>

        {!matchingDimensions ? <p className="dimension-error">Map dimensions do not match. Re-export the maps from one processing resolution.</p> : null}
      </section>

      <section className="qa-panel viewer-panel">
        <div className="section-heading">
          <span>02</span>
          <div><h2>Controlled 3D inspection</h2><p>Rotate the swatch and cycle raking-light directions to expose bad normals, roughness, and tile scale.</p></div>
        </div>

        <div className="viewer-layout">
          <DeferredQaViewer
            enabled={allMapsLoaded && matchingDimensions}
            maps={maps}
            shape={shape}
            lighting={lighting}
            repeat={repeat}
            normalScale={normalScale}
            roughnessScalar={roughnessScalar}
          />

          <aside className="viewer-controls">
            <label>Test shape
              <select value={shape} onChange={(event) => setShape(event.target.value as MaterialQaShape)}>
                <option value="sphere">Sphere</option>
                <option value="cylinder">Cylinder</option>
                <option value="flat">Flat swatch</option>
              </select>
            </label>
            <label>Lighting
              <select value={lighting} onChange={(event) => setLighting(event.target.value as MaterialQaLightingPreset)}>
                <option value="studio">Studio</option>
                <option value="raking-left">Raking left</option>
                <option value="raking-right">Raking right</option>
                <option value="top">Top light</option>
              </select>
            </label>
            <label className="range-field"><span>Texture repeat <output>{repeat.toFixed(1)}×</output></span><input type="range" min="0.5" max="8" step="0.25" value={repeat} onChange={(event) => setRepeat(Number(event.target.value))} /></label>
            <label className="range-field"><span>Normal scale <output>{normalScale.toFixed(2)}</output></span><input type="range" min="0" max="2.5" step="0.05" value={normalScale} onChange={(event) => setNormalScale(Number(event.target.value))} /></label>
            <label className="range-field"><span>Roughness scalar <output>{roughnessScalar.toFixed(2)}</output></span><input type="range" min="0.35" max="1" step="0.05" value={roughnessScalar} onChange={(event) => setRoughnessScalar(Number(event.target.value))} /></label>

            <div className="map-facts">
              <span>Material</span><strong>{manifest?.materialId || 'Not loaded'}</strong>
              <span>Processor tier</span><strong>{manifest?.processor?.resolution ? `${manifest.processor.resolution / 1024}K` : '—'}</strong>
              <span>Maps loaded</span><strong>{Object.keys(maps).length} / 3</strong>
            </div>
          </aside>
        </div>
      </section>

      <section className="qa-panel">
        <div className="section-heading">
          <span>03</span>
          <div><h2>Physical-swatch approval gate</h2><p>Every item must be checked by a person comparing the render to the physical material.</p></div>
        </div>

        <div className="checklist">
          {checkLabels.map(([key, label]) => (
            <label key={key} className={checks[key] ? 'qa-check is-checked' : 'qa-check'}>
              <input
                type="checkbox"
                checked={checks[key]}
                onChange={(event) => setChecks({ ...checks, [key]: event.target.checked })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <div className="review-fields">
          <label>Reviewer *<input value={reviewer} onChange={(event) => setReviewer(event.target.value)} /></label>
          <label>QA notes<textarea rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Lighting observations, physical comparison, acceptable deviations, retouching notes…" /></label>
        </div>

        <div className={approved ? 'approval-state is-ready' : 'approval-state'}>
          <div>
            <strong>{approved ? 'Eligible for registry promotion' : 'Approval incomplete'}</strong>
            <p>{approved ? 'This QA session can produce an approval packet. The registry still requires a separate explicit promotion step.' : 'Load all matching maps, enter the reviewer, and complete every physical comparison check.'}</p>
          </div>
          <button type="button" disabled={!approved || !manifest?.materialId} onClick={exportPacket}>Export QA approval packet</button>
        </div>
      </section>
    </main>
  )
}

const root = document.getElementById('material-qa-root')
if (root) createRoot(root).render(<MaterialQa />)

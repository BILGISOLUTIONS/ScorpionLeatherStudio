import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { MaterialAvailability, ScorpionMaterialDefinition } from '@sls/material-library'
import './field-capture.css'

const STORAGE_KEY = 'scorpion-material-capture:v1'

type MaterialKind = ScorpionMaterialDefinition['kind']
type FrameKey =
  | 'identification'
  | 'crossPolarized'
  | 'parallel'
  | 'north'
  | 'east'
  | 'south'
  | 'west'
  | 'macro'
  | 'edge'

interface FrameRecord {
  name: string
  size: number
  type: string
  lastModified: number
}

interface CaptureDraft {
  schemaVersion: 1
  captureSessionId: string
  client: string
  materialId: string
  label: string
  kind: MaterialKind
  previewColor: string
  operator: string
  capturedAt: string
  availability: MaterialAvailability
  physical: {
    materialType: string
    hide: string
    grain: string
    finish: string
    thicknessMm: string
    supplier: string
    supplierItem: string
  }
  capture: {
    camera: string
    lensOrPhoneCamera: string
    whiteBalanceKelvin: string
    colorTarget: string
    scaleReference: boolean
    sampleWidthMm: string
    sampleHeightMm: string
  }
  frames: Partial<Record<FrameKey, FrameRecord>>
  notes: string
}

const frameDefinitions: Array<{ key: FrameKey; code: string; label: string; purpose: string }> = [
  { key: 'identification', code: '00', label: 'Identification', purpose: 'Material ID, ruler/scale and color target in frame.' },
  { key: 'crossPolarized', code: '01', label: 'Cross-polarized', purpose: 'Diffuse/base-color source with surface glare suppressed.' },
  { key: 'parallel', code: '02', label: 'Parallel / reflective', purpose: 'Surface reflection reference for roughness/specular analysis.' },
  { key: 'north', code: '03', label: 'Directional north', purpose: 'Directional-light surface response.' },
  { key: 'east', code: '04', label: 'Directional east', purpose: 'Directional-light surface response.' },
  { key: 'south', code: '05', label: 'Directional south', purpose: 'Directional-light surface response.' },
  { key: 'west', code: '06', label: 'Directional west', purpose: 'Directional-light surface response.' },
  { key: 'macro', code: '07', label: 'Macro grain', purpose: 'Close-up pores, nap, scars and fine surface grain.' },
  { key: 'edge', code: '08', label: 'Edge / thickness', purpose: 'Thickness, fibers, backing and edge finish.' },
]

function localDateTimeValue() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function newSessionId() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 4).toUpperCase()
  return `SC-${stamp}-${suffix}`
}

function defaultDraft(): CaptureDraft {
  return {
    schemaVersion: 1,
    captureSessionId: newSessionId(),
    client: 'Scorpion Western Wear',
    materialId: '',
    label: '',
    kind: 'leather',
    previewColor: '#808080',
    operator: '',
    capturedAt: localDateTimeValue(),
    availability: 'unverified',
    physical: {
      materialType: 'Leather',
      hide: '',
      grain: '',
      finish: '',
      thicknessMm: '',
      supplier: '',
      supplierItem: '',
    },
    capture: {
      camera: '',
      lensOrPhoneCamera: '',
      whiteBalanceKelvin: '5600',
      colorTarget: '',
      scaleReference: true,
      sampleWidthMm: '152.4',
      sampleHeightMm: '152.4',
    },
    frames: {},
    notes: '',
  }
}

function loadDraft(): CaptureDraft {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultDraft()
    const parsed = JSON.parse(raw) as Partial<CaptureDraft>
    return {
      ...defaultDraft(),
      ...parsed,
      physical: { ...defaultDraft().physical, ...(parsed.physical ?? {}) },
      capture: { ...defaultDraft().capture, ...(parsed.capture ?? {}) },
      frames: parsed.frames ?? {},
    }
  } catch {
    return defaultDraft()
  }
}

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

function numericOrNull(value: string): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function captureManifest(draft: CaptureDraft) {
  const directionalComplete = ['north', 'east', 'south', 'west'].every((key) => draft.frames[key as FrameKey]?.name)

  return {
    schemaVersion: 1,
    captureSessionId: draft.captureSessionId,
    client: draft.client,
    materialId: draft.materialId.trim(),
    label: draft.label.trim(),
    operator: draft.operator.trim(),
    capturedAt: draft.capturedAt ? new Date(draft.capturedAt).toISOString() : '',
    physical: {
      materialType: draft.physical.materialType.trim(),
      hide: draft.physical.hide.trim(),
      grain: draft.physical.grain.trim(),
      finish: draft.physical.finish.trim(),
      thicknessMm: numericOrNull(draft.physical.thicknessMm),
      supplier: draft.physical.supplier.trim(),
      supplierItem: draft.physical.supplierItem.trim(),
    },
    availability: draft.availability,
    capture: {
      camera: draft.capture.camera.trim(),
      lensOrPhoneCamera: draft.capture.lensOrPhoneCamera.trim(),
      whiteBalanceKelvin: numericOrNull(draft.capture.whiteBalanceKelvin),
      colorTarget: draft.capture.colorTarget.trim(),
      crossPolarized: Boolean(draft.frames.crossPolarized?.name),
      directionalLighting: directionalComplete,
      scaleReference: draft.capture.scaleReference,
      sampleWidthMm: numericOrNull(draft.capture.sampleWidthMm),
      sampleHeightMm: numericOrNull(draft.capture.sampleHeightMm),
    },
    frames: Object.fromEntries(
      frameDefinitions.map(({ key, code, label }) => [
        key,
        {
          expectedPrefix: code,
          label,
          file: draft.frames[key]?.name ?? '',
          size: draft.frames[key]?.size ?? null,
          type: draft.frames[key]?.type ?? '',
        },
      ]),
    ),
    notes: draft.notes.trim(),
  }
}

function rendererDraft(kind: MaterialKind) {
  if (kind === 'metal') return { roughness: 0.35, metalness: 0.9 }
  if (kind === 'glass') return { roughness: 0.12, metalness: 0, opacity: 0.5, transmission: 0.3 }
  return { roughness: 0.8, metalness: 0 }
}

function materialDraft(draft: CaptureDraft): ScorpionMaterialDefinition & { reviewRequired: string[] } {
  const manifest = captureManifest(draft)
  return {
    schemaVersion: 1,
    id: draft.materialId.trim(),
    label: draft.label.trim(),
    kind: draft.kind,
    lifecycle: 'captured-master',
    availability: draft.availability,
    previewColor: draft.previewColor,
    physical: {
      materialType: manifest.physical.materialType || undefined,
      hide: manifest.physical.hide || undefined,
      grain: manifest.physical.grain || undefined,
      finish: manifest.physical.finish || undefined,
      thicknessMm: manifest.physical.thicknessMm ?? undefined,
      supplier: manifest.physical.supplier || undefined,
      supplierItem: manifest.physical.supplierItem || undefined,
    },
    provenance: {
      source: 'field-capture',
      captureSessionId: draft.captureSessionId,
      capturedAt: manifest.capturedAt || undefined,
      operator: manifest.operator || undefined,
      colorTarget: manifest.capture.colorTarget || undefined,
      crossPolarized: manifest.capture.crossPolarized,
      directionalLighting: manifest.capture.directionalLighting,
      scaleReference: manifest.capture.scaleReference,
      notes: 'Captured-master draft generated by the field assistant. PBR maps and renderer scalars still require processing and visual QA.',
    },
    renderer: rendererDraft(draft.kind),
    reviewRequired: [
      'Confirm calibrated previewColor from the processed base-color map.',
      'Tune renderer roughness/metalness/sheen against the physical sample.',
      'Create and attach 1K/2K PBR texture tiers.',
      'Run material QA before changing lifecycle to production-approved.',
    ],
  }
}

function FieldCaptureAssistant() {
  const [draft, setDraft] = useState<CaptureDraft>(loadDraft)
  const [status, setStatus] = useState('Session metadata is saved locally in this browser. Image contents are never uploaded by this page.')

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
    } catch {
      // Local persistence is optional.
    }
  }, [draft])

  const capturedCount = useMemo(
    () => frameDefinitions.filter(({ key }) => Boolean(draft.frames[key]?.name)).length,
    [draft.frames],
  )

  const manifestReady = Boolean(
    draft.materialId.trim() &&
    draft.label.trim() &&
    draft.operator.trim() &&
    draft.capturedAt &&
    capturedCount === frameDefinitions.length,
  )

  const updatePhysical = (key: keyof CaptureDraft['physical'], value: string) => {
    setDraft((current) => ({ ...current, physical: { ...current.physical, [key]: value } }))
  }

  const updateCapture = (key: keyof CaptureDraft['capture'], value: string | boolean) => {
    setDraft((current) => ({ ...current, capture: { ...current.capture, [key]: value } }))
  }

  const clearSession = () => {
    const next = defaultDraft()
    setDraft(next)
    localStorage.removeItem(STORAGE_KEY)
    setStatus('Started a new capture session.')
  }

  const copyMaterialDraft = async () => {
    if (!draft.materialId.trim() || !draft.label.trim()) {
      setStatus('Enter a material ID and label before creating the registry draft.')
      return
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(materialDraft(draft), null, 2))
      setStatus('Captured-master registry draft copied to the clipboard.')
    } catch {
      setStatus('Clipboard access was unavailable. Use Download registry draft instead.')
    }
  }

  return (
    <main className="capture-shell">
      <header className="capture-header">
        <div>
          <p className="eyebrow">SCORPION WESTERN WEAR · FIELD MATERIAL ACQUISITION</p>
          <h1>Field Capture Assistant</h1>
          <p>Standardize leather/material capture at the shop so every swatch enters the same digital-material pipeline.</p>
        </div>
        <nav>
          <a href="/process.html">Material Processor</a>
          <a href="/materials.html">Material Lab</a>
          <a href="/">Customer Studio</a>
        </nav>
      </header>

      <div className="privacy-note" role="status">{status}</div>

      <section className="capture-progress" aria-label="Capture progress">
        <div>
          <span>Session</span>
          <strong>{draft.captureSessionId}</strong>
        </div>
        <div>
          <span>Frames</span>
          <strong>{capturedCount} / {frameDefinitions.length}</strong>
        </div>
        <div>
          <span>Manifest</span>
          <strong>{manifestReady ? 'Ready' : 'Incomplete'}</strong>
        </div>
      </section>

      <section className="capture-panel">
        <div className="section-heading">
          <span>01</span>
          <div><h2>Material identity</h2><p>Record what is known. Leave supplier/spec fields blank rather than guessing.</p></div>
        </div>

        <div className="form-grid">
          <label>Session ID<input value={draft.captureSessionId} onChange={(e) => setDraft({ ...draft, captureSessionId: e.target.value })} /></label>
          <label>Client<input value={draft.client} onChange={(e) => setDraft({ ...draft, client: e.target.value })} /></label>
          <label>Material ID *<input value={draft.materialId} onChange={(e) => setDraft({ ...draft, materialId: e.target.value.toUpperCase() })} placeholder="SCL-005" /></label>
          <label>Material label *<input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Saddle Brown Full Grain" /></label>
          <label>Kind<select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as MaterialKind })}><option value="leather">Leather</option><option value="metal">Metal</option><option value="glass">Glass</option><option value="generic">Generic</option></select></label>
          <label>Availability<select value={draft.availability} onChange={(e) => setDraft({ ...draft, availability: e.target.value as MaterialAvailability })}><option value="unverified">Unverified</option><option value="quote">Quote</option><option value="confirmed">Confirmed</option></select></label>
          <label>Preview color<input type="color" value={draft.previewColor} onChange={(e) => setDraft({ ...draft, previewColor: e.target.value })} /></label>
          <label>Operator *<input value={draft.operator} onChange={(e) => setDraft({ ...draft, operator: e.target.value })} /></label>
          <label>Captured at *<input type="datetime-local" value={draft.capturedAt} onChange={(e) => setDraft({ ...draft, capturedAt: e.target.value })} /></label>
        </div>

        <div className="form-grid physical-grid">
          <label>Material type<input value={draft.physical.materialType} onChange={(e) => updatePhysical('materialType', e.target.value)} placeholder="Cowhide" /></label>
          <label>Hide<input value={draft.physical.hide} onChange={(e) => updatePhysical('hide', e.target.value)} placeholder="Cowhide" /></label>
          <label>Grain<input value={draft.physical.grain} onChange={(e) => updatePhysical('grain', e.target.value)} placeholder="Full grain / textured / smooth" /></label>
          <label>Finish<input value={draft.physical.finish} onChange={(e) => updatePhysical('finish', e.target.value)} placeholder="Matte / waxed / roughout" /></label>
          <label>Thickness (mm)<input inputMode="decimal" value={draft.physical.thicknessMm} onChange={(e) => updatePhysical('thicknessMm', e.target.value)} /></label>
          <label>Supplier<input value={draft.physical.supplier} onChange={(e) => updatePhysical('supplier', e.target.value)} /></label>
          <label>Supplier item<input value={draft.physical.supplierItem} onChange={(e) => updatePhysical('supplierItem', e.target.value)} /></label>
        </div>
      </section>

      <section className="capture-panel">
        <div className="section-heading">
          <span>02</span>
          <div><h2>Capture rig</h2><p>Keep these settings fixed through a comparable swatch set.</p></div>
        </div>

        <div className="form-grid">
          <label>Camera / phone<input value={draft.capture.camera} onChange={(e) => updateCapture('camera', e.target.value)} placeholder="iPhone 16 Pro / Sony A6700" /></label>
          <label>Lens / camera module<input value={draft.capture.lensOrPhoneCamera} onChange={(e) => updateCapture('lensOrPhoneCamera', e.target.value)} placeholder="Main 1x / 50 mm macro" /></label>
          <label>White balance (K)<input inputMode="numeric" value={draft.capture.whiteBalanceKelvin} onChange={(e) => updateCapture('whiteBalanceKelvin', e.target.value)} /></label>
          <label>Color target<input value={draft.capture.colorTarget} onChange={(e) => updateCapture('colorTarget', e.target.value)} placeholder="Calibrite ColorChecker Passport" /></label>
          <label>Sample width (mm)<input inputMode="decimal" value={draft.capture.sampleWidthMm} onChange={(e) => updateCapture('sampleWidthMm', e.target.value)} /></label>
          <label>Sample height (mm)<input inputMode="decimal" value={draft.capture.sampleHeightMm} onChange={(e) => updateCapture('sampleHeightMm', e.target.value)} /></label>
          <label className="checkbox-field"><input type="checkbox" checked={draft.capture.scaleReference} onChange={(e) => updateCapture('scaleReference', e.target.checked)} /><span>Scale/ruler included in identification frame</span></label>
        </div>
      </section>

      <section className="capture-panel">
        <div className="section-heading">
          <span>03</span>
          <div><h2>Capture sequence</h2><p>Select the image/RAW file after each shot. The assistant records filenames and metadata only; file contents stay on your device.</p></div>
        </div>

        <div className="frame-list">
          {frameDefinitions.map((frame) => {
            const selected = draft.frames[frame.key]
            return (
              <div className={`frame-row ${selected ? 'is-captured' : ''}`} key={frame.key}>
                <div className="frame-code">{frame.code}</div>
                <div className="frame-info"><strong>{frame.label}</strong><p>{frame.purpose}</p>{selected ? <small>{selected.name} · {Math.max(1, Math.round(selected.size / 1024))} KB</small> : null}</div>
                <label className="file-button">
                  <input
                    type="file"
                    accept="image/*,.dng,.cr2,.cr3,.nef,.arw,.raf,.rw2"
                    aria-label={`${frame.label} file`}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (!file) return
                      setDraft((current) => ({
                        ...current,
                        frames: {
                          ...current.frames,
                          [frame.key]: {
                            name: file.name,
                            size: file.size,
                            type: file.type,
                            lastModified: file.lastModified,
                          },
                        },
                      }))
                      setStatus(`${frame.label} recorded as ${file.name}.`)
                      event.target.value = ''
                    }}
                  />
                  <span>{selected ? 'Replace' : 'Select file'}</span>
                </label>
                {selected ? <button type="button" className="remove-frame" onClick={() => setDraft((current) => {
                  const frames = { ...current.frames }
                  delete frames[frame.key]
                  return { ...current, frames }
                })}>Clear</button> : null}
              </div>
            )
          })}
        </div>
      </section>

      <section className="capture-panel">
        <div className="section-heading">
          <span>04</span>
          <div><h2>Session notes & export</h2><p>Record setup changes, sample defects, uncertain supplier details or anything the processing stage should know.</p></div>
        </div>

        <label className="notes-field">Notes<textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={5} /></label>

        <div className="export-actions">
          <button
            type="button"
            className="primary"
            disabled={!draft.materialId.trim() || !draft.label.trim()}
            onClick={() => {
              downloadJson(`${draft.captureSessionId}-${draft.materialId || 'material'}-capture.json`, captureManifest(draft))
              setStatus('Capture manifest downloaded.')
            }}
          >
            Download capture manifest
          </button>
          <button
            type="button"
            disabled={!draft.materialId.trim() || !draft.label.trim()}
            onClick={() => {
              downloadJson(`${draft.materialId || 'material'}-registry-draft.json`, materialDraft(draft))
              setStatus('Captured-master registry draft downloaded.')
            }}
          >
            Download registry draft
          </button>
          <button type="button" disabled={!draft.materialId.trim() || !draft.label.trim()} onClick={copyMaterialDraft}>Copy registry draft</button>
          <button type="button" className="danger" onClick={clearSession}>New / clear session</button>
        </div>

        {!manifestReady ? (
          <p className="readiness-note">
            A complete field set requires material ID, label, operator, timestamp, and all {frameDefinitions.length} capture frames.
          </p>
        ) : (
          <p className="readiness-note is-ready">Capture manifest is complete. Processing/PBR QA is still required before production approval.</p>
        )}
      </section>
    </main>
  )
}

const root = document.getElementById('capture-root')
if (root) createRoot(root).render(<FieldCaptureAssistant />)

import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { PixelImage } from '@sls/material-processor'
import './material-processor.css'

type FrameKey = 'crossPolarized' | 'parallel' | 'north' | 'east' | 'south' | 'west'
type OutputMapKey = 'baseColor' | 'roughness' | 'normal'

interface CaptureManifest {
  captureSessionId?: string
  client?: string
  materialId?: string
  label?: string
  capturedAt?: string
  physical?: Record<string, unknown>
  capture?: Record<string, unknown>
  frames?: Record<string, { file?: string }>
}

interface ProcessingOptions {
  resolution: 1024 | 2048
  exposure: number
  redGain: number
  greenGain: number
  blueGain: number
  normalStrength: number
  baseRoughness: number
  responseGain: number
}

interface ProcessedMap {
  image: PixelImage
  url: string
}

interface WorkerComplete {
  type: 'complete'
  jobId: string
  maps: Record<OutputMapKey, PixelImage>
  previewColor: string
}

interface WorkerFailure {
  type: 'error'
  jobId: string
  message: string
}

const requiredFrames: Array<{ key: FrameKey; label: string; description: string }> = [
  { key: 'crossPolarized', label: 'Cross-polarized', description: 'Diffuse/base-color working export.' },
  { key: 'parallel', label: 'Parallel / reflective', description: 'Reflection-response working export.' },
  { key: 'north', label: 'Directional north', description: 'North-lit directional working export.' },
  { key: 'east', label: 'Directional east', description: 'East-lit directional working export.' },
  { key: 'south', label: 'Directional south', description: 'South-lit directional working export.' },
  { key: 'west', label: 'Directional west', description: 'West-lit directional working export.' },
]

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

async function decodeWorkingImage(file: File, resolution: number): Promise<PixelImage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(`Could not decode ${file.name}. Export RAW captures to PNG, JPEG, or WebP before processing.`)
  }

  try {
    const sourceSize = Math.min(bitmap.width, bitmap.height)
    const sx = Math.floor((bitmap.width - sourceSize) / 2)
    const sy = Math.floor((bitmap.height - sourceSize) / 2)
    const canvas = document.createElement('canvas')
    canvas.width = resolution
    canvas.height = resolution
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Canvas image processing is unavailable in this browser.')

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, sx, sy, sourceSize, sourceSize, 0, 0, resolution, resolution)
    const image = context.getImageData(0, 0, resolution, resolution)

    return {
      width: resolution,
      height: resolution,
      data: image.data,
    }
  } finally {
    bitmap.close()
  }
}

async function pixelImageToPng(image: PixelImage): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas export is unavailable in this browser.')

  const ownedPixels = new Uint8ClampedArray(image.data.length)
  ownedPixels.set(image.data)
  context.putImageData(new ImageData(ownedPixels, image.width, image.height), 0, 0)

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not encode PNG output.'))
    }, 'image/png')
  })
}

function defaultOptions(): ProcessingOptions {
  const constrained =
    typeof navigator !== 'undefined' &&
    ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4

  return {
    resolution: constrained ? 1024 : 1024,
    exposure: 1,
    redGain: 1,
    greenGain: 1,
    blueGain: 1,
    normalStrength: 2.2,
    baseRoughness: 0.78,
    responseGain: 1.35,
  }
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="slider-field">
      <span><strong>{label}</strong><output>{value.toFixed(step < 0.1 ? 2 : 1)}</output></span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function MaterialProcessor() {
  const workerRef = useRef<Worker | null>(null)
  const [manifest, setManifest] = useState<CaptureManifest | null>(null)
  const [manifestName, setManifestName] = useState('')
  const [files, setFiles] = useState<Partial<Record<FrameKey, File>>>({})
  const [options, setOptions] = useState<ProcessingOptions>(defaultOptions)
  const [maps, setMaps] = useState<Partial<Record<OutputMapKey, ProcessedMap>>>({})
  const [previewColor, setPreviewColor] = useState('#808080')
  const [status, setStatus] = useState('Load a capture manifest and browser-decodable working exports. All processing stays on this device.')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    const worker = new Worker(new URL('./material-processor.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    return () => {
      worker.terminate()
      for (const map of Object.values(maps)) {
        if (map?.url) URL.revokeObjectURL(map.url)
      }
    }
  }, [])

  const ready = useMemo(
    () => requiredFrames.every(({ key }) => files[key]) && Boolean(manifest?.materialId),
    [files, manifest?.materialId],
  )

  const setMapResults = async (
    nextMaps: Record<OutputMapKey, PixelImage>,
    nextPreviewColor: string,
  ) => {
    const created: Partial<Record<OutputMapKey, ProcessedMap>> = {}
    for (const key of ['baseColor', 'roughness', 'normal'] as const) {
      const blob = await pixelImageToPng(nextMaps[key])
      created[key] = { image: nextMaps[key], url: URL.createObjectURL(blob) }
    }

    setMaps((current) => {
      for (const map of Object.values(current)) {
        if (map?.url) URL.revokeObjectURL(map.url)
      }
      return created
    })
    setPreviewColor(nextPreviewColor)
  }

  const processMaterial = async () => {
    if (!ready || processing) return
    const worker = workerRef.current
    if (!worker) return

    setProcessing(true)
    setStatus('Decoding and center-cropping working images…')

    try {
      const decoded: Partial<Record<FrameKey, PixelImage>> = {}
      for (const { key } of requiredFrames) {
        const file = files[key]
        if (!file) throw new Error(`Missing ${key} working image.`)
        decoded[key] = await decodeWorkingImage(file, options.resolution)
      }

      const jobId = crypto.randomUUID()
      const response = new Promise<WorkerComplete>((resolve, reject) => {
        const onMessage = (event: MessageEvent<WorkerComplete | WorkerFailure>) => {
          if (event.data.jobId !== jobId) return
          worker.removeEventListener('message', onMessage)
          if (event.data.type === 'error') reject(new Error(event.data.message))
          else resolve(event.data)
        }
        worker.addEventListener('message', onMessage)
      })

      const frames = {
        crossPolarized: decoded.crossPolarized!,
        parallel: decoded.parallel!,
        north: decoded.north!,
        east: decoded.east!,
        south: decoded.south!,
        west: decoded.west!,
      }

      const transfer = Object.values(frames).map((image) => image.data.buffer as ArrayBuffer)

      worker.postMessage(
        {
          type: 'process',
          jobId,
          frames,
          options: {
            baseColor: {
              exposure: options.exposure,
              redGain: options.redGain,
              greenGain: options.greenGain,
              blueGain: options.blueGain,
            },
            normal: { strength: options.normalStrength },
            roughness: {
              baseRoughness: options.baseRoughness,
              responseGain: options.responseGain,
              minRoughness: 0.28,
              maxRoughness: 0.96,
            },
          },
        },
        { transfer },
      )

      setStatus('Generating draft maps off the main UI thread…')
      const result = await response
      await setMapResults(result.maps, result.previewColor)
      setStatus('Draft PBR maps generated. Compare against the physical swatch before approval.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Material processing failed.')
    } finally {
      setProcessing(false)
    }
  }

  const exportMap = async (key: OutputMapKey) => {
    const map = maps[key]
    if (!map || !manifest?.materialId) return
    const blob = await pixelImageToPng(map.image)
    const suffix = key === 'baseColor' ? 'basecolor' : key
    downloadBlob(
      `${manifest.materialId}-${options.resolution / 1024}k-${suffix}.png`,
      blob,
    )
  }

  const exportProcessingManifest = () => {
    if (!manifest?.materialId || !maps.baseColor || !maps.normal || !maps.roughness) return

    downloadJson(`${manifest.materialId}-processing.json`, {
      schemaVersion: 1,
      materialId: manifest.materialId,
      label: manifest.label ?? '',
      captureSessionId: manifest.captureSessionId ?? '',
      sourceCaptureManifest: manifestName,
      processedAt: new Date().toISOString(),
      status: 'draft-pbr-review-required',
      processor: {
        version: 'v0.15',
        resolution: options.resolution,
        crop: 'center-square',
        baseColor: {
          source: files.crossPolarized?.name ?? '',
          exposure: options.exposure,
          redGain: options.redGain,
          greenGain: options.greenGain,
          blueGain: options.blueGain,
        },
        roughness: {
          diffuseSource: files.crossPolarized?.name ?? '',
          reflectiveSource: files.parallel?.name ?? '',
          baseRoughness: options.baseRoughness,
          responseGain: options.responseGain,
          method: 'normalized-reflectance-proxy',
        },
        normal: {
          north: files.north?.name ?? '',
          east: files.east?.name ?? '',
          south: files.south?.name ?? '',
          west: files.west?.name ?? '',
          strength: options.normalStrength,
          method: 'four-direction-difference-normal',
        },
      },
      derivedPreviewColor: previewColor,
      outputs: {
        baseColor: `${manifest.materialId}-${options.resolution / 1024}k-basecolor.png`,
        roughness: `${manifest.materialId}-${options.resolution / 1024}k-roughness.png`,
        normal: `${manifest.materialId}-${options.resolution / 1024}k-normal.png`,
      },
      reviewRequired: [
        'Compare color against the physical swatch under controlled light.',
        'Inspect 2x2 tile preview for seams and obvious repeating defects.',
        'Check normal direction and strength on the target 3D model.',
        'Tune roughness against the physical material rather than accepting the proxy blindly.',
        'Convert/optimize production derivatives only after visual approval.',
        'Do not mark the registry material production-approved automatically.',
      ],
    })
  }

  return (
    <main className="processor-shell">
      <header className="processor-header">
        <div>
          <p className="eyebrow">SCORPION WESTERN WEAR · DIGITAL MATERIAL PIPELINE</p>
          <h1>Material Processor</h1>
          <p>Turn standardized field captures into reviewable draft PBR maps without uploading source images.</p>
        </div>
        <nav>
          <a href="/capture.html">Field Capture</a>
          <a href="/material-qa.html">Material QA</a>
          <a href="/materials.html">Material Lab</a>
          <a href="/">Customer Studio</a>
        </nav>
      </header>

      <div className="processor-status" role="status">{status}</div>

      <section className="processor-panel">
        <div className="section-heading">
          <span>01</span>
          <div>
            <h2>Load capture metadata</h2>
            <p>The manifest keeps the output tied to the original field session and physical sample.</p>
          </div>
        </div>
        <label className="manifest-drop">
          <input
            type="file"
            accept="application/json,.json"
            aria-label="Capture manifest file"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              try {
                const parsed = JSON.parse(await file.text()) as CaptureManifest
                if (!parsed.materialId) throw new Error('Capture manifest does not contain a materialId.')
                setManifest(parsed)
                setManifestName(file.name)
                setStatus(`Loaded ${file.name} for ${parsed.materialId}.`)
              } catch (error) {
                setManifest(null)
                setManifestName('')
                setStatus(error instanceof Error ? error.message : 'Could not read capture manifest.')
              }
            }}
          />
          <span>{manifest ? `${manifest.materialId} · ${manifest.label || 'Unnamed material'}` : 'Select capture manifest JSON'}</span>
          <small>{manifestName || 'Generated by the Field Capture Assistant.'}</small>
        </label>
      </section>

      <section className="processor-panel">
        <div className="section-heading">
          <span>02</span>
          <div>
            <h2>Load working images</h2>
            <p>Use neutral PNG/JPEG/WebP exports from the archived RAW captures. Keep crop/framing identical across the six frames.</p>
          </div>
        </div>

        <div className="source-grid">
          {requiredFrames.map((frame) => {
            const file = files[frame.key]
            const expected = manifest?.frames?.[frame.key]?.file
            return (
              <label className={`source-file ${file ? 'is-loaded' : ''}`} key={frame.key}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label={`${frame.label} working image`}
                  onChange={(event) => {
                    const selected = event.target.files?.[0]
                    if (!selected) return
                    setFiles((current) => ({ ...current, [frame.key]: selected }))
                    setStatus(`${frame.label} working image loaded locally.`)
                  }}
                />
                <strong>{frame.label}</strong>
                <span>{file?.name || 'Select image'}</span>
                <small>{expected ? `RAW/source: ${expected}` : frame.description}</small>
              </label>
            )
          })}
        </div>
      </section>

      <section className="processor-panel">
        <div className="section-heading">
          <span>03</span>
          <div>
            <h2>Draft processing controls</h2>
            <p>These controls are review aids, not a substitute for calibrated material QA.</p>
          </div>
        </div>

        <div className="processor-controls">
          <label className="resolution-field">
            <span>Output resolution</span>
            <select
              value={options.resolution}
              onChange={(event) => setOptions({ ...options, resolution: Number(event.target.value) as 1024 | 2048 })}
            >
              <option value="1024">1K · field/mobile default</option>
              <option value="2048">2K · desktop review</option>
            </select>
          </label>

          <Slider label="Base exposure" value={options.exposure} min={0.6} max={1.4} step={0.01} onChange={(value) => setOptions({ ...options, exposure: value })} />
          <Slider label="Red gain" value={options.redGain} min={0.8} max={1.2} step={0.01} onChange={(value) => setOptions({ ...options, redGain: value })} />
          <Slider label="Green gain" value={options.greenGain} min={0.8} max={1.2} step={0.01} onChange={(value) => setOptions({ ...options, greenGain: value })} />
          <Slider label="Blue gain" value={options.blueGain} min={0.8} max={1.2} step={0.01} onChange={(value) => setOptions({ ...options, blueGain: value })} />
          <Slider label="Normal strength" value={options.normalStrength} min={0.5} max={5} step={0.1} onChange={(value) => setOptions({ ...options, normalStrength: value })} />
          <Slider label="Base roughness" value={options.baseRoughness} min={0.4} max={0.95} step={0.01} onChange={(value) => setOptions({ ...options, baseRoughness: value })} />
          <Slider label="Reflectance response" value={options.responseGain} min={0.3} max={3} step={0.05} onChange={(value) => setOptions({ ...options, responseGain: value })} />
        </div>

        <button
          type="button"
          className="process-button"
          disabled={!ready || processing}
          onClick={processMaterial}
        >
          {processing ? 'Processing locally…' : 'Generate draft PBR maps'}
        </button>

        {!ready ? <p className="processor-hint">Load a capture manifest and all six required working images to enable processing.</p> : null}
      </section>

      <section className="processor-panel output-panel">
        <div className="section-heading">
          <span>04</span>
          <div>
            <h2>Review & export</h2>
            <p>Inspect each map and the repeated base-color tile before it moves into Material Lab QA.</p>
          </div>
        </div>

        <div className="output-grid">
          {([
            ['baseColor', 'Base color'],
            ['roughness', 'Roughness proxy'],
            ['normal', 'Normal draft'],
          ] as const).map(([key, label]) => (
            <article className="output-card" key={key}>
              <div className="output-card__head"><strong>{label}</strong><span>{options.resolution / 1024}K</span></div>
              <div className="map-preview">
                {maps[key] ? <img src={maps[key]!.url} alt={`${label} preview`} /> : <span>Not generated</span>}
              </div>
              <button type="button" disabled={!maps[key]} onClick={() => exportMap(key)}>Download PNG</button>
            </article>
          ))}

          <article className="output-card tile-card">
            <div className="output-card__head"><strong>2×2 seam test</strong><span style={{ color: previewColor }}>{previewColor}</span></div>
            <div
              className="tile-preview"
              style={maps.baseColor ? {
                backgroundImage: `url("${maps.baseColor.url}")`,
                backgroundSize: '50% 50%',
              } : undefined}
            >
              {!maps.baseColor ? <span>Generate maps first</span> : null}
            </div>
            <button type="button" disabled={!maps.baseColor || !maps.normal || !maps.roughness} onClick={exportProcessingManifest}>
              Download processing manifest
            </button>
          </article>
        </div>

        <div className="approval-warning">
          <strong>Draft only</strong>
          <p>Generated maps are processing candidates. They remain subordinate to the physical swatch and must not automatically promote a material to production-approved.</p>
        </div>
      </section>
    </main>
  )
}

const root = document.getElementById('processor-root')
if (root) createRoot(root).render(<MaterialProcessor />)

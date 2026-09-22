import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import './material-qa.css'

type MapKey = 'baseColor' | 'roughness' | 'normal'
type Shape = 'sphere' | 'flat' | 'cylinder'
type LightingPreset = 'studio' | 'raking-left' | 'raking-right' | 'top'

interface MapAsset {
  file: File
  url: string
  width: number
  height: number
}

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

function useQaMaterial(
  maps: Partial<Record<MapKey, MapAsset>>,
  repeat: number,
  normalScale: number,
  roughnessScalar: number,
) {
  const { gl, invalidate } = useThree()
  const material = useMemo(
    () => new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      metalness: 0,
      roughness: roughnessScalar,
      sheen: 0.15,
      sheenRoughness: 0.75,
    }),
    [],
  )

  useEffect(() => {
    material.roughness = roughnessScalar
    material.normalScale.set(normalScale, normalScale)
    material.needsUpdate = true
    invalidate()
  }, [invalidate, material, normalScale, roughnessScalar])

  useEffect(() => {
    const loader = new THREE.TextureLoader()
    const loaded: THREE.Texture[] = []
    let disposed = false
    const maxAnisotropy = Math.max(1, Math.min(8, gl.capabilities.getMaxAnisotropy()))

    const load = (
      asset: MapAsset | undefined,
      assign: (texture: THREE.Texture) => void,
      colorTexture = false,
    ) => {
      if (!asset) return
      loader.load(
        asset.url,
        (texture) => {
          if (disposed) {
            texture.dispose()
            return
          }
          texture.wrapS = THREE.RepeatWrapping
          texture.wrapT = THREE.RepeatWrapping
          texture.repeat.set(repeat, repeat)
          texture.anisotropy = maxAnisotropy
          if (colorTexture) texture.colorSpace = THREE.SRGBColorSpace
          loaded.push(texture)
          assign(texture)
          material.needsUpdate = true
          invalidate()
        },
        undefined,
        () => undefined,
      )
    }

    material.map = null
    material.roughnessMap = null
    material.normalMap = null

    load(maps.baseColor, (texture) => { material.map = texture }, true)
    load(maps.roughness, (texture) => { material.roughnessMap = texture })
    load(maps.normal, (texture) => { material.normalMap = texture })

    invalidate()

    return () => {
      disposed = true
      for (const texture of loaded) texture.dispose()
    }
  }, [gl, invalidate, maps.baseColor, maps.normal, maps.roughness, material, repeat])

  useEffect(() => () => material.dispose(), [material])

  return material
}

function QaMesh({
  maps,
  shape,
  repeat,
  normalScale,
  roughnessScalar,
}: {
  maps: Partial<Record<MapKey, MapAsset>>
  shape: Shape
  repeat: number
  normalScale: number
  roughnessScalar: number
}) {
  const material = useQaMaterial(maps, repeat, normalScale, roughnessScalar)

  if (shape === 'flat') {
    return (
      <mesh material={material}>
        <planeGeometry args={[2.15, 2.15, 64, 64]} />
      </mesh>
    )
  }

  if (shape === 'cylinder') {
    return (
      <mesh material={material} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.82, 0.82, 1.8, 96, 16, false]} />
      </mesh>
    )
  }

  return (
    <mesh material={material}>
      <sphereGeometry args={[0.95, 96, 64]} />
    </mesh>
  )
}

function Lighting({ preset }: { preset: LightingPreset }) {
  const positions: Record<LightingPreset, [number, number, number]> = {
    studio: [3.4, 4.2, 4.5],
    'raking-left': [-4.8, 0.8, 2.2],
    'raking-right': [4.8, 0.8, 2.2],
    top: [0.4, 5.2, 1.4],
  }

  return (
    <>
      <ambientLight intensity={preset === 'studio' ? 0.55 : 0.2} />
      <directionalLight position={positions[preset]} intensity={preset === 'studio' ? 2.2 : 3.4} />
      {preset === 'studio' ? <directionalLight position={[-3, 1.8, -2.5]} intensity={0.55} /> : null}
    </>
  )
}

function QaViewer({
  maps,
  shape,
  lighting,
  repeat,
  normalScale,
  roughnessScalar,
}: {
  maps: Partial<Record<MapKey, MapAsset>>
  shape: Shape
  lighting: LightingPreset
  repeat: number
  normalScale: number
  roughnessScalar: number
}) {
  return (
    <div className="qa-viewer" aria-label="3D material QA viewer">
      <Canvas
        frameloop="demand"
        dpr={[1, 1.6]}
        camera={{ position: [0, 0.15, 3.2], fov: 36 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#0d0d0b']} />
        <Lighting preset={lighting} />
        <QaMesh
          maps={maps}
          shape={shape}
          repeat={repeat}
          normalScale={normalScale}
          roughnessScalar={roughnessScalar}
        />
        <OrbitControls
          enablePan={false}
          minDistance={1.8}
          maxDistance={5}
          autoRotate={false}
          makeDefault
        />
      </Canvas>
    </div>
  )
}

function MaterialQa() {
  const [manifest, setManifest] = useState<ProcessingManifest | null>(null)
  const [manifestName, setManifestName] = useState('')
  const [maps, setMaps] = useState<Partial<Record<MapKey, MapAsset>>>({})
  const [shape, setShape] = useState<Shape>('sphere')
  const [lighting, setLighting] = useState<LightingPreset>('studio')
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
    const assets = Object.values(maps).filter(Boolean) as MapAsset[]
    if (assets.length < 2) return true
    return assets.every((asset) => asset.width === assets[0].width && asset.height === assets[0].height)
  }, [maps])

  const approved = Object.values(checks).every(Boolean) && Boolean(reviewer.trim()) && allMapsLoaded && matchingDimensions

  const loadMap = async (key: MapKey, file: File) => {
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
          <QaViewer
            maps={maps}
            shape={shape}
            lighting={lighting}
            repeat={repeat}
            normalScale={normalScale}
            roughnessScalar={roughnessScalar}
          />

          <aside className="viewer-controls">
            <label>Test shape
              <select value={shape} onChange={(event) => setShape(event.target.value as Shape)}>
                <option value="sphere">Sphere</option>
                <option value="cylinder">Cylinder</option>
                <option value="flat">Flat swatch</option>
              </select>
            </label>
            <label>Lighting
              <select value={lighting} onChange={(event) => setLighting(event.target.value as LightingPreset)}>
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

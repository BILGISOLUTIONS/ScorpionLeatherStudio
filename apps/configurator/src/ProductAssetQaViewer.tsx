import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { AssetManifest } from '@sls/product-schema'
import type { ProductAssetInspection } from '@sls/product-asset-qa'

export type ProductAssetDiagnosticMode = 'original' | 'uv-checker' | 'normals'

interface Runtime {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  model?: THREE.Object3D
  render: () => void
  resizeObserver: ResizeObserver
  originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>
  diagnosticMaterials: THREE.Material[]
  checkerTexture?: THREE.DataTexture
}

function textureEdges(texture: THREE.Texture): number[] {
  const source = texture.source?.data as { width?: number; height?: number } | undefined
  const image = texture.image as { width?: number; height?: number } | undefined
  return [
    source?.width ?? image?.width ?? 0,
    source?.height ?? image?.height ?? 0,
  ].filter((value) => Number.isFinite(value) && value > 0)
}

function materialTextures(material: THREE.Material): THREE.Texture[] {
  const textures: THREE.Texture[] = []
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) textures.push(value)
  }
  return textures
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  const count = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0
  return Math.floor(count / 3)
}

function inspectScene(args: {
  scene: THREE.Object3D
  animations: THREE.AnimationClip[]
  manifest: AssetManifest
  file: File
}): ProductAssetInspection {
  args.scene.updateMatrixWorld(true)

  const nodeNames: string[] = []
  const nameCounts = new Map<string, number>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  const nonUniformScaleNodes: string[] = []
  const negativeScaleNodes: string[] = []
  let meshCount = 0
  let triangles = 0
  let unnamedMeshCount = 0
  const meshDiagnostics: ProductAssetInspection['meshDiagnostics'] = []

  args.scene.traverse((object) => {
    if (object.name) {
      nodeNames.push(object.name)
      nameCounts.set(object.name, (nameCounts.get(object.name) ?? 0) + 1)
    }

    const scale = object.scale
    if (Math.abs(scale.x - scale.y) > 0.0001 || Math.abs(scale.y - scale.z) > 0.0001) {
      nonUniformScaleNodes.push(object.name || object.uuid)
    }
    if (scale.x < 0 || scale.y < 0 || scale.z < 0) {
      negativeScaleNodes.push(object.name || object.uuid)
    }

    if (!(object instanceof THREE.Mesh)) return
    meshCount += 1
    if (!object.name) unnamedMeshCount += 1
    const meshTriangles = triangleCount(object.geometry)
    triangles += meshTriangles

    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material]
    meshDiagnostics.push({
      nodeName: object.name || object.uuid,
      triangleCount: meshTriangles,
      materialCount: meshMaterials.length,
      hasUv0: Boolean(object.geometry.getAttribute('uv')),
      hasUv1: Boolean(object.geometry.getAttribute('uv1')),
      hasNormals: Boolean(object.geometry.getAttribute('normal')),
      hasTangents: Boolean(object.geometry.getAttribute('tangent')),
    })
    for (const material of meshMaterials) {
      materials.add(material)
      for (const texture of materialTextures(material)) textures.add(texture)
    }
  })

  const bounds = new THREE.Box3().setFromObject(args.scene)
  const size = bounds.getSize(new THREE.Vector3())
  const root = args.scene.getObjectByName(args.manifest.rootNode)
  const maxTextureEdge = [...textures].flatMap(textureEdges).reduce((max, edge) => Math.max(max, edge), 0)

  return {
    schemaVersion: 1,
    assetId: args.manifest.assetId,
    inspectedAt: new Date().toISOString(),
    modelFile: {
      name: args.file.name,
      sizeBytes: args.file.size,
      type: args.file.type || (args.file.name.toLowerCase().endsWith('.glb') ? 'model/gltf-binary' : 'model/gltf+json'),
    },
    boundsMeters: {
      width: size.x,
      height: size.y,
      depth: size.z,
    },
    rootScale: root ? [root.scale.x, root.scale.y, root.scale.z] : [Number.NaN, Number.NaN, Number.NaN],
    nodeNames,
    duplicateNodeNames: [...nameCounts.entries()].filter(([, count]) => count > 1).map(([name]) => name).sort(),
    meshCount,
    triangleCount: triangles,
    materialCount: materials.size,
    textureCount: textures.size,
    maxTextureEdge: maxTextureEdge || undefined,
    unnamedMeshCount,
    nonUniformScaleNodes: [...new Set(nonUniformScaleNodes)].sort(),
    negativeScaleNodes: [...new Set(negativeScaleNodes)].sort(),
    animationClipNames: args.animations.map((clip) => clip.name || '(unnamed)').sort(),
    meshDiagnostics,
  }
}

function createCheckerTexture(): THREE.DataTexture {
  const size = 8
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const bright = (x + y) % 2 === 0
      data[offset] = bright ? 210 : 50
      data[offset + 1] = bright ? 173 : 43
      data[offset + 2] = bright ? 98 : 38
      data[offset + 3] = 255
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(6, 6)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function restoreOriginalMaterials(runtime: Runtime) {
  for (const [mesh, material] of runtime.originalMaterials) mesh.material = material
  for (const material of runtime.diagnosticMaterials) material.dispose()
  runtime.diagnosticMaterials = []
  runtime.checkerTexture?.dispose()
  runtime.checkerTexture = undefined
}

function applyDiagnosticMode(runtime: Runtime, mode: ProductAssetDiagnosticMode) {
  restoreOriginalMaterials(runtime)
  if (!runtime.model || mode === 'original') {
    runtime.render()
    return
  }

  if (mode === 'normals') {
    runtime.model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const material = new THREE.MeshNormalMaterial()
      runtime.diagnosticMaterials.push(material)
      object.material = material
    })
  } else {
    const texture = createCheckerTexture()
    runtime.checkerTexture = texture
    runtime.model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
      runtime.diagnosticMaterials.push(material)
      object.material = material
    })
  }
  runtime.render()
}

function disposeObject(root: THREE.Object3D | undefined) {
  if (!root) return
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      for (const texture of materialTextures(material)) texture.dispose()
      material.dispose()
    }
  })
}

export default function ProductAssetQaViewer({
  file,
  manifest,
  diagnosticMode = 'original',
  onInspection,
  onError,
}: {
  file: File
  manifest: AssetManifest
  diagnosticMode?: ProductAssetDiagnosticMode
  onInspection: (inspection: ProductAssetInspection) => void
  onError: (message: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const runtimeRef = useRef<Runtime | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0d0d0b')

    const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 50)
    camera.position.set(0.55, 0.32, 0.8)

    const controls = new OrbitControls(camera, canvas)
    controls.enablePan = false
    controls.enableDamping = false
    controls.minDistance = 0.25
    controls.maxDistance = 6

    scene.add(new THREE.HemisphereLight('#fff0d8', '#21160d', 1.05))
    const key = new THREE.DirectionalLight('#ffe5ba', 2.5)
    key.position.set(3.5, 4.5, 4.2)
    scene.add(key)
    const fill = new THREE.DirectionalLight('#dce9f2', 0.8)
    fill.position.set(-3, 1.8, -2.5)
    scene.add(fill)

    const render = () => renderer.render(scene, camera)
    controls.addEventListener('change', render)

    const resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect?.width || !rect?.height) return
      const width = Math.max(1, Math.floor(rect.width))
      const height = Math.max(1, Math.floor(rect.height))
      renderer.setSize(width, height, true)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      render()
    })
    resizeObserver.observe(canvas.parentElement ?? canvas)

    runtimeRef.current = {
      renderer,
      scene,
      camera,
      controls,
      render,
      resizeObserver,
      originalMaterials: new Map(),
      diagnosticMaterials: [],
    }
    render()

    return () => {
      const runtime = runtimeRef.current
      runtimeRef.current = null
      resizeObserver.disconnect()
      controls.removeEventListener('change', render)
      controls.dispose()
      if (runtime?.model) {
        restoreOriginalMaterials(runtime)
        scene.remove(runtime.model)
        disposeObject(runtime.model)
      }
      renderer.dispose()
    }
  }, [])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return
    let cancelled = false

    const load = async () => {
      try {
        const buffer = await file.arrayBuffer()
        if (cancelled || runtimeRef.current !== runtime) return

        const loader = new GLTFLoader()
        loader.setMeshoptDecoder(MeshoptDecoder)
        const gltf = await loader.parseAsync(buffer, '')
        if (cancelled || runtimeRef.current !== runtime) {
          disposeObject(gltf.scene)
          return
        }

        if (runtime.model) {
          restoreOriginalMaterials(runtime)
          runtime.scene.remove(runtime.model)
          disposeObject(runtime.model)
          runtime.originalMaterials.clear()
        }

        const model = gltf.scene
        runtime.model = model
        runtime.scene.add(model)
        model.traverse((object) => {
          if (object instanceof THREE.Mesh) runtime.originalMaterials.set(object, object.material)
        })
        model.updateMatrixWorld(true)

        const bounds = new THREE.Box3().setFromObject(model)
        const sphere = bounds.getBoundingSphere(new THREE.Sphere())
        const center = sphere.center
        const radius = Math.max(sphere.radius, 0.08)
        runtime.controls.target.copy(center)
        runtime.camera.near = Math.max(0.001, radius / 100)
        runtime.camera.far = Math.max(20, radius * 30)
        runtime.camera.position.set(
          center.x + radius * 1.55,
          center.y + radius * 0.85,
          center.z + radius * 2.1,
        )
        runtime.camera.updateProjectionMatrix()
        runtime.controls.minDistance = radius * 0.7
        runtime.controls.maxDistance = radius * 8
        runtime.controls.update()
        applyDiagnosticMode(runtime, diagnosticMode)

        onInspection(inspectScene({ scene: model, animations: gltf.animations, manifest, file }))
      } catch (error) {
        onError(error instanceof Error ? error.message : 'The selected glTF asset could not be inspected.')
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [file, manifest, onError, onInspection])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime?.model) return
    applyDiagnosticMode(runtime, diagnosticMode)
  }, [diagnosticMode])

  return (
    <div className="asset-qa-viewer" aria-label="Digital twin QA viewer">
      <canvas ref={canvasRef} />
    </div>
  )
}

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type {
  MaterialQaLightingPreset,
  MaterialQaMapAsset,
  MaterialQaMapKey,
  MaterialQaShape,
} from './material-qa-types'

interface QaRuntime {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  mesh: THREE.Mesh
  material: THREE.MeshPhysicalMaterial
  ambient: THREE.AmbientLight
  keyLight: THREE.DirectionalLight
  fillLight: THREE.DirectionalLight
  textures: Partial<Record<MaterialQaMapKey, THREE.Texture>>
  repeat: number
  render: () => void
  resizeObserver: ResizeObserver
}

function geometryFor(shape: MaterialQaShape): THREE.BufferGeometry {
  if (shape === 'flat') return new THREE.PlaneGeometry(2.15, 2.15, 40, 40)
  if (shape === 'cylinder') return new THREE.CylinderGeometry(0.82, 0.82, 1.8, 72, 10, false)
  return new THREE.SphereGeometry(0.95, 64, 40)
}

function configureTexture(
  texture: THREE.Texture,
  repeat: number,
  maxAnisotropy: number,
  colorTexture: boolean,
) {
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat, repeat)
  texture.anisotropy = Math.max(1, Math.min(8, maxAnisotropy))
  if (colorTexture) texture.colorSpace = THREE.SRGBColorSpace
}

function applyLighting(runtime: QaRuntime, preset: MaterialQaLightingPreset) {
  const positions: Record<MaterialQaLightingPreset, [number, number, number]> = {
    studio: [3.4, 4.2, 4.5],
    'raking-left': [-4.8, 0.8, 2.2],
    'raking-right': [4.8, 0.8, 2.2],
    top: [0.4, 5.2, 1.4],
  }

  runtime.ambient.intensity = preset === 'studio' ? 0.55 : 0.2
  runtime.keyLight.position.set(...positions[preset])
  runtime.keyLight.intensity = preset === 'studio' ? 2.2 : 3.4
  runtime.fillLight.visible = preset === 'studio'
  runtime.fillLight.position.set(-3, 1.8, -2.5)
  runtime.fillLight.intensity = 0.55
}

export default function MaterialQaViewer({
  maps,
  shape,
  lighting,
  repeat,
  normalScale,
  roughnessScalar,
}: {
  maps: Partial<Record<MaterialQaMapKey, MaterialQaMapAsset>>
  shape: MaterialQaShape
  lighting: MaterialQaLightingPreset
  repeat: number
  normalScale: number
  roughnessScalar: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const runtimeRef = useRef<QaRuntime | null>(null)
  const textureGeneration = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0d0d0b')

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100)
    camera.position.set(0, 0.15, 3.2)

    const material = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      metalness: 0,
      roughness: roughnessScalar,
      sheen: 0.15,
      sheenRoughness: 0.75,
      normalScale: new THREE.Vector2(normalScale, normalScale),
    })

    const mesh = new THREE.Mesh(geometryFor(shape), material)
    if (shape === 'cylinder') mesh.rotation.x = Math.PI / 2
    scene.add(mesh)

    const ambient = new THREE.AmbientLight('#ffffff', 0.55)
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.2)
    const fillLight = new THREE.DirectionalLight('#ffffff', 0.55)
    scene.add(ambient, keyLight, fillLight)

    const controls = new OrbitControls(camera, canvas)
    controls.enablePan = false
    controls.enableDamping = false
    controls.minDistance = 1.8
    controls.maxDistance = 5
    controls.rotateSpeed = 0.7
    controls.zoomSpeed = 0.8

    const render = () => renderer.render(scene, camera)
    controls.addEventListener('change', render)

    const parent = canvas.parentElement ?? canvas
    const resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect?.width || !rect?.height) return

      const width = Math.max(1, Math.floor(rect.width))
      const height = Math.max(1, Math.floor(rect.height))
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      render()
    })
    resizeObserver.observe(parent)

    const runtime: QaRuntime = {
      renderer,
      scene,
      camera,
      controls,
      mesh,
      material,
      ambient,
      keyLight,
      fillLight,
      textures: {},
      repeat,
      render,
      resizeObserver,
    }
    runtimeRef.current = runtime
    applyLighting(runtime, lighting)
    render()

    return () => {
      textureGeneration.current += 1
      runtimeRef.current = null
      resizeObserver.disconnect()
      controls.removeEventListener('change', render)
      controls.dispose()
      mesh.geometry.dispose()
      for (const texture of Object.values(runtime.textures)) texture?.dispose()
      material.dispose()
      renderer.dispose()
    }
  }, [])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return

    const nextGeometry = geometryFor(shape)
    runtime.mesh.geometry.dispose()
    runtime.mesh.geometry = nextGeometry
    runtime.mesh.rotation.set(shape === 'cylinder' ? Math.PI / 2 : 0, 0, 0)
    runtime.render()
  }, [shape])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return
    applyLighting(runtime, lighting)
    runtime.render()
  }, [lighting])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return
    runtime.repeat = repeat
    for (const texture of Object.values(runtime.textures)) texture?.repeat.set(repeat, repeat)
    runtime.render()
  }, [repeat])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return
    runtime.material.roughness = Math.max(0, Math.min(1, roughnessScalar))
    runtime.material.normalScale.set(normalScale, normalScale)
    runtime.material.needsUpdate = true
    runtime.render()
  }, [normalScale, roughnessScalar])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return

    const generation = ++textureGeneration.current
    const loader = new THREE.TextureLoader()
    const maxAnisotropy = runtime.renderer.capabilities.getMaxAnisotropy()

    const setTexture = (
      key: MaterialQaMapKey,
      asset: MaterialQaMapAsset | undefined,
      colorTexture: boolean,
    ) => {
      const old = runtime.textures[key]
      if (old) {
        old.dispose()
        delete runtime.textures[key]
      }

      if (key === 'baseColor') runtime.material.map = null
      if (key === 'roughness') runtime.material.roughnessMap = null
      if (key === 'normal') runtime.material.normalMap = null

      if (!asset) return

      loader.load(
        asset.url,
        (texture) => {
          if (generation !== textureGeneration.current || runtimeRef.current !== runtime) {
            texture.dispose()
            return
          }

          configureTexture(texture, runtime.repeat, maxAnisotropy, colorTexture)
          runtime.textures[key] = texture
          if (key === 'baseColor') runtime.material.map = texture
          if (key === 'roughness') runtime.material.roughnessMap = texture
          if (key === 'normal') runtime.material.normalMap = texture
          runtime.material.needsUpdate = true
          runtime.render()
        },
        undefined,
        () => undefined,
      )
    }

    setTexture('baseColor', maps.baseColor, true)
    setTexture('roughness', maps.roughness, false)
    setTexture('normal', maps.normal, false)
    runtime.material.needsUpdate = true
    runtime.render()
  }, [maps.baseColor, maps.normal, maps.roughness])

  return (
    <div className="qa-viewer" aria-label="3D material QA viewer">
      <canvas ref={canvasRef} />
    </div>
  )
}

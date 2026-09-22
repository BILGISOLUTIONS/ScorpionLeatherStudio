import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Html, OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import {
  validateAssetManifest,
  type AssetManifest,
  type MaterialVariant,
  type ProductDefinition,
  type ValidationIssue,
} from '@sls/product-schema'

export interface ThreeProductViewerProps {
  product: ProductDefinition
  manifest: AssetManifest
  materials: Record<string, MaterialVariant>
  selections: Record<string, string>
  animationStates?: Record<string, boolean>
  cameraPreset?: string
  autoRotate?: boolean
  onAssetIssues?: (issues: ValidationIssue[]) => void
}

function LoadingFallback() {
  return (
    <Html center>
      <div style={{ color: '#d8d0bf', fontFamily: 'system-ui', fontSize: 13 }}>Loading product…</div>
    </Html>
  )
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

function createMaterial(variant: MaterialVariant): THREE.MeshPhysicalMaterial {
  const transparent = variant.kind === 'glass' || (variant.opacity ?? 1) < 1
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(variant.color),
    roughness: variant.roughness,
    metalness: variant.metalness,
    opacity: variant.opacity ?? 1,
    transparent,
    transmission: variant.transmission ?? 0,
    clearcoat: variant.clearcoat ?? 0,
    clearcoatRoughness: variant.clearcoatRoughness ?? 0,
    sheen: variant.sheen ?? 0,
    sheenRoughness: variant.sheenRoughness ?? 1,
    side: variant.kind === 'glass' ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: !transparent,
  })
}

function configureTexture(texture: THREE.Texture, variant: MaterialVariant, colorTexture = false) {
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  const repeat = variant.textureRepeat ?? [1, 1]
  texture.repeat.set(repeat[0], repeat[1])
  texture.anisotropy = 4
  if (colorTexture) texture.colorSpace = THREE.SRGBColorSpace
}

function hydrateMaterialTextures(
  material: THREE.MeshPhysicalMaterial,
  variant: MaterialVariant,
  invalidate: () => void,
) {
  if (!variant.textures) return () => undefined

  const loader = new THREE.TextureLoader()
  const loaded: THREE.Texture[] = []
  let disposed = false

  const load = (
    url: string | undefined,
    assign: (texture: THREE.Texture) => void,
    colorTexture = false,
  ) => {
    if (!url) return
    loader.load(
      url,
      (texture) => {
        if (disposed) {
          texture.dispose()
          return
        }
        configureTexture(texture, variant, colorTexture)
        loaded.push(texture)
        assign(texture)
        material.needsUpdate = true
        invalidate()
      },
      undefined,
      () => undefined,
    )
  }

  load(variant.textures.baseColor, (texture) => { material.map = texture }, true)
  load(variant.textures.normal, (texture) => {
    material.normalMap = texture
    const normalScale = variant.normalScale ?? 1
    material.normalScale.set(normalScale, normalScale)
  })
  load(variant.textures.roughness, (texture) => { material.roughnessMap = texture })
  load(variant.textures.metalness, (texture) => { material.metalnessMap = texture })
  load(variant.textures.ambientOcclusion, (texture) => { material.aoMap = texture })

  return () => {
    disposed = true
    for (const texture of loaded) texture.dispose()
  }
}

function MechanicalAnimations({
  scene,
  manifest,
  animationStates,
}: {
  scene: THREE.Object3D
  manifest: AssetManifest
  animationStates: Record<string, boolean>
}) {
  const { invalidate } = useThree()
  const reducedMotion = useReducedMotion()
  const targets = useMemo(() => {
    return Object.entries(manifest.animations).flatMap(([key, definition]) => {
      const object = scene.getObjectByName(definition.target)
      return object ? [{ key, definition, object }] : []
    })
  }, [manifest.animations, scene])

  const stateRef = useRef(animationStates)
  stateRef.current = animationStates

  useEffect(() => {
    invalidate()
  }, [animationStates, invalidate])

  useFrame((_, delta) => {
    let keepAnimating = false

    for (const { key, definition, object } of targets) {
      const target = stateRef.current[key] ? definition.to : definition.from
      const axis = definition.property.split('.').at(-1) as 'x' | 'y' | 'z'

      if (reducedMotion) {
        object.rotation[axis] = target
        continue
      }

      const lambda = Math.max(4, 1000 / Math.max(1, definition.durationMs))
      object.rotation[axis] = THREE.MathUtils.damp(object.rotation[axis], target, lambda, delta)
      if (Math.abs(object.rotation[axis] - target) > 0.001) keepAnimating = true
    }

    if (keepAnimating) invalidate()
  })

  return null
}

function ProductModel({
  product,
  manifest,
  materials,
  selections,
  animationStates = {},
  onAssetIssues,
}: ThreeProductViewerProps) {
  const { invalidate } = useThree()
  const gltf = useGLTF(manifest.model)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])

  useEffect(() => {
    const names: string[] = []
    scene.traverse((object) => {
      if (object.name) names.push(object.name)
      if (object instanceof THREE.Mesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
    onAssetIssues?.(validateAssetManifest(manifest, Object.keys(materials), names))
  }, [manifest, materials, onAssetIssues, scene])

  useEffect(() => {
    const createdMaterials: THREE.MeshPhysicalMaterial[] = []
    const textureCleanups: Array<() => void> = []
    const activeComponents = new Map<string, string>()
    const selectedMaterialVariants = new Map<string, string>(Object.entries(manifest.defaultMaterialVariants ?? {}))

    for (const group of product.optionGroups) {
      const selectedValue = group.values.find((value) => value.id === selections[group.id])
      if (selectedValue?.visual?.componentGroup && selectedValue.visual.componentValue) {
        activeComponents.set(selectedValue.visual.componentGroup, selectedValue.visual.componentValue)
      }
      if (selectedValue?.visual?.materialSlot && selectedValue.visual.materialVariant) {
        selectedMaterialVariants.set(selectedValue.visual.materialSlot, selectedValue.visual.materialVariant)
      }
    }

    for (const [componentKey, nodeNames] of Object.entries(manifest.components)) {
      const [groupName, componentValue] = componentKey.split('.')
      const selectedComponent = activeComponents.get(groupName)
      const visible = selectedComponent === undefined ? true : selectedComponent === componentValue
      for (const nodeName of nodeNames) {
        const node = scene.getObjectByName(nodeName)
        if (node) node.visible = visible
      }
    }

    for (const [slot, nodeNames] of Object.entries(manifest.materialSlots)) {
      const variantId = selectedMaterialVariants.get(slot)
      if (!variantId) continue
      const variant = materials[variantId]
      if (!variant) continue

      const material = createMaterial(variant)
      createdMaterials.push(material)
      textureCleanups.push(hydrateMaterialTextures(material, variant, invalidate))

      for (const nodeName of nodeNames) {
        const node = scene.getObjectByName(nodeName)
        if (node instanceof THREE.Mesh) node.material = material
      }
    }

    invalidate()

    return () => {
      for (const cleanup of textureCleanups) cleanup()
      for (const material of createdMaterials) material.dispose()
    }
  }, [
    manifest.components,
    manifest.defaultMaterialVariants,
    manifest.materialSlots,
    invalidate,
    materials,
    product.optionGroups,
    scene,
    selections,
  ])

  return (
    <>
      <primitive object={scene} />
      <MechanicalAnimations scene={scene} manifest={manifest} animationStates={animationStates} />
    </>
  )
}

function CameraRig({
  manifest,
  presetName,
  autoRotate,
}: {
  manifest: AssetManifest
  presetName: string
  autoRotate: boolean
}) {
  const { camera, invalidate } = useThree()
  const reducedMotion = useReducedMotion()
  const controls = useRef<OrbitControlsImpl>(null)
  const destination = useRef(new THREE.Vector3())
  const destinationTarget = useRef(new THREE.Vector3())
  const transitioning = useRef(true)

  useEffect(() => {
    const preset = manifest.cameraPresets[presetName]
    if (!preset) return

    destination.current.set(...preset.position)
    destinationTarget.current.set(...preset.target)

    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = preset.fov
      camera.updateProjectionMatrix()
    }

    if (reducedMotion) {
      camera.position.copy(destination.current)
      if (controls.current) {
        controls.current.target.copy(destinationTarget.current)
        controls.current.update()
      } else {
        camera.lookAt(destinationTarget.current)
      }
      transitioning.current = false
    } else {
      transitioning.current = true
    }

    invalidate()
  }, [camera, invalidate, manifest.cameraPresets, presetName, reducedMotion])

  useEffect(() => {
    if (!autoRotate || reducedMotion) return

    let frame = 0
    const tick = () => {
      invalidate()
      frame = window.requestAnimationFrame(tick)
    }
    tick()

    return () => window.cancelAnimationFrame(frame)
  }, [autoRotate, invalidate, reducedMotion])

  useFrame((_, delta) => {
    if (!transitioning.current || reducedMotion) return

    const alpha = 1 - Math.exp(-7 * delta)
    camera.position.lerp(destination.current, alpha)

    if (controls.current) {
      controls.current.target.lerp(destinationTarget.current, alpha)
      controls.current.update()
    } else {
      camera.lookAt(destinationTarget.current)
    }

    const positionDone = camera.position.distanceTo(destination.current) < 0.002
    const targetDone = !controls.current || controls.current.target.distanceTo(destinationTarget.current) < 0.002

    if (positionDone && targetDone) {
      camera.position.copy(destination.current)
      if (controls.current) {
        controls.current.target.copy(destinationTarget.current)
        controls.current.update()
      } else {
        camera.lookAt(destinationTarget.current)
      }
      transitioning.current = false
    } else {
      invalidate()
    }
  })

  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      minDistance={0.38}
      maxDistance={1.6}
      minPolarAngle={0.35}
      maxPolarAngle={2.55}
      autoRotate={autoRotate && !reducedMotion}
      autoRotateSpeed={0.65}
      makeDefault
    />
  )
}

export function ThreeProductViewer(props: ThreeProductViewerProps) {
  const presetName = props.cameraPreset ?? props.product.asset.defaultCameraPreset
  const initial = props.manifest.cameraPresets[props.product.asset.defaultCameraPreset]

  return (
    <Canvas
      frameloop="demand"
      camera={{ position: initial?.position ?? [0.48, 0.28, 0.68], fov: initial?.fov ?? 35 }}
      dpr={[1, 1.75]}
      shadows
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#0e0e0d']} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[3.2, 4.2, 4.8]} intensity={2.35} castShadow />
      <directionalLight position={[-3, 1.5, -2]} intensity={0.72} />
      <directionalLight position={[0, -1.5, 2.5]} intensity={0.22} />

      <Suspense fallback={<LoadingFallback />}>
        <ProductModel {...props} />
        <ContactShadows
          position={[0, -0.34, 0]}
          opacity={0.52}
          scale={1.2}
          blur={2.6}
          far={1.2}
          frames={1}
        />
      </Suspense>

      <CameraRig
        manifest={props.manifest}
        presetName={presetName}
        autoRotate={props.autoRotate ?? false}
      />
    </Canvas>
  )
}

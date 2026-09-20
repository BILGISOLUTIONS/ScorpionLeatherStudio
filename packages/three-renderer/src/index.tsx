import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { AssetManifest, MaterialVariant, ProductDefinition } from '@sls/product-schema'

export interface ThreeProductViewerProps {
  product: ProductDefinition
  manifest: AssetManifest
  materials: Record<string, MaterialVariant>
  selections: Record<string, string>
  animationStates?: Record<string, boolean>
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

function MechanicalAnimations({
  scene,
  manifest,
  animationStates,
}: {
  scene: THREE.Object3D
  manifest: AssetManifest
  animationStates: Record<string, boolean>
}) {
  const reducedMotion = useReducedMotion()
  const targets = useMemo(() => {
    return Object.entries(manifest.animations).flatMap(([key, definition]) => {
      const object = scene.getObjectByName(definition.target)
      return object ? [{ key, definition, object }] : []
    })
  }, [manifest.animations, scene])

  const stateRef = useRef(animationStates)
  stateRef.current = animationStates

  useFrame((_, delta) => {
    for (const { key, definition, object } of targets) {
      const target = stateRef.current[key] ? definition.to : definition.from
      const [axis] = definition.property.split('.').slice(-1) as ['x' | 'y' | 'z']
      if (reducedMotion) {
        object.rotation[axis] = target
      } else {
        const lambda = Math.max(4, 1000 / Math.max(1, definition.durationMs))
        object.rotation[axis] = THREE.MathUtils.damp(object.rotation[axis], target, lambda, delta)
      }
    }
  })

  return null
}

function ProductModel({ product, manifest, materials, selections, animationStates = {} }: ThreeProductViewerProps) {
  const gltf = useGLTF(manifest.model)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])

  useEffect(() => {
    const createdMaterials: THREE.Material[] = []
    const activeComponents = new Map<string, string>()
    const selectedMaterialVariants = new Map<string, string>()

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
      for (const nodeName of nodeNames) {
        const node = scene.getObjectByName(nodeName)
        if (!(node instanceof THREE.Mesh)) continue
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(variant.color),
          roughness: variant.roughness,
          metalness: variant.metalness,
        })
        createdMaterials.push(material)
        node.material = material
      }
    }

    return () => {
      for (const material of createdMaterials) material.dispose()
    }
  }, [manifest.components, manifest.materialSlots, materials, product.optionGroups, scene, selections])

  return (
    <>
      <primitive object={scene} />
      <MechanicalAnimations scene={scene} manifest={manifest} animationStates={animationStates} />
    </>
  )
}

function CameraPreset({ manifest, presetName }: { manifest: AssetManifest; presetName: string }) {
  const { camera } = useThree()
  useEffect(() => {
    const preset = manifest.cameraPresets[presetName]
    if (!preset) return
    camera.position.set(...preset.position)
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = preset.fov
      camera.updateProjectionMatrix()
    }
    camera.lookAt(...preset.target)
  }, [camera, manifest.cameraPresets, presetName])
  return null
}

export function ThreeProductViewer(props: ThreeProductViewerProps) {
  const preset = props.product.asset.defaultCameraPreset
  const target = props.manifest.cameraPresets[preset]?.target ?? [0, 0, 0]

  return (
    <Canvas dpr={[1, 1.75]} shadows gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <color attach="background" args={['#111111']} />
      <ambientLight intensity={1.15} />
      <directionalLight position={[3, 4, 5]} intensity={2.1} castShadow />
      <directionalLight position={[-3, 1.5, -2]} intensity={0.65} />
      <Suspense fallback={<LoadingFallback />}>
        <ProductModel {...props} />
      </Suspense>
      <CameraPreset manifest={props.manifest} presetName={preset} />
      <OrbitControls
        target={target}
        enablePan={false}
        minDistance={0.38}
        maxDistance={1.6}
        minPolarAngle={0.35}
        maxPolarAngle={2.55}
        makeDefault
      />
    </Canvas>
  )
}

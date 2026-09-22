import { useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type {
  MaterialQaLightingPreset,
  MaterialQaMapAsset,
  MaterialQaMapKey,
  MaterialQaShape,
} from './material-qa-types'

function useQaMaterial(
  maps: Partial<Record<MaterialQaMapKey, MaterialQaMapAsset>>,
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
      asset: MaterialQaMapAsset | undefined,
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
      material.map = null
      material.roughnessMap = null
      material.normalMap = null
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
  maps: Partial<Record<MaterialQaMapKey, MaterialQaMapAsset>>
  shape: MaterialQaShape
  repeat: number
  normalScale: number
  roughnessScalar: number
}) {
  const material = useQaMaterial(maps, repeat, normalScale, roughnessScalar)

  if (shape === 'flat') {
    return (
      <mesh material={material}>
        <planeGeometry args={[2.15, 2.15, 48, 48]} />
      </mesh>
    )
  }

  if (shape === 'cylinder') {
    return (
      <mesh material={material} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.82, 0.82, 1.8, 80, 12, false]} />
      </mesh>
    )
  }

  return (
    <mesh material={material}>
      <sphereGeometry args={[0.95, 80, 48]} />
    </mesh>
  )
}

function Lighting({ preset }: { preset: MaterialQaLightingPreset }) {
  const positions: Record<MaterialQaLightingPreset, [number, number, number]> = {
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
  return (
    <div className="qa-viewer" aria-label="3D material QA viewer">
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
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
          enableDamping
          dampingFactor={0.075}
          makeDefault
        />
      </Canvas>
    </div>
  )
}

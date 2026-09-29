import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Html, OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import {
  validateAssetManifest,
  validateMaterialSlotAssignments,
  type AssetCustomizationPurpose,
  type AssetManifest,
  type MaterialVariant,
  type ProductDefinition,
  type ValidationIssue,
} from '@sls/product-schema'

export interface ThreeCustomizationLayer {
  id: string
  zoneId: string
  purpose: AssetCustomizationPurpose
  content?: string
  style?: string
  imageUrl?: string
  opacity?: number
}

const EMPTY_CUSTOMIZATION_LAYERS: readonly ThreeCustomizationLayer[] = []

export interface ThreeProductViewerProps {
  product: ProductDefinition
  manifest: AssetManifest
  materials: Record<string, MaterialVariant>
  selections: Record<string, string>
  animationStates?: Record<string, boolean>
  materialOverrides?: Record<string, string>
  componentOverrides?: Record<string, string>
  customizationLayers?: readonly ThreeCustomizationLayer[]
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

function configureTexture(
  texture: THREE.Texture,
  variant: MaterialVariant,
  maxAnisotropy: number,
  colorTexture = false,
) {
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  const repeat = variant.textureRepeat ?? [1, 1]
  texture.repeat.set(repeat[0], repeat[1])
  texture.anisotropy = Math.max(1, Math.min(8, maxAnisotropy))
  if (colorTexture) texture.colorSpace = THREE.SRGBColorSpace
}

function hydrateMaterialTextures(
  material: THREE.MeshPhysicalMaterial,
  variant: MaterialVariant,
  invalidate: () => void,
  maxAnisotropy: number,
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
        configureTexture(texture, variant, maxAnisotropy, colorTexture)
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

function resolveVisualState(
  product: ProductDefinition,
  manifest: AssetManifest,
  selections: Record<string, string>,
  materialOverrides: Record<string, string>,
  componentOverrides: Record<string, string>,
) {
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

  for (const [group, value] of Object.entries(componentOverrides)) activeComponents.set(group, value)
  for (const [slot, materialId] of Object.entries(materialOverrides)) selectedMaterialVariants.set(slot, materialId)

  return { activeComponents, selectedMaterialVariants }
}


export function validateCustomizationLayers(
  manifest: AssetManifest,
  layers: readonly ThreeCustomizationLayer[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const ids = new Set<string>()

  for (const layer of layers) {
    const prefix = \`customizationLayers.\${layer.id || '(unnamed)'}\`
    if (!layer.id.trim()) {
      issues.push({ path: prefix, message: 'Customization preview layer requires a stable id.' })
    } else if (ids.has(layer.id)) {
      issues.push({ path: prefix, message: \`Customization preview layer id "\${layer.id}" is duplicated.\` })
    } else {
      ids.add(layer.id)
    }

    const zone = manifest.customizationZones?.[layer.zoneId]
    if (!zone) {
      issues.push({ path: \`\${prefix}.zoneId\`, message: \`Customization zone "\${layer.zoneId}" does not exist.\` })
      continue
    }
    if (!zone.purposes.includes(layer.purpose)) {
      issues.push({
        path: \`\${prefix}.purpose\`,
        message: \`Customization zone "\${layer.zoneId}" does not allow "\${layer.purpose}" previews.\`,
      })
    }

    if (layer.purpose === 'text' && !layer.content?.trim()) {
      issues.push({ path: \`\${prefix}.content\`, message: 'Text preview layer requires non-empty content.' })
    }
    if (layer.purpose === 'tooling' && !layer.style?.trim()) {
      issues.push({ path: \`\${prefix}.style\`, message: 'Tooling preview layer requires a style id.' })
    }
    if ((layer.purpose === 'artwork' || layer.purpose === 'logo') && !layer.imageUrl?.startsWith('data:image/')) {
      issues.push({
        path: \`\${prefix}.imageUrl\`,
        message: 'Artwork/logo preview layers currently require an in-memory image data URL.',
      })
    }
    if (layer.opacity !== undefined && (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1)) {
      issues.push({ path: \`\${prefix}.opacity\`, message: 'Customization preview opacity must be between 0 and 1.' })
    }
  }

  return issues
}

function customizationCanvasSize(widthMeters: number, heightMeters: number): [number, number] {
  const aspect = Math.max(0.1, Math.min(10, widthMeters / heightMeters))
  const longEdge = 512
  if (aspect >= 1) return [longEdge, Math.max(192, Math.round(longEdge / aspect))]
  return [Math.max(192, Math.round(longEdge * aspect)), longEdge]
}

function drawToolingPattern(
  context: CanvasRenderingContext2D,
  style: string,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  context.save()
  context.beginPath()
  context.rect(left, top, width, height)
  context.clip()
  context.strokeStyle = 'rgba(45, 24, 10, .78)'
  context.lineWidth = Math.max(1.4, Math.min(width, height) * 0.012)
  context.lineCap = 'round'
  context.lineJoin = 'round'

  const step = Math.max(18, Math.min(width, height) / 5)

  if (style === 'basket-weave') {
    for (let offset = -height; offset < width + height; offset += step) {
      context.beginPath()
      context.moveTo(left + offset, top)
      context.lineTo(left + offset + height, top + height)
      context.stroke()
      context.beginPath()
      context.moveTo(left + offset, top + height)
      context.lineTo(left + offset + height, top)
      context.stroke()
    }
  } else if (style === 'geometric') {
    for (let y = top; y <= top + height + step; y += step) {
      for (let x = left; x <= left + width + step; x += step) {
        context.beginPath()
        context.moveTo(x, y - step * 0.45)
        context.lineTo(x + step * 0.45, y)
        context.lineTo(x, y + step * 0.45)
        context.lineTo(x - step * 0.45, y)
        context.closePath()
        context.stroke()
      }
    }
  } else if (style === 'border') {
    const inset = Math.max(6, Math.min(width, height) * 0.08)
    context.strokeRect(left + inset, top + inset, width - inset * 2, height - inset * 2)
    context.strokeRect(left + inset * 1.7, top + inset * 1.7, width - inset * 3.4, height - inset * 3.4)
  } else if (style === 'custom-concept') {
    context.setLineDash([step * 0.55, step * 0.32])
    for (let inset = step * 0.45; inset < Math.min(width, height) / 2; inset += step * 0.9) {
      context.strokeRect(left + inset, top + inset, width - inset * 2, height - inset * 2)
    }
  } else {
    const rows = 3
    const columns = 3
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const cx = left + width * ((column + 0.5) / columns)
        const cy = top + height * ((row + 0.5) / rows)
        const rx = width / columns * 0.36
        const ry = height / rows * 0.34
        context.beginPath()
        context.moveTo(cx - rx, cy)
        context.bezierCurveTo(cx - rx * 0.45, cy - ry, cx + rx * 0.45, cy - ry, cx + rx, cy)
        context.bezierCurveTo(cx + rx * 0.3, cy + ry * 0.95, cx - rx * 0.3, cy + ry * 0.95, cx - rx, cy)
        context.stroke()
      }
    }
  }

  context.restore()
}

function textFont(style: string | undefined, pixels: number): string {
  if (style === 'script') return \`italic 700 \${pixels}px cursive\`
  if (style === 'western') return \`700 \${pixels}px Georgia, serif\`
  if (style === 'monogram') return \`800 \${pixels}px Georgia, serif\`
  return \`800 \${pixels}px Arial, sans-serif\`
}

function drawPreviewText(
  context: CanvasRenderingContext2D,
  layer: ThreeCustomizationLayer,
  centerX: number,
  centerY: number,
  maxWidth: number,
  maxHeight: number,
) {
  const content = layer.content?.trim()
  if (!content) return

  let size = Math.max(20, Math.min(96, Math.round(maxHeight * 0.52)))
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  while (size > 20) {
    context.font = textFont(layer.style, size)
    if (context.measureText(content).width <= maxWidth) break
    size -= 2
  }

  context.globalAlpha = layer.opacity ?? 0.92
  context.font = textFont(layer.style, size)
  context.lineWidth = Math.max(1.2, size * 0.055)
  context.strokeStyle = 'rgba(225, 187, 119, .24)'
  context.strokeText(content, centerX, centerY, maxWidth)
  context.fillStyle = 'rgba(37, 18, 7, .92)'
  context.fillText(content, centerX, centerY, maxWidth)
  context.globalAlpha = 1
}

function loadPreviewImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
}

async function drawCustomizationCanvas(
  canvas: HTMLCanvasElement,
  zone: AssetManifest['customizationZones'] extends Record<string, infer T> ? T : never,
  layers: readonly ThreeCustomizationLayer[],
) {
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)

  const insetX = Math.min(canvas.width * 0.24, ((zone.safeInsetMeters ?? 0) / zone.sizeMeters[0]) * canvas.width)
  const insetY = Math.min(canvas.height * 0.24, ((zone.safeInsetMeters ?? 0) / zone.sizeMeters[1]) * canvas.height)
  const left = insetX
  const top = insetY
  const width = Math.max(1, canvas.width - insetX * 2)
  const height = Math.max(1, canvas.height - insetY * 2)

  for (const layer of layers.filter((entry) => entry.purpose === 'tooling')) {
    context.globalAlpha = layer.opacity ?? 0.72
    drawToolingPattern(context, layer.style ?? 'western-floral', left, top, width, height)
    context.globalAlpha = 1
  }

  const artworkLayers = layers.filter((entry) => (entry.purpose === 'artwork' || entry.purpose === 'logo') && entry.imageUrl)
  const textLayers = layers.filter((entry) => entry.purpose === 'text')
  const hasText = textLayers.length > 0

  for (const layer of artworkLayers) {
    const image = await loadPreviewImage(layer.imageUrl!)
    if (!image) continue
    const maxArtworkWidth = width * (hasText ? 0.56 : 0.72)
    const maxArtworkHeight = height * (hasText ? 0.48 : 0.72)
    const ratio = Math.min(maxArtworkWidth / image.naturalWidth, maxArtworkHeight / image.naturalHeight)
    const drawWidth = image.naturalWidth * ratio
    const drawHeight = image.naturalHeight * ratio
    const centerX = left + width / 2
    const centerY = top + height * (hasText ? 0.68 : 0.5)
    context.globalAlpha = layer.opacity ?? 0.96
    context.drawImage(image, centerX - drawWidth / 2, centerY - drawHeight / 2, drawWidth, drawHeight)
    context.globalAlpha = 1
  }

  textLayers.forEach((layer, index) => {
    const laneHeight = hasText ? height * 0.34 / Math.max(1, textLayers.length) : height * 0.34
    const centerY = top + height * 0.24 + laneHeight * index
    drawPreviewText(context, layer, left + width / 2, centerY, width * 0.88, laneHeight)
  })
}

function CustomizationOverlays({
  scene,
  manifest,
  layers,
}: {
  scene: THREE.Object3D
  manifest: AssetManifest
  layers: readonly ThreeCustomizationLayer[]
}) {
  const { gl, invalidate } = useThree()

  useEffect(() => {
    if (!layers.length) return

    let disposed = false
    const overlays: THREE.Mesh[] = []
    const textures: THREE.CanvasTexture[] = []
    const materials: THREE.MeshBasicMaterial[] = []
    const geometries: THREE.PlaneGeometry[] = []

    const build = async () => {
      const grouped = new Map<string, ThreeCustomizationLayer[]>()
      for (const layer of layers) {
        const entries = grouped.get(layer.zoneId) ?? []
        entries.push(layer)
        grouped.set(layer.zoneId, entries)
      }

      for (const [zoneId, zoneLayers] of grouped) {
        if (disposed) return
        const zone = manifest.customizationZones?.[zoneId]
        if (!zone) continue
        const target = scene.getObjectByName(zone.node)
        if (!target) continue

        const [canvasWidth, canvasHeight] = customizationCanvasSize(zone.sizeMeters[0], zone.sizeMeters[1])
        const canvas = document.createElement('canvas')
        canvas.width = canvasWidth
        canvas.height = canvasHeight
        await drawCustomizationCanvas(canvas, zone, zoneLayers)
        if (disposed) return

        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.generateMipmaps = false
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.anisotropy = Math.max(1, Math.min(8, gl.capabilities.getMaxAnisotropy()))
        texture.needsUpdate = true

        const geometry = new THREE.PlaneGeometry(zone.sizeMeters[0], zone.sizeMeters[1])
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        })
        material.toneMapped = false

        const normal = new THREE.Vector3(...zone.normal).normalize()
        const up = new THREE.Vector3(...zone.up).normalize()
        const right = new THREE.Vector3().crossVectors(up, normal).normalize()
        const correctedUp = new THREE.Vector3().crossVectors(normal, right).normalize()
        const basis = new THREE.Matrix4().makeBasis(right, correctedUp, normal)

        const overlay = new THREE.Mesh(geometry, material)
        overlay.name = \`SLS_CustomizationPreview_\${zoneId}\`
        overlay.position.set(...zone.origin).addScaledVector(normal, 0.0025)
        overlay.quaternion.setFromRotationMatrix(basis)
        overlay.renderOrder = 20

        target.add(overlay)
        overlays.push(overlay)
        textures.push(texture)
        materials.push(material)
        geometries.push(geometry)
      }

      invalidate()
    }

    void build()

    return () => {
      disposed = true
      for (const overlay of overlays) overlay.parent?.remove(overlay)
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
      for (const texture of textures) texture.dispose()
      invalidate()
    }
  }, [gl, invalidate, layers, manifest, scene])

  return null
}

function ProductModel({
  product,
  manifest,
  materials,
  selections,
  animationStates = {},
  materialOverrides = {},
  componentOverrides = {},
  customizationLayers = EMPTY_CUSTOMIZATION_LAYERS,
  onAssetIssues,
}: ThreeProductViewerProps) {
  const { invalidate, gl } = useThree()
  const gltf = useGLTF(manifest.model)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  const visualState = useMemo(
    () => resolveVisualState(product, manifest, selections, materialOverrides, componentOverrides),
    [componentOverrides, manifest, materialOverrides, product, selections],
  )

  useEffect(() => {
    const names: string[] = []
    scene.traverse((object) => {
      if (object.name) names.push(object.name)
      if (object instanceof THREE.Mesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
    onAssetIssues?.([
      ...validateAssetManifest(manifest, Object.keys(materials), names),
      ...validateMaterialSlotAssignments(
        manifest,
        Object.fromEntries(visualState.selectedMaterialVariants),
        materials,
      ),
      ...validateCustomizationLayers(manifest, customizationLayers),
    ])
  }, [customizationLayers, manifest, materials, onAssetIssues, scene, visualState])

  useEffect(() => {
    const createdMaterials: THREE.MeshPhysicalMaterial[] = []
    const textureCleanups: Array<() => void> = []
    const materialByVariant = new Map<string, THREE.MeshPhysicalMaterial>()
    const maxAnisotropy = gl.capabilities.getMaxAnisotropy()
    const { activeComponents, selectedMaterialVariants } = visualState

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

      let material = materialByVariant.get(variantId)
      if (!material) {
        material = createMaterial(variant)
        materialByVariant.set(variantId, material)
        createdMaterials.push(material)
        textureCleanups.push(hydrateMaterialTextures(material, variant, invalidate, maxAnisotropy))
      }

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
    gl,
    invalidate,
    materials,
    scene,
    visualState,
  ])

  return (
    <>
      <primitive object={scene} />
      <MechanicalAnimations scene={scene} manifest={manifest} animationStates={animationStates} />
      <CustomizationOverlays scene={scene} manifest={manifest} layers={customizationLayers} />
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
      minDistance={manifest.presentation?.orbit?.minDistance ?? 0.38}
      maxDistance={manifest.presentation?.orbit?.maxDistance ?? 1.6}
      minPolarAngle={manifest.presentation?.orbit?.minPolarAngle ?? 0.35}
      maxPolarAngle={manifest.presentation?.orbit?.maxPolarAngle ?? 2.55}
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
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.08
      }}
    >
      <color attach="background" args={['#12110f']} />
      <hemisphereLight args={['#fff0d5', '#211810', 1.05]} />
      <ambientLight intensity={0.72} />
      <directionalLight color="#ffe7bf" position={[3.2, 4.2, 4.8]} intensity={2.65} castShadow />
      <directionalLight color="#dbe7f2" position={[-3, 1.8, -2]} intensity={0.92} />
      <directionalLight color="#d3aa67" position={[0, -1.2, 2.8]} intensity={0.38} />

      <Suspense fallback={<LoadingFallback />}>
        <ProductModel {...props} />
        <ContactShadows
          position={[0, props.manifest.presentation?.groundY ?? -0.34, 0]}
          opacity={0.44}
          scale={props.manifest.presentation?.shadowScale ?? 1.2}
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

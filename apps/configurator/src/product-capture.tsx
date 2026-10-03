import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  buildAssetManifestScaffold,
  buildProductConstructionPacket,
  validateProductCapture,
  weldingHoodCapturePlan,
  type CapturedReferenceFrame,
  type ProductCaptureSession,
} from '@sls/product-capture'
import {
  hashFilesSequentially,
  isSha256Hex,
  reconcileReattachedReferenceSet,
  sha256Hex,
  verifyReattachedReference,
} from './capture-integrity'
import {
  captureQualityPolicy,
  evaluateCaptureQuality,
  inspectImageDimensions,
  type CaptureImageInspection,
} from './capture-quality'
import './product-capture.css'

const STORAGE_KEY = 'scorpion-product-capture:v1'

function localDateTimeValue() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function newSessionId() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 4).toUpperCase()
  return `SC-PROD-${stamp}-${suffix}`
}

function defaultSession(): ProductCaptureSession {
  return {
    schemaVersion: 1,
    capturePlanId: weldingHoodCapturePlan.id,
    captureSessionId: newSessionId(),
    productId: '',
    productLabel: 'Scorpion Leather Welding Hood',
    productCategory: 'Leather Welding Hood',
    sourceSku: '',
    operator: '',
    capturedAt: localDateTimeValue(),
    singlePhysicalUnitConfirmed: false,
    references: {},
    supplementalReferences: [],
    dimensions: weldingHoodCapturePlan.dimensionRequirements.map((requirement) => ({
      id: requirement.id,
      label: requirement.label,
    })),
    constructionNodes: weldingHoodCapturePlan.nodeRequirements.map((requirement) => ({
      role: requirement.role,
      label: requirement.label,
      nodeName: requirement.suggestedNodeName ?? '',
      status: 'pending',
    })),
    components: [],
    materialSlots: (weldingHoodCapturePlan.materialSlotRequirements ?? []).map((requirement) => ({
      slotId: requirement.slotId,
      label: requirement.label,
      materialId: '',
      nodeNames: requirement.nodeRoles.map((role) => (
        weldingHoodCapturePlan.nodeRequirements.find((node) => node.role === role)?.suggestedNodeName ?? role
      )),
      status: 'pending',
      evidenceFrameKeys: [],
    })),
    notes: '',
  }
}

function normalizeSession(input: Partial<ProductCaptureSession>): ProductCaptureSession {
  const fresh = defaultSession()
  if (input.capturePlanId && input.capturePlanId !== weldingHoodCapturePlan.id) return fresh

  const dimensionsById = new Map((input.dimensions ?? []).map((item) => [item.id, item]))
  const nodesByRole = new Map((input.constructionNodes ?? []).map((item) => [item.role, item]))
  const slotsById = new Map((input.materialSlots ?? []).map((item) => [item.slotId, item]))

  return {
    ...fresh,
    ...input,
    schemaVersion: 1,
    capturePlanId: weldingHoodCapturePlan.id,
    references: input.references ?? {},
    supplementalReferences: input.supplementalReferences ?? [],
    dimensions: weldingHoodCapturePlan.dimensionRequirements.map((requirement) => ({
      id: requirement.id,
      label: requirement.label,
      ...dimensionsById.get(requirement.id),
    })),
    constructionNodes: weldingHoodCapturePlan.nodeRequirements.map((requirement) => ({
      role: requirement.role,
      label: requirement.label,
      nodeName: requirement.suggestedNodeName ?? '',
      status: 'pending' as const,
      ...nodesByRole.get(requirement.role),
    })),
    components: input.components ?? [],
    materialSlots: (weldingHoodCapturePlan.materialSlotRequirements ?? []).map((requirement) => ({
      slotId: requirement.slotId,
      label: requirement.label,
      materialId: '',
      nodeNames: requirement.nodeRoles.map((role) => (
        weldingHoodCapturePlan.nodeRequirements.find((node) => node.role === role)?.suggestedNodeName ?? role
      )),
      status: 'pending' as const,
      evidenceFrameKeys: [],
      ...slotsById.get(requirement.slotId),
    })),
  }
}

function loadSession(): ProductCaptureSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultSession()
    return normalizeSession(JSON.parse(raw) as Partial<ProductCaptureSession>)
  } catch {
    return defaultSession()
  }
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function downloadJson(filename: string, value: unknown) {
  downloadBlob(filename, new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }))
}

function fileExtension(name: string) {
  const match = name.toLowerCase().match(/(\.[a-z0-9]{1,8})$/u)
  return match?.[1] ?? '.bin'
}

function safeFilePart(value: string, fallback: string) {
  const normalized = value.trim().replace(/[^a-z0-9-_]+/giu, '-').replace(/^-+|-+$/gu, '')
  return normalized || fallback
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  if (value >= 1024 ** 3) return (value / 1024 ** 3).toFixed(1) + ' GB'
  if (value >= 1024 ** 2) return (value / 1024 ** 2).toFixed(1) + ' MB'
  if (value >= 1024) return Math.round(value / 1024) + ' KB'
  return Math.round(value) + ' B'
}

function withInspection(frame: CapturedReferenceFrame, inspection: CaptureImageInspection): CapturedReferenceFrame {
  if (!inspection.inspectable || !inspection.widthPx || !inspection.heightPx) return frame
  return {
    ...frame,
    imageWidthPx: inspection.widthPx,
    imageHeightPx: inspection.heightPx,
  }
}

function ProductCaptureAssistant() {
  const [session, setSession] = useState<ProductCaptureSession>(loadSession)
  const [referenceFiles, setReferenceFiles] = useState<Record<string, File>>({})
  const [supplementalFiles, setSupplementalFiles] = useState<File[]>([])
  const [hashBusy, setHashBusy] = useState(false)
  const [bundleBusy, setBundleBusy] = useState(false)
  const [status, setStatus] = useState('Draft metadata stored locally. Source photo bytes remain attached only for this browser session.')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  }, [session])

  const issues = useMemo(
    () => validateProductCapture(session, weldingHoodCapturePlan),
    [session],
  )

  const requiredReferences = weldingHoodCapturePlan.referenceRequirements.filter((requirement) => requirement.required)
  const capturedRequiredReferences = requiredReferences.filter((requirement) => Boolean(session.references[requirement.key])).length
  const attachedRequiredReferences = requiredReferences.filter((requirement) => Boolean(referenceFiles[requirement.key])).length
  const selectedReferenceKeys = Object.keys(session.references)
  const attachedSelectedReferences = selectedReferenceKeys.filter((key) => Boolean(referenceFiles[key])).length
  const supplementalMetadataCount = session.supplementalReferences?.length ?? 0
  const hashedSelectedReferences = selectedReferenceKeys.filter((key) => isSha256Hex(session.references[key]?.sha256)).length
  const hashedSupplementalReferences = (session.supplementalReferences ?? []).filter((frame) => isSha256Hex(frame.sha256)).length
  const evidenceFilesAttached = attachedSelectedReferences === selectedReferenceKeys.length
    && supplementalFiles.length === supplementalMetadataCount
  const evidenceFingerprintsComplete = hashedSelectedReferences === selectedReferenceKeys.length
    && hashedSupplementalReferences === supplementalMetadataCount
  const requiredDimensions = weldingHoodCapturePlan.dimensionRequirements.filter((requirement) => requirement.required)
  const completeDimensions = requiredDimensions.filter((requirement) => {
    const value = session.dimensions.find((dimension) => dimension.id === requirement.id)?.valueMm
    return Number.isFinite(value) && (value ?? 0) > 0
  }).length
  const requiredNodes = weldingHoodCapturePlan.nodeRequirements.filter((requirement) => requirement.required)
  const confirmedNodes = requiredNodes.filter((requirement) => {
    const node = session.constructionNodes.find((entry) => entry.role === requirement.role)
    return node?.status === 'confirmed' && Boolean(node.nodeName.trim())
  }).length
  const requiredMaterialSlots = (weldingHoodCapturePlan.materialSlotRequirements ?? []).filter((requirement) => requirement.required)
  const confirmedMaterialSlots = requiredMaterialSlots.filter((requirement) => {
    const slot = session.materialSlots.find((entry) => entry.slotId === requirement.slotId)
    return slot?.status === 'confirmed' && Boolean(slot.materialId?.trim())
  }).length

  const qualitySources = useMemo(() => {
    const roleSources = weldingHoodCapturePlan.referenceRequirements.flatMap((requirement) => {
      const frame = session.references[requirement.key]
      return frame ? [{
        id: 'reference:' + requirement.key,
        label: requirement.label,
        required: requirement.required,
        frame,
      }] : []
    })
    const supplementalSources = (session.supplementalReferences ?? []).map((frame, index) => ({
      id: 'supplemental:' + index,
      label: 'Supplemental ' + String(index + 1).padStart(3, '0'),
      required: false,
      frame,
    }))
    return [...roleSources, ...supplementalSources]
  }, [session.references, session.supplementalReferences])

  const qualityReport = useMemo(() => evaluateCaptureQuality(qualitySources), [qualitySources])
  const pilotSteps = [
    {
      label: 'One physical production hood',
      detail: 'All photos and measurements belong to one exact unit.',
      ready: session.singlePhysicalUnitConfirmed === true && Boolean(session.productId.trim()) && Boolean(session.operator.trim()),
    },
    {
      label: 'Required capture coverage',
      detail: requiredReferences.length + ' required views / states / references.',
      ready: capturedRequiredReferences === requiredReferences.length,
    },
    {
      label: 'Authoritative dimensions',
      detail: requiredDimensions.length + ' direct physical measurements.',
      ready: completeDimensions === requiredDimensions.length,
    },
    {
      label: 'Semantic construction contract',
      detail: requiredNodes.length + ' required model nodes confirmed.',
      ready: confirmedNodes === requiredNodes.length,
    },
    {
      label: 'Material surface contract',
      detail: requiredMaterialSlots.length + ' required material slots confirmed.',
      ready: confirmedMaterialSlots === requiredMaterialSlots.length,
    },
    {
      label: 'Local source files verified',
      detail: attachedRequiredReferences + ' / ' + requiredReferences.length + ' required files attached · ' + (hashedSelectedReferences + hashedSupplementalReferences) + ' fingerprints recorded.',
      ready: attachedRequiredReferences === requiredReferences.length && evidenceFilesAttached && evidenceFingerprintsComplete,
    },
    {
      label: 'Capture quality preflight',
      detail: qualityReport.blockers.length + ' blocker · ' + qualityReport.warnings.length + ' warning · ' + qualityReport.sourceCount + ' source images.',
      ready: qualityReport.ready,
    },
  ]
  const pilotReady = pilotSteps.every((step) => step.ready)

  function setDimension(id: string, value: string) {
    const parsed = value.trim() === '' ? undefined : Number(value)
    setSession((current) => ({
      ...current,
      dimensions: current.dimensions.map((dimension) =>
        dimension.id === id
          ? { ...dimension, valueMm: Number.isFinite(parsed) ? parsed : undefined }
          : dimension,
      ),
    }))
  }

  async function setReference(key: string, file: File | undefined) {
    const requirement = weldingHoodCapturePlan.referenceRequirements.find((entry) => entry.key === key)
    if (!requirement) return

    if (!file) {
      setReferenceFiles((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
      setSession((current) => {
        const references = { ...current.references }
        delete references[key]
        return { ...current, references }
      })
      return
    }

    setHashBusy(true)
    setStatus('Hashing ' + file.name + ' locally…')
    try {
      const sha256 = await sha256Hex(file)
      setStatus('Inspecting ' + file.name + ' resolution and format locally…')
      const inspection = await inspectImageDimensions(file)
      const existing = session.references[key]
      const baseFrame: CapturedReferenceFrame = existing && !referenceFiles[key]
        ? verifyReattachedReference(existing, { file, sha256 })
        : {
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            lastModified: file.lastModified,
            kind: requirement.kind,
            sha256,
          }
      const frame = withInspection(baseFrame, inspection)

      setReferenceFiles((current) => ({ ...current, [key]: file }))
      setSession((current) => ({
        ...current,
        references: { ...current.references, [key]: frame },
      }))
      const resolution = frame.imageWidthPx && frame.imageHeightPx
        ? ' · ' + frame.imageWidthPx + '×' + frame.imageHeightPx + ' px'
        : ' · dimensions unavailable'
      setStatus((existing && !referenceFiles[key]
        ? 'Reference reattached and SHA-256 verified'
        : 'Reference attached and SHA-256 fingerprint recorded') + resolution + '.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Reference fingerprint verification failed.')
    } finally {
      setHashBusy(false)
    }
  }

  async function setSupplementalReferenceFiles(files: File[]) {
    if (!files.length) {
      setSupplementalFiles([])
      setSession((current) => ({ ...current, supplementalReferences: [] }))
      return
    }

    setHashBusy(true)
    try {
      const hashed = await hashFilesSequentially(files, (completed, total, file) => {
        setStatus('Hashing supplemental evidence ' + completed + ' / ' + total + ' · ' + file.name)
      })
      const inspections: CaptureImageInspection[] = []
      for (let index = 0; index < hashed.length; index += 1) {
        const entry = hashed[index]!
        setStatus('Inspecting supplemental image ' + (index + 1) + ' / ' + hashed.length + ' · ' + entry.file.name)
        inspections.push(await inspectImageDimensions(entry.file))
      }

      const existing = session.supplementalReferences ?? []
      const reattaching = existing.length > 0 && supplementalFiles.length === 0
      if (reattaching) {
        const reconciled = reconcileReattachedReferenceSet(existing, hashed)
        const inspectionByHash = new Map(hashed.map((entry, index) => [entry.sha256, inspections[index]!]))
        const frames = reconciled.frames.map((frame) => (
          isSha256Hex(frame.sha256)
            ? withInspection(frame, inspectionByHash.get(frame.sha256) ?? { inspectable: false })
            : frame
        ))
        setSupplementalFiles(reconciled.files)
        setSession((current) => ({ ...current, supplementalReferences: frames }))
        setStatus('Supplemental evidence set reattached, SHA-256 verified and quality-inspected.')
      } else {
        setSupplementalFiles(hashed.map((entry) => entry.file))
        setSession((current) => ({
          ...current,
          supplementalReferences: hashed.map(({ file, sha256 }, index) => withInspection({
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            lastModified: file.lastModified,
            kind: 'supplemental-reference',
            sha256,
          }, inspections[index] ?? { inspectable: false })),
        }))
        setStatus('Supplemental evidence fingerprints and image dimensions recorded locally.')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Supplemental evidence fingerprint verification failed.')
    } finally {
      setHashBusy(false)
    }
  }

  function clearSession() {
    const next = defaultSession()
    setSession(next)
    setReferenceFiles({})
    setSupplementalFiles([])
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setStatus('New product-capture session started.')
  }

  function validatedConstructionPacket(generatedAt = new Date().toISOString()) {
    return buildProductConstructionPacket({
      session,
      plan: weldingHoodCapturePlan,
      generatedAt,
    })
  }

  function exportConstructionPacket() {
    try {
      const packet = validatedConstructionPacket()
      const productId = safeFilePart(session.productId, 'product')
      downloadJson(`${productId}-construction-packet.json`, packet)
      setStatus('Validated construction packet downloaded. No production assets were modified.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Construction packet could not be generated.')
    }
  }

  function exportManifestScaffold() {
    try {
      const packet = validatedConstructionPacket()
      const productId = safeFilePart(session.productId, 'product').toLowerCase()
      const manifest = buildAssetManifestScaffold({
        construction: packet,
        plan: weldingHoodCapturePlan,
        assetId: `${productId}-v1`,
        modelFileName: 'model.glb',
      })
      downloadJson(`${productId}-asset-manifest-scaffold.json`, manifest)
      setStatus('Physical-capture production-candidate manifest downloaded. Geometry, UV quality, cameras, motion and fidelity still require authoring and Digital Twin QA.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Asset manifest scaffold could not be generated.')
    }
  }

  async function exportFieldCaptureBundle() {
    setBundleBusy(true)
    try {
      if (!qualityReport.ready) {
        throw new Error('Capture quality preflight has ' + qualityReport.blockers.length + ' blocker(s). Resolve them before building the field evidence bundle.')
      }
      const generatedAt = new Date().toISOString()
      const packet = validatedConstructionPacket(generatedAt)
      const missingKeys = Object.keys(session.references).filter((key) => !referenceFiles[key])
      if (missingKeys.length) {
        throw new Error('Reattach ' + missingKeys.length + ' selected reference photo(s) before building the field evidence bundle.')
      }
      if ((session.supplementalReferences?.length ?? 0) !== supplementalFiles.length) {
        throw new Error('Reattach the supplemental photo set before building the field evidence bundle.')
      }

      const productPart = safeFilePart(session.productId, 'product')
      const assetPart = productPart.toLowerCase() + '-v1'
      const manifest = buildAssetManifestScaffold({
        construction: packet,
        plan: weldingHoodCapturePlan,
        assetId: assetPart,
        modelFileName: 'model.glb',
      })

      const referenceIndex: Array<{
        role: string
        label: string
        required: boolean
        archivePath: string
        originalName: string
        sizeBytes: number
        type: string
        lastModified: number
        sha256: string
        imageWidthPx?: number
        imageHeightPx?: number
      }> = []
      const supplementalIndex: Array<{
        archivePath: string
        originalName: string
        sizeBytes: number
        type: string
        lastModified: number
        sha256: string
        imageWidthPx?: number
        imageHeightPx?: number
      }> = []
      const entries: Array<{ path: string; data: Blob | string | Uint8Array }> = []

      weldingHoodCapturePlan.referenceRequirements.forEach((requirement, index) => {
        const metadata = session.references[requirement.key]
        const file = referenceFiles[requirement.key]
        if (!metadata || !file) return
        const archivePath = 'references/' + String(index + 1).padStart(2, '0') + '-' + safeFilePart(requirement.key, 'reference') + fileExtension(file.name)
        entries.push({ path: archivePath, data: file })
        const sha256 = metadata.sha256
        if (!isSha256Hex(sha256)) throw new Error('Reference fingerprint is missing: ' + requirement.label)
        referenceIndex.push({
          role: requirement.key,
          label: requirement.label,
          required: requirement.required,
          archivePath,
          originalName: file.name,
          sizeBytes: file.size,
          type: file.type || 'application/octet-stream',
          lastModified: file.lastModified,
          sha256,
          ...(Number.isFinite(metadata.imageWidthPx) ? { imageWidthPx: metadata.imageWidthPx } : {}),
          ...(Number.isFinite(metadata.imageHeightPx) ? { imageHeightPx: metadata.imageHeightPx } : {}),
        })
      })

      supplementalFiles.forEach((file, index) => {
        const metadata = session.supplementalReferences?.[index]
        const sha256 = metadata?.sha256
        if (!metadata || !isSha256Hex(sha256)) throw new Error('Supplemental fingerprint is missing for file ' + (index + 1) + '.')
        const baseName = file.name.replace(/\.[^.]+$/u, '')
        const archivePath = 'supplemental/' + String(index + 1).padStart(3, '0') + '-' + safeFilePart(baseName, 'supplemental') + fileExtension(file.name)
        entries.push({ path: archivePath, data: file })
        supplementalIndex.push({
          archivePath,
          originalName: file.name,
          sizeBytes: file.size,
          type: file.type || 'application/octet-stream',
          lastModified: file.lastModified,
          sha256,
          ...(Number.isFinite(metadata.imageWidthPx) ? { imageWidthPx: metadata.imageWidthPx } : {}),
          ...(Number.isFinite(metadata.imageHeightPx) ? { imageHeightPx: metadata.imageHeightPx } : {}),
        })
      })

      const bundleIndex = {
        schemaVersion: 1,
        bundleType: 'sls-product-capture-evidence',
        generatedAt,
        productId: packet.productId,
        productLabel: packet.productLabel,
        captureSessionId: packet.sourceCaptureSessionId,
        capturePlanId: packet.capturePlanId,
        assetId: manifest.assetId,
        authority: {
          singlePhysicalUnitConfirmed: packet.provenance.singlePhysicalUnitConfirmed === true,
          physicalProductRemainsGeometryAuthority: true,
          localOnlyPackaging: true,
        },
        totals: {
          roleReferences: referenceIndex.length,
          supplementalReferences: supplementalIndex.length,
          sourceImages: referenceIndex.length + supplementalIndex.length,
          sourceBytes: [...referenceIndex, ...supplementalIndex].reduce((sum, entry) => sum + entry.sizeBytes, 0),
        },
        qualityPreflight: {
          policy: {
            recommendedImageCountMin: captureQualityPolicy.recommendedImageCountMin,
            recommendedImageCountMax: captureQualityPolicy.recommendedImageCountMax,
            minimumPixels: captureQualityPolicy.minimumPixels,
            minimumShortEdgePx: captureQualityPolicy.minimumShortEdgePx,
            recommendedPixels: captureQualityPolicy.recommendedPixels,
            recommendedShortEdgePx: captureQualityPolicy.recommendedShortEdgePx,
          },
          ready: qualityReport.ready,
          blockerCount: qualityReport.blockers.length,
          warningCount: qualityReport.warnings.length,
          inspectableImages: qualityReport.inspectableImages,
          recommendedResolutionImages: qualityReport.recommendedResolutionImages,
          lowResolutionImages: qualityReport.lowResolutionImages,
          cautiousFormatImages: qualityReport.cautiousFormatImages,
          duplicateGroups: qualityReport.duplicateGroups,
        },
        references: referenceIndex,
        supplemental: supplementalIndex,
      }

      const readme = [
        'Scorpion Leather Studio — Product Capture Evidence Bundle',
        '',
        'Product: ' + packet.productLabel + ' (' + packet.productId + ')',
        'Capture session: ' + packet.sourceCaptureSessionId,
        'Capture plan: ' + packet.capturePlanId,
        'Generated: ' + generatedAt,
        '',
        'AUTHORITY',
        '- These source photographs and direct physical measurements describe one exact physical production unit.',
        '- The physical product and measurements remain geometry authority.',
        '- Reconstruction/AI output is a candidate only and must pass Blender authoring/preflight and Digital Twin QA.',
        '- Provider-generated materials are reference-only unless separately approved through the Scorpion material pipeline.',
        '',
        'CONTENTS',
        '- metadata/capture-session.json — field-session metadata.',
        '- metadata/construction-packet.json — validated physical construction contract.',
        '- metadata/asset-manifest-scaffold.json — production-candidate runtime scaffold.',
        '- metadata/capture-bundle-index.json — deterministic mapping from capture roles to source files.',
        '- references/ — named required/optional capture-plan photographs.',
        '- supplemental/ — additional overlapping orbit/detail photographs for reconstruction quality.',
        '- SHA256SUMS.txt — integrity ledger for bundle members.',
        '',
        'QUALITY PREFLIGHT',
        '- Source images: ' + qualityReport.sourceCount + ' (working target ' + captureQualityPolicy.recommendedImageCountMin + '–' + captureQualityPolicy.recommendedImageCountMax + ').',
        '- Resolution inspected: ' + qualityReport.inspectableImages + '; recommended-resolution: ' + qualityReport.recommendedResolutionImages + '; low-resolution warnings: ' + qualityReport.lowResolutionImages + '.',
        '- Exact duplicate groups: ' + qualityReport.duplicateGroups + '; blockers: ' + qualityReport.blockers.length + '; warnings: ' + qualityReport.warnings.length + '.',
        '- Estimated source bytes: ' + formatBytes(qualityReport.totalBytes) + '.',
        '',
        'The ZIP uses stored (uncompressed) entries intentionally: camera files are already compressed, so this avoids wasting mobile CPU/battery on ineffective recompression.',
        '',
      ].join('\n')

      entries.unshift(
        { path: 'README.txt', data: readme },
        { path: 'metadata/capture-session.json', data: JSON.stringify(session, null, 2) + '\n' },
        { path: 'metadata/construction-packet.json', data: JSON.stringify(packet, null, 2) + '\n' },
        { path: 'metadata/asset-manifest-scaffold.json', data: JSON.stringify(manifest, null, 2) + '\n' },
        { path: 'metadata/capture-bundle-index.json', data: JSON.stringify(bundleIndex, null, 2) + '\n' },
      )

      const sourceHashes = new Map<string, string>([
        ...referenceIndex.map((entry) => [entry.archivePath, entry.sha256] as const),
        ...supplementalIndex.map((entry) => [entry.archivePath, entry.sha256] as const),
      ])
      const checksumLines: string[] = []
      for (const entry of entries) {
        checksumLines.push((sourceHashes.get(entry.path) ?? await sha256Hex(entry.data)) + '  ' + entry.path)
      }
      entries.push({ path: 'SHA256SUMS.txt', data: checksumLines.join('\n') + '\n' })

      setStatus('Packaging ' + (referenceIndex.length + supplementalIndex.length) + ' verified source photographs locally…')
      const { buildStoredZip } = await import('./capture-bundle')
      const zip = await buildStoredZip(entries, new Date(generatedAt))
      downloadBlob(
        safeFilePart(packet.productId, 'product') + '-' + safeFilePart(packet.sourceCaptureSessionId, 'capture') + '-field-evidence.zip',
        zip,
      )
      setStatus('Verified field evidence ZIP downloaded with SHA256SUMS.txt. Source photos stayed local; nothing was uploaded by Product Capture.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Field evidence bundle could not be generated.')
    } finally {
      setBundleBusy(false)
    }
  }

  return (
    <main className="product-capture-shell">
      <header className="product-capture-header">
        <div>
          <p className="eyebrow">SCORPION LEATHER STUDIO · V0.46</p>
          <h1>Product Capture</h1>
          <p>
            Convert a real Scorpion product into a measured, evidence-backed construction specification before any
            reconstruction or production GLB is trusted.
          </p>
        </div>
        <nav aria-label="Studio tools">
          <a href="/">Customer Studio</a>
          <a href="/capture.html">Material Capture</a>
          <a href="/materials.html">Material Lab</a>
          <a href="/digital-twin-ingestion.html">3D Ingestion</a>
          <a href="/material-qa.html">Material QA</a>
        </nav>
      </header>

      <p className="local-note">
        Local-first capture: selected photographs are never uploaded by this tool. SHA-256 fingerprints and image dimensions are inspected locally and stored with draft metadata.
        Source-photo bytes remain attached only for the current page session; after reload, the original files must be reattached and must match their saved fingerprints before export.
      </p>

      <section className="capture-metrics" aria-label="Capture readiness">
        <div><span>Session</span><strong>{session.captureSessionId}</strong></div>
        <div><span>Required views</span><strong>{capturedRequiredReferences} / {requiredReferences.length}</strong></div>
        <div><span>Dimensions</span><strong>{completeDimensions} / {requiredDimensions.length}</strong></div>
        <div><span>Semantic nodes</span><strong>{confirmedNodes} / {requiredNodes.length}</strong></div>
        <div><span>Files attached now</span><strong>{attachedSelectedReferences + supplementalFiles.length} / {selectedReferenceKeys.length + supplementalMetadataCount}</strong></div>
        <div><span>SHA-256 verified</span><strong>{hashedSelectedReferences + hashedSupplementalReferences} / {selectedReferenceKeys.length + supplementalMetadataCount}</strong></div>
      </section>

      <section className={pilotReady ? 'pilot-readiness is-ready' : 'pilot-readiness'} aria-label="First welding hood production pilot">
        <div className="pilot-readiness__heading">
          <div>
            <span>FIRST REAL ASSET PILOT</span>
            <strong>Scorpion leather welding hood</strong>
            <small>The current customer Studio hood remains a development placeholder until a physical-capture candidate passes the complete reconstruction and QA chain.</small>
          </div>
          <em>{pilotReady ? 'Field evidence bundle ready' : pilotSteps.filter((step) => step.ready).length + ' / ' + pilotSteps.length + ' ready'}</em>
        </div>
        <div className="pilot-checklist">
          {pilotSteps.map((step) => (
            <div className={step.ready ? 'is-ready' : ''} key={step.label}>
              <span>{step.ready ? 'READY' : 'PENDING'}</span>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </div>
          ))}
        </div>
        <p>
          A generated manifest scaffold is tagged <b>production-candidate / physical-capture</b>. The field bundle keeps the actual source images beside the capture/construction metadata; development placeholder manifests remain blocked from production promotion.
        </p>
      </section>

      <section className={qualityReport.ready ? 'quality-preflight is-ready' : 'quality-preflight has-blockers'} aria-label="Capture quality preflight">
        <div className="quality-preflight__heading">
          <div>
            <span>CAPTURE QUALITY PREFLIGHT</span>
            <strong>{qualityReport.ready ? 'No objective quality blockers' : qualityReport.blockers.length + ' blocker' + (qualityReport.blockers.length === 1 ? '' : 's') + ' must be resolved'}</strong>
            <small>SLS internal field guidance only. Low resolution, cautious formats and image-count targets are advisory; exact duplicate required-role evidence and ZIP-limit risk are blocking.</small>
          </div>
          <em>{qualityReport.blockers.length} blocker · {qualityReport.warnings.length} warning</em>
        </div>
        <div className="quality-preflight__grid">
          <div><span>Source images</span><strong>{qualityReport.sourceCount}</strong><small>Target {captureQualityPolicy.recommendedImageCountMin}–{captureQualityPolicy.recommendedImageCountMax}</small></div>
          <div><span>Estimated source size</span><strong>{formatBytes(qualityReport.totalBytes)}</strong><small>Before small metadata overhead</small></div>
          <div><span>Resolution inspected</span><strong>{qualityReport.inspectableImages} / {qualityReport.sourceCount}</strong><small>{qualityReport.recommendedResolutionImages} at recommended level</small></div>
          <div><span>Low resolution</span><strong>{qualityReport.lowResolutionImages}</strong><small>Below 2 MP / 1080 px short edge</small></div>
          <div><span>Exact duplicate groups</span><strong>{qualityReport.duplicateGroups}</strong><small>Required-role duplicates block export</small></div>
          <div><span>Cautious formats</span><strong>{qualityReport.cautiousFormatImages}</strong><small>JPEG / PNG / WebP preferred</small></div>
        </div>
        {qualityReport.blockers.length || qualityReport.warnings.length ? (
          <details className="quality-findings">
            <summary>Review quality findings</summary>
            <ul>
              {[...qualityReport.blockers, ...qualityReport.warnings].slice(0, 12).map((finding, index) => (
                <li className={finding.severity} key={finding.code + index}>
                  <b>{finding.severity === 'blocker' ? 'BLOCKER' : 'WARNING'}</b>
                  <span>{finding.message}</span>
                </li>
              ))}
              {qualityReport.blockers.length + qualityReport.warnings.length > 12 ? (
                <li><span>+ {qualityReport.blockers.length + qualityReport.warnings.length - 12} additional quality findings</span></li>
              ) : null}
            </ul>
          </details>
        ) : (
          <p>No capture-quality findings yet. Add source images to run the local preflight.</p>
        )}
      </section>

      <section className="product-capture-panel">
        <div className="section-heading">
          <span>01</span>
          <div>
            <h2>Product identity & provenance</h2>
            <p>Identify the exact physical unit being captured. Do not mix photographs from different construction versions.</p>
          </div>
        </div>

        <div className="form-grid">
          <label>Product ID
            <input value={session.productId} onChange={(event) => setSession({ ...session, productId: event.target.value })} placeholder="SC-WH-001" />
          </label>
          <label>Product label
            <input value={session.productLabel} onChange={(event) => setSession({ ...session, productLabel: event.target.value })} />
          </label>
          <label>Category
            <input value={session.productCategory} onChange={(event) => setSession({ ...session, productCategory: event.target.value })} />
          </label>
          <label>Internal SKU / shop code
            <input value={session.sourceSku ?? ''} onChange={(event) => setSession({ ...session, sourceSku: event.target.value })} placeholder="Optional until confirmed" />
          </label>
          <label>Capture operator
            <input value={session.operator} onChange={(event) => setSession({ ...session, operator: event.target.value })} />
          </label>
          <label>Captured at
            <input type="datetime-local" value={session.capturedAt.slice(0, 16)} onChange={(event) => setSession({ ...session, capturedAt: event.target.value })} />
          </label>
        </div>
        <label className={session.singlePhysicalUnitConfirmed ? 'unit-attestation is-confirmed' : 'unit-attestation'}>
          <input
            aria-label="Confirm one exact physical production unit"
            type="checkbox"
            checked={session.singlePhysicalUnitConfirmed === true}
            onChange={(event) => setSession({ ...session, singlePhysicalUnitConfirmed: event.target.checked })}
          />
          <span>
            <strong>One exact physical production unit confirmed</strong>
            <small>Every measurement and reference in this session belongs to this same hood. Do not mix photos from another hood, revision, repaired sample, or prototype.</small>
          </span>
        </label>
      </section>

      <section className="product-capture-panel">
        <div className="section-heading">
          <span>02</span>
          <div>
            <h2>Authoritative dimensions</h2>
            <p>Record direct physical measurements in millimeters. Photographs are evidence; they are not the authority for scale.</p>
          </div>
        </div>

        {(['envelope', 'visor', 'construction'] as const).map((group) => (
          <div className="dimension-group" key={group}>
            <h3>{group === 'envelope' ? 'Overall envelope' : group === 'visor' ? 'Visor & lens' : 'Construction'}</h3>
            <div className="dimension-grid">
              {weldingHoodCapturePlan.dimensionRequirements
                .filter((requirement) => requirement.group === group)
                .map((requirement) => {
                  const dimension = session.dimensions.find((entry) => entry.id === requirement.id)
                  return (
                    <label key={requirement.id}>
                      {requirement.label} <span>mm</span>
                      <input
                        aria-label={`${requirement.label} millimeters`}
                        inputMode="decimal"
                        type="number"
                        min="0"
                        step="0.1"
                        value={dimension?.valueMm ?? ''}
                        onChange={(event) => setDimension(requirement.id, event.target.value)}
                      />
                    </label>
                  )
                })}
            </div>
          </div>
        ))}
      </section>

      <section className="product-capture-panel">
        <div className="section-heading">
          <span>03</span>
          <div>
            <h2>Reference coverage</h2>
            <p>Capture the real construction from enough angles to prevent the reconstruction stage from inventing seams, hardware, shape or movement.</p>
          </div>
        </div>

        <div className="reference-list">
          {weldingHoodCapturePlan.referenceRequirements.map((requirement, index) => {
            const selected = session.references[requirement.key]
            const attached = referenceFiles[requirement.key]
            const rowClass = attached
              ? 'reference-row is-captured'
              : selected
                ? 'reference-row is-metadata-only'
                : 'reference-row'
            return (
              <div className={rowClass} key={requirement.key}>
                <span className="reference-code">{String(index + 1).padStart(2, '0')}</span>
                <div className="reference-info">
                  <strong>{requirement.label}{requirement.required ? ' · Required' : ' · Optional'}</strong>
                  <p>{requirement.purpose}</p>
                  {selected ? (
                    <>
                      <small className={attached ? '' : 'needs-reattach'}>
                        {selected.name} · {(selected.size / 1024 / 1024).toFixed(1)} MB · {attached ? 'source attached now' : 'metadata only — reattach source'}
                      </small>
                      <small className="hash-line">
                        SHA-256 · {isSha256Hex(selected.sha256) ? selected.sha256.slice(0, 16) + '…' : 'legacy metadata — fingerprint on reattach'}
                      </small>
                      <small className="quality-line">
                        {selected.imageWidthPx && selected.imageHeightPx
                          ? selected.imageWidthPx + '×' + selected.imageHeightPx + ' px · ' + ((selected.imageWidthPx * selected.imageHeightPx) / 1_000_000).toFixed(1) + ' MP'
                          : 'Resolution not inspected yet'}
                        {' · '}{selected.type || 'unknown format'}
                      </small>
                    </>
                  ) : null}
                </div>
                <label className="file-button">
                  <input
                    aria-label={`${requirement.label} reference file`}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) => {
                      void setReference(requirement.key, event.target.files?.[0])
                      event.target.value = ''
                    }}
                  />
                  <span>{selected ? (attached ? 'Replace' : 'Reattach photo') : 'Select / take photo'}</span>
                </label>
                {selected ? (
                  <button type="button" className="clear-button" onClick={() => setReference(requirement.key, undefined)}>Clear</button>
                ) : null}
              </div>
            )
          })}
        </div>

        <div className={(session.supplementalReferences?.length ?? 0) ? 'supplemental-capture has-files' : 'supplemental-capture'}>
          <div className="supplemental-copy">
            <span>SUPPLEMENTAL RECONSTRUCTION SET</span>
            <strong>Overlapping orbit & construction coverage</strong>
            <p>
              The 18 required roles are the minimum evidence contract. For the first production hood, add overlapping photographs around the object and detail areas until the total set is roughly 60–120 sharp images when practical.
            </p>
            <small>
              {session.supplementalReferences?.length ?? 0} supplemental metadata file{(session.supplementalReferences?.length ?? 0) === 1 ? '' : 's'} · {supplementalFiles.length} source file{supplementalFiles.length === 1 ? '' : 's'} attached now · {hashedSupplementalReferences} fingerprint{hashedSupplementalReferences === 1 ? '' : 's'}
            </small>
          </div>
          <div className="supplemental-actions">
            <label className="file-button supplemental-select">
              <input
                aria-label="Supplemental reconstruction photos"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  void setSupplementalReferenceFiles(Array.from(event.target.files ?? []))
                  event.target.value = ''
                }}
              />
              <span>{(session.supplementalReferences?.length ?? 0) ? (supplementalFiles.length ? 'Replace supplemental set' : 'Reattach supplemental set') : 'Select supplemental photos'}</span>
            </label>
            {(session.supplementalReferences?.length ?? 0) ? (
              <button type="button" className="clear-button" disabled={hashBusy} onClick={() => void setSupplementalReferenceFiles([])}>Clear supplemental</button>
            ) : null}
          </div>
          {(session.supplementalReferences?.length ?? 0) ? (
            <div className="supplemental-preview" aria-label="Supplemental capture metadata">
              {(session.supplementalReferences ?? []).slice(0, 8).map((frame, index) => (
                <span key={frame.name + frame.lastModified + index}>{String(index + 1).padStart(3, '0')} · {frame.name}</span>
              ))}
              {(session.supplementalReferences?.length ?? 0) > 8 ? <em>+ {(session.supplementalReferences?.length ?? 0) - 8} more</em> : null}
              {!supplementalFiles.length ? <b>Source bytes are not attached in this browser session.</b> : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="product-capture-panel">
        <div className="section-heading">
          <span>04</span>
          <div>
            <h2>Semantic model contract</h2>
            <p>Confirm the stable names the future production asset must expose. Suggested names are conventions, not proof of real construction.</p>
          </div>
        </div>

        <div className="node-list">
          {weldingHoodCapturePlan.nodeRequirements.map((requirement) => {
            const node = session.constructionNodes.find((entry) => entry.role === requirement.role)
            if (!node) return null
            return (
              <div className={`node-row${node.status === 'confirmed' ? ' is-confirmed' : ''}`} key={requirement.role}>
                <div className="node-role">
                  <strong>{requirement.label}</strong>
                  <small>{requirement.role}</small>
                </div>
                <label>
                  Semantic node name
                  <input
                    aria-label={`${requirement.label} semantic node name`}
                    value={node.nodeName}
                    onChange={(event) => setSession((current) => ({
                      ...current,
                      constructionNodes: current.constructionNodes.map((entry) =>
                        entry.role === requirement.role ? { ...entry, nodeName: event.target.value } : entry,
                      ),
                    }))}
                  />
                </label>
                <label className="confirm-node">
                  <input
                    aria-label={`Confirm ${requirement.label}`}
                    type="checkbox"
                    checked={node.status === 'confirmed'}
                    onChange={(event) => setSession((current) => ({
                      ...current,
                      constructionNodes: current.constructionNodes.map((entry) =>
                        entry.role === requirement.role
                          ? { ...entry, status: event.target.checked ? 'confirmed' : 'pending' }
                          : entry,
                      ),
                    }))}
                  />
                  <span>Confirmed</span>
                </label>
              </div>
            )
          })}
        </div>
      </section>

      <section className="product-capture-panel">
        <div className="section-heading">
          <span>05</span>
          <div>
            <h2>Material-ready surface contract</h2>
            <p>Bind semantic meshes to stable material slots before reconstruction. These IDs become the interface for leather, hardware and lens swaps.</p>
          </div>
        </div>

        <div className="material-slot-list">
          {(weldingHoodCapturePlan.materialSlotRequirements ?? []).map((requirement) => {
            const slot = session.materialSlots.find((entry) => entry.slotId === requirement.slotId)
            if (!slot) return null
            return (
              <div className={slot.status === 'confirmed' ? 'material-slot-row is-confirmed' : 'material-slot-row'} key={requirement.slotId}>
                <div className="material-slot-meta">
                  <strong>{requirement.label}</strong>
                  <small>{requirement.slotId} · {requirement.kind}</small>
                  <em>
                    {requirement.requiresUv0 ? 'UV0 required' : 'UV0 optional'} · {requirement.requiresNormals ? 'normals required' : 'normals optional'} · tangents {requirement.tangents}
                    {requirement.metersPerUvUnit ? ` · 1 UV unit = ${requirement.metersPerUvUnit} m` : ''}
                  </em>
                </div>
                <label>
                  Material registry ID
                  <input
                    aria-label={`${requirement.label} material registry ID`}
                    value={slot.materialId ?? ''}
                    placeholder={requirement.kind === 'leather' ? 'SCL-…' : requirement.kind === 'metal' ? 'SCH-…' : 'SGL-…'}
                    onChange={(event) => setSession((current) => ({
                      ...current,
                      materialSlots: current.materialSlots.map((entry) => (
                        entry.slotId === requirement.slotId ? { ...entry, materialId: event.target.value } : entry
                      )),
                    }))}
                  />
                </label>
                <div className="material-slot-nodes">
                  <span>Bound mesh nodes</span>
                  <code>{slot.nodeNames.join(', ') || 'None'}</code>
                </div>
                <label className="confirm-node">
                  <input
                    aria-label={`Confirm ${requirement.label} material slot`}
                    type="checkbox"
                    checked={slot.status === 'confirmed'}
                    onChange={(event) => setSession((current) => ({
                      ...current,
                      materialSlots: current.materialSlots.map((entry) => (
                        entry.slotId === requirement.slotId
                          ? { ...entry, status: event.target.checked ? 'confirmed' : 'pending' }
                          : entry
                      )),
                    }))}
                  />
                  <span>Confirmed</span>
                </label>
              </div>
            )
          })}
        </div>
      </section>

      <section className="product-capture-panel">
        <div className="section-heading">
          <span>06</span>
          <div>
            <h2>3D authoring contract</h2>
            <p>Use the same physical UV scale, semantic names and placement zones in Blender so materials and customization stay reusable across products.</p>
          </div>
        </div>

        <div className="authoring-contract">
          <div className="authoring-standard">
            <strong>Physical UV convention</strong>
            <span>1 UV unit = 1 meter on material-ready surfaces</span>
            <small>Captured material tile size controls grain repeat. Do not resize leather grain independently per product.</small>
          </div>
          {(weldingHoodCapturePlan.customizationZoneRequirements ?? []).map((zone) => (
            <div className="authoring-zone" key={zone.zoneId}>
              <div>
                <strong>{zone.label}</strong>
                <small>{zone.zoneId} · node role {zone.nodeRole}</small>
              </div>
              <span>{zone.purposes.join(' · ')}</span>
              <code>{Math.round(zone.sizeMeters[0] * 1000)} × {Math.round(zone.sizeMeters[1] * 1000)} mm · inset {Math.round((zone.safeInsetMeters ?? 0) * 1000)} mm</code>
            </div>
          ))}
        </div>
      </section>

      <section className="product-capture-panel">
        <div className="section-heading">
          <span>07</span>
          <div>
            <h2>Validation & export</h2>
            <p>A reconstruction-ready packet is created only when the capture plan passes. This remains a manual gate before any GLB or manifest promotion.</p>
          </div>
        </div>

        <label className="notes-field">
          Construction notes
          <textarea
            rows={5}
            value={session.notes ?? ''}
            onChange={(event) => setSession({ ...session, notes: event.target.value })}
            placeholder="Document version differences, uncertain details, repair history, sample defects or anything the modeler must not infer."
          />
        </label>

        <div className={`validation-state${issues.length === 0 ? ' is-ready' : ''}`}>
          <div>
            <strong>{issues.length === 0 ? 'Capture gate passed' : `${issues.length} validation item${issues.length === 1 ? '' : 's'} remaining`}</strong>
            <p>{issues.length === 0
              ? 'The physical-product record is ready for controlled digital-twin reconstruction.'
              : 'Complete the required evidence before treating this product as reconstruction-ready.'}</p>
          </div>
          {issues.length ? (
            <ul>
              {issues.slice(0, 8).map((entry) => <li key={entry.path + entry.message}>{entry.message}</li>)}
              {issues.length > 8 ? <li>+ {issues.length - 8} additional validation items</li> : null}
            </ul>
          ) : null}
        </div>

        <div className={pilotReady ? 'bundle-state is-ready' : 'bundle-state'}>
          <div>
            <strong>{qualityReport.blockers.length
              ? 'Field evidence ZIP blocked by quality preflight'
              : pilotReady
                ? 'Field evidence ZIP is ready'
                : 'Field evidence ZIP still needs capture / verification'}</strong>
            <p>
              The bundle contains the actual attached photographs plus capture session, validated construction packet, production-candidate manifest scaffold, quality summary and deterministic file index. Advisory warnings do not block export; objective evidence-quality blockers do.
            </p>
          </div>
          <span>{attachedSelectedReferences + supplementalFiles.length} source file{attachedSelectedReferences + supplementalFiles.length === 1 ? '' : 's'} attached · {qualityReport.warnings.length} quality warning{qualityReport.warnings.length === 1 ? '' : 's'} · ZIP store mode</span>
        </div>

        <div className="export-actions">
          <button
            type="button"
            className="primary bundle-download"
            disabled={!pilotReady || bundleBusy || hashBusy}
            onClick={() => void exportFieldCaptureBundle()}
          >
            {hashBusy ? 'Verifying source fingerprints…' : bundleBusy ? 'Building verified field evidence ZIP…' : 'Download verified field evidence bundle (.zip)'}
          </button>
          <button
            type="button"
            onClick={() => {
              const productId = safeFilePart(session.productId, 'product')
              downloadJson(`${productId}-capture-session.json`, session)
              setStatus('Raw product-capture session downloaded.')
            }}
          >
            Download capture session
          </button>
          <button type="button" disabled={issues.length > 0} onClick={exportConstructionPacket}>
            Download construction packet
          </button>
          <button type="button" disabled={issues.length > 0} onClick={exportManifestScaffold}>
            Download 3D manifest scaffold
          </button>
          <button type="button" className="danger" onClick={clearSession}>New / clear session</button>
        </div>

        <p className="status-line" role="status">{status}</p>
      </section>
    </main>
  )
}

const root = document.getElementById('product-capture-root')
if (root) createRoot(root).render(<ProductCaptureAssistant />)

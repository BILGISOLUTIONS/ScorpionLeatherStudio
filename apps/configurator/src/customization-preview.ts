import type { StudioPersonalization } from '@sls/order-engine'
import type { AssetManifest } from '@sls/product-schema'
import type { ThreeCustomizationLayer } from '@sls/three-renderer'
import type { ArtworkAttachment } from './studio-types'

export interface CustomizationPreviewState {
  active: boolean
  renderable: boolean
  zoneId?: string
  zoneLabel?: string
  cameraPreset?: string
  layers: readonly ThreeCustomizationLayer[]
  message: string
}

function normalizePlacement(value: string): string {
  return value.trim().toLowerCase()
}

export function resolveCustomizationZoneId(
  manifest: AssetManifest,
  placement: string,
): string | undefined {
  const normalized = normalizePlacement(placement)
  if (!normalized) return undefined

  for (const [zoneId, zone] of Object.entries(manifest.customizationZones ?? {})) {
    if ((zone.placementLabels ?? []).some((label) => normalizePlacement(label) === normalized)) {
      return zoneId
    }
  }

  return undefined
}

export function buildCustomizationPreview(
  manifest: AssetManifest,
  personalization: StudioPersonalization,
  artwork: ArtworkAttachment | null,
): CustomizationPreviewState {
  const toolingRequested = personalization.toolingStyle !== 'none'
  const textRequested = personalization.textEnabled && Boolean(personalization.text.trim())
  const artworkRequested = Boolean(artwork)
  const active = toolingRequested || textRequested || artworkRequested

  if (!active) {
    return {
      active: false,
      renderable: false,
      layers: [],
      message: 'Add tooling, text, or artwork to activate a 3D concept preview.',
    }
  }

  const zoneId = resolveCustomizationZoneId(manifest, personalization.placement)
  const zone = zoneId ? manifest.customizationZones?.[zoneId] : undefined
  if (!zoneId || !zone) {
    return {
      active: true,
      renderable: false,
      layers: [],
      message: `"${personalization.placement}" is not mapped to a verified 3D placement zone on this development asset.`,
    }
  }

  const layers: ThreeCustomizationLayer[] = []
  const skipped: string[] = []

  if (toolingRequested) {
    if (zone.purposes.includes('tooling')) {
      layers.push({
        id: 'tooling',
        zoneId,
        purpose: 'tooling',
        style: personalization.toolingStyle,
        opacity: 0.7,
      })
    } else {
      skipped.push('tooling')
    }
  }

  if (textRequested) {
    if (zone.purposes.includes('text')) {
      layers.push({
        id: 'text',
        zoneId,
        purpose: 'text',
        content: personalization.text.trim(),
        style: personalization.textStyle,
        opacity: 0.94,
      })
    } else {
      skipped.push('text')
    }
  }

  if (artwork) {
    if (!artwork.type.startsWith('image/')) {
      skipped.push('PDF artwork')
    } else {
      const purpose = zone.purposes.includes('artwork')
        ? 'artwork'
        : zone.purposes.includes('logo')
          ? 'logo'
          : undefined
      if (purpose) {
        layers.push({
          id: 'artwork',
          zoneId,
          purpose,
          imageUrl: artwork.dataUrl,
          opacity: 0.96,
        })
      } else {
        skipped.push('artwork')
      }
    }
  }

  if (!layers.length) {
    return {
      active: true,
      renderable: false,
      zoneId,
      zoneLabel: zone.label,
      cameraPreset: zone.cameraPreset,
      layers,
      message: `The selected customization cannot be rendered in the "${zone.label}" concept zone yet.`,
    }
  }

  const suffix = skipped.length
    ? ` ${skipped.join(', ')} remains order-only.`
    : ''

  return {
    active: true,
    renderable: true,
    zoneId,
    zoneLabel: zone.label,
    cameraPreset: zone.cameraPreset,
    layers,
    message: `3D concept preview mapped to ${zone.label}. Final scale and placement are confirmed by Scorpion.${suffix}`,
  }
}

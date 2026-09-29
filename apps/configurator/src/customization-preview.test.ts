import { describe, expect, it } from 'vitest'
import { createDefaultPersonalization } from '@sls/order-engine'
import { sampleManifest } from './sample-product'
import { buildCustomizationPreview, resolveCustomizationZoneId } from './customization-preview'
import type { ArtworkAttachment } from './studio-types'

const rasterArtwork: ArtworkAttachment = {
  name: 'logo.png',
  type: 'image/png',
  size: 32,
  dataUrl: 'data:image/png;base64,AAAA',
}

describe('zone-driven customization preview', () => {
  it('resolves customer placement labels to explicit manifest zones', () => {
    expect(resolveCustomizationZoneId(sampleManifest, 'Forehead panel')).toBe('front-panel')
    expect(resolveCustomizationZoneId(sampleManifest, 'Left side panel')).toBeUndefined()
  })

  it('builds tooling, text, and raster artwork layers only for a mapped zone', () => {
    const personalization = createDefaultPersonalization('Forehead panel')
    personalization.toolingStyle = 'western-floral'
    personalization.textEnabled = true
    personalization.text = 'ZAN'
    personalization.textStyle = 'western'

    const preview = buildCustomizationPreview(sampleManifest, personalization, rasterArtwork)
    expect(preview).toMatchObject({
      active: true,
      renderable: true,
      zoneId: 'front-panel',
      cameraPreset: 'front',
    })
    expect(preview.layers.map((layer) => layer.purpose)).toEqual(['tooling', 'text', 'artwork'])
  })

  it('refuses to fake a placement zone that is not authored on the asset', () => {
    const personalization = createDefaultPersonalization('Left side panel')
    personalization.textEnabled = true
    personalization.text = 'LEFT'

    const preview = buildCustomizationPreview(sampleManifest, personalization, null)
    expect(preview.renderable).toBe(false)
    expect(preview.layers).toHaveLength(0)
    expect(preview.message).toContain('not mapped')
  })

  it('keeps PDF artwork order-only while allowing other mapped preview layers', () => {
    const personalization = createDefaultPersonalization('Forehead panel')
    personalization.textEnabled = true
    personalization.text = 'CREW'
    const pdf: ArtworkAttachment = {
      name: 'mark.pdf',
      type: 'application/pdf',
      size: 64,
      dataUrl: 'data:application/pdf;base64,AAAA',
    }

    const preview = buildCustomizationPreview(sampleManifest, personalization, pdf)
    expect(preview.renderable).toBe(true)
    expect(preview.layers.map((layer) => layer.purpose)).toEqual(['text'])
    expect(preview.message).toContain('PDF artwork remains order-only')
  })
})

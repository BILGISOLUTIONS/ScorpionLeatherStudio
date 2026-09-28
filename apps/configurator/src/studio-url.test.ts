import { describe, expect, it } from 'vitest'
import { restoreStudioShareToken, type StudioBuildDraft } from '@sls/order-engine'
import { buildShareUrl, buildStudioStateUrl } from './studio-url'

const build: StudioBuildDraft = {
  schemaVersion: 1,
  familyId: 'radio-harness',
  referenceId: 'cowhide-radio-harness-black',
  variantId: 'gid://shopify/ProductVariant/52616019837208',
  quantity: 2,
  personalization: {
    construction: {
      leatherFinish: 'textured',
      leatherColor: 'Dark brown',
      stitching: 'contrast',
      hardware: 'antique-brass',
      edgeTreatment: 'dark',
      notes: 'Reinforce shoulder junctions.',
    },
    toolingStyle: 'western-floral',
    toolingNotes: '',
    textEnabled: true,
    text: 'ZAN CREW',
    textStyle: 'block',
    placement: 'Front chest panel',
    artworkNotes: '',
    additionalNotes: '',
  },
}

describe('Studio share URLs', () => {
  it('keeps internal iframe history on the Studio origin', () => {
    const url = new URL(buildStudioStateUrl(build, 'https://studio.example.com/?embed=1&product=old'))
    expect(url.origin).toBe('https://studio.example.com')
    expect(url.searchParams.get('embed')).toBe('1')
    expect(restoreStudioShareToken(url.searchParams.get('studio')!)).toEqual(build)
  })

  it('creates a storefront-native share URL for a verified Shopify host page', () => {
    const href = 'https://studio.example.com/?embed=1&parent_origin=https%3A%2F%2Fscorpionwesternwear.com&host_page=https%3A%2F%2Fscorpionwesternwear.com%2Fpages%2Fcustom-leather-studio'
    const url = new URL(buildShareUrl(build, href))
    expect(url.origin).toBe('https://scorpionwesternwear.com')
    expect(url.pathname).toBe('/pages/custom-leather-studio')
    expect(url.searchParams.has('embed')).toBe(false)
    expect(url.searchParams.has('parent_origin')).toBe(false)
    expect(restoreStudioShareToken(url.searchParams.get('studio')!)).toEqual(build)
  })

  it('never trusts a cross-origin host_page override', () => {
    const href = 'https://studio.example.com/?embed=1&parent_origin=https%3A%2F%2Fscorpionwesternwear.com&host_page=https%3A%2F%2Fevil.example%2Ffake'
    const url = new URL(buildShareUrl(build, href))
    expect(url.origin).toBe('https://studio.example.com')
    expect(url.searchParams.has('embed')).toBe(false)
    expect(url.searchParams.has('parent_origin')).toBe(false)
    expect(url.searchParams.has('host_page')).toBe(false)
    expect(restoreStudioShareToken(url.searchParams.get('studio')!)).toEqual(build)
  })
})

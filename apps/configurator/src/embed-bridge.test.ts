import { describe, expect, it } from 'vitest'
import { normalizeStudioParentOrigin, resolveStudioEmbedContext, studioParentTargetOrigin } from './embed-bridge'

describe('Shopify embed context', () => {
  it('keeps standalone mode isolated from host parameters', () => {
    expect(resolveStudioEmbedContext('https://studio.example.com/?host_page=https://scorpionwesternwear.com/pages/custom-leather-studio')).toEqual({
      embedded: false,
      parentOrigin: null,
      hostPageUrl: null,
    })
  })

  it('accepts a same-origin storefront host page and exact parent origin', () => {
    const context = resolveStudioEmbedContext(
      'https://studio.example.com/?embed=1&parent_origin=https%3A%2F%2Fscorpionwesternwear.com&host_page=https%3A%2F%2Fscorpionwesternwear.com%2Fpages%2Fcustom-leather-studio',
    )
    expect(context).toEqual({
      embedded: true,
      parentOrigin: 'https://scorpionwesternwear.com',
      hostPageUrl: 'https://scorpionwesternwear.com/pages/custom-leather-studio',
    })
    expect(studioParentTargetOrigin(context)).toBe('https://scorpionwesternwear.com')
  })

  it('rejects a host page that does not match the parent origin', () => {
    const context = resolveStudioEmbedContext(
      'https://studio.example.com/?embed=1&parent_origin=https%3A%2F%2Fscorpionwesternwear.com&host_page=https%3A%2F%2Fevil.example%2Ffake',
    )
    expect(context.hostPageUrl).toBeNull()
    expect(context.parentOrigin).toBe('https://scorpionwesternwear.com')
  })

  it('falls back to a valid referrer origin for older embeds', () => {
    const context = resolveStudioEmbedContext(
      'https://studio.example.com/?embed=1',
      'https://scorpionwesternwear.com/pages/custom-leather-studio?studio=abc',
    )
    expect(context.parentOrigin).toBe('https://scorpionwesternwear.com')
    expect(studioParentTargetOrigin(context)).toBe('https://scorpionwesternwear.com')
  })

  it('rejects non-http parent origins and credentialed URLs', () => {
    expect(normalizeStudioParentOrigin('javascript:alert(1)')).toBeNull()
    expect(normalizeStudioParentOrigin('https://user:pass@example.com')).toBeNull()
  })
})

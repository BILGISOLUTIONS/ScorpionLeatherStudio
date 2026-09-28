export const STUDIO_EMBED_PROTOCOL_VERSION = 1
export const STUDIO_PARENT_ORIGIN_PARAM = 'parent_origin'
export const STUDIO_HOST_PAGE_PARAM = 'host_page'

export interface StudioEmbedContext {
  embedded: boolean
  parentOrigin: string | null
  hostPageUrl: string | null
}

function httpUrl(value: string | null): URL | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password) return null
    return url
  } catch {
    return null
  }
}

export function normalizeStudioParentOrigin(value: string | null): string | null {
  return httpUrl(value)?.origin ?? null
}

export function resolveStudioEmbedContext(href: string, referrer = ''): StudioEmbedContext {
  const current = new URL(href)
  const embedded = current.searchParams.get('embed') === '1'
  if (!embedded) return { embedded: false, parentOrigin: null, hostPageUrl: null }

  const explicitParent = normalizeStudioParentOrigin(current.searchParams.get(STUDIO_PARENT_ORIGIN_PARAM))
  const referrerParent = normalizeStudioParentOrigin(referrer)
  const parentOrigin = explicitParent ?? referrerParent
  const requestedHost = httpUrl(current.searchParams.get(STUDIO_HOST_PAGE_PARAM))
  const hostPageUrl = requestedHost && parentOrigin && requestedHost.origin === parentOrigin
    ? requestedHost.toString()
    : null

  return { embedded: true, parentOrigin, hostPageUrl }
}

export function currentStudioEmbedContext(): StudioEmbedContext {
  if (typeof window === 'undefined') return { embedded: false, parentOrigin: null, hostPageUrl: null }
  return resolveStudioEmbedContext(window.location.href, typeof document === 'undefined' ? '' : document.referrer)
}

export function studioParentTargetOrigin(context: StudioEmbedContext): string {
  return context.parentOrigin ?? '*'
}

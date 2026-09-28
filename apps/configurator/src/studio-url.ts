import { createStudioShareToken, type StudioBuildDraft } from '@sls/order-engine'
import { resolveStudioEmbedContext } from './embed-bridge'

function currentHref(href?: string): string {
  if (href) return href
  if (typeof window === 'undefined') throw new Error('A Studio URL is required outside the browser.')
  return window.location.href
}

export function buildStudioStateUrl(build: StudioBuildDraft, href?: string): string {
  const url = new URL(currentHref(href))
  url.searchParams.set('studio', createStudioShareToken(build))
  url.searchParams.delete('build')
  return url.toString()
}

export function buildShareUrl(build: StudioBuildDraft, href?: string, referrer = ''): string {
  const source = currentHref(href)
  const current = new URL(source)
  const context = resolveStudioEmbedContext(
    source,
    referrer || (typeof document === 'undefined' ? '' : document.referrer),
  )
  const url = context.hostPageUrl ? new URL(context.hostPageUrl) : current

  if (!context.hostPageUrl) {
    url.searchParams.delete('embed')
    url.searchParams.delete('parent_origin')
    url.searchParams.delete('host_page')
    url.searchParams.delete('_sls_retry')
  }

  url.searchParams.set('studio', createStudioShareToken(build))
  url.searchParams.delete('build')
  return url.toString()
}

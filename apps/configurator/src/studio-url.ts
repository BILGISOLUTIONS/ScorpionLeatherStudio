import { createStudioShareToken, type StudioBuildDraft } from '@sls/order-engine'

const TRANSIENT_SHARE_PARAMS = [
  'studio',
  'build',
  'embed',
  'product',
  'family',
  'reference',
  'variant',
] as const

export function buildShareUrl(build: StudioBuildDraft): string {
  const url = new URL(window.location.href)
  for (const parameter of TRANSIENT_SHARE_PARAMS) url.searchParams.delete(parameter)
  url.searchParams.set('studio', createStudioShareToken(build))
  url.hash = ''
  return url.toString()
}

export function clearBuildContextUrl(): string {
  const url = new URL(window.location.href)
  for (const parameter of TRANSIENT_SHARE_PARAMS) {
    if (parameter !== 'embed') url.searchParams.delete(parameter)
  }
  url.hash = ''
  return url.toString()
}

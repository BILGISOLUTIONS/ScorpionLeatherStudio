import { createStudioShareToken, type StudioBuildDraft } from '@sls/order-engine'

export function buildShareUrl(build: StudioBuildDraft): string {
  const url = new URL(window.location.href)
  url.searchParams.set('studio', createStudioShareToken(build))
  url.searchParams.delete('build')
  return url.toString()
}

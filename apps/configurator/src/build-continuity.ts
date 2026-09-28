export type BuildShareOutcome = 'shared' | 'copied' | 'cancelled' | 'unavailable'

interface BuildShareNavigator {
  share?: (data: ShareData) => Promise<void>
  clipboard?: {
    writeText: (text: string) => Promise<void>
  }
}

function browserNavigator(): BuildShareNavigator {
  return typeof navigator === 'undefined' ? {} : navigator
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
}

export async function copyStudioBuildLink(
  url: string,
  navigatorApi: BuildShareNavigator = browserNavigator(),
): Promise<boolean> {
  try {
    if (!navigatorApi.clipboard?.writeText) return false
    await navigatorApi.clipboard.writeText(url)
    return true
  } catch {
    return false
  }
}

export async function distributeStudioBuildLink(
  url: string,
  navigatorApi: BuildShareNavigator = browserNavigator(),
): Promise<BuildShareOutcome> {
  if (navigatorApi.share) {
    try {
      await navigatorApi.share({
        title: 'Scorpion Leather Studio build',
        text: 'Continue this Scorpion Western Wear custom build.',
        url,
      })
      return 'shared'
    } catch (error) {
      if (isAbortError(error)) return 'cancelled'
    }
  }

  return await copyStudioBuildLink(url, navigatorApi) ? 'copied' : 'unavailable'
}

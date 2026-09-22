export interface SupabaseServerConfiguration {
  url: string
  serviceKey: string
}

export function getSupabaseConfiguration(): SupabaseServerConfiguration | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/u, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && serviceKey ? { url, serviceKey } : null
}

export function supabaseHeaders(
  serviceKey: string,
  prefer?: string,
): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  }
}

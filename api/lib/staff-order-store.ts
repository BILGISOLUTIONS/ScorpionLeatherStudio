import { supabaseHeaders, type SupabaseServerConfiguration } from './supabase'

const TABLE = 'scorpion_custom_order_requests'

export async function readStaffOrder<T>(
  config: SupabaseServerConfiguration,
  requestId: string,
  fields: readonly string[],
): Promise<T | null> {
  const params = new URLSearchParams({
    select: fields.join(','),
    request_id: `eq.${requestId}`,
    limit: '1',
  })

  const response = await fetch(
    `${config.url}/rest/v1/${TABLE}?${params.toString()}`,
    { headers: supabaseHeaders(config.serviceKey) },
  )

  if (!response.ok) {
    throw new Error(`ORDER_STORE_READ_FAILED_${response.status}`)
  }

  const rows = await response.json() as T[]
  return rows[0] ?? null
}

export async function patchStaffOrder(
  config: SupabaseServerConfiguration,
  requestId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(
    `${config.url}/rest/v1/${TABLE}?request_id=eq.${encodeURIComponent(requestId)}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(config.serviceKey, 'return=minimal'),
      body: JSON.stringify({
        ...patch,
        updated_at: new Date().toISOString(),
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`ORDER_STORE_UPDATE_FAILED_${response.status}`)
  }
}

export function requestIdFromBody(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const value = (body as Record<string, unknown>).requestId
  return typeof value === 'string' ? value.trim() : ''
}

export function isScorpionRequestId(value: string): boolean {
  return /^SC-REQ-/u.test(value)
}

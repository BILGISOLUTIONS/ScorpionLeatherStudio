import { describe, expect, it } from 'vitest'
import handler from './order-requests'

function responseHarness() {
  const headers = new Map<string, string>()
  let statusCode = 200
  let body: unknown = null
  return {
    response: {
      setHeader(name: string, value: string) { headers.set(name.toLowerCase(), String(value)) },
      status(code: number) { statusCode = code; return this },
      json(value: unknown) { body = value; return this },
      end() { return this },
    },
    result() { return { headers, statusCode, body } },
  }
}

describe('order request correlation tracing', () => {
  it('adds the same server trace id to the response header and structured error body', async () => {
    const harness = responseHarness()
    await handler(
      { method:'GET', headers:{} } as any,
      harness.response as any,
    )

    const result = harness.result()
    expect(result.statusCode).toBe(405)
    const traceHeader = result.headers.get('x-scorpion-trace-id')
    expect(traceHeader).toMatch(/^[0-9a-f-]{36}$/u)
    expect(result.body).toMatchObject({
      accepted:false,
      code:'METHOD_NOT_ALLOWED',
      traceId:traceHeader,
    })
  })

  it('generates a fresh trace id for each request', async () => {
    const first = responseHarness()
    const second = responseHarness()

    await handler({ method:'GET', headers:{} } as any, first.response as any)
    await handler({ method:'GET', headers:{} } as any, second.response as any)

    expect(first.result().headers.get('x-scorpion-trace-id'))
      .not.toBe(second.result().headers.get('x-scorpion-trace-id'))
  })
})

import type { StudioOrderRequest } from '@sls/order-engine'

export interface ShopifyDraftOrderResult {
  id: string
  name: string
  invoiceUrl: string | null
  status: string
}

export interface ShopifyDraftOrderState extends ShopifyDraftOrderResult {
  completedAt: string | null
  invoiceSentAt: string | null
  order: {
    id: string
    name: string
    displayFinancialStatus: string | null
    displayFulfillmentStatus: string
  } | null
}

interface ShopifyConfiguration {
  storeDomain: string
  accessToken: string
  apiVersion: string
}

interface GraphQlEnvelope<T> {
  data?: T
  errors?: Array<{ message: string }>
}

function configuration(): ShopifyConfiguration | null {
  const rawDomain = process.env.SHOPIFY_STORE_DOMAIN?.trim()
  const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim()
  if (!rawDomain || !accessToken) return null

  let storeDomain = rawDomain
    .replace(/^https?:\/\//iu, '')
    .replace(/\/$/u, '')
  if (!storeDomain.includes('.')) storeDomain = `${storeDomain}.myshopify.com`

  return {
    storeDomain,
    accessToken,
    apiVersion: process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || '2026-07',
  }
}

async function shopifyGraphQl<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const config = configuration()
  if (!config) throw new Error('SHOPIFY_DRAFT_ORDER_NOT_CONFIGURED')

  const response = await fetch(
    `https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': config.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  )

  const payload = await response.json() as GraphQlEnvelope<T>
  if (!response.ok) throw new Error(`SHOPIFY_HTTP_${response.status}`)
  if (payload.errors?.length) {
    throw new Error(`SHOPIFY_GRAPHQL_ERROR: ${payload.errors.map((error) => error.message).join('; ')}`)
  }
  if (!payload.data) throw new Error('SHOPIFY_EMPTY_RESPONSE')
  return payload.data
}

function dollars(minor: number): string {
  return (minor / 100).toFixed(2)
}

function trimmed(value: string, max: number): string {
  return value.trim().slice(0, max)
}

export function isShopifyDraftOrderConfigured(): boolean {
  return Boolean(configuration())
}

export async function createShopifyDraftOrder(
  request: StudioOrderRequest,
  quoteTotalMinor: number,
  staffNotes = '',
): Promise<ShopifyDraftOrderResult> {
  if (!Number.isInteger(quoteTotalMinor) || quoteTotalMinor <= 0) {
    throw new Error('INVALID_QUOTE_TOTAL')
  }

  const p = request.build.personalization
  const construction = p.construction
  const customAttributes = [
    { key: 'Scorpion Request ID', value: request.requestId },
    { key: 'Scorpion Build ID', value: request.buildId },
    { key: 'Source SKU', value: request.commerce.sku },
    { key: 'Source Variant', value: request.commerce.variantTitle },
    { key: 'Requested Quantity', value: String(request.build.quantity) },
    { key: 'Tooling', value: p.toolingStyle },
    { key: 'Text', value: p.textEnabled ? p.text : 'None' },
    { key: 'Placement', value: p.placement },
    { key: 'Leather Finish', value: construction.leatherFinish },
    { key: 'Leather Color', value: construction.leatherColor || 'As photographed / shop review' },
    { key: 'Stitching', value: construction.stitching },
    { key: 'Hardware', value: construction.hardware },
    { key: 'Edge', value: construction.edgeTreatment },
  ].map(({ key, value }) => ({ key, value: trimmed(String(value), 255) }))

  const note = [
    'Scorpion Western Wear — Custom Leather Studio',
    `Request: ${request.requestId}`,
    `Build: ${request.buildId}`,
    `Starting product: ${request.commerce.referenceTitle}`,
    `Source SKU: ${request.commerce.sku}`,
    `Requested quantity: ${request.build.quantity}`,
    '',
    p.toolingNotes ? `Tooling notes: ${p.toolingNotes}` : '',
    construction.notes ? `Construction notes: ${construction.notes}` : '',
    p.artworkNotes ? `Artwork notes: ${p.artworkNotes}` : '',
    p.additionalNotes ? `Customer notes: ${p.additionalNotes}` : '',
    staffNotes.trim() ? `Staff notes: ${staffNotes.trim()}` : '',
    '',
    `Build URL: ${request.sourceUrl}`,
  ].filter(Boolean).join('\n').slice(0, 5000)

  const query = `
    mutation ScorpionDraftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          name
          invoiceUrl
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `

  const variables = {
    input: {
      ...(request.customer.email ? { email: request.customer.email } : {}),
      ...(request.customer.phone ? { phone: request.customer.phone } : {}),
      note,
      tags: ['custom-leather-studio', 'scorpion-custom', 'quote'],
      customAttributes,
      lineItems: [
        {
          title: trimmed(`Custom Leather — ${request.commerce.referenceTitle}`, 255),
          quantity: 1,
          originalUnitPriceWithCurrency: {
            amount: dollars(quoteTotalMinor),
            currencyCode: 'USD',
          },
          requiresShipping: true,
          sku: trimmed(request.commerce.sku, 255),
          customAttributes: [
            { key: 'Requested Quantity', value: String(request.build.quantity) },
            { key: 'Source Shopify Variant', value: trimmed(request.commerce.merchandiseId, 255) },
            { key: 'Scorpion Request ID', value: request.requestId },
            { key: 'Scorpion Build ID', value: request.buildId },
          ],
        },
      ],
    },
  }

  const data = await shopifyGraphQl<{
    draftOrderCreate?: {
      draftOrder?: ShopifyDraftOrderResult | null
      userErrors?: Array<{ field?: string[] | null; message: string }>
    }
  }>(query, variables)

  const result = data.draftOrderCreate
  if (result?.userErrors?.length) {
    throw new Error(`SHOPIFY_USER_ERROR: ${result.userErrors.map((error) => error.message).join('; ')}`)
  }
  if (!result?.draftOrder?.id) {
    throw new Error('SHOPIFY_DRAFT_ORDER_CREATE_FAILED')
  }

  return result.draftOrder
}

export async function sendShopifyDraftInvoice(
  draftOrderId: string,
): Promise<ShopifyDraftOrderResult> {
  if (!/^gid:\/\/shopify\/DraftOrder\/\d+$/u.test(draftOrderId)) {
    throw new Error('INVALID_SHOPIFY_DRAFT_ORDER_ID')
  }

  const query = `
    mutation ScorpionDraftOrderInvoiceSend($id: ID!) {
      draftOrderInvoiceSend(id: $id) {
        draftOrder {
          id
          name
          invoiceUrl
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `

  const data = await shopifyGraphQl<{
    draftOrderInvoiceSend?: {
      draftOrder?: ShopifyDraftOrderResult | null
      userErrors?: Array<{ field?: string[] | null; message: string }>
    }
  }>(query, { id: draftOrderId })

  const result = data.draftOrderInvoiceSend
  if (result?.userErrors?.length) {
    throw new Error(`SHOPIFY_USER_ERROR: ${result.userErrors.map((error) => error.message).join('; ')}`)
  }
  if (!result?.draftOrder?.id) {
    throw new Error('SHOPIFY_DRAFT_ORDER_INVOICE_SEND_FAILED')
  }

  return result.draftOrder
}


export async function getShopifyDraftOrderState(
  draftOrderId: string,
): Promise<ShopifyDraftOrderState> {
  if (!/^gid:\/\/shopify\/DraftOrder\/\d+$/u.test(draftOrderId)) {
    throw new Error('INVALID_SHOPIFY_DRAFT_ORDER_ID')
  }

  const query = `
    query ScorpionDraftOrderState($id: ID!) {
      draftOrder(id: $id) {
        id
        name
        invoiceUrl
        invoiceSentAt
        completedAt
        status
        order {
          id
          name
          displayFinancialStatus
          displayFulfillmentStatus
        }
      }
    }
  `

  const data = await shopifyGraphQl<{
    draftOrder?: ShopifyDraftOrderState | null
  }>(query, { id: draftOrderId })

  if (!data.draftOrder?.id) {
    throw new Error('SHOPIFY_DRAFT_ORDER_NOT_FOUND')
  }

  return data.draftOrder
}

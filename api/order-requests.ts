import { randomUUID } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import nodemailer from 'nodemailer'
import { formatOrderSummary, type StudioOrderRequest } from '@sls/order-engine'

interface ArtworkAttachmentInput {
  name: string
  type: string
  size: number
  dataUrl: string
}

interface SubmissionEnvelope {
  request?: StudioOrderRequest
  website?: string
  artwork?: ArtworkAttachmentInput | null
}

const ARTWORK_MAX_BYTES = 2 * 1024 * 1024
const ARTWORK_ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function parseBody(req: VercelRequest): SubmissionEnvelope {
  if (typeof req.body === 'string') {
    return JSON.parse(req.body) as SubmissionEnvelope
  }
  return (req.body ?? {}) as SubmissionEnvelope
}

function envFlag(name: string, fallback = false): boolean {
  const value = process.env[name]
  if (value === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function allowedOrigin(req: VercelRequest): boolean {
  const origin = stringValue(req.headers.origin)
  if (!origin) return true

  try {
    const originUrl = new URL(origin)
    const requestHost = stringValue(req.headers.host).toLowerCase()
    if (originUrl.host.toLowerCase() === requestHost) return true
    if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') return true
    if (originUrl.hostname.endsWith('.vercel.app')) return true

    const configured = (process.env.ORDER_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)

    return configured.some((candidate) => {
      try {
        return new URL(candidate).origin.toLowerCase() === originUrl.origin.toLowerCase()
      } catch {
        return candidate === originUrl.origin.toLowerCase()
      }
    })
  } catch {
    return false
  }
}

function validateArtwork(artwork: ArtworkAttachmentInput | null | undefined): string[] {
  if (!artwork) return []

  const issues: string[] = []
  if (!ARTWORK_ALLOWED_TYPES.has(stringValue(artwork.type))) issues.push('Unsupported artwork file type.')
  if (!Number.isInteger(artwork.size) || artwork.size < 1 || artwork.size > ARTWORK_MAX_BYTES) {
    issues.push('Artwork must be 2 MB or smaller.')
  }
  if (!stringValue(artwork.name).trim() || stringValue(artwork.name).length > 180) {
    issues.push('Invalid artwork filename.')
  }
  if (!stringValue(artwork.dataUrl).startsWith(`data:${artwork.type};base64,`)) {
    issues.push('Invalid artwork encoding.')
  }
  return issues
}

function sanitizeFilename(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._ -]/gu, '_').replace(/\s+/gu, ' ').trim()
  return safe.slice(0, 140) || 'artwork'
}

function decodeArtwork(artwork: ArtworkAttachmentInput | null | undefined): Buffer | null {
  if (!artwork) return null
  const marker = ';base64,'
  const index = artwork.dataUrl.indexOf(marker)
  if (index < 0) return null

  const buffer = Buffer.from(artwork.dataUrl.slice(index + marker.length), 'base64')
  if (buffer.length < 1 || buffer.length > ARTWORK_MAX_BYTES) return null
  return buffer
}

function validateRequest(request: StudioOrderRequest): string[] {
  const issues: string[] = []

  if (request?.schemaVersion !== 1) issues.push('Unsupported request schema.')
  if (!/^SC-REQ-/u.test(stringValue(request?.requestId))) issues.push('Invalid request id.')
  if (!/^SLS-/u.test(stringValue(request?.buildId))) issues.push('Invalid build id.')
  if (!stringValue(request?.customer?.name).trim()) issues.push('Customer name is required.')
  if (!stringValue(request?.customer?.email).trim() && !stringValue(request?.customer?.phone).trim()) {
    issues.push('Customer email or phone is required.')
  }
  if (!stringValue(request?.commerce?.sku).trim()) issues.push('SKU is required.')
  if (!stringValue(request?.commerce?.merchandiseId).trim()) issues.push('Merchandise id is required.')
  if (!Number.isInteger(request?.build?.quantity) || request.build.quantity < 1 || request.build.quantity > 99) {
    issues.push('Quantity must be between 1 and 99.')
  }

  const boundedFields: Array<[string, unknown, number]> = [
    ['customer.name', request?.customer?.name, 120],
    ['customer.email', request?.customer?.email, 254],
    ['customer.phone', request?.customer?.phone, 80],
    ['customer.company', request?.customer?.company, 160],
    ['personalization.text', request?.build?.personalization?.text, 40],
    ['personalization.toolingNotes', request?.build?.personalization?.toolingNotes, 500],
    ['personalization.artworkNotes', request?.build?.personalization?.artworkNotes, 700],
    ['personalization.additionalNotes', request?.build?.personalization?.additionalNotes, 1000],
    ['sourceUrl', request?.sourceUrl, 3000],
  ]

  for (const [field, value, max] of boundedFields) {
    if (stringValue(value).length > max) issues.push(`${field} is too long.`)
  }

  return issues
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function requiredSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) return null

  const port = Number(process.env.SMTP_PORT ?? '465')
  return {
    host,
    user,
    pass,
    port: Number.isFinite(port) ? port : 465,
    secure: process.env.SMTP_SECURE === undefined ? port === 465 : envFlag('SMTP_SECURE'),
  }
}

function renderShopHtml(request: StudioOrderRequest, summary: string, artwork?: ArtworkAttachmentInput | null): string {
  const p = request.build.personalization
  return `
    <div style="font-family:Arial,sans-serif;background:#111;color:#eee;padding:24px">
      <div style="max-width:760px;margin:auto;background:#181714;border:1px solid #4b402d;padding:24px">
        <p style="margin:0 0 8px;color:#caa85f;font-size:12px;letter-spacing:1.5px">SCORPION WESTERN WEAR · CUSTOM LEATHER STUDIO</p>
        <h1 style="margin:0 0 18px;font-size:24px">New custom order request</h1>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:7px;border-bottom:1px solid #333;color:#aaa">Request</td><td style="padding:7px;border-bottom:1px solid #333;text-align:right">${escapeHtml(request.requestId)}</td></tr>
          <tr><td style="padding:7px;border-bottom:1px solid #333;color:#aaa">Customer</td><td style="padding:7px;border-bottom:1px solid #333;text-align:right">${escapeHtml(request.customer.name)}</td></tr>
          <tr><td style="padding:7px;border-bottom:1px solid #333;color:#aaa">Product</td><td style="padding:7px;border-bottom:1px solid #333;text-align:right">${escapeHtml(request.commerce.referenceTitle)}</td></tr>
          <tr><td style="padding:7px;border-bottom:1px solid #333;color:#aaa">SKU</td><td style="padding:7px;border-bottom:1px solid #333;text-align:right">${escapeHtml(request.commerce.sku)}</td></tr>
          <tr><td style="padding:7px;border-bottom:1px solid #333;color:#aaa">Quantity</td><td style="padding:7px;border-bottom:1px solid #333;text-align:right">${request.build.quantity}</td></tr>
          <tr><td style="padding:7px;border-bottom:1px solid #333;color:#aaa">Tooling</td><td style="padding:7px;border-bottom:1px solid #333;text-align:right">${escapeHtml(p.toolingStyle)}</td></tr>
          <tr><td style="padding:7px;border-bottom:1px solid #333;color:#aaa">Text</td><td style="padding:7px;border-bottom:1px solid #333;text-align:right">${escapeHtml(p.textEnabled ? p.text : 'None')}</td></tr>
          <tr><td style="padding:7px;border-bottom:1px solid #333;color:#aaa">Placement</td><td style="padding:7px;border-bottom:1px solid #333;text-align:right">${escapeHtml(p.placement)}</td></tr>
        </table>
        ${artwork ? `<p style="margin:18px 0 0;color:#d7bd82"><strong>Artwork attached:</strong> ${escapeHtml(artwork.name)} · ${Math.max(1, Math.round(artwork.size / 1024))} KB</p>` : ''}
        <pre style="white-space:pre-wrap;background:#0d0d0c;border:1px solid #333;padding:14px;color:#ccc;font-size:12px;line-height:1.5;margin-top:18px">${escapeHtml(summary)}</pre>
      </div>
    </div>
  `
}

function renderCustomerHtml(request: StudioOrderRequest): string {
  return `
    <div style="font-family:Arial,sans-serif;color:#222;padding:24px">
      <div style="max-width:680px;margin:auto">
        <p style="color:#8a672e;font-size:12px;letter-spacing:1.2px">SCORPION WESTERN WEAR</p>
        <h1 style="font-size:24px">We received your custom leather request.</h1>
        <p>Hi ${escapeHtml(request.customer.name)},</p>
        <p>Your request <strong>${escapeHtml(request.requestId)}</strong> for <strong>${escapeHtml(request.commerce.referenceTitle)}</strong> has been sent to Scorpion Western Wear for review.</p>
        <p>Custom tooling, lettering, artwork, material changes, availability, lead time, fit, and final pricing are subject to shop confirmation. This message is not a final quote or order acceptance.</p>
        <p><strong>Build ID:</strong> ${escapeHtml(request.buildId)}<br/><strong>SKU:</strong> ${escapeHtml(request.commerce.sku)}<br/><strong>Quantity:</strong> ${request.build.quantity}</p>
        <p>Scorpion can reply directly to this email thread once the request is reviewed.</p>
      </div>
    </div>
  `
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    res.status(405).json({ accepted: false, code: 'METHOD_NOT_ALLOWED' })
    return
  }

  if (!allowedOrigin(req)) {
    res.status(403).json({ accepted: false, code: 'ORIGIN_NOT_ALLOWED' })
    return
  }

  let envelope: SubmissionEnvelope
  try {
    envelope = parseBody(req)
  } catch {
    res.status(400).json({ accepted: false, code: 'INVALID_JSON' })
    return
  }

  if (stringValue(envelope.website).trim()) {
    res.status(202).json({ accepted: true, requestId: envelope.request?.requestId ?? null })
    return
  }

  const request = envelope.request
  if (!request) {
    res.status(400).json({ accepted: false, code: 'REQUEST_REQUIRED' })
    return
  }

  if (JSON.stringify(envelope).length > 3_250_000) {
    res.status(413).json({ accepted: false, code: 'PAYLOAD_TOO_LARGE' })
    return
  }

  const issues = [...validateRequest(request), ...validateArtwork(envelope.artwork)]
  if (issues.length) {
    res.status(422).json({ accepted: false, code: 'VALIDATION_FAILED', issues })
    return
  }

  const smtp = requiredSmtpConfig()
  if (!smtp) {
    res.status(503).json({ accepted: false, code: 'ORDER_TRANSPORT_NOT_CONFIGURED' })
    return
  }

  const destination = (process.env.ORDER_DESTINATION_EMAIL ?? smtp.user).trim()
  const from = (process.env.SMTP_FROM ?? smtp.user).trim()
  const summary = formatOrderSummary(request)
  const deliveryId = randomUUID()
  const artworkBuffer = decodeArtwork(envelope.artwork)

  if (envelope.artwork && !artworkBuffer) {
    res.status(422).json({ accepted: false, code: 'INVALID_ARTWORK' })
    return
  }

  try {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    })

    await transport.sendMail({
      from,
      to: destination,
      replyTo: request.customer.email || undefined,
      subject: `Custom Leather Request ${request.requestId} · ${request.commerce.sku}`,
      text: summary,
      html: renderShopHtml(request, summary, envelope.artwork),
      attachments: envelope.artwork && artworkBuffer ? [{
        filename: sanitizeFilename(envelope.artwork.name),
        content: artworkBuffer,
        contentType: envelope.artwork.type,
      }] : undefined,
      headers: {
        'X-Scorpion-Request-ID': request.requestId,
        'X-Scorpion-Build-ID': request.buildId,
        'X-Scorpion-Delivery-ID': deliveryId,
      },
    })

    if (request.customer.email && envFlag('ORDER_SEND_CUSTOMER_CONFIRMATION', true)) {
      await transport.sendMail({
        from,
        to: request.customer.email,
        replyTo: destination,
        subject: `Scorpion received your custom request · ${request.requestId}`,
        text: [
          `Hi ${request.customer.name},`,
          '',
          `We received your custom leather request ${request.requestId} for ${request.commerce.referenceTitle}.`,
          '',
          'Scorpion Western Wear will review availability, customization feasibility, fit, lead time, and final pricing.',
          'This confirmation is not a final quote or order acceptance.',
          '',
          `Build ID: ${request.buildId}`,
          `SKU: ${request.commerce.sku}`,
          `Quantity: ${request.build.quantity}`,
        ].join('\n'),
        html: renderCustomerHtml(request),
      })
    }

    res.status(202).json({
      accepted: true,
      requestId: request.requestId,
      deliveryId,
      artworkAttached: Boolean(envelope.artwork && artworkBuffer),
    })
  } catch (error) {
    console.error('Scorpion order delivery failed', {
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(502).json({ accepted: false, code: 'DELIVERY_FAILED' })
  }
}

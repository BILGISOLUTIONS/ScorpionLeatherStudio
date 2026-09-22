import { memo, useEffect, useMemo, useState } from 'react'
import {
  createOrderRequest,
  createStudioBuildId,
  formatOrderSummary,
  validateOrderDraft,
  type CustomerDraft,
  type StudioBuildDraft,
  type StudioOrderRequest,
} from '@sls/order-engine'
import type { StudioProductFamily, StudioReference, StudioVariant } from './studio-catalog'
import { storefrontImage } from './studio-media'
import type { ArtworkAttachment } from './studio-types'
import { buildShareUrl } from './studio-url'
import { useDebouncedLocalStorage } from './useDebouncedLocalStorage'

const CUSTOMER_STORAGE_KEY = 'scorpion-leather-studio:v004-customer'
const REQUEST_STORAGE_KEY = 'scorpion-leather-studio:v004-requests'

function defaultCustomer(): CustomerDraft {
  return {
    name: '',
    email: '',
    phone: '',
    company: '',
    preferredContact: 'either',
    neededBy: '',
  }
}

function loadCustomer(): CustomerDraft {
  if (typeof window === 'undefined') return defaultCustomer()
  try {
    const saved = window.localStorage.getItem(CUSTOMER_STORAGE_KEY)
    if (!saved) return defaultCustomer()
    return { ...defaultCustomer(), ...(JSON.parse(saved) as Partial<CustomerDraft>) }
  } catch {
    return defaultCustomer()
  }
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(href)
}

function OrderCaptureComponent({
  build,
  family,
  reference,
  variant,
  artwork,
  setStatus,
}: {
  build: StudioBuildDraft
  family: StudioProductFamily
  reference: StudioReference
  variant: StudioVariant
  artwork: ArtworkAttachment | null
  setStatus: (message: string) => void
}) {
  const [customer, setCustomer] = useState<CustomerDraft>(loadCustomer)
  const [request, setRequest] = useState<StudioOrderRequest | null>(null)
  const [deliveryState, setDeliveryState] = useState<'idle' | 'sending' | 'sent' | 'unavailable' | 'failed'>('idle')
  const [website, setWebsite] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)

  const issues = useMemo(() => validateOrderDraft(build, customer), [build, customer])
  const issueMap = useMemo(() => Object.fromEntries(issues.map((issue) => [issue.path, issue.message])), [issues])
  useDebouncedLocalStorage(CUSTOMER_STORAGE_KEY, customer, 250)

  useEffect(() => {
    setRequest(null)
    setDeliveryState('idle')
    setAcknowledged(false)
  }, [build])

  const prepareRequest = () => {
    try {
      const sourceUrl = buildShareUrl(build)
      window.history.replaceState({}, '', sourceUrl)
      const next = createOrderRequest({
        build,
        customer,
        sourceUrl,
        commerce: {
          productTitle: family.title,
          referenceTitle: reference.title,
          referenceImageUrl: storefrontImage(reference.image, 1000),
          shopifyProductId: reference.shopifyProductId,
          merchandiseId: variant.id,
          sku: variant.sku,
          variantTitle: variant.title,
          basePriceMinor: variant.priceMinor,
          listedInventoryQuantity: variant.inventoryQuantity,
          priceStatus: reference.priceStatus,
        },
      })
      setRequest(next)
      setDeliveryState('idle')
      setAcknowledged(false)
      setStatus(`Order request ${next.requestId} prepared.`)

      try {
        const saved = JSON.parse(window.localStorage.getItem(REQUEST_STORAGE_KEY) ?? '[]') as StudioOrderRequest[]
        window.localStorage.setItem(REQUEST_STORAGE_KEY, JSON.stringify([next, ...saved].slice(0, 20)))
      } catch {
        // The request still exists in memory if local storage is unavailable.
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Complete the required order details.')
    }
  }

  const summary = useMemo(() => request ? formatOrderSummary(request) : '', [request])

  const copySummary = async () => {
    if (!request) return
    try {
      await navigator.clipboard.writeText(summary)
      setStatus('Order request copied to the clipboard.')
    } catch {
      setStatus('Clipboard access was unavailable. Download the build sheet instead.')
    }
  }

  const sendRequest = async () => {
    if (!request || deliveryState === 'sending') return
    setDeliveryState('sending')
    setStatus('Sending custom order request to Scorpion…')

    try {
      const response = await fetch('/api/order-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request, website, artwork }),
      })
      const payload = await response.json().catch(() => ({})) as {
        accepted?: boolean
        code?: string
        deliveryId?: string
        persisted?: boolean
        emailSent?: boolean
        deliveryStatus?: string
      }

      if (response.ok && payload.accepted) {
        setDeliveryState('sent')
        if (payload.emailSent === false && payload.persisted) {
          setStatus(`Request ${request.requestId} was saved securely for Scorpion. Email notification is pending.`)
        } else if (payload.persisted) {
          setStatus(`Request ${request.requestId} was saved and sent to Scorpion successfully.`)
        } else {
          setStatus(`Request ${request.requestId} sent to Scorpion successfully.`)
        }
        return
      }

      if (
        response.status === 503 &&
        (payload.code === 'ORDER_TRANSPORT_NOT_CONFIGURED' || payload.code === 'ORDER_DELIVERY_UNAVAILABLE')
      ) {
        setDeliveryState('unavailable')
        setStatus('Direct delivery is not configured on this deployment yet. Use the email fallback below.')
        return
      }

      setDeliveryState('failed')
      setStatus('The server could not deliver this request. Your build sheet is still safe; use the email fallback.')
    } catch {
      setDeliveryState('failed')
      setStatus('Could not reach the order server. Your build sheet is still safe; use the email fallback.')
    }
  }

  const emailRequest = () => {
    if (!request) return
    const subject = encodeURIComponent(`Custom Leather Order Request — ${request.requestId}`)
    const body = encodeURIComponent(summary)
    window.location.href = `mailto:orders@scorpionwesternwear.com?subject=${subject}&body=${body}`
  }

  const downloadJson = () => {
    if (!request) return
    downloadText(
      `${request.requestId}.json`,
      JSON.stringify({
        request,
        artwork: artwork ? { name: artwork.name, type: artwork.type, size: artwork.size } : null,
      }, null, 2),
    )
  }

  const printPacket = () => {
    if (!request) return
    const popup = window.open('', '_blank')
    if (!popup) {
      setStatus('The browser blocked the print packet. Allow popups for this site and try again.')
      return
    }

    try { popup.opener = null } catch { /* best-effort opener isolation */ }

    const escape = (value: string) => value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')

    popup.document.write(`<!doctype html><html><head><title>${escape(request.requestId)}</title><style>
      body{font-family:Arial,sans-serif;margin:32px;color:#171717}h1{margin:0 0 6px}small{color:#666}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:20px 0}.meta div{border:1px solid #ccc;padding:10px}
      pre{white-space:pre-wrap;border:1px solid #bbb;padding:16px;font-size:12px;line-height:1.45}
      img{max-width:260px;max-height:180px;object-fit:contain;border:1px solid #ccc;padding:8px}
      @media print{button{display:none}}
    </style></head><body>
      <h1>Scorpion Western Wear — Custom Order Packet</h1>
      <small>${escape(request.requestId)} · ${escape(request.buildId)}</small>
      ${request.commerce.referenceImageUrl ? `<img src="${escape(request.commerce.referenceImageUrl)}" alt="Photographed Scorpion product reference">` : ''}
      <div class="meta">
        <div><strong>Product</strong><br>${escape(request.commerce.referenceTitle)}</div>
        <div><strong>SKU / Variant</strong><br>${escape(request.commerce.sku)} · ${escape(request.commerce.variantTitle)}</div>
        <div><strong>Customer</strong><br>${escape(request.customer.name)}${request.customer.company ? ` · ${escape(request.customer.company)}` : ''}</div>
        <div><strong>Contact</strong><br>${escape(request.customer.email || request.customer.phone)}</div>
      </div>
      ${artwork && artwork.type.startsWith('image/') ? `<h2>Attached Artwork</h2><img src="${artwork.dataUrl}" alt="Artwork">` : artwork ? `<p><strong>Artwork attachment:</strong> ${escape(artwork.name)}</p>` : ''}
      <h2>Build Specification</h2><pre>${escape(summary)}</pre>
      <button onclick="window.print()">Print packet</button>
    </body></html>`)
    popup.document.close()
  }

  return (
    <section className="order-capture" aria-label="Custom order request">
      <div className="order-capture-heading">
        <div>
          <p className="eyebrow">ORDER CAPTURE</p>
          <h2>Turn this build into a shop-ready request</h2>
        </div>
        <span>{createStudioBuildId(build)}</span>
      </div>

      <label className="hp-field" aria-hidden="true">
        Website
        <input
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </label>

      <div className="order-form-grid">
        <label>
          Name *
          <input
            value={customer.name}
            onChange={(event) => setCustomer({ ...customer, name: event.target.value })}
            autoComplete="name"
          />
          {issueMap['customer.name'] ? <small className="field-error">{issueMap['customer.name']}</small> : null}
        </label>
        <label>
          Company
          <input
            value={customer.company}
            onChange={(event) => setCustomer({ ...customer, company: event.target.value })}
            autoComplete="organization"
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={customer.email}
            onChange={(event) => setCustomer({ ...customer, email: event.target.value })}
            autoComplete="email"
          />
          {issueMap['customer.email'] ? <small className="field-error">{issueMap['customer.email']}</small> : null}
        </label>
        <label>
          Phone
          <input
            type="tel"
            value={customer.phone}
            onChange={(event) => setCustomer({ ...customer, phone: event.target.value })}
            autoComplete="tel"
          />
        </label>
        <label>
          Preferred contact
          <select
            value={customer.preferredContact}
            onChange={(event) => setCustomer({ ...customer, preferredContact: event.target.value as CustomerDraft['preferredContact'] })}
          >
            <option value="either">Either</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
          </select>
        </label>
        <label>
          Needed by
          <input
            type="date"
            value={customer.neededBy}
            onChange={(event) => setCustomer({ ...customer, neededBy: event.target.value })}
          />
        </label>
      </div>

      {issueMap['customer.contact'] ? <p className="field-error contact-error">{issueMap['customer.contact']}</p> : null}

      <div className="order-action-row">
        <button className="primary-action" type="button" onClick={prepareRequest}>
          Create Order Request
        </button>
        <p>
          This creates a structured Scorpion build sheet. Tooling, text, artwork, and quote-only products require shop confirmation before production.
        </p>
      </div>

      {request ? (
        <div className="request-ready">
          <div className="request-ready-head">
            <div>
              <span>REQUEST READY</span>
              <strong>{request.requestId}</strong>
            </div>
            <span>{request.commerce.sku}</span>
          </div>
          <pre>{summary}</pre>
          <label className="request-acknowledgement">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
            <span>I understand this is a customization request. Scorpion must confirm design feasibility, availability, lead time, fit, and final price before production.</span>
          </label>
          <div className="request-actions">
            <button type="button" onClick={copySummary}>Copy summary</button>
            <button type="button" onClick={() => downloadText(`${request.requestId}.txt`, summary)}>Text build sheet</button>
            <button type="button" onClick={downloadJson}>JSON packet</button>
            <button type="button" onClick={printPacket}>Print packet</button>
            <button
              type="button"
              className="request-send"
              onClick={sendRequest}
              disabled={!acknowledged || deliveryState === 'sending' || deliveryState === 'sent'}
            >
              {deliveryState === 'sending' ? 'Sending…' : deliveryState === 'sent' ? 'Sent to Scorpion' : 'Send to Scorpion'}
            </button>
            <button type="button" onClick={emailRequest}>Email fallback</button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default memo(OrderCaptureComponent)

# V0.23 — Scan-first workshop identity

V0.23 turns the existing workshop scanner payload into an operational staff workflow.

## Goals

- Open the exact workshop order from a USB/barcode scanner, pasted payload, or supported camera QR scan.
- Verify that the scanned revision matches the currently active released revision before staff continue production work.
- Render a QR directly from the workshop payload without third-party network services.
- Keep all scan logic staff-only and lazy-loaded so the customer storefront bundle is unaffected.

## Payload contract

Workshop packets already carry:

```text
SLS:WORKSHOP:1:<REQUEST-ID>:<REVISION-ID>
```

V0.23 parses that contract strictly. It does not accept arbitrary URLs or external payloads.

## Staff console

The staff queue now includes a scan-first lookup bar.

Supported input paths:

1. USB/Bluetooth scanner acting as keyboard input
2. pasted/typed workshop payload
3. browser camera scan when `BarcodeDetector` + QR support + camera permission are available

Camera scanning is progressive enhancement. Unsupported browsers fall back to scanner/paste input.

## Revision safety

After lookup, V0.23 compares the scanned revision ID with the active released workshop packet.

- Matching revision: staff receives an explicit matched-revision message.
- Mismatch: staff receives a visible stale/revision-mismatch warning before production work continues.

This prevents an older printed packet from silently being treated as the current manufacturing authority.

## QR generation

The staff console generates the workshop QR locally from the deterministic payload.

- no remote QR API
- no tracking pixel
- no third-party runtime dependency
- no network disclosure of work-order identifiers

The QR is rendered as inline SVG.

## Performance

The scan controller is a lazy staff-only module:

```text
/staff-scan-v023.js
```

It is not loaded on ordinary storefront/customer pages and is loaded in the staff console only when scan/QR functionality is actually used.

## Printing

The QR displayed beside the released workshop packet uses the same scanner payload already contained in the packet. It is supplementary identity/navigation data; the active released packet remains the manufacturing authority.

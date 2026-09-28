# V0.26 — Customer-Safe Order Recovery and Delivery Diagnostics

## Purpose

V0.26 makes an order-delivery failure recoverable without adding polling, a new serverless function, or third-party customer analytics.

The order packet remains the source of truth. Diagnostics exist only to answer:

- what stage failed;
- whether the browser was online;
- what server correlation ID applies;
- whether the request reached durable storage or email transport;
- how the customer can retry without re-entering the build.

## Recovery storage

Prepared requests continue to use the existing bounded browser recovery history.

V0.26 adds bounded delivery receipts keyed by request ID:

```text
prepared
accepted
failed
unavailable
```

Receipts contain operational fields only:

- request ID
- build ID
- timestamp
- server trace ID when available
- delivery code/status
- persisted/email flags

The browser keeps at most 30 receipts.

## Diagnostics

Recent delivery diagnostics are session-scoped and bounded to 24 events.

Diagnostic events intentionally do **not** contain:

- customer name
- email
- phone
- company
- customization free text
- artwork bytes

They contain only operational metadata such as request/build IDs, stage, outcome, HTTP status, connectivity state and correlation code.

## Server trace IDs

Every `/api/order-requests` invocation receives a fresh UUID correlation trace.

The trace is returned in:

```text
X-Scorpion-Trace-ID
```

and in every JSON response body as:

```json
{ "traceId": "..." }
```

The same trace is included in server-side persistence/delivery error logs.

This lets a customer or staff member provide one support reference without exposing the full request body.

## Customer recovery behavior

If direct delivery fails or is unavailable:

- the prepared request remains stored locally;
- the UI explicitly states that the packet is safe;
- direct delivery can be retried;
- the customer can download a private recovery JSON;
- the customer can copy a support reference;
- email fallback remains available.

After page reload, the Studio recognizes a saved packet for the exact deterministic build and offers to restore it.

An acknowledged request must be acknowledged again after restoring an unsent/failed packet. This prevents a stale acknowledgement from silently authorizing a new retry.

Previously accepted requests restore as already sent rather than encouraging duplicate submission.

## Private recovery file

The recovery download is deliberately different from diagnostics.

It can contain:

- complete order request/customer contact information;
- uploaded artwork including its data URL;
- latest delivery receipt;
- sanitized diagnostic events.

The file carries an explicit privacy warning and should only be shared with Scorpion Western Wear support.

## Resource policy

V0.26 recovery code is imported only by the already-lazy `OrderCapture` workflow.

Therefore:

- initial product browsing does not load recovery logic;
- no new Vercel function is added;
- no polling is added;
- no third-party telemetry SDK is added;
- no customer tracking identifier is introduced;
- existing storefront bundle and lazy order-capture budgets remain enforced.

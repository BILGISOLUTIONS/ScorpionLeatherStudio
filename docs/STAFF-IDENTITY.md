# V0.25 — Individual Staff Identity and Role Attribution

## Purpose

V0.25 replaces the shared-token-only operating model with individual staff access keys while retaining the existing shared token as a temporary rollback path.

The customer Studio remains unchanged. The identity layer is staff-only and lazy-loaded after successful staff authentication.

## Configuration

Preferred configuration:

```text
SCORPION_STAFF_IDENTITIES_JSON=[...]
```

Example shape:

```json
[
  {
    "id": "ray",
    "name": "Ray",
    "token": "<long random individual secret>",
    "roles": ["sales", "workshop"]
  },
  {
    "id": "wilson",
    "name": "Wilson",
    "token": "<different long random individual secret>",
    "roles": ["qc"]
  }
]
```

Tokens must be unique and at least 24 characters. IDs must be stable lowercase identifiers. Never commit real tokens to source control.

The old `SCORPION_STAFF_TOKEN` remains accepted as:

```text
id: legacy-shared
roles: admin
legacy: true
```

This fallback should be removed only after individual keys are deployed and verified in production.

## Roles

- `viewer` — authenticated read-only access to the order queue
- `sales` — quote/order-state work plus Shopify draft/invoice/payment actions
- `workshop` — manufacturing resolutions, workshop release, progress, final-photo storage, controlled revisions
- `qc` — production progress/final-photo work plus final-QC completion
- `admin` — all staff permissions

The server is authoritative. UI disabling is convenience only.

## Audit identity

For individual identities, the server ignores user-supplied staff-name fields and derives the actor from the authenticated access key.

Workshop audit events now carry:

```json
{
  "actor": "Ray",
  "actorId": "ray",
  "actorRoles": ["sales", "workshop"]
}
```

Human-readable existing fields such as `workshop_released_by` continue to store the authenticated display name.

Legacy shared access still requires manual actor entry because a shared token cannot prove which person is operating it.

## Browser behavior

The access key remains in `sessionStorage` only, preserving the existing tab-session model.

After connection, the console displays authenticated name/roles. For individual access:

- release identity is prefilled and read-only;
- controlled-revision identity is prefilled and read-only;
- workshop/QC operator identity is prefilled and read-only;
- unauthorized mutation controls are disabled.

Server-side permission checks remain in force even if browser markup is modified manually.

## Resource isolation

The V0.25 identity controller and CSS are lazy staff-only assets:

- `/staff-identity-v025.js`
- `/staff-identity-v025.css`

They are not requested by the customer Studio and have dedicated build budgets.

# V0.24 — Workshop Focus Station

## Purpose

V0.24 adds a low-distraction production mode to the staff console without creating a second workshop application or adding customer-storefront JavaScript.

The existing staff dialog remains the administrative source of truth. Workshop Focus is a lazy presentation/controller layer for released builds.

## Entry

Workshop Focus is enabled only when the selected order has an active packet whose release state is:

```text
released-for-production
```

The feature is loaded on demand from:

```text
/staff-focus-v024.js
```

It is not loaded by the customer Studio and is not loaded merely by opening the staff queue.

## Focus layout

When activated, the order dialog becomes a shop-floor station:

- administrative request JSON is hidden;
- ordinary status/quote/staff-note controls are hidden;
- Shopify draft/invoice controls are hidden;
- the released build packet remains visible;
- production-progress/final-QC controls remain visible;
- the active work-order ID and revision are pinned at the top;
- manufacturing and final-QC completion counts remain visible;
- the next unchecked required step is surfaced.

This is a view-layer change only. No manufacturing authority is duplicated.

## Operator memory

The Workshop Focus operator name is kept in `sessionStorage` so a staff member does not need to retype their name for every action in the same browser tab.

It is not written to the URL or persistent local storage.

## Optional auto-save

Auto-save is intentionally opt-in.

When enabled, checklist changes are batched for 650 ms and then invoke the existing **Save progress** action.

This preserves the V0.21 API validation, audit attribution, active-revision validation, and database persistence rules rather than implementing a second write path.

If no operator is entered, auto-save does not run.

## Keyboard control

While focus mode is active:

- `Ctrl/Cmd + S` invokes the existing validated progress-save action.
- `Escape` exits focus mode without closing the order dialog.

## Resource policy

V0.24 is a lazy staff-only module.

It adds no customer-storefront runtime cost, no serverless function, no database migration, and no polling loop.

Progress counts are derived from the already-rendered checklist DOM. A small `MutationObserver` is created only after Workshop Focus is used and is scoped to checklist/status elements.

## Motion

Focus entry and progress changes use restrained transitions.

`prefers-reduced-motion: reduce` disables the focus-entry animation and progress transitions.

## Safety

Workshop Focus does not bypass:

- payment confirmation;
- workshop release gates;
- revision matching;
- controlled-revision rules;
- checklist validation;
- final-QC photo requirement;
- final-QC completion gate.

It only reduces UI noise around the existing controls.

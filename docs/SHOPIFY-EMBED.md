# Shopify Integration — Scorpion Custom Leather Studio

## Architecture

The production storefront does **not** need to move the full Three.js configurator into the Shopify theme bundle.

Recommended architecture:

```text
scorpionwesternwear.com
        ↓
Shopify page /pages/custom-leather-studio
        ↓
Custom Leather Studio section
        ↓
responsive iframe
        ↓
Studio web app / 3D / order engine / API
```

This keeps the Shopify theme small while allowing the Studio to use React, Three.js, file intake, server-side order delivery, and future 3D assets.

## 1. Stable Studio URL

Use a stable production URL for the deployed app. A Scorpion-owned subdomain is preferable:

```text
https://studio.scorpionwesternwear.com
```

The Shopify section automatically adds:

```text
?embed=1
```

Embedded mode removes the duplicate outer Studio heading and reports its document height to the Shopify parent page.

## 2. Add the Shopify section

Copy:

```text
shopify/sections/scorpion-custom-leather-studio.liquid
```

into the active Shopify theme's `sections/` directory.

Create a page/template for the Custom Leather Studio and add the **Custom Leather Studio** section through the theme editor.

Set **Studio URL** to the stable production Studio URL.

## 3. Product-page "Customize this" button

Copy:

```text
shopify/snippets/scorpion-customize-button.liquid
```

into the theme's `snippets/` directory.

Render it from a product template/block where appropriate:

```liquid
{% render 'scorpion-customize-button', product: product %}
```

The button links to:

```text
/pages/custom-leather-studio?product={{ product.handle }}
```

The Shopify Studio section forwards that product handle into the embedded app.

The app searches its real Scorpion catalog references and opens the correct family/reference automatically.

## 4. Supported deep links

The Studio supports:

```text
?product=cowhide-radio-harness-black
?family=radio-harness
?family=radio-harness&reference=radio-black
?family=radio-harness&reference=radio-black&variant=SC-LRH-BLK-XL-002
```

A serialized customer build still uses:

```text
?studio=<build-token>
```

and takes precedence over catalog-target parameters.

## 5. Responsive iframe protocol

The embedded Studio posts only layout messages to its parent:

```js
{
  type: 'scorpion-leather-studio:resize',
  version: 1,
  height: 2480
}
```

and:

```js
{
  type: 'scorpion-leather-studio:ready',
  version: 1
}
```

No customer name, email, phone, artwork, or order content is transmitted to the Shopify parent page through `postMessage`.

The Shopify section validates both the iframe window and expected Studio origin before honoring messages.

## 6. Order API

Order submission continues to happen directly from the Studio app to:

```text
POST /api/order-requests
```

This avoids exposing SMTP credentials or future Shopify Admin credentials to the theme/browser.

## 7. Theme sandbox permissions

The section iframe permits the minimum features currently needed by the Studio:

- scripts
- same-origin app behavior
- forms
- build-sheet downloads
- print packet popups
- user-initiated email fallback navigation
- clipboard writes

Review the sandbox list again before broad public launch if new browser capabilities are added.

## 8. Recommended production URL sequence

Development:

```text
Vercel production deployment
```

Then:

```text
studio.scorpionwesternwear.com
```

Then Shopify:

```text
scorpionwesternwear.com/pages/custom-leather-studio
```

Customers remain visually inside the Scorpion storefront while the specialized application runs independently underneath.

## 9. Product eligibility

The Studio currently includes the Scorpion leather families already assembled in the application catalog. Product-page buttons should only be added to items that Scorpion wants to accept customization inquiries for.

The Studio treats tooling, lettering, artwork, construction changes, and non-stock modifications as **requests**, not guaranteed production options. Scorpion remains the authority on feasibility and final pricing.

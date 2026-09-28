import { readFileSync } from 'node:fs'

const section = readFileSync(new URL('../shopify/sections/scorpion-custom-leather-studio.liquid', import.meta.url), 'utf8')
const snippet = readFileSync(new URL('../shopify/snippets/scorpion-customize-button.liquid', import.meta.url), 'utf8')
const app = readFileSync(new URL('../apps/configurator/src/App.tsx', import.meta.url), 'utf8')
const studioUrl = readFileSync(new URL('../apps/configurator/src/studio-url.ts', import.meta.url), 'utf8')

function requireMarker(source, marker, label) {
  if (!source.includes(marker)) throw new Error(`Shopify embed smoke check failed: missing ${label}.`)
  console.log(`✓ ${label}`)
}

const schemaMatch = section.match(/{% schema %}\s*([\s\S]*?)\s*{% endschema %}/u)
if (!schemaMatch) throw new Error('Shopify embed smoke check failed: section schema block missing.')
const schema = JSON.parse(schemaMatch[1])
if (schema.name !== 'Scorpion Leather Studio') throw new Error('Shopify embed smoke check failed: unexpected section schema name.')
console.log('✓ Section schema parses')

requireMarker(section, "studioUrl.searchParams.set('embed', '1')", 'embedded-mode flag')
requireMarker(section, "studioUrl.searchParams.set('parent_origin', window.location.origin)", 'exact parent-origin handoff')
requireMarker(section, "studioUrl.searchParams.set('host_page'", 'storefront host-page handoff')
requireMarker(section, "event.source !== frame.contentWindow", 'message source validation')
requireMarker(section, "event.origin !== studioOrigin", 'message origin validation')
requireMarker(section, "event.data.version !== 1", 'message protocol version gate')
requireMarker(section, "scorpion-leather-studio:ready", 'ready handshake')
requireMarker(section, "scorpion-leather-studio:resize", 'bounded resize handshake')
requireMarker(section, "scorpion-leather-studio:history", 'storefront history synchronization')
requireMarker(section, "requestAnimationFrame(applyHeight)", 'resize batching')
requireMarker(section, "shopify:section:unload", 'Theme Editor cleanup')
requireMarker(section, "data-sls-retry", 'load recovery control')
requireMarker(section, "<noscript>", 'no-JavaScript fallback')
requireMarker(section, 'allow="clipboard-write"', 'clipboard permission')
requireMarker(section, 'referrerpolicy="strict-origin-when-cross-origin"', 'referrer policy')
requireMarker(snippet, "product.handle | url_encode", 'product deep-link encoding')
requireMarker(app, "studioParentTargetOrigin(embedContext)", 'exact child-to-parent postMessage target')
requireMarker(app, "scorpion-leather-studio:history", 'child history synchronization')
requireMarker(studioUrl, "context.hostPageUrl", 'storefront-native share URL selection')
requireMarker(studioUrl, "url.searchParams.delete('parent_origin')", 'standalone share URL cleanup')
console.log('Shopify embed smoke checks passed.')

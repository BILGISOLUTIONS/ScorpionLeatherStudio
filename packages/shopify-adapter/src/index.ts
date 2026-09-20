import { createConfigurationId, serializeConfiguration, type ConfigurationState } from '@sls/configurator-core'
import { calculatePrice } from '@sls/pricing-engine'
import type { ProductDefinition } from '@sls/product-schema'

export interface ShopifyAttribute {
  key: string
  value: string
}

export interface ShopifyCartLineInput {
  merchandiseId: string
  quantity: number
  attributes: ShopifyAttribute[]
}

export function buildMockCartLine(product: ProductDefinition, configuration: ConfigurationState): ShopifyCartLineInput {
  const pricing = calculatePrice(product, configuration)
  const selectedCustomerValues = product.optionGroups
    .filter((group) => group.visibility !== 'development')
    .map((group) => {
      const value = group.values.find((candidate) => candidate.id === configuration.selections[group.id])
      return { group, value }
    })

  const readableSelections = selectedCustomerValues.map(({ group, value }) => {
    return `${group.label}: ${value?.label ?? configuration.selections[group.id]}`
  })

  const sourceReference = selectedCustomerValues.find(({ value }) => value?.commerce?.merchandiseId)
  const attributes: ShopifyAttribute[] = [
    { key: '_sls_configuration_id', value: createConfigurationId(configuration) },
    { key: '_sls_schema_version', value: String(configuration.schemaVersion) },
    { key: 'Custom build', value: readableSelections.join(' · ') },
    { key: '_sls_configuration', value: serializeConfiguration(configuration) },
    { key: '_sls_preview_total_minor', value: String(pricing.total) },
    { key: '_sls_price_status', value: product.commerce.priceStatus ?? 'approved' },
  ]

  if (sourceReference?.value?.commerce?.shopifyProductId) {
    attributes.push({ key: '_sls_source_product_id', value: sourceReference.value.commerce.shopifyProductId })
  }
  if (sourceReference?.value?.commerce?.sku) {
    attributes.push({ key: '_sls_source_sku', value: sourceReference.value.commerce.sku })
  }

  return {
    merchandiseId: configuration.merchandiseId,
    quantity: 1,
    attributes,
  }
}

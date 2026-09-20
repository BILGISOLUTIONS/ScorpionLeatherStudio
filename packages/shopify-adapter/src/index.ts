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
  const readableSelections = product.optionGroups.map((group) => {
    const value = group.values.find((candidate) => candidate.id === configuration.selections[group.id])
    return `${group.label}: ${value?.label ?? configuration.selections[group.id]}`
  })

  return {
    merchandiseId: configuration.merchandiseId,
    quantity: 1,
    attributes: [
      {key: '_sls_configuration_id', value: createConfigurationId(configuration)},
      {key: '_sls_schema_version', value: String(configuration.schemaVersion)},
      {key: 'Custom build', value: readableSelections.join(' · ')},
      {key: '_sls_configuration', value: serializeConfiguration(configuration)},
      {key: '_sls_preview_total_minor', value: String(pricing.total)},
    ],
  }
}

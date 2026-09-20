import type { ConfigurationState } from '@sls/configurator-core'
import type { ProductDefinition } from '@sls/product-schema'

export interface PriceLine {
  id: string
  label: string
  amount: number
}

export interface PriceBreakdown {
  currency: string
  basePrice: number
  lines: PriceLine[]
  total: number
}

export function calculatePrice(product: ProductDefinition, configuration: ConfigurationState): PriceBreakdown {
  const lines: PriceLine[] = []

  for (const group of product.optionGroups) {
    const selectedId = configuration.selections[group.id]
    const selected = group.values.find((value) => value.id === selectedId)
    if (!selected || selected.priceModifier === 0) continue
    lines.push({
      id: `${group.id}:${selected.id}`,
      label: `${group.label}: ${selected.label}`,
      amount: selected.priceModifier,
    })
  }

  return {
    currency: product.currency,
    basePrice: product.basePrice,
    lines,
    total: product.basePrice + lines.reduce((sum, line) => sum + line.amount, 0),
  }
}

export function formatMoney(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {style: 'currency', currency}).format(amount / 100)
}

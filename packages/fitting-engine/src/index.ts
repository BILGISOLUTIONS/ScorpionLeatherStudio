import type { ConfigurationState } from '@sls/configurator-core'
import type { MeasurementDefinition, ProductDefinition } from '@sls/product-schema'

export interface MeasurementValidation {
  valid: boolean
  message?: string
}

export interface FitRecommendation {
  size: string
  message: string
}

export function validateMeasurement(definition: MeasurementDefinition, value: number | undefined): MeasurementValidation {
  if (value === undefined) {
    return definition.required ? {valid: false, message: `${definition.label} is required.`} : {valid: true}
  }
  if (!Number.isFinite(value)) return {valid: false, message: 'Enter a valid number.'}
  if (value < definition.min || value > definition.max) {
    return {valid: false, message: `${definition.label} must be between ${definition.min} and ${definition.max} ${definition.unit}.`}
  }
  return {valid: true}
}

export function recommendFit(product: ProductDefinition, configuration: ConfigurationState): FitRecommendation | undefined {
  for (const rule of product.sizeRecommendations) {
    const value = configuration.measurements[rule.measurementId]
    if (value === undefined) continue
    if (value >= rule.minInclusive && value <= rule.maxInclusive) {
      return {size: rule.recommendedSize, message: rule.message}
    }
  }
  return undefined
}

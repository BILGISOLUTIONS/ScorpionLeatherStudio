import type { CompatibilityRule, ProductDefinition } from '@sls/product-schema'

export interface ConfigurationState {
  schemaVersion: 1
  productId: string
  merchandiseId: string
  selections: Record<string, string>
  measurements: Record<string, number | undefined>
  personalization: Record<string, string>
}

export interface ConfigurationProblem {
  ruleId: string
  groupId: string
  valueId: string
  reason: string
}

export interface ResolvedConfiguration {
  configuration: ConfigurationState
  problems: ConfigurationProblem[]
  configurationId: string
}

export function resolveMerchandiseId(
  product: ProductDefinition,
  selections: Record<string, string>,
  fallback = product.commerce.defaultMerchandiseId,
): string {
  for (const group of product.optionGroups) {
    const selectedId = selections[group.id]
    const value = group.values.find((candidate) => candidate.id === selectedId)
    if (value?.commerce?.merchandiseId) return value.commerce.merchandiseId
  }
  return fallback
}

export function createInitialConfiguration(product: ProductDefinition): ConfigurationState {
  const selections = Object.fromEntries(product.optionGroups.map((group) => [group.id, group.defaultValue]))
  return {
    schemaVersion: 1,
    productId: product.id,
    merchandiseId: resolveMerchandiseId(product, selections),
    selections,
    measurements: Object.fromEntries(product.measurements.map((measurement) => [measurement.id, undefined])),
    personalization: {},
  }
}

function ruleMatches(rule: CompatibilityRule, selections: Record<string, string>): boolean {
  return rule.when.every((condition) => selections[condition.groupId] === condition.equals)
}

export function getConfigurationProblems(
  product: ProductDefinition,
  configuration: ConfigurationState,
): ConfigurationProblem[] {
  return product.compatibilityRules.flatMap((rule) => {
    if (!ruleMatches(rule, configuration.selections)) return []
    const selected = configuration.selections[rule.disallow.groupId]
    if (selected !== rule.disallow.valueId) return []
    return [{
      ruleId: rule.id,
      groupId: rule.disallow.groupId,
      valueId: rule.disallow.valueId,
      reason: rule.reason,
    }]
  })
}

export function isSelectionAllowed(
  product: ProductDefinition,
  configuration: ConfigurationState,
  groupId: string,
  valueId: string,
): { allowed: boolean; reason?: string } {
  const candidate: ConfigurationState = {
    ...configuration,
    selections: { ...configuration.selections, [groupId]: valueId },
  }
  const problem = getConfigurationProblems(product, candidate)[0]
  return problem ? { allowed: false, reason: problem.reason } : { allowed: true }
}

export function setSelection(
  product: ProductDefinition,
  configuration: ConfigurationState,
  groupId: string,
  valueId: string,
): ConfigurationState {
  const group = product.optionGroups.find((item) => item.id === groupId)
  if (!group) throw new Error(`Unknown option group: ${groupId}`)
  if (!group.values.some((value) => value.id === valueId)) throw new Error(`Unknown option value: ${groupId}.${valueId}`)

  const permission = isSelectionAllowed(product, configuration, groupId, valueId)
  if (!permission.allowed) throw new Error(permission.reason ?? 'Selection is not compatible with the current configuration.')

  const selections = {...configuration.selections, [groupId]: valueId}

  return {
    ...configuration,
    merchandiseId: resolveMerchandiseId(product, selections, configuration.merchandiseId),
    selections,
  }
}

export function setMeasurement(
  product: ProductDefinition,
  configuration: ConfigurationState,
  measurementId: string,
  value: number | undefined,
): ConfigurationState {
  const definition = product.measurements.find((item) => item.id === measurementId)
  if (!definition) throw new Error(`Unknown measurement: ${measurementId}`)
  return {
    ...configuration,
    measurements: {...configuration.measurements, [measurementId]: value},
  }
}

export function setPersonalization(
  configuration: ConfigurationState,
  fieldId: string,
  value: string,
): ConfigurationState {
  return {
    ...configuration,
    personalization: {...configuration.personalization, [fieldId]: value},
  }
}

function canonicalJson(configuration: ConfigurationState): string {
  const orderedSelections = Object.fromEntries(Object.entries(configuration.selections).sort(([a], [b]) => a.localeCompare(b)))
  const orderedMeasurements = Object.fromEntries(Object.entries(configuration.measurements).sort(([a], [b]) => a.localeCompare(b)))
  const orderedPersonalization = Object.fromEntries(Object.entries(configuration.personalization).sort(([a], [b]) => a.localeCompare(b)))
  return JSON.stringify({
    schemaVersion: configuration.schemaVersion,
    productId: configuration.productId,
    merchandiseId: configuration.merchandiseId,
    selections: orderedSelections,
    measurements: orderedMeasurements,
    personalization: orderedPersonalization,
  })
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function base64UrlToBytes(token: string): Uint8Array {
  const base64 = token.replaceAll('-', '+').replaceAll('_', '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export function createConfigurationId(configuration: ConfigurationState): string {
  return `SC-${fnv1a(canonicalJson(configuration)).toUpperCase()}`
}

export function serializeConfiguration(configuration: ConfigurationState): string {
  return canonicalJson(configuration)
}

export function createShareToken(configuration: ConfigurationState): string {
  return bytesToBase64Url(new TextEncoder().encode(canonicalJson(configuration)))
}

export function restoreShareToken(product: ProductDefinition, token: string): ConfigurationState {
  try {
    const serialized = new TextDecoder().decode(base64UrlToBytes(token))
    return restoreConfiguration(product, serialized)
  } catch {
    throw new Error('This shared build link is invalid or no longer compatible.')
  }
}

export function restoreConfiguration(product: ProductDefinition, serialized: string): ConfigurationState {
  const parsed = JSON.parse(serialized) as Partial<ConfigurationState>
  if (parsed.schemaVersion !== 1 || parsed.productId !== product.id || typeof parsed.selections !== 'object') {
    throw new Error('Configuration is incompatible with this product.')
  }

  let configuration = createInitialConfiguration(product)
  for (const group of product.optionGroups) {
    const valueId = parsed.selections?.[group.id]
    if (typeof valueId === 'string') configuration = setSelection(product, configuration, group.id, valueId)
  }
  for (const [measurementId, value] of Object.entries(parsed.measurements ?? {})) {
    if (typeof value === 'number') configuration = setMeasurement(product, configuration, measurementId, value)
  }
  return {
    ...configuration,
    personalization: typeof parsed.personalization === 'object' && parsed.personalization ? {...parsed.personalization} : {},
  }
}

export function resolveConfiguration(product: ProductDefinition, configuration: ConfigurationState): ResolvedConfiguration {
  return {
    configuration,
    problems: getConfigurationProblems(product, configuration),
    configurationId: createConfigurationId(configuration),
  }
}

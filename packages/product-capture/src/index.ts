export type ReferenceKind =
  | 'required-view'
  | 'mechanical-state'
  | 'construction-detail'
  | 'measurement-reference'

export interface ProductReferenceRequirement {
  key: string
  label: string
  purpose: string
  kind: ReferenceKind
  required: boolean
}

export interface ProductDimensionRequirement {
  id: string
  label: string
  group: 'envelope' | 'visor' | 'construction'
  required: boolean
}

export interface ProductNodeRequirement {
  role: string
  label: string
  required: boolean
  suggestedNodeName?: string
}

export interface ProductCapturePlan {
  schemaVersion: 1
  id: string
  label: string
  referenceRequirements: ProductReferenceRequirement[]
  dimensionRequirements: ProductDimensionRequirement[]
  nodeRequirements: ProductNodeRequirement[]
}

export interface CapturedReferenceFrame {
  name: string
  size: number
  type: string
  lastModified: number
  kind: ReferenceKind
}

export interface CapturedDimension {
  id: string
  label: string
  valueMm?: number
  notes?: string
}

export interface ConstructionNodeRecord {
  role: string
  label: string
  nodeName: string
  status: 'pending' | 'confirmed'
  parentNode?: string
  notes?: string
}

export interface ProductComponentRecord {
  groupId: string
  valueId: string
  label: string
  nodeNames: string[]
  status: 'pending' | 'confirmed'
  evidenceFrameKeys: string[]
}

export interface ProductMaterialSlotRecord {
  slotId: string
  label: string
  materialId?: string
  nodeNames: string[]
  status: 'pending' | 'confirmed'
  evidenceFrameKeys: string[]
}

export interface ProductCaptureSession {
  schemaVersion: 1
  capturePlanId: string
  captureSessionId: string
  productId: string
  productLabel: string
  productCategory: string
  sourceSku?: string
  operator: string
  capturedAt: string
  references: Record<string, CapturedReferenceFrame>
  dimensions: CapturedDimension[]
  constructionNodes: ConstructionNodeRecord[]
  components: ProductComponentRecord[]
  materialSlots: ProductMaterialSlotRecord[]
  notes?: string
}

export interface ProductCaptureIssue {
  path: string
  message: string
}

export interface ProductConstructionPacket {
  schemaVersion: 1
  productId: string
  productLabel: string
  productCategory: string
  sourceSku?: string
  sourceCaptureSessionId: string
  capturePlanId: string
  generatedAt: string
  status: 'ready-for-digital-twin-reconstruction'
  automaticAssetMutation: false
  provenance: {
    operator: string
    capturedAt: string
  }
  referenceCoverage: Array<{
    key: string
    name: string
    kind: ReferenceKind
    size: number
    lastModified: number
  }>
  dimensionsMm: Record<string, number>
  constructionNodes: ConstructionNodeRecord[]
  components: ProductComponentRecord[]
  materialSlots: ProductMaterialSlotRecord[]
  notes?: string
}

function issue(path: string, message: string): ProductCaptureIssue {
  return { path, message }
}

function nonEmpty(value: string | undefined): boolean {
  return Boolean(value?.trim())
}

function validTimestamp(value: string): boolean {
  return nonEmpty(value) && Number.isFinite(Date.parse(value))
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates]
}

export function validateProductCapture(
  session: ProductCaptureSession,
  plan: ProductCapturePlan,
): ProductCaptureIssue[] {
  const issues: ProductCaptureIssue[] = []

  if (session.schemaVersion !== 1) issues.push(issue('schemaVersion', 'Unsupported product-capture schema version.'))
  if (plan.schemaVersion !== 1) issues.push(issue('capturePlan.schemaVersion', 'Unsupported capture-plan schema version.'))
  if (session.capturePlanId !== plan.id) {
    issues.push(issue('capturePlanId', 'Capture session does not match the selected capture plan.'))
  }

  if (!nonEmpty(session.captureSessionId)) issues.push(issue('captureSessionId', 'Capture session ID is required.'))
  if (!nonEmpty(session.productId)) issues.push(issue('productId', 'Product ID is required.'))
  if (!nonEmpty(session.productLabel)) issues.push(issue('productLabel', 'Product label is required.'))
  if (!nonEmpty(session.productCategory)) issues.push(issue('productCategory', 'Product category is required.'))
  if (!nonEmpty(session.operator)) issues.push(issue('operator', 'Capture operator is required.'))
  if (!validTimestamp(session.capturedAt)) issues.push(issue('capturedAt', 'A valid capture timestamp is required.'))

  const requirementKeys = new Set(plan.referenceRequirements.map((requirement) => requirement.key))
  for (const requirement of plan.referenceRequirements) {
    const frame = session.references[requirement.key]
    if (requirement.required && !frame) {
      issues.push(issue(`references.${requirement.key}`, `Required reference is missing: ${requirement.label}.`))
      continue
    }
    if (frame) {
      if (frame.size <= 0 || !Number.isFinite(frame.size)) {
        issues.push(issue(`references.${requirement.key}.size`, 'Reference file size must be greater than zero.'))
      }
      if (!nonEmpty(frame.name)) {
        issues.push(issue(`references.${requirement.key}.name`, 'Reference filename is required.'))
      }
      if (frame.kind !== requirement.kind) {
        issues.push(issue(`references.${requirement.key}.kind`, 'Reference kind does not match the capture plan.'))
      }
    }
  }
  for (const key of Object.keys(session.references)) {
    if (!requirementKeys.has(key)) {
      issues.push(issue(`references.${key}`, 'Reference is not defined by the active capture plan.'))
    }
  }

  const dimensionsById = new Map(session.dimensions.map((dimension) => [dimension.id, dimension]))
  const duplicateDimensionIds = duplicateValues(session.dimensions.map((dimension) => dimension.id))
  for (const id of duplicateDimensionIds) {
    issues.push(issue(`dimensions.${id}`, 'Dimension IDs must be unique.'))
  }
  for (const requirement of plan.dimensionRequirements) {
    const dimension = dimensionsById.get(requirement.id)
    if (!dimension) {
      if (requirement.required) issues.push(issue(`dimensions.${requirement.id}`, `Required dimension is missing: ${requirement.label}.`))
      continue
    }
    if (requirement.required && (!Number.isFinite(dimension.valueMm) || (dimension.valueMm ?? 0) <= 0)) {
      issues.push(issue(`dimensions.${requirement.id}.valueMm`, `A positive millimeter value is required for ${requirement.label}.`))
    }
  }

  const nodesByRole = new Map(session.constructionNodes.map((node) => [node.role, node]))
  const duplicateRoles = duplicateValues(session.constructionNodes.map((node) => node.role))
  for (const role of duplicateRoles) issues.push(issue(`constructionNodes.${role}`, 'Construction node roles must be unique.'))

  const confirmedNodeNames = session.constructionNodes
    .filter((node) => node.status === 'confirmed' && nonEmpty(node.nodeName))
    .map((node) => node.nodeName.trim())
  for (const name of duplicateValues(confirmedNodeNames)) {
    issues.push(issue('constructionNodes', `Confirmed semantic node name "${name}" is used more than once.`))
  }

  for (const requirement of plan.nodeRequirements) {
    const node = nodesByRole.get(requirement.role)
    if (!node) {
      if (requirement.required) issues.push(issue(`constructionNodes.${requirement.role}`, `Required semantic node is missing: ${requirement.label}.`))
      continue
    }
    if (requirement.required && node.status !== 'confirmed') {
      issues.push(issue(`constructionNodes.${requirement.role}.status`, `Semantic node must be confirmed: ${requirement.label}.`))
    }
    if (node.status === 'confirmed' && !nonEmpty(node.nodeName)) {
      issues.push(issue(`constructionNodes.${requirement.role}.nodeName`, 'Confirmed semantic nodes require a node name.'))
    }
  }

  const referenceKeys = new Set(Object.keys(session.references))
  for (const component of session.components) {
    const prefix = `components.${component.groupId}.${component.valueId}`
    if (!nonEmpty(component.groupId) || !nonEmpty(component.valueId)) {
      issues.push(issue(prefix, 'Component group and value IDs are required.'))
    }
    if (component.status === 'confirmed' && component.nodeNames.filter(nonEmpty).length === 0) {
      issues.push(issue(`${prefix}.nodeNames`, 'Confirmed components require at least one semantic node.'))
    }
    for (const key of component.evidenceFrameKeys) {
      if (!referenceKeys.has(key)) issues.push(issue(`${prefix}.evidenceFrameKeys`, `Evidence frame "${key}" is not present in this capture session.`))
    }
  }

  for (const slot of session.materialSlots) {
    const prefix = `materialSlots.${slot.slotId}`
    if (!nonEmpty(slot.slotId)) issues.push(issue(prefix, 'Material slot ID is required.'))
    if (slot.status === 'confirmed' && !nonEmpty(slot.materialId)) {
      issues.push(issue(`${prefix}.materialId`, 'Confirmed material slots require a production material ID.'))
    }
    if (slot.status === 'confirmed' && slot.nodeNames.filter(nonEmpty).length === 0) {
      issues.push(issue(`${prefix}.nodeNames`, 'Confirmed material slots require at least one semantic node.'))
    }
    for (const key of slot.evidenceFrameKeys) {
      if (!referenceKeys.has(key)) issues.push(issue(`${prefix}.evidenceFrameKeys`, `Evidence frame "${key}" is not present in this capture session.`))
    }
  }

  return issues
}

export function buildProductConstructionPacket(args: {
  session: ProductCaptureSession
  plan: ProductCapturePlan
  generatedAt: string
}): ProductConstructionPacket {
  const issues = validateProductCapture(args.session, args.plan)
  if (issues.length) {
    throw new Error(issues.map((entry) => `${entry.path}: ${entry.message}`).join('\n'))
  }
  if (!validTimestamp(args.generatedAt)) throw new Error('generatedAt: A valid packet timestamp is required.')

  const requiredDimensionIds = new Set(args.plan.dimensionRequirements.map((requirement) => requirement.id))
  const dimensionsMm = Object.fromEntries(
    args.session.dimensions
      .filter((dimension) => requiredDimensionIds.has(dimension.id) && Number.isFinite(dimension.valueMm))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((dimension) => [dimension.id, dimension.valueMm as number] as const),
  )

  const referenceCoverage = Object.entries(args.session.references)
    .map(([key, frame]) => ({
      key,
      name: frame.name,
      kind: frame.kind,
      size: frame.size,
      lastModified: frame.lastModified,
    }))
    .sort((a, b) => a.key.localeCompare(b.key))

  return {
    schemaVersion: 1,
    productId: args.session.productId.trim(),
    productLabel: args.session.productLabel.trim(),
    productCategory: args.session.productCategory.trim(),
    sourceSku: args.session.sourceSku?.trim() || undefined,
    sourceCaptureSessionId: args.session.captureSessionId.trim(),
    capturePlanId: args.plan.id,
    generatedAt: new Date(args.generatedAt).toISOString(),
    status: 'ready-for-digital-twin-reconstruction',
    automaticAssetMutation: false,
    provenance: {
      operator: args.session.operator.trim(),
      capturedAt: new Date(args.session.capturedAt).toISOString(),
    },
    referenceCoverage,
    dimensionsMm,
    constructionNodes: args.session.constructionNodes.map((node) => ({ ...node, nodeName: node.nodeName.trim() })),
    components: args.session.components.map((component) => ({
      ...component,
      nodeNames: component.nodeNames.map((name) => name.trim()).filter(Boolean),
    })),
    materialSlots: args.session.materialSlots.map((slot) => ({
      ...slot,
      materialId: slot.materialId?.trim() || undefined,
      nodeNames: slot.nodeNames.map((name) => name.trim()).filter(Boolean),
    })),
    notes: args.session.notes?.trim() || undefined,
  }
}

export const weldingHoodCapturePlan: ProductCapturePlan = {
  schemaVersion: 1,
  id: 'scorpion-welding-hood-v1',
  label: 'Scorpion Leather Welding Hood',
  referenceRequirements: [
    { key: 'front', label: 'Straight front', purpose: 'Primary silhouette and construction reference.', kind: 'required-view', required: true },
    { key: 'frontLeft45', label: 'Front-left 45°', purpose: 'Depth, visor and left-side construction.', kind: 'required-view', required: true },
    { key: 'left', label: 'Left side', purpose: 'Side silhouette and hinge position.', kind: 'required-view', required: true },
    { key: 'rearLeft45', label: 'Rear-left 45°', purpose: 'Rear drape and left-side construction.', kind: 'required-view', required: true },
    { key: 'rear', label: 'Straight rear', purpose: 'Rear silhouette and guard construction.', kind: 'required-view', required: true },
    { key: 'rearRight45', label: 'Rear-right 45°', purpose: 'Rear drape and right-side construction.', kind: 'required-view', required: true },
    { key: 'right', label: 'Right side', purpose: 'Side silhouette and hinge position.', kind: 'required-view', required: true },
    { key: 'frontRight45', label: 'Front-right 45°', purpose: 'Depth, visor and right-side construction.', kind: 'required-view', required: true },
    { key: 'highFront', label: 'High front', purpose: 'Top construction and visor depth.', kind: 'required-view', required: true },
    { key: 'highRear', label: 'High rear', purpose: 'Top/rear construction.', kind: 'required-view', required: true },
    { key: 'lowFront', label: 'Low front', purpose: 'Lower edge, visor underside and drape.', kind: 'required-view', required: true },
    { key: 'lowRear', label: 'Low rear', purpose: 'Lower rear edge and neck guard.', kind: 'required-view', required: true },
    { key: 'visorClosed', label: 'Visor fully closed', purpose: 'Mechanical closed state and stop position.', kind: 'mechanical-state', required: true },
    { key: 'visorOpen', label: 'Visor fully open', purpose: 'Mechanical open state and travel limit.', kind: 'mechanical-state', required: true },
    { key: 'hingeLeft', label: 'Left hinge close-up', purpose: 'Pivot construction and hardware spacing.', kind: 'construction-detail', required: true },
    { key: 'hingeRight', label: 'Right hinge close-up', purpose: 'Pivot construction and hardware spacing.', kind: 'construction-detail', required: true },
    { key: 'interior', label: 'Interior', purpose: 'Interior layers, seams and attachments.', kind: 'construction-detail', required: true },
    { key: 'measurementScale', label: 'Scale / ruler reference', purpose: 'At least one measured reference with ruler or tape visible.', kind: 'measurement-reference', required: true },
    { key: 'seamDetail', label: 'Seam detail', purpose: 'Stitch spacing and reinforcement reference.', kind: 'construction-detail', required: false },
    { key: 'hardwareDetail', label: 'Hardware detail', purpose: 'Rivets, snaps and finish reference.', kind: 'construction-detail', required: false },
    { key: 'leatherEdge', label: 'Leather edge detail', purpose: 'Layering, edge finish and thickness reference.', kind: 'construction-detail', required: false },
  ],
  dimensionRequirements: [
    { id: 'maxWidth', label: 'Maximum width', group: 'envelope', required: true },
    { id: 'maxHeight', label: 'Maximum height', group: 'envelope', required: true },
    { id: 'maxDepth', label: 'Maximum depth', group: 'envelope', required: true },
    { id: 'visorFrameWidth', label: 'Visor frame width', group: 'visor', required: true },
    { id: 'visorFrameHeight', label: 'Visor frame height', group: 'visor', required: true },
    { id: 'visorFrameDepth', label: 'Visor frame depth', group: 'visor', required: true },
    { id: 'lensOpeningWidth', label: 'Lens opening width', group: 'visor', required: true },
    { id: 'lensOpeningHeight', label: 'Lens opening height', group: 'visor', required: true },
    { id: 'rearGuardWidth', label: 'Rear / neck guard width', group: 'construction', required: true },
    { id: 'rearGuardLength', label: 'Rear / neck guard length', group: 'construction', required: true },
    { id: 'strapWidth', label: 'Strap width', group: 'construction', required: true },
    { id: 'leatherThickness', label: 'Leather thickness', group: 'construction', required: true },
    { id: 'rivetDiameter', label: 'Rivet diameter', group: 'construction', required: true },
    { id: 'keyHardwareSpacing', label: 'Key hardware spacing', group: 'construction', required: true },
  ],
  nodeRequirements: [
    { role: 'product-root', label: 'Product root', required: true, suggestedNodeName: 'SLS_ProductRoot' },
    { role: 'shell-main', label: 'Main leather shell', required: true, suggestedNodeName: 'Shell_Main' },
    { role: 'visor-pivot', label: 'Visor pivot', required: true, suggestedNodeName: 'Visor_Pivot' },
    { role: 'visor-frame', label: 'Visor frame', required: true, suggestedNodeName: 'Visor_Frame' },
    { role: 'visor-lens', label: 'Visor lens', required: true, suggestedNodeName: 'Visor_Lens' },
  ],
}

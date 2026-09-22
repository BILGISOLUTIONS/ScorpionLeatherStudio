import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  validateMaterialDefinition,
  type MaterialAvailability,
  type MaterialLifecycle,
  type ScorpionMaterialDefinition,
} from '@sls/material-library'
import { scorpionMaterialDefinitions } from './scorpion-materials'
import './material-lab.css'

type Filter = 'all' | MaterialLifecycle | MaterialAvailability

function label(value: string): string {
  return value
    .split('-')
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ')
}

function materialReadiness(material: ScorpionMaterialDefinition) {
  const issues = validateMaterialDefinition(material)
  const blockers: string[] = issues.map((issue) => issue.message)

  if (material.lifecycle !== 'production-approved') {
    blockers.push(
      material.lifecycle === 'reference-only'
        ? 'Physical sample has not been production-approved.'
        : 'Captured master still needs production approval.',
    )
  }

  if (material.availability !== 'confirmed') {
    blockers.push(
      material.availability === 'quote'
        ? 'Availability remains quote-dependent.'
        : 'Availability has not been confirmed.',
    )
  }

  if (material.kind === 'leather' && !material.textureTiers?.length) {
    blockers.push('No calibrated PBR texture tier is attached yet.')
  }

  return [...new Set(blockers)]
}

function MaterialCard({ material }: { material: ScorpionMaterialDefinition }) {
  const blockers = materialReadiness(material)
  const physical = material.physical

  return (
    <article className="material-card">
      <div className="material-card__head">
        <div
          className="material-swatch"
          style={{ background: material.previewColor }}
          aria-label={`Preview color ${material.previewColor}`}
        />
        <div className="material-title">
          <span>{material.id}</span>
          <h2>{material.label}</h2>
          <p>{material.kind}</p>
        </div>
        <div className="material-badges">
          <span className={`badge badge--${material.lifecycle}`}>{label(material.lifecycle)}</span>
          <span className={`badge badge--${material.availability}`}>{label(material.availability)}</span>
        </div>
      </div>

      <div className="material-spec-grid">
        <div><span>Source</span><strong>{label(material.provenance.source)}</strong></div>
        <div><span>Texture tiers</span><strong>{material.textureTiers?.map((tier) => `${tier.maxEdge / 1024}K`).join(' · ') || 'None'}</strong></div>
        <div><span>Type</span><strong>{physical?.materialType || 'Not recorded'}</strong></div>
        <div><span>Hide</span><strong>{physical?.hide || 'Not recorded'}</strong></div>
        <div><span>Grain</span><strong>{physical?.grain || 'Not recorded'}</strong></div>
        <div><span>Finish</span><strong>{physical?.finish || 'Not recorded'}</strong></div>
        <div><span>Thickness</span><strong>{physical?.thicknessMm ? `${physical.thicknessMm.toFixed(1)} mm` : 'Not recorded'}</strong></div>
        <div><span>Supplier</span><strong>{physical?.supplier || 'Not recorded'}</strong></div>
      </div>

      <div className="capture-flags" aria-label="Capture provenance">
        <span className={material.provenance.crossPolarized ? 'is-ready' : ''}>Cross-polarized</span>
        <span className={material.provenance.directionalLighting ? 'is-ready' : ''}>Directional set</span>
        <span className={material.provenance.scaleReference ? 'is-ready' : ''}>Scale reference</span>
        <span className={material.provenance.colorTarget ? 'is-ready' : ''}>Color target</span>
      </div>

      <div className={`readiness ${blockers.length ? 'has-blockers' : 'is-ready'}`}>
        <strong>{blockers.length ? `${blockers.length} readiness blocker${blockers.length === 1 ? '' : 's'}` : 'Production ready'}</strong>
        {blockers.length ? (
          <ul>
            {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
          </ul>
        ) : (
          <p>This material has passed the registry requirements for production use.</p>
        )}
      </div>

      {material.provenance.notes ? <p className="material-note">{material.provenance.notes}</p> : null}
    </article>
  )
}

function MaterialLab() {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const totals = useMemo(() => {
    const production = scorpionMaterialDefinitions.filter((material) => material.lifecycle === 'production-approved').length
    const captured = scorpionMaterialDefinitions.filter((material) => material.lifecycle === 'captured-master').length
    const references = scorpionMaterialDefinitions.filter((material) => material.lifecycle === 'reference-only').length
    const confirmed = scorpionMaterialDefinitions.filter((material) => material.availability === 'confirmed').length
    return { production, captured, references, confirmed, total: scorpionMaterialDefinitions.length }
  }, [])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return scorpionMaterialDefinitions.filter((material) => {
      if (filter !== 'all' && material.lifecycle !== filter && material.availability !== filter) return false
      if (!normalized) return true

      const haystack = [
        material.id,
        material.label,
        material.kind,
        material.lifecycle,
        material.availability,
        material.physical?.materialType,
        material.physical?.hide,
        material.physical?.grain,
        material.physical?.finish,
        material.physical?.supplier,
      ].filter(Boolean).join(' ').toLowerCase()

      return haystack.includes(normalized)
    })
  }, [filter, query])

  return (
    <main className="material-lab-shell">
      <header className="lab-header">
        <div>
          <p className="eyebrow">SCORPION WESTERN WEAR · INTERNAL MATERIAL SYSTEM</p>
          <h1>Material Lab</h1>
          <p>
            Track photographed references, field-captured masters, and production-approved leather,
            hardware, and lens materials without coupling material data to individual products.
          </p>
        </div>
        <div className="lab-links">
          <a href="/capture.html" className="studio-link">Start capture session</a>
          <a href="/process.html" className="studio-link">Process captures</a>
          <a href="/material-qa.html" className="studio-link">Material QA</a>
          <a href="/" className="studio-link">Open customer studio</a>
        </div>
      </header>

      <section className="lab-stats" aria-label="Material library status">
        <div><span>Total materials</span><strong>{totals.total}</strong></div>
        <div><span>Reference only</span><strong>{totals.references}</strong></div>
        <div><span>Captured masters</span><strong>{totals.captured}</strong></div>
        <div><span>Production approved</span><strong>{totals.production}</strong></div>
        <div><span>Confirmed availability</span><strong>{totals.confirmed}</strong></div>
      </section>

      <section className="lab-toolbar">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search material ID, color, grain, finish…"
          aria-label="Search materials"
        />
        <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} aria-label="Filter materials">
          <option value="all">All materials</option>
          <option value="reference-only">Reference only</option>
          <option value="captured-master">Captured master</option>
          <option value="production-approved">Production approved</option>
          <option value="confirmed">Confirmed availability</option>
          <option value="quote">Quote availability</option>
          <option value="unverified">Unverified availability</option>
        </select>
      </section>

      <div className="lab-guidance">
        <strong>Next physical step</strong>
        <p>
          Capture the first Scorpion swatches using <code>docs/MATERIAL-CAPTURE.md</code> and the reusable
          <code> capture/material-session-template.json</code>. Reference-only colors remain intentionally non-authoritative.
        </p>
      </div>

      <section className="material-grid" aria-label="Material registry">
        {filtered.map((material) => <MaterialCard key={material.id} material={material} />)}
      </section>

      {!filtered.length ? <p className="empty-state">No materials match this filter.</p> : null}
    </main>
  )
}

const root = document.getElementById('material-lab-root')
if (root) createRoot(root).render(<MaterialLab />)

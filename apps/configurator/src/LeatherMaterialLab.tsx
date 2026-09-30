import type { LeatherCompositionResult } from '@sls/material-library'
import {
  scorpionLeatherDyes,
  scorpionLeatherFinishes,
  scorpionLeatherStructures,
  type ScorpionLeatherLabSelection,
} from './scorpion-leather-system'

export function LeatherMaterialLab({
  selection,
  composition,
  defaultSelection,
  defaultStructureId,
  onChange,
  onClose,
}: {
  selection: ScorpionLeatherLabSelection
  composition: LeatherCompositionResult
  defaultSelection?: ScorpionLeatherLabSelection
  defaultStructureId?: string
  onChange: (next: ScorpionLeatherLabSelection) => void
  onClose: () => void
}) {
  const tintable = composition.structure.compositionPolicy === 'tintable'

  const chooseStructure = (structureId: string) => {
    const structure = scorpionLeatherStructures.find((entry) => entry.id === structureId)
    if (!structure) return
    onChange({
      structureId,
      dyeId: structure.compositionPolicy === 'tintable' ? selection.dyeId : 'captured',
      finishId: structure.compositionPolicy === 'tintable' ? selection.finishId : 'captured',
    })
  }

  return (
    <section className="material-lab" aria-label="3D material lab" data-testid="material-lab">
      <div className="material-lab__header">
        <div>
          <span>MATERIAL LAB</span>
          <strong>Structure × Dye × Finish</strong>
        </div>
        <button type="button" className="material-lab__close" onClick={onClose} aria-label="Close material lab">×</button>
      </div>

      <p className="material-lab__notice">
        Visual sandbox only. It does not change the order request. Production color requires a calibrated physical material.
      </p>

      <div className="material-lab__group">
        <div className="material-lab__label"><span>01</span><strong>Surface structure</strong></div>
        <div className="material-lab__surface-list">
          {scorpionLeatherStructures.map((structure) => (
            <button
              type="button"
              key={structure.id}
              className={selection.structureId === structure.id ? 'material-surface is-selected' : 'material-surface'}
              aria-pressed={selection.structureId === structure.id}
              onClick={() => chooseStructure(structure.id)}
            >
              <span>
                <strong>{structure.label}</strong>
                <small>{structure.availability === 'captured' ? 'REFERENCE' : 'DEV'}</small>
              </span>
              <em>{structure.compositionPolicy === 'tintable' ? 'Tintable' : 'Color locked'}</em>
            </button>
          ))}
        </div>
      </div>

      <div className="material-lab__group">
        <div className="material-lab__label"><span>02</span><strong>Dye</strong></div>
        <div className="material-dye-grid">
          {scorpionLeatherDyes.map((dye) => {
            const disabled = dye.mode === 'tint' && !tintable
            return (
              <button
                type="button"
                key={dye.id}
                className={selection.dyeId === dye.id ? 'material-dye is-selected' : 'material-dye'}
                aria-pressed={selection.dyeId === dye.id}
                disabled={disabled}
                title={disabled ? 'Select a tintable neutral structure first.' : dye.label}
                onClick={() => onChange({ ...selection, dyeId: dye.id })}
              >
                <span className="material-dye__swatch" style={{ background: dye.color }} aria-hidden="true" />
                <small>{dye.label}</small>
              </button>
            )
          })}
        </div>
      </div>

      <div className="material-lab__group">
        <div className="material-lab__label"><span>03</span><strong>Finish</strong></div>
        <div className="material-finish-row">
          {scorpionLeatherFinishes.map((finish) => {
            const disabled = finish.mode === 'finish' && !tintable
            return (
              <button
                type="button"
                key={finish.id}
                className={selection.finishId === finish.id ? 'is-selected' : ''}
                aria-pressed={selection.finishId === finish.id}
                disabled={disabled}
                onClick={() => onChange({ ...selection, finishId: finish.id })}
              >
                {finish.label}
              </button>
            )
          })}
        </div>
      </div>

      <div
        className={composition.developmentOnly ? 'material-recipe-status is-development' : 'material-recipe-status'}
        data-testid="material-recipe-status"
      >
        <span>{composition.developmentOnly ? 'DEVELOPMENT MATERIAL RECIPE' : 'REFERENCE MATERIAL'}</span>
        <strong>{composition.variant.label}</strong>
        {composition.warnings[0] ? <small>{composition.warnings[0]}</small> : null}
      </div>

      <button
        type="button"
        className="material-lab__reset"
        onClick={() => onChange(defaultSelection ?? { structureId: defaultStructureId ?? 'neutral-fine-grain', dyeId: 'captured', finishId: 'captured' })}
      >
        Reset to selected product reference
      </button>
    </section>
  )
}

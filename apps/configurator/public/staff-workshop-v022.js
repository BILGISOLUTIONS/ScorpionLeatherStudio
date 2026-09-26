const decisionValue = (value) => {
  if (value && typeof value === 'object') return String(value.resolved || value.requested || '')
  return value == null ? '' : String(value)
}

const diffFields = [
  ['Leather finish', (packet) => packet && packet.construction && packet.construction.leatherFinish],
  ['Leather color', (packet) => packet && packet.construction && packet.construction.leatherColor],
  ['Stitching', (packet) => packet && packet.construction && packet.construction.stitching],
  ['Hardware', (packet) => packet && packet.construction && packet.construction.hardware],
  ['Edge / binding', (packet) => packet && packet.construction && packet.construction.edgeTreatment],
  ['Tooling', (packet) => packet && packet.personalization && packet.personalization.tooling],
  ['Text', (packet) => packet && packet.personalization && packet.personalization.text],
  ['Text execution', (packet) => packet && packet.personalization && packet.personalization.textStyle],
  ['Placement', (packet) => packet && packet.personalization && packet.personalization.placement],
  ['Tooling notes', (packet) => packet && packet.personalization && packet.personalization.toolingNotes],
  ['Artwork notes', (packet) => packet && packet.personalization && packet.personalization.artworkNotes],
  ['Additional notes', (packet) => packet && packet.personalization && packet.personalization.additionalNotes],
  ['Production notes', (packet) => packet && packet.productionNotes],
  ['Staff notes', (packet) => packet && packet.staffNotes],
]

export function diffWorkshopRevisions(previous, current) {
  if (!previous || !current) return []
  return diffFields.flatMap(([label, getter]) => {
    const before = decisionValue(getter(previous)).trim()
    const after = decisionValue(getter(current)).trim()
    return before === after ? [] : [{ label, before: before || '—', after: after || '—' }]
  })
}

export function createWorkshopV022({
  api,
  el,
  state,
  dateTime,
  loadOrders,
  workshopResolutions,
  renderWorkshop,
}) {
  const renderChecklist = (rootId, items = [], completed = []) => {
    const root = el(rootId)
    root.replaceChildren()
    const completedSet = new Set(completed || [])
    for (const item of items.filter((entry) => entry.required)) {
      const label = document.createElement('label')
      label.className = 'qc-check'
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.dataset.checkId = item.id
      input.checked = completedSet.has(item.id)
      const span = document.createElement('span')
      span.textContent = item.label
      label.append(input, span)
      root.append(label)
    }
  }

  const checkedIds = (rootId) =>
    [...el(rootId).querySelectorAll('input[data-check-id]:checked')].map((input) => input.dataset.checkId)

  const renderAudit = (items = []) => {
    const root = el('qcAudit')
    root.replaceChildren()
    for (const entry of [...items].slice(-8).reverse()) {
      const row = document.createElement('div')
      const strong = document.createElement('strong')
      strong.textContent = entry.action ? String(entry.action).replaceAll('-', ' ') : 'activity'
      const small = document.createElement('small')
      small.textContent = dateTime(entry.at) + ' · ' + (entry.actor || 'staff') + (entry.revisionId ? ' · ' + entry.revisionId : '')
      row.append(strong, small)
      if (entry.detail) {
        const p = document.createElement('p')
        p.textContent = entry.detail
        row.append(p)
      }
      root.append(row)
    }
  }

  const latestRevisionComparison = (ops) => {
    const history = ops && Array.isArray(ops.revisionHistory) ? ops.revisionHistory : []
    const latest = history.at(-1)
    const current = state.workshopPacket
    if (!latest || !latest.packet || !current) return null
    return {
      archive: latest,
      current,
      changes: diffWorkshopRevisions(latest.packet, current),
    }
  }

  const renderRevisionDiff = (comparison) => {
    const root = el('revisionDiffSummary')
    root.replaceChildren()
    if (!comparison) {
      root.hidden = true
      el('printRevisionDiff').disabled = true
      return
    }

    const heading = document.createElement('div')
    const strong = document.createElement('strong')
    strong.textContent = comparison.archive.revisionId + ' → ' + comparison.current.revisionId
    const code = document.createElement('code')
    code.textContent = comparison.changes.length + ' manufacturing change' + (comparison.changes.length === 1 ? '' : 's')
    heading.append(strong, code)
    root.append(heading)

    const list = document.createElement('div')
    list.className = 'revision-diff-list'
    if (!comparison.changes.length) {
      const row = document.createElement('div')
      row.className = 'revision-diff-row'
      const label = document.createElement('span')
      label.textContent = 'No manufacturing-field changes detected'
      row.append(label)
      list.append(row)
    } else {
      for (const change of comparison.changes) {
        const row = document.createElement('div')
        row.className = 'revision-diff-row'
        const label = document.createElement('span')
        label.textContent = change.label
        const before = document.createElement('span')
        before.className = 'revision-diff-old'
        before.textContent = change.before
        const arrow = document.createElement('span')
        arrow.className = 'revision-diff-arrow'
        arrow.textContent = '→'
        const after = document.createElement('span')
        after.className = 'revision-diff-new'
        after.textContent = change.after
        row.append(label, before, arrow, after)
        list.append(row)
      }
    }
    root.append(list)
    root.hidden = false
    el('printRevisionDiff').disabled = false
  }

  const renderRevisionHistory = (ops) => {
    const panel = el('revisionHistoryPanel')
    const list = el('revisionHistoryList')
    const stateText = el('revisionHistoryState')
    const history = ops && Array.isArray(ops.revisionHistory) ? ops.revisionHistory : []
    list.replaceChildren()

    panel.hidden = history.length === 0
    if (!history.length) {
      stateText.textContent = 'No prior released revisions.'
      renderRevisionDiff(null)
      return
    }

    stateText.textContent = history.length + ' archived released revision' + (history.length === 1 ? '' : 's') + '.'
    const current = state.workshopPacket

    for (const entry of [...history].reverse()) {
      const row = document.createElement('div')
      row.className = 'revision-history-item'
      const meta = document.createElement('div')
      const title = document.createElement('strong')
      title.textContent = entry.revisionId || 'Archived revision'
      const small = document.createElement('small')
      small.textContent = dateTime(entry.archivedAt) + ' · ' + (entry.archivedBy || 'staff')
      meta.append(title, small)

      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = 'Compare to active'
      button.disabled = !entry.packet || !current
      button.addEventListener('click', () => {
        if (!entry.packet || !current) return
        renderRevisionDiff({
          archive: entry,
          current,
          changes: diffWorkshopRevisions(entry.packet, current),
        })
      })

      row.append(meta, button)
      if (entry.reason) {
        const reason = document.createElement('p')
        reason.textContent = entry.reason
        row.append(reason)
      }
      list.append(row)
    }

    renderRevisionDiff(latestRevisionComparison(ops))
  }

  const printRevisionComparison = (comparison) => {
    if (!comparison) return
    const popup = window.open('', '_blank')
    if (!popup) {
      el('workshopState').textContent = 'Popup blocked. Allow popups to print the revision change sheet.'
      return
    }
    const esc = (value) => String(value ?? '')
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
    const rows = comparison.changes.length
      ? comparison.changes.map((change) =>
          '<tr><th>' + esc(change.label) + '</th><td>' + esc(change.before) + '</td><td>' + esc(change.after) + '</td></tr>'
        ).join('')
      : '<tr><td colspan="3">No manufacturing-field changes detected.</td></tr>'

    popup.document.write('<!doctype html><html><head><title>Revision change sheet</title><style>' +
      'body{font-family:Arial,sans-serif;margin:24px;color:#111}h1{margin:0 0 4px;font-size:22px}.meta{margin:8px 0 16px;font-size:12px}' +
      'table{width:100%;border-collapse:collapse}th,td{border:1px solid #aaa;padding:7px;text-align:left;font-size:11px;vertical-align:top}' +
      'thead th{background:#eee}.scan{margin-top:16px;padding:9px;border:2px solid #111;font:11px/1.4 monospace;overflow-wrap:anywhere}' +
      '.reason{margin:12px 0;padding:8px;border-left:3px solid #777;background:#f4f4f4;font-size:11px}@media print{button{display:none}}</style></head><body>' +
      '<h1>Scorpion Leather Studio — Revision Change Sheet</h1>' +
      '<div class="meta"><strong>' + esc(comparison.current.workOrderId) + '</strong><br>' +
      esc(comparison.archive.revisionId) + ' → ' + esc(comparison.current.revisionId) + '</div>' +
      '<div class="reason"><strong>Reason:</strong> ' + esc(comparison.archive.reason || 'Not recorded') + '<br>' +
      '<strong>Archived by:</strong> ' + esc(comparison.archive.archivedBy || 'staff') + ' · ' + esc(dateTime(comparison.archive.archivedAt)) + '</div>' +
      '<table><thead><tr><th>Field</th><th>Previous</th><th>Active</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="scan">Machine reference: ' + esc(comparison.current.scanPayload) + '</div>' +
      '<button onclick="window.print()">Print change sheet</button></body></html>')
    popup.document.close()
  }

  el('printRevisionDiff').addEventListener('click', () => {
    printRevisionComparison(latestRevisionComparison(state.workshopOps))
  })

  const render = (order, ops) => {
    state.workshopOps = ops
    const released = Boolean(order && order.workshop_released_at)
    const packet = state.workshopPacket
    const ready = Boolean(ops && ops.schemaReady && released && packet)
    const completed = Boolean(ops && ops.qcCompletedAt)

    renderChecklist('manufacturingChecks', packet && packet.manufacturingChecklist || [], ops && ops.progress && ops.progress.manufacturingCompleted || [])
    renderChecklist('qualityChecks', packet && packet.qualityChecklist || [], ops && ops.progress && ops.progress.qualityCompleted || [])
    renderAudit(ops && ops.auditLog || [])
    renderRevisionHistory(ops)

    el('saveQcProgress').disabled = !ready || completed
    el('uploadQcPhoto').disabled = !ready || completed
    el('completeWorkshop').disabled = !ready || completed
    el('qcPhoto').disabled = !ready || completed

    const photoLink = el('qcPhotoSource')
    if (ops && ops.finalPhotoSignedUrl) {
      photoLink.href = ops.finalPhotoSignedUrl
      photoLink.hidden = false
    } else {
      photoLink.removeAttribute('href')
      photoLink.hidden = true
    }

    if (!released) {
      el('qcState').textContent = 'Release a workshop packet before recording production progress.'
    } else if (!ops || !ops.schemaReady) {
      el('qcState').textContent = 'V0.21 workshop migration required before progress, revision, or final-QC tracking can be used.'
    } else if (completed) {
      el('qcState').textContent = 'Final QC completed ' + dateTime(ops.qcCompletedAt) + ' by ' + (ops.qcCompletedBy || 'staff') + '.'
    } else {
      const manufacturingTotal = packet.manufacturingChecklist.filter((item) => item.required).length
      const qualityTotal = packet.qualityChecklist.filter((item) => item.required).length
      const manufacturingDone = ops.progress && ops.progress.manufacturingCompleted ? ops.progress.manufacturingCompleted.length : 0
      const qualityDone = ops.progress && ops.progress.qualityCompleted ? ops.progress.qualityCompleted.length : 0
      el('qcState').textContent =
        'Revision ' + (ops.revisionId || packet.revisionId) + ' · manufacturing ' + manufacturingDone + '/' + manufacturingTotal +
        ' · final QC ' + qualityDone + '/' + qualityTotal + (ops.finalPhoto ? ' · final photo stored' : ' · final photo required')
    }
  }

  const load = async (order) => {
    if (!order || !order.request_id || !order.workshop_released_at) {
      render(order, null)
      return
    }
    try {
      const payload = await api('/api/staff/workshop?request_id=' + encodeURIComponent(order.request_id))
      render(order, payload)
    } catch (error) {
      render(order, { schemaReady:false, auditLog:[], progress:{manufacturingCompleted:[],qualityCompleted:[]} })
      el('qcState').textContent = error.message || 'Workshop operations could not be loaded.'
    }
  }

  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result || '')))
    reader.addEventListener('error', () => reject(reader.error || new Error('Could not read final photo.')))
    reader.readAsDataURL(file)
  })

  el('createRevision').addEventListener('click', async () => {
    if (!state.selected || !state.workshopPacket) return
    const actor = el('revisionBy').value.trim()
    const reason = el('revisionReason').value.trim()
    if (!actor || !reason) {
      el('workshopState').textContent = 'Enter both a revision reason and the staff member creating it.'
      return
    }
    if (!window.confirm('Create a new controlled manufacturing revision?\n\nThe current released packet will remain archived and all production/QC progress will reset for the new revision.')) return

    el('createRevision').disabled = true
    el('workshopState').textContent = 'Creating controlled revision…'
    try {
      const payload = await api('/api/staff/workshop', {
        method:'PATCH',
        body:JSON.stringify({
          requestId:state.selected.request_id,
          action:'create-revision',
          actor,
          reason,
          workshopResolutions:workshopResolutions(),
        }),
      })
      state.selected = {
        ...state.selected,
        workshop_resolutions:workshopResolutions(),
        workshop_release_packet:payload.workshopPacket,
        workshop_revision_id:payload.revisionId,
        workshop_released_at:payload.releasedAt,
        workshop_released_by:payload.releasedBy,
      }
      state.workshopPacket = payload.workshopPacket
      el('revisionReason').value = ''
      renderWorkshop(state.selected)
      render(state.selected, payload)
      el('workshopState').textContent = 'Controlled revision created: ' + payload.previousRevisionId + ' → ' + payload.revisionId + '.'
      await loadOrders()
    } catch (error) {
      el('workshopState').textContent = error.message || 'Controlled revision could not be created.'
      el('createRevision').disabled = false
    }
  })

  el('saveQcProgress').addEventListener('click', async () => {
    if (!state.selected) return
    const actor = el('qcActor').value.trim()
    if (!actor) {
      el('qcState').textContent = 'Enter the staff member recording workshop progress.'
      return
    }
    el('saveQcProgress').disabled = true
    el('qcState').textContent = 'Saving workshop progress…'
    try {
      const payload = await api('/api/staff/workshop', {
        method:'PATCH',
        body:JSON.stringify({
          requestId:state.selected.request_id,
          action:'save-progress',
          actor,
          progress:{
            manufacturingCompleted:checkedIds('manufacturingChecks'),
            qualityCompleted:checkedIds('qualityChecks'),
          },
        }),
      })
      render(state.selected, payload)
    } catch (error) {
      el('qcState').textContent = error.message || 'Workshop progress could not be saved.'
      el('saveQcProgress').disabled = false
    }
  })

  el('uploadQcPhoto').addEventListener('click', async () => {
    if (!state.selected) return
    const actor = el('qcActor').value.trim()
    const file = el('qcPhoto').files && el('qcPhoto').files[0]
    if (!actor) {
      el('qcState').textContent = 'Enter the staff member storing the final QC photo.'
      return
    }
    if (!file) {
      el('qcState').textContent = 'Choose a final QC photo first.'
      return
    }
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size <= 0 || file.size > 2 * 1024 * 1024) {
      el('qcState').textContent = 'Final QC photo must be PNG/JPEG/WebP and no larger than 2 MB.'
      return
    }

    el('uploadQcPhoto').disabled = true
    el('qcState').textContent = 'Storing final QC photo privately…'
    try {
      const dataUrl = await fileToDataUrl(file)
      const payload = await api('/api/staff/workshop', {
        method:'PATCH',
        body:JSON.stringify({
          requestId:state.selected.request_id,
          action:'upload-final-photo',
          actor,
          photo:{ name:file.name, type:file.type, size:file.size, dataUrl },
        }),
      })
      el('qcPhoto').value = ''
      render(state.selected, payload)
    } catch (error) {
      el('qcState').textContent = error.message || 'Final QC photo could not be stored.'
      el('uploadQcPhoto').disabled = false
    }
  })

  el('completeWorkshop').addEventListener('click', async () => {
    if (!state.selected) return
    const actor = el('qcActor').value.trim()
    if (!actor) {
      el('qcState').textContent = 'Enter the staff member signing final QC.'
      return
    }
    if (!window.confirm('Complete this order after final QC?\n\nAll required production/QC checks and a stored final photo must be present.')) return

    el('completeWorkshop').disabled = true
    el('qcState').textContent = 'Running final QC completion gate…'
    try {
      await api('/api/staff/workshop', {
        method:'PATCH',
        body:JSON.stringify({
          requestId:state.selected.request_id,
          action:'save-progress',
          actor,
          progress:{
            manufacturingCompleted:checkedIds('manufacturingChecks'),
            qualityCompleted:checkedIds('qualityChecks'),
          },
        }),
      })
      const payload = await api('/api/staff/workshop', {
        method:'PATCH',
        body:JSON.stringify({
          requestId:state.selected.request_id,
          action:'complete',
          actor,
        }),
      })
      state.selected.status = 'completed'
      el('editStatus').value = 'completed'
      render(state.selected, payload)
      await loadOrders()
    } catch (error) {
      const issues = error.payload && Array.isArray(error.payload.issues) ? error.payload.issues : []
      el('qcState').textContent = issues.length
        ? issues.map((issue) => issue.message || issue.code).join(' · ')
        : error.message || 'Final QC completion failed.'
      el('completeWorkshop').disabled = false
    }
  })

  return { load, render }
}

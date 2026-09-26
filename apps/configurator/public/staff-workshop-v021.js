export function createWorkshopV021({
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

  const render = (order, ops) => {
    state.workshopOps = ops
    const released = Boolean(order && order.workshop_released_at)
    const packet = state.workshopPacket
    const ready = Boolean(ops && ops.schemaReady && released && packet)
    const completed = Boolean(ops && ops.qcCompletedAt)

    renderChecklist('manufacturingChecks', packet && packet.manufacturingChecklist || [], ops && ops.progress && ops.progress.manufacturingCompleted || [])
    renderChecklist('qualityChecks', packet && packet.qualityChecklist || [], ops && ops.progress && ops.progress.qualityCompleted || [])
    renderAudit(ops && ops.auditLog || [])

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

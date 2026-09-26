(() => {
  'use strict';

  const TOKEN_KEY = 'scorpion-staff-token';
  const state = { token: sessionStorage.getItem(TOKEN_KEY) || '', orders: [], selected: null, workshopPacket: null, workshopOps: null };

  const el = (id) => document.getElementById(id);
  const login = el('login'), app = el('app'), tokenInput = el('token');
  const connection = el('connection'), loginError = el('loginError');
  const ordersBody = el('orders'), empty = el('empty'), detail = el('detail');

  const money = (minor) => minor === null || minor === undefined
    ? '—'
    : new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(Number(minor) / 100);

  const dateTime = (value) => value
    ? new Intl.DateTimeFormat('en-US', { dateStyle:'medium', timeStyle:'short' }).format(new Date(value))
    : '—';

  const api = async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', 'Bearer ' + state.token);
    if (options.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(path, { ...options, headers, cache:'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      lock('Staff token was rejected.');
      throw new Error('Unauthorized');
    }
    if (!response.ok) {
      const error = new Error(payload.message || payload.code || 'Request failed');
      error.payload = payload;
      throw error;
    }
    return payload;
  };

  const setConnected = (connected) => {
    connection.textContent = connected ? 'Connected to order store' : 'Not connected';
    connection.classList.toggle('is-live', connected);
    login.hidden = connected;
    app.hidden = !connected;
  };

  const lock = (message = '') => {
    state.token = '';
    state.orders = [];
    state.selected = null;
    sessionStorage.removeItem(TOKEN_KEY);
    setConnected(false);
    loginError.textContent = message;
    tokenInput.value = '';
    if (detail.open) detail.close();
  };

  const filteredOrders = () => {
    const query = el('search').value.trim().toLowerCase();
    const status = el('statusFilter').value;
    return state.orders.filter((order) => {
      if (status && order.status !== status) return false;
      if (!query) return true;
      return [
        order.request_id, order.build_id, order.customer_name, order.customer_email,
        order.customer_phone, order.customer_company, order.product_title,
        order.reference_title, order.sku, order.variant_title,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  };

  const renderStats = () => {
    const orders = state.orders;
    el('statTotal').textContent = String(orders.length);
    el('statReview').textContent = String(orders.filter((o) => ['received','reviewing'].includes(o.status)).length);
    el('statQuoted').textContent = String(orders.filter((o) => o.status === 'quoted').length);
    el('statProduction').textContent = String(orders.filter((o) => o.status === 'in_production').length);
    el('statCompleted').textContent = String(orders.filter((o) => o.status === 'completed').length);
  };

  const cell = (text, sub) => {
    const td = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = text || '—';
    td.append(strong);
    if (sub) {
      const small = document.createElement('small');
      small.textContent = sub;
      td.append(small);
    }
    return td;
  };

  const render = () => {
    const orders = filteredOrders();
    ordersBody.replaceChildren();
    empty.hidden = orders.length > 0;

    for (const order of orders) {
      const tr = document.createElement('tr');
      tr.tabIndex = 0;
      tr.dataset.requestId = order.request_id;
      tr.append(
        cell(order.request_id, order.build_id),
        cell(order.customer_name, order.customer_company || order.customer_email || order.customer_phone),
        cell(order.reference_title, order.sku + ' · ' + order.variant_title),
        cell(String(order.quantity)),
      );

      const statusTd = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'pill ' + order.status;
      pill.textContent = String(order.status || 'received').replaceAll('_',' ');
      statusTd.append(pill);
      tr.append(statusTd);

      tr.append(
        cell(String(order.delivery_status || '—').replaceAll('_',' ')),
        cell(
          order.quote_total_minor !== null && order.quote_total_minor !== undefined
            ? money(order.quote_total_minor)
            : order.base_price_status === 'catalog' ? money(order.base_subtotal_minor) + ' base' : 'Quote required',
          order.shopify_draft_order_name ? 'Shopify ' + order.shopify_draft_order_name : ''
        ),
        cell(dateTime(order.created_at)),
      );

      tr.addEventListener('click', () => openOrder(order.request_id));
      tr.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openOrder(order.request_id);
        }
      });
      ordersBody.append(tr);
    }
    renderStats();
  };

  const meta = (label, value) => {
    const box = document.createElement('div');
    box.className = 'meta';
    const span = document.createElement('span');
    span.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = value || '—';
    box.append(span, strong);
    return box;
  };

  const workshopFieldIds = {
    leatherFinish:'wsLeatherFinish', leatherColor:'wsLeatherColor', stitching:'wsStitching', hardware:'wsHardware',
    edgeTreatment:'wsEdge', tooling:'wsTooling', placement:'wsPlacement',
    textExecution:'wsText', artworkInstructions:'wsArtwork', productionNotes:'wsProductionNotes',
  };

  const workshopResolutions = () => Object.fromEntries(
    Object.entries(workshopFieldIds).map(([key,id]) => [key, el(id).value.trim()])
  );

  const setWorkshopFields = (order) => {
    const values = order.workshop_resolutions || {};
    for (const [key,id] of Object.entries(workshopFieldIds)) el(id).value = values[key] || '';
    el('wsReleasedBy').value = order.workshop_released_by || '';
  };

  const renderWorkshopBlockers = (items = []) => {
    const root = el('workshopBlockers');
    root.replaceChildren();
    for (const item of items) {
      const row = document.createElement('div');
      row.textContent = '• ' + (item.message || item.code || String(item));
      root.append(row);
    }
  };

  const renderWorkshop = (order) => {
    const schemaReady = order.workshop_schema_ready !== false;
    const packet = order.workshop_release_packet || order.workshop_preview || null;
    if (!schemaReady) {
      state.workshopPacket = null;
      document.querySelector('.workshop-card').classList.remove('is-released');
      el('workshopState').textContent = 'Workshop release is temporarily unavailable until the V0.20 database migration is applied.';
      renderWorkshopBlockers([{ message:'Database migration required. Existing order review/quoting remains available.' }]);
      el('saveWorkshop').disabled = true;
      el('releaseWorkshop').disabled = true;
      el('downloadWorkshop').disabled = true;
      el('printWorkshop').disabled = true;
      const artwork = el('artworkSource');
      artwork.removeAttribute('href');
      artwork.hidden = true;
      return;
    }
    state.workshopPacket = packet;
    const released = Boolean(order.workshop_released_at);
    const card = document.querySelector('.workshop-card');
    card.classList.toggle('is-released', released);
    const blockers = packet && packet.release ? packet.release.blockers || [] : [];
    renderWorkshopBlockers(blockers);

    if (released) {
      el('workshopState').textContent =
        'Released ' + dateTime(order.workshop_released_at) +
        ' by ' + (order.workshop_released_by || 'staff') +
        ' · ' + (order.workshop_revision_id || 'revision recorded') + '. Manufacturing resolutions are locked.';
    } else if (packet && blockers.length) {
      el('workshopState').textContent = blockers.length + ' release blocker' + (blockers.length === 1 ? '' : 's') + ' remain.';
    } else if (packet) {
      el('workshopState').textContent = 'Workshop gate is clear. A named staff member can release this paid build to production.';
    } else {
      el('workshopState').textContent = 'Workshop packet is unavailable until the stored request can be evaluated.';
    }

    el('saveWorkshop').disabled = released;
    el('releaseWorkshop').disabled = released || !packet || blockers.length > 0;
    el('downloadWorkshop').disabled = !packet;
    el('printWorkshop').disabled = !packet;
    el('revisionControls').hidden = !released;
    el('createRevision').disabled = !released;

    const artwork = el('artworkSource');
    if (order.artwork_signed_url) {
      artwork.href = order.artwork_signed_url;
      artwork.hidden = false;
    } else {
      artwork.removeAttribute('href');
      artwork.hidden = true;
    }
  };

  const renderChecklist = (rootId, items = [], completed = []) => {
    const root = el(rootId);
    root.replaceChildren();
    const completedSet = new Set(completed || []);
    for (const item of items.filter((entry) => entry.required)) {
      const label = document.createElement('label');
      label.className = 'qc-check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.checkId = item.id;
      input.checked = completedSet.has(item.id);
      const span = document.createElement('span');
      span.textContent = item.label;
      label.append(input, span);
      root.append(label);
    }
  };

  const checkedIds = (rootId) =>
    [...el(rootId).querySelectorAll('input[data-check-id]:checked')].map((input) => input.dataset.checkId);

  const renderAudit = (items = []) => {
    const root = el('qcAudit');
    root.replaceChildren();
    for (const entry of [...items].slice(-8).reverse()) {
      const row = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = entry.action ? String(entry.action).replaceAll('-', ' ') : 'activity';
      const small = document.createElement('small');
      small.textContent = dateTime(entry.at) + ' · ' + (entry.actor || 'staff') + (entry.revisionId ? ' · ' + entry.revisionId : '');
      row.append(strong, small);
      if (entry.detail) {
        const p = document.createElement('p');
        p.textContent = entry.detail;
        row.append(p);
      }
      root.append(row);
    }
  };

  const renderWorkshopOps = (order, ops) => {
    state.workshopOps = ops;
    const released = Boolean(order && order.workshop_released_at);
    const packet = state.workshopPacket;
    const ready = Boolean(ops && ops.schemaReady && released && packet);
    const completed = Boolean(ops && ops.qcCompletedAt);

    renderChecklist('manufacturingChecks', packet && packet.manufacturingChecklist || [], ops && ops.progress && ops.progress.manufacturingCompleted || []);
    renderChecklist('qualityChecks', packet && packet.qualityChecklist || [], ops && ops.progress && ops.progress.qualityCompleted || []);
    renderAudit(ops && ops.auditLog || []);

    el('saveQcProgress').disabled = !ready || completed;
    el('uploadQcPhoto').disabled = !ready || completed;
    el('completeWorkshop').disabled = !ready || completed;
    el('qcPhoto').disabled = !ready || completed;

    const photoLink = el('qcPhotoSource');
    if (ops && ops.finalPhotoSignedUrl) {
      photoLink.href = ops.finalPhotoSignedUrl;
      photoLink.hidden = false;
    } else {
      photoLink.removeAttribute('href');
      photoLink.hidden = true;
    }

    if (!released) {
      el('qcState').textContent = 'Release a workshop packet before recording production progress.';
    } else if (!ops || !ops.schemaReady) {
      el('qcState').textContent = 'V0.21 workshop migration required before progress, revision, or final-QC tracking can be used.';
    } else if (completed) {
      el('qcState').textContent = 'Final QC completed ' + dateTime(ops.qcCompletedAt) + ' by ' + (ops.qcCompletedBy || 'staff') + '.';
    } else {
      const manufacturingTotal = packet.manufacturingChecklist.filter((item) => item.required).length;
      const qualityTotal = packet.qualityChecklist.filter((item) => item.required).length;
      const manufacturingDone = ops.progress && ops.progress.manufacturingCompleted ? ops.progress.manufacturingCompleted.length : 0;
      const qualityDone = ops.progress && ops.progress.qualityCompleted ? ops.progress.qualityCompleted.length : 0;
      el('qcState').textContent =
        'Revision ' + (ops.revisionId || packet.revisionId) + ' · manufacturing ' + manufacturingDone + '/' + manufacturingTotal +
        ' · final QC ' + qualityDone + '/' + qualityTotal + (ops.finalPhoto ? ' · final photo stored' : ' · final photo required');
    }
  };

  const loadWorkshopOps = async (order) => {
    if (!order || !order.request_id || !order.workshop_released_at) {
      renderWorkshopOps(order, null);
      return;
    }
    try {
      const payload = await api('/api/staff/workshop?request_id=' + encodeURIComponent(order.request_id));
      renderWorkshopOps(order, payload);
    } catch (error) {
      renderWorkshopOps(order, { schemaReady:false, auditLog:[], progress:{manufacturingCompleted:[],qualityCompleted:[]} });
      el('qcState').textContent = error.message || 'Workshop operations could not be loaded.';
    }
  };

  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => reject(reader.error || new Error('Could not read final photo.')));
    reader.readAsDataURL(file);
  });

  const downloadWorkshopPacket = (packet) => {
    if (!packet) return;
    const blob = new Blob([JSON.stringify(packet, null, 2) + '\n'], { type:'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = packet.workOrderId + '-' + packet.revisionId + '.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  };

  const printWorkshopPacket = (packet) => {
    if (!packet) return;
    const popup = window.open('', '_blank');
    if (!popup) {
      el('workshopState').textContent = 'Popup blocked. Allow popups to print the workshop packet.';
      return;
    }
    const esc = (value) => String(value ?? '')
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    const decision = (label, value) =>
      '<tr><th>' + esc(label) + '</th><td>' + esc(value && value.resolved || '[UNRESOLVED]') + '</td></tr>';
    const checks = (items) => items.filter((item) => item.required)
      .map((item) => '<li>☐ ' + esc(item.label) + '</li>').join('');

    popup.document.write('<!doctype html><html><head><title>' + esc(packet.workOrderId) + '</title><style>' +
      'body{font-family:Arial,sans-serif;margin:26px;color:#171717}h1{margin:0 0 4px;font-size:24px}small{color:#666}' +
      '.bar{margin:14px 0;padding:10px;border:2px solid #111;font-weight:700}table{width:100%;border-collapse:collapse;margin:14px 0}' +
      'th,td{border:1px solid #bbb;padding:7px;text-align:left;font-size:12px}th{width:30%}section{break-inside:avoid;margin:18px 0}' +
      'ul{list-style:none;padding:0;margin:8px 0}li{padding:4px 0;font-size:12px}.ref{font-family:monospace;font-size:10px;overflow-wrap:anywhere}' +
      '@media print{button{display:none}}</style></head><body>' +
      '<h1>Scorpion Leather Studio — Workshop Build Packet</h1><small>' + esc(packet.workOrderId) + ' · ' + esc(packet.revisionId) + '</small>' +
      '<div class="bar">RELEASE: ' + esc(packet.release.state).toUpperCase().replaceAll('_',' ') + '</div>' +
      '<table><tr><th>Request</th><td>' + esc(packet.requestId) + '</td></tr><tr><th>Build</th><td>' + esc(packet.buildId) +
      '</td></tr><tr><th>Customer</th><td>' + esc(packet.customer.displayName) + '</td></tr><tr><th>Product</th><td>' +
      esc(packet.product.referenceTitle) + '</td></tr><tr><th>SKU / Variant</th><td>' + esc(packet.product.sku + ' · ' + packet.product.variantTitle) +
      '</td></tr><tr><th>Quantity</th><td>' + esc(packet.product.quantity) + '</td></tr></table>' +
      '<section><h2>Construction</h2><table>' +
      decision('Leather finish', packet.construction.leatherFinish) + decision('Leather color', packet.construction.leatherColor) +
      decision('Stitching', packet.construction.stitching) + decision('Hardware', packet.construction.hardware) +
      decision('Edge / binding', packet.construction.edgeTreatment) + decision('Tooling', packet.personalization.tooling) +
      decision('Text', {resolved:packet.personalization.text || 'None'}) + decision('Text execution', packet.personalization.textStyle) +
      decision('Placement', packet.personalization.placement) + '</table></section>' +
      '<section><h2>Manufacturing</h2><ul>' + checks(packet.manufacturingChecklist) + '</ul></section>' +
      '<section><h2>Final QC</h2><ul>' + checks(packet.qualityChecklist) + '</ul></section>' +
      '<p class="ref">Machine reference: ' + esc(packet.scanPayload) + '</p><button onclick="window.print()">Print packet</button>' +
      '</body></html>');
    popup.document.close();
  };

  const openOrder = async (requestId) => {
    el('saveState').textContent = 'Loading…';
    try {
      const payload = await api('/api/staff/orders?request_id=' + encodeURIComponent(requestId));
      const order = payload.orders && payload.orders[0];
      if (!order) throw new Error('Order not found');
      state.selected = order;

      el('detailTitle').textContent = order.request_id;
      el('detailSubtitle').textContent = order.reference_title + ' · ' + order.sku;
      el('detailMeta').replaceChildren(
        meta('Customer', order.customer_name),
        meta('Contact', order.customer_email || order.customer_phone),
        meta('Company', order.customer_company),
        meta('Quantity', String(order.quantity)),
        meta('Base subtotal', order.base_price_status === 'catalog' ? money(order.base_subtotal_minor) : 'Quote required'),
        meta('Artwork', order.artwork_name || 'None attached'),
        meta('Received', dateTime(order.created_at)),
        meta('Delivery', String(order.delivery_status || '—').replaceAll('_',' ')),
      );
      el('requestJson').textContent = JSON.stringify(order.request_payload, null, 2);
      el('editStatus').value = order.status || 'received';
      el('quoteTotal').value = order.quote_total_minor === null || order.quote_total_minor === undefined
        ? ''
        : (Number(order.quote_total_minor) / 100).toFixed(2);
      el('staffNotes').value = order.staff_notes || '';
      setWorkshopFields(order);
      renderWorkshop(order);
      await loadWorkshopOps(order);
      el('saveState').textContent = '';

      const createDraft = el('createDraft');
      const sendInvoice = el('sendInvoice');
      const reconcileShopify = el('reconcileShopify');
      const invoice = el('draftInvoice');
      const hasQuote = Number.isInteger(order.quote_total_minor) && order.quote_total_minor > 0;
      const eligibleStatus = ['quoted','approved'].includes(order.status);
      const existingDraft = Boolean(order.shopify_draft_order_id);
      const invoiceSent = Boolean(order.shopify_invoice_sent_at);

      createDraft.disabled = existingDraft || !hasQuote || !eligibleStatus || order.shopify_draft_order_state === 'creating';
      createDraft.textContent = existingDraft
        ? (order.shopify_draft_order_name || 'Shopify draft created')
        : order.shopify_draft_order_state === 'creating' ? 'Creating…' : 'Create Shopify draft';

      sendInvoice.disabled =
        !existingDraft ||
        order.status !== 'approved' ||
        !order.customer_email ||
        invoiceSent ||
        order.shopify_invoice_state === 'sending';
      sendInvoice.textContent = invoiceSent
        ? 'Invoice sent'
        : order.shopify_invoice_state === 'sending' ? 'Sending invoice…' : 'Send Shopify invoice';

      reconcileShopify.disabled = !existingDraft;
      reconcileShopify.textContent = order.shopify_financial_status === 'PAID'
        ? 'Payment confirmed'
        : 'Refresh payment status';

      if (existingDraft) {
        el('draftState').textContent = 'Linked to ' + (order.shopify_draft_order_name || 'a Shopify draft order') + '.';
      } else if (order.shopify_draft_order_state === 'failed') {
        el('draftState').textContent = 'The last Shopify draft attempt failed. Review the quote/configuration and retry.';
      } else {
        el('draftState').textContent = 'Save a quote and move the request to Quoted or Approved before creating a Shopify draft order.';
      }

      if (order.shopify_financial_status === 'PAID') {
        el('invoiceState').textContent =
          'Payment confirmed in Shopify' +
          (order.shopify_order_name ? ' · Order ' + order.shopify_order_name : '') +
          (order.shopify_reconciled_at ? ' · synced ' + dateTime(order.shopify_reconciled_at) : '') + '.';
      } else if (invoiceSent) {
        el('invoiceState').textContent = 'Shopify invoice sent ' + dateTime(order.shopify_invoice_sent_at) + '.';
      } else if (!existingDraft) {
        el('invoiceState').textContent = 'Create and review the Shopify draft before sending an invoice.';
      } else if (!order.customer_email) {
        el('invoiceState').textContent = 'A customer email address is required before Shopify can send the invoice.';
      } else if (order.status !== 'approved') {
        el('invoiceState').textContent = 'Move the request to Approved after reviewing the draft to enable invoice sending.';
      } else if (order.shopify_invoice_state === 'failed') {
        el('invoiceState').textContent = 'The last invoice attempt failed. Review the draft/customer email and retry.';
      } else {
        el('invoiceState').textContent = 'Approved and ready. Sending the invoice will email Shopify’s secure checkout link to the customer.';
      }

      if (order.shopify_draft_order_invoice_url) {
        invoice.href = order.shopify_draft_order_invoice_url;
        invoice.hidden = false;
      } else {
        invoice.removeAttribute('href');
        invoice.hidden = true;
      }

      detail.showModal();
    } catch (error) {
      el('saveState').textContent = error.message || 'Could not load request.';
    }
  };

  const loadOrders = async () => {
    el('refresh').disabled = true;
    try {
      const payload = await api('/api/staff/orders?limit=100');
      state.orders = Array.isArray(payload.orders) ? payload.orders : [];
      setConnected(true);
      loginError.textContent = '';
      render();
    } catch (error) {
      if (state.token) loginError.textContent = error.message || 'Could not load order queue.';
    } finally {
      el('refresh').disabled = false;
    }
  };

  el('connect').addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    if (!token) {
      loginError.textContent = 'Enter the staff token.';
      return;
    }
    state.token = token;
    sessionStorage.setItem(TOKEN_KEY, token);
    await loadOrders();
  });

  tokenInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') el('connect').click();
  });

  el('refresh').addEventListener('click', loadOrders);
  el('logout').addEventListener('click', () => lock());
  el('search').addEventListener('input', render);
  el('statusFilter').addEventListener('change', render);
  el('closeDetail').addEventListener('click', () => detail.close());

  el('saveOrder').addEventListener('click', async () => {
    if (!state.selected) return;
    if (el('editStatus').value === 'in_production') {
      el('saveState').textContent = 'Use Release to workshop so production gates are enforced.';
      return;
    }
    if (el('editStatus').value === 'completed') {
      el('saveState').textContent = 'Use Complete final QC so checklist, photo, and staff signoff are enforced.';
      return;
    }
    const dollars = el('quoteTotal').value.trim();
    const quoteTotalMinor = dollars === '' ? null : Math.round(Number(dollars) * 100);
    el('saveOrder').disabled = true;
    el('saveState').textContent = 'Saving…';

    try {
      const payload = await api('/api/staff/orders', {
        method:'PATCH',
        body:JSON.stringify({
          requestId: state.selected.request_id,
          status: el('editStatus').value,
          quoteTotalMinor,
          staffNotes: el('staffNotes').value,
        }),
      });
      el('saveState').textContent = 'Saved';
      if (payload.order) {
        state.selected = payload.order;
        setWorkshopFields(payload.order);
        renderWorkshop(payload.order);
      }
      await loadOrders();
    } catch (error) {
      el('saveState').textContent = error.message || 'Save failed';
    } finally {
      el('saveOrder').disabled = false;
    }
  });

  el('saveWorkshop').addEventListener('click', async () => {
    if (!state.selected) return;
    const dollars = el('quoteTotal').value.trim();
    const quoteTotalMinor = dollars === '' ? null : Math.round(Number(dollars) * 100);
    el('saveWorkshop').disabled = true;
    el('workshopState').textContent = 'Saving production resolutions…';

    try {
      const payload = await api('/api/staff/orders', {
        method:'PATCH',
        body:JSON.stringify({
          requestId: state.selected.request_id,
          status: state.selected.status,
          quoteTotalMinor,
          staffNotes: el('staffNotes').value,
          workshopResolutions: workshopResolutions(),
        }),
      });
      state.selected = payload.order;
      setWorkshopFields(payload.order);
      renderWorkshop(payload.order);
      await loadWorkshopOps(payload.order);
      await loadOrders();
    } catch (error) {
      el('workshopState').textContent = error.message || 'Workshop resolutions could not be saved.';
      el('saveWorkshop').disabled = false;
    }
  });

  el('releaseWorkshop').addEventListener('click', async () => {
    if (!state.selected) return;
    const releasedBy = el('wsReleasedBy').value.trim();
    if (!releasedBy) {
      el('workshopState').textContent = 'Enter the staff member releasing this build.';
      return;
    }
    if (!window.confirm('Release this exact revision to the workshop?\n\nManufacturing resolutions will be locked and the order will move to In production.')) return;

    const dollars = el('quoteTotal').value.trim();
    const quoteTotalMinor = dollars === '' ? null : Math.round(Number(dollars) * 100);
    el('releaseWorkshop').disabled = true;
    el('workshopState').textContent = 'Running production release gates…';

    try {
      const payload = await api('/api/staff/orders', {
        method:'PATCH',
        body:JSON.stringify({
          requestId: state.selected.request_id,
          status: 'in_production',
          quoteTotalMinor,
          staffNotes: el('staffNotes').value,
          workshopResolutions: workshopResolutions(),
          releaseToProduction: true,
          releasedBy,
        }),
      });
      state.selected = payload.order;
      el('editStatus').value = 'in_production';
      setWorkshopFields(payload.order);
      renderWorkshop(payload.order);
      await loadOrders();
    } catch (error) {
      const blockers = error.payload && Array.isArray(error.payload.blockers) ? error.payload.blockers : [];
      renderWorkshopBlockers(blockers);
      el('workshopState').textContent = blockers.length
        ? blockers.length + ' production release blocker' + (blockers.length === 1 ? '' : 's') + ' must be resolved.'
        : error.message || 'Workshop release failed.';
      el('releaseWorkshop').disabled = false;
    }
  });

  el('createRevision').addEventListener('click', async () => {
    if (!state.selected || !state.workshopPacket) return;
    const actor = el('revisionBy').value.trim();
    const reason = el('revisionReason').value.trim();
    if (!actor || !reason) {
      el('workshopState').textContent = 'Enter both a revision reason and the staff member creating it.';
      return;
    }
    if (!window.confirm('Create a new controlled manufacturing revision?\n\nThe current released packet will remain archived and all production/QC progress will reset for the new revision.')) return;

    el('createRevision').disabled = true;
    el('workshopState').textContent = 'Creating controlled revision…';
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
      });
      state.selected = {
        ...state.selected,
        workshop_resolutions:workshopResolutions(),
        workshop_release_packet:payload.workshopPacket,
        workshop_revision_id:payload.revisionId,
        workshop_released_at:payload.releasedAt,
        workshop_released_by:payload.releasedBy,
      };
      state.workshopPacket = payload.workshopPacket;
      el('revisionReason').value = '';
      renderWorkshop(state.selected);
      renderWorkshopOps(state.selected, payload);
      el('workshopState').textContent = 'Controlled revision created: ' + payload.previousRevisionId + ' → ' + payload.revisionId + '.';
      await loadOrders();
    } catch (error) {
      el('workshopState').textContent = error.message || 'Controlled revision could not be created.';
      el('createRevision').disabled = false;
    }
  });

  el('saveQcProgress').addEventListener('click', async () => {
    if (!state.selected) return;
    const actor = el('qcActor').value.trim();
    if (!actor) {
      el('qcState').textContent = 'Enter the staff member recording workshop progress.';
      return;
    }
    el('saveQcProgress').disabled = true;
    el('qcState').textContent = 'Saving workshop progress…';
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
      });
      renderWorkshopOps(state.selected, payload);
    } catch (error) {
      el('qcState').textContent = error.message || 'Workshop progress could not be saved.';
      el('saveQcProgress').disabled = false;
    }
  });

  el('uploadQcPhoto').addEventListener('click', async () => {
    if (!state.selected) return;
    const actor = el('qcActor').value.trim();
    const file = el('qcPhoto').files && el('qcPhoto').files[0];
    if (!actor) {
      el('qcState').textContent = 'Enter the staff member storing the final QC photo.';
      return;
    }
    if (!file) {
      el('qcState').textContent = 'Choose a final QC photo first.';
      return;
    }
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size <= 0 || file.size > 2 * 1024 * 1024) {
      el('qcState').textContent = 'Final QC photo must be PNG/JPEG/WebP and no larger than 2 MB.';
      return;
    }

    el('uploadQcPhoto').disabled = true;
    el('qcState').textContent = 'Storing final QC photo privately…';
    try {
      const dataUrl = await fileToDataUrl(file);
      const payload = await api('/api/staff/workshop', {
        method:'PATCH',
        body:JSON.stringify({
          requestId:state.selected.request_id,
          action:'upload-final-photo',
          actor,
          photo:{ name:file.name, type:file.type, size:file.size, dataUrl },
        }),
      });
      el('qcPhoto').value = '';
      renderWorkshopOps(state.selected, payload);
    } catch (error) {
      el('qcState').textContent = error.message || 'Final QC photo could not be stored.';
      el('uploadQcPhoto').disabled = false;
    }
  });

  el('completeWorkshop').addEventListener('click', async () => {
    if (!state.selected) return;
    const actor = el('qcActor').value.trim();
    if (!actor) {
      el('qcState').textContent = 'Enter the staff member signing final QC.';
      return;
    }
    if (!window.confirm('Complete this order after final QC?\n\nAll required production/QC checks and a stored final photo must be present.')) return;

    el('completeWorkshop').disabled = true;
    el('qcState').textContent = 'Running final QC completion gate…';
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
      });
      const payload = await api('/api/staff/workshop', {
        method:'PATCH',
        body:JSON.stringify({
          requestId:state.selected.request_id,
          action:'complete',
          actor,
        }),
      });
      state.selected.status = 'completed';
      el('editStatus').value = 'completed';
      renderWorkshopOps(state.selected, payload);
      await loadOrders();
    } catch (error) {
      const issues = error.payload && Array.isArray(error.payload.issues) ? error.payload.issues : [];
      el('qcState').textContent = issues.length
        ? issues.map((issue) => issue.message || issue.code).join(' · ')
        : error.message || 'Final QC completion failed.';
      el('completeWorkshop').disabled = false;
    }
  });

  el('downloadWorkshop').addEventListener('click', () => downloadWorkshopPacket(state.workshopPacket));
  el('printWorkshop').addEventListener('click', () => printWorkshopPacket(state.workshopPacket));

  el('createDraft').addEventListener('click', async () => {
    if (!state.selected) return;

    const requestId = state.selected.request_id;
    const dollars = el('quoteTotal').value.trim();
    const quoteTotalMinor = dollars === '' ? null : Math.round(Number(dollars) * 100);

    el('createDraft').disabled = true;
    el('draftState').textContent = 'Saving the current quote and creating the Shopify draft…';

    try {
      await api('/api/staff/orders', {
        method:'PATCH',
        body:JSON.stringify({
          requestId,
          status: el('editStatus').value,
          quoteTotalMinor,
          staffNotes: el('staffNotes').value,
        }),
      });

      const payload = await api('/api/staff/shopify-draft', {
        method:'POST',
        body:JSON.stringify({ requestId }),
      });

      const draft = payload.draftOrder || {};
      el('draftState').textContent = (payload.existing ? 'Existing' : 'Created') + ' Shopify draft ' + (draft.name || draft.id || '') + '.';
      el('createDraft').textContent = draft.name || 'Shopify draft created';
      if (draft.invoiceUrl) {
        el('draftInvoice').href = draft.invoiceUrl;
        el('draftInvoice').hidden = false;
      }

      await loadOrders();
      const refreshed = state.orders.find((o) => o.request_id === requestId);
      if (refreshed) state.selected = { ...state.selected, ...refreshed };
    } catch (error) {
      el('draftState').textContent = error.message || 'Shopify draft creation failed.';
      el('createDraft').disabled = false;
    }
  });

  el('sendInvoice').addEventListener('click', async () => {
    if (!state.selected) return;

    const requestId = state.selected.request_id;
    const customerEmail = state.selected.customer_email || '';
    const confirmed = window.confirm(
      'Send the Shopify payment invoice to ' + customerEmail + '?\n\n' +
      'Only continue if the draft order and approved quote have been reviewed.'
    );
    if (!confirmed) return;

    el('sendInvoice').disabled = true;
    el('invoiceState').textContent = 'Sending Shopify invoice…';

    try {
      const payload = await api('/api/staff/shopify-invoice', {
        method:'POST',
        body:JSON.stringify({ requestId }),
      });

      el('invoiceState').textContent = payload.existing
        ? 'Invoice was already sent ' + dateTime(payload.sentAt) + '.'
        : 'Shopify invoice sent ' + dateTime(payload.sentAt) + '.';
      el('sendInvoice').textContent = 'Invoice sent';

      await loadOrders();
      const refreshed = state.orders.find((o) => o.request_id === requestId);
      if (refreshed) state.selected = { ...state.selected, ...refreshed };
    } catch (error) {
      el('invoiceState').textContent = error.message || 'Shopify invoice send failed.';
      el('sendInvoice').disabled = false;
    }
  });

  el('reconcileShopify').addEventListener('click', async () => {
    if (!state.selected) return;

    const requestId = state.selected.request_id;
    el('reconcileShopify').disabled = true;
    el('reconcileShopify').textContent = 'Checking Shopify…';

    try {
      const payload = await api('/api/staff/shopify-reconcile', {
        method:'POST',
        body:JSON.stringify({ requestId }),
      });

      if (payload.paid) {
        el('invoiceState').textContent =
          'Payment confirmed in Shopify' +
          (payload.draftOrder && payload.draftOrder.order ? ' · Order ' + payload.draftOrder.order.name : '') + '.';
        el('reconcileShopify').textContent = 'Payment confirmed';
      } else {
        const draftStatus = payload.draftOrder && payload.draftOrder.status
          ? String(payload.draftOrder.status).replaceAll('_',' ')
          : 'open';
        el('invoiceState').textContent = 'Shopify draft status: ' + draftStatus + '. Payment has not been confirmed.';
        el('reconcileShopify').disabled = false;
        el('reconcileShopify').textContent = 'Refresh payment status';
      }

      await loadOrders();
      const refreshed = state.orders.find((o) => o.request_id === requestId);
      if (refreshed) {
        state.selected = { ...state.selected, ...refreshed };
        el('editStatus').value = refreshed.status || el('editStatus').value;
      }
    } catch (error) {
      el('invoiceState').textContent = error.message || 'Shopify status refresh failed.';
      el('reconcileShopify').disabled = false;
      el('reconcileShopify').textContent = 'Refresh payment status';
    }
  });

  if (state.token) loadOrders();
  else setConnected(false);
})();

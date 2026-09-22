(() => {
  'use strict';

  const TOKEN_KEY = 'scorpion-staff-token';
  const state = { token: sessionStorage.getItem(TOKEN_KEY) || '', orders: [], selected: null };

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
    if (!response.ok) throw new Error(payload.code || 'Request failed');
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
    const dollars = el('quoteTotal').value.trim();
    const quoteTotalMinor = dollars === '' ? null : Math.round(Number(dollars) * 100);
    el('saveOrder').disabled = true;
    el('saveState').textContent = 'Saving…';

    try {
      await api('/api/staff/orders', {
        method:'PATCH',
        body:JSON.stringify({
          requestId: state.selected.request_id,
          status: el('editStatus').value,
          quoteTotalMinor,
          staffNotes: el('staffNotes').value,
        }),
      });
      el('saveState').textContent = 'Saved';
      await loadOrders();
      const refreshed = state.orders.find((o) => o.request_id === state.selected.request_id);
      if (refreshed) state.selected = { ...state.selected, ...refreshed };
    } catch (error) {
      el('saveState').textContent = error.message || 'Save failed';
    } finally {
      el('saveOrder').disabled = false;
    }
  });

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

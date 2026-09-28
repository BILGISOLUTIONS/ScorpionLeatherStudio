const STYLE_ID = 'staff-analytics-v025-css';

function ensureDialog() {
  let dialog = document.getElementById('analyticsDialog');
  if (dialog) return dialog;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `<dialog id="analyticsDialog" class="analytics-dialog" aria-label="Workshop production overview">
    <div class="analytics-head">
      <div>
        <p class="eyebrow">WORKSHOP ANALYTICS</p>
        <h2>Production overview</h2>
        <p>Released-build throughput and checklist progress. No customer contact data is included.</p>
      </div>
      <div class="analytics-head__actions">
        <button id="analyticsRefresh" class="secondary" type="button">Refresh</button>
        <button id="analyticsClose" class="secondary" type="button" aria-label="Close production overview">Close</button>
      </div>
    </div>
    <div class="analytics-body">
      <p id="analyticsState" class="analytics-state" role="status"></p>
      <section id="analyticsStats" class="analytics-stats" aria-label="Production metrics"></section>
      <section id="analyticsProgress" class="analytics-progress" aria-label="Workshop checklist progress"></section>
      <div class="analytics-grid">
        <section class="analytics-section" aria-label="Active workshop queue">
          <div class="analytics-section__head"><strong>Active released builds</strong><span>Oldest release first</span></div>
          <div class="analytics-table-wrap">
            <table class="analytics-table">
              <thead><tr><th>Work order</th><th>Product</th><th>Qty</th><th>Age</th><th>Manufacturing</th><th>Final QC</th><th>Revisions</th></tr></thead>
              <tbody id="analyticsQueue"></tbody>
            </table>
            <div id="analyticsQueueEmpty" class="analytics-empty" hidden>No active released builds.</div>
          </div>
        </section>
        <section class="analytics-section" aria-label="Released product mix">
          <div class="analytics-section__head"><strong>Released product mix</strong><span>Loaded history</span></div>
          <div id="analyticsProducts" class="analytics-products"></div>
        </section>
      </div>
      <p id="analyticsGenerated" class="analytics-generated"></p>
    </div>
  </dialog>`;

  dialog = wrapper.firstElementChild;
  document.body.append(dialog);
  return dialog;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = '/staff-analytics-v025.css';
  document.head.append(link);
}

function percent(done, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

function duration(hours) {
  if (hours === null || hours === undefined || !Number.isFinite(Number(hours))) return '—';
  const value = Number(hours);
  if (value < 24) return value.toFixed(value < 10 ? 1 : 0) + ' hr';
  const days = value / 24;
  return days.toFixed(days < 10 ? 1 : 0) + ' d';
}

function clear(node) {
  node.replaceChildren();
}

function stat(label, value, detail = '') {
  const card = document.createElement('div');
  card.className = 'wa-stat';
  const span = document.createElement('span');
  span.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = value;
  card.append(span, strong);
  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    card.append(small);
  }
  return card;
}

function progress(label, done, total) {
  const wrap = document.createElement('div');
  wrap.className = 'wa-progress';
  const head = document.createElement('div');
  const name = document.createElement('span');
  name.textContent = label;
  const value = document.createElement('strong');
  value.textContent = done + ' / ' + total;
  head.append(name, value);

  const track = document.createElement('div');
  track.className = 'wa-progress__track';
  const bar = document.createElement('span');
  bar.style.width = percent(done, total) + '%';
  track.append(bar);

  wrap.append(head, track);
  return wrap;
}

function tableCell(text, sub = '') {
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
}

export function createWorkshopAnalyticsV025({ api, el, openOrder, dateTime }) {
  ensureStyles();
  const dialog = ensureDialog();
  const stateNode = el('analyticsState');
  const stats = el('analyticsStats');
  const progressNode = el('analyticsProgress');
  const queueBody = el('analyticsQueue');
  const queueEmpty = el('analyticsQueueEmpty');
  const productList = el('analyticsProducts');
  const generated = el('analyticsGenerated');
  const refreshButton = el('analyticsRefresh');
  let controller = null;

  const render = (analytics) => {
    clear(stats);
    stats.append(
      stat('Active builds', String(analytics.activeCount), analytics.activeUnits + ' unit' + (analytics.activeUnits === 1 ? '' : 's')),
      stat('Released total', String(analytics.releasedCount)),
      stat('Completed', String(analytics.completedCount), analytics.completedLast30Days + ' in last 30 days'),
      stat('Avg. release → QC', duration(analytics.averageReleaseToQcHours), 'completed builds only'),
      stat('Oldest active', duration(analytics.oldestActiveHours)),
      stat('Controlled revisions', String(analytics.totalRevisionCount)),
    );

    clear(progressNode);
    progressNode.append(
      progress('Manufacturing checklist', analytics.checklist.manufacturingDone, analytics.checklist.manufacturingTotal),
      progress('Final-QC checklist', analytics.checklist.qualityDone, analytics.checklist.qualityTotal),
    );

    clear(queueBody);
    const queue = Array.isArray(analytics.queue) ? analytics.queue : [];
    queueEmpty.hidden = queue.length > 0;
    for (const item of queue) {
      const tr = document.createElement('tr');
      tr.tabIndex = 0;
      tr.append(
        tableCell(item.workOrderId || item.requestId, item.revisionId || ''),
        tableCell(item.referenceTitle || item.productTitle, item.productTitle),
        tableCell(String(item.quantity)),
        tableCell(duration(item.ageHours), dateTime(item.releasedAt)),
        tableCell(item.manufacturingDone + ' / ' + item.manufacturingTotal, percent(item.manufacturingDone, item.manufacturingTotal) + '%'),
        tableCell(item.qualityDone + ' / ' + item.qualityTotal, percent(item.qualityDone, item.qualityTotal) + '%'),
        tableCell(String(item.revisionCount)),
      );
      const open = () => {
        dialog.close();
        openOrder(item.requestId);
      };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        open();
      });
      queueBody.append(tr);
    }

    clear(productList);
    const products = Array.isArray(analytics.products) ? analytics.products : [];
    for (const product of products.slice(0, 8)) {
      const row = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = product.productTitle;
      const meta = document.createElement('span');
      meta.textContent = product.orders + ' build' + (product.orders === 1 ? '' : 's') +
        ' · ' + product.units + ' unit' + (product.units === 1 ? '' : 's');
      row.append(name, meta);
      productList.append(row);
    }
    if (!products.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No released workshop product history yet.';
      productList.append(empty);
    }

    generated.textContent = 'Generated ' + dateTime(analytics.generatedAt) +
      ' from ' + analytics.sourceCount + ' stored order' + (analytics.sourceCount === 1 ? '' : 's') + '.';
    stateNode.textContent = 'Workshop production overview is current.';
  };

  const load = async () => {
    if (controller) controller.abort();
    controller = new AbortController();
    refreshButton.disabled = true;
    stateNode.textContent = 'Loading production overview…';
    try {
      const analytics = await api('/api/staff/orders?view=workshop-analytics', { signal: controller.signal });
      render(analytics.analytics || {});
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      stateNode.textContent = error.message || 'Production overview could not be loaded.';
    } finally {
      refreshButton.disabled = false;
    }
  };

  const open = async () => {
    if (!dialog.open) dialog.showModal();
    await load();
  };

  const close = () => {
    if (controller) controller.abort();
    controller = null;
    if (dialog.open) dialog.close();
  };

  refreshButton.addEventListener('click', load);
  el('analyticsClose').addEventListener('click', close);
  dialog.addEventListener('close', () => {
    if (controller) controller.abort();
    controller = null;
  });

  return { open, close, refresh: load };
}

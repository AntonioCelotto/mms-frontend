// Article links never multiply material quantities: quantity_required is the total.
(function () {
  const text = value => String(value ?? '').trim();
  const num = value => { const n = Number(text(value).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const esc = value => text(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  function articles(order) {
    const payload = order?.sourceQuotePayload || order?.source_quote_payload || {};
    return (Array.isArray(payload.articles) ? payload.articles : []).map((article,index) => ({
      key: String(article.id || article.code || `article-${index+1}`),
      name: text(article.name || article.product_name || `Articolo ${index+1}`),
    }));
  }
  function selectedOrder() { return typeof getSelectedOrder === 'function' ? getSelectedOrder() : null; }
  function draftRows() { return typeof orderDetailEditCurrentDraft === 'function' ? orderDetailEditCurrentDraft()?.materials || [] : []; }
  function savedRows() { return appData.orderMaterials?.[Number(selectedOrder()?.id)] || []; }

  // Reclaim this order's existing reservations in a READ-ONLY preview, then
  // allocate its draft rows once in order. Other orders' reservations stay busy.
  function availability(rows, saved, inventory) {
    const own = new Map(), pools = new Map();
    for (const row of saved) {
      const id = Number(row.inventory_item_id || row.inventoryItemId);
      own.set(id,(own.get(id)||0)+Math.max(0,num(row.reserved_quantity)));
    }
    const items = new Map(inventory.map(item => [Number(item.id),item]));
    return rows.map(row => {
      const required = num(row.quantity_required ?? row.quantity);
      if (text(row.source_type || row.source).toLowerCase() === 'cliente') return {client:true,required};
      const id = Number(row.inventory_item_id || row.inventoryItemId), item = items.get(id);
      if (!id || !item) return {unknown:true,required};
      const stock = Math.max(0,num(item.available ?? item.available_quantity));
      const reserved = Math.max(0,num(item.reserved ?? item.reserved_quantity));
      if (!pools.has(id)) pools.set(id,Math.max(0,stock-Math.max(0,reserved-(own.get(id)||0))));
      const covered = Math.min(Math.max(0,required),pools.get(id));
      pools.set(id,Math.max(0,pools.get(id)-covered));
      const original = saved.find(old => row.id && String(old.id)===String(row.id)
        && Number(old.inventory_item_id || old.inventoryItemId)===id);
      return {required,stock,free:Math.max(0,stock-reserved),covered,
        reserved:Math.max(0,num(original?.reserved_quantity)),missing:Math.max(0,required-covered),unit:text(item.unit || row.unit)};
    });
  }
  function availabilityMarkup(result) {
    if (result.client) return 'Fornitura cliente — disponibilità non gestita dal magazzino MMS';
    if (result.unknown) return 'Disponibilità da verificare: collega il materiale al magazzino';
    const unit = result.unit ? ` ${esc(result.unit)}` : '';
    const fmt=n=>Number(n).toLocaleString('it-IT',{maximumFractionDigits:6});
    return `Necessari: <strong>${fmt(result.required)}${unit}</strong><br>Stock: ${fmt(result.stock)}${unit} · Liberi: ${fmt(result.free)}${unit}<br>`+
      `Riservati su questa riga: ${fmt(result.reserved)}${unit}<br>Disponibili per questa riga: ${fmt(result.covered)}${unit}<br>`+
      `<strong>${result.missing>1e-9 ? 'Mancanti previsti: '+fmt(result.missing)+unit : 'Quantità coperta'}</strong>`;
  }
  window.mmsMaterialArticles = {articles,availability};
  window.mmsMaterialArticleSelect = function(row,index) {
    const options = articles(selectedOrder()), key = text(row.article_key || row.articleKey);
    const missing = key && !options.some(article=>article.key===key);
    return `<label class="muted">Articolo di destinazione</label><select class="filter-chip" data-order-detail-material-index="${index}" data-order-detail-material-field="article_key">`+
      `<option value="">Generale ordine / da collegare</option>`+
      (missing ? `<option value="${esc(key)}" selected>${esc(row.article_name || key)} — articolo non più presente</option>` : '')+
      options.map(article=>`<option value="${esc(article.key)}" ${article.key===key?'selected':''}>${esc(article.name)}</option>`).join('')+'</select>';
  };
  window.mmsOrderMaterialAvailabilityCell = function(row,index,rows) {
    return `<td data-material-availability="${index}">${availabilityMarkup(availability(rows,savedRows(),appData.inventory || [])[index])}</td>`;
  };
  function refreshAvailability() {
    const results = availability(draftRows(),savedRows(),appData.inventory || []);
    document.querySelectorAll('[data-material-availability]').forEach(node => {
      const result = results[Number(node.dataset.materialAvailability)];
      if (result) node.innerHTML = availabilityMarkup(result);
    });
    const saved=savedRows(),persisted=availability(saved,saved,appData.inventory || []);
    document.querySelectorAll('[data-material-summary-index]').forEach(node=>{
      const result=persisted[Number(node.dataset.materialSummaryIndex)];
      if(result)node.innerHTML=availabilityMarkup(result);
    });
  }
  window.mmsRefreshMaterialAvailability=refreshAvailability;
  window.mmsMaterialsRefreshStock = async function() {
    const response = await fetch('/api/inventory',{headers:{Accept:'application/json'}});
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload.items)) throw new Error('Disponibilità magazzino non aggiornata');
    const previous = new Map((appData.inventory || []).map(item=>[Number(item.id),item]));
    appData.inventory = payload.items.map(item=>({...previous.get(Number(item.id)),...item}));
    refreshAvailability();
  };
  if (typeof orderDetailEditHandleField === 'function') {
    const base = orderDetailEditHandleField;
    orderDetailEditHandleField = function materialArticleField(target) {
      const result = base(target);
      if (!target.matches?.('[data-order-detail-material-field]')) return result;
      const row = draftRows()[Number(target.dataset.orderDetailMaterialIndex)];
      if (row && target.dataset.orderDetailMaterialField === 'article_key') {
        row.article_key = target.value;
        row.article_name = articles(selectedOrder()).find(article=>article.key===target.value)?.name || '';
      }
      refreshAvailability();
      return result;
    };
  }
  if (typeof orderDetailEditSave === 'function') {
    const base = orderDetailEditSave;
    orderDetailEditSave = function validateMaterialsBeforeSave() {
      const validKeys = new Set(articles(selectedOrder()).map(article=>article.key));
      for (const row of draftRows()) {
        if (!text(row.product_name || row.material)) continue;
        const quantity = num(row.quantity_required ?? row.quantity);
        const key = text(row.article_key || row.articleKey);
        if (quantity<=0 || quantity>1e9 || (key && !validKeys.has(key))) {
          const error = new Error('Controlla quantità e articolo di destinazione dei materiali prima di salvare.');
          if (typeof setFlashMessage === 'function') setFlashMessage(error.message);
          return Promise.reject(error);
        }
      }
      return base();
    };
  }
  // A separate read-only summary is also available without opening the editor.
  const baseRender = renderApp;
  renderApp = function renderMaterialArticleSummary() {
    baseRender();
    if (appState.currentView !== 'order-detail') return;
    const section = document.querySelector('section.view.active');
    if (!section || section.querySelector('[data-material-article-summary]')) return;
    const rows = savedRows();
    if (!rows.length) return;
    const results = availability(rows,rows,appData.inventory || []);
    const body = rows.map((row,index)=>`<tr><td>${esc(row.article_name || 'Generale ordine / da collegare')}</td><td>${esc(row.product_name || row.material)}</td><td data-material-summary-index="${index}">${availabilityMarkup(results[index])}</td></tr>`).join('');
    section.insertAdjacentHTML('beforeend',`<div class="surface" data-material-article-summary><div class="surface-inner"><h3>Materiali per articolo e disponibilità</h3><p>Quantità totali per riga, non per pezzo. La disponibilità è una previsione; la prenotazione viene verificata al salvataggio.</p><div style="overflow-x:auto"><table><thead><tr><th>Articolo</th><th>Materiale</th><th>Quantità e magazzino</th></tr></thead><tbody>${body}</tbody></table></div></div></div>`);
  };
})();

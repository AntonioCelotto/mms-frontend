(function () {
  const EXPORT_CONFIG = {
    orders: { label: "Ordini", file: "ordini-mms", rows: exportOrderRows },
    quotes: { label: "Preventivi", file: "preventivi-mms", rows: exportQuoteRows },
    clients: { label: "Clienti", file: "clienti-mms", rows: exportClientRows },
    inventory: { label: "Magazzino", file: "magazzino-mms", rows: exportInventoryRows },
  };

  function value(input) {
    return input === null || input === undefined ? "" : String(input).trim();
  }

  function numeric(input) {
    if (input === null || input === undefined || input === "") return "";
    const parsed = Number(String(input).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : value(input);
  }

  function xml(input) {
    return value(input)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function cell(input, style = "Text") {
    const isNumber = typeof input === "number" && Number.isFinite(input);
    const type = isNumber ? "Number" : "String";
    return `<Cell ss:StyleID="${style}"><Data ss:Type="${type}">${xml(input)}</Data></Cell>`;
  }

  function workbookXml(sheetName, headers, rows) {
    const tableRows = [
      `<Row ss:StyleID="Header">${headers.map((header) => cell(header, "Header")).join("")}</Row>`,
      ...rows.map((row) => `<Row>${row.map((item) => cell(item, typeof item === "number" ? "Number" : "Text")).join("")}</Row>`),
    ].join("");
    const columns = headers.map(() => '<Column ss:AutoFitWidth="1" ss:Width="115"/>').join("");
    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/></Style>
  <Style ss:ID="Header"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1F2937" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Text"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>
  <Style ss:ID="Number"><Alignment ss:Horizontal="Right" ss:Vertical="Top"/><NumberFormat ss:Format="#,##0.00"/></Style>
 </Styles>
 <Worksheet ss:Name="${xml(sheetName.slice(0, 31))}">
  <Table>${columns}${tableRows}</Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions>
  <AutoFilter x:Range="R1C1:R${Math.max(1, rows.length + 1)}C${headers.length}" xmlns="urn:schemas-microsoft-com:office:excel"/>
 </Worksheet>
</Workbook>`;
  }

  function downloadExcel(fileName, sheetName, headers, rows) {
    const content = workbookXml(sheetName, headers, rows);
    const blob = new Blob([content], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function paymentDescription(order) {
    const rows = Array.isArray(order?.paymentRows) ? order.paymentRows : [];
    if (!rows.length) return value(order?.payment);
    return rows.map((row) => {
      const parts = [row.payment_type || row.type, row.amount, row.status, row.due_date || row.dueDate, row.paid_date || row.paidDate]
        .map(value)
        .filter(Boolean);
      return parts.join(" - ");
    }).join(" | ");
  }

  function visibleOrders() {
    if (typeof filterOrders === "function") return filterOrders();
    return typeof appData !== "undefined" && Array.isArray(appData?.orders) ? appData.orders : [];
  }

  function exportOrderRows() {
    const headers = ["Numero ordine", "Cliente", "Data ordine", "Consegna", "Categoria", "Reparto", "Priorita", "Stato", "Imponibile", "Sconto", "Totale", "Pagamento", "Dettaglio pagamenti", "Note"];
    const rows = visibleOrders().map((order) => [
      order.sourceQuoteNumber || order.source_quote_number || order.orderNumber || order.order_number || order.id,
      order.client,
      order.orderDate || order.order_date,
      order.estimatedDelivery || order.estimated_delivery_date || order.eta,
      order.category,
      order.department,
      order.priority,
      order.status,
      numeric(order.taxableAmount ?? order.taxable_amount ?? order.subtotal),
      numeric(order.discountAmount ?? order.discount_amount),
      numeric(order.total),
      order.payment,
      paymentDescription(order),
      order.notes || order.summary,
    ]);
    return { headers, rows };
  }

  function exportQuoteRows() {
    const headers = ["Numero preventivo", "Cliente", "Data", "Categoria", "Priorita", "Subtotale", "Sconto", "Imponibile", "IVA", "Totale", "Stato", "Articoli", "Note"];
    const quotes = typeof appState !== "undefined" && Array.isArray(appState?.savedQuotes) ? appState.savedQuotes : [];
    const rows = quotes.map((quote) => [
      quote.id || quote.quote_number,
      quote.client || quote.client_name,
      quote.quoteDate || quote.quote_date,
      quote.category,
      quote.priority,
      numeric(quote.subtotal),
      numeric(quote.discountAmount ?? quote.discount_amount),
      numeric(quote.taxableAmount ?? quote.taxable_amount),
      numeric(quote.vatAmount ?? quote.vat_amount),
      numeric(quote.total),
      quote.status,
      (Array.isArray(quote.articles) ? quote.articles : []).map((article) => `${value(article.name) || "Articolo"} x ${value(article.quantity) || "1"}`).join(" | "),
      quote.note,
    ]);
    return { headers, rows };
  }

  function visibleClients() {
    const clients = typeof appState !== "undefined" && Array.isArray(appState?.realClients)
      ? appState.realClients
      : (typeof appData !== "undefined" && Array.isArray(appData?.clients) ? appData.clients : []);
    const query = value(typeof appState !== "undefined" ? appState?.clientsSearch : "").toLowerCase();
    if (!query) return clients;
    return clients.filter((client) => [client.name, client.email, client.phone, client.billing_vat_number, client.vat]
      .map(value).join(" ").toLowerCase().includes(query));
  }

  function exportClientRows() {
    const headers = ["Cliente", "Email", "Telefono", "P.IVA / CF", "PEC", "SDI", "Indirizzo", "CAP", "Citta", "Condizioni pagamento", "Note"];
    const rows = visibleClients().map((client) => [
      client.name || client.client_name,
      client.email,
      client.phone,
      client.billing_vat_number || client.vat || client.tax_code,
      client.pec,
      client.sdi || client.recipient_code,
      client.billing_address || client.address,
      client.postal_code || client.cap,
      client.city,
      client.payment_terms || client.paymentRule,
      client.notes || client.note,
    ]);
    return { headers, rows };
  }

  function visibleInventory() {
    const items = typeof appData !== "undefined" && Array.isArray(appData?.inventory) ? appData.inventory : [];
    const filters = (typeof appState !== "undefined" && appState?.inventoryFilters) || {};
    const query = value(filters.query).toLowerCase();
    return items.filter((item) => {
      const haystack = [item.name, item.product, item.sku, item.mms_code, item.supplier_material_code, item.category, item.color, item.description, item.supplier_name]
        .map(value).join(" ").toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      const matchesOrigin = !filters.origin || filters.origin === "all" || value(item.material_origin || "mms") === value(filters.origin);
      const matchesSupplier = !filters.supplier || filters.supplier === "all" || value(item.supplier_name) === value(filters.supplier);
      const matchesCategory = !filters.category || filters.category === "all" || value(item.category) === value(filters.category);
      return matchesQuery && matchesOrigin && matchesSupplier && matchesCategory;
    });
  }

  function exportInventoryRows() {
    const headers = ["Tipo", "Codice MMS", "Codice fornitore", "Nome", "Descrizione", "Categoria", "Colore", "Origine", "Fornitore", "Disponibile", "Impegnato", "Unita", "Costo", "Prezzo pubblico", "Stato", "Note"];
    const rows = visibleInventory().map((item) => [
      item.item_type || "materiale",
      item.mms_code || item.sku,
      item.supplier_material_code,
      item.name || item.product,
      item.description,
      item.category,
      item.color,
      item.material_origin || "mms",
      item.supplier_name,
      numeric(item.available_quantity ?? item.available),
      numeric(item.reserved_quantity ?? item.reserved),
      item.unit,
      numeric(item.unit_cost ?? item.cost),
      numeric(item.retail_price ?? item.public_price),
      item.status,
      item.notes,
    ]);
    return { headers, rows };
  }

  function injectExportButton() {
    const view = value(typeof appState !== "undefined" ? appState?.currentView : "");
    const config = EXPORT_CONFIG[view];
    if (!config) return;
    const section = document.querySelector(`section.view.active`);
    const actions = section?.querySelector(".screen-header .screen-actions");
    if (!actions || actions.querySelector("[data-excel-export]")) return;

    let button = null;
    if (view === "orders") {
      button = Array.from(actions.querySelectorAll("button")).find((item) => value(item.textContent).toLowerCase() === "esporta vista") || null;
    }
    if (!button) {
      button = document.createElement("button");
      button.className = "action-pill";
      button.type = "button";
      actions.appendChild(button);
    }
    button.dataset.excelExport = view;
    button.textContent = "Esporta Excel";
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-excel-export]");
    if (!button) return;
    const config = EXPORT_CONFIG[button.dataset.excelExport];
    if (!config) return;
    const { headers, rows } = config.rows();
    if (!rows.length) {
      if (typeof setFlashMessage === "function") {
        setFlashMessage("Nessun dato da esportare con i filtri attuali");
        if (typeof renderApp === "function") renderApp();
      }
      return;
    }
    downloadExcel(config.file, config.label, headers, rows);
  });

  const observer = new MutationObserver(injectExportButton);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("load", injectExportButton);
  injectExportButton();
})();

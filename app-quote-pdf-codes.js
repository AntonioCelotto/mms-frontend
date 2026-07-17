(function () {
  function text(value) {
    return String(value ?? "").trim();
  }

  function lineCode(item, fallback) {
    return (
      text(item?.product_code) ||
      text(item?.inventory_sku) ||
      text(item?.sku) ||
      text(item?.mms_code) ||
      text(item?.supplier_material_code) ||
      text(item?.code) ||
      text(fallback) ||
      "-"
    );
  }

  if (typeof quoteListPdfHtml === "function") {
    quoteListPdfHtml = function quoteListPdfHtmlWithCodes(quote) {
      const clientInfo = quoteListClientInfo(quote);
      const clientDetails = quoteListHasClientInfo(quote)
        ? `
          <section style="margin-top:18px; padding:14px; background:#f7f7f7;">
            <strong>Dati cliente</strong><br />
            ${clientInfo.email ? `Email: ${quoteHtml(clientInfo.email)}<br />` : ""}
            ${clientInfo.phone ? `Telefono: ${quoteHtml(clientInfo.phone)}<br />` : ""}
            ${clientInfo.vat ? `P.IVA / CF: ${quoteHtml(clientInfo.vat)}<br />` : ""}
            ${clientInfo.pec ? `PEC / SDI: ${quoteHtml(clientInfo.pec)}<br />` : ""}
            ${clientInfo.address ? `Indirizzo: ${quoteHtml(clientInfo.address)}<br />` : ""}
            ${clientInfo.paymentTerms ? `Pagamento: ${quoteHtml(clientInfo.paymentTerms)}<br />` : ""}
          </section>
        `
        : "";

      const rows = (quote.articles || [])
        .map((article, index) => {
          const articleCode = lineCode(article, article.name || "Articolo");
          const materialRows = (article.materials || [])
            .map((material) => {
              const materialCode = lineCode(material, material.material || "Materiale");
              return `
                <tr>
                  <td style="padding:6px 0 6px 18px;">${quoteHtml(materialCode)}</td>
                  <td style="text-align:right;">${quoteHtml(material.quantity)}</td>
                  <td style="text-align:right;">${quoteMoney(material.price)}</td>
                  <td style="text-align:right;">${quoteMoney(quoteMaterialTotal(material))}</td>
                </tr>
              `;
            })
            .join("");
          return `
            <tr>
              <td style="padding-top:12px;"><strong>${index + 1}. ${quoteHtml(articleCode)}</strong></td>
              <td style="text-align:right;">${quoteHtml(article.quantity || "1")}</td>
              <td style="text-align:right;">${quoteMoney(article.cost)}</td>
              <td style="text-align:right;">${quoteMoney(quoteArticleTotal(article))}</td>
            </tr>
            ${materialRows}
          `;
        })
        .join("");

      return `
        <!doctype html>
        <html lang="it">
          <head>
            <meta charset="utf-8" />
            <title>Preventivo ${quoteHtml(quote.id)}</title>
            <style>
              body { font-family: Arial, sans-serif; color: #1d2320; padding: 40px; }
              header { display: flex; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 18px; margin-bottom: 28px; }
              h1 { margin: 0; font-size: 28px; }
              table { width: 100%; border-collapse: collapse; margin-top: 24px; }
              th { text-align: left; border-bottom: 1px solid #999; padding: 8px 0; }
              td { border-bottom: 1px solid #ddd; padding: 8px 0; }
              .total { margin-top: 28px; text-align: right; font-size: 22px; font-weight: 700; }
              .note { margin-top: 28px; padding: 16px; background: #f6f3ec; }
              @media print { button { display: none; } }
            </style>
          </head>
          <body>
            <button onclick="window.print()">Stampa / salva PDF</button>
            <header>
              <div>
                <h1>MMS Studio</h1>
                <p>Preventivo ${quoteHtml(quote.id)}</p>
              </div>
              <div>
                <strong>Cliente</strong><br />
                ${quoteHtml(quote.client)}<br />
                Data: ${quoteHtml(quote.quoteDate)}
              </div>
            </header>
            <section>
              <p><strong>Categoria:</strong> ${quoteHtml(quote.category)}<br />
              <strong>Priorita':</strong> ${quoteHtml(quote.priority)}</p>
            </section>
            ${clientDetails}
            <table>
              <thead>
                <tr>
                  <th>Codice</th>
                  <th style="text-align:right;">Quantita'</th>
                  <th style="text-align:right;">Costo</th>
                  <th style="text-align:right;">Totale</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <div class="total">Totale: ${quoteMoney(quote.total)}</div>
            ${quote.note ? `<div class="note"><strong>Note</strong><br />${quoteHtml(quote.note)}</div>` : ""}
          </body>
        </html>
      `;
    };
  }
})();
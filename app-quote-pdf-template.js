(function() {
  const LOGO_DATA_URL = "data:image/png;base64,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";

  function text(value) {
    return String(value ?? "").trim();
  }

  function numberValue(value) {
    let raw = text(value).replace(/[^\d,.-]/g, "");
    if (raw.includes(",") && raw.includes(".")) {
      raw = raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
    } else {
      raw = raw.replace(",", ".");
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function money(value) {
    return `${numberValue(value).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  }

  function dateLabel(value) {
    const raw = text(value);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]} / ${match[2]} / ${match[1]}`;
    return raw || new Date().toLocaleDateString("it-IT");
  }

  function lineCode(item) {
    return text(item?.mms_code || item?.sku || item?.code || item?.material_code || item?.article_code);
  }

  function lineDescription(item, fallback) {
    return text(item?.description || item?.descrizione || item?.material || item?.name || fallback) || "Servizio";
  }

  function lineColor(item) {
    return text(item?.color || item?.colore);
  }

  function serviceRows(quote) {
    return (quote.articles || []).flatMap((article) => {
      const materials = Array.isArray(article.materials) ? article.materials.filter(Boolean) : [];
      const articleTotal = typeof quoteArticleTotal === "function" ? quoteArticleTotal(article) : numberValue(article.cost) * (numberValue(article.quantity) || 1);
      const articleRow = {
        code: lineCode(article),
        description: lineDescription(article, article.name),
        color: lineColor(article),
        quantity: text(article.quantity) || "1",
        unit: numberValue(article.cost),
        total: articleTotal,
      };
      const materialRows = materials.map((material) => ({
        code: lineCode(material),
        description: lineDescription(material, material.material),
        color: lineColor(material),
        quantity: text(material.quantity) || "1",
        unit: numberValue(material.price),
        total: typeof quoteMaterialTotal === "function" ? quoteMaterialTotal(material) : numberValue(material.price) * (numberValue(material.quantity) || 1),
      }));
      if (materialRows.length && !articleRow.code && !articleRow.color && !numberValue(article.cost)) return materialRows;
      return [articleRow, ...materialRows].filter((row) => row.code || row.color || row.description);
    });
  }

  function quoteTotals(quote) {
    const calculatedSubtotal = serviceRows(quote).reduce((sum, row) => sum + numberValue(row.total), 0);
    const subtotal = numberValue(quote.subtotal) || calculatedSubtotal;
    const discount = numberValue(quote.discount_amount);
    const taxable = numberValue(quote.taxable_amount) || Math.max(0, subtotal - discount);
    const total = numberValue(quote.total);
    const vat = numberValue(quote.vat_amount) || Math.max(0, total - taxable);
    const vatRate = numberValue(quote.vat_rate) || (taxable ? (vat / taxable) * 100 : 0);
    return { subtotal, discount, taxable, vat, vatRate, total: total || taxable + vat };
  }

  function recipientRows(info, quote) {
    return [
      ["Name", quote.client],
      ["E-mail", info.email],
      ["Vat", info.vat],
      ["Indirizzo", info.address],
      ["Cap", info.postalCode || info.cap],
    ];
  }

  function dataRows(rows) {
    return rows.map(([label, value]) => `
      <div class="data-row">
        <span>${quoteHtml(label)}</span>
        <strong>${value ? quoteHtml(value) : "&nbsp;"}</strong>
      </div>
    `).join("");
  }

  function serviceTableRows(quote) {
    const rows = serviceRows(quote);
    if (!rows.length) return `<tr><td colspan="4" class="empty">Nessun servizio inserito</td></tr>`;
    return rows.map((row) => {
      const fields = [
        row.code ? `<span><b>Codice</b> ${quoteHtml(row.code)}</span>` : "",
        row.color ? `<span><b>Colore</b> ${quoteHtml(row.color)}</span>` : "",
        row.description ? `<span><b>Descrizione</b> ${quoteHtml(row.description)}</span>` : "",
      ].filter(Boolean).join("");
      return `
        <tr>
          <td><div class="service-fields">${fields}</div></td>
          <td>${money(row.unit)}</td>
          <td>${quoteHtml(row.quantity)}</td>
          <td>${money(row.total)}</td>
        </tr>
      `;
    }).join("");
  }

  function summaryTable(totals, vatLabel, paymentText) {
    const rows = [
      ["SUBTOTALE", money(totals.subtotal)],
      ...(totals.discount ? [["SCONTO", `- ${money(totals.discount)}`]] : []),
      ["IMPONIBILE", money(totals.taxable)],
      [vatLabel, money(totals.vat)],
      ["TOT", money(totals.total)],
    ];
    return `
      <table class="summary">
        <tbody>
          <tr>
            <td class="payment" rowspan="${rows.length}">
              ${quoteHtml(paymentText)}<br /><br />
              <span class="bank">Banca Sella</span>
            </td>
            <td>${quoteHtml(rows[0][0])}</td>
            <td>${rows[0][1]}</td>
          </tr>
          ${rows.slice(1).map((row, index) => `
            <tr class="${index === rows.length - 2 ? "total" : ""}">
              <td>${quoteHtml(row[0])}</td>
              <td>${row[1]}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function photoPages(quote) {
    const photos = Array.isArray(quote.photos) ? quote.photos.filter((photo) => photo?.dataUrl || photo?.url || photo?.localUrl) : [];
    if (!photos.length) return "";
    return `
      <section class="photo-page">
        <div class="photo-head"><h2>RIFERIMENTI</h2><span>Preventivo ${quoteHtml(quote.id || "")}</span></div>
        <div class="photo-grid">
          ${photos.map((photo, index) => {
            const url = photo.dataUrl || photo.url || photo.localUrl;
            return `<figure><img src="${url}" alt="${quoteHtml(photo.name || `Foto ${index + 1}`)}" /><figcaption>${quoteHtml(photo.name || `Foto ${index + 1}`)}</figcaption></figure>`;
          }).join("")}
        </div>
        <img class="logo" src="${LOGO_DATA_URL}" alt="MMS Studio" />
      </section>
    `;
  }

  if (typeof quoteListPdfHtml !== "function") return;

  quoteListPdfHtml = function quoteListPdfHtmlMmsTemplate(quote) {
    const info = typeof quoteListClientInfo === "function" ? quoteListClientInfo(quote) : {};
    const totals = quoteTotals(quote);
    const paymentText = text(info.paymentTerms) || "Il pagamento e' dovuto entro 15 giorni";
    const vatLabel = totals.vatRate ? `IVA ${String(Math.round(totals.vatRate * 100) / 100).replace(".", ",")}%` : "IVA";
    const notes = text(quote.note);
    return `
      <!doctype html>
      <html lang="it">
        <head>
          <meta charset="utf-8" />
          <title>Preventivo ${quoteHtml(quote.id || "")} - MMS Studio</title>
          <style>
            @page { size: A4; margin: 0; }
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; color: #171717; background: #fff; font-family: Arial, Helvetica, sans-serif; }
            body { font-size: 10.5pt; }
            .quote-page, .photo-page { width: 210mm; min-height: 297mm; padding: 18mm 16mm 14mm; position: relative; background: #fff; }
            h1 { margin: 0 0 9mm; font-size: 24pt; line-height: .95; font-weight: 900; letter-spacing: 0; }
            h2 { margin: 0; font-size: 18pt; font-weight: 900; }
            h3 { margin: 0 0 5mm; font-size: 13pt; line-height: 1; }
            .info-grid { width: 100%; border-collapse: separate; border-spacing: 0 10mm; margin: -10mm 0 0; table-layout: fixed; }
            .info-grid > tbody > tr > td { width: 50%; padding: 0 12mm 0 0; vertical-align: top; }
            .info-grid > tbody > tr > td + td { padding: 0 0 0 12mm; }
            .data-list { display: table; width: 100%; border-collapse: separate; border-spacing: 0 4mm; }
            .data-row { display: table-row; line-height: 1.25; }
            .data-row span, .data-row strong { display: table-cell; vertical-align: top; }
            .data-row span { width: 27mm; padding-right: 2mm; color: #333; }
            .data-row strong { font-weight: 400; overflow-wrap: anywhere; }
            .services { margin-top: 9mm; border-top: 1.2px solid #ff2029; padding-top: 3.5mm; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th { padding: 0 0 4mm; font-size: 10pt; text-align: left; vertical-align: bottom; }
            th:first-child { width: 42%; font-size: 16pt; font-weight: 900; }
            th:nth-child(2) { width: 25%; padding-right: 5mm; }
            th:nth-child(3) { width: 12%; text-align: center; }
            th:nth-child(4) { width: 21%; text-align: right; }
            td { padding: 4.2mm 0; vertical-align: top; page-break-inside: avoid; }
            td:nth-child(2) { text-align: right; padding-right: 7mm; }
            td:nth-child(3) { text-align: center; }
            td:nth-child(4) { text-align: right; }
            .service-fields { display: grid; gap: 1.1mm; font-size: 8.7pt; line-height: 1.3; }
            .service-fields span { display: block; overflow-wrap: anywhere; }
            .service-fields b { display: inline-block; min-width: 18mm; color: #555; font-size: 7.5pt; text-transform: uppercase; }
            .summary { width: 58%; margin: 7mm 0 0 auto; border-collapse: collapse; border-top: 1.2px solid #ff2029; border-bottom: 1.2px solid #ff2029; }
            .summary td { padding: 2mm 0; font-size: 9pt; }
            .summary td:nth-child(2) { text-align: left; padding-right: 3mm; }
            .summary td:last-child { width: 30mm; text-align: right; white-space: nowrap; }
            .summary .payment { width: auto; text-align: center !important; padding: 6mm 7mm 6mm 0 !important; line-height: 1.55; vertical-align: middle; }
            .summary .payment .bank { font-weight: 400; text-transform: uppercase; }
            .summary tr.total td { font-weight: 700; }
            .terms { width: 58%; margin: 6mm 0 0 auto; color: #ff2029; font-size: 10pt; font-weight: 700; line-height: 1.55; text-transform: uppercase; }
            .terms p { margin: 0 0 2mm; }
            .note { width: 58%; margin: 4mm 0 0 auto; font-size: 9pt; line-height: 1.45; }
            .note strong { color: #ff2029; }
            .header-logo { width: 24mm; height: auto; display: block; margin: 0 0 5mm; object-fit: contain; }\n            .photo-page .logo { width: 24mm; height: auto; display: block; margin-top: 18mm; object-fit: contain; }
            .photo-page { page-break-before: always; }
            .photo-head { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 4mm; border-bottom: 1.2px solid #ff2029; }
            .photo-grid { display: block; margin: 9mm -3.5mm 0; }
            figure { display: inline-block; width: calc(50% - 7mm); margin: 0 3.5mm 7mm; vertical-align: top; break-inside: avoid; }
            figure img { width: 100%; height: 92mm; object-fit: contain; border: 1px solid #e5e5e5; }
            figcaption { margin-top: 2mm; color: #555; font-size: 9pt; }
            .empty { text-align: left !important; color: #666; padding: 8mm 0; }
            @media print {
              .quote-page, .photo-page { break-after: page; }
              .photo-page:last-child, .quote-page:last-child { break-after: auto; }
            }
          </style>
        </head>
        <body>
          <section class="quote-page">
            <img class="header-logo" src="${LOGO_DATA_URL}" alt="MMS Studio" />\n            <h1>PREVENTIVO</h1>
            <table class="info-grid">
              <tbody>
                <tr>
                  <td>
                    <h3>Mittente</h3>
                    <div class="data-list">${dataRows([
                      ["Name", "MMS SRL"],
                      ["E-mail", "NICOLAMINOTTIMMS@GMAIL.COM"],
                      ["Vat", "15716861008"],
                      ["Indirizzo", "VIA TUSCOLANA 1661"],
                      ["Cap", "00133"],
                    ])}</div>
                  </td>
                  <td>
                    <h3>Destinatario</h3>
                    <div class="data-list">${dataRows(recipientRows(info, quote))}</div>
                  </td>
                </tr>
                <tr>
                  <td>
                    <h3>Dettagli Banca</h3>
                    <div class="data-list">${dataRows([
                      ["Name", "Banca Sella"],
                      ["IBAN", "IT58M0326803200052816944630"],
                      ["Indirizzo", "Via Tuscolana 1661 00133"],
                    ])}</div>
                  </td>
                  <td>
                    <h3>Data</h3>
                    <div class="data-list">${dataRows([
                      ["Emissione", dateLabel(quote.quoteDate)],
                      ["Preventivo", quote.id || ""],
                    ])}</div>
                  </td>
                </tr>
              </tbody>
            </table>

            <div class="services">
              <table>
                <thead><tr><th>SERVIZI</th><th>Prezzo per unita'</th><th>Qty</th><th>Totale</th></tr></thead>
                <tbody>${serviceTableRows(quote)}</tbody>
              </table>
            </div>

            ${summaryTable(totals, vatLabel, paymentText)}

            <div class="terms">
              <p>50% di anticipo per avvio del progetto</p>
              <p>Consegna 10 / 15 giorni, salvo rallentamenti di produzione</p>
            </div>
            ${notes ? `<div class="note"><strong>NOTE</strong><br />${quoteHtml(notes)}</div>` : ""}

          </section>
          ${photoPages(quote)}
        </body>
      </html>
    `;
  };
})();
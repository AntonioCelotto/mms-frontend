function ensureQuotePhotoState() {
  if (!Array.isArray(appState.quotePhotos)) appState.quotePhotos = [];
}

function quotePhotoSize(size) {
  const numeric = Number(size || 0);
  if (!numeric) return "Dimensione n/d";
  return numeric >= 1048576 ? `${(numeric / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(numeric / 1024))} KB`;
}

function quotePhotoSectionMarkup() {
  ensureQuotePhotoState();
  return `
    <div class="surface quote-photos-block">
      <div class="surface-inner">
        <div class="section-title">
          <div>
            <h3>Foto preventivo</h3>
            <p>Allega immagini, riferimenti, prove o dettagli utili al cliente prima dell'accettazione.</p>
          </div>
          <div class="pill-row">
            <button class="mini-btn" data-quote-pick-photo type="button">+ Foto</button>
            <input class="visually-hidden" data-quote-photo-input type="file" accept="image/*" multiple />
          </div>
        </div>
        ${
          appState.quotePhotos.length
            ? `<div class="attachment-grid">
                ${appState.quotePhotos
                  .map(
                    (photo, index) => `
                      <div class="attachment-card">
                        <button class="attachment-preview" data-quote-open-photo="${index}" type="button">
                          <img src="${photo.dataUrl}" alt="${quoteHtml(photo.name)}" />
                        </button>
                        <div class="attachment-info">
                          <strong>${quoteHtml(photo.name)}</strong>
                          <span>${quotePhotoSize(photo.size)}</span>
                        </div>
                        <div class="pill-row attachment-actions">
                          <button class="mini-btn" data-quote-open-photo="${index}" type="button">Apri</button>
                          <button class="mini-btn" data-quote-remove-photo="${index}" type="button">Rimuovi</button>
                        </div>
                      </div>
                    `
                  )
                  .join("")}
              </div>`
            : `<div class="empty-state">Nessuna foto allegata al preventivo.</div>`
        }
      </div>
    </div>
  `;
}

const baseRenderNewOrderQuotePhotos = renderNewOrder;
renderNewOrder = function renderNewOrderWithQuotePhotos() {
  const html = baseRenderNewOrderQuotePhotos();
  return html.replace('<div class="surface">\n        <div class="surface-inner">\n          <div class="section-title">\n            <div>\n              <h3>Azioni preventivo</h3>', `${quotePhotoSectionMarkup()}\n\n      <div class="surface">\n        <div class="surface-inner">\n          <div class="section-title">\n            <div>\n              <h3>Azioni preventivo</h3>`);
};

function readQuotePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      size: file.size,
      type: file.type,
      dataUrl: reader.result,
    });
    reader.onerror = () => reject(reader.error || new Error("Lettura foto non riuscita"));
    reader.readAsDataURL(file);
  });
}

function attachQuotePhotoEvents() {
  ensureQuotePhotoState();
  const pick = document.querySelector("[data-quote-pick-photo]");
  const input = document.querySelector("[data-quote-photo-input]");
  if (pick && input) {
    pick.addEventListener("click", () => input.click());
    input.addEventListener("change", async (event) => {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      if (!files.length) return;
      try {
        const photos = await Promise.all(files.map(readQuotePhoto));
        appState.quotePhotos.push(...photos);
        renderApp();
      } catch (error) {
        setFlashMessage(error.message || "Foto preventivo non caricata");
        renderApp();
      }
    });
  }

  document.querySelectorAll("[data-quote-open-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      const photo = appState.quotePhotos[Number(button.dataset.quoteOpenPhoto)];
      if (!photo?.dataUrl) return;
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`<img src="${photo.dataUrl}" alt="${quoteHtml(photo.name)}" style="max-width:100%;height:auto;" />`);
      win.document.close();
    });
  });

  document.querySelectorAll("[data-quote-remove-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      appState.quotePhotos.splice(Number(button.dataset.quoteRemovePhoto), 1);
      renderApp();
    });
  });
}

const baseQuoteListSnapshotPhotos = quoteListSnapshot;
quoteListSnapshot = function quoteListSnapshotWithPhotos() {
  const snapshot = baseQuoteListSnapshotPhotos();
  ensureQuotePhotoState();
  snapshot.photos = appState.quotePhotos.map((photo) => ({ ...photo }));
  return snapshot;
};

const baseQuoteListPdfHtmlPhotos = quoteListPdfHtml;
quoteListPdfHtml = function quoteListPdfHtmlWithPhotos(quote) {
  const html = baseQuoteListPdfHtmlPhotos(quote);
  const photos = Array.isArray(quote.photos) ? quote.photos : [];
  if (!photos.length) return html;
  const gallery = `
    <section style="margin-top:32px; page-break-inside: avoid;">
      <h2 style="font-size:20px;">Foto allegate</h2>
      <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:16px;">
        ${photos
          .map(
            (photo) => `
              <figure style="margin:0; border:1px solid #ddd; padding:10px;">
                <img src="${photo.dataUrl}" alt="${quoteHtml(photo.name)}" style="width:100%; max-height:260px; object-fit:contain;" />
                <figcaption style="font-size:12px; margin-top:8px;">${quoteHtml(photo.name)}</figcaption>
              </figure>
            `
          )
          .join("")}
      </div>
    </section>
  `;
  return html.replace("</body>", `${gallery}</body>`);
};

const baseRenderQuotesPhotos = renderQuotes;
renderQuotes = function renderQuotesWithPhotos() {
  return baseRenderQuotesPhotos().replace(
    /(<div class="alert-item"><strong>Note<\/strong><span>.*?<\/span><\/div>)/,
    `$1<div class="alert-item"><strong>Foto</strong><span>${quoteListFind()?.photos?.length || 0} allegate</span></div>`
  );
};

const baseAttachEventsQuotePhotos = attachEvents;
attachEvents = function attachEventsQuotePhotos() {
  baseAttachEventsQuotePhotos();
  attachQuotePhotoEvents();
};

ensureQuotePhotoState();
if (document.getElementById("app")?.innerHTML) renderApp();
(function () {
  const PAGE_SIZE = 50;
  const state = { rows: [], loaded: false, loadedAt: "", error: "", filter: "all", query: "", page: 0, printing: false };
  let pending = null;

  function allowed() {
    return ["admin", "commerce"].includes(window.mmsAuthProfile?.access_profile);
  }

  function html(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function amountCents(value) {
    if (value == null || String(value).trim() === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 100) : null;
  }

  function euros(cents) {
    return cents == null ? "Importo da definire" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
  }

  function date(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
    return match ? `${match[3]}/${match[2]}/${match[1]}` : "Da definire";
  }

  function paid(row) { return String(row.status || "").toLowerCase() === "pagato"; }
  function label(row) { return paid(row) ? "Pagato" : "Da pagare"; }
  function type(row) { return normalizePaymentLabel(row.payment_type || "Pagamento"); }
  function summary(rows) {
    return rows.reduce((total, row) => {
      const cents = amountCents(row.amount);
      if (cents == null) total.undefined += 1;
      else total.cents += cents;
      return total;
    }, { cents: 0, undefined: 0 });
  }

  function sorted(rows) {
    return [...rows].sort((a, b) => String(a.due_date || "9999-12-31").localeCompare(String(b.due_date || "9999-12-31"))
      || String(a.client || "").localeCompare(String(b.client || ""), "it") || Number(a.id) - Number(b.id));
  }

  function filtered() {
    const query = state.query.trim().toLocaleLowerCase("it");
    return sorted(state.rows.filter((row) => {
      if (state.filter === "paid" && !paid(row)) return false;
      if (state.filter === "unpaid" && paid(row)) return false;
      return !query || [row.client, row.order_number, row.display_order_id, type(row), label(row),
        row.amount, euros(amountCents(row.amount)), row.due_date, date(row.due_date), row.notes]
        .join(" ").toLocaleLowerCase("it").includes(query);
    }));
  }

  function tableRows(rows, print = false) {
    return rows.map((row) => `<tr>
      <td>${html(row.client)}</td><td>${html(row.order_number)}</td><td>${html(type(row))}</td>
      <td class="payments-amount">${html(euros(amountCents(row.amount)))}</td><td>${html(date(row.due_date))}</td>
      ${print ? "" : `<td>${paid(row) ? html(date(row.paid_date)) : "—"}</td><td>${html(label(row))}</td>
      <td><button class="mini-btn" data-payments-archive-open="${html(row.display_order_id)}">Apri</button></td>`}
    </tr>`).join("");
  }

  function totalMarkup(rows, title) {
    const total = summary(rows);
    return `<strong>${html(title)}: ${html(euros(total.cents))}</strong>${total.undefined ? `<p>${total.undefined} importi da definire, esclusi dal totale.</p>` : ""}`;
  }

  function panel() {
    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages - 1);
    const unpaid = state.rows.filter((row) => !paid(row));
    const paidRows = state.rows.filter(paid);
    const updated = state.loadedAt ? new Date(state.loadedAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "";
    return `<div class="surface-inner">
      <div class="section-title"><div><h3>Tutti i pagamenti</h3><p>${state.loaded ? `${state.rows.length} movimenti · Aggiornato ${html(updated)}` : "Caricamento dell'elenco completo…"}</p></div>
        <div class="screen-actions"><button class="mini-btn" data-payments-archive-refresh ${pending ? "disabled" : ""}>Aggiorna elenco</button>
        <button class="action-pill" data-payments-archive-print ${!state.loaded || state.printing ? "disabled" : ""}>${state.printing ? "Preparazione stampa…" : "Stampa tutti i da pagare"}</button></div>
      </div>
      ${state.error ? `<p role="alert">${html(state.error)}${state.loaded ? " I dati precedenti restano visibili." : ""}</p>` : ""}
      ${state.loaded ? `<div class="payments-archive-totals"><div>${totalMarkup(unpaid, "Da incassare")}</div><div>${totalMarkup(paidRows, "Pagato")}</div></div>` : ""}
      <div class="payments-archive-filters" role="group" aria-label="Stato pagamento">
        ${[["all", "Tutti"], ["paid", "Pagato"], ["unpaid", "Da pagare"]].map(([key, title]) =>
          `<button class="mini-btn" data-payments-archive-filter="${key}" aria-pressed="${state.filter === key}">${title}</button>`).join("")}
      </div>
      <div class="payments-archive-table"><table><thead><tr><th>Cliente</th><th>Ordine</th><th>Tipo</th><th>Importo</th><th>Scadenza</th><th>Pagato il</th><th>Stato</th><th>Azioni</th></tr></thead>
        <tbody>${rows.length ? tableRows(rows.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE)) : `<tr><td colspan="8">${state.loaded ? "Nessun pagamento per i filtri selezionati." : "Attendere il caricamento dei pagamenti."}</td></tr>`}</tbody>
      </table></div>
      ${state.loaded ? `<div class="payments-archive-footer"><div>${rows.length} movimenti · ${totalMarkup(rows, "Totale elenco filtrato")}</div><div>
        <button class="mini-btn" data-payments-archive-page="-1" ${state.page === 0 ? "disabled" : ""}>Precedente</button>
        <span>Pagina ${state.page + 1} di ${pages}</span>
        <button class="mini-btn" data-payments-archive-page="1" ${state.page + 1 >= pages ? "disabled" : ""}>Successiva</button>
      </div></div>` : ""}
    </div>`;
  }

  function paint() {
    if (appState.currentView !== "payments") return;
    const host = document.querySelector("section.view.active [data-payments-archive]");
    if (host) host.innerHTML = panel(); // The payment and billing forms stay mounted.
  }

  async function refresh() {
    if (!allowed()) throw new Error("Accesso ai pagamenti non abilitato");
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await fetch("/api/payments-archive", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload.payments)) throw new Error(payload.error || "Elenco pagamenti non disponibile");
        state.rows = payload.payments;
        state.loaded = true;
        state.loadedAt = payload.loaded_at;
        state.error = "";
      } catch (error) {
        state.error = error.message || "Aggiornamento pagamenti non riuscito";
        throw error;
      } finally {
        pending = null;
        paint();
      }
    })();
    paint();
    return pending;
  }

  function printMarkup(rows) {
    return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Pagamenti da incassare - MMS</title>
      <style>@page{size:A4 portrait;margin:12mm}body{font:11px Arial,sans-serif;color:#111}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{padding:7px 5px;border-bottom:1px solid #bbb;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}.payments-amount{text-align:right;white-space:nowrap}th{background:#eee}tfoot{display:table-row-group}</style>
      </head><body><h1>MMS Studio — Pagamenti da incassare</h1><p>Situazione aggiornata al ${html(new Date(state.loadedAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" }))} · ${rows.length} movimenti</p>
      ${totalMarkup(rows, "Totale da incassare")}<table><thead><tr><th>Cliente</th><th>Ordine</th><th>Tipo</th><th>Importo</th><th>Scadenza</th></tr></thead>
      <tbody>${rows.length ? tableRows(rows, true) : '<tr><td colspan="5">Nessun pagamento da incassare.</td></tr>'}</tbody></table></body></html>`;
  }

  async function printUnpaid() {
    if (state.printing) return;
    state.printing = true;
    paint();
    try {
      await refresh(); // Never print an old cache after a failed refresh.
      const frame = document.createElement("iframe");
      frame.title = "Stampa pagamenti da incassare";
      frame.style.cssText = "position:fixed;width:1px;height:1px;border:0;left:-10000px;top:0";
      frame.addEventListener("load", () => {
        frame.contentWindow.addEventListener("afterprint", () => frame.remove(), { once: true });
        frame.contentWindow.focus();
        frame.contentWindow.print();
      }, { once: true });
      frame.srcdoc = printMarkup(sorted(state.rows.filter((row) => !paid(row))));
      document.body.appendChild(frame);
    } catch (error) {
      state.error = `Stampa non preparata: ${error.message}`;
    } finally {
      state.printing = false;
      paint();
    }
  }

  window.mmsApplyPaymentArchiveSearch = function (query) {
    if (state.query !== query) state.page = 0;
    state.query = query;
    paint();
  };

  const baseRender = renderPayments;
  renderPayments = function renderPaymentsWithArchive() {
    const markup = baseRender();
    if (appState.currentView !== "payments" || !allowed()) return markup;
    return markup.replace("Scegli un ordine, registra acconti o saldo e scarica il file per il commercialista.",
      "Controlla tutti i pagamenti, filtra gli incassi e stampa la lista dei da pagare.")
      .replace('<div class="layout-2">', `<div class="surface payments-archive" data-payments-archive>${panel()}</div><div class="layout-2">`);
  };

  const baseNavigate = navigate;
  navigate = function navigateWithPaymentsArchive(view, orderId) {
    const result = baseNavigate(view, orderId);
    if (view === "payments" && allowed()) void refresh().catch(() => {});
    return result;
  };

  const baseSave = savePaymentDraftForSelectedOrder;
  savePaymentDraftForSelectedOrder = async function savePaymentWithArchiveRefresh() {
    const result = await baseSave();
    if (allowed()) await refresh().catch(() => {});
    return result;
  };

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-payments-archive-filter], [data-payments-archive-page], [data-payments-archive-print], [data-payments-archive-refresh], [data-payments-archive-open]");
    if (!button || button.disabled) return;
    if (button.hasAttribute("data-payments-archive-filter")) { state.filter = button.dataset.paymentsArchiveFilter; state.page = 0; paint(); }
    if (button.hasAttribute("data-payments-archive-page")) { state.page = Math.max(0, state.page + Number(button.dataset.paymentsArchivePage)); paint(); }
    if (button.hasAttribute("data-payments-archive-refresh")) void refresh().catch(() => {});
    if (button.hasAttribute("data-payments-archive-print")) void printUnpaid();
    if (button.hasAttribute("data-payments-archive-open")) {
      appState.paymentOrderId = Number(button.dataset.paymentsArchiveOpen);
      appState.selectedOrderId = appState.paymentOrderId;
      appState.paymentLoadedOrderDbId = null;
      appState.billingLoadedClientId = null;
      resetPaymentDraft(false);
      navigate("payments", appState.paymentOrderId);
      document.querySelector("section.view.active [data-new-payment]")?.closest(".surface")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  setInterval(() => {
    if (!document.hidden && appState.currentView === "payments" && !appState.busy && allowed()) void refresh().catch(() => {});
  }, 30000);
  window.addEventListener("mms-auth-profile", () => {
    if (!allowed()) { state.rows = []; state.loaded = false; state.loadedAt = ""; }
    if (appState.currentView === "payments" && allowed()) void refresh().catch(() => {});
  });

  const style = document.createElement("style");
  style.textContent = ".payments-archive{margin-bottom:20px}.payments-archive-totals,.payments-archive-filters,.payments-archive-footer{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:16px 0}.payments-archive-totals>div{background:#f5f5f5;padding:14px;border-radius:12px}.payments-archive-filters [aria-pressed=true]{background:#202b39;color:#fff}.payments-archive-table{overflow:auto}.payments-archive .payments-amount{white-space:nowrap;font-weight:700}.payments-archive-footer{justify-content:space-between}.payments-archive-footer button{margin:0 6px}.payments-archive button:disabled{opacity:.5;cursor:default}";
  document.head.appendChild(style);
})();

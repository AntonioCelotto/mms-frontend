(function () {
  function html(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatHours(value) {
    const hours = Math.max(0, Number(value || 0) / 3600000);
    return `${hours.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} h`;
  }

  function rows(orderId) {
    if (typeof calendarWorklogAllTasks !== "function" || typeof calendarWorklogRead !== "function") return [];
    const logs = calendarWorklogRead() || {};
    return calendarWorklogAllTasks()
      .map((row) => ({ ...row, log: logs[row.taskId] }))
      .filter((row) => row.log && (!orderId || Number(row.orderId) === Number(orderId)))
      .sort((a, b) => String(b.log.finishedAt || b.log.updatedAt || "").localeCompare(String(a.log.finishedAt || a.log.updatedAt || "")));
  }

  function plannedHours(task) {
    const value = task?.estimated_hours || task?.estimatedHours || task?.hours || "";
    return typeof value === "number" ? `${String(value).replace(".", ",")} h` : String(value || "-");
  }

  function owner(task) {
    if (typeof calendarWorklogAssignee === "function") return calendarWorklogAssignee(task);
    return String(task?.owner || task?.team || "Non assegnato").split(" - ").pop();
  }

  function historyPanel(orderId) {
    const items = rows(orderId);
    return `
      <div class="surface worklog-history-panel">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>${orderId ? "Storico lavorazioni ordine" : "Storico lavorazioni"}</h3>
              <p>Tempi effettivi e note finali, utili per stimare lavorazioni simili.</p>
            </div>
            <div class="ghost-pill">${items.length} registrazioni</div>
          </div>
          <div class="worklog-history-table">
            <table>
              <thead><tr><th>Ordine</th><th>Lavorazione</th><th>Operatore</th><th>Previste</th><th>Effettive</th><th>Stato</th><th>Note finali</th></tr></thead>
              <tbody>
                ${items.length ? items.slice(0, 100).map((row) => `
                  <tr>
                    <td>#${html(row.orderId)}</td>
                    <td><strong>${html(row.task?.name || row.task?.task_name || "Task")}</strong><div class="muted">${html(row.task?.phase || row.task?.task_phase || "Lavorazione")}</div></td>
                    <td>${html(owner(row.task))}</td>
                    <td>${html(plannedHours(row.task))}</td>
                    <td>${formatHours(row.log.elapsedMs)}</td>
                    <td><span class="table-status ${String(row.log.status).toLowerCase().includes("complet") ? "done" : "progress"}">${html(row.log.status)}</span></td>
                    <td>${html(row.log.notes || "-")}</td>
                  </tr>
                `).join("") : `<tr><td colspan="7"><div class="empty-state">Nessuna lavorazione registrata.</div></td></tr>`}"}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  if (typeof renderAI === "function") {
    const baseRenderAIWorklogHistory = renderAI;
    renderAI = function renderAIWithWorklogHistory() {
      const output = baseRenderAIWorklogHistory.apply(this, arguments);
      return output.replace("</section>", `${historyPanel()}
      </section>`);
    };
  }

  if (typeof renderOrderDetail === "function") {
    const baseRenderOrderDetailWorklogHistory = renderOrderDetail;
    renderOrderDetail = function renderOrderDetailWithWorklogHistory() {
      const output = baseRenderOrderDetailWorklogHistory.apply(this, arguments);
      const orderId = appState.selectedOrderId;
      return output.replace("</section>", `${historyPanel(orderId)}
      </section>`);
    };
  }

  const style = document.createElement("style");
  style.textContent = ".worklog-history-panel{margin-top:16px}.worklog-history-table{overflow-x:auto}.worklog-history-table td{vertical-align:top;max-width:340px}";
  document.head.appendChild(style);
})();
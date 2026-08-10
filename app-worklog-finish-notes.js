(function () {
  let pendingFinish = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function taskLabel(taskId) {
    if (typeof calendarWorklogAllTasks !== "function") return "questa lavorazione";
    const row = calendarWorklogAllTasks().find((item) => String(item.taskId) === String(taskId));
    return row?.task?.name || row?.task?.task_name || "questa lavorazione";
  }

  function ensureDialog() {
    let dialog = document.getElementById("worklog-finish-dialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "worklog-finish-dialog";
    dialog.className = "worklog-finish-dialog";
    dialog.innerHTML = `
      <form method="dialog" class="worklog-finish-card">
        <div data-finish-question>
          <h3>Lavorazione completata</h3>
          <p>La lavorazione e' finita. Vuoi aggiungere delle note che la riguardano?</p>
          <strong data-finish-task-label></strong>
          <div class="worklog-finish-actions">
            <button class="mini-btn" value="cancel" data-finish-no type="button">No</button>
            <button class="action-pill" value="default" data-finish-yes type="button">Si, aggiungi note</button>
          </div>
        </div>
        <div data-finish-notes hidden>
          <h3>Note di fine lavorazione</h3>
          <textarea class="field-value" data-finish-note rows="5" placeholder="Scrivi qui eventuali problemi, tempi o indicazioni utili"></textarea>
          <div class="worklog-finish-actions">
            <button class="mini-btn" data-finish-back type="button">Indietro</button>
            <button class="action-pill" data-finish-save type="button">Conferma fine</button>
          </div>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);
    const style = document.createElement("style");
    style.textContent = `
      .worklog-finish-dialog{width:min(520px,calc(100vw - 32px));border:0;border-radius:8px;padding:0;box-shadow:0 24px 70px rgba(20,30,27,.24)}
      .worklog-finish-dialog::backdrop{background:rgba(20,30,27,.45)}
      .worklog-finish-card{padding:24px;display:grid;gap:18px}
      .worklog-finish-card h3{margin:0 0 8px}
      .worklog-finish-card p{margin:0 0 12px;color:var(--muted);line-height:1.5}
      .worklog-finish-card textarea{width:100%;resize:vertical;margin-top:12px}
      .worklog-finish-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px;flex-wrap:wrap}
    `;
    document.head.appendChild(style);
    return dialog;
  }

  function closeDialog(dialog) {
    pendingFinish = null;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function completeFinish(baseUpdate, taskId, note, dialog) {
    baseUpdate(taskId, "finish");
    const stored = typeof calendarWorklogRead === "function" ? calendarWorklogRead() : {};
    if (stored[taskId]) {
      stored[taskId].notes = String(note || "").trim();
      if (typeof calendarWorklogWrite === "function") calendarWorklogWrite(stored);
      if (typeof window.worklogDatabaseSave === "function") window.worklogDatabaseSave(taskId, stored[taskId]);
    }
    closeDialog(dialog);
    if (typeof renderApp === "function") renderApp();
  }

  const baseCalendarWorklogUpdateFinishNotes = typeof calendarWorklogUpdate === "function" ? calendarWorklogUpdate : null;
  if (!baseCalendarWorklogUpdateFinishNotes) return;

  calendarWorklogUpdate = function calendarWorklogUpdateWithFinishNotes(taskId, action) {
    if (action !== "finish") return baseCalendarWorklogUpdateFinishNotes(taskId, action);
    const dialog = ensureDialog();
    pendingFinish = { taskId };
    dialog.querySelector("[data-finish-question]").hidden = false;
    dialog.querySelector("[data-finish-notes]").hidden = true;
    dialog.querySelector("[data-finish-note]").value = "";
    dialog.querySelector("[data-finish-task-label]").textContent = taskLabel(taskId);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  };

  document.addEventListener("click", (event) => {
    const dialog = event.target.closest?.("#worklog-finish-dialog");
    if (!dialog || !pendingFinish) return;
    if (event.target.closest("[data-finish-no]")) {
      completeFinish(baseCalendarWorklogUpdateFinishNotes, pendingFinish.taskId, "", dialog);
      return;
    }
    if (event.target.closest("[data-finish-yes]")) {
      dialog.querySelector("[data-finish-question]").hidden = true;
      dialog.querySelector("[data-finish-notes]").hidden = false;
      dialog.querySelector("[data-finish-note]").focus();
      return;
    }
    if (event.target.closest("[data-finish-back]")) {
      dialog.querySelector("[data-finish-question]").hidden = false;
      dialog.querySelector("[data-finish-notes]").hidden = true;
      return;
    }
    if (event.target.closest("[data-finish-save]")) {
      const note = dialog.querySelector("[data-finish-note]").value;
      completeFinish(baseCalendarWorklogUpdateFinishNotes, pendingFinish.taskId, note, dialog);
    }
  });
})();
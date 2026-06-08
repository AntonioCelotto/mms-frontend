function getFallbackAssignableAccounts() {
  return (fallbackAppData.accounts || []).map((account, index) => ({
    ...account,
    id: account.id || `external:${encodeURIComponent(account.name || `Dipendente ${index + 1}`)}`,
  }));
}

function ensureCalendarAssignableAccounts() {
  if (!Array.isArray(appData.accounts) || appData.accounts.length === 0) {
    appData.accounts = getFallbackAssignableAccounts();
  }
}

function parseAssignmentTarget(value) {
  const raw = String(value || "");
  if (!raw) {
    return { assignedUserId: null, externalSupplierName: "" };
  }

  if (raw.startsWith("external:")) {
    return {
      assignedUserId: null,
      externalSupplierName: decodeURIComponent(raw.slice("external:".length)),
    };
  }

  if (raw.startsWith("user:")) {
    const parsed = Number(raw.slice("user:".length));
    return { assignedUserId: Number.isFinite(parsed) ? parsed : null, externalSupplierName: "" };
  }

  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return { assignedUserId: parsed, externalSupplierName: "" };
  }

  return { assignedUserId: null, externalSupplierName: raw };
}

const baseRenderAppCalendarFix = renderApp;
renderApp = function renderAppCalendarFix() {
  ensureCalendarAssignableAccounts();
  baseRenderAppCalendarFix();
};

saveTaskAssignment = async function saveTaskAssignmentCalendarFix() {
  const taskId = Number(appState.assignmentDraft.taskId);
  const assignmentTarget = parseAssignmentTarget(appState.assignmentDraft.assignedUserId);

  if (!taskId || (!assignmentTarget.assignedUserId && !assignmentTarget.externalSupplierName)) {
    setFlashMessage("Seleziona task e dipendente");
    return;
  }

  setBusy(true);
  try {
    const calendarDay = getCalendarDayFromDate(appState.assignmentDraft.plannedDate);
    const plannedDateTime = formatPlannedDateTime(
      appState.assignmentDraft.plannedDate,
      appState.assignmentDraft.plannedTime
    );

    const response = await fetch("/api/assign-task", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: taskId,
        assigned_user_id: assignmentTarget.assignedUserId,
        external_supplier_name: assignmentTarget.externalSupplierName || null,
        planned_date: plannedDateTime || null,
        calendar_day_label: calendarDay !== "Da pianificare" ? calendarDay : null,
        notes: "Assegnazione aggiornata dalla UI",
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Assegnazione non riuscita");
    }

    await refreshBootstrap();
    ensureCalendarAssignableAccounts();
    setFlashMessage("Assegnazione calendario salvata");
  } catch (error) {
    setFlashMessage(error.message || "Errore nell'assegnazione");
  } finally {
    appState.busy = false;
    renderApp();
  }
};

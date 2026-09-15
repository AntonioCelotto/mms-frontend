(function () {
  const RESET_MARKER = "mms_task_local_reset_20260909_2";
  const TASK_STORAGE_KEYS = [
    "mms_order_detail_edits_v1",
    "mms_order_task_plan_v1",
    "mms_calendar_worklog_v1",
  ];

  try {
    if (window.localStorage.getItem(RESET_MARKER) === "done") return;
    TASK_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    window.localStorage.setItem(RESET_MARKER, "done");
  } catch (error) {
    console.warn("Pulizia locale task non disponibile", error);
  }
})();

// One-time targeted cleanup for P-0837 (#1118) and P-0838 (#1119).
// Their stale browser drafts contained the old Materiale/Controllo finale
// rows even after the database was corrected. Preserve every other order.
(function () {
  const marker = "mms_task_local_reset_20260915_p0837_p0838_1";
  const storageKey = "mms_order_detail_edits_v1";
  try {
    if (window.localStorage.getItem(marker) === "done") return;
    const stored = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    delete stored[1118];
    delete stored[1119];
    window.localStorage.setItem(storageKey, JSON.stringify(stored));
    window.localStorage.setItem(marker, "done");
  } catch (error) {
    console.warn("Pulizia mirata task P-0837/P-0838 non disponibile", error);
  }
})();

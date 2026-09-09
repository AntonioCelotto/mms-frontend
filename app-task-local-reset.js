(function () {
  const RESET_MARKER = "mms_task_local_reset_20260909_1";
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

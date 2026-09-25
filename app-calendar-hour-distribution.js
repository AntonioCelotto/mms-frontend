(function () {
  // The server calculates these slots using all orders and all operators, even
  // when this account may only see its own tasks. The rows below are display
  // copies: editing or saving a task still uses its original database record.
  function distributedOrderTasks(source) {
    return Object.fromEntries(Object.entries(source || {}).map(([orderId, tasks]) => [
      orderId,
      (Array.isArray(tasks) ? tasks : []).flatMap((task) => {
        // An order detail reload replaces task objects, but it does not
        // replace the bootstrap's independent, server-calculated schedule.
        const saved = appData.calendarTaskSlots?.[String(task.id)];
        const matches = saved && (
          String(saved.time) === String(task.time || task.planned_date) &&
          String(saved.hours) === String(task.hours) &&
          String(saved.phase) === String(task.phase || task.task_phase) &&
          String(saved.assignedUserId) === String(task.assignedUserId || task.assigned_user_id || "") &&
          String(saved.dueDate) === String(task.dueDate || "") &&
          String(saved.state).toLowerCase() === String(task.state || task.status || "").toLowerCase() &&
          Number(saved.sequenceOrder || 99) === Number(task.sequenceOrder || 99)
        );
        const segments = Array.isArray(task.calendarSegments) && task.calendarSegments.length
          ? task.calendarSegments : matches ? saved.segments : [];
        if (!Array.isArray(segments) || !segments.length) return [task];
        return segments.map((segment, index) => ({
          ...task,
          time: segment.date,
          planned_date: segment.date,
          calendarDay: null,
          calendar_day_label: null,
          calendarSegmentIndex: index + 1,
          calendarSegmentCount: segments.length,
          calendarSegmentHours: segment.hours,
          calendarSegmentTimeLabel: segment.label,
          calendarDistributed: true,
        }));
      }),
    ]));
  }

  const baseRenderCalendarHourDistribution = typeof renderCalendar === "function" ? renderCalendar : null;
  if (!baseRenderCalendarHourDistribution) return;

  renderCalendar = function renderCalendarHourDistribution() {
    const original = appData.orderTasks;
    appData.orderTasks = distributedOrderTasks(original);
    try {
      return baseRenderCalendarHourDistribution();
    } finally {
      appData.orderTasks = original;
    }
  };

  if (document.getElementById("app")?.innerHTML) renderApp();
})();

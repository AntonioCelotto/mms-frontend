(function () {
  // The server calculates these slots using all orders and all operators, even
  // when this account may only see its own tasks. The rows below are display
  // copies: editing or saving a task still uses its original database record.
  function distributedOrderTasks(source) {
    return Object.fromEntries(Object.entries(source || {}).map(([orderId, tasks]) => [
      orderId,
      (Array.isArray(tasks) ? tasks : []).flatMap((task) => {
        // Order detail and draft edits replace task objects and normalize some
        // fields (including sequenceOrder). The bootstrap schedule is keyed by
        // persisted task ID and remains authoritative until the next refresh.
        const saved = appData.calendarTaskSlots?.[String(task.id)];
        const segments = Array.isArray(saved?.segments) && saved.segments.length
          ? saved.segments : task.calendarSegments;
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

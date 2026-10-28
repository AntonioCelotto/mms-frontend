(function () {
  // Compatibility asset for existing pages. Daily segment expansion now belongs
  // exclusively to taskRows() in app-calendar-week-navigation.js. That renderer
  // reads calendarTaskSlots and builds cards without changing appData.orderTasks.
  // Do NOT temporarily replace canonical tasks with daily copies: downstream
  // worklog panels and reports would count a task's full hours once per day.
})();

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const values = [
  [2877, "cartamodello", 22, "08:00–08:30", 1128],
  [2879, "taglio", 22, "08:30–09:30", 1128],
  [2878, "confezione", 22, "09:30–11:30", 1128],
  [2880, "controllo", 23, "11:30–12:00", 1128],
  [2881, "controllo", 23, "08:00–08:30", 1129],
];
const orderTasks = {};
const calendarTaskSlots = {};
for (const [id, phase, assignedUserId, label, orderId] of values) {
  const hours = label === "09:30–11:30" ? "2,0 h" : label === "08:30–09:30" ? "1,0 h" : "0,5 h";
  (orderTasks[orderId] ||= []).push({
    id, name: "Nuova task", phase, assignedUserId, hours,
    time: "2026-09-25", dueDate: "2026-09-25", state: "Da avviare",
    // The order editor may rebuild these fields before the next bootstrap.
    sequenceOrder: 0,
  });
  calendarTaskSlots[id] = {
    segments: [{ date: "2026-09-25", hours: Number(hours.replace(",", ".").split(" ")[0]), label }],
    sequenceOrder: phase === "controllo" ? 99 : 1,
  };
}
for (const scripts of [
  ["app-calendar-week-navigation.js"],
  ["app-calendar-week-navigation.js", "app-calendar-hour-distribution.js"],
]) {
  const context = vm.createContext({
    appState: { currentView: "calendar", calendarWeekStart: "2026-09-21", calendarFilters: { employee: "all", phase: "all" } },
    appData: {
      orderTasks, calendarTaskSlots,
      orders: [{ id: 1128, sourceQuoteNumber: "P-0847", client: "Cliente 847" },
        { id: 1129, sourceQuoteNumber: "P-0848", client: "Cliente 848" }],
      accounts: [{ id: 22, name: "Eleonora" }, { id: 23, name: "Rosmery" }],
    },
    document: { getElementById: () => ({ innerHTML: "" }), addEventListener() {}, head: { appendChild() {} } },
    window: { mmsAuthProfile: { access_profile: "admin" } },
    renderApp() {},
    renderCalendar() {},
    calendarOrderSyncEnsureOrderTasks() {},
    Date,
  });
  for (const script of scripts) {
    vm.runInContext(fs.readFileSync(path.join(root, script), "utf8"), context, { filename: script });
  }
  const html = context.renderCalendar();
  for (const [, , , label] of values) {
    assert.match(html, new RegExp(`<span class="calendar-event-time">${label}</span>`));
  }
  assert.equal((html.match(/class="calendar-event-time"/g) || []).length, 5);
  assert.equal((html.match(/P-0847 - Nuova task/g) || []).length, 4);
  assert.equal((html.match(/P-0848 - Nuova task/g) || []).length, 1);
  assert.deepEqual(orderTasks[1128].map((task) => task.sequenceOrder), [0, 0, 0, 0]);
}
console.log("Calendar intervals for 847 and 848 survive order reloads with either rendering path.");

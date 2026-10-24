const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync("app-order-enhancements.js", "utf8");
const base = "https://fzdqemzowxjuotqalaol.supabase.co/storage/v1/object/sign/order-attachments/orders/1164/photo.jpg";
const signed = (expiry) => `${base}?token=e30.${Buffer.from(JSON.stringify({ exp: expiry / 1000 })).toString("base64url")}.signature`;
const node = (dataset = {}) => ({ dataset, events: {}, innerHTML: "", textContent: "",
  addEventListener(event, callback) { this.events[event] = callback; }, querySelectorAll() { return []; } });

function fixture() {
  let now = Date.parse("2026-10-24T10:00:00Z");
  let reads = 0;
  let renders = 0;
  let response = async () => ({ ok: true, json: async () => ({ attachments: [photo(signed(now + 3600000))] }) });
  let timers = [];
  const order = { id: 1143, db_id: 1164 };
  const gallery = node();
  const count = node();
  const queries = new Map([["[data-order-attachment-gallery]", gallery], ["[data-order-attachment-count]", count]]);
  const buttons = [];
  const images = [];
  const opened = [];
  const downloads = [];
  const context = {
    appState: { currentView: "order-detail", selectedOrderId: 1143, orderAttachments: {},
      draftOrder: { note: "Non perdere queste modifiche" } },
    getSelectedOrder: () => order, navigate() {}, saveDraftOrder() {}, renderApp() { renders++; },
    setFlashMessage(message) { context.flash = message; },
    URL, atob, console, Date: class extends Date { static now() { return now; } },
    setTimeout(callback, delay) { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeout(timer) { timers = timers.filter((item) => item !== timer); },
    document: {
      hidden: false, events: {},
      addEventListener(event, callback) { this.events[event] = callback; },
      querySelector: (selector) => queries.get(selector) || null,
      querySelectorAll(selector) {
        if (selector === "[data-attachment-open], [data-attachment-download]") return buttons;
        if (selector === "[data-attachment-image='order']") return images;
        return [];
      },
      body: { appendChild() {} },
      createElement: () => ({ click() { downloads.push(this.href); }, remove() {} }),
    },
    window: { open() { const popup = { opener: {}, location: { replace(url) { popup.url = url; } }, close() { popup.closed = true; } }; opened.push(popup); return popup; } },
    fetch: async (path, options) => {
      reads++;
      assert.equal(path, "/api/list-attachments?order_id=1164", "Use database ID, not display ID");
      assert.equal(options.cache, "no-store");
      return response();
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, order, gallery, count, buttons, images, opened, downloads,
    now: () => now, advance(ms) { now += ms; }, reads: () => reads, renders: () => renders,
    respond(fn) { response = fn; }, timers: () => timers,
    remember(url) { context.appState.orderAttachments[1143] = [photo(url)]; context.appState.loadedOrderAttachmentIds[1143] = true; },
  };
}

function photo(url) { return { id: 81, name: "photo.jpg", url, mime_type: "image/jpeg", persisted: true, size: 42 }; }

test("Expired private links are never rendered, but local and valid photos are unchanged", () => {
  const f = fixture();
  const { context: c } = f;
  const old = photo(signed(f.now() - 1000));
  assert.equal(c.attachmentNeedsRefresh(old), true);
  assert.doesNotMatch(c.renderAttachmentCards([old], "order"), /\bsrc=/);
  assert.match(c.renderAttachmentCards([photo(signed(f.now() + 3600000))], "order"), /\bsrc=/);
  assert.equal(c.attachmentNeedsRefresh({ localUrl: "blob:local-preview" }), false);
  assert.equal(c.attachmentNeedsRefresh({ url: "data:image/jpeg;base64,YQ==" }), false);
  assert.equal(c.attachmentNeedsRefresh(photo(`${base}?token=malformed`)), true);
});

test("Renewal shares one request, changes only the gallery, and preserves draft fields", async () => {
  const f = fixture();
  const { context: c } = f;
  f.remember(signed(f.now() - 1000));
  let release;
  f.respond(() => new Promise((resolve) => { release = resolve; }));
  const first = c.loadPersistedOrderAttachments(1164, false, 1143);
  const second = c.loadPersistedOrderAttachments(1164, true, 1143);
  assert.equal(f.reads(), 1);
  release({ ok: true, json: async () => ({ attachments: [photo(signed(f.now() + 3600000))] }) });
  await Promise.all([first, second]);
  assert.equal(c.attachmentNeedsRefresh(c.appState.orderAttachments[1143][0]), false);
  assert.match(f.gallery.innerHTML, /src=/);
  assert.equal(f.count.textContent, "1 foto salvate");
  assert.equal(f.renders(), 0, "Never redraw the order form on link renewal");
  assert.equal(c.appState.draftOrder.note, "Non perdere queste modifiche");
  await c.loadPersistedOrderAttachments(1164, false, 1143);
  assert.equal(f.reads(), 1, "Do not regenerate valid links on every render");
});

test("A visible gallery renews one minute before expiry; background tabs do not poll", async () => {
  const f = fixture();
  f.remember(signed(f.now() + 3600000));
  f.context.scheduleAttachmentRefresh();
  assert.equal(f.timers()[0].delay, 3540000);
  f.advance(3540000);
  f.timers()[0].callback();
  await new Promise(setImmediate);
  assert.equal(f.reads(), 1);
  f.context.document.hidden = true;
  f.context.document.events.visibilitychange();
  assert.equal(f.timers().length, 0);
  f.advance(3600000);
  f.context.document.hidden = false;
  f.context.document.events.visibilitychange();
  await new Promise(setImmediate);
  assert.equal(f.reads(), 2, "Renew when returning after expiry");
});

test("Opening and downloading a stale photo uses a fresh link and no stale URL", async () => {
  for (const action of ["attachmentOpen", "attachmentDownload"]) {
    const f = fixture();
    f.remember(signed(f.now() - 1000));
    const button = node({ [action]: "order", attachmentIndex: "0" });
    f.buttons.push(button);
    f.context.attachAttachmentCardEvents();
    const clicked = button.events.click();
    if (action === "attachmentOpen") assert.equal(f.opened.length, 1, "Popup created within user gesture");
    await clicked;
    assert.equal(f.reads(), 1);
    const url = action === "attachmentOpen" ? f.opened[0].url : f.downloads[0];
    assert.equal(url, signed(f.now() + 3600000));
    if (action === "attachmentOpen") assert.equal(f.opened[0].opener, null);
  }
});

test("Photo errors retry once, and concurrent broken thumbnails share one renewal", async () => {
  const f = fixture();
  f.remember(signed(f.now() + 3600000));
  const first = node({ attachmentIndex: "0" });
  f.images.push(first);
  f.context.attachAttachmentCardEvents();
  first.events.error();
  first.events.error();
  await new Promise(setImmediate);
  assert.equal(f.reads(), 1);
  const refreshed = node({ attachmentIndex: "0" });
  f.images.splice(0, 1, refreshed);
  f.context.attachAttachmentCardEvents();
  refreshed.events.error();
  await new Promise(setImmediate);
  assert.equal(f.reads(), 1, "A failed replacement must not start a retry loop");
  refreshed.events.load();
  refreshed.events.error();
  await new Promise(setImmediate);
  assert.equal(f.reads(), 2, "A later independent failure after success can recover");
});

test("401/403/503 and malformed responses preserve data and do not repeatedly retry", async () => {
  for (const status of [401, 403, 503, "malformed"]) {
    const f = fixture();
    const expired = signed(f.now() - 1000);
    f.remember(expired);
    f.respond(async () => status === "malformed" ? { ok: true, json: async () => ({}) } : { ok: false, status });
    await assert.rejects(f.context.loadPersistedOrderAttachments(1164, false, 1143));
    await f.context.loadPersistedOrderAttachments(1164, false, 1143);
    assert.equal(f.reads(), 1);
    assert.equal(f.context.appState.orderAttachments[1143][0].url, expired);
    assert.equal(f.context.appState.loadingOrderAttachmentIds[1143], false);
    assert.equal(f.renders(), 0);
    const button = node({ attachmentOpen: "order", attachmentIndex: "0" });
    f.buttons.push(button);
    f.context.attachAttachmentCardEvents();
    await button.events.click();
    assert.equal(f.opened[0].closed, true);
    assert.equal(f.opened[0].url, undefined, "Never navigate to an expired link after renewal failure");
  }
});

test("Late responses stay with their original order when the user switches orders", async () => {
  const f = fixture();
  f.remember(signed(f.now() - 1000));
  let release;
  f.respond(() => new Promise((resolve) => { release = resolve; }));
  const request = f.context.loadPersistedOrderAttachments(1164, true, 1143);
  f.order.id = 1199;
  f.order.db_id = 1220;
  release({ ok: true, json: async () => ({ attachments: [photo(signed(f.now() + 3600000))] }) });
  await request;
  assert.equal(f.gallery.innerHTML, "");
  assert.equal(f.context.appState.orderAttachments[1199], undefined);
  assert.equal(f.context.appState.orderAttachments[1143].length, 1);
});

test("A server response containing an expired replacement is rejected without a refresh loop", async () => {
  const f = fixture();
  const expired = signed(f.now() - 1000);
  f.remember(expired);
  f.respond(async () => ({ ok: true, json: async () => ({ attachments: [photo(expired)] }) }));
  await assert.rejects(f.context.loadPersistedOrderAttachments(1164, false, 1143), /Collegamento foto/);
  await f.context.loadPersistedOrderAttachments(1164, false, 1143);
  assert.equal(f.reads(), 1);
  assert.equal(f.gallery.innerHTML, "");
});

test("Renewal keeps pending quote photos and still works with the production normalizer", async () => {
  const f = fixture();
  f.remember(signed(f.now() - 1000));
  const production = fs.readFileSync("app-order-completion-fix-v2.js", "utf8");
  vm.runInContext(production.slice(production.indexOf("function orderFlowNormalizeAttachment"), production.indexOf("async function orderFlowInventoryIdForSku")), f.context);
  f.context.appState.orderAttachments[1143].push({ name: "local.jpg", localUrl: "blob:pending", fromQuote: true, persisted: false });
  await f.context.loadPersistedOrderAttachments(1164, false, 1143);
  assert.equal(f.context.appState.orderAttachments[1143].length, 2);
  assert.equal(f.context.attachmentNeedsRefresh(f.context.appState.orderAttachments[1143][0]), false);
  assert.equal(f.context.appState.orderAttachments[1143][1].localUrl, "blob:pending");
});

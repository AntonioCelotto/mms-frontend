(function () {
  // Only shown to an authenticated administrator who opens the diagnostic URL.
  // Reads the current page and a fresh bootstrap; never saves or edits tasks.
  if (new URLSearchParams(location.search).get("diagnostica-orari") !== "1") return;

  function showForProfile(profile) {
    if (String(profile?.access_profile || "").toLowerCase() !== "admin" ||
        document.querySelector('[aria-label="Diagnostica orari task"]')) return;

  const ids = ["2877", "2879", "2878", "2880", "2881"];
  const panel = document.createElement("aside");
  panel.setAttribute("aria-label", "Diagnostica orari task");
  panel.style.cssText = "position:fixed;z-index:120;top:16px;right:16px;width:min(450px,calc(100vw - 32px));max-height:75vh;overflow:auto;padding:16px;background:#fff;color:#111827;border:2px solid #2563eb;border-radius:10px;box-shadow:0 12px 36px #0003;font:14px/1.5 system-ui,sans-serif";
  const heading = document.createElement("strong");
  heading.textContent = "Verifica orari 847 / 848 (sola lettura)";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Rileggi orari";
  button.style.cssText = "display:block;margin:10px 0;padding:7px 12px;cursor:pointer";
  const result = document.createElement("pre");
  result.style.cssText = "white-space:pre-wrap;word-break:break-word;margin:0;font:12px/1.5 ui-monospace,monospace";
  panel.append(heading, button, result);
  document.body.appendChild(panel);

  function label(source, id) {
    const segments = source?.calendarTaskSlots?.[id]?.segments;
    return Array.isArray(segments) && segments.length
      ? segments.map((segment) => segment.label || "senza etichetta").join(" / ") : "assente";
  }

  async function inspect() {
    button.disabled = true;
    result.textContent = "Lettura in corso…";
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      if (!response.ok) throw new Error(`Risposta server ${response.status}`);
      const server = await response.json();
      const browser = typeof appData === "object" ? appData : {};
      const version = document.querySelector('script[src*="app-calendar-week-navigation.js"]')?.src.split("?")[1] || "sconosciuta";
      result.textContent = `Versione calendario: ${version}\n` + ids.map((id) =>
        `${id} · server: ${label(server, id)}\n       pagina: ${label(browser, id)}`
      ).join("\n") + "\n\nPuoi inviare una foto di questo riquadro; non contiene password.";
    } catch (error) {
      result.textContent = `Verifica non riuscita: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  button.addEventListener("click", inspect);
  inspect();
  }

  // The authentication gate publishes the verified profile only after all
  // application modules finish loading. Listen for that event rather than
  // reading the profile during script evaluation.
  window.addEventListener("mms-auth-profile", (event) => showForProfile(event.detail?.profile));
  showForProfile(window.mmsAuthProfile);
})();

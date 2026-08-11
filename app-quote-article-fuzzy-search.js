(function () {
  function text(value) {
    return String(value ?? "").trim();
  }

  function html(value) {
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalized(value) {
    return text(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("it-IT")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function distance(left, right) {
    const a = normalized(left);
    const b = normalized(right);
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= b.length; j += 1) {
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      previous.splice(0, previous.length, ...current);
    }
    return previous[b.length];
  }

  function inventoryArticles() {
    return (Array.isArray(appData?.inventory) ? appData.inventory : []).filter(
      (item) => item && item.item_type === "articolo"
    );
  }

  function itemCode(item) {
    return text(item.mms_code || item.sku || item.supplier_material_code);
  }

  function score(item, query) {
    const needle = normalized(query);
    if (!needle) return 0;
    const name = normalized(item.name || item.product);
    const code = normalized(itemCode(item));
    if (name.includes(needle) || code.includes(needle)) return 100;
    const needleWords = needle.split(" ").filter(Boolean);
    const candidateWords = `${name} ${code}`.split(" ").filter(Boolean);
    let best = Infinity;
    needleWords.forEach((word) => {
      candidateWords.forEach((candidate) => {
        best = Math.min(best, distance(word, candidate));
      });
    });
    const tolerance = Math.max(1, Math.floor(Math.max(...needleWords.map((word) => word.length), 1) * 0.3));
    return best <= tolerance ? 80 - best : 0;
  }

  function closeResults(input) {
    input.parentElement?.querySelector("[data-quote-fuzzy-results]")?.remove();
  }

  function showResults(input) {
    closeResults(input);
    const query = text(input.value);
    if (query.length < 2) return;
    const matches = inventoryArticles()
      .map((item) => ({ item, score: score(item, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || text(a.item.name).localeCompare(text(b.item.name), "it"))
      .slice(0, 8);
    if (!matches.length) return;

    const results = document.createElement("div");
    results.className = "quote-fuzzy-results";
    results.dataset.quoteFuzzyResults = "true";
    results.innerHTML = matches
      .map(({ item }) => {
        const name = item.name || item.product || "Articolo";
        const code = itemCode(item);
        return `<button type="button" data-quote-fuzzy-choice="${html(name)}"><strong>${html(name)}</strong><span>${html(code || "Senza codice")}</span></button>`;
      })
      .join("");
    input.insertAdjacentElement("afterend", results);
  }

  function chooseResult(button) {
    const results = button.closest("[data-quote-fuzzy-results]");
    const input = results?.parentElement?.querySelector("[data-quote-article-search]");
    if (!input) return;
    input.value = button.dataset.quoteFuzzyChoice || "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    closeResults(input);
  }

  function ensureStyles() {
    if (document.getElementById("quote-article-fuzzy-styles")) return;
    const style = document.createElement("style");
    style.id = "quote-article-fuzzy-styles";
    style.textContent = `
      .quote-fuzzy-results{margin-top:6px;border:1px solid rgba(30,41,59,.16);background:#fff;max-height:260px;overflow:auto}
      .quote-fuzzy-results button{display:flex;width:100%;align-items:center;justify-content:space-between;gap:16px;border:0;border-bottom:1px solid rgba(30,41,59,.09);background:#fff;padding:10px 12px;text-align:left;cursor:pointer}
      .quote-fuzzy-results button:last-child{border-bottom:0}
      .quote-fuzzy-results button:hover,.quote-fuzzy-results button:focus{background:#f8fafc;outline:0}
      .quote-fuzzy-results strong{font-size:13px;color:#172033}
      .quote-fuzzy-results span{font-size:12px;color:#64748b;white-space:nowrap}
    `;
    document.head.appendChild(style);
  }

  document.addEventListener("input", (event) => {
    const input = event.target.closest?.("[data-quote-article-search]");
    if (input) showResults(input);
  });

  document.addEventListener("mousedown", (event) => {
    const button = event.target.closest?.("[data-quote-fuzzy-choice]");
    if (!button) return;
    event.preventDefault();
    chooseResult(button);
  });

  document.addEventListener("focusout", (event) => {
    const input = event.target.closest?.("[data-quote-article-search]");
    if (input) window.setTimeout(() => closeResults(input), 150);
  });

  ensureStyles();
})();

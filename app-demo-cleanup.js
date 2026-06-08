const DEMO_COPY_REPLACEMENTS = new Map([
  ["Frontend reale - base app", "Gestionale operativo"],
  ["FRONTEND REALE - BASE APP", "GESTIONALE OPERATIVO"],
  ["Una base concreta per portare il prototipo dentro un'app navigabile e pronta da estendere.", "Ordini, planning, materiali, clienti e pagamenti in un unico ambiente operativo."],
  ["Base desktop funzionante con navigazione reale, dati simulati coerenti e schermate collegate tra loro.", "Ambiente operativo collegato ai dati del gestionale."],
  ["La schermata che racconta il passaggio chiave: da preventivo confermato a ordine strutturato, classificato e pronto per il planning.", "Crea un ordine operativo partendo da dati cliente, materiali, reparto e scadenze."],
  ["La parte che nel foglio oggi non e' strutturata.", "Task generati per reparto e lavorazione."],
  ["Valore mostrato in demo", "Controlli operativi"],
  ["Qui si capisce il passaggio da foglio a sistema.", "Controlli utili per ridurre ricopiature e passaggi manuali."],
  ["La parte che rassicura il cliente.", "Elementi da validare prima dell'applicazione."],
  ["La demo rende chiaro chi puo' fare cosa.", "Regole operative per ruoli e accessi."],
  ["Come l'AI aiuta senza decidere da sola.", "Supporto AI con approvazione operatore."],
  ["Supervisione umana obbligatoria", "Approvazione operatore"],
  ["Mai autonomia completa nelle prime release", "AI sempre controllata"],
  ["La base dell'app mostra AI assistiva, non sostitutiva, in linea con il documento tecnico.", "I suggerimenti AI restano tracciabili e approvati da un operatore."],
  ["Cosa il cliente deve percepire appena entra.", "Priorita' operative della giornata."],
  ["Dal foglio operativo a una cabina di regia unica per ordini, reparti e consegne.", "Cabina di regia per ordini, reparti e consegne."],
  ["Questa base front-end trasforma il processo attuale in un'app navigabile, con una sola fonte dati e viste dedicate per chi coordina, produce o controlla i pagamenti.", "Il gestionale organizza ordini, reparti, task, materiali e pagamenti con una sola fonte dati."]
]);

const DEMO_ACCOUNT_MARKERS = [
  "cliente@portal.mms",
  "333 100200",
  "333 100210",
  "marta@stellatures.it",
  "nicola@mms.it",
  "rosmery@mms.it",
  "olga@mms.it",
  "samuele@mms.it",
  "admin@mms.it"
];

function replaceDemoTextInNode(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach((node) => {
    let value = node.nodeValue;
    DEMO_COPY_REPLACEMENTS.forEach((replacement, source) => {
      value = value.split(source).join(replacement);
    });
    node.nodeValue = value;
  });
}

function hideVisibleDemoAccounts(root) {
  if (typeof appState === "undefined" || appState.currentView !== "accounts") return;

  root.querySelectorAll("tbody tr").forEach((row) => {
    const text = row.textContent.toLowerCase();
    if (DEMO_ACCOUNT_MARKERS.some((marker) => text.includes(marker.toLowerCase()))) {
      row.remove();
    }
  });
}

function removeDemoFallbackAccounts() {
  if (typeof fallbackAppData !== "undefined" && Array.isArray(fallbackAppData.accounts)) {
    fallbackAppData.accounts = [];
  }

  if (typeof getFallbackAssignableAccounts === "function") {
    getFallbackAssignableAccounts = function getNoDemoFallbackAccounts() {
      return [];
    };
  }
}

function applyDemoCleanup() {
  const root = document.getElementById("app");
  if (!root) return;

  replaceDemoTextInNode(root);
  hideVisibleDemoAccounts(root);
}

removeDemoFallbackAccounts();

const baseRenderAppDemoCleanup = renderApp;
renderApp = function renderAppDemoCleanup() {
  baseRenderAppDemoCleanup();
  applyDemoCleanup();
};

applyDemoCleanup();

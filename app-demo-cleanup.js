const DEMO_COPY_REPLACEMENTS = new Map([
  ["Frontend reale - base app", "Gestionale operativo"],
  ["FRONTEND REALE - BASE APP", "GESTIONALE OPERATIVO"],
  ["Una base concreta per portare il prototipo dentro un'app navigabile e pronta da estendere.", "Ordini, planning, materiali, clienti e pagamenti in un unico ambiente operativo."],
  ["Base desktop funzionante con navigazione reale, dati simulati coerenti e schermate collegate tra loro.", "Ambiente operativo collegato ai dati del gestionale."],
  ["Stato sviluppo", "Stato ambiente"],
  ["La schermata che racconta il passaggio chiave: da preventivo confermato a ordine strutturato, classificato e pronto per il planning.", "Crea un ordine operativo partendo da dati cliente, materiali, reparto e scadenze."],
  ["La parte che nel foglio oggi non e' strutturata.", "Task generati per reparto e lavorazione."],
  ["Valore mostrato in demo", "Controlli operativi"],
  ["Qui si capisce il passaggio da foglio a sistema.", "Controlli utili per ridurre ricopiature e passaggi manuali."],
  ["La parte che rassicura il cliente.", "Elementi da validare prima dell'applicazione."],
  ["La demo rende chiaro chi puo' fare cosa.", "Regole operative per ruoli e accessi."],
  ["La demo mette in evidenza gli ordini da completare prima di promettere la consegna.", "Segnalazione operativa sugli ordini da completare prima di promettere la consegna."],
  ["Come l'AI aiuta senza decidere da sola.", "Supporto AI con approvazione operatore."],
  ["Supervisione umana obbligatoria", "Approvazione operatore"],
  ["Mai autonomia completa nelle prime release", "AI sempre controllata"],
  ["La base dell'app mostra AI assistiva, non sostitutiva, in linea con il documento tecnico.", "I suggerimenti AI restano tracciabili e approvati da un operatore."],
  ["Cosa il cliente deve percepire appena entra.", "Priorita' operative della giornata."],
  ["Dal foglio operativo a una cabina di regia unica per ordini, reparti e consegne.", "Cabina di regia per ordini, reparti e consegne."],
  ["Questa base front-end trasforma il processo attuale in un'app navigabile, con una sola fonte dati e viste dedicate per chi coordina, produce o controlla i pagamenti.", "Il gestionale organizza ordini, reparti, task, materiali e pagamenti con una sola fonte dati."],
  ["660 ordini storici rilevati", "Ordini caricati: aggiornamento in corso"],
  ["Ultimo aggiornamento 09:12", "Dati aggiornati"],
  ["Filtro: settimana corrente", "Filtro: periodo attivo"],
  ["Le lavorazioni che oggi spostano davvero il planning.", "Ordini da presidiare per avanzamento e consegne."],
  ["2 richiedono conferma da laboratorio esterno", "Ordini con priorita' da presidiare"],
  ["3 interni, 2 legati a fornitori esterni", "Ritardi da monitorare"],
  ["con media evasione di 4,2 giorni", "ordini completati nel periodo"],
  ["Wizard semplificato", "Inserimento operativo"],
  ["Crea task", "Prepara task"],
  ["Step 1", "Fase 1"],
  ["Step 2", "Fase 2"],
  ["Step 3", "Fase 3"],
  ["Step 4", "Fase 4"],
  ["Conferma preventivo", "Dati cliente"],
  ["Classifica righe", "Classificazione"],
  ["Genera task", "Task operativi"],
  ["Invia a planning", "Planning"],
  ["La parte che nel foglio oggi non e' strutturata.", "Task generati per reparto e lavorazione."],
  ["Niente ricopiature tra fogli", "Riduzione inserimenti doppi"],
  ["Un ordine nasce una volta sola e genera automaticamente la struttura operativa.", "L'ordine alimenta archivio, task, materiali e planning senza reinserimenti manuali."],
  ["Ogni reparto vede solo il suo", "Vista reparto ordinata"],
  ["La stessa base dati alimenta viste diverse senza duplicazione manuale.", "La stessa base dati alimenta viste diverse per coordinamento, produzione e amministrazione."],
  ["Conversazione guidata", "Analisi operativa"],
  ["Cosa approva l'operatore", "Controlli operatore"],
  ["Audit delle decisioni", "Tracciamento decisioni"],
  ["Preventivo #284", "Ordine selezionato"],
  ["Confidenza 87%", "Da verificare"],
  ["Durate iniziali", "Stime operative"],
  ["4 task creati", "Task proposti"],
  ["Cliente Portal", "Accesso cliente"],
  ["n/d", "Da completare"],
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

function updateOrderArchiveCount(root) {
  if (typeof appState === "undefined" || appState.currentView !== "orders") return;
  if (typeof appData === "undefined" || !Array.isArray(appData.orders)) return;

  const countText = `Ordini caricati: ${appData.orders.length}`;
  root.querySelectorAll(".ghost-pill").forEach((pill) => {
    const text = pill.textContent.trim();
    if (text === "Ordini caricati: aggiornamento in corso" || /ordini storici rilevati/i.test(text)) {
      pill.textContent = countText;
    }
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
  updateOrderArchiveCount(root);
  hideVisibleDemoAccounts(root);
}

removeDemoFallbackAccounts();

const baseRenderAppDemoCleanup = renderApp;
renderApp = function renderAppDemoCleanup() {
  baseRenderAppDemoCleanup();
  applyDemoCleanup();
};

applyDemoCleanup();

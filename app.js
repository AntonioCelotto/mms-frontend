const appState = {
  currentView: "dashboard",
  selectedOrderId: 284,
  search: "",
  busy: false,
  flashMessage: "",
  filters: {
    department: "all",
    status: "all",
    payment: "all",
    priority: "all",
  },
  calendarFilters: {
    employee: "all",
    phase: "all",
  },
  draftOrder: {
    client: "Stella Tures",
    category: "Sartoria",
    priority: "Express",
    deposit: "Ricevuto",
    department: "Interno + controllo commercio",
    orderDate: "20 gennaio 2026",
    estimatedDelivery: "29 gennaio 2026",
    warehouseLink: "Magazzino MMS attivo",
    note: "Confermare etichette e inviare foto prima della spedizione.",
  },
  draftMaterials: [
    {
      product_name: "Tessuto 100% cotone",
      source_type: "mms",
      delivery_status: "consegnato",
      warehouse_status_note: "Collegato a magazzino",
      preorder_note: "Ricerca materiale attiva",
    },
    {
      product_name: "Etichetta composizione",
      source_type: "cliente",
      delivery_status: "non_consegnato",
      warehouse_status_note: "Inserimento manuale",
      preorder_note: "Attendere consegna cliente",
    },
  ],
  clientDraft: {},
  accountDraft: {
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    role: "viewer",
    skills: "",
  },
  assignmentDraft: {
    taskId: "",
    assignedUserId: "",
    plannedDate: "",
    calendarDay: "Lunedi'",
  },
  inventorySearch: "",
};

const fallbackAppData = {
  metrics: {
    openOrders: 85,
    activeOrders: 43,
    toStart: 17,
    urgent: 7,
    delays: 5,
    openPayments: 39,
    paymentValue: "160k",
    activeTasks: 124,
    completedMonth: 52,
  },
  orders: [
    {
      id: 284,
      client: "Stella Tures",
      category: "Sartoria",
      department: "Sartoria interna",
      route: "Interno",
      priority: "Express",
      status: "In lavorazione",
      payment: "Acconto",
      eta: "29 gen 2026",
      files: 3,
      summary: "Canotta stone wash con controllo etichetta finale",
      notes: "Inviare foto prima della spedizione",
      customerWindow: "3-5 feb 2026",
      orderDate: "20 gennaio 2026",
      estimatedDelivery: "29 gennaio 2026",
      warehouseLinked: true,
      clientVisibility: "Il cliente puo' vedere avanzamento confezione e stato materiali.",
    },
    {
      id: 455,
      client: "Family First",
      category: "Commercio",
      department: "Commercio",
      route: "Interno",
      priority: "Standard",
      status: "Materiali in arrivo",
      payment: "Non pagato",
      eta: "31 gen 2026",
      files: 2,
      summary: "Fornitura e controllo materiali per capsule prodotto",
      notes: "Tessuto jersey non ancora ricevuto",
      customerWindow: "31 gen-2 feb 2026",
      orderDate: "22 gennaio 2026",
      estimatedDelivery: "31 gennaio 2026",
      warehouseLinked: true,
      clientVisibility: "Il cliente vede solo conferma disponibilita' e consegna prevista.",
    },
    {
      id: 510,
      client: "Virtu Maison",
      category: "Sartoria",
      department: "Sartoria esterna",
      route: "Esterno",
      priority: "Standard",
      status: "Stand by",
      payment: "Saldo 30 gg",
      eta: "2 feb 2026",
      files: 1,
      summary: "Lavorazione su laboratorio esterno con revisione interna",
      notes: "In attesa conferma disponibilita' Elisabetta",
      customerWindow: "2-6 feb 2026",
      orderDate: "23 gennaio 2026",
      estimatedDelivery: "2 febbraio 2026",
      warehouseLinked: false,
      clientVisibility: "Il cliente vede stato lavorazione esterna e revisione finale.",
    },
    {
      id: 599,
      client: "Paglioni",
      category: "Commercio",
      department: "Commercio",
      route: "Interno",
      priority: "Express",
      status: "Preparazione spedizione",
      payment: "Saldato",
      eta: "25 gen 2026",
      files: 4,
      summary: "Consegna materiali e foto prodotto",
      notes: "Spedizione gia' prenotata",
      customerWindow: "25 gen 2026",
      orderDate: "19 gennaio 2026",
      estimatedDelivery: "25 gennaio 2026",
      warehouseLinked: true,
      clientVisibility: "Il cliente vede materiale pronto e spedizione prenotata.",
    },
    {
      id: 601,
      client: "Wildeside",
      category: "Sartoria",
      department: "Sartoria interna",
      route: "Interno",
      priority: "Standard",
      status: "Taglio",
      payment: "Acconto",
      eta: "4 feb 2026",
      files: 1,
      summary: "Taglio e confezione capsule interna",
      notes: "Task regolare senza blocchi",
      customerWindow: "4-8 feb 2026",
      orderDate: "24 gennaio 2026",
      estimatedDelivery: "4 febbraio 2026",
      warehouseLinked: true,
      clientVisibility: "Il cliente puo' seguire taglio, confezione e controllo finale.",
    },
    {
      id: 621,
      client: "DM8 SRLS",
      category: "Commercio",
      department: "Commercio",
      route: "Interno",
      priority: "Standard",
      status: "Da avviare",
      payment: "Non pagato",
      eta: "7 feb 2026",
      files: 0,
      summary: "Ordine in attesa di conferma materiale e acconto",
      notes: "Serve sblocco amministrativo",
      customerWindow: "7-10 feb 2026",
      orderDate: "24 gennaio 2026",
      estimatedDelivery: "7 febbraio 2026",
      warehouseLinked: true,
      clientVisibility: "Il cliente vede ordine inserito ma non ancora avviato.",
    },
  ],
  seamstresses: [
    { name: "Eleonora", role: "Cartamodelli e taglio", completed: 7, hours: 31, efficiency: "92%" },
    { name: "Olga", role: "Confezione", completed: 6, hours: 34, efficiency: "89%" },
    { name: "Roberta", role: "Taglio part-time", completed: 4, hours: 15, efficiency: "95%" },
    { name: "Amel", role: "Confezione", completed: 5, hours: 28, efficiency: "87%" },
  ],
  departments: [
    {
      id: "interna",
      name: "Sartoria interna",
      activeOrders: 43,
      activeTasks: 74,
      load: 72,
      note: "3 task a rischio, 1 assenza segnalata",
    },
    {
      id: "esterna",
      name: "Sartoria esterna",
      activeOrders: 12,
      activeTasks: 18,
      load: 58,
      note: "2 conferme pendenti, 1 ritardo tessuti",
    },
    {
      id: "commercio",
      name: "Commercio",
      activeOrders: 30,
      activeTasks: 32,
      load: 64,
      note: "4 ordini senza ETA completa",
    },
  ],
  alerts: [
    {
      orderId: 510,
      title: "Ordine #510 - conferma laboratorio esterno",
      detail: "Manca la disponibilita' definitiva di Elisabetta per bloccare la consegna.",
    },
    {
      orderId: 455,
      title: "Ordine #455 - materiale mancante",
      detail: "Il tessuto jersey non e' ancora ricevuto. Rischio slittamento sul task taglio.",
    },
    {
      orderId: 284,
      title: "Ordine #284 - saldo non chiuso",
      detail: "Produzione quasi completata, ma pagamento ancora in stato acconto.",
    },
    {
      orderId: 621,
      title: "Commercio - ordini senza data completa",
      detail: "La demo mette in evidenza gli ordini da completare prima di promettere la consegna.",
    },
  ],
  payments: [
    {
      orderId: 284,
      client: "Stella Tures",
      mode: "Acconto ricevuto",
      detail: "Saldo prima consegna",
      due: "29 gen",
      state: "Da sollecitare",
    },
    {
      orderId: 510,
      client: "Virtu Maison",
      mode: "Saldo 30 gg",
      detail: "Cliente autorizzato",
      due: "2 mar",
      state: "Monitorare",
    },
    {
      orderId: 455,
      client: "Family First",
      mode: "Non pagato",
      detail: "Attesa acconto",
      due: "Prima avvio",
      state: "Blocco avvio",
    },
    {
      orderId: 599,
      client: "Paglioni",
      mode: "Saldato",
      detail: "Pronto evasione",
      due: "Confermato",
      state: "Ok chiusura",
    },
  ],
  orderTasks: {
    284: [
      { name: "Cartamodello canotta", phase: "Cartamodello", team: "Sartoria interna - Eleonora", hours: "3,0 h", time: "21 gen 08:00", state: "Completato", calendarDay: "Lunedi'" },
      { name: "Taglio tessuto", phase: "Taglio", team: "Sartoria interna - Roberta", hours: "2,0 h", time: "22 gen 08:00", state: "Completato", calendarDay: "Martedi'" },
      { name: "Confezione finale", phase: "Confezione", team: "Sartoria interna - Olga", hours: "8,0 h", time: "23 gen 08:00", state: "In corso", calendarDay: "Mercoledi'" },
      { name: "Controllo etichetta", phase: "Materiale", team: "Commercio - Coordinamento interno", hours: "0,5 h", time: "24 gen 11:00", state: "Da confermare", calendarDay: "Giovedi'" },
    ],
    455: [
      { name: "Ricezione jersey", phase: "Materiale", team: "Commercio - Fornitore", hours: "n/d", time: "In attesa", state: "Da confermare", calendarDay: "Martedi'" },
      { name: "Controllo materiali", phase: "Materiale", team: "Commercio - Team interno", hours: "1,0 h", time: "Dopo ricezione", state: "Da avviare", calendarDay: "Venerdi'" },
    ],
    510: [
      { name: "Prenotazione laboratorio", phase: "Confezione", team: "Sartoria esterna - Elisabetta", hours: "n/d", time: "Da confermare", state: "Stand by", calendarDay: "Giovedi'" },
      { name: "Revisione finale interna", phase: "Confezione", team: "Sartoria interna - Amel", hours: "3,0 h", time: "Dopo rientro", state: "Da avviare", calendarDay: "Giovedi'" },
    ],
  ],
  orderMaterials: {
    284: [
      { material: "Tessuto 100% cotone", source: "MMS", warehouse: "Disponibile in magazzino", delivery: "Consegnato", preorder: "Rinnovo rotolo 14 metri" },
      { material: "Tessuto costina per colli", source: "MMS", warehouse: "Disponibile in magazzino", delivery: "Consegnato", preorder: "Nessun riordino" },
      { material: "Etichetta composizione", source: "Cliente", warehouse: "Inserimento manuale", delivery: "Non consegnato", preorder: "Attendere invio cliente" },
    ],
    455: [
      { material: "Jersey capsule", source: "MMS", warehouse: "In arrivo da fornitore", delivery: "Non consegnato", preorder: "Ordine materiale aperto" },
      { material: "Pack accessori cliente", source: "Cliente", warehouse: "Inserimento manuale", delivery: "Consegnato", preorder: "Ricevuto in showroom" },
    ],
  ],
  orderTimeline: {
    284: [
      { date: "20 gen", title: "Ordine creato da preventivo", detail: "Confermato cliente e registrato acconto." },
      { date: "21 gen", title: "Task cartamodello assegnato", detail: "Pianificato su Eleonora dalle 08:00 alle 11:00." },
      { date: "22 gen", title: "Taglio completato", detail: "Task chiuso nei tempi previsti." },
      { date: "oggi", title: "Confezione in corso", detail: "Stimata fine giornata con controllo etichetta ancora aperto." },
    ],
    455: [
      { date: "oggi", title: "Ordine fermo in ricezione materiale", detail: "Serve arrivo jersey per proseguire." },
    ],
    510: [
      { date: "oggi", title: "Stand by su laboratorio", detail: "In attesa slot e conferma disponibilita'." },
    ],
  },
  clients: [
    {
      name: "Stella Tures",
      trust: "Affidabilita' alta",
      email: "produzione@stellatures.it",
      paymentRule: "Acconto + saldo pre-consegna",
      workType: "Sartoria premium e capsule a piccola tiratura",
      note: "Richiede foto prima di approvare la spedizione finale.",
      orders: [284, 250, 45],
      tags: ["Pagamenti puntuali", "Feedback rapido", "Lavorazioni interne frequenti"],
    },
    {
      name: "Virtu Maison",
      trust: "Affidabilita' medio alta",
      email: "operations@virtumaison.it",
      paymentRule: "Saldo 30 giorni",
      workType: "Sartoria esterna con verifica finale interna",
      note: "Gestione piu' elastica sui pagamenti, ma richiede conferme rapide.",
      orders: [510],
      tags: ["Laboratori esterni", "Clienti premium"],
    },
  ],
  calendar: [
    {
      day: "Lunedi'",
      date: "22 gennaio",
      slots: [
        { orderId: 284, phase: "Cartamodello", title: "Cartamodello", owner: "Eleonora", time: "08:00-11:00" },
        { orderId: 601, phase: "Taglio", title: "Revisione taglio", owner: "Roberta", time: "14:00-16:00" },
      ],
    },
    {
      day: "Martedi'",
      date: "23 gennaio",
      slots: [
        { orderId: 284, phase: "Taglio", title: "Taglio", owner: "Roberta", time: "08:00-10:00" },
        { orderId: 455, phase: "Cartamodello", title: "Campionatura", owner: "Samuele", time: "11:00-13:30" },
      ],
    },
    {
      day: "Mercoledi'",
      date: "24 gennaio",
      slots: [{ orderId: 284, phase: "Confezione", title: "Confezione", owner: "Olga", time: "08:00-17:00" }],
    },
    {
      day: "Giovedi'",
      date: "25 gennaio",
      slots: [
        { orderId: 510, phase: "Confezione", title: "Revisione interna", owner: "Amel", time: "09:00-12:00" },
        { orderId: 621, phase: "Cartamodello", title: "Etichette", owner: "Eleonora", time: "15:00-16:30" },
      ],
    },
    {
      day: "Venerdi'",
      date: "26 gennaio",
      slots: [
        { orderId: 455, phase: "Confezione", title: "Chiusura task", owner: "Olga", time: "08:30-11:30" },
        { orderId: 284, phase: "Confezione", title: "Controllo finale", owner: "Direzione", time: "12:00-12:30" },
      ],
    },
  ],
  inventory: [
    { sku: "MMS-TEX-001", product: "Tessuto 100% cotone", category: "Tessuti", available: "48 mt", reserved: "12 mt", status: "Disponibile", reorder: "Soglia ok" },
    { sku: "MMS-TEX-014", product: "Costina per colli", category: "Accessori", available: "9 mt", reserved: "3 mt", status: "Disponibile", reorder: "Preordine suggerito" },
    { sku: "MMS-ETI-008", product: "Etichetta composizione", category: "Etichette", available: "0", reserved: "0", status: "Da cliente", reorder: "Attesa consegna cliente" },
    { sku: "MMS-JER-021", product: "Jersey capsule", category: "Tessuti", available: "0", reserved: "10 mt", status: "In arrivo", reorder: "Ordine aperto a fornitore" },
  ],
  accounts: [
    { role: "Visualizzatore", name: "Marta Tures", phone: "333 1002001", email: "marta@stellatures.it", skills: "Vista lavorazione cliente, approvazioni" },
    { role: "Visualizzatore", name: "Nicola Bianchi", phone: "333 1002002", email: "nicola@mms.it", skills: "Controllo ordini, consultazione planning" },
    { role: "Visualizzatore", name: "Rosmery Diaz", phone: "333 1002003", email: "rosmery@mms.it", skills: "Confezione, avanzamento lavori" },
    { role: "Visualizzatore", name: "Olga Petrenko", phone: "333 1002004", email: "olga@mms.it", skills: "Confezione, controllo task" },
    { role: "Visualizzatore", name: "Samuele Gori", phone: "333 1002005", email: "samuele@mms.it", skills: "Cartamodello, taglio" },
    { role: "Visualizzatore", name: "Cliente Portal", phone: "n/d", email: "cliente@portal.mms", skills: "Vista lavorazione cliente" },
    { role: "Amministratore", name: "Antonio Celotto", phone: "333 1002100", email: "antonio@mms.it", skills: "Supervisione ordini, dashboard, modifiche" },
    { role: "Amministratore", name: "Matteo Rossi", phone: "333 1002101", email: "matteo@mms.it", skills: "Produzione, calendario, laboratori" },
    { role: "Amministratore", name: "Mara Abbracchio", phone: "333 1002102", email: "mara@mms.it", skills: "AI, preventivi, configurazioni" },
    { role: "Amministratore", name: "Admin MMS", phone: "333 1002103", email: "admin@mms.it", skills: "Permessi, magazzino, pagamenti" },
  ],
  aiFeed: [
    {
      type: "user",
      title: "Input ordine / brief",
      body:
        "Canotta stone wash con sporco giromanica, etichetta composizione, due pezzi, consegna rapida e approvazione foto prima di spedizione.",
    },
    {
      type: "ai",
      title: "Classificazione proposta",
      body:
        "Sartoria interna per cartamodello, taglio e confezione. Commercio per verifica etichetta e controllo finale allegati.",
    },
    {
      type: "ai",
      title: "Task suggeriti",
      body:
        "1. Cartamodello 3h. 2. Taglio 2h. 3. Confezione 8h. 4. Check etichetta 0,5h.",
    },
    {
      type: "ai",
      title: "Alert contestuale",
      body:
        "Meglio comunicare al cliente una finestra di 5-6 giorni oltre la data interna per assorbire eventuali ritardi sul controllo finale.",
    },
  ],
};

let appData = fallbackAppData;

function setBusy(value) {
  appState.busy = value;
  renderApp();
}

function setFlashMessage(message) {
  appState.flashMessage = message;
  renderApp();
  if (message) {
    window.setTimeout(() => {
      if (appState.flashMessage === message) {
        appState.flashMessage = "";
        renderApp();
      }
    }, 3000);
  }
}

async function refreshBootstrap() {
  const response = await fetch("/api/bootstrap");
  if (!response.ok) {
    throw new Error("Bootstrap non disponibile");
  }
  const payload = await response.json();
  if (payload && payload.orders && payload.orders.length) {
    appData = { ...fallbackAppData, ...payload };
    if (!appData.orders.some((order) => order.id === appState.selectedOrderId)) {
      appState.selectedOrderId = appData.orders[0].id;
    }
  }
}

async function saveDraftOrder() {
  const materials = appState.draftMaterials.filter((item) => item.product_name.trim());

  const departmentMap = {
    "interno + controllo commercio": "Sartoria interna",
    interno: "Sartoria interna",
    esterno: "Sartoria esterna",
    commercio: "Commercio",
  };
  const departmentKey = (appState.draftOrder.department || "").trim().toLowerCase();
  const department = departmentMap[departmentKey] || appState.draftOrder.department || "Sartoria interna";

  setBusy(true);
  try {
    const orderResponse = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: appState.draftOrder.client,
        category: appState.draftOrder.category,
        priority: appState.draftOrder.priority,
        department,
        order_date: appState.draftOrder.orderDate,
        estimated_delivery_date: appState.draftOrder.estimatedDelivery,
        warehouse_linked: (appState.draftOrder.warehouseLink || "").toLowerCase().includes("magazzino"),
        note: appState.draftOrder.note,
        client_visibility_note: "Cliente vede avanzamento base",
        deposit_status: appState.draftOrder.deposit,
      }),
    });
    if (!orderResponse.ok) {
      const error = await orderResponse.json().catch(() => ({}));
      throw new Error(error.error || "Salvataggio ordine non riuscito");
    }
    const created = await orderResponse.json();
    const orderId = created.order.id;

    await fetch(`/api/orders/${orderId}/materials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materials }),
    });

    await refreshBootstrap();
    appState.selectedOrderId = orderId;
    appState.currentView = "order-detail";
    setFlashMessage(`Ordine #${orderId} salvato correttamente`);
  } catch (error) {
    setFlashMessage(error.message || "Errore durante il salvataggio dell'ordine");
  } finally {
    appState.busy = false;
    renderApp();
  }
}

async function saveClientDraft() {
  const client = getClientForSelectedOrder();
  if (!client?.id) {
    setFlashMessage("Cliente non disponibile");
    return;
  }
  setBusy(true);
  try {
    const response = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: appState.clientDraft.email,
        phone: appState.clientDraft.phone,
        payment_terms: appState.clientDraft.paymentRule,
        notes: appState.clientDraft.note,
        visibility_enabled: !!appState.clientDraft.visibilityEnabled,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Salvataggio cliente non riuscito");
    }
    await refreshBootstrap();
    setFlashMessage("Cliente aggiornato");
  } catch (error) {
    setFlashMessage(error.message || "Errore nel salvataggio cliente");
  } finally {
    appState.busy = false;
    renderApp();
  }
}

async function registerPaymentForSelectedOrder() {
  const order = getSelectedOrder();
  if (!order?.id) return;
  setBusy(true);
  try {
    const response = await fetch(`/api/orders/${order.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payment_type: "saldo",
        status: "pagato",
        due_date: order.estimatedDelivery,
        paid_date: "oggi",
        notes: "Incasso registrato dalla UI",
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Registrazione pagamento non riuscita");
    }
    await refreshBootstrap();
    setFlashMessage(`Pagamento registrato per ordine #${order.id}`);
  } catch (error) {
    setFlashMessage(error.message || "Errore nella registrazione pagamento");
  } finally {
    appState.busy = false;
    renderApp();
  }
}

async function saveAccountDraft() {
  setBusy(true);
  try {
    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: appState.accountDraft.first_name,
        last_name: appState.accountDraft.last_name,
        phone: appState.accountDraft.phone,
        email: appState.accountDraft.email,
        role: appState.accountDraft.role,
        skills: appState.accountDraft.skills.split(",").map((item) => item.trim()).filter(Boolean),
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Creazione account non riuscita");
    }
    await refreshBootstrap();
    appState.accountDraft = { first_name: "", last_name: "", phone: "", email: "", role: "viewer", skills: "" };
    setFlashMessage("Account creato");
  } catch (error) {
    setFlashMessage(error.message || "Errore nella creazione account");
  } finally {
    appState.busy = false;
    renderApp();
  }
}

async function saveTaskAssignment() {
  const taskId = Number(appState.assignmentDraft.taskId);
  const assignedUserId = Number(appState.assignmentDraft.assignedUserId);
  if (!taskId || !assignedUserId) {
    setFlashMessage("Seleziona task e dipendente");
    return;
  }
  setBusy(true);
  try {
    const response = await fetch(`/api/tasks/${taskId}/assignment`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assigned_user_id: assignedUserId,
        planned_date: appState.assignmentDraft.plannedDate || null,
        calendar_day_label: appState.assignmentDraft.calendarDay || null,
        notes: "Assegnazione aggiornata dalla UI",
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Assegnazione non riuscita");
    }
    await refreshBootstrap();
    setFlashMessage("Assegnazione calendario salvata");
  } catch (error) {
    setFlashMessage(error.message || "Errore nell'assegnazione");
  } finally {
    appState.busy = false;
    renderApp();
  }
}

async function updateTaskFromUi(taskId, nextStatus) {
  setBusy(true);
  try {
    const response = await fetch(`/api/tasks/${taskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: nextStatus,
        notes: `Aggiornato dalla UI in stato ${nextStatus}`,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Aggiornamento task non riuscito");
    }
    await refreshBootstrap();
    setFlashMessage("Task aggiornato");
  } catch (error) {
    setFlashMessage(error.message || "Errore durante l'aggiornamento del task");
  } finally {
    appState.busy = false;
    renderApp();
  }
}

function getStatusClass(status) {
  const normalized = status.toLowerCase();
  if (
    normalized.includes("evaso") ||
    normalized.includes("saldato") ||
    normalized.includes("ok") ||
    normalized.includes("completato") ||
    normalized.includes("pagato")
  ) {
    return "done";
  }
  if (
    normalized.includes("stand") ||
    normalized.includes("sollecitare") ||
    normalized.includes("blocco") ||
    normalized.includes("confermare") ||
    normalized.includes("attesa")
  ) {
    return "hold";
  }
  return "progress";
}

function getPriorityClass(priority) {
  return priority && priority.toLowerCase() === "express" ? "priority-express" : "priority-standard";
}

function renderPriorityBadge(priority) {
  return `<span class="priority-badge ${getPriorityClass(priority)}">${priority}</span>`;
}

function navigate(view, orderId) {
  appState.currentView = view;
  if (orderId) appState.selectedOrderId = orderId;
  renderApp();
}

function getSelectedOrder() {
  return appData.orders.find((order) => order.id === appState.selectedOrderId) || appData.orders[0];
}

function getSelectedOrderMaterials() {
  return appData.orderMaterials[appState.selectedOrderId] || [];
}

function getCalendarEmployees() {
  return ["all", ...new Set(appData.calendar.flatMap((day) => day.slots.map((slot) => slot.owner)))];
}

function getCalendarPhases() {
  return ["all", "Cartamodello", "Taglio", "Confezione"];
}

function filterCalendarSlots(slots) {
  return slots.filter((slot) => {
    const byEmployee =
      appState.calendarFilters.employee === "all" || slot.owner === appState.calendarFilters.employee;
    const byPhase =
      appState.calendarFilters.phase === "all" || slot.phase === appState.calendarFilters.phase;
    return byEmployee && byPhase;
  });
}

function filterOrders() {
  const query = appState.search.trim().toLowerCase();
  return appData.orders.filter((order) => {
    const matchesSearch =
      !query ||
      `${order.id} ${order.client} ${order.department} ${order.payment} ${order.status}`
        .toLowerCase()
        .includes(query);

    const matchesDepartment =
      appState.filters.department === "all" || order.department === appState.filters.department;
    const matchesStatus =
      appState.filters.status === "all" || order.status === appState.filters.status;
    const matchesPayment =
      appState.filters.payment === "all" || order.payment === appState.filters.payment;
    const matchesPriority =
      appState.filters.priority === "all" || order.priority === appState.filters.priority;

    return matchesSearch && matchesDepartment && matchesStatus && matchesPayment && matchesPriority;
  });
}

function getClientForSelectedOrder() {
  const order = getSelectedOrder();
  return appData.clients.find((client) => client.name === order.client) || appData.clients[0];
}

function ensureClientDraft() {
  const client = getClientForSelectedOrder();
  if (!client) return;
  if (appState.clientDraft.id !== client.id) {
    appState.clientDraft = {
      id: client.id,
      email: client.email || "",
      phone: client.phone || "",
      paymentRule: client.paymentRule || "",
      note: client.note || "",
      visibilityEnabled: !!client.visibilityEnabled,
    };
  }
}

function renderNavButton(item) {
  return `
    <button class="${appState.currentView === item.id ? "active" : ""}" data-nav="${item.id}">
      <strong>${item.label}</strong>
      <span>${item.caption}</span>
    </button>
  `;
}

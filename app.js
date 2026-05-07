const appState = {
  currentView: "dashboard",
  selectedOrderId: 284,
  search: "",
  filters: {
    department: "all",
    status: "all",
    payment: "all",
    priority: "all",
  },
  draftOrder: {
    client: "Stella Tures",
    category: "Sartoria",
    priority: "Express",
    deposit: "Ricevuto",
    department: "Interno + controllo commercio",
    note: "Confermare etichette e inviare foto prima della spedizione.",
  },
};

const appData = {
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
    },
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
      { name: "Cartamodello canotta", team: "Sartoria interna - Eleonora", hours: "3,0 h", time: "21 gen 08:00", state: "Completato" },
      { name: "Taglio tessuto", team: "Sartoria interna - Roberta", hours: "2,0 h", time: "22 gen 08:00", state: "Completato" },
      { name: "Confezione finale", team: "Sartoria interna - Olga", hours: "8,0 h", time: "23 gen 08:00", state: "In corso" },
      { name: "Controllo etichetta", team: "Commercio - Coordinamento interno", hours: "0,5 h", time: "24 gen 11:00", state: "Da confermare" },
    ],
    455: [
      { name: "Ricezione jersey", team: "Commercio - Fornitore", hours: "n/d", time: "In attesa", state: "Da confermare" },
      { name: "Controllo materiali", team: "Commercio - Team interno", hours: "1,0 h", time: "Dopo ricezione", state: "Da avviare" },
    ],
    510: [
      { name: "Prenotazione laboratorio", team: "Sartoria esterna - Elisabetta", hours: "n/d", time: "Da confermare", state: "Stand by" },
      { name: "Revisione finale interna", team: "Sartoria interna - Amel", hours: "3,0 h", time: "Dopo rientro", state: "Da avviare" },
    ],
  },
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
        { orderId: 284, title: "Cartamodello", owner: "Eleonora", time: "08:00-11:00" },
        { orderId: 601, title: "Revisione taglio", owner: "Roberta", time: "14:00-16:00" },
      ],
    },
    {
      day: "Martedi'",
      date: "23 gennaio",
      slots: [
        { orderId: 284, title: "Taglio", owner: "Roberta", time: "08:00-10:00" },
        { orderId: 455, title: "Campionatura", owner: "Samuele", time: "11:00-13:30" },
      ],
    },
    {
      day: "Mercoledi'",
      date: "24 gennaio",
      slots: [{ orderId: 284, title: "Confezione", owner: "Olga", time: "08:00-17:00" }],
    },
    {
      day: "Giovedi'",
      date: "25 gennaio",
      slots: [
        { orderId: 510, title: "Revisione interna", owner: "Amel", time: "09:00-12:00" },
        { orderId: 621, title: "Etichette", owner: "Eleonora", time: "15:00-16:30" },
      ],
    },
    {
      day: "Venerdi'",
      date: "26 gennaio",
      slots: [
        { orderId: 455, title: "Chiusura task", owner: "Olga", time: "08:30-11:30" },
        { orderId: 284, title: "Controllo finale", owner: "Direzione", time: "12:00-12:30" },
      ],
    },
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

function getStatusClass(status) {
  const normalized = status.toLowerCase();
  if (
    normalized.includes("evaso") ||
    normalized.includes("saldato") ||
    normalized.includes("ok") ||
    normalized.includes("completato")
  ) {
    return "done";
  }
  if (
    normalized.includes("stand") ||
    normalized.includes("sollecitare") ||
    normalized.includes("blocco") ||
    normalized.includes("confermare")
  ) {
    return "hold";
  }
  return "progress";
}

function navigate(view, orderId) {
  appState.currentView = view;
  if (orderId) appState.selectedOrderId = orderId;
  renderApp();
}

function getSelectedOrder() {
  return appData.orders.find((order) => order.id === appState.selectedOrderId) || appData.orders[0];
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

function renderNavButton(item) {
  return `
    <button class="${appState.currentView === item.id ? "active" : ""}" data-nav="${item.id}">
      <strong>${item.label}</strong>
      <span>${item.caption}</span>
    </button>
  `;
}

function renderDashboard() {
  const topOrders = appData.orders.slice(0, 4);
  return `
    <section class="view ${appState.currentView === "dashboard" ? "active" : ""}">
      <div class="screen-header">
        <div>
          <h2>Controllo operativo della giornata</h2>
          <p>Una dashboard per direzione e coordinamento: cosa e' aperto, cosa e' a rischio e quali reparti hanno bisogno di attenzione subito.</p>
        </div>
        <div class="screen-actions">
          <div class="ghost-pill">Ultimo aggiornamento 09:12</div>
          <button class="action-pill" data-open="calendar">Apri planning settimana</button>
        </div>
      </div>

      <div class="hero-band">
        <div class="hero-panel surface">
          <div class="surface-inner">
            <strong>Dal foglio operativo a una cabina di regia unica per ordini, reparti e consegne.</strong>
            <p>Questa base front-end trasforma il processo attuale in un'app navigabile, con una sola fonte dati e viste dedicate per chi coordina, produce o controlla i pagamenti.</p>
            <div class="hero-pills">
              <span>Ordini unificati</span>
              <span>Pianificazione reparto</span>
              <span>Pagamenti collegati</span>
              <span>AI assistiva</span>
            </div>
          </div>
        </div>
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Messaggio chiave</h3>
                <p>Cosa il cliente deve percepire appena entra.</p>
              </div>
            </div>
            <div class="alert-list">
              <div class="alert-item">
                <strong>Tutto parte da un solo ordine</strong>
                <span>La stessa base dati alimenta reparto, cliente, pagamenti e planning senza copie manuali.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="kpi-row">
        <div class="kpi surface"><small>Ordini aperti</small><strong>${appData.metrics.openOrders}</strong><span>${appData.metrics.activeOrders} in lavorazione, ${appData.metrics.toStart} da avviare</span></div>
        <div class="kpi surface"><small>Urgenti</small><strong>${appData.metrics.urgent}</strong><span>2 richiedono conferma da laboratorio esterno</span></div>
        <div class="kpi surface"><small>Ritardi</small><strong>${appData.metrics.delays}</strong><span>3 interni, 2 legati a fornitori esterni</span></div>
        <div class="kpi surface"><small>Incassi aperti</small><strong>${appData.metrics.paymentValue}</strong><span>${appData.metrics.openPayments} ordini con acconto o saldo ancora aperto</span></div>
        <div class="kpi surface"><small>Task attivi</small><strong>${appData.metrics.activeTasks}</strong><span>taglio, confezione, stampa e laboratori</span></div>
        <div class="kpi surface"><small>Evasi mese</small><strong>${appData.metrics.completedMonth}</strong><span>con media evasione di 4,2 giorni</span></div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Ordini prioritari</h3>
                <p>Le lavorazioni che oggi spostano davvero il planning.</p>
              </div>
              <div class="ghost-pill">Filtro: settimana corrente</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>N. ordine</th>
                  <th>Cliente</th>
                  <th>Reparto</th>
                  <th>Priorita'</th>
                  <th>Consegna</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                ${topOrders
                  .map(
                    (order) => `
                  <tr data-order="${order.id}" class="clickable-row">
                    <td>#${order.id}</td>
                    <td>${order.client}</td>
                    <td>${order.department}</td>
                    <td>${order.priority}</td>
                    <td>${order.eta}</td>
                    <td><span class="table-status ${getStatusClass(order.status)}">${order.status}</span></td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Attenzioni operative</h3>
                <p>Le eccezioni che oggi meritano una regia piu' chiara.</p>
              </div>
            </div>
            <div class="alert-list">
              ${appData.alerts
                .map(
                  (alert) => `
                <div class="alert-item" data-order="${alert.orderId}">
                  <strong>${alert.title}</strong>
                  <span>${alert.detail}</span>
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Monitor reparto</h3>
              <p>Un solo archivio ordini, tre viste di lavoro realmente operative.</p>
            </div>
          </div>
          <div class="dept-strip">
            ${appData.departments
              .map(
                (dept) => `
              <div class="dept-row">
                <div class="dept-name">
                  <strong>${dept.name}</strong>
                  <span>${dept.activeOrders} ordini attivi, ${dept.activeTasks} task aperti</span>
                </div>
                <div>
                  <strong>Carico</strong>
                  <div class="mini-progress"><div style="width:${dept.load}%"></div></div>
                </div>
                <div class="mini-meta">${dept.note}</div>
                <button class="action-pill" data-open="calendar">Apri reparto</button>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderOrders() {
  const orders = filterOrders();
  const departments = ["all", ...new Set(appData.orders.map((order) => order.department))];
  const statuses = ["all", ...new Set(appData.orders.map((order) => order.status))];
  const payments = ["all", ...new Set(appData.orders.map((order) => order.payment))];
  const priorities = ["all", ...new Set(appData.orders.map((order) => order.priority))];

  function renderFilterSelect(key, options) {
    const labels = {
      all: "tutti",
    };
    return `
      <select class="filter-chip" data-filter="${key}">
        ${options
          .map(
            (option) => `
          <option value="${option}" ${appState.filters[key] === option ? "selected" : ""}>
            ${labels[option] || option}
          </option>
        `
          )
          .join("")}
      </select>
    `;
  }

  return `
    <section class="view ${appState.currentView === "orders" ? "active" : ""}">
      <div class="screen-header">
        <div>
          <h2>Archivio ordini unificato</h2>
          <p>Un'unica vista per cercare, filtrare e aprire gli ordini senza duplicazioni tra reparti e senza perdita di contesto.</p>
        </div>
        <div class="screen-actions">
          <div class="ghost-pill">660 ordini storici rilevati</div>
          <button class="action-pill">Esporta vista</button>
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="filter-row">
            <div class="filter-chip">Ricerca attiva: ${appState.search || "nessun filtro testuale"}</div>
            ${renderFilterSelect("department", departments)}
            ${renderFilterSelect("status", statuses)}
            ${renderFilterSelect("priority", priorities)}
            ${renderFilterSelect("payment", payments)}
            <div class="filter-chip">Periodo: ultimi 30 giorni</div>
          </div>
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <table>
            <thead>
              <tr>
                <th>N. ordine</th>
                <th>Cliente</th>
                <th>Categoria</th>
                <th>Reparto</th>
                <th>Priorita'</th>
                <th>Stato ordine</th>
                <th>Pagamento</th>
                <th>Consegna stimata</th>
                <th>Allegati</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              ${
                orders.length
                  ? orders
                      .map(
                        (order) => `
                    <tr>
                      <td>#${order.id}</td>
                      <td>${order.client}</td>
                      <td>${order.category}</td>
                      <td>${order.department}</td>
                      <td>${order.priority}</td>
                      <td><span class="table-status ${getStatusClass(order.status)}">${order.status}</span></td>
                      <td>${order.payment}</td>
                      <td>${order.eta}</td>
                      <td>${order.files} file</td>
                      <td>
                        <div class="pill-row">
                          <button class="mini-btn" data-detail="${order.id}">Apri</button>
                          <button class="mini-btn" data-detail="${order.id}">Nota</button>
                        </div>
                      </td>
                    </tr>
                  `
                      )
                      .join("")
                  : `<tr><td colspan="10"><div class="empty-state">Nessun ordine corrisponde ai filtri attuali.</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

function renderOrderDetail() {
  const order = getSelectedOrder();
  const tasks = appData.orderTasks[order.id] || [];
  const timeline = appData.orderTimeline[order.id] || [];
  return `
    <section class="view ${appState.currentView === "order-detail" ? "active" : ""}">
      <div class="screen-header">
        <div>
          <h2>Ordine #${order.id} - ${order.client}</h2>
          <p>L'ordine diventa il centro operativo dove produzione, amministrazione e file restano collegati.</p>
        </div>
        <div class="screen-actions">
          <div class="ghost-pill">Priorita': ${order.priority}</div>
          <button class="action-pill">Aggiorna stato</button>
        </div>
      </div>

      <div class="metric-band">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Dati ordine</h3>
                <p>Base amministrativa e operativa.</p>
              </div>
            </div>
            <div class="profile-lines">
              <div class="line"><div class="muted">Cliente</div><div>${order.client}</div></div>
              <div class="line"><div class="muted">Categoria</div><div>${order.category}</div></div>
              <div class="line"><div class="muted">Reparto principale</div><div>${order.department}</div></div>
              <div class="line"><div class="muted">Origine</div><div>${order.route}</div></div>
              <div class="line"><div class="muted">Data ordine</div><div>20 gennaio 2026</div></div>
              <div class="line"><div class="muted">Consegna interna</div><div>${order.eta}</div></div>
              <div class="line"><div class="muted">Finestra cliente</div><div>${order.customerWindow}</div></div>
            </div>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Stato e pagamento</h3>
                <p>Controlli rapidi da una sola vista.</p>
              </div>
            </div>
            <div class="pill-row">
              <span class="pill">Ordine: ${order.status}</span>
              <span class="pill">Pagamento: ${order.payment}</span>
              <span class="pill">Task: ${tasks.length}</span>
              <span class="pill">Allegati: ${order.files}</span>
            </div>
            <div style="height:18px"></div>
            <div class="profile-lines">
              <div class="line"><div class="muted">Acconto</div><div>${order.payment === "Non pagato" ? "Da ricevere" : "Ricevuto / in gestione"}</div></div>
              <div class="line"><div class="muted">Saldo</div><div>${order.payment === "Saldato" ? "Chiuso" : "Da verificare prima evasione"}</div></div>
              <div class="line"><div class="muted">Note ordine</div><div>${order.notes}</div></div>
              <div class="line"><div class="muted">Allegati</div><div>${order.files} file collegati al progetto</div></div>
            </div>
          </div>
        </div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Task e lavorazioni</h3>
                <p>Da riga ordine a produzione governata.</p>
              </div>
            </div>
            <div class="task-list">
              ${
                tasks.length
                  ? tasks
                      .map(
                        (task) => `
                    <div class="task-item">
                      <div>
                        <strong>${task.name}</strong>
                        <div class="muted">${task.team}</div>
                      </div>
                      <div>${task.hours}</div>
                      <div>${task.time}</div>
                      <div><span class="table-status ${getStatusClass(task.state)}">${task.state}</span></div>
                    </div>
                  `
                      )
                      .join("")
                  : `<div class="empty-state">Per questo ordine i task non sono ancora stati strutturati.</div>`
              }
            </div>
          </div>
        </div>

        <div style="display:grid; gap:16px;">
          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>Timeline</h3>
                  <p>Chi ha fatto cosa e quando.</p>
                </div>
              </div>
              <div class="timeline">
                ${
                  timeline.length
                    ? timeline
                        .map(
                          (item) => `
                      <div class="timeline-item">
                        <div class="timeline-time">${item.date}</div>
                        <div class="timeline-body">
                          <strong>${item.title}</strong>
                          <span>${item.detail}</span>
                        </div>
                      </div>
                    `
                        )
                        .join("")
                    : `<div class="empty-state">Timeline non ancora disponibile per questo ordine.</div>`
                }
              </div>
            </div>
          </div>

          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>Note operative</h3>
                  <p>Blocchi, chiarimenti e informazioni cliente.</p>
                </div>
              </div>
              <div class="alert-list">
                <div class="alert-item">
                  <strong>Contesto ordine</strong>
                  <span>${order.notes}</span>
                </div>
                <div class="alert-item">
                  <strong>Uso in demo</strong>
                  <span>Questa vista serve a mostrare che il gestionale collega stato, task, file e pagamento nello stesso punto.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderCalendar() {
  return `
    <section class="view ${appState.currentView === "calendar" ? "active" : ""}">
      <div class="screen-header">
        <div>
          <h2>Calendario reparto - Sartoria interna</h2>
          <p>Una pianificazione visibile, assegnabile e ricalcolabile. Qui si percepisce il salto vero rispetto al foglio manuale.</p>
        </div>
        <div class="screen-actions">
          <div class="ghost-pill">Vista: settimana</div>
          <button class="action-pill">Nuova assegnazione</button>
        </div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Pianificazione della settimana</h3>
                <p>Con persone, task e blocchi sempre visibili.</p>
              </div>
            </div>
            <div class="calendar-board">
              ${appData.calendar
                .map(
                  (day) => `
                <div class="calendar-col">
                  <h4>${day.day}</h4>
                  <p>${day.date}</p>
                  ${day.slots
                    .map(
                      (slot) => `
                    <div class="slot" data-detail="${slot.orderId}">
                      <strong>#${slot.orderId} - ${slot.title}</strong>
                      <span>${slot.owner} · ${slot.time}</span>
                    </div>
                  `
                    )
                    .join("")}
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        </div>

        <div style="display:grid; gap:16px;">
          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>Capacita' reparto</h3>
                  <p>Chi lavora, quanto e dove si satura.</p>
                </div>
              </div>
              <div class="dept-strip">
                <div class="dept-row">
                  <div class="dept-name"><strong>Eleonora</strong><span>cartamodelli + taglio</span></div>
                  <div><div class="mini-progress"><div style="width:78%"></div></div></div>
                  <div class="mini-meta">31h assegnate</div>
                  <button class="mini-btn">Dettaglio</button>
                </div>
                <div class="dept-row">
                  <div class="dept-name"><strong>Olga</strong><span>confezione</span></div>
                  <div><div class="mini-progress"><div style="width:86%"></div></div></div>
                  <div class="mini-meta">34h assegnate</div>
                  <button class="mini-btn">Dettaglio</button>
                </div>
                <div class="dept-row">
                  <div class="dept-name"><strong>Roberta</strong><span>taglio part-time</span></div>
                  <div><div class="mini-progress"><div style="width:54%"></div></div></div>
                  <div class="mini-meta">15h su 3 giorni</div>
                  <button class="mini-btn">Dettaglio</button>
                </div>
              </div>
            </div>
          </div>

          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>Attenzioni calendario</h3>
                  <p>Per ripianificare senza perdere contesto.</p>
                </div>
              </div>
              <div class="alert-list">
                <div class="alert-item">
                  <strong>1 assenza da confermare per venerdi'</strong>
                  <span>Il sistema dovra' ricalcolare i task impattati con un solo click.</span>
                </div>
                <div class="alert-item">
                  <strong>2 task in attesa materiale</strong>
                  <span>Segnale utile prima che il reparto perda tempo su lavorazioni bloccate.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderClient() {
  const client = getClientForSelectedOrder();
  const orders = appData.orders.filter((order) => client.orders.includes(order.id));
  return `
    <section class="view ${appState.currentView === "client" ? "active" : ""}">
      <div class="screen-header">
        <div>
          <h2>Scheda cliente - ${client.name}</h2>
          <p>Un profilo cliente che conserva storico, condizioni e dettagli operativi che oggi rischiano di vivere in note sparse o nella memoria della squadra.</p>
        </div>
        <div class="screen-actions">
          <div class="client-badge">${client.trust}</div>
          <button class="action-pill" data-open="new-order">Nuovo ordine cliente</button>
        </div>
      </div>

      <div class="client-hero">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Profilo operativo</h3>
                <p>Dati fissi e regole utili alla squadra.</p>
              </div>
            </div>
            <div class="profile-lines">
              <div class="line"><div class="muted">Brand</div><div>${client.name}</div></div>
              <div class="line"><div class="muted">Contatto</div><div>${client.email}</div></div>
              <div class="line"><div class="muted">Pagamento</div><div>${client.paymentRule}</div></div>
              <div class="line"><div class="muted">Tipologia lavori</div><div>${client.workType}</div></div>
              <div class="line"><div class="muted">Note cliente</div><div>${client.note}</div></div>
            </div>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Storico sintetico</h3>
                <p>Come lavoriamo con questo cliente.</p>
              </div>
            </div>
            <div class="grid-2">
              <div class="kpi" style="padding:16px;">
                <small>Ordini totali</small>
                <strong>${client.orders.length}</strong>
                <span>${Math.max(client.orders.length - 1, 1)} negli ultimi 90 giorni</span>
              </div>
              <div class="kpi" style="padding:16px;">
                <small>Ordini evasi</small>
                <strong>${orders.filter((order) => order.status.toLowerCase().includes("evaso") || order.payment === "Saldato").length}</strong>
                <span>${orders.filter((order) => !order.status.toLowerCase().includes("evaso") && order.payment !== "Saldato").length} in lavorazione</span>
              </div>
            </div>
            <div style="height:16px;"></div>
            <div class="pill-row">
              ${client.tags.map((tag) => `<span class="pill">${tag}</span>`).join("")}
            </div>
          </div>
        </div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Storico ordini cliente</h3>
                <p>Con stato, consegna e pagamento sempre leggibili.</p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Ordine</th>
                  <th>Categoria</th>
                  <th>Stato</th>
                  <th>Consegna</th>
                  <th>Pagamento</th>
                </tr>
              </thead>
              <tbody>
                ${orders
                  .map(
                    (order) => `
                  <tr data-order="${order.id}" class="clickable-row">
                    <td>#${order.id}</td>
                    <td>${order.category}</td>
                    <td><span class="table-status ${getStatusClass(order.status)}">${order.status}</span></td>
                    <td>${order.eta}</td>
                    <td>${order.payment}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Memo squadra</h3>
                <p>Informazioni che non devono piu' vivere solo nella testa.</p>
              </div>
            </div>
            <div class="alert-list">
              <div class="alert-item">
                <strong>Conferme visive richieste</strong>
                <span>Inviare foto del campione o del capo quasi finito prima della consegna.</span>
              </div>
              <div class="alert-item">
                <strong>Preferenza consegne</strong>
                <span>Predilige finestre di consegna comunicate in anticipo di 48 ore.</span>
              </div>
              <div class="alert-item">
                <strong>Materiali delicati</strong>
                <span>Tenere separate note su tessuti e lavaggi speciali nella scheda ordine.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="footnote">Vista cliente collegata agli stessi ordini gia' presenti nel sistema, senza doppie anagrafiche o note sparse.</div>
    </section>
  `;
}

function renderPayments() {
  return `
    <section class="view ${appState.currentView === "payments" ? "active" : ""}">
      <div class="screen-header">
        <div>
          <h2>Pagamenti e chiusure</h2>
          <p>Una regia unica per acconti, saldi e scadenze 30/60/90, con blocchi chiari sugli ordini che non possono essere chiusi.</p>
        </div>
        <div class="screen-actions">
          <div class="ghost-pill">${appData.metrics.openPayments} posizioni aperte</div>
          <button class="action-pill">Registra incasso</button>
        </div>
      </div>

      <div class="metric-boxes">
        <div class="metric-box surface"><small>Acconti aperti</small><strong>18</strong><span>Ordini in produzione con saldo non chiuso.</span></div>
        <div class="metric-box surface"><small>Scadenze 30/60/90</small><strong>9</strong><span>Clienti affidabili con pagamento differito.</span></div>
        <div class="metric-box surface"><small>Valore da incassare</small><strong>${appData.metrics.paymentValue}</strong><span>Somma di acconti residui e saldi aperti.</span></div>
        <div class="metric-box surface"><small>Ordini bloccati</small><strong>4</strong><span>Produzione finita ma evasione non ancora autorizzata.</span></div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Ledger operativo</h3>
                <p>Il cliente smette di rincorrere stati sparsi tra fogli e note.</p>
              </div>
            </div>
            <div class="ledger-list">
              ${appData.payments
                .map(
                  (item) => `
                <div class="ledger-row">
                  <div>
                    <strong>#${item.orderId} - ${item.client}</strong>
                    <div class="muted">${appData.orders.find((order) => order.id === item.orderId)?.summary || ""}</div>
                  </div>
                  <div>${item.mode}<br /><span class="muted">${item.detail}</span></div>
                  <div>Scadenza: ${item.due}</div>
                  <div><span class="table-status ${getStatusClass(item.state)}">${item.state}</span></div>
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Regole applicate</h3>
                <p>Qui l'app spiega la logica, non solo la grafica.</p>
              </div>
            </div>
            <div class="alert-list">
              <div class="alert-item">
                <strong>Ordine evaso solo se pagamento coerente</strong>
                <span>Il flusso controlla la regola cliente prima di consentire la chiusura.</span>
              </div>
              <div class="alert-item">
                <strong>Clienti premium con condizioni dedicate</strong>
                <span>30/60/90 giorni diventano una regola configurata nella scheda cliente.</span>
              </div>
              <div class="alert-item">
                <strong>Solleciti e alert automatici</strong>
                <span>La base front-end e' pronta per collegarsi a future notifiche automatiche.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderNewOrder() {
  const draft = appState.draftOrder;
  return `
    <section class="view ${appState.currentView === "new-order" ? "active" : ""}">
      <div class="screen-header">
        <div>
          <h2>Nuovo ordine da preventivo</h2>
          <p>La schermata che racconta il passaggio chiave: da preventivo confermato a ordine strutturato, classificato e pronto per il planning.</p>
        </div>
        <div class="screen-actions">
          <div class="ghost-pill">Wizard semplificato</div>
          <button class="action-pill">Crea task</button>
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="steps">
            <div class="step"><small>Step 1</small><strong>Conferma preventivo</strong><span>Cliente, acconto, priorita' e data ordine.</span></div>
            <div class="step"><small>Step 2</small><strong>Classifica righe</strong><span>Interno, esterno, commercio e materiali.</span></div>
            <div class="step"><small>Step 3</small><strong>Genera task</strong><span>Lavorazioni, durate e dipendenze operative.</span></div>
            <div class="step"><small>Step 4</small><strong>Invia a planning</strong><span>Calendario reparto e data evasione stimata.</span></div>
          </div>
        </div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Dati essenziali ordine</h3>
                <p>Solo i campi che servono per attivare davvero il lavoro.</p>
              </div>
            </div>
            <div class="form-grid">
              <div class="field">
                <label>Cliente / brand</label>
                <input class="field-value" data-draft="client" value="${draft.client}" />
              </div>
              <div class="field">
                <label>Numero ordine</label>
                <div class="field-value">#284</div>
              </div>
              <div class="field">
                <label>Categoria</label>
                <input class="field-value" data-draft="category" value="${draft.category}" />
              </div>
              <div class="field">
                <label>Priorita'</label>
                <input class="field-value" data-draft="priority" value="${draft.priority}" />
              </div>
              <div class="field">
                <label>Acconto</label>
                <input class="field-value" data-draft="deposit" value="${draft.deposit}" />
              </div>
              <div class="field">
                <label>Origine reparto</label>
                <input class="field-value" data-draft="department" value="${draft.department}" />
              </div>
              <div class="field span-2">
                <label>Nota di avvio</label>
                <textarea class="field-value" data-draft="note" style="min-height:86px; align-items:flex-start; padding-top:12px;">${draft.note}</textarea>
              </div>
            </div>
          </div>
        </div>

        <div style="display:grid; gap:16px;">
          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>Task generati</h3>
                  <p>La parte che nel foglio oggi non e' strutturata.</p>
                </div>
              </div>
              <div class="task-list">
                <div class="task-item"><div><strong>Cartamodello</strong><div class="muted">Sartoria interna</div></div><div>3 h</div><div>Skill CAD</div><div><span class="table-status progress">Pronto</span></div></div>
                <div class="task-item"><div><strong>Taglio</strong><div class="muted">Sartoria interna</div></div><div>2 h</div><div>Taglio</div><div><span class="table-status progress">Pronto</span></div></div>
                <div class="task-item"><div><strong>Confezione</strong><div class="muted">Sartoria interna</div></div><div>8 h</div><div>Confezione</div><div><span class="table-status progress">Pronto</span></div></div>
                <div class="task-item"><div><strong>Verifica etichetta</strong><div class="muted">Commercio</div></div><div>0,5 h</div><div>Controllo finale</div><div><span class="table-status hold">Da confermare</span></div></div>
              </div>
            </div>
          </div>

          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>Valore mostrato in demo</h3>
                  <p>Qui si capisce il passaggio da foglio a sistema.</p>
                </div>
              </div>
              <div class="alert-list">
                <div class="alert-item">
                  <strong>Niente ricopiature tra fogli</strong>
                  <span>Un ordine nasce una volta sola e genera automaticamente la struttura operativa.</span>
                </div>
                <div class="alert-item">
                  <strong>Ogni reparto vede solo il suo</strong>
                  <span>La stessa base dati alimenta viste diverse senza duplicazione manuale.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderAI() {
  return `
    <section class="view ${appState.currentView === "ai-assistant" ? "active" : ""}">
      <div class="screen-header">
        <div>
          <h2>Assistente AI operativo</h2>
          <p>Un supporto concreto per classificare righe, riassumere input cliente e proporre task o reparto corretto, sempre con approvazione umana.</p>
        </div>
        <div class="screen-actions">
          <div class="ghost-pill">Supervisione umana obbligatoria</div>
          <button class="action-pill">Applica suggerimenti</button>
        </div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Conversazione guidata</h3>
                <p>Come l'AI aiuta senza decidere da sola.</p>
              </div>
            </div>
            <div class="assistant-list">
              ${appData.aiFeed
                .map(
                  (item) => `
                <div class="assistant-msg ${item.type}">
                  <strong>${item.title}</strong>
                  <span>${item.body}</span>
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        </div>

        <div style="display:grid; gap:16px;">
          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>Cosa approva l'operatore</h3>
                  <p>La parte che rassicura il cliente.</p>
                </div>
              </div>
              <div class="pill-row">
                <span class="pill">Reparto suggerito</span>
                <span class="pill">Task e durate</span>
                <span class="pill">Finestra consegna</span>
                <span class="pill">Sintesi note cliente</span>
              </div>
              <div style="height:16px"></div>
              <div class="alert-list">
                <div class="alert-item">
                  <strong>Mai autonomia completa nelle prime release</strong>
                  <span>La base dell'app mostra AI assistiva, non sostitutiva, in linea con il documento tecnico.</span>
                </div>
              </div>
            </div>
          </div>

          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>Audit delle decisioni</h3>
                  <p>Ogni suggerimento resta tracciabile.</p>
                </div>
              </div>
              <div class="feed-list">
                <div class="feed-row"><div><strong>09:02</strong><div class="muted">Righe classificate</div></div><div>Preventivo #284</div><div>Confidenza 87%</div><div><span class="table-status done">Confermato</span></div></div>
                <div class="feed-row"><div><strong>09:05</strong><div class="muted">Task proposti</div></div><div>4 task creati</div><div>Durate iniziali</div><div><span class="table-status progress">Da validare</span></div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderLayout() {
  const navItems = [
    { id: "dashboard", label: "Dashboard", caption: "Controllo giornaliero e criticita'" },
    { id: "orders", label: "Ordini", caption: "Archivio unificato e azioni rapide" },
    { id: "order-detail", label: "Scheda ordine", caption: "Task, allegati e stato operativo" },
    { id: "calendar", label: "Calendario", caption: "Pianificazione reparto e carichi" },
    { id: "client", label: "Scheda cliente", caption: "Storico, regole e contesto cliente" },
    { id: "payments", label: "Pagamenti", caption: "Acconti, saldi e scadenze" },
    { id: "new-order", label: "Nuovo ordine", caption: "Da preventivo a task e planning" },
    { id: "ai-assistant", label: "Assistente AI", caption: "Suggerimenti e sintesi controllata" },
  ];

  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">M</div>
          <small>Frontend reale - base app</small>
          <h1>MMS Studio<br />Operations Hub</h1>
          <p>Una base concreta per portare il prototipo dentro un'app navigabile e pronta da estendere.</p>
        </div>
        <nav class="nav">
          ${navItems.map(renderNavButton).join("")}
        </nav>
        <div class="sidebar-footer">
          <h3>Stato sviluppo</h3>
          <p>Base desktop funzionante con navigazione reale, dati simulati coerenti e schermate collegate tra loro.</p>
        </div>
      </aside>

      <main class="main">
        <div class="topbar">
          <label class="search">
            <span>Ricerca</span>
            <input id="global-search" type="text" value="${appState.search}" placeholder="Ordine 284, cliente, reparto, pagamento..." />
          </label>
          <div class="ghost-pill">Profilo: Direzione operativa</div>
          <button class="action-pill" data-open="new-order">Nuovo ordine</button>
        </div>

        <div class="workspace">
          ${renderDashboard()}
          ${renderOrders()}
          ${renderOrderDetail()}
          ${renderCalendar()}
          ${renderClient()}
          ${renderPayments()}
          ${renderNewOrder()}
          ${renderAI()}
        </div>
      </main>
    </div>
  `;
}

function attachEvents() {
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.nav));
  });

  document.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.open));
  });

  document.querySelectorAll("[data-detail]").forEach((button) => {
    button.addEventListener("click", () => navigate("order-detail", Number(button.dataset.detail)));
  });

  document.querySelectorAll(".clickable-row[data-order], .alert-item[data-order], .slot[data-detail]").forEach((node) => {
    node.style.cursor = "pointer";
    node.addEventListener("click", () => {
      const orderId = Number(node.dataset.order || node.dataset.detail);
      navigate("order-detail", orderId);
    });
  });

  const search = document.getElementById("global-search");
  if (search) {
    search.addEventListener("input", (event) => {
      appState.search = event.target.value;
      if (appState.currentView !== "orders") {
        appState.currentView = "orders";
      }
      renderApp();
    });
  }

  document.querySelectorAll("[data-filter]").forEach((select) => {
    select.addEventListener("change", (event) => {
      appState.filters[event.target.dataset.filter] = event.target.value;
      renderApp();
    });
  });

  document.querySelectorAll("[data-draft]").forEach((input) => {
    input.addEventListener("input", (event) => {
      appState.draftOrder[event.target.dataset.draft] = event.target.value;
    });
  });
}

function renderApp() {
  const root = document.getElementById("app");
  root.innerHTML = renderLayout();
  attachEvents();
}

renderApp();

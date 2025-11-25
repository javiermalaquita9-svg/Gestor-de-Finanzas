// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBy1jm7cHZUGEILSOm0BE126dnD25CLLG8",
  authDomain: "finanzas-1-5f22e.firebaseapp.com",
  projectId: "finanzas-1-5f22e",
  storageBucket: "finanzas-1-5f22e.firebasestorage.app",
  messagingSenderId: "699580113964",
  appId: "1:699580113964:web:375768d861d4eb9ad99d89",
  measurementId: "G-8WLGDGSNKK"
};// ... aquí termina tu firebaseConfig (línea 10)

// 1. ESTA ES LA LÍNEA QUE FALTABA PARA CONECTAR TODO:
firebase.initializeApp(firebaseConfig);

// 2. Definimos las herramientas
const db = firebase.firestore();
const auth = firebase.auth();

// 3. Restauramos la lista de países que se borró:
const countryCodes = [
    { name: 'Chile', code: 'CL', dial_code: '+56', flag: '🇨🇱' },
    { name: 'Argentina', code: 'AR', dial_code: '+54', flag: '🇦🇷' },
    { name: 'Perú', code: 'PE', dial_code: '+51', flag: '🇵🇪' },
    { name: 'Colombia', code: 'CO', dial_code: '+57', flag: '🇨🇴' },
    { name: 'México', code: 'MX', dial_code: '+52', flag: '🇲🇽' },
    { name: 'España', code: 'ES', dial_code: '+34', flag: '🇪🇸' },
    { name: 'USA', code: 'US', dial_code: '+1', flag: '🇺🇸' },
];

// ... aquí sigue tu const defaultData

// Este objeto 'defaultData' ahora servirá como plantilla para nuevos usuarios.
// Ya no será la fuente principal de datos.
const defaultData = {
    transactions: [],
    purchases: [],
    creditCards: [],
    categories: {
        income: ['Salario', 'Ventas', 'Freelance', 'Otro'],
        expense: ['Alimentación', 'Vivienda', 'Transporte', 'Ocio', 'Salud', 'Servicios', 'Otro']
    },
    userInfo: {
        name: '',
        email: '',
        phone: ''
    }
};

// 'data' ahora se cargará de forma asíncrona desde Firestore.
// Lo inicializamos vacío.
let data = {};
let unsubscribeListeners = []; // Para limpiar listeners de Firestore al hacer logout

let creditCardChartInstance = null;
let expenseChartInstance = null;
let savingsChartInstance = null;
let editId = null;

// --- UTILIDADES ---
// La función 'save' de localStorage se reemplaza por saveData que escribe en Firestore.
async function saveData() {
    if (auth.currentUser) {
        // Guardamos el objeto 'data' completo en el documento del usuario.
        // Usamos { merge: true } por si acaso, aunque 'set' completo es lo que queremos.
        await db.collection('users').doc(auth.currentUser.uid).set(data, { merge: true });
    }
}

const fmtMoney = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(n);
const fmtDate = (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-CL') : '';
const parseMoney = (s) => parseInt(s.replace(/\D/g, '') || 0);
const fmtInput = (n) => n.toLocaleString('es-CL');

// --- ACCIONES GLOBALES (Definidas antes de renderizar) ---
window.delTx = (id) => { if(confirm('¿Borrar?')) { data.transactions = data.transactions.filter(t => t.id !== id); saveData(); } };

window.editTx = (id) => {
    const t = data.transactions.find(t => t.id === id);
    if(t) {
        editId = id;
        document.getElementById('form-title').innerText = "Editando Transacción";
        typeSel.value = t.type;
        populateCategories(t.category); // Pasamos la categoría para que se seleccione correctamente
        document.getElementById('desc-input').value = t.desc;
        amountIn.value = fmtInput(t.amount);
        document.getElementById('transaction-date-input').value = t.date;
        window.scrollTo({top:0, behavior:'smooth'});
    }
};

window.delPurchase = (id) => { if(confirm('¿Borrar Compra?')) { data.purchases = data.purchases.filter(p => p.id !== id); saveData(); } };

window.payQuota = (id) => {
    const p = data.purchases.find(p => p.id === id);
    if(p && p.paid < p.cuotas) {
        p.paid++;
        data.transactions.push({ id: Date.now(), type: 'expense', category: p.cat, desc: `Pago cuota ${p.paid}/${p.cuotas}: ${p.desc}`, amount: Math.round(p.total/p.cuotas), date: new Date().toISOString().split('T')[0] });
        saveData();
    }
};

window.addCat = (e, type) => {
    e.preventDefault();
    const input = document.getElementById(`new-${type}-cat`);
    const val = input.value.trim();
    if(val && !data.categories[type].includes(val)) {
        data.categories[type].push(val);
        saveData();
    }
    input.value = '';
};

window.addCard = (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('new-card-name');
    const limitInput = document.getElementById('new-card-limit');
    const name = nameInput.value.trim();
    const limit = parseMoney(limitInput.value);

    if (name && limit > 0 && !data.creditCards.some(c => c.name === name)) {
        data.creditCards.push({ name, limit });
        if (!data.categories.expense.includes(name)) data.categories.expense.push(name);
        saveData();
    }
    nameInput.value = '';
    limitInput.value = '';
    limitInput.dispatchEvent(new Event('input')); // Para formatear el campo
};

window.editCat = (type, idx) => {
    const oldName = data.categories[type][idx];
    const newName = prompt("Editar nombre:", oldName);
    if (newName && newName.trim() !== "" && newName !== oldName) {
        data.categories[type][idx] = newName.trim();
        if(confirm("¿Actualizar historial con el nuevo nombre?")) {
            data.transactions.forEach(t => { if (t.category === oldName) t.category = newName.trim(); });
            data.purchases.forEach(p => { if (p.cat === oldName) p.cat = newName.trim(); });
        }
        saveData();
    }
};

window.delCat = (type, idx) => {
    if(confirm('¿Borrar categoría?')) {
        data.categories[type].splice(idx, 1);
        saveData();
    }
};

window.editCard = (idx) => {
    const card = data.creditCards[idx];
    const newName = prompt("Editar Nombre:", card.name);
    const newLimitRaw = prompt("Editar Cupo:", card.limit);
    const newLimit = parseMoney(newLimitRaw || '0');

    if (newName && newName.trim() !== "" && newLimit > 0) {
        const oldName = card.name;
        data.creditCards[idx] = { name: newName.trim(), limit: newLimit };
        const expIdx = data.categories.expense.indexOf(oldName);
        if (expIdx !== -1) data.categories.expense[expIdx] = newName.trim();
        if(confirm("¿Actualizar historial de compras con el nuevo nombre?")) {
            data.transactions.forEach(t => { if (t.category === oldName) t.category = newName.trim(); });
            data.purchases.forEach(p => { if (p.cat === oldName) p.cat = newName.trim(); });
        }
        saveData();
    }
};

window.delCard = (idx) => {
    const cardName = data.creditCards[idx].name;
    if(confirm(`¿Eliminar tarjeta ${cardName}?`)) {
        data.creditCards.splice(idx, 1);
        const expIdx = data.categories.expense.indexOf(cardName);
        if (expIdx !== -1) data.categories.expense.splice(expIdx, 1);
        saveData();
    }
};

window.resetAllData = () => {
    if (confirm("¡ADVERTENCIA!\n\n¿Estás seguro de que quieres borrar TODA tu información (transacciones, categorías, tarjetas, etc.)?\n\nEsta acción es irreversible.")) {
        if (confirm("ÚLTIMA ADVERTENCIA: Esta acción no se puede deshacer. ¿Continuar?")) {
            // Usamos una copia profunda para evitar problemas de referencia con el objeto original.
            data = JSON.parse(JSON.stringify(defaultData));
            saveData(); // Guardamos el estado reseteado en Firestore.
            alert("Toda la información ha sido reseteada.");
            // El listener de Firestore (onSnapshot) se encargará de refrescar la UI automáticamente.
        }
    }
};

// --- RENDERIZADO ---
function render() {
    renderSummary();
    renderHistory();
    renderSavings();
    renderCC();
    renderSettings(); // Ahora usa la versión robusta DOM
    
    if (!document.getElementById('reports-page').classList.contains('hidden')) renderExpenseChart();
    if (!document.getElementById('savings-page').classList.contains('hidden')) renderSavingsChart();
}

// Renderizado de Configuración ROBUSTO (Creación directa de DOM)
function renderSettings() {
    const incList = document.getElementById('income-cat-list');
    const expList = document.getElementById('expense-cat-list');
    const cardList = document.getElementById('card-list');
    
    incList.innerHTML = ''; expList.innerHTML = ''; cardList.innerHTML = '';

    // Poblar formulario de información de usuario
    document.getElementById('user-name-input').value = data.userInfo?.name || '';
    document.getElementById('user-email-input').value = data.userInfo?.email || '';
    
    const phoneCodeSelect = document.getElementById('user-phone-code-select');
    if (phoneCodeSelect.options.length === 0) {
        phoneCodeSelect.innerHTML = countryCodes.map(c => `<option value="${c.dial_code}">${c.flag} ${c.dial_code}</option>`).join('');
    }

    const fullPhone = data.userInfo?.phone || '';
    const savedCode = countryCodes.find(c => fullPhone.startsWith(c.dial_code));
    if (savedCode) {
        phoneCodeSelect.value = savedCode.dial_code;
        document.getElementById('user-phone-input').value = fullPhone.replace(savedCode.dial_code, '').trim();
    } else {
        phoneCodeSelect.value = '+56'; // Default a Chile si no hay coincidencia
        document.getElementById('user-phone-input').value = fullPhone.trim();
    }

    // Helper para crear elementos DOM directamente (Evita problemas de onclick con strings)
    const createItemElement = (text, type, idx, isCard = false) => {
        const div = document.createElement('div');
        div.className = 'cat-item'; // Sigue siendo el contenedor principal

        // Contenedor para el texto y las acciones
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'flex items-center gap-2';
        
        const actions = document.createElement('div');
        actions.className = 'cat-actions';
        
        const btnEdit = document.createElement('button');
        btnEdit.className = 'cat-btn cat-edit';
        btnEdit.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L14.732 3.732z" /></svg>`;
        btnEdit.title = 'Editar';
        btnEdit.onclick = function() { isCard ? editCard(idx) : editCat(type, idx); };
        
        const btnDel = document.createElement('button');
        btnDel.className = 'cat-btn cat-delete';
        btnDel.innerHTML = `<svg xmlns="http://www Putin.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>`;
        btnDel.title = 'Eliminar';
        btnDel.onclick = function() { isCard ? delCard(idx) : delCat(type, idx); };
        
        actions.appendChild(btnEdit);
        actions.appendChild(btnDel);

        const span = document.createElement('div');
        span.className = 'text-sm text-gray-700';
        span.innerHTML = isCard ? `${text.name} <span class="block text-xs text-gray-400">${fmtMoney(text.limit)}</span>` : text;

        div.appendChild(span);
        div.appendChild(actions);
        return div; // El CSS de .cat-item se encarga del resto
    };

    // Render Ingresos
    data.categories.income.forEach((c, i) => {
        incList.appendChild(createItemElement(c, 'income', i));
    });

    // Render Gastos
    data.categories.expense.forEach((c, i) => {
        if (!data.creditCards.some(card => card.name === c)) {
            expList.appendChild(createItemElement(c, 'expense', i));
        }
    });

    // Render Tarjetas
    data.creditCards.forEach((c, i) => {
        cardList.appendChild(createItemElement(c, null, i, true));
    });
}

function renderSummary() {
    const income = data.transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = data.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const saving = data.transactions.filter(t => t.type === 'saving').reduce((s, t) => s + t.amount, 0);
    
    document.getElementById('total-balance').innerText = fmtMoney(income - expense - saving);
    document.getElementById('total-income').innerText = fmtMoney(income);
    document.getElementById('total-expense').innerText = fmtMoney(expense);
}

function renderHistory() {
    const list = document.getElementById('history-filter');
    const listContainer = document.getElementById('history-list');
    const filter = list.value;
    listContainer.innerHTML = '';

    const filtered = data.transactions
        .filter(t => !filter || t.category === filter)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    filtered.forEach(t => {
        let border = t.type === 'income' ? 'border-l-green-500' : t.type === 'saving' ? 'border-l-purple-500' : 'border-l-red-500';
        let color = t.type === 'income' ? 'text-green-600' : t.type === 'saving' ? 'text-purple-600' : 'text-red-600';
        let sign = t.type === 'income' ? '+' : '-';

        // Botones de historial también convertidos a onclick directo por seguridad
        const item = document.createElement('div');
        item.className = `history-item ${border}`;
        item.innerHTML = ` 
            <div class="flex-1 pr-4">
                <div class="text-lg font-semibold text-slate-800 dark:text-slate-200">${t.desc}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">${t.category}</div>
            </div>
            <div class="flex items-center justify-end gap-4 text-sm">
                <div class="text-xs text-gray-400">${fmtDate(t.date)}</div>
                <div class="text-right font-bold ${color} w-24">${sign}${fmtMoney(t.amount)}</div>
                <div class="flex gap-2" id="hist-actions-${t.id}"></div>
            </div>
        `;
        listContainer.appendChild(item);

        // Agregar botones manualmente para asegurar onclick
        const actionsDiv = document.getElementById(`hist-actions-${t.id}`);
        
        const btnEd = document.createElement('button');
        btnEd.className = 'edit-btn';
        btnEd.innerText = '✏️';
        btnEd.onclick = () => editTx(t.id);
        
        const btnDel = document.createElement('button');
        btnDel.className = 'edit-btn text-red-400';
        btnDel.innerText = '🗑️';
        btnDel.onclick = () => delTx(t.id);
        
        actionsDiv.appendChild(btnEd);
        actionsDiv.appendChild(btnDel);
    });
    
    if (list.children.length === 0) {
         const allCats = new Set([...data.categories.income, ...data.categories.expense, 'Ahorros']);
         list.innerHTML = '<option value="">Todas</option>' + [...allCats].map(c => `<option value="${c}">${c}</option>`).join('');
    }
}

function renderCC(filter = null) {
    const activeFilter = filter || document.querySelector('.cc-filter-btn.active')?.dataset.cat || 'all';
    const container = document.getElementById('cc-filter-container');
    
    let filtersHTML = `<button class="cc-filter-btn ${activeFilter === 'all' ? 'active' : ''}" onclick="renderCC('all')" data-cat="all">Todas</button>`;
    data.creditCards.forEach(card => {
        filtersHTML += `<button class="cc-filter-btn ${activeFilter === card.name ? 'active' : ''}" onclick="renderCC('${card.name}')" data-cat="${card.name}">${card.name}</button>`;
    });
    container.innerHTML = filtersHTML;

    const thead = document.getElementById('projection-header');
    const tbody = document.getElementById('projection-body');
    
    // --- Lógica para cabecera de 2 niveles (Año y Mes) ---
    let yearHeaderHTML = '<tr><th rowspan="2" class="sticky left-0 bg-slate-50 dark:bg-slate-700 z-10 shadow-sm border-r border-b border-slate-200 dark:border-slate-600 px-3 align-middle">Tarjeta</th>';
    let monthHeaderHTML = '<tr>';
    
    let d = new Date(); d.setDate(1); 
    const months = [];
    const yearGroups = {};

    // Primer recorrido para agrupar meses por año
    for(let i=0; i<12; i++) {
        months.push(new Date(d));
        const year = d.getFullYear();
        yearGroups[year] = (yearGroups[year] || 0) + 1;
        d.setMonth(d.getMonth()+1);
    }

    // Construir fila de Años
    for (const year in yearGroups) {
        yearHeaderHTML += `<th colspan="${yearGroups[year]}" class="text-center font-semibold text-slate-700 py-1 border-b border-slate-200">${year}</th>`;
    }
    yearHeaderHTML += '</tr>';

    // Construir fila de Meses
    months.forEach(m => {
        monthHeaderHTML += `<th class="text-center min-w-[80px] py-2 capitalize font-medium text-sm text-slate-600">${m.toLocaleString('es-CL',{month:'short'})}</th>`;
    });
    monthHeaderHTML += '</tr>';
    thead.innerHTML = yearHeaderHTML + monthHeaderHTML;
    tbody.innerHTML = '';
    const relevantPurchases = data.purchases.filter(p => activeFilter === 'all' || p.cat === activeFilter);
    
    const byCardFuture = {}; // Cuotas pendientes
    const byCardPaid = {};   // Cuotas ya pagadas

    relevantPurchases.forEach(p => {
        if (!byCardFuture[p.cat]) byCardFuture[p.cat] = new Array(12).fill(0);
        if (!byCardPaid[p.cat]) byCardPaid[p.cat] = new Array(12).fill(0);

        let pDate = new Date(p.start + 'T00:00:00');
        let quota = Math.round(p.total / p.cuotas);
        for(let i=0; i<p.cuotas; i++) {
            let mIdx = months.findIndex(m => m.getMonth() === pDate.getMonth() && m.getFullYear() === pDate.getFullYear());
            if (mIdx >= 0) {
                if (i < p.paid) { // Es una cuota pagada
                    byCardPaid[p.cat][mIdx] += quota;
                } else { // Es una cuota futura
                    byCardFuture[p.cat][mIdx] += quota;
                }
            }
            pDate.setMonth(pDate.getMonth()+1);
        }
    });

    const monthlyTotals = new Array(12).fill(0);
    for (const card in byCardFuture) {
        byCardFuture[card].forEach((amount, index) => monthlyTotals[index] += amount);
    }

    const allCards = new Set([...Object.keys(byCardFuture), ...Object.keys(byCardPaid)]);
    allCards.forEach(card => {
        let row = `<tr><td class="sticky left-0 bg-slate-50 font-bold text-slate-800 shadow-sm border-r border-slate-200 px-3 py-2">${card}</td>`;
        for (let i = 0; i < 12; i++) {
            const paid = byCardPaid[card]?.[i] || 0;
            const future = byCardFuture[card]?.[i] || 0;
            if (paid > 0) row += `<td class="text-right text-white bg-green-500 font-semibold px-3 py-2" title="Pagado">${fmtMoney(paid)}</td>`;
            else if (future > 0) row += `<td class="text-right text-slate-700 font-medium px-3 py-2">${fmtMoney(future)}</td>`;
            else row += `<td class="text-right text-slate-400 px-3 py-2">-</td>`;
        }
        tbody.innerHTML += row + '</tr>';
    });
    if (allCards.size > 0) {
        let totalRow = `<tr class="bg-total-row border-t-2 border-slate-300"><td class="sticky left-0 bg-total-row shadow-sm border-r border-slate-200 px-3 py-2 font-bold text-secondary">Total Mensual</td>`;
        monthlyTotals.forEach(v => {
            totalRow += `<td class="text-right px-3 py-2 font-bold text-primary">${v > 0 ? fmtMoney(v) : '-'}</td>`;
        });
        tbody.innerHTML += totalRow + '</tr>';
    }

    const activeBody = document.getElementById('active-purchases-body');
    activeBody.innerHTML = '';
    relevantPurchases.filter(p => p.paid < p.cuotas).forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${p.desc}</td><td>${p.cat}</td><td class="text-right">${fmtMoney(Math.round(p.total/p.cuotas))}</td><td class="text-right">${p.cuotas - p.paid} de ${p.cuotas}</td>`;
        
        const actionsContainer = document.createElement('td');
        actionsContainer.className = 'text-right';

        const btnPay = document.createElement('button');
        btnPay.className = 'table-action-btn pay-btn';
        btnPay.title = 'Pagar Cuota';
        btnPay.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>`;
        btnPay.onclick = () => payQuota(p.id);

        const btnDel = document.createElement('button');
        btnDel.className = 'table-action-btn delete-btn';
        btnDel.title = 'Eliminar Compra';
        btnDel.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`;
        btnDel.onclick = () => delPurchase(p.id);

        actionsContainer.appendChild(btnPay);
        actionsContainer.appendChild(btnDel);
        tr.appendChild(actionsContainer);
        activeBody.appendChild(tr);
    });

    const histBody = document.getElementById('cc-history-body');
    histBody.innerHTML = '';
    data.transactions
        .filter(t => t.type === 'expense' && data.creditCards.some(c => c.name === t.category) && (activeFilter === 'all' || t.category === activeFilter))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach(t => {
            histBody.innerHTML += `<tr><td>${t.desc}</td><td>${t.category}</td><td>${fmtDate(t.date)}</td><td class="text-right text-red-600">-${fmtMoney(t.amount)}</td></tr>`;
        });
}

function renderSavings() {
    const total = data.transactions.filter(t => t.type === 'saving').reduce((s, t) => s + t.amount, 0);
    document.getElementById('savings-total').innerText = fmtMoney(total);
    const tbody = document.getElementById('savings-table-body');
    tbody.innerHTML = '';
    data.transactions.filter(t => t.type === 'saving').sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach(t => {
            tbody.innerHTML += `<tr><td>${t.desc}</td><td>${fmtDate(t.date)}</td><td class="text-right font-bold text-purple-600">${fmtMoney(t.amount)}</td></tr>`;
        });
}

// --- LÓGICA REPORTES ---
const reportMonthSel = document.getElementById('report-month-select');
const reportYearSel = document.getElementById('report-year-select');

function setupReportFilters() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Llenar meses
    const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    reportMonthSel.innerHTML = months.map((m, i) => `<option value="${i}" ${i === currentMonth ? 'selected' : ''}>${m}</option>`).join('');

    // Llenar años (desde el año de la primera transacción hasta hoy)
    const firstYear = data.transactions.length > 0 ? new Date(data.transactions.sort((a,b) => new Date(a.date) - new Date(b.date))[0].date).getFullYear() : currentYear;
    let yearsHTML = '';
    for (let y = currentYear; y >= firstYear; y--) {
        yearsHTML += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
    }
    reportYearSel.innerHTML = yearsHTML;

    reportMonthSel.addEventListener('change', renderExpenseChart);
    reportYearSel.addEventListener('change', renderExpenseChart);
}

function renderExpenseChart() {
    const canvas = document.getElementById('expense-chart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const ccCanvas = document.getElementById('credit-card-chart');
    const ccCtx = ccCanvas.getContext('2d');

    if (expenseChartInstance) expenseChartInstance.destroy();
    if (creditCardChartInstance) creditCardChartInstance.destroy();
    
    const selectedMonth = parseInt(reportMonthSel.value);
    const selectedYear = parseInt(reportYearSel.value);

    const generalExpenses = {};
    const creditCardExpenses = {};

    const monthlyTransactions = data.transactions.filter(t => {
        const d = new Date(t.date + 'T00:00:00');
        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });

    monthlyTransactions.filter(t => t.type === 'expense').forEach(t => {
        if (data.creditCards.some(c => c.name === t.category)) {
            // Es un gasto con tarjeta de crédito
            creditCardExpenses[t.category] = (creditCardExpenses[t.category] || 0) + t.amount;
        } else {
            // Es un gasto general
            generalExpenses[t.category] = (generalExpenses[t.category] || 0) + t.amount;
        }
    });

    // --- CÁLCULO DE DEUDA TOTAL POR TARJETA (NUEVA LÓGICA) ---
    // Ya no se basa en el mes seleccionado, sino en el estado actual de la deuda.
    const totalDebtByCard = {};
    data.purchases
        .filter(p => p.paid < p.cuotas) // Solo compras con deuda pendiente
        .forEach(p => {
            const quotaAmount = Math.round(p.total / p.cuotas);
            const remainingDebt = (p.cuotas - p.paid) * quotaAmount;
            totalDebtByCard[p.cat] = (totalDebtByCard[p.cat] || 0) + remainingDebt;
        });

    // Paleta de colores reutilizable
    const colorPalette = [
        '#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899',
        '#6366F1', '#14B8A6', '#F97316', '#65A30D', '#D946EF', '#0EA5E9',
        '#78716C', '#DC2626', '#2563EB', '#FBBF24'
    ];

    // --- GRÁFICO DE USO DE CUPO ACTUALIZADO ---
    const usageData = { labels: [], spent: [], limits: [], percentages: [] };
    data.creditCards.forEach(card => {
        usageData.labels.push(card.name);
        // Usamos la deuda total calculada en lugar de los gastos del mes.
        const currentDebt = totalDebtByCard[card.name] || 0;
        usageData.spent.push(currentDebt);
        usageData.limits.push(card.limit);
        // Calculamos el porcentaje de uso. Si el límite es 0, el uso es 0.
        const percentage = card.limit > 0 ? (currentDebt / card.limit) * 100 : 0;
        usageData.percentages.push(percentage);
    });

    if (creditCardChartInstance) creditCardChartInstance.destroy();
    creditCardChartInstance = new Chart(ccCtx, {
        type: 'bar',
        data: {
            labels: usageData.labels,
            datasets: [{
                label: '% de Cupo Utilizado',
                data: usageData.percentages, // Usamos los porcentajes para la longitud de la barra
                backgroundColor: (context) => {
                    const value = context.raw || 0;
                    if (value > 90) return '#dc2626'; // Rojo oscuro si está casi al límite
                    if (value > 75) return '#f59e0b'; // Naranja si está alto
                    return '#10b981'; // Verde si el uso es bajo/moderado
                },
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y', // Barras horizontales
            responsive: true, maintainAspectRatio: false,
            scales: { 
                x: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } } // Eje X de 0 a 100%
            },
            plugins: { 
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => `Gasto: ${fmtMoney(usageData.spent[c.dataIndex])} de ${fmtMoney(usageData.limits[c.dataIndex])}` } }
            }
        }
    });

    // Función auxiliar para crear la configuración del gráfico
    const createChartConfig = (dataObject, palette) => {
        const hasData = Object.keys(dataObject).length > 0;
        return {
            type: 'doughnut',
            data: {
                labels: hasData ? Object.keys(dataObject) : ['Sin datos'],
                datasets: [{ 
                    data: hasData ? Object.values(dataObject) : [1], 
                    backgroundColor: hasData ? palette : ['#E5E7EB'],
                    borderWidth: hasData ? 1 : 0
                }]
            },
            options: { 
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { position: 'bottom', labels: { padding: 15 } } 
                } 
            }
        };
    };

    // Crear y renderizar ambos gráficos
    expenseChartInstance = new Chart(ctx, createChartConfig(generalExpenses, colorPalette)); // El de gastos generales se mantiene
    
    const tbody = document.getElementById('monthly-report-body');
    tbody.innerHTML = '';
    monthlyTransactions.sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(t => {
         const typeText = t.type === 'income' ? 'Ingreso' : t.type === 'expense' ? 'Gasto' : 'Ahorro';
         const amountClass = t.type === 'income' ? 'text-green-600' : 'text-red-600';
         tbody.innerHTML += `<tr><td>${t.desc}</td><td>${typeText}</td><td>${t.category}</td><td>${fmtDate(t.date)}</td><td class="text-right font-semibold ${amountClass}">${fmtMoney(t.amount)}</td></tr>`;
    });
}

function renderSavingsChart() {
    const canvas = document.getElementById('savings-chart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    if (savingsChartInstance) savingsChartInstance.destroy();

    const monthlySavings = {};
    const months = [];
    const today = new Date();
    
    for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${d.getMonth()}`; 
        const label = d.toLocaleString('es-CL', { month: 'short' });
        monthlySavings[key] = 0;
        months.push({ key, label });
    }

    data.transactions.filter(t => t.type === 'saving').forEach(t => {
        const d = new Date(t.date + 'T00:00:00');
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (monthlySavings.hasOwnProperty(key)) monthlySavings[key] += t.amount;
    });

    const values = months.map(m => monthlySavings[m.key]);
    const labels = months.map(m => m.label);

    savingsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ahorro Mensual',
                data: values,
                backgroundColor: '#9333EA',
                borderRadius: 4
            }]
        },
        options: {
            scales: { y: { beginAtZero: true } },
            plugins: { legend: { display: false } }
        }
    });
}

// --- LÓGICA FORMULARIO ---
const typeSel = document.getElementById('type-select');
const catSel = document.getElementById('category-select');
const btn = document.getElementById('submit-btn');
const amountIn = document.getElementById('amount-input');
const descIn = document.getElementById('desc-input');
const instIn = document.getElementById('installments-input');
const errorMsg = document.getElementById('form-error');

// 1. Función para poblar las categorías cuando cambia el TIPO
function populateCategories(selectedCategory = null) {
    const type = typeSel.value;
    const currentVal = selectedCategory || catSel.value;

    catSel.innerHTML = '';
    const cats = type === 'income' ? data.categories.income : data.categories.expense;
    cats.forEach(c => catSel.innerHTML += `<option value="${c}">${c}</option>`);

    // Si la categoría actual (o la pasada como argumento) existe en la nueva lista, la seleccionamos.
    if (currentVal && cats.includes(currentVal)) catSel.value = currentVal;
}

// 2. Función para actualizar la UI del formulario (colores, visibilidad de campos)
function updateFormUI() {
    const type = typeSel.value;
    const category = catSel.value;

    const instSec = document.getElementById('installments-section');
    const descDateWrapper = document.getElementById('desc-date-wrapper');
    const transactionDateSec = document.getElementById('transaction-date-section');

    document.getElementById('category-wrapper').style.display = type === 'saving' ? 'none' : 'block';

    const isCC = type === 'expense' && data.creditCards.some(c => c.name === category);
    instSec.classList.toggle('hidden', !isCC);
    descDateWrapper.classList.toggle('md:grid-cols-1', isCC);
    transactionDateSec.classList.toggle('hidden', isCC);

    if(type === 'income') { btn.className = "w-full py-3 px-4 rounded-lg text-white font-bold bg-green-600 hover:bg-green-700"; btn.innerText = "Agregar Ingreso"; }
    else if(type === 'expense') {
        btn.className = isCC ? "w-full py-3 px-4 rounded-lg text-white font-bold bg-teal-600 hover:bg-teal-700" : "w-full py-3 px-4 rounded-lg text-white font-bold bg-red-600 hover:bg-red-700";
        btn.innerText = isCC ? "Agregar Compra Cuotas" : "Agregar Gasto";
    }
    else { btn.className = "w-full py-3 px-4 rounded-lg text-white font-bold bg-purple-600 hover:bg-purple-700"; btn.innerText = "Agregar Ahorro"; }
    hideError();
}

function showError() { errorMsg.classList.remove('hidden'); }
function hideError() { errorMsg.classList.add('hidden'); descIn.classList.remove('input-error'); amountIn.classList.remove('input-error'); instIn.classList.remove('input-error'); document.getElementById('installments-date-input').classList.remove('input-error'); }

typeSel.addEventListener('change', () => { populateCategories(); updateFormUI(); });
catSel.addEventListener('change', updateFormUI);
amountIn.addEventListener('input', (e) => e.target.value = fmtInput(parseMoney(e.target.value)));
document.getElementById('new-card-limit').addEventListener('input', (e) => e.target.value = fmtInput(parseMoney(e.target.value)));

document.getElementById('transaction-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseMoney(amountIn.value);
    const desc = descIn.value.trim();
    const type = typeSel.value;
    const cat = type === 'saving' ? 'Ahorros' : catSel.value;
    
    const cuotas = parseInt(instIn.value) || 0;
    const installmentsDateVal = document.getElementById('installments-date-input').value;
    
    let isValid = true;
    if (!desc) { descIn.classList.add('input-error'); isValid = false; }
    if (amount <= 0) { amountIn.classList.add('input-error'); isValid = false; }
    const isCC = type === 'expense' && data.creditCards.some(c => c.name === cat);
    if (isCC && cuotas > 0 && !installmentsDateVal) { document.getElementById('installments-date-input').classList.add('input-error'); isValid = false; }

    if (!isValid) { showError(); return; }

    const transactionDate = document.getElementById('transaction-date-input').value;
    if(isCC && cuotas > 0) {
        data.purchases.push({ id: Date.now(), cat, desc, total: amount, cuotas, start: installmentsDateVal, paid: 0 });
    } else if (editId) {
        const idx = data.transactions.findIndex(t => t.id === editId);
        if (idx >= 0) data.transactions[idx] = { ...data.transactions[idx], type, category: cat, desc, amount, date: transactionDate };
        editId = null;
        document.getElementById('form-title').innerText = "Nueva Transacción";
    } else {
        data.transactions.push({ id: Date.now(), type, category: cat, desc, amount, date: transactionDate });
    }

    // Resetear fecha solo si no estamos editando
    if (!editId) document.getElementById('transaction-date-input').valueAsDate = new Date();
    
    saveData(); e.target.reset(); populateCategories(); updateFormUI();
});

document.getElementById('user-info-form').addEventListener('submit', (e) => {
    e.preventDefault();
    data.userInfo.name = document.getElementById('user-name-input').value.trim();
    data.userInfo.email = document.getElementById('user-email-input').value.trim();
    const phoneCode = document.getElementById('user-phone-code-select').value;
    const phoneNumber = document.getElementById('user-phone-input').value.trim();
    data.userInfo.phone = phoneNumber ? `${phoneCode} ${phoneNumber}` : '';
    saveData();
    alert('Información guardada con éxito.');
});



document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(btn.dataset.page).classList.remove('hidden');
        btn.classList.add('active');
        const page = btn.dataset.page;
        if(page === 'reports-page') {
            setupReportFilters();
            renderExpenseChart(); 
        }
        if(page === 'savings-page') renderSavingsChart();
    });
});

// --- LÓGICA DEL TEMA (MODO CLARO/OSCURO) ---
const themeToggle = document.getElementById('theme-toggle');
themeToggle.addEventListener('change', () => {
    // Usamos el sistema de clases de Tailwind.
    // Si el toggle está 'checked', añadimos la clase 'dark' al <html>.
    // Si no, la quitamos.
    // Tailwind se encarga del resto gracias a los prefijos `dark:`.
    document.documentElement.classList.toggle('dark', themeToggle.checked);
});

// Expone renderCC globalmente
window.renderCC = renderCC;

document.getElementById('pdf-btn').addEventListener('click', () => {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        
        const selectedMonth = parseInt(reportMonthSel.value);
        const selectedYear = parseInt(reportYearSel.value);
        const monthName = reportMonthSel.options[reportMonthSel.selectedIndex].text;
        const generationDate = new Date().toLocaleDateString('es-CL');
        let lastY = 20; // Posición Y inicial

        // --- 1. ENCABEZADO ---
        doc.setFontSize(22);
        doc.setFont(undefined, 'bold');
        doc.text('Reporte Financiero', 14, lastY);
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Periodo: ${monthName} ${selectedYear}`, 14, lastY + 7);
        
        doc.setFontSize(8);
        doc.setTextColor(100);
        const rightMargin = 196; // Margen derecho para el texto (A4 width is 210mm)
        doc.text(`Generado el: ${generationDate}`, rightMargin, lastY, { align: 'right' });
        
        if (data.userInfo && data.userInfo.name) doc.text(data.userInfo.name, rightMargin, lastY + 5, { align: 'right' });
        if (data.userInfo && data.userInfo.email) doc.text(data.userInfo.email, rightMargin, lastY + 9, { align: 'right' });
        if (data.userInfo && data.userInfo.phone) doc.text(data.userInfo.phone, rightMargin, lastY + 13, { align: 'right' });

        // Línea separadora del encabezado
        doc.setDrawColor(220, 220, 220); // Gris claro
        doc.line(14, lastY + 18, 196, lastY + 18);
        lastY += 28;

        // --- 2. HISTORIAL DE TRANSACCIONES CON COLORES ---
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Transacciones del Mes', 14, lastY);
        lastY += 7;

        const monthlyTransactions = data.transactions
            .filter(t => {
                const d = new Date(t.date + 'T00:00:00');
                return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
            })
            .sort((a,b) => new Date(b.date) - new Date(a.date));

        const transactionBody = monthlyTransactions.map(t => {
            let row = {
                desc: t.desc,
                type: t.type === 'income' ? 'Ingreso' : (t.type === 'expense' ? 'Gasto' : 'Ahorro'),
                category: t.category,
                date: fmtDate(t.date),
                // Dejamos el monto como número para poder aplicar estilos de color después
                amount: t.amount,
                styles: {
                    // No se necesitan estilos de fondo
                }
            };
            return row;
        });

        doc.autoTable({
            head: [['Descripción', 'Tipo', 'Categoría', 'Fecha', 'Monto']],
            body: transactionBody.map(row => [row.desc, row.type, row.category, row.date, fmtMoney(row.amount)]),
            startY: lastY,
            theme: 'grid', // Usamos el tema 'grid' para tener todos los bordes
            headStyles: {
                fillColor: [243, 244, 246], // Un gris muy claro para el encabezado (bg-slate-100)
                textColor: [75, 85, 99], // Texto gris oscuro (text-gray-500)
                fontStyle: 'bold'
            },
            styles: {
                lineWidth: 0.1, // Línea delgada
                lineColor: [229, 231, 235] // Color de borde gris claro (border-gray-200)
            },
            didDrawCell: (data) => {
                // Dibujar bordes redondeados para la tabla completa
                if (data.table.finalY > 0 && data.row.index === data.table.body.length - 1 && data.column.index === data.table.columns.length - 1) {
                    doc.setDrawColor(229, 231, 235); // Color del borde
                    doc.roundedRect(data.table.startX, data.table.startY, data.table.width, data.table.height, 3, 3, 'S');
                }
            },
            didParseCell: (data) => {
                // Colorear el texto del monto según el tipo de transacción
                if (data.column.dataKey === 4) { // Columna de Monto
                    const type = monthlyTransactions[data.row.index].type;
                    if (type === 'income') data.cell.styles.textColor = '#16a34a'; // Verde
                    if (type === 'expense') data.cell.styles.textColor = '#dc2626'; // Rojo
                    if (type === 'saving') data.cell.styles.textColor = '#9333ea'; // Morado
                }
            }
        });

        lastY = doc.lastAutoTable.finalY + 10;

        // --- 3. SECCIÓN DE TARJETAS DE CRÉDITO ---
        doc.setDrawColor(220, 220, 220);
        doc.line(14, lastY - 5, 196, lastY - 5);
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('Análisis de Tarjetas de Crédito', 14, lastY);
        lastY += 10;

        // --- 3.2. Tabla de Compras Activas ---
        const activePurchases = data.purchases.filter(p => p.paid < p.cuotas);
        if (activePurchases.length > 0) {
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('Detalle de Compras Activas', 14, lastY);
            const activePurchasesBody = activePurchases.map(p => [
                p.desc, p.cat, fmtMoney(Math.round(p.total/p.cuotas)), `${p.paid} de ${p.cuotas}`
            ]);
            doc.autoTable({
                head: [['Descripción', 'Tarjeta', 'Monto Cuota', 'Pagadas']],
                body: activePurchasesBody,
                startY: lastY + 5,
                theme: 'grid',
                headStyles: { fillColor: [243, 244, 246], textColor: [75, 85, 99], fontStyle: 'bold' },
                styles: { lineWidth: 0.1, lineColor: [229, 231, 235] },
                didDrawCell: (data) => {
                    if (data.table.finalY > 0 && data.row.index === data.table.body.length - 1 && data.column.index === data.table.columns.length - 1) { doc.roundedRect(data.table.startX, data.table.startY, data.table.width, data.table.height, 3, 3, 'S'); }
                }
            });
            lastY = doc.lastAutoTable.finalY + 10;
        }

        // --- 3.3. Tabla de Proyección de Pagos ---
        // Reutilizamos la lógica de renderCC para la proyección
        const projectionData = (() => {
            const months = [];
            let d = new Date(); d.setDate(1);
            for(let i=0; i<6; i++) { months.push(new Date(d)); d.setMonth(d.getMonth()+1); }
            
            const byCard = {};
            data.purchases.filter(p => p.paid < p.cuotas).forEach(p => {
                if (!byCard[p.cat]) byCard[p.cat] = new Array(6).fill(0);
                let pDate = new Date(p.start + 'T00:00:00');
                let quota = Math.round(p.total / p.cuotas);
                for(let i=p.paid; i<p.cuotas; i++) {
                    let mIdx = months.findIndex(m => m.getMonth() === pDate.getMonth() && m.getFullYear() === pDate.getFullYear());
                    if (mIdx >= 0) byCard[p.cat][mIdx] += quota;
                    pDate.setMonth(pDate.getMonth()+1);
                }
            });
            return { months, byCard };
        })();

        if (Object.keys(projectionData.byCard).length > 0) {
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('Proyección de Pagos Futuros', 14, lastY);
            
            const projectionHeader = ['Tarjeta', ...projectionData.months.map(m => m.toLocaleString('es-CL',{month:'short'}))];
            const projectionBody = Object.keys(projectionData.byCard).map(card => [card, ...projectionData.byCard[card].map(v => v > 0 ? fmtMoney(v) : '-')]);
            
            doc.autoTable({
                head: [projectionHeader],
                body: projectionBody,
                startY: lastY + 5,
                theme: 'grid',
                headStyles: { fillColor: [243, 244, 246], textColor: [75, 85, 99], fontStyle: 'bold' },
                styles: { lineWidth: 0.1, lineColor: [229, 231, 235] },
                didDrawCell: (data) => {
                    if (data.table.finalY > 0 && data.row.index === data.table.body.length - 1 && data.column.index === data.table.columns.length - 1) { doc.roundedRect(data.table.startX, data.table.startY, data.table.width, data.table.height, 3, 3, 'S'); }
                }
            });
            lastY = doc.lastAutoTable.finalY + 10;
        }

        // --- 3. GRÁFICOS ---
        const expenseCanvas = document.getElementById('expense-chart');
        const ccCanvas = document.getElementById('credit-card-chart');

        if (expenseCanvas && ccCanvas) {
            doc.setDrawColor(220, 220, 220);
            doc.line(14, lastY - 5, 196, lastY - 5);

            const pdfImageWidth = 80; // Ancho fijo para los gráficos en el PDF
            
            // Calcular alto manteniendo la proporción para el primer gráfico
            const expenseAspectRatio = expenseCanvas.width / expenseCanvas.height;
            const expenseImageHeight = pdfImageWidth / expenseAspectRatio;
            const expenseImage = expenseCanvas.toDataURL('image/png', 1.0);

            // Calcular alto manteniendo la proporción para el segundo gráfico
            const ccAspectRatio = ccCanvas.width / ccCanvas.height;
            const ccImageHeight = pdfImageWidth / ccAspectRatio;
            const ccImage = ccCanvas.toDataURL('image/png', 1.0);

            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text('Resumen Gráfico', 14, lastY);
            lastY += 5;

            doc.addImage(expenseImage, 'PNG', 14, lastY, pdfImageWidth, expenseImageHeight);
            doc.addImage(ccImage, 'PNG', 110, lastY, pdfImageWidth, ccImageHeight);
        }

        // --- 4. SECCIÓN DE AHORROS ---
        // Verificamos si hay ahorros para no crear una sección vacía
        const savingsTransactions = data.transactions.filter(t => t.type === 'saving');
        if (savingsTransactions.length > 0) {
            lastY = Math.max(lastY, doc.lastAutoTable.finalY || 0) + 105; // Aseguramos espacio después de los gráficos
            // Corregimos el cálculo de 'lastY'.
            // Tomamos la posición después de la última tabla de tarjetas (si existe)
            // y le sumamos el espacio de los gráficos.
            lastY = (doc.lastAutoTable.finalY || lastY) + 105;

            doc.setDrawColor(220, 220, 220);
            doc.line(14, lastY - 5, 196, lastY - 5);
            doc.setFontSize(16);
            doc.setFont(undefined, 'bold');
            doc.text('Análisis de Ahorros', 14, lastY);
            lastY += 10;

            // --- 4.1. Tabla de Historial de Ahorros ---
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('Historial de Ahorros', 14, lastY);
            const savingsBody = savingsTransactions
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .map(t => [t.desc, fmtDate(t.date), fmtMoney(t.amount)]);
            
            doc.autoTable({
                head: [['Descripción', 'Fecha', 'Monto']],
                body: savingsBody,
                startY: lastY + 5,
                theme: 'grid',
                headStyles: { fillColor: [243, 244, 246], textColor: [75, 85, 99], fontStyle: 'bold' },
                styles: { lineWidth: 0.1, lineColor: [229, 231, 235] },
                didDrawCell: (data) => {
                    if (data.table.finalY > 0 && data.row.index === data.table.body.length - 1 && data.column.index === data.table.columns.length - 1) { doc.roundedRect(data.table.startX, data.table.startY, data.table.width, data.table.height, 3, 3, 'S'); }
                }
            });
            lastY = doc.lastAutoTable.finalY + 10;

            // --- 4.2. Gráfico de Evolución del Ahorro ---
            // Creamos un canvas temporal para renderizar el gráfico sin que esté visible
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 800; tempCanvas.height = 400; // Dimensiones para buena resolución
            const tempCtx = tempCanvas.getContext('2d');
            
            // Reutilizamos la lógica de renderSavingsChart para obtener los datos y renderizar en el canvas temporal
            const savingsData = (() => {
                const monthlySavings = {};
                const months = [];
                const today = new Date();
                for (let i = 5; i >= 0; i--) {
                    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
                    const key = `${d.getFullYear()}-${d.getMonth()}`;
                    const label = d.toLocaleString('es-CL', { month: 'short' });
                    monthlySavings[key] = 0;
                    months.push({ key, label });
                }
                savingsTransactions.forEach(t => {
                    const d = new Date(t.date + 'T00:00:00');
                    const key = `${d.getFullYear()}-${d.getMonth()}`;
                    if (monthlySavings.hasOwnProperty(key)) monthlySavings[key] += t.amount;
                });
                return { labels: months.map(m => m.label), values: months.map(m => monthlySavings[m.key]) };
            })();

            new Chart(tempCtx, { type: 'bar', data: { labels: savingsData.labels, datasets: [{ label: 'Ahorro Mensual', data: savingsData.values, backgroundColor: '#9333EA', borderRadius: 4 }] }, options: { scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } } });

            const savingsImage = tempCanvas.toDataURL('image/png', 1.0);
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('Evolución del Ahorro (Últimos 6 Meses)', 14, lastY);
            doc.addImage(savingsImage, 'PNG', 14, lastY + 5, 180, 90);
        }

        doc.save(`Reporte_${monthName}_${selectedYear}.pdf`);
    } catch (error) {
        console.error("Error al generar el PDF:", error);
        alert("Hubo un error al generar el PDF. Revisa la consola para más detalles.");
    }
});

// --- LÓGICA DE AUTENTICACIÓN ---
const loginSection = document.getElementById('login-section');
const appContent = document.getElementById('app-content');
const authError = document.getElementById('auth-error');

auth.onAuthStateChanged(user => {
    if (user) {
        // Usuario está logueado
        loginSection.classList.add('hidden');
        appContent.classList.remove('hidden');
        loadUserData(user.uid); // Cargar datos del usuario desde Firestore
    } else {
        // Usuario no está logueado
        loginSection.classList.remove('hidden');
        appContent.classList.add('hidden');
        
        // Limpiar datos y listeners anteriores
        data = {};
        unsubscribeListeners.forEach(unsub => unsub());
        unsubscribeListeners = [];
    }
});

async function loadUserData(userId) {
    // Usamos onSnapshot para escuchar cambios en tiempo real en el documento del usuario.
    const userDocRef = db.collection('users').doc(userId);

    const unsubscribe = userDocRef.onSnapshot(async (doc) => {
        if (doc.exists) {
            // El documento existe, usamos sus datos.
            data = doc.data();
            console.log("Datos cargados/actualizados desde Firestore.");
        } else {
            // Es un usuario nuevo, creamos su documento con los datos por defecto.
            console.log("Usuario nuevo, creando documento en Firestore.");
            data = defaultData;
            await userDocRef.set(data); // El listener detectará esta escritura y volverá a ejecutar este bloque.
        }
        
        // Con los datos ya cargados (o actualizados), renderizamos la UI.
        // Llamamos a las funciones por separado para la inicialización.
        populateCategories();
        updateFormUI();
        render();

        // Establecer la fecha actual en el formulario de transacción
        document.getElementById('transaction-date-input').valueAsDate = new Date();
    });

    // Guardamos la función de 'unsubscribe' para poder llamarla al hacer logout.
    unsubscribeListeners.push(unsubscribe);
}

document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());

// --- LÓGICA DEL FORMULARIO DE LOGIN/REGISTRO ---
const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const googleLoginBtn = document.getElementById('google-login-btn');
const toggleFormLink = document.getElementById('show-register'); // Renombrado para claridad
const formTitle = loginSection.querySelector('h1');
const submitBtn = loginForm.querySelector('button[type="submit"]');

let isRegisterMode = false;

function toggleRegisterMode() {
    isRegisterMode = !isRegisterMode;
    authError.textContent = '';
    loginForm.reset();

    if (isRegisterMode) {
        formTitle.textContent = 'Crea tu Cuenta';
        submitBtn.textContent = 'Registrarse';
        toggleFormLink.innerHTML = '¿Ya tienes cuenta? <span class="font-medium text-blue-600 hover:underline">Inicia sesión</span>';
    } else {
        formTitle.textContent = 'Gestor de Finanzas';
        submitBtn.textContent = 'Iniciar Sesión';
        toggleFormLink.innerHTML = '¿No tienes cuenta? <a href="#" class="font-medium text-blue-600 hover:underline">Regístrate aquí</a>';
    }
}

toggleFormLink.addEventListener('click', (e) => {
    e.preventDefault();
    toggleRegisterMode();
});

// Iniciar sesión con Email y Contraseña
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = ''; // Limpiar errores previos
    const email = loginEmail.value;
    const password = loginPassword.value;

    try {
        if (isRegisterMode) {
            // --- MODO REGISTRO ---
            await auth.createUserWithEmailAndPassword(email, password);
            // Firebase iniciará sesión automáticamente y onAuthStateChanged se activará.
        } else {
            // --- MODO LOGIN ---
            await auth.signInWithEmailAndPassword(email, password);
            // onAuthStateChanged se encargará de mostrar la app.
        }
    } catch (error) {
        console.error("Error de autenticación:", error.code, error.message);
        // Mensajes de error más específicos
        switch (error.code) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
                authError.textContent = 'Correo o contraseña incorrectos.';
                break;
            case 'auth/email-already-in-use':
                authError.textContent = 'Este correo ya está registrado. Intenta iniciar sesión.';
                break;
            case 'auth/weak-password':
                authError.textContent = 'La contraseña debe tener al menos 6 caracteres.';
                break;
            default:
                authError.textContent = 'Ocurrió un error. Inténtalo de nuevo.';
        }
    }
});

// Iniciar sesión con Google
googleLoginBtn.addEventListener('click', async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        await auth.signInWithPopup(provider);
        // onAuthStateChanged se encargará de mostrar la app
    } catch (error) {
        console.error("Error con Google:", error);
        authError.textContent = 'No se pudo iniciar sesión con Google.';
    }
});
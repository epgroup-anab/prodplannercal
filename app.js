// App logic extracted from index.html
// Data Storage
let orders = [];
// Machine capacities aligned to provided sheet (bags per shift)
// GM machines: 41,000 bags/shift; NL machines: 32,800 bags/shift
// One day assumed = 3 shifts
let machines = [
    { id: 'MC-GM-1', name: 'GM-1', bagsPerShift: 41000, speed: 150, efficiency: 0.95 },
    { id: 'MC-GM-2', name: 'GM-2', bagsPerShift: 41000, speed: 150, efficiency: 0.95 },
    { id: 'MC-GM-3', name: 'GM-3', bagsPerShift: 41000, speed: 150, efficiency: 0.95 },
    { id: 'MC-GM-4', name: 'GM-4', bagsPerShift: 41000, speed: 150, efficiency: 0.95 },
    { id: 'MC-GM-5', name: 'GM-5', bagsPerShift: 41000, speed: 150, efficiency: 0.95 },
    { id: 'MC-GM-6', name: 'GM-6', bagsPerShift: 41000, speed: 150, efficiency: 0.95 },
    { id: 'MC-NL-1', name: 'NL-1', bagsPerShift: 32800, speed: 80, efficiency: 0.90 },
    { id: 'MC-NL-2', name: 'NL-2', bagsPerShift: 32800, speed: 80, efficiency: 0.90 }
];
let schedule = {};
let currentDate = new Date();
let importedData = null;
let isProcessingUpload = false;

// File Upload Handling
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');

if (uploadArea && fileInput) {
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });
}

function handleFiles(files) {
    if (files.length === 0 || isProcessingUpload) return;
    isProcessingUpload = true;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
            processExcelData(jsonData);
        } catch (err) {
            console.error('Upload parse error:', err);
            alert('Could not read the file. Please verify the format and try again.');
        } finally {
            fileInput.value = '';
            isProcessingUpload = false;
        }
    };
    reader.onerror = function() {
        alert('Error reading file. Please try again.');
        fileInput.value = '';
        isProcessingUpload = false;
    };
    reader.readAsArrayBuffer(file);
}

function processExcelData(data) {
    importedData = [];
    orders = [];
    schedule = {};
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row[0]) {
            const bagsPerCarton = parseFloat(row[5]) || 250;
            const currentStockCartons = parseFloat(row[6]) || 0;
            const weekCover = parseFloat(row[7]) || 0;
            const weeks = [];
            for (let w = 1; w <= 9; w++) {
                const val = parseFloat(row[8 + w]) || 0;
                weeks[w] = val;
            }
            const monthlyReqCartons = parseFloat(row[4]) || 0;
            const monthlyReqBags = monthlyReqCartons * bagsPerCarton;
            const totalWeeksPlanned = (weeks[1]||0)+(weeks[2]||0)+(weeks[3]||0)+(weeks[4]||0)+(weeks[5]||0)+(weeks[6]||0)+(weeks[7]||0)+(weeks[8]||0)+(weeks[9]||0);
            if (totalWeeksPlanned === 0 && monthlyReqBags > 0) {
                const weeklyReqBags = Math.ceil(monthlyReqBags / 4);
                const currentStockBags = currentStockCartons * bagsPerCarton;
                const targetStockBags = (weekCover > 0 ? weekCover : 2) * weeklyReqBags;
                const deficitBags = Math.max(0, targetStockBags - currentStockBags);
                const addPerWeek = Math.ceil(deficitBags / 5);
                weeks[1] = weeklyReqBags + addPerWeek;
                weeks[2] = weeklyReqBags + addPerWeek;
                weeks[3] = weeklyReqBags + addPerWeek;
                weeks[4] = weeklyReqBags + addPerWeek;
                weeks[5] = weeklyReqBags + Math.max(0, deficitBags - (addPerWeek * 4));
            }
            const order = {
                sapCode: row[0],
                priority: row[1] ? row[1].toLowerCase().replace(/\s+/g, '-') : 'medium',
                product: row[2] || '',
                rollWidth: parseFloat(row[3]) || 0,
                monthlyReqCartons: monthlyReqCartons,
                bagsPerCarton: bagsPerCarton,
                currentStockCartons: currentStockCartons,
                currentStockBags: currentStockCartons * bagsPerCarton,
                weekCover: weekCover || 2,
                week1: weeks[1] || 0,
                week2: weeks[2] || 0,
                week3: weeks[3] || 0,
                week4: weeks[4] || 0,
                week5: weeks[5] || 0,
                week6: weeks[6] || 0,
                week7: weeks[7] || 0,
                week8: weeks[8] || 0,
                week9: weeks[9] || 0,
                orderType: determineOrderType(row)
            };
            importedData.push(order);
        }
    }
    if (!importedData || importedData.length === 0) {
        alert('No rows detected in the uploaded sheet. Please check and try again.');
        return;
    }
    showImportPreview();
}

function determineOrderType(row) {
    const hasWeeklyPlanning = row[9] || row[10] || row[11] || row[12] || row[13];
    const hasConsistentStock = row[6] > 0;
    return hasConsistentStock && hasWeeklyPlanning ? 'MTS' : 'MTO';
}

function showImportPreview() {
    document.getElementById('importPreview').style.display = 'block';
    const previewTable = document.getElementById('previewTable');
    let html = '<table class="orders-table"><thead><tr>';
    html += '<th>SAP Code</th><th>Type</th><th>Priority</th><th>Product</th>';
    html += '<th>Monthly Req (cartons)</th><th>Stock (cartons)</th><th>Planned (bags)</th>';
    html += '</tr></thead><tbody>';
    importedData.forEach(order => {
        const weekTotal = (order.week1 + order.week2 + order.week3 + order.week4 + order.week5 + order.week6 + order.week7 + order.week8 + order.week9);
        html += `<tr>
            <td>${order.sapCode}</td>
            <td><span class="order-type-badge type-${order.orderType.toLowerCase()}">${order.orderType}</span></td>
            <td><span class="priority-badge priority-${order.priority}">${order.priority.toUpperCase()}</span></td>
            <td>${order.product.substring(0, 30)}...</td>
            <td>${order.monthlyReqCartons}</td>
            <td>${order.currentStockCartons}</td>
            <td>${weekTotal}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    previewTable.innerHTML = html;
}

function confirmImport() {
    if (!importedData || importedData.length === 0) {
        alert('No data to import. Please upload a valid file.');
        return;
    }
    importedData.forEach((data, index) => {
        orders.push({
            id: orders.length + index + 1,
            sapCode: data.sapCode,
            orderType: data.orderType,
            priority: data.priority,
            product: data.product,
            rollWidth: data.rollWidth,
            monthlyReqCartons: data.monthlyReqCartons,
            bagsPerCarton: data.bagsPerCarton || 250,
            currentStockCartons: data.currentStockCartons,
            currentStockBags: data.currentStockBags,
            weekCover: data.weekCover || 2,
            week1: data.week1,
            week2: data.week2,
            week3: data.week3,
            week4: data.week4,
            week5: data.week5,
            week6: data.week6,
            week7: data.week7,
            week8: data.week8,
            week9: data.week9,
            status: 'pending'
        });
    });
    updateOrdersTable();
    updateStockOverview();
    updateStats();
    document.getElementById('importPreview').style.display = 'none';
    document.getElementById('uploadArea').innerHTML = `
        <div class="alert alert-success">
            <strong>✅ Import Successful!</strong> 
            ${importedData.length} orders imported successfully.
        </div>
    `;
    runPlanning();
    importedData = null;
    setTimeout(() => {
        switchTab('orders');
    }, 500);
}

function cancelImport() {
    importedData = null;
    document.getElementById('importPreview').style.display = 'none';
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        if (tab.textContent.toLowerCase().includes(tabName.substring(0, 4))) {
            tab.classList.add('active');
        }
    });
    document.getElementById(tabName).classList.add('active');
    if (tabName === 'calendar') {
        renderCalendar();
    } else if (tabName === 'stock') {
        updateStockOverview();
    } else if (tabName === 'machines') {
        renderMachines();
    }
}

function addOrder() {
    const order = {
        id: orders.length + 1,
        sapCode: document.getElementById('sapCode').value,
        orderType: document.getElementById('orderType').value,
        priority: document.getElementById('priority').value,
        product: document.getElementById('productName').value,
        rollWidth: parseInt(document.getElementById('rollWidth').value) || 0,
        monthlyReqCartons: parseInt(document.getElementById('monthlyReq').value) || 0,
        bagsPerCarton: 250,
        currentStockCartons: parseInt(document.getElementById('currentStock').value) || 0,
        currentStockBags: (parseInt(document.getElementById('currentStock').value) || 0) * 250,
        weekCover: parseInt(document.getElementById('weeklyCover').value) || 2,
        week1: 0, week2: 0, week3: 0, week4: 0, week5: 0,
        status: 'pending'
    };
    if (order.orderType === 'MTS') {
        const weeklyReqBags = Math.ceil((order.monthlyReqCartons * order.bagsPerCarton) / 4);
        const targetStockBags = weeklyReqBags * order.weekCover;
        const deficitBags = Math.max(0, targetStockBags - order.currentStockBags);
        const addPerWeek = Math.ceil(deficitBags / 5);
        order.week1 = addPerWeek + weeklyReqBags;
        order.week2 = addPerWeek + weeklyReqBags;
        order.week3 = addPerWeek + weeklyReqBags;
        order.week4 = addPerWeek + weeklyReqBags;
        order.week5 = deficitBags - (addPerWeek * 4) + weeklyReqBags;
    }
    if (order.sapCode && order.product) {
        orders.push(order);
        updateOrdersTable();
        updateStockOverview();
        clearForm();
        updateStats();
    }
}

function clearForm() {
    document.getElementById('sapCode').value = '';
    document.getElementById('productName').value = '';
    document.getElementById('rollWidth').value = '';
    document.getElementById('monthlyReq').value = '';
    document.getElementById('currentStock').value = '';
    document.getElementById('weeklyCover').value = '2';
}

function updateOrdersTable() {
    const tbody = document.getElementById('ordersBody');
    tbody.innerHTML = '';
    orders.forEach(order => {
        const weeklyReqCartons = (order.monthlyReqCartons || 0) / 4;
        const coverWeeks = weeklyReqCartons > 0 ? (order.currentStockCartons / weeklyReqCartons).toFixed(1) : 0;
        let stockIndicator = '';
        if (order.orderType === 'MTS') {
            if (coverWeeks >= 2) stockIndicator = '<span class="stock-indicator stock-ok">✓ OK</span>';
            else if (coverWeeks >= 1) stockIndicator = '<span class="stock-indicator stock-warning">⚠ Low</span>';
            else stockIndicator = '<span class="stock-indicator stock-critical">⚠ Critical</span>';
        }
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${order.sapCode}</td>
            <td><span class="order-type-badge type-${order.orderType.toLowerCase()}">${order.orderType}</span></td>
            <td><span class="priority-badge priority-${order.priority}">${order.priority.replace('-', ' ').toUpperCase()}</span></td>
            <td title="${order.product}">${order.product.substring(0, 30)}${order.product.length > 30 ? '...' : ''}</td>
            <td>${order.rollWidth} mm</td>
            <td>${order.monthlyReqCartons || 0}</td>
            <td>${order.currentStockCartons || 0} ${stockIndicator}</td>
            <td>${coverWeeks}</td>
            <td>${order.week1 ? Math.floor(order.week1 / (order.bagsPerCarton || 250)) : '-'}</td>
            <td>${order.week2 ? Math.floor(order.week2 / (order.bagsPerCarton || 250)) : '-'}</td>
            <td>${order.week3 ? Math.floor(order.week3 / (order.bagsPerCarton || 250)) : '-'}</td>
            <td>${order.week4 ? Math.floor(order.week4 / (order.bagsPerCarton || 250)) : '-'}</td>
            <td>${order.week5 ? Math.floor(order.week5 / (order.bagsPerCarton || 250)) : '-'}</td>
            <td>${order.week6 ? Math.floor(order.week6 / (order.bagsPerCarton || 250)) : '-'}</td>
            <td>${order.week7 ? Math.floor(order.week7 / (order.bagsPerCarton || 250)) : '-'}</td>
            <td>${order.week8 ? Math.floor(order.week8 / (order.bagsPerCarton || 250)) : '-'}</td>
            <td>${order.week9 ? Math.floor(order.week9 / (order.bagsPerCarton || 250)) : '-'}</td>
            <td><button class="btn" onclick="deleteOrder(${order.id})">Delete</button></td>
        `;
    });
}

function deleteOrder(id) {
    orders = orders.filter(o => o.id !== id);
    updateOrdersTable();
    updateStockOverview();
    updateStats();
}

function updateStockOverview() {
    const stockDiv = document.getElementById('stockOverview');
    const mtsOrders = orders.filter(o => o.orderType === 'MTS');
    stockDiv.innerHTML = '';
    mtsOrders.forEach(order => {
        const weeklyReqCartons = (order.monthlyReqCartons || 0) / 4;
        const coverWeeks = weeklyReqCartons > 0 ? (order.currentStockCartons / weeklyReqCartons) : 0;
        const targetStockCartons = weeklyReqCartons * order.weekCover;
        const stockPercent = targetStockCartons > 0 ? (order.currentStockCartons / targetStockCartons * 100) : 0;
        const card = document.createElement('div');
        card.className = 'stock-card';
        card.innerHTML = `
            <h4>${order.sapCode}</h4>
            <p style="font-size: 12px; color: #6c757d;">${order.product.substring(0, 25)}...</p>
            <div class="stock-level"><span>Current:</span><strong>${order.currentStockCartons || 0} cartons</strong></div>
            <div class="stock-level"><span>Target (${order.weekCover} weeks):</span><strong>${Math.ceil(targetStockCartons)} cartons</strong></div>
            <div class="stock-level"><span>Coverage:</span><strong>${coverWeeks.toFixed(1)} weeks</strong></div>
            <div class="progress-bar"><div class="progress-fill" style="width: ${Math.min(100, stockPercent)}%"></div></div>
        `;
        stockDiv.appendChild(card);
    });
    document.getElementById('mtsCount').textContent = mtsOrders.length;
    const avgCover = mtsOrders.reduce((acc, order) => {
        const weeklyReqCartons = (order.monthlyReqCartons || 0) / 4;
        return acc + (weeklyReqCartons > 0 ? order.currentStockCartons / weeklyReqCartons : 0);
    }, 0) / (mtsOrders.length || 1);
    document.getElementById('avgCover').textContent = avgCover.toFixed(1);
    const critical = mtsOrders.filter(order => {
        const weeklyReqCartons = (order.monthlyReqCartons || 0) / 4;
        return weeklyReqCartons > 0 && (order.currentStockCartons / weeklyReqCartons) < 1;
    }).length;
    document.getElementById('criticalItems').textContent = critical;
}

function renderMachines() {
    const grid = document.getElementById('machineGrid');
    if (!grid) return;
    grid.innerHTML = '';
    machines.forEach(machine => {
        const card = document.createElement('div');
        card.className = 'machine-card';
        const upcoming = [];
        const sortedDates = Object.keys(schedule).sort();
        for (let d of sortedDates) {
            if (upcoming.length >= 5) break;
            const items = (schedule[d] || []).filter(s => s.machine === machine.id);
            items.sort((a,b) => a.shift - b.shift).forEach(it => {
                if (upcoming.length < 5) {
                    const percent = Math.round(((it.quantityBags || 0) / machine.bagsPerShift) * 100);
                    const orderObj = orders.find(o => o.id === it.orderId);
                    const label = orderObj ? `${it.sapCode} - ${orderObj.product}` : it.sapCode;
                    upcoming.push({ date: d, shift: it.shift, label, qty: it.quantityBags||0, percent });
                }
            });
        }
        const upcomingHtml = upcoming.length === 0 
            ? '<div class="product-code">No upcoming allocations</div>' 
            : upcoming.map(u => `<div class="product-code">${u.date} • Shift-${u.shift} • ${u.label} — ${u.qty.toLocaleString()} bags (${u.percent}%)</div>`).join('');
        card.innerHTML = `
            <h3>${machine.name}</h3>
            <div class="machine-info"><span>Capacity (bags/shift):</span><strong>${machine.bagsPerShift.toLocaleString()} bags</strong></div>
            <div class="machine-info"><span>Approx cartons/day:</span><strong>${Math.floor((machine.bagsPerShift * 3) / 250).toLocaleString()} cartons</strong></div>
            <div class="machine-info"><span>Efficiency:</span><strong>${(machine.efficiency * 100).toFixed(0)}%</strong></div>
            <div style="margin-top:10px;"><div class="machine-name">Upcoming:</div>${upcomingHtml}</div>
        `;
        grid.appendChild(card);
    });
}

function renderCalendar() {
    const table = document.getElementById('calendarTable');
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    document.getElementById('calendarTitle').textContent = 
        `Production Calendar - ${new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let html = '<thead><tr>';
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => { html += `<th>${day}</th>`; });
    html += '</tr></thead><tbody><tr>';
    for (let i = 0; i < firstDay; i++) { html += '<td class="no-planning"></td>'; }
    for (let day = 1; day <= daysInMonth; day++) {
        if ((firstDay + day - 1) % 7 === 0 && day !== 1) html += '</tr><tr>';
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const daySchedule = schedule[dateStr] || [];
        const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
        const isWeekend = (firstDay + day - 1) % 7 === 0 || (firstDay + day - 1) % 7 === 6;
        const totalBags = daySchedule.reduce((acc, item) => acc + (item.quantityBags || 0), 0);
        html += `<td class="${isToday ? 'today' : ''} ${isWeekend ? 'no-planning' : ''}" onclick="showDayDetail('${dateStr}')"><div class="calendar-day">${day}</div><div class="calendar-items">`;
        if (!isWeekend && daySchedule.length > 0) {
            daySchedule.slice(0, 3).forEach(item => {
                const order = orders.find(o => o.id === item.orderId);
                const typeClass = order ? order.orderType.toLowerCase() : '';
                const productLabel = order ? ` - ${order.product.substring(0, 12)}${order.product.length > 12 ? '…' : ''}` : '';
                html += `<div class="calendar-item ${typeClass}">${item.sapCode}${productLabel}</div>`;
            });
            if (daySchedule.length > 3) html += `<div class="calendar-item">+${daySchedule.length - 3} more...</div>`;
        } else if (!isWeekend) {
            html += '<div style="color: #ccc;">No planning</div>';
        }
        if (!isWeekend && totalBags > 0) html += `<div class="calendar-item" style="margin-top:6px;font-weight:600;">Total: ${totalBags.toLocaleString()} bags</div>`;
        html += '</div></td>';
    }
    const remainingCells = 7 - ((firstDay + daysInMonth) % 7);
    if (remainingCells < 7) { for (let i = 0; i < remainingCells; i++) { html += '<td class="no-planning"></td>'; } }
    html += '</tr></tbody>';
    table.innerHTML = html;
}

function previousMonth() { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); }
function nextMonth() { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); }
function currentMonth() { currentDate = new Date(); renderCalendar(); }

function showDayDetail(dateStr) {
    const modal = document.getElementById('dayModal');
    const modalDate = document.getElementById('modalDate');
    const modalBody = document.getElementById('modalBody');
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();
    modalDate.textContent = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        modalBody.innerHTML = '<p>No production scheduled on weekends.</p>';
    } else {
        const daySchedule = schedule[dateStr] || [];
        if (daySchedule.length === 0) {
            modalBody.innerHTML = '<p>No production scheduled for this day.</p>';
        } else {
            let html = '';
            for (let shift = 1; shift <= 3; shift++) {
                const totalsByProduct = {};
                const itemsForShift = daySchedule.filter(d => d.shift === shift);
                itemsForShift.forEach(item => { const key = `${item.sapCode}__${item.product}`; totalsByProduct[key] = (totalsByProduct[key] || 0) + item.quantityBags; });
                html += `<div class="shift-section"><div class="shift-title">SHIFT-${shift}</div><div class="machine-schedule">`;
                machines.forEach(machine => {
                    const shiftItems = daySchedule.filter(item => item.shift === shift && item.machine === machine.id);
                    html += `<div class="machine-slot"><div class="machine-name">${machine.name}</div>`;
                    if (shiftItems.length > 0) {
                        shiftItems.forEach(item => {
                            const order = orders.find(o => o.id === item.orderId);
                            const typeLabel = order ? `(${order.orderType})` : '';
                            html += `<div class="product-code">${item.sapCode} - ${item.product} ${typeLabel} — ${item.quantityBags.toLocaleString()} bags</div>`;
                        });
                    } else {
                        html += '<div class="product-code">No planning</div>';
                    }
                    html += '</div>';
                });
                const totalBags = Object.values(totalsByProduct).reduce((a, b) => a + b, 0);
                html += `</div><div style="margin-top:10px; font-size:12px; color:#495057;"><strong>Shift total:</strong> ${totalBags.toLocaleString()} bags<div>` +
                    Object.entries(totalsByProduct).map(([key, qty]) => { const [sap, prod] = key.split('__'); return `<div>- ${sap} - ${prod}: <strong>${qty.toLocaleString()} bags</strong></div>`; }).join('') + `</div></div></div>`;
            }
            const producedTodayByOrder = {};
            daySchedule.forEach(item => { producedTodayByOrder[item.sapCode] = (producedTodayByOrder[item.sapCode] || 0) + (item.quantityBags || 0); });
            const producedToDateByOrder = {};
            const allDates = Object.keys(schedule).sort();
            for (let d of allDates) {
                if (d > dateStr) break;
                (schedule[d] || []).forEach(item => { producedToDateByOrder[item.sapCode] = (producedToDateByOrder[item.sapCode] || 0) + (item.quantityBags || 0); });
            }
            const totalRequiredByOrder = {};
            orders.forEach(o => { const totalReq = (o.week1||0)+(o.week2||0)+(o.week3||0)+(o.week4||0)+(o.week5||0)+(o.week6||0)+(o.week7||0)+(o.week8||0)+(o.week9||0); totalRequiredByOrder[o.sapCode] = totalReq; });
            const ordersInDay = Object.keys(producedTodayByOrder);
            if (ordersInDay.length > 0) {
                html += '<div class="shift-section">';
                html += '<div class="shift-title">End of day summary</div>';
                ordersInDay.forEach(sap => {
                    const producedToday = producedTodayByOrder[sap] || 0;
                    const producedToDate = producedToDateByOrder[sap] || 0;
                    const totalReq = totalRequiredByOrder[sap] || 0;
                    const remaining = Math.max(0, totalReq - producedToDate);
                    const orderObj = orders.find(o => o.sapCode === sap);
                    const label = orderObj ? `${sap} - ${orderObj.product}` : sap;
                    html += `<div class="machine-schedule"><div class="product-code"><strong>${label}</strong>: Produced today ${producedToday.toLocaleString()} bags • Remaining ${remaining.toLocaleString()} bags</div></div>`;
                });
                html += '</div>';
            }
            modalBody.innerHTML = html;
        }
    }
    modal.classList.add('active');
}

function closeModal() { document.getElementById('dayModal').classList.remove('active'); }

function runPlanning() {
    const priorityOrder = { 'no-compromise': 1, 'very-high': 2, 'high': 3, 'medium': 4, 'low': 5, 'very-low': 6 };
    const pendingOrders = orders.filter(o => o.status === 'pending').sort((a, b) => {
        if (a.orderType === 'MTS' && b.orderType === 'MTO') { const aWeeklyCover = (a.currentStockCartons || 0) / (((a.monthlyReqCartons || 0) / 4) || 1); if (aWeeklyCover < 1) return -1; }
        if (b.orderType === 'MTS' && a.orderType === 'MTO') { const bWeeklyCover = (b.currentStockCartons || 0) / (((b.monthlyReqCartons || 0) / 4) || 1); if (bWeeklyCover < 1) return 1; }
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) return priorityOrder[a.priority] - priorityOrder[b.priority];
        return 0;
    });
    schedule = {};
    function nextWorkingDay(date) { const d = new Date(date); d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); return d; }
    function ensureWorkingDay(date) { const d = new Date(date); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); return d; }
    pendingOrders.forEach(order => {
        const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        let planDate = ensureWorkingDay(monthStart);
        let allocatedForThisOrder = 0;
        for (let week = 1; week <= 9; week++) {
            const weekKey = `week${week}`;
            let weekQty = order[weekKey] || 0;
            if (weekQty > 0) {
                let remainingQty = weekQty;
                let safetyCounter = 0;
                while (remainingQty > 0 && safetyCounter < 365) {
                    const dateStr = planDate.toISOString().split('T')[0];
                    if (!schedule[dateStr]) schedule[dateStr] = [];
                    const dayOfWeek = planDate.getDay();
                    const maxShifts = (dayOfWeek === 5) ? 2 : 3;
                    for (let shift = 1; shift <= maxShifts && remainingQty > 0; shift++) {
                        for (let machine of machines) {
                            const usedOnSlot = schedule[dateStr].filter(s => s.machine === machine.id && s.shift === shift).reduce((acc, s) => acc + (s.quantityBags || 0), 0);
                            const freeCapacity = Math.max(0, machine.bagsPerShift - usedOnSlot);
                            if (freeCapacity <= 0) continue;
                            const allocQty = Math.min(remainingQty, freeCapacity);
                            schedule[dateStr].push({ orderId: order.id, sapCode: order.sapCode, product: order.product, orderType: order.orderType, machine: machine.id, shift: shift, quantityBags: allocQty, quantityCartons: Math.floor(allocQty / 250) });
                            remainingQty -= allocQty; allocatedForThisOrder += allocQty; if (remainingQty <= 0) break;
                        }
                    }
                    if (remainingQty > 0) { planDate = nextWorkingDay(planDate); safetyCounter++; }
                }
            }
        }
        order.status = allocatedForThisOrder > 0 ? 'planned' : 'pending';
    });
    updateOrdersTable();
    updateStats();
    renderCalendar();
    renderMachines();
    const resultsDiv = document.getElementById('planningResults');
    if (resultsDiv) {
        resultsDiv.innerHTML = `
            <div class="alert alert-success">
                <h3>✅ Planning Complete!</h3>
                <p>Successfully scheduled ${orders.filter(o => o.status === 'planned').length} orders across ${Object.keys(schedule).length} production days.</p>
                <p>MTS items have been prioritized to maintain 2-week stock coverage.</p>
                <p>View the Calendar tab to see the detailed schedule.</p>
            </div>
        `;
    }
}

function updateStats() {
    document.getElementById('pendingOrders').textContent = orders.filter(o => o.status === 'pending').length;
    document.getElementById('plannedOrders').textContent = orders.filter(o => o.status === 'planned').length;
    const totalSlots = machines.length * 3 * 22;
    const usedSlots = Object.values(schedule).reduce((acc, day) => acc + day.length, 0);
    const utilization = totalSlots > 0 ? (usedSlots / totalSlots * 100).toFixed(1) : 0;
    document.getElementById('utilizationRate').textContent = utilization + '%';
}

window.onload = function() {
    renderMachines();
    renderCalendar();
    updateStats();
};

window.onclick = function(event) {
    const modal = document.getElementById('dayModal');
    if (event.target === modal) { closeModal(); }
};

// This file is intentionally left as a stub for future extraction.
// The inline script in index.html contains the full app logic and can be progressively moved here.


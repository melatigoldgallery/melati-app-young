// Define stock categories and item types
const categories = ['brankas', 'admin', 'barang-rusak', 'posting'];
const itemTypes = ['KALUNG', 'LIONTIN', 'ANTING', 'CINCIN', 'HALA', 'GELANG', 'GIWANG'];

// Initialize stock data from localStorage or create new if not exists
let stockData = JSON.parse(localStorage.getItem('stockData')) || {};

// Initialize each category and item type if not exists
categories.forEach(category => {
    if (!stockData[category]) {
        stockData[category] = {};
    }
    
    itemTypes.forEach(type => {
        if (!stockData[category][type]) {
            stockData[category][type] = {
                quantity: 0,
                lastUpdated: null,
                history: []
            };
        }
    });
});

// Function to save data to localStorage
function saveData() {
    localStorage.setItem('stockData', JSON.stringify(stockData));
}

// Function to format date
function formatDate(date) {
    const d = new Date(date);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// Function to populate tables
function populateTables() {
    categories.forEach(category => {
        const tableBody = document.getElementById(`${category}-table-body`);
        tableBody.innerHTML = '';
        
        let index = 1;
        itemTypes.forEach(type => {
            const item = stockData[category][type];
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td>${index}</td>
                <td>${type}</td>
                <td>${item.quantity}</td>
                <td>${item.lastUpdated ? formatDate(item.lastUpdated) : '-'}</td>
                <td>
                    <button class="btn btn-sm btn-info view-history" 
                            data-category="${category}" 
                            data-type="${type}">
                        <i class="bi bi-clock-history"></i> Lihat
                    </button>
                </td>
            `;
            
            tableBody.appendChild(row);
            index++;
        });
    });
    
    // Add event listeners to history buttons
    document.querySelectorAll('.view-history').forEach(button => {
        button.addEventListener('click', function() {
            const category = this.getAttribute('data-category');
            const type = this.getAttribute('data-type');
            showHistory(category, type);
        });
    });
}

// Function to show history in modal
function showHistory(category, type) {
    const historyTitle = document.getElementById('history-title');
    const historyTableBody = document.getElementById('history-table-body');
    
    historyTitle.textContent = `${type} (${category.toUpperCase()})`;
    historyTableBody.innerHTML = '';
    
    const history = stockData[category][type].history;
    
    if (history.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="5" class="text-center">Tidak ada riwayat</td>';
        historyTableBody.appendChild(row);
    } else {
        history.forEach(record => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${formatDate(record.date)}</td>
                <td>${record.action}</td>
                <td>${record.quantity}</td>
                <td>${record.action === 'Tambah' ? record.adder : record.reducer}</td>
                <td>${record.action === 'Tambah' ? record.receiver : record.notes}</td>
            `;
            historyTableBody.appendChild(row);
        });
    }
    
    const historyModal = new bootstrap.Modal(document.getElementById('historyModal'));
    historyModal.show();
}

// Function to add stock
function addStock(category, type, quantity, adder, receiver) {
    const item = stockData[category][type];
    
    // Update quantity
    item.quantity += parseInt(quantity);
    item.lastUpdated = new Date().toISOString();
    
    // Add to history
    item.history.unshift({
        date: item.lastUpdated,
        action: 'Tambah',
        quantity: quantity,
        adder: adder,
        receiver: receiver
    });
    
    saveData();
    populateTables();
}

// Function to reduce stock
function reduceStock(category, type, quantity, reducer, notes) {
    const item = stockData[category][type];
    
    // Check if there's enough stock
    if (item.quantity < quantity) {
        alert(`Stok ${type} tidak mencukupi. Stok saat ini: ${item.quantity}`);
        return false;
    }
    
    // Update quantity
    item.quantity -= parseInt(quantity);
    item.lastUpdated = new Date().toISOString();
    
    // Add to history
    item.history.unshift({
        date: item.lastUpdated,
        action: 'Kurang',
        quantity: quantity,
        reducer: reducer,
        notes: notes
    });
    
    saveData();
    populateTables();
    return true;
}

// Event listeners for add stock forms
document.getElementById('simpan-tambah-brankas').addEventListener('click', function() {
    const type = document.getElementById('jenis-barang-brankas-tambah').value;
    const quantity = document.getElementById('jumlah-brankas-tambah').value;
    const adder = document.getElementById('penambah-brankas').value;
    const receiver = document.getElementById('penerima-brankas').value;
    
    if (!type || !quantity || !adder || !receiver) {
        alert('Semua field harus diisi!');
        return;
    }
    
    addStock('brankas', type, quantity, adder, receiver);
    
    // Reset form and close modal
    document.getElementById('tambahStokBrankasForm').reset();
    bootstrap.Modal.getInstance(document.getElementById('tambahStokBrankasModal')).hide();
});

document.getElementById('simpan-tambah-admin').addEventListener('click', function() {
    const type = document.getElementById('jenis-barang-admin-tambah').value;
    const quantity = document.getElementById('jumlah-admin-tambah').value;
    const adder = document.getElementById('penambah-admin').value;
    const receiver = document.getElementById('penerima-admin').value;
    
    if (!type || !quantity || !adder || !receiver) {
        alert('Semua field harus diisi!');
        return;
    }
    
    addStock('admin', type, quantity, adder, receiver);
    
    // Reset form and close modal
    document.getElementById('tambahStokAdminForm').reset();
    bootstrap.Modal.getInstance(document.getElementById('tambahStokAdminModal')).hide();
});

document.getElementById('simpan-tambah-rusak').addEventListener('click', function() {
    const type = document.getElementById('jenis-barang-rusak-tambah').value;
    const quantity = document.getElementById('jumlah-rusak-tambah').value;
    const adder = document.getElementById('penambah-rusak').value;
    const receiver = document.getElementById('penerima-rusak').value;
    
    if (!type || !quantity || !adder || !receiver) {
        alert('Semua field harus diisi!');
        return;
    }
    
    addStock('barang-rusak', type, quantity, adder, receiver);
    
    // Reset form and close modal
    document.getElementById('tambahStokBarangRusakForm').reset();
    bootstrap.Modal.getInstance(document.getElementById('tambahStokBarangRusakModal')).hide();
});

document.getElementById('simpan-tambah-posting').addEventListener('click', function() {
    const type = document.getElementById('jenis-barang-posting-tambah').value;
    const quantity = document.getElementById('jumlah-posting-tambah').value;
    const adder = document.getElementById('penambah-posting').value;
    const receiver = document.getElementById('penerima-posting').value;
    
    if (!type || !quantity || !adder || !receiver) {
        alert('Semua field harus diisi!');
        return;
    }
    
    addStock('posting', type, quantity, adder, receiver);
    
    // Reset form and close modal
    document.getElementById('tambahStokPostingForm').reset();
    bootstrap.Modal.getInstance(document.getElementById('tambahStokPostingModal')).hide();
});

// Event listeners for reduce stock forms
document.getElementById('simpan-kurang-brankas').addEventListener('click', function() {
    const type = document.getElementById('jenis-barang-brankas-kurang').value;
    const quantity = document.getElementById('jumlah-brankas-kurang').value;
    const reducer = document.getElementById('pengurang-brankas').value;
    const notes = document.getElementById('keterangan-brankas').value;
    
    if (!type || !quantity || !reducer || !notes) {
        alert('Semua field harus diisi!');
        return;
    }
    
    if (reduceStock('brankas', type, quantity, reducer, notes)) {
        // Reset form and close modal
        document.getElementById('kurangiStokBrankasForm').reset();
        bootstrap.Modal.getInstance(document.getElementById('kurangiStokBrankasModal')).hide();
    }
});

document.getElementById('simpan-kurang-admin').addEventListener('click', function() {
    const type = document.getElementById('jenis-barang-admin-kurang').value;
    const quantity = document.getElementById('jumlah-admin-kurang').value;
    const reducer = document.getElementById('pengurang-admin').value;
    const notes = document.getElementById('keterangan-admin').value;
    
    if (!type || !quantity || !reducer || !notes) {
        alert('Semua field harus diisi!');
        return;
    }
    
    if (reduceStock('admin', type, quantity, reducer, notes)) {
        // Reset form and close modal
        document.getElementById('kurangiStokAdminForm').reset();
        bootstrap.Modal.getInstance(document.getElementById('kurangiStokAdminModal')).hide();
    }
});

document.getElementById('simpan-kurang-rusak').addEventListener('click', function() {
    const type = document.getElementById('jenis-barang-rusak-kurang').value;
    const quantity = document.getElementById('jumlah-rusak-kurang').value;
    const reducer = document.getElementById('pengurang-rusak').value;
    const notes = document.getElementById('keterangan-rusak').value;
    
    if (!type || !quantity || !reducer || !notes) {
        alert('Semua field harus diisi!');
        return;
    }
    
    if (reduceStock('barang-rusak', type, quantity, reducer, notes)) {
        // Reset form and close modal
        document.getElementById('kurangiStokBarangRusakForm').reset();
        bootstrap.Modal.getInstance(document.getElementById('kurangiStokBarangRusakModal')).hide();
    }
});

document.getElementById('simpan-kurang-posting').addEventListener('click', function() {
    const type = document.getElementById('jenis-barang-posting-kurang').value;
    const quantity = document.getElementById('jumlah-posting-kurang').value;
    const reducer = document.getElementById('pengurang-posting').value;
    const notes = document.getElementById('keterangan-posting').value;
    
    if (!type || !quantity || !reducer || !notes) {
        alert('Semua field harus diisi!');
        return;
    }
    
    if (reduceStock('posting', type, quantity, reducer, notes)) {
        // Reset form and close modal
        document.getElementById('kurangiStokPostingForm').reset();
        bootstrap.Modal.getInstance(document.getElementById('kurangiStokPostingModal')).hide();
    }
});

// Initialize tables when page loads
document.addEventListener('DOMContentLoaded', function() {
    populateTables();
});

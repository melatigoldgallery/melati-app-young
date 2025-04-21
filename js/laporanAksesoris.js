// Import Firebase modules
import { 
    collection, query, where, getDocs, orderBy, limit, 
    doc, getDoc, Timestamp, startAt, endAt 
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";
import { db } from "./configFirebase.js";

// Utility functions
const formatRupiah = (angka) => {
    if (angka === null || angka === undefined) return "Rp 0";
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(angka);
};

const formatDate = (date) => {
    if (!date) return "-";
    
    if (date instanceof Timestamp) {
        date = date.toDate();
    } else if (typeof date === 'string') {
        // Handle date string in format dd/mm/yyyy
        const parts = date.split('/');
        if (parts.length === 3) {
            date = new Date(parts[2], parts[1] - 1, parts[0]);
        } else {
            date = new Date(date);
        }
    }
    
    return new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(date);
};

const parseDate = (dateString) => {
    const parts = dateString.split('/');
    return new Date(parts[2], parts[1] - 1, parts[0]);
};

// Sales Report Functions
let salesTable;
let salesChart;

const initSalesReport = async () => {
    // Initialize DataTable
    salesTable = $('#salesTable').DataTable({
        responsive: true,
        language: {
            search: "Cari:",
            lengthMenu: "Tampilkan _MENU_ data",
            info: "Menampilkan _START_ sampai _END_ dari _TOTAL_ data",
            infoEmpty: "Menampilkan 0 sampai 0 dari 0 data",
            infoFiltered: "(disaring dari _MAX_ data keseluruhan)",
            zeroRecords: "Tidak ada data yang cocok",
            paginate: {
                first: "Pertama",
                last: "Terakhir",
                next: "Selanjutnya",
                previous: "Sebelumnya"
            }
        },
        columns: [
            { data: 'noPenjualan' },
            { data: 'tanggal' },
            { data: 'sales' },
            { data: 'pelanggan' },
            { data: 'metodeBayar' },
            { data: 'total' },
            { data: 'aksi' }
        ]
    });

    // Initialize Chart
    const ctx = document.getElementById('salesChart').getContext('2d');
    salesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Penjualan',
                data: [],
                backgroundColor: 'rgba(67, 97, 238, 0.2)',
                borderColor: 'rgba(67, 97, 238, 1)',
                borderWidth: 2,
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatRupiah(value).replace('Rp', '');
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return formatRupiah(context.raw);
                        }
                    }
                }
            }
        }
    });

    // Load initial data
    await loadSalesData();

    // Set up event listeners
    document.getElementById('filterSalesBtn').addEventListener('click', loadSalesData);
    document.getElementById('resetSalesFilterBtn').addEventListener('click', resetSalesFilter);
    document.getElementById('exportSalesBtn').addEventListener('click', exportSalesData);
};

const loadSalesData = async () => {
    try {
        // Get filter values
        const startDateStr = document.getElementById('startDate').value;
        const endDateStr = document.getElementById('endDate').value;
        const salesFilter = document.getElementById('salesFilter').value;

        // Build query
        let q = collection(db, "penjualanAksesoris");
        
        // Apply date filters if provided
        if (startDateStr && endDateStr) {
            const startDate = parseDate(startDateStr);
            const endDate = parseDate(endDateStr);
            endDate.setHours(23, 59, 59, 999); // Set to end of day
            
            q = query(q, 
                where("tanggalTimestamp", ">=", Timestamp.fromDate(startDate)),
                where("tanggalTimestamp", "<=", Timestamp.fromDate(endDate))
            );
        }
        
        // Apply sales filter if provided
        if (salesFilter) {
            q = query(q, where("sales", "==", salesFilter));
        }
        
        // Order by date
        q = query(q, orderBy("tanggalTimestamp", "desc"));
        
        const querySnapshot = await getDocs(q);
        
        // Process data for table
        const tableData = [];
        const salesData = {};
        let totalRevenue = 0;
        let totalItems = 0;
        const customers = new Set();
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            
            // Format data for table
            tableData.push({
                id: doc.id,
                noPenjualan: data.noPenjualan,
                tanggal: formatDate(data.tanggalTimestamp),
                sales: data.sales,
                pelanggan: data.pelanggan.nama,
                metodeBayar: data.metodeBayarText,
                total: formatRupiah(data.totalOngkos),
                aksi: `<button class="btn btn-sm btn-info btn-detail" data-id="${doc.id}">
                         <i class="fas fa-eye"></i>
                       </button>
                       <button class="btn btn-sm btn-primary btn-print" data-id="${doc.id}">
                         <i class="fas fa-print"></i>
                       </button>`
            });
            
            // Aggregate data for summary
            totalRevenue += data.totalOngkos;
            
            // Count items
            if (data.items && Array.isArray(data.items)) {
                data.items.forEach(item => {
                    totalItems += item.jumlah;
                });
            }
            
            // Count unique customers
            customers.add(data.pelanggan.nama);
            
            // Aggregate data for chart
            const date = formatDate(data.tanggalTimestamp);
            if (!salesData[date]) {
                salesData[date] = 0;
            }
            salesData[date] += data.totalOngkos;
        });
        
        // Update table
        salesTable.clear();
        salesTable.rows.add(tableData);
        salesTable.draw();
        
        // Update summary cards
        document.getElementById('totalTransactions').textContent = tableData.length;
        document.getElementById('totalRevenue').textContent = formatRupiah(totalRevenue);
        document.getElementById('totalItems').textContent = totalItems;
        document.getElementById('totalCustomers').textContent = customers.size;
        
        // Update chart
        updateSalesChart(salesData);
        
        // Add event listeners for detail buttons
        document.querySelectorAll('.btn-detail').forEach(btn => {
            btn.addEventListener('click', () => showSalesDetail(btn.getAttribute('data-id')));
        });
        
        // Add event listeners for print buttons
        document.querySelectorAll('.btn-print').forEach(btn => {
            btn.addEventListener('click', () => printSalesDetail(btn.getAttribute('data-id')));
        });
        
        // Populate sales filter dropdown if empty
        if (document.getElementById('salesFilter').options.length <= 1) {
            const salesNames = new Set();
            tableData.forEach(row => salesNames.add(row.sales));
            
            const salesFilter = document.getElementById('salesFilter');
            salesNames.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                salesFilter.appendChild(option);
            });
        }
        
    } catch (error) {
        console.error("Error loading sales data:", error);
        alert("Terjadi kesalahan saat memuat data penjualan.");
    }
};

const updateSalesChart = (salesData) => {
    // Sort dates
    const sortedDates = Object.keys(salesData).sort((a, b) => {
        return parseDate(a) - parseDate(b);
    });
    
    // Prepare data for chart
    const labels = sortedDates;
    const data = sortedDates.map(date => salesData[date]);
    
    // Update chart
    salesChart.data.labels = labels;
    salesChart.data.datasets[0].data = data;
    salesChart.update();
};

const showSalesDetail = async (id) => {
    try {
        const docRef = doc(db, "penjualanAksesoris", id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Populate modal with data
            document.getElementById('detailNoPenjualan').textContent = data.noPenjualan;
            document.getElementById('detailTanggal').textContent = formatDate(data.tanggalTimestamp);
            document.getElementById('detailSales').textContent = data.sales;
            document.getElementById('detailMetodeBayar').textContent = data.metodeBayarText;
            
            document.getElementById('detailNamaPelanggan').textContent = data.pelanggan.nama;
            document.getElementById('detailNoHp').textContent = data.pelanggan.noHp || '-';
            document.getElementById('detailAlamat').textContent = data.pelanggan.alamat || '-';
            
            // Populate items table
            const tbody = document.querySelector('#detailItemsTable tbody');
            tbody.innerHTML = '';
            
            if (data.items && Array.isArray(data.items)) {
                data.items.forEach(item => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${item.kodeText}</td>
                        <td>${item.nama}</td>
                        <td>${item.jumlah}</td>
                        <td>${formatRupiah(item.hargaPerGram)}</td>
                        <td>${formatRupiah(item.totalHarga)}</td>
                    `;
                    tbody.appendChild(row);
                });
            }
            
            document.getElementById('detailTotal').textContent = formatRupiah(data.totalOngkos);
            document.getElementById('detailKeterangan').textContent = data.keterangan || '-';
            
            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('salesDetailModal'));
            modal.show();
        } else {
            alert("Data penjualan tidak ditemukan.");
        }
    } catch (error) {
        console.error("Error showing sales detail:", error);
        alert("Terjadi kesalahan saat memuat detail penjualan.");
    }
};

const printSalesDetail = async (id) => {
    try {
        const docRef = doc(db, "penjualanAksesoris", id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Create print window
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Nota Penjualan - ${data.noPenjualan}</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            margin: 0;
                            padding: 20px;
                        }
                        .header {
                            text-align: center;
                            margin-bottom: 20px;
                        }
                        .header h1 {
                            margin: 0;
                            font-size: 18px;
                        }
                        .header p {
                            margin: 5px 0;
                            font-size: 12px;
                        }
                        .info-section {
                            margin-bottom: 20px;
                        }
                        .info-section h2 {
                            font-size: 14px;
                            margin-bottom: 5px;
                        }
                        .info-table {
                            width: 100%;
                            font-size: 12px;
                        }
                        .info-table td {
                            padding: 3px 0;
                        }
                        .items-table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-bottom: 20px;
                            font-size: 12px;
                        }
                        .items-table th, .items-table td {
                            border: 1px solid #ddd;
                            padding: 8px;
                            text-align: left;
                        }
                        .items-table th {
                            background-color: #f2f2f2;
                        }
                        .total-row {
                            font-weight: bold;
                        }
                        .footer {
                            margin-top: 30px;
                            text-align: center;
                            font-size: 12px;
                        }
                        @media print {
                            @page {
                                margin: 0.5cm;
                            }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>MELATI GOLD SHOP</h1>
                        <p>Jl. Contoh No. 123, Kota Contoh</p>
                        <p>Telp: (021) 1234567</p>
                        <hr>
                        <h2>NOTA PENJUALAN</h2>
                    </div>
                    
                    <div class="info-section">
                        <table class="info-table">
                            <tr>
                                <td width="120">No. Penjualan</td>
                                                        <td>: ${data.noPenjualan}</td>
                                <td width="120">Tanggal</td>
                                <td>: ${formatDate(data.tanggalTimestamp)}</td>
                            </tr>
                            <tr>
                                <td>Sales</td>
                                <td>: ${data.sales}</td>
                                <td>Metode Bayar</td>
                                <td>: ${data.metodeBayarText}</td>
                            </tr>
                            <tr>
                                <td>Pelanggan</td>
                                <td>: ${data.pelanggan.nama}</td>
                                <td>No. HP</td>
                                <td>: ${data.pelanggan.noHp || '-'}</td>
                            </tr>
                        </table>
                    </div>
                    
                    <div class="items-section">
                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th>Kode</th>
                                    <th>Nama Barang</th>
                                    <th>Jumlah</th>
                                    <th>Harga</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody>
            `);
            
            if (data.items && Array.isArray(data.items)) {
                data.items.forEach(item => {
                    printWindow.document.write(`
                        <tr>
                            <td>${item.kodeText}</td>
                            <td>${item.nama}</td>
                            <td>${item.jumlah}</td>
                            <td>${formatRupiah(item.hargaPerGram)}</td>
                            <td>${formatRupiah(item.totalHarga)}</td>
                        </tr>
                    `);
                });
            }
            
            printWindow.document.write(`
                            </tbody>
                            <tfoot>
                                <tr class="total-row">
                                    <td colspan="4" style="text-align: right;">Total:</td>
                                    <td>${formatRupiah(data.totalOngkos)}</td>
                                </tr>
                                <tr>
                                    <td colspan="4" style="text-align: right;">Jumlah Bayar:</td>
                                    <td>${formatRupiah(data.jumlahBayar)}</td>
                                </tr>
                                <tr>
                                    <td colspan="4" style="text-align: right;">Kembalian:</td>
                                    <td>${formatRupiah(data.kembalian)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    
                    <div class="info-section">
                        <h2>Keterangan:</h2>
                        <p>${data.keterangan || '-'}</p>
                    </div>
                    
                    <div class="footer">
                        <p>Terima kasih telah berbelanja di Melati Gold Shop</p>
                        <p>Barang yang sudah dibeli tidak dapat ditukar atau dikembalikan</p>
                    </div>
                    
                    <script>
                        window.onload = function() {
                            window.print();
                            setTimeout(function() {
                                window.close();
                            }, 500);
                        };
                    </script>
                </body>
                </html>
            `);
            
            printWindow.document.close();
        } else {
            alert("Data penjualan tidak ditemukan.");
        }
    } catch (error) {
        console.error("Error printing sales detail:", error);
        alert("Terjadi kesalahan saat mencetak detail penjualan.");
    }
};

const resetSalesFilter = () => {
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    document.getElementById('salesFilter').value = '';
    loadSalesData();
};

const exportSalesData = () => {
    // Get table data
    const tableData = salesTable.data().toArray();
    
    if (tableData.length === 0) {
        alert("Tidak ada data untuk diekspor.");
        return;
    }
    
    // Create CSV content
    let csvContent = "No. Penjualan,Tanggal,Sales,Pelanggan,Metode Bayar,Total\n";
    
    tableData.forEach(row => {
        // Remove HTML tags from total column
        const total = row.total.replace(/<[^>]*>/g, '');
        
        csvContent += `"${row.noPenjualan}","${row.tanggal}","${row.sales}","${row.pelanggan}","${row.metodeBayar}","${total}"\n`;
    });
    
    // Create download link
    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "laporan_penjualan.csv");
    document.body.appendChild(link);
    
    // Trigger download
    link.click();
    
    // Clean up
    document.body.removeChild(link);
};

// Stock Report Functions
let stockTable;
let categoryChart;
let stockStatusChart;

const initStockReport = async () => {
    // Initialize DataTable
    stockTable = $('#stockTable').DataTable({
        responsive: true,
        language: {
            search: "Cari:",
            lengthMenu: "Tampilkan _MENU_ data",
            info: "Menampilkan _START_ sampai _END_ dari _TOTAL_ data",
            infoEmpty: "Menampilkan 0 sampai 0 dari 0 data",
            infoFiltered: "(disaring dari _MAX_ data keseluruhan)",
            zeroRecords: "Tidak ada data yang cocok",
            paginate: {
                first: "Pertama",
                last: "Terakhir",
                next: "Selanjutnya",
                previous: "Sebelumnya"
            }
        },
        columns: [
            { data: 'kode' },
            { data: 'nama' },
            { data: 'kategori' },
            { data: 'stok' },
            { data: 'harga' },
            { data: 'status' },
            { data: 'aksi' }
        ]
    });

    // Initialize Category Chart
    const ctxCategory = document.getElementById('categoryChart').getContext('2d');
    categoryChart = new Chart(ctxCategory, {
        type: 'pie',
        data: {
            labels: ['Kotak Perhiasan', 'Aksesoris Perhiasan'],
            datasets: [{
                data: [0, 0],
                backgroundColor: [
                    'rgba(54, 162, 235, 0.7)',
                    'rgba(255, 99, 132, 0.7)'
                ],
                borderColor: [
                    'rgba(54, 162, 235, 1)',
                    'rgba(255, 99, 132, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });

    // Initialize Stock Status Chart
    const ctxStatus = document.getElementById('stockStatusChart').getContext('2d');
    stockStatusChart = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: ['Tersedia', 'Stok Menipis', 'Stok Habis'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: [
                    'rgba(75, 192, 192, 0.7)',
                    'rgba(255, 206, 86, 0.7)',
                    'rgba(255, 99, 132, 0.7)'
                ],
                borderColor: [
                    'rgba(75, 192, 192, 1)',
                    'rgba(255, 206, 86, 1)',
                    'rgba(255, 99, 132, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });

    // Load initial data
    await loadStockData();

    // Set up event listeners
    document.getElementById('filterStockBtn').addEventListener('click', loadStockData);
    document.getElementById('resetStockFilterBtn').addEventListener('click', resetStockFilter);
    document.getElementById('exportStockBtn').addEventListener('click', exportStockData);
};

const loadStockData = async () => {
    try {
        // Get filter values
        const categoryFilter = document.getElementById('categoryFilter').value;
        const stockFilter = document.getElementById('stockFilter').value;
        const searchStock = document.getElementById('searchStock').value.toLowerCase();

        // Build query
        let q = collection(db, "stokAksesoris");
        
        // Apply category filter if provided
        if (categoryFilter) {
            q = query(q, where("kategori", "==", parseInt(categoryFilter)));
        }
        
        // Get documents
        const querySnapshot = await getDocs(q);
        
        // Process data for table
        const tableData = [];
        let totalProducts = 0;
        let availableStock = 0;
        let lowStock = 0;
        let outOfStock = 0;
        let kotakCount = 0;
        let aksesorisCount = 0;
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            
            // Apply search filter
            if (searchStock && 
                !data.kode.toLowerCase().includes(searchStock) && 
                !data.nama.toLowerCase().includes(searchStock)) {
                return;
            }
            
            // Determine stock status
            let status = '';
            let statusClass = '';
            
            if (data.stok <= 0) {
                status = 'Stok Habis';
                statusClass = 'bg-danger';
                outOfStock++;
                
                // Apply stock filter
                if (stockFilter === 'available' || stockFilter === 'low') {
                    return;
                }
            } else if (data.stok <= 5) {
                status = 'Stok Menipis';
                statusClass = 'bg-warning';
                lowStock++;
                
                // Apply stock filter
                if (stockFilter === 'available' || stockFilter === 'out') {
                    return;
                }
            } else {
                status = 'Tersedia';
                statusClass = 'bg-success';
                availableStock++;
                
                // Apply stock filter
                if (stockFilter === 'low' || stockFilter === 'out') {
                    return;
                }
            }
            
            // Count by category
            if (data.kategori === 1) {
                kotakCount++;
            } else if (data.kategori === 2) {
                aksesorisCount++;
            }
            
            // Format data for table
            tableData.push({
                id: doc.id,
                kode: data.kode,
                nama: data.nama,
                kategori: data.kategori === 1 ? 'Kotak Perhiasan' : 'Aksesoris Perhiasan',
                stok: data.stok,
                harga: formatRupiah(data.harga),
                status: `<span class="badge ${statusClass}">${status}</span>`,
                aksi: `<button class="btn btn-sm btn-info btn-history" data-id="${doc.id}">
                         <i class="fas fa-history"></i>
                       </button>
                       <button class="btn btn-sm btn-primary btn-edit" data-id="${doc.id}">
                         <i class="fas fa-edit"></i>
                       </button>`
            });
            
            totalProducts++;
        });
        
        // Update table
        stockTable.clear();
        stockTable.rows.add(tableData);
        stockTable.draw();
        
        // Update summary cards
        document.getElementById('totalProducts').textContent = totalProducts;
        document.getElementById('availableStock').textContent = availableStock;
        document.getElementById('lowStock').textContent = lowStock;
        document.getElementById('outOfStock').textContent = outOfStock;
        
        // Update category chart
        categoryChart.data.datasets[0].data = [kotakCount, aksesorisCount];
        categoryChart.update();
        
        // Update stock status chart
        stockStatusChart.data.datasets[0].data = [availableStock, lowStock, outOfStock];
        stockStatusChart.update();
        
        // Add event listeners for history buttons
        document.querySelectorAll('.btn-history').forEach(btn => {
            btn.addEventListener('click', () => showStockHistory(btn.getAttribute('data-id')));
        });
        
        // Add event listeners for edit buttons
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => editStock(btn.getAttribute('data-id')));
        });
        
    } catch (error) {
        console.error("Error loading stock data:", error);
        alert("Terjadi kesalahan saat memuat data stok.");
    }
};

const showStockHistory = async (id) => {
    try {
        const docRef = doc(db, "stokAksesoris", id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Populate modal with data
            document.getElementById('historyKode').textContent = data.kode;
            document.getElementById('historyNama').textContent = data.nama;
            document.getElementById('historyKategori').textContent = data.kategori === 1 ? 'Kotak Perhiasan' : 'Aksesoris Perhiasan';
            document.getElementById('historyStokSaatIni').textContent = data.stok;
            
            // Get stock history
            const historyRef = collection(db, "stokAksesoris", id, "history");
            const historyQuery = query(historyRef, orderBy("tanggal", "desc"));
            const historySnapshot = await getDocs(historyQuery);
            
            // Populate history table
            const tbody = document.querySelector('#stockHistoryTable tbody');
            tbody.innerHTML = '';
            
            if (historySnapshot.empty) {
                const row = document.createElement('tr');
                row.innerHTML = `<td colspan="4" class="text-center">Tidak ada riwayat perubahan stok</td>`;
                tbody.appendChild(row);
            } else {
                historySnapshot.forEach((doc) => {
                    const historyData = doc.data();
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${formatDate(historyData.tanggal)}</td>
                        <td>${historyData.jenis}</td>
                        <td>${historyData.jumlah}</td>
                            <td>${historyData.keterangan || '-'}</td>
                    `;
                    tbody.appendChild(row);
                });
            }
            
            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('stockHistoryModal'));
            modal.show();
        } else {
            alert("Data stok tidak ditemukan.");
        }
    } catch (error) {
        console.error("Error showing stock history:", error);
        alert("Terjadi kesalahan saat memuat riwayat stok.");
    }
};

const editStock = (id) => {
    // Redirect to edit page or show edit modal
    window.location.href = `tambahAksesoris.html?edit=${id}`;
};

const resetStockFilter = () => {
    document.getElementById('categoryFilter').value = '';
    document.getElementById('stockFilter').value = '';
    document.getElementById('searchStock').value = '';
    loadStockData();
};

const exportStockData = () => {
    // Get table data
    const tableData = stockTable.data().toArray();
    
    if (tableData.length === 0) {
        alert("Tidak ada data untuk diekspor.");
        return;
    }
    
    // Create CSV content
    let csvContent = "Kode,Nama Barang,Kategori,Stok,Harga,Status\n";
    
    tableData.forEach(row => {
        // Remove HTML tags from status column
        const status = row.status.replace(/<[^>]*>/g, '');
        
        csvContent += `"${row.kode}","${row.nama}","${row.kategori}","${row.stok}","${row.harga}","${status}"\n`;
    });
    
    // Create download link
    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "laporan_stok.csv");
    document.body.appendChild(link);
    
    // Trigger download
    link.click();
    
    // Clean up
    document.body.removeChild(link);
};

// Initialize reports when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize sales report
        await initSalesReport();
        
        // Initialize stock report
        await initStockReport();
        
        // Add tab change event listener
        const tabEls = document.querySelectorAll('button[data-bs-toggle="tab"]');
        tabEls.forEach(tabEl => {
            tabEl.addEventListener('shown.bs.tab', event => {
                // Refresh charts when tab is shown
                if (event.target.id === 'sales-tab') {
                    salesChart.update();
                } else if (event.target.id === 'stock-tab') {
                    categoryChart.update();
                    stockStatusChart.update();
                }
            });
        });
        
        console.log("Laporan Aksesoris initialized successfully");
    } catch (error) {
        console.error("Error initializing reports:", error);
    }
});
    

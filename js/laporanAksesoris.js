// Import Firebase modules
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  doc,
  getDoc,
  Timestamp,
  startAt,
  endAt,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";
import { firestore } from "./configFirebase.js";

// Utility functions
const formatRupiah = (angka) => {
  if (!angka && angka !== 0) return "0";
  const number = typeof angka === "string" ? parseInt(angka) : angka;
  return new Intl.NumberFormat("id-ID").format(number);
};

const parseDate = (dateString) => {
  // Format: dd/mm/yyyy
  if (!dateString) return null;
  const parts = dateString.split("/");
  return new Date(parts[2], parts[1] - 1, parts[0]);
};

const formatDate = (date) => {
  if (!date) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

// Main handler object
const laporanAksesorisHandler = {
  // Data properties
  salesData: [],
  stockData: [],
  filteredSalesData: [],
  filteredStockData: [],

   // Cache properties
   cache: {
    salesData: {
      data: null,
      lastFetched: null
    },
    stockData: {
      data: null,
      lastFetched: null
    }
  },

  // Initialize the module
  init() {
    this.initDatePickers();
    this.attachEventListeners();
    this.setDefaultDates();

    // Initialize DataTables
    this.initDataTables();

    // Load initial data
    this.loadSalesData();
    this.loadStockData();
  },

  // Initialize date pickers
  initDatePickers() {
    $(".datepicker").datepicker({
      format: "dd/mm/yyyy",
      autoclose: true,
      language: "id",
      todayHighlight: true,
    });
  },

  // Initialize DataTables
  initDataTables() {
    // Sales DataTable
    $("#penjualanTable").DataTable({
      responsive: true,
      language: {
        search: "Cari:",
        lengthMenu: "Tampilkan _MENU_ data",
        info: "Menampilkan _START_ sampai _END_ dari _TOTAL_ data",
        infoEmpty: "Menampilkan 0 sampai 0 dari 0 data",
        infoFiltered: "(disaring dari _MAX_ total data)",
        paginate: {
          first: "Pertama",
          last: "Terakhir",
          next: "Selanjutnya",
          previous: "Sebelumnya",
        },
      },
      dom: "Bfrtip",
      buttons: ["excel", "pdf", "print"],
    });

    // Stock DataTable
    $("#stockTable").DataTable({
      responsive: true,
      language: {
        search: "Cari:",
        lengthMenu: "Tampilkan _MENU_ data",
        info: "Menampilkan _START_ sampai _END_ dari _TOTAL_ data",
        infoEmpty: "Menampilkan 0 sampai 0 dari 0 data",
        infoFiltered: "(disaring dari _MAX_ total data)",
        paginate: {
          first: "Pertama",
          last: "Terakhir",
          next: "Selanjutnya",
          previous: "Sebelumnya",
        },
      },
      dom: "Bfrtip",
      buttons: ["excel", "pdf", "print"],
    });
  },

  // Set default dates (current day for both start and end)
setDefaultDates() {
  const today = new Date();
  const formattedToday = formatDate(today);

  // Set values for all date inputs
  const dateInputs = document.querySelectorAll(".datepicker");
  dateInputs.forEach((input) => {
    // Set both start and end dates to today
    input.value = formattedToday;
  });
},

  // Attach event listeners
  attachEventListeners() {
    // Filter Sales button
    const filterSalesBtn = document.getElementById("filterSalesBtn");
    if (filterSalesBtn) {
      filterSalesBtn.addEventListener("click", () => this.filterSalesData());
    }

    // Reset Sales button
    const resetSalesBtn = document.getElementById("resetSalesBtn");
    if (resetSalesBtn) {
      resetSalesBtn.addEventListener("click", () => this.resetSalesFilters());
    }

    // Filter Stock button
    const filterStockBtn = document.getElementById("filterStockBtn");
    if (filterStockBtn) {
      filterStockBtn.addEventListener("click", () => this.filterStockData());
    }

    // Reset Stock button
    const resetStockBtn = document.getElementById("resetStockBtn");
    if (resetStockBtn) {
      resetStockBtn.addEventListener("click", () => this.resetStockFilters());
    }

    // Export Sales button
    const exportSalesBtn = document.getElementById("exportSalesBtn");
    if (exportSalesBtn) {
      exportSalesBtn.addEventListener("click", () => this.exportSalesData());
    }

    // Export Stock button
    const exportStockBtn = document.getElementById("exportStockBtn");
    if (exportStockBtn) {
      exportStockBtn.addEventListener("click", () => this.exportStockData());
    }

    // Tab change event to refresh tables
    $('a[data-bs-toggle="tab"]').on("shown.bs.tab", (e) => {
      const targetId = $(e.target).attr("id");
      if (targetId === "sales-tab") {
        this.refreshSalesTable();
      } else if (targetId === "stock-tab") {
        this.refreshStockTable();
      }
    });
  },

  // Reset sales filters
  resetSalesFilters() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

    document.querySelector("#sales-tab-pane #startDate").value = formatDate(firstDay);
    document.querySelector("#sales-tab-pane #endDate").value = formatDate(today);
    document.querySelector("#sales-tab-pane #searchStock").value = "";

    this.filterSalesData();
  },

  // Reset stock filters
  resetStockFilters() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

    document.querySelector("#stock-tab-pane #startDate").value = formatDate(firstDay);
    document.querySelector("#stock-tab-pane #endDate").value = formatDate(today);
    document.querySelector("#stock-tab-pane #searchStock").value = "";

    this.filterStockData();
  },

  // Load sales data from Firestore
  async loadSalesData() {
    try {
      this.showLoading(true);

      // Check cache validity (cache expires after 5 minutes)
      const now = new Date().getTime();
      const cacheExpiry = 5 * 60 * 1000; // 5 minutes
      
      if (this.cache.salesData.data && 
          this.cache.salesData.lastFetched && 
          (now - this.cache.salesData.lastFetched) < cacheExpiry) {
        
        console.log("Using cached sales data");
        this.salesData = this.cache.salesData.data;
        this.filterSalesData();
        this.showLoading(false);
        return;
      }

      // Get sales data from Firestore
      const salesRef = collection(firestore, "penjualanAksesoris");
      const salesSnapshot = await getDocs(salesRef);

      this.salesData = [];
      salesSnapshot.forEach((doc) => {
        const data = doc.data();
        // Add document ID to the data
        this.salesData.push({
          id: doc.id,
          ...data,
        });
      });
      
      // Update cache
      this.cache.salesData.data = this.salesData;
      this.cache.salesData.lastFetched = now;

      // Apply initial filter
      this.filterSalesData();
      this.showLoading(false);
    } catch (error) {
      console.error("Error loading sales data:", error);
      this.showError("Error loading sales data: " + error.message);
      this.showLoading(false);
    }
  },

  // Load stock data from Firestore
  async loadStockData() {
    try {
      this.showLoading(true);

      // Check cache validity (cache expires after 5 minutes)
      const now = new Date().getTime();
      const cacheExpiry = 5 * 60 * 1000; // 5 minutes
      
      if (this.cache.stockData.data && 
          this.cache.stockData.lastFetched && 
          (now - this.cache.stockData.lastFetched) < cacheExpiry) {
        
        console.log("Using cached stock data");
        this.stockData = this.cache.stockData.data;
        this.filterStockData();
        this.showLoading(false);
        return;
      }

      // Get stock data from Firestore
      const stockRef = collection(firestore, "stokAksesoris");
      const stockSnapshot = await getDocs(stockRef);

      this.stockData = [];
      stockSnapshot.forEach((doc) => {
        const data = doc.data();
        // Add document ID to the data
        this.stockData.push({
          id: doc.id,
          ...data,
        });
      });

      // Get all kode aksesoris from kodeAksesoris collection
      await this.loadAllKodeAksesoris();
      
      // Update cache
      this.cache.stockData.data = this.stockData;
      this.cache.stockData.lastFetched = now;

      // Apply initial filter
      this.filterStockData();
      this.showLoading(false);
    } catch (error) {
      console.error("Error loading stock data:", error);
      this.showError("Error loading stock data: " + error.message);
      this.showLoading(false);
    }
  },

  // Load all kode aksesoris from Firestore
async loadAllKodeAksesoris() {
    try {
        // Get kotak data
        const kotakSnapshot = await getDocs(collection(firestore, "kodeAksesoris", "kategori", "kotak"));
        
        // Get aksesoris data
        const aksesorisSnapshot = await getDocs(collection(firestore, "kodeAksesoris", "kategori", "aksesoris"));
        
        // Process kotak data
        kotakSnapshot.forEach(doc => {
            const data = doc.data();
            // Check if this kode already exists in stockData
            const existingIndex = this.stockData.findIndex(item => item.kode === data.text);
            
            if (existingIndex === -1) {
                // If not exists, add new item with default values
                this.stockData.push({
                    id: null, // No document ID yet
                    kode: data.text,
                    nama: data.nama,
                    kategori: 'kotak', // Tambahkan informasi kategori
                    stokAwal: 0,
                    tambahStok: 0,
                    laku: 0,
                    free: 0,
                    gantiLock: 0,
                    stokAkhir: 0,
                    lastUpdate: new Date()
                });
            } else {
                // Update kategori jika item sudah ada
                this.stockData[existingIndex].kategori = 'kotak';
            }
        });
        
        // Process aksesoris data
        aksesorisSnapshot.forEach(doc => {
            const data = doc.data();
            // Check if this kode already exists in stockData
            const existingIndex = this.stockData.findIndex(item => item.kode === data.text);
            
            if (existingIndex === -1) {
                // If not exists, add new item with default values
                this.stockData.push({
                    id: null, // No document ID yet
                    kode: data.text,
                    nama: data.nama,
                    kategori: 'aksesoris', // Tambahkan informasi kategori
                    stokAwal: 0,
                    tambahStok: 0,
                    laku: 0,
                    free: 0,
                    gantiLock: 0,
                    stokAkhir: 0,
                    lastUpdate: new Date()
                });
            } else {
                // Update kategori jika item sudah ada
                this.stockData[existingIndex].kategori = 'aksesoris';
            }
        });
        
    } catch (error) {
        console.error("Error loading kode aksesoris:", error);
        throw error;
    }
},

  // Filter sales data based on date range and search text
  filterSalesData() {
    if (!this.salesData.length) return;

    this.showLoading(true);

    // Get filter values
    const startDateStr = document.querySelector("#sales-tab-pane #startDate").value;
    const endDateStr = document.querySelector("#sales-tab-pane #endDate").value;
    const searchText = document.querySelector("#sales-tab-pane #searchStock").value.toLowerCase();

    // Parse dates
    const startDate = parseDate(startDateStr);
    const endDate = parseDate(endDateStr);
    if (endDate) {
      // Add one day to end date to include the end date in the range
      endDate.setDate(endDate.getDate() + 1);
    }

    // Filter data
    this.filteredSalesData = this.salesData.filter((item) => {
      // Parse transaction date
      const transactionDate = item.timestamp ? item.timestamp.toDate() : parseDate(item.tanggal);

      // Check if date is within range
      const dateInRange = (!startDate || transactionDate >= startDate) && (!endDate || transactionDate < endDate);

      // Check if matches search text
      let matchesSearch = true;
      if (searchText) {
        matchesSearch =
          (item.noPenjualan && item.noPenjualan.toLowerCase().includes(searchText)) ||
          (item.sales && item.sales.toLowerCase().includes(searchText)) ||
          (item.items &&
            item.items.some(
              (product) =>
                (product.nama && product.nama.toLowerCase().includes(searchText)) ||
                (product.kode && product.kode.toLowerCase().includes(searchText))
            ));
      }

      return dateInRange && matchesSearch;
    });

    // Sort by date (newest first)
    this.filteredSalesData.sort((a, b) => {
      const dateA = a.timestamp ? a.timestamp.toDate() : parseDate(a.tanggal);
      const dateB = b.timestamp ? b.timestamp.toDate() : parseDate(b.tanggal);
      return dateB - dateA;
    });

    // Render the table
    this.renderSalesTable();
    this.showLoading(false);
  },

  // Filter stock data based on date range and search text
filterStockData() {
    if (!this.stockData.length) return;
    
    this.showLoading(true);
    
    // Get filter values
    const startDateStr = document.querySelector('#stock-tab-pane #startDate').value;
    const endDateStr = document.querySelector('#stock-tab-pane #endDate').value;
    const searchText = document.querySelector('#stock-tab-pane #searchStock').value.toLowerCase();
    
    // Parse dates
    const startDate = parseDate(startDateStr);
    const endDate = parseDate(endDateStr);
    if (endDate) {
        // Add one day to end date to include the end date in the range
        endDate.setDate(endDate.getDate() + 1);
    }
    
    // Filter data
    this.filteredStockData = this.stockData.filter(item => {
        // Parse update date
        const updateDate = item.lastUpdate ? 
            (item.lastUpdate.toDate ? item.lastUpdate.toDate() : 
             typeof item.lastUpdate === 'string' ? parseDate(item.lastUpdate) : item.lastUpdate) : 
            new Date();
        
        // Check if date is within range
        const dateInRange = (!startDate || updateDate >= startDate) && 
                           (!endDate || updateDate < endDate);
        
        // Check if matches search text
        let matchesSearch = true;
        if (searchText) {
            matchesSearch = 
                (item.kode && item.kode.toLowerCase().includes(searchText)) ||
                (item.nama && item.nama.toLowerCase().includes(searchText));
        }
        
        return dateInRange && matchesSearch;
    });
    
    // Sort by kategori first (kotak first, then aksesoris), then by kode
    this.filteredStockData.sort((a, b) => {
        // Prioritaskan kategori
        if ((a.kategori || 'unknown') !== (b.kategori || 'unknown')) {
            // Kotak selalu di atas
            return (a.kategori || 'unknown') === 'kotak' ? -1 : 1;
        }
        
        // Jika kategori sama, urutkan berdasarkan kode
        return (a.kode || '').localeCompare(b.kode || '');
    });
    
    // Render the table
    this.renderStockTable();
    this.showLoading(false);
},

  // Render the sales table
  renderSalesTable() {
    // Get table and destroy existing DataTable
    const table = $("#penjualanTable").DataTable();
    table.clear().destroy();

    // Get table body
    const tableBody = document.querySelector("#penjualanTable tbody");
    if (!tableBody) return;

    // Check if there's data to display
    if (this.filteredSalesData.length === 0) {
      tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center">Tidak ada data yang sesuai dengan filter</td>
                </tr>
            `;

      // Reinitialize empty DataTable
      $("#penjualanTable").DataTable({
        responsive: true,
        language: {
          emptyTable: "Tidak ada data yang tersedia",
        },
      });

      return;
    }

    // Generate table rows
    let html = "";
    this.filteredSalesData.forEach((sale) => {
      const date = sale.timestamp ? formatDate(sale.timestamp.toDate()) : sale.tanggal;

      // For each item in the sale, create a row
      if (sale.items && sale.items.length) {
        sale.items.forEach((item) => {
          html += `
                        <tr>
                            <td>${date}</td>
                            <td>${sale.sales || "-"}</td>
                            <td>${item.kodeText || "-"}</td>
                            <td>${item.nama || "-"}</td>
                            <td>${item.jumlah || 0}</td>
                            <td>Rp ${formatRupiah(item.hargaSatuan || 0)}</td>
                        </tr>
                    `;
        });
      } else {
        // If no items, create a single row
        html += `
                                <tr>
                                    <td>${date}</td>
                                    <td>${sale.sales || "-"}</td>
                                    <td colspan="4" class="text-center">Tidak ada item</td>
                                </tr>
                            `;
      }
    });

    tableBody.innerHTML = html;

    // Reinitialize DataTable
    $("#penjualanTable").DataTable({
      responsive: true,
      language: {
        search: "Cari:",
        lengthMenu: "Tampilkan _MENU_ data",
        info: "Menampilkan _START_ sampai _END_ dari _TOTAL_ data",
        infoEmpty: "Menampilkan 0 sampai 0 dari 0 data",
        infoFiltered: "(disaring dari _MAX_ total data)",
        paginate: {
          first: "Pertama",
          last: "Terakhir",
          next: "Selanjutnya",
          previous: "Sebelumnya",
        },
      },
      dom: "Bfrtip",
      buttons: ["copy", "csv", "excel", "pdf", "print"],
    });
  },

// Render the stock table
renderStockTable() {
  // Destroy existing DataTable
  if ($.fn.DataTable.isDataTable('#stockTable')) {
      $('#stockTable').DataTable().destroy();
  }
  
  // Get table body
  const tableBody = document.querySelector('#stockTable tbody');
  if (!tableBody) return;
  
  // Check if there's data to display
  if (this.filteredStockData.length === 0) {
      tableBody.innerHTML = `
          <tr>
              <td colspan="9" class="text-center">Tidak ada data yang sesuai dengan filter</td>
          </tr>
      `;
      
      // Initialize empty DataTable
      $('#stockTable').DataTable({
          responsive: true,
          language: {
              emptyTable: "Tidak ada data yang tersedia"
          }
      });
      
      return;
  }
  
  // Kelompokkan data berdasarkan kategori
  const kotakItems = this.filteredStockData.filter(item => item.kategori === 'kotak');
  const aksesorisItems = this.filteredStockData.filter(item => item.kategori === 'aksesoris');
  const otherItems = this.filteredStockData.filter(item => item.kategori !== 'kotak' && item.kategori !== 'aksesoris');
  
  // Buat HTML untuk tabel tanpa header kategori
  let html = '';
  let rowIndex = 1;
  
  // Tambahkan semua item tanpa header kategori
  [...kotakItems, ...aksesorisItems, ...otherItems].forEach(item => {
      const categoryClass = item.kategori === 'kotak' ? 'kotak-item' : 
                           item.kategori === 'aksesoris' ? 'aksesoris-item' : 'other-item';
      
      html += `
          <tr class="${categoryClass}">
              <td class="text-center">${rowIndex++}</td>
              <td class="text-center">${item.kode || '-'}</td>
              <td>${item.nama || '-'}</td>
              <td class="text-center">${item.stokAwal || 0}</td>
              <td class="text-center">${item.tambahStok || 0}</td>
              <td class="text-center">${item.laku || 0}</td>
              <td class="text-center">${item.free || 0}</td>
              <td class="text-center">${item.gantiLock || 0}</td>
              <td class="text-center">${item.stokAkhir || 0}</td>
          </tr>
      `;
  });
  
  tableBody.innerHTML = html;
  
  // Get current date for title
  const today = new Date();
  const formattedDate = formatDate(today);
  
  // Add CSS for text wrapping and equal column widths
  const styleElement = document.createElement('style');
  styleElement.textContent = `
      #stockTable th, #stockTable td {
          white-space: normal;
          word-wrap: break-word;
          vertical-align: middle;
      }
      
      #stockTable th:nth-child(1), #stockTable td:nth-child(1) { width: 5%; }  /* No */
      #stockTable th:nth-child(2), #stockTable td:nth-child(2) { width: 10%; } /* Kode */
      #stockTable th:nth-child(3), #stockTable td:nth-child(3) { width: 35%; } /* Nama - lebih lebar */
      #stockTable th:nth-child(4), #stockTable td:nth-child(4),
      #stockTable th:nth-child(5), #stockTable td:nth-child(5),
      #stockTable th:nth-child(6), #stockTable td:nth-child(6),
      #stockTable th:nth-child(7), #stockTable td:nth-child(7),
      #stockTable th:nth-child(8), #stockTable td:nth-child(8),
      #stockTable th:nth-child(9), #stockTable td:nth-child(9) { width: 8.33%; } /* Kolom stock - sama lebar */
      
      @media print {
          #stockTable { width: 100% !important; table-layout: fixed !important; }
          #stockTable th, #stockTable td {
              padding: 4px !important;
              font-size: 10pt !important;
              overflow: visible !important;
          }
      }
  `;
  document.head.appendChild(styleElement);
  
  // Inisialisasi DataTable dengan tombol export
  const dataTable = $('#stockTable').DataTable({
      responsive: true,
      dom: 'Bfrtip',
      ordering: false, // Menonaktifkan fitur pengurutan/sorting
      autoWidth: false, // Disable auto width calculation
      buttons: [
          {
              extend: 'excel',
              text: '<i class="fas fa-file-excel me-2"></i>Excel',
              className: 'btn btn-success btn-sm me-1',
              exportOptions: {
                  columns: ':visible'
              },
              title: `Laporan Aksesoris Kasir Atas\n(${formattedDate})`,
              customize: function(xlsx) {
                  // Kustomisasi file Excel
                  var sheet = xlsx.xl.worksheets['sheet1.xml'];
                  
                  // Adjust column widths in Excel
                  $('row c[r^="C"]', sheet).attr('s', '55'); // Nama column - wider with wrap text
                  
                  // Set wrap text for all data cells
                  $('row:not(:first-child) c', sheet).attr('s', '55');
              }
          },
          {
              extend: 'pdf',
              text: '<i class="fas fa-file-pdf me-2"></i>PDF',
              className: 'btn btn-danger btn-sm me-1',
              exportOptions: {
                  columns: ':visible'
              },
              title: `Laporan Aksesoris Kasir Atas\n(${formattedDate})`,
              customize: function(doc) {
                  // Kustomisasi file PDF
                  doc.defaultStyle.fontSize = 8;
                  doc.styles.tableHeader.fontSize = 9;
                  
                  // Set column widths for PDF
                  doc.content[1].table.widths = ['5%', '10%', '35%', '8.33%', '8.33%', '8.33%', '8.33%', '8.33%', '8.33%'];
                  
                  // Enable text wrapping
                  doc.styles.tableHeader.alignment = 'center';
                  doc.styles.tableBodyEven.alignment = 'center';
                  doc.styles.tableBodyOdd.alignment = 'center';
                  
                  // Center all columns except the name column
                  doc.content[1].table.body.forEach(function(row, rowIndex) {
                      row.forEach(function(cell, cellIndex) {
                          if (cellIndex !== 2) { // Skip the name column (index 2)
                              cell.alignment = 'center';
                          }
                      });
                  });
              }
          },
          {
              extend: 'print',
              text: '<i class="fas fa-print me-2"></i>Print',
              className: 'btn btn-primary btn-sm',
              exportOptions: {
                  columns: ':visible'
              },
              title: `Laporan Aksesoris Kasir Atas\n(${formattedDate})`,
              customize: function(win) {
                  // Add custom CSS for print view
                  $(win.document.head).append(`
                      <style>
                          @page { size: landscape; }
                          table.dataTable {
                              width: 100% !important;
                              table-layout: fixed !important;
                              border-collapse: collapse !important;
                          }
                          table.dataTable th, table.dataTable td {
                              white-space: normal !important;
                              word-wrap: break-word !important;
                              padding: 5px !important;
                              font-size: 10pt !important;
                              border: 1px solid #ddd !important;
                              vertical-align: middle !important;
                          }
                          table.dataTable th:nth-child(1), table.dataTable td:nth-child(1) { width: 5% !important; text-align: center !important; }
                          table.dataTable th:nth-child(2), table.dataTable td:nth-child(2) { width: 10% !important; text-align: center !important; }
                          table.dataTable th:nth-child(3), table.dataTable td:nth-child(3) { width: 35% !important; text-align: left !important; }
                          table.dataTable th:nth-child(4), table.dataTable td:nth-child(4),
                          table.dataTable th:nth-child(5), table.dataTable td:nth-child(5),
                          table.dataTable th:nth-child(6), table.dataTable td:nth-child(6),
                          table.dataTable th:nth-child(7), table.dataTable td:nth-child(7),
                          table.dataTable th:nth-child(8), table.dataTable td:nth-child(8),
                          table.dataTable th:nth-child(9), table.dataTable td:nth-child(9) { 
                              width: 8.33% !important; 
                              text-align: center !important;
                          }
                          table.dataTable thead th {
                              background-color: #f2f2f2 !important;
                              font-weight: bold !important;
                          }
                      </style>
                  `);
                  
                  // Center all columns except the name column
                  $(win.document.body).find('table td:not(:nth-child(3))').css('text-align', 'center');
                  
                  // Make sure the table uses the full width
                  $(win.document.body).find('table').css('width', '100%');
              }
          }
      ],
      columnDefs: [
          { className: "text-center", targets: [0,1,3,4,5,6,7,8] }, // Center align all columns except name
          { className: "text-wrap", targets: "_all" }, // Enable text wrapping for all columns
          { width: "5%", targets: 0 },    // No
          { width: "10%", targets: 1 },   // Kode
          { width: "30%", targets: 2 },   // Nama - lebih lebar
          { width: "8.33%", targets: 3 }, // Stok Awal
          { width: "8.33%", targets: 4 }, // Tambah Stok
          { width: "8.33%", targets: 5 }, // Laku
          { width: "8.33%", targets: 6 }, // Free
          { width: "8.33%", targets: 7 }, // Ganti Lock
          { width: "8.33%", targets: 8 }  // Stok Akhir
      ],
      language: {
          search: "Cari:",
          lengthMenu: "Tampilkan _MENU_ data",
          info: "Menampilkan _START_ sampai _END_ dari _TOTAL_ data",
          infoEmpty: "Menampilkan 0 sampai 0 dari 0 data",
          infoFiltered: "(disaring dari _MAX_ total data)",
          paginate: {
              first: "Pertama",
              last: "Terakhir",
              next: "Selanjutnya",
              previous: "Sebelumnya"
          }
      }
  });

  // Tambahkan header kategori setelah DataTable diinisialisasi
  this.addCategoryHeaders(kotakItems, aksesorisItems, otherItems);
},


// Fungsi untuk menambahkan header kategori setelah DataTable diinisialisasi
addCategoryHeaders(kotakItems, aksesorisItems, otherItems) {
    // Tambahkan container untuk header kategori di atas tabel
    const tableContainer = document.querySelector('#stockTable_wrapper');
    if (!tableContainer) return;
    
    // Cek apakah container header kategori sudah ada
    let categoryHeaderContainer = document.querySelector('.category-headers');
    if (!categoryHeaderContainer) {
        categoryHeaderContainer = document.createElement('div');
        categoryHeaderContainer.className = 'category-headers mb-3 mt-3';
        tableContainer.insertBefore(categoryHeaderContainer, tableContainer.querySelector('.dataTables_filter'));
    }
    
    // Buat HTML untuk header kategori
    categoryHeaderContainer.innerHTML = `
        <div class="d-flex flex-wrap gap-2">
            ${kotakItems.length > 0 ? 
                `<div class="category-badge badge bg-primary p-2">${kotakItems.length} Kotak Perhiasan</div>` : ''}
            ${aksesorisItems.length > 0 ? 
                `<div class="category-badge badge bg-success p-2">${aksesorisItems.length} Aksesoris Perhiasan</div>` : ''}
            ${otherItems.length > 0 ? 
                `<div class="category-badge badge bg-secondary p-2">${otherItems.length} Lainnya</div>` : ''}
        </div>
    `;
    
    // Tambahkan CSS untuk styling
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        .category-headers {
            display: flex;
            justify-content: flex-end;
            margin-right: 10px;
        }
        
        .category-badge {
            cursor: pointer;
        }
        
        .kotak-item, .aksesoris-item, .other-item {
            display: table-row;
        }
    `;
    document.head.appendChild(styleElement);
    
    // Tambahkan event listener untuk filter berdasarkan kategori
    document.querySelectorAll('.category-badge').forEach(badge => {
        badge.addEventListener('click', function() {
            const text = this.textContent.toLowerCase();
            let categoryClass = '';
            
            if (text.includes('kotak')) {
                categoryClass = 'kotak-item';
            } else if (text.includes('aksesoris')) {
                categoryClass = 'aksesoris-item';
            } else {
                categoryClass = 'other-item';
            }
            
            // Toggle active state
            this.classList.toggle('active');
            const isActive = this.classList.contains('active');
            
            // Update badge style
            if (isActive) {
                this.style.opacity = '1';
            } else {
                this.style.opacity = '0.6';
            }
            
            // Filter table
            const table = $('#stockTable').DataTable();
            
            // Custom filtering function
            $.fn.dataTable.ext.search.push(function(settings, data, dataIndex, row) {
                // Get all active categories
                const activeCategories = [];
                document.querySelectorAll('.category-badge.active').forEach(activeBadge => {
                    const badgeText = activeBadge.textContent.toLowerCase();
                    if (badgeText.includes('kotak')) {
                        activeCategories.push('kotak-item');
                    } else if (badgeText.includes('aksesoris')) {
                        activeCategories.push('aksesoris-item');
                    } else {
                        activeCategories.push('other-item');
                    }
                });
                
                // If no categories are active, show all rows
                if (activeCategories.length === 0) {
                    return true;
                }
                
                // Check if row belongs to any active category
                const rowNode = table.row(dataIndex).node();
                return activeCategories.some(category => rowNode.classList.contains(category));
            });
            
            // Redraw the table
            table.draw();
        });
    });
},

// Helper method to create table row HTML
createTableRow(item, index) {
    // Tambahkan kelas untuk kategori
    const categoryClass = item.kategori === 'kotak' ? 'kotak-item' : 
                         item.kategori === 'aksesoris' ? 'aksesoris-item' : 'other-item';
    
    return `
        <tr class="${categoryClass}">
            <td>${index}</td>
            <td>${item.kode || '-'}</td>
            <td>${item.nama || '-'}</td>
            <td>${item.stokAwal || 0}</td>
            <td>${item.tambahStok || 0}</td>
            <td>${item.laku || 0}</td>
            <td>${item.free || 0}</td>
            <td>${item.gantiLock || 0}</td>
            <td>${item.stokAkhir || 0}</td>
        </tr>
    `;
},

  // Refresh sales table (called when tab is activated)
  refreshSalesTable() {
    const table = $("#penjualanTable").DataTable();
    if (table) {
      table.columns.adjust().responsive.recalc();
    }
  },

  // Refresh stock table (called when tab is activated)
  refreshStockTable() {
    const table = $("#stockTable").DataTable();
    if (table) {
      table.columns.adjust().responsive.recalc();
    }
  },

  // Export sales data to Excel
  exportSalesData() {
    if (!this.filteredSalesData.length) {
      alert("Tidak ada data untuk diekspor");
      return;
    }

    // Prepare data for export
    const exportData = [];

    this.filteredSalesData.forEach((sale) => {
      const date = sale.timestamp ? formatDate(sale.timestamp.toDate()) : sale.tanggal;

      // For each item in the sale, create a row
      if (sale.items && sale.items.length) {
        sale.items.forEach((item) => {
          exportData.push({
            Tanggal: date,
            Sales: sale.sales || "-",
            "Kode Barang": item.kodeText || "-",
            "Nama Barang": item.nama || "-",
            Jumlah: item.jumlah || 0,
            "Harga Satuan": item.hargaSatuan || 0,
            Total: (item.jumlah || 0) * (item.hargaSatuan || 0),
          });
        });
      }
    });

    // Generate filename with date range
    const startDate = document.querySelector("#sales-tab-pane #startDate").value.replace(/\//g, "-");
    const endDate = document.querySelector("#sales-tab-pane #endDate").value.replace(/\//g, "-");
    const filename = `Laporan_Penjualan_${startDate}_sampai_${endDate}.xlsx`;

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Set column widths
    const wscols = [
      { wch: 12 }, // Tanggal
      { wch: 15 }, // Sales
      { wch: 12 }, // Kode Barang
      { wch: 25 }, // Nama Barang
      { wch: 8 }, // Jumlah
      { wch: 15 }, // Harga Satuan
      { wch: 15 }, // Total
    ];
    ws["!cols"] = wscols;

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Penjualan Aksesoris");

    // Export to file
    XLSX.writeFile(wb, filename);
  },

 // Export stock data to Excel (fungsi ini bisa dihapus karena sudah digantikan oleh DataTables Buttons)
exportStockData() {   
    if (!this.filteredStockData.length) {
        alert('Tidak ada data untuk diekspor');
        return;
    }
    
    // Gunakan tombol export dari DataTables
    $('#stockTable').DataTable().button(0).trigger(); // Trigger tombol Excel
}
,

  // Show loading indicator
  showLoading(isLoading) {
    const loadingIndicator = document.getElementById("loadingIndicator");
    if (loadingIndicator) {
      loadingIndicator.style.display = isLoading ? "flex" : "none";
    }
  },

  // Show error message
  showError(message) {
    // You can implement a toast or alert system here
    console.error(message);
    alert(message);
  },
};

// Initialize when document is ready
document.addEventListener("DOMContentLoaded", function () {
  // Check if XLSX is loaded (for Excel export)
  if (typeof XLSX === "undefined") {
    console.warn("SheetJS (XLSX) library is not loaded. Excel export will not work.");
  }

  // Initialize the handler
  laporanAksesorisHandler.init();
});

// Export the handler for potential use in other modules
export default laporanAksesorisHandler;

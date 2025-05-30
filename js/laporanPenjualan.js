import { firestore } from "./configFirebase.js";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// Table configurations
const tableConfigs = {
  all: {
    columns: ["Tanggal", "Sales", "Jenis", "Kode Barang", "Nama Barang", "Jumlah", "Berat", "Kadar", "Harga", "Status", "Keterangan"],
    fields: ["tanggal", "sales", "jenis", "kode", "nama", "jumlah", "berat", "kadar", "harga", "status", "keterangan"]
  },
  aksesoris: {
    columns: ["Tanggal", "Sales", "Jenis", "Kode Barang", "Nama Barang", "Jumlah", "Berat", "Kadar", "Harga", "Status"],
    fields: ["tanggal", "sales", "jenis", "kode", "nama", "jumlah", "berat", "kadar", "harga", "status"]
  },
  kotak: {
    columns: ["Tanggal", "Sales", "Jenis", "Nama Barang", "Jumlah", "Harga", "Status"],
    fields: ["tanggal", "sales", "jenis", "nama", "jumlah", "harga", "status"]
  },
  manual: {
    columns: ["Tanggal", "Sales", "Jenis", "Kode Barang", "Nama Barang", "Jumlah", "Berat", "Kadar", "Harga", "Status", "Keterangan"],
    fields: ["tanggal", "sales", "jenis", "kode", "nama", "jumlah", "berat", "kadar", "harga", "status", "keterangan"]
  },
  summary: {
    columns: ["Kode Barang", "Nama Barang", "Total Jumlah", "Total Harga"],
    fields: ["kode", "nama", "jumlah", "harga"]
  }
};

// Cache management
const cacheManager = {
  salesData: {
    data: null,
    lastFetched: null,
    ttl: 5 * 60 * 1000, // 5 minutes
  },
  
  isValid(cacheKey) {
    const cache = this[cacheKey];
    if (!cache || !cache.data || !cache.lastFetched) return false;
    return (Date.now() - cache.lastFetched) < cache.ttl;
  },
  
  set(cacheKey, data) {
    this[cacheKey] = {
      data: data,
      lastFetched: Date.now(),
      ttl: this[cacheKey]?.ttl || 5 * 60 * 1000
    };
  },
  
  get(cacheKey) {
    return this.isValid(cacheKey) ? this[cacheKey].data : null;
  },
  
  clear(cacheKey = null) {
    if (cacheKey) {
      this[cacheKey] = { data: null, lastFetched: null, ttl: this[cacheKey]?.ttl || 5 * 60 * 1000 };
    } else {
      Object.keys(this).forEach(key => {
        if (typeof this[key] === 'object' && this[key].hasOwnProperty('data')) {
          this[key] = { data: null, lastFetched: null, ttl: this[key].ttl };
        }
      });
    }
  }
};

// Main handler object
const laporanPenjualanHandler = {
  salesData: [],
  filteredSalesData: [],
  summaryData: [],
  isSummaryMode: false,
  dataTable: null,

  // Utility functions
  showAlert: (message, title = "Informasi", type = "info") => {
    return Swal.fire({
      title: title,
      text: message,
      icon: type,
      confirmButtonText: 'OK',
      confirmButtonColor: '#0d6efd'
    });
  },

  showLoading: (show) => {
    const loadingIndicator = document.getElementById("loadingIndicator");
    if (loadingIndicator) {
      loadingIndicator.style.display = show ? "flex" : "none";
    }
  },

  // Load data with cache management
  async loadSalesData(forceRefresh = false) {
    try {
      if (!forceRefresh) {
        const cachedData = cacheManager.get('salesData');
        if (cachedData) {
          console.log("Using cached sales data");
          this.salesData = cachedData;
          this.populateSalesPersonFilter();
          return;
        }
      }

      this.showLoading(true);
      console.log("Fetching fresh sales data from Firestore");

      const salesSnapshot = await getDocs(collection(firestore, "penjualanAksesoris"));
      const salesData = [];
      
      salesSnapshot.forEach((doc) => {
        const data = doc.data();
        
        if (data.jenisPenjualan === "gantiLock") {
          data.jenisPenjualan = "manual";
          data.isGantiLock = true;
        }
        
        salesData.push({ id: doc.id, ...data });
      });

      cacheManager.set('salesData', salesData);
      this.salesData = salesData;
      this.populateSalesPersonFilter();

    } catch (error) {
      console.error("Error loading sales data:", error);
      this.showAlert("Gagal memuat data penjualan: " + error.message, "Error", "error");
    } finally {
      this.showLoading(false);
    }
  },

  // DataTable management
  destroyDataTable() {
    if (this.dataTable) {
      try {
        this.dataTable.destroy();
        this.dataTable = null;
      } catch (error) {
        console.warn("Error destroying DataTable:", error);
        this.dataTable = null;
      }
    }
  },

  initDataTable(data = []) {
    this.destroyDataTable();
    
    try {
      this.dataTable = $("#penjualanTable").DataTable({
        data: data,
        destroy: true,
        language: {
          url: "//cdn.datatables.net/plug-ins/1.10.25/i18n/Indonesian.json",
        },
        dom: "Bfrtip",
        buttons: ["excel", "pdf", "print"],
        order: this.isSummaryMode ? [[2, "desc"]] : [[0, "desc"]],
        autoWidth: false,
        scrollX: true,
        columnDefs: [
          { targets: '_all', defaultContent: '-' }
        ]
      });

      setTimeout(() => {
        const widths = ['1000px', '80px', '100px', '120px', '200px', '70px', '80px', '80px', '120px', '100px', '150px'];
        
        $('#penjualanTable thead th').each(function(index) {
          $(this).css('width', widths[index]);
        });
        
        $('#penjualanTable tbody td').each(function(index) {
          const colIndex = index % widths.length;
          $(this).css('width', widths[colIndex]);
        });
        
        this.dataTable.columns.adjust();
      }, 100);

    } catch (error) {
      console.error("Error initializing DataTable:", error);
    }
  },

  updateDataTable(data) {
    if (this.dataTable) {
      try {
        this.dataTable.clear().rows.add(data).draw();
      } catch (error) {
        console.error("Error updating DataTable:", error);
        this.initDataTable(data);
      }
    } else {
      this.initDataTable(data);
    }
  },

  // Format jenis penjualan
  formatJenisPenjualan(transaction) {
    if (transaction.isGantiLock || transaction.jenisPenjualan === "gantiLock") {
      let kodeAksesoris = "";
      if (transaction.items && transaction.items.length > 0) {
        const itemWithKode = transaction.items.find(item => item.kodeLock);
        kodeAksesoris = itemWithKode ? itemWithKode.kodeLock : "";
      }
      return kodeAksesoris ? `Manual<br><small>(${kodeAksesoris})</small>` : "Manual";
    } else if (transaction.jenisPenjualan === "manual") {
      let kodeAksesoris = "";
      if (transaction.items && transaction.items.length > 0) {
        const itemWithKode = transaction.items.find(item => item.kodeLock);
        if (itemWithKode && itemWithKode.kodeLock) {
          kodeAksesoris = itemWithKode.kodeLock;
          return `Manual<br><small>(${kodeAksesoris})</small>`;
        }
      }
      return "Manual";
    }
    
    const jenis = transaction.jenisPenjualan || "Tidak diketahui";
    return jenis.charAt(0).toUpperCase() + jenis.slice(1);
  },

  // Update table header
  updateTableHeader() {
    const salesType = document.getElementById("salesType").value;
    let configKey = salesType === "all" ? "manual" : 
                   salesType === "layanan" ? "manual" : salesType;
    
    if (this.isSummaryMode) configKey = "summary";
    
    const config = tableConfigs[configKey];
    if (!config) return;

    const headerRow = document.querySelector("#penjualanTable thead tr");
    if (headerRow) {
      headerRow.innerHTML = config.columns.map(col => `<th>${col}</th>`).join('');
    }
  },

  // Prepare data for DataTable
  prepareTableData() {
    const salesType = document.getElementById("salesType").value;
    let configKey = salesType === "all" ? "manual" : 
                   salesType === "layanan" ? "manual" : 
                   salesType === "manual" ? "manual" : salesType;
    
    if (this.isSummaryMode) {
      configKey = "summary";
      return this.summaryData.map(item => [
        item.kode || '-',
        item.nama || '-',
        item.jumlah || 0,
        `Rp ${(item.totalHarga || 0).toLocaleString("id-ID")}`
      ]);
    }

    const config = tableConfigs[configKey];
    if (!config) return [];

    const tableData = [];
    
    this.filteredSalesData.forEach(transaction => {
      if (!transaction) return;
      
      const date = transaction.timestamp ? 
        formatDate(transaction.timestamp.toDate()) : 
        (transaction.tanggal || "-");
      const sales = transaction.sales || "Admin";
      const jenisPenjualan = this.formatJenisPenjualan(transaction);

      if (transaction.items && transaction.items.length > 0) {
        transaction.items.forEach(item => {
          if (!item) return;
          
          const rowData = config.fields.map(field => {
            switch(field) {
              case "tanggal": return date;
              case "sales": return sales;
              case "jenis": return jenisPenjualan;
              case "kode": 
              case "barcode": 
                return item.kodeText || item.barcode || "-";
              case "nama": return item.nama || "-";
              case "jumlah": return item.jumlah || 1;
              case "kadar": return item.kadar || "-";
              case "berat": return item.berat ? item.berat + " gr" : "-";
              case "keterangan": 
                if (transaction.jenisPenjualan === "manual") {
                  return item.keterangan || transaction.keterangan || "-";
                }
                return "-";
              case "harga": return `Rp ${parseInt(item.totalHarga || 0).toLocaleString("id-ID")}`;
              case "status": return this.getStatusBadge(transaction);
              default: return "-";
            }
          });
          
          tableData.push(rowData);
        });
      } else {
        const rowData = config.fields.map(field => {
          switch(field) {
            case "tanggal": return date;
            case "sales": return sales;
            case "jenis": return jenisPenjualan;
            case "keterangan": return transaction.keterangan || "-";
            case "harga": return `Rp ${parseInt(transaction.totalHarga || 0).toLocaleString("id-ID")}`;
            case "status": return this.getStatusBadge(transaction);
            default: return "-";
          }
        });
        
        tableData.push(rowData);
      }
    });

    return tableData;
  },

  getStatusBadge(transaction) {
    const status = transaction.statusPembayaran || "Lunas";
    
    if (status === "DP") {
      return `<span class="badge bg-warning">DP: Rp ${formatRupiah(transaction.nominalDP)}</span>
              <br><small>Sisa: Rp ${formatRupiah(transaction.sisaPembayaran)}</small>`;
    } else if (status === "Lunas") {
      return `<span class="badge bg-success">Lunas</span>`;
    } else if (transaction.metodeBayar === "free") {
      return `<span class="badge bg-info">Gratis</span>`;
    }
    
    return `<span class="badge bg-secondary">${status}</span>`;
  },

  // Render table
  renderSalesTable() {
    try {
      this.updateTableHeader();
      const tableData = this.prepareTableData();
      this.updateDataTable(tableData);
      this.updateSummaryDisplay();
    } catch (error) {
      console.error("Error rendering sales table:", error);
      this.showAlert("Terjadi kesalahan saat menampilkan data", "Error", "error");
    }
  },

  // Filter data
  filterSalesData() {
    if (!this.salesData || !this.salesData.length) return;

    this.showLoading(true);

    try {
      const startDateStr = document.getElementById("startDate").value;
      const endDateStr = document.getElementById("endDate").value;
      const salesType = document.getElementById("salesType").value;
      const salesPerson = document.getElementById("salesPerson").value;

      const startDate = parseDate(startDateStr);
      const endDate = parseDate(endDateStr);
      if (endDate) endDate.setDate(endDate.getDate() + 1);

      this.filteredSalesData = this.salesData.filter(item => {
        if (!item) return false;
        
        const transactionDate = item.timestamp ? 
          item.timestamp.toDate() : parseDate(item.tanggal);
        if (!transactionDate) return false;

        const dateInRange = (!startDate || transactionDate >= startDate) && 
                           (!endDate || transactionDate < endDate);

        let typeMatches = true;
        if (salesType !== "all") {
          if (salesType === "layanan") {
            typeMatches = item.jenisPenjualan === "manual";
          } else {
            typeMatches = item.jenisPenjualan === salesType;
          }
        }

        let salesMatches = true;
        if (salesPerson !== "all") {
          salesMatches = item.sales === salesPerson;
        }

        return dateInRange && typeMatches && salesMatches;
      });

      this.filteredSalesData.sort((a, b) => {
        const dateA = a.timestamp ? a.timestamp.toDate() : parseDate(a.tanggal);
        const dateB = b.timestamp ? b.timestamp.toDate() : parseDate(b.tanggal);
        return dateB - dateA;
      });

      this.renderSalesTable();
    } catch (error) {
      console.error("Error filtering sales data:", error);
      this.showAlert("Terjadi kesalahan saat memfilter data", "Error", "error");
    } finally {
      this.showLoading(false);
    }
  },

  // Update summary display
  updateSummaryDisplay() {
    let totalRevenue = 0;
    let totalTransactions = 0;

    if (this.isSummaryMode && this.summaryData) {
      totalRevenue = this.summaryData.reduce((sum, item) => sum + (item.totalHarga || 0), 0);
      totalTransactions = this.summaryData.length;
    } else if (this.filteredSalesData) {
      totalTransactions = this.filteredSalesData.length;
      this.filteredSalesData.forEach(transaction => {
        if (transaction.metodeBayar === "dp" && transaction.statusPembayaran === "DP") {
          totalRevenue += transaction.sisaPembayaran || 0;
        } else if (transaction.metodeBayar === "free") {
          totalRevenue += 0;
        } else {
          totalRevenue += transaction.totalHarga || 0;
        }
      });
    }

    document.getElementById("totalTransactions").textContent = 
      this.isSummaryMode ? `Total Jenis Barang: ${totalTransactions}` : `Total Transaksi: ${totalTransactions}`;
    
    document.getElementById("totalRevenue").textContent = 
      `Total Pendapatan: Rp ${parseInt(totalRevenue).toLocaleString("id-ID")}`;
  },

  // Populate sales person filter
  populateSalesPersonFilter() {
    const salesPersons = [...new Set(this.salesData.map(item => item.sales).filter(Boolean))];
    const dropdown = document.getElementById("salesPerson");
    
    if (!dropdown) return;

    while (dropdown.options.length > 1) {
      dropdown.remove(1);
    }

    salesPersons.forEach(person => {
      const option = document.createElement("option");
      option.value = person;
      option.textContent = person;
      dropdown.appendChild(option);
    });
  },

  // Generate summary data
  generateSalesSummary() {
    if (!this.filteredSalesData.length) return;

    const summaryMap = new Map();

    this.filteredSalesData.forEach(transaction => {
      if (!transaction.items || !transaction.items.length) return;

      transaction.items.forEach(item => {
        const key = item.kodeText || "unknown";
        const name = item.nama || "Tidak diketahui";
        const quantity = parseInt(item.jumlah) || 1;

        let itemTotalPrice = parseInt(item.totalHarga) || 0;

        if (transaction.metodeBayar === "dp" && transaction.statusPembayaran === "DP") {
          const proportion = itemTotalPrice / transaction.totalHarga;
          itemTotalPrice = Math.round(proportion * transaction.sisaPembayaran);
        } else if (transaction.metodeBayar === "free") {
          itemTotalPrice = 0;
        }

        if (summaryMap.has(key)) {
          const existingItem = summaryMap.get(key);
          existingItem.jumlah += quantity;
          existingItem.totalHarga += itemTotalPrice;
        } else {
          summaryMap.set(key, {
            kode: key,
            nama: name,
            jumlah: quantity,
            totalHarga: itemTotalPrice,
          });
        }
      });
    });

    this.summaryData = Array.from(summaryMap.values());
    this.summaryData.sort((a, b) => b.totalHarga - a.totalHarga);
  },

  // Toggle summary view
  toggleSummaryView() {
    this.isSummaryMode = !this.isSummaryMode;

    const toggleBtn = document.getElementById("toggleSummaryBtn");
    if (toggleBtn) {
      toggleBtn.innerHTML = this.isSummaryMode
        ? '<i class="fas fa-list me-1"></i> Detail Penjualan'
        : '<i class="fas fa-chart-pie me-1"></i> Summary Penjualan';
    }

    if (this.isSummaryMode) {
      this.generateSalesSummary();
    }

    this.renderSalesTable();
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

  // Set default dates
  setDefaultDates() {
    const today = new Date();
    const formattedToday = formatDate(today);
    document.querySelectorAll(".datepicker").forEach(input => {
      input.value = formattedToday;
    });
  },

  // Attach event listeners
  attachEventListeners() {
    document.getElementById("filterSalesBtn")?.addEventListener("click", () => {
      this.loadSalesData().then(() => {
        this.filterSalesData();
      });
    });

    document.getElementById("toggleSummaryBtn")?.addEventListener("click", () => {
      this.toggleSummaryView();
    });

    document.getElementById("salesType")?.addEventListener("change", () => {
      if (this.filteredSalesData && this.filteredSalesData.length > 0) {
        this.renderSalesTable();
      }
    });
  },

  // Initialize
  init() {
    this.initDatePickers();
    this.attachEventListeners();
    this.setDefaultDates();
    
    this.initDataTable([]);
    
    const tableBody = document.querySelector("#penjualanTable tbody");
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="12" class="text-center">Silakan pilih filter dan klik tombol "Tampilkan" untuk melihat data</td>
        </tr>
      `;
    }

    setInterval(() => {
      cacheManager.clear();
    }, 10 * 60 * 1000);
  }
};

// Utility functions
const formatRupiah = (angka) => {
  if (!angka && angka !== 0) return "0";
  const number = typeof angka === "string" ? parseInt(angka) : angka;
  return new Intl.NumberFormat("id-ID").format(number);
};

const parseDate = (dateString) => {
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

// Initialize when document is ready
document.addEventListener("DOMContentLoaded", function () {
  if (typeof XLSX === "undefined") {
    console.warn("SheetJS (XLSX) library is not loaded. Excel export will not work.");
  }

  laporanPenjualanHandler.init();
});

export default laporanPenjualanHandler;

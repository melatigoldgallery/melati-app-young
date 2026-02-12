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
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// Table configurations
const tableConfigs = {
  rekap: {
    columns: [
      "Tanggal",
      "Jam",
      "Sales",
      "Jenis",
      "Kode",
      "Nama Barang",
      "Pcs",
      "Gr",
      "Kadar",
      "Harga",
      "Status",
      "Keterangan",
    ],
    fields: ["tanggal", "jam", "sales", "jenis", "kode", "nama", "pcs", "gr", "kadar", "harga", "status", "keterangan"],
    colspanTotal: 6, // colspan untuk cell TOTAL di footer (sama dengan detail untuk konsistensi)
  },
  detail: {
    columns: [
      "Tanggal",
      "Jam",
      "Sales",
      "Jenis",
      "Kode",
      "Nama Barang",
      "Pcs",
      "Gr",
      "Kadar",
      "Harga",
      "Status",
      "Keterangan",
    ],
    fields: ["tanggal", "jam", "sales", "jenis", "kode", "nama", "pcs", "gr", "kadar", "harga", "status", "keterangan"],
    colspanTotal: 6, // colspan untuk cell TOTAL di footer
  },
  // Legacy configs (kept for compatibility)
  all: {
    columns: ["Tanggal", "Jenis", "Kode", "Nama Barang", "Pcs", "Gr", "Kadar", "Harga", "Status", "Keterangan"],
    fields: ["tanggal", "jenis", "kode", "nama", "pcs", "gr", "kadar", "harga", "status", "keterangan"],
  },
  aksesoris: {
    columns: ["Tanggal", "Jenis", "Kode", "Nama Barang", "Pcs", "Gr", "Kadar", "Harga", "Status"],
    fields: ["tanggal", "jenis", "kode", "nama", "pcs", "gr", "kadar", "harga", "status"],
  },
  kotak: {
    columns: ["Tanggal", "Jenis", "Nama Barang", "Pcs", "Harga", "Status"],
    fields: ["tanggal", "jenis", "nama", "pcs", "harga", "status"],
  },
  manual: {
    columns: ["Tanggal", "Jenis", "Kode", "Nama Barang", "Pcs", "Gr", "Kadar", "Harga", "Status", "Keterangan"],
    fields: ["tanggal", "jenis", "kode", "nama", "pcs", "gr", "kadar", "harga", "status", "keterangan"],
  },
};

// Smart cache management adapted from laporanStok.js
const cacheManager = {
  // Cache TTL constants
  CACHE_TTL_TODAY: 30 * 60 * 1000, // 30 menit untuk data hari ini
  CACHE_TTL_STANDARD: 60 * 60 * 1000, // 1 jam untuk data historis

  // Check if cache is valid
  isValid(cacheKey) {
    const metaKey = `${cacheKey}_timestamp`;
    const timestamp = localStorage.getItem(metaKey);

    if (!timestamp) return false;

    const now = Date.now();
    const lastUpdate = parseInt(timestamp);

    // Jika cache key mencakup hari ini, gunakan TTL yang lebih pendek
    const today = this.getLocalDateString();
    if (cacheKey.includes(today)) {
      return now - lastUpdate < this.CACHE_TTL_TODAY;
    }

    // Untuk data historis, gunakan TTL standar
    return now - lastUpdate < this.CACHE_TTL_STANDARD;
  },

  // Set cache data with localStorage persistence
  set(cacheKey, data) {
    try {
      const compressedData = this.compressData(data);
      localStorage.setItem(cacheKey, compressedData);

      const metaKey = `${cacheKey}_timestamp`;
      localStorage.setItem(metaKey, Date.now().toString());

      console.log(`Cache saved for key: ${cacheKey}`);
    } catch (error) {
      console.error("Error saving cache:", error);
      this.clearOldCache();
      try {
        const compressedData = this.compressData(data);
        localStorage.setItem(cacheKey, compressedData);
        localStorage.setItem(`${cacheKey}_timestamp`, Date.now().toString());
      } catch (retryError) {
        console.error("Failed to save cache after cleanup:", retryError);
      }
    }
  },

  // Get cache data from localStorage
  get(cacheKey) {
    if (!this.isValid(cacheKey)) {
      this.clear(cacheKey);
      return null;
    }

    try {
      const compressedData = localStorage.getItem(cacheKey);
      if (!compressedData) return null;

      return this.decompressData(compressedData);
    } catch (error) {
      console.error("Error retrieving cache:", error);
      this.clear(cacheKey);
      return null;
    }
  },

  // Clear specific cache
  clear(cacheKey = null) {
    if (cacheKey) {
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(`${cacheKey}_timestamp`);
    } else {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith("salesData_") || key.includes("_timestamp")) {
          localStorage.removeItem(key);
        }
      });
    }
  },

  // Clear old cache entries
  clearOldCache() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.endsWith("_timestamp")) {
        const timestamp = parseInt(localStorage.getItem(key));
        if (now - timestamp > maxAge) {
          const dataKey = key.replace("_timestamp", "");
          localStorage.removeItem(key);
          localStorage.removeItem(dataKey);
        }
      }
    });
  },

  // Clear cache for specific date
  clearCacheForDate(date) {
    const dateStr = formatDate(date).replace(/\//g, "-");
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.includes(dateStr) && key.startsWith("salesData_")) {
        localStorage.removeItem(key);
        localStorage.removeItem(`${key}_timestamp`);
      }
    });
    console.log(`🗑️ Cleared cache for ${dateStr}`);
  },

  // Compress data before storing
  compressData(data) {
    try {
      const processedData = JSON.parse(
        JSON.stringify(data, (key, value) => {
          if (value && typeof value === "object" && value.seconds && value.nanoseconds) {
            return new Date(value.seconds * 1000 + value.nanoseconds / 1000000).toISOString();
          }
          return value;
        }),
      );

      const jsonString = JSON.stringify(processedData);
      return jsonString.replace(/\s+/g, "");
    } catch (error) {
      console.error("Error compressing data:", error);
      return JSON.stringify(data);
    }
  },

  // Decompress data after retrieving
  decompressData(compressedData) {
    try {
      const parsed = JSON.parse(compressedData);

      if (Array.isArray(parsed)) {
        return parsed.map((item) => {
          if (item.timestamp && typeof item.timestamp === "string") {
            item.timestamp = new Date(item.timestamp);
          }
          return item;
        });
      }

      return parsed;
    } catch (error) {
      console.error("Error decompressing data:", error);
      return null;
    }
  },

  // Get local date string in YYYY-MM-DD format
  getLocalDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  },
};

// Main handler object with smart real-time updates
const laporanPenjualanHandler = {
  salesData: [],
  filteredSalesData: [],
  dataTable: null,
  currentReportType: "rekap", // Default: rekap mode

  // Real-time listener management (adapted from laporanStok.js)
  currentListener: null,
  currentSelectedDate: null,
  isListeningToday: false,
  isDataLoaded: false,

  // Utility functions
  showAlert: (message, title = "Informasi", type = "info") => {
    return Swal.fire({
      title: title,
      text: message,
      icon: type,
      confirmButtonText: "OK",
      confirmButtonColor: "#0d6efd",
    });
  },

  showLoading: (show) => {
    const loadingIndicator = document.getElementById("loadingIndicator");
    if (loadingIndicator) {
      loadingIndicator.style.display = show ? "flex" : "none";
    }
  },

  // Smart real-time listener setup (adapted from laporanStok.js)
  setupRealtimeListener(selectedDate) {
    const today = new Date();
    const isToday = this.isSameDate(selectedDate, today);

    // Only setup listener for today's data
    if (isToday && !this.isListeningToday) {
      this.setupTodayListener();
      this.isListeningToday = true;
      console.log("📡 Real-time listener activated for today");
    } else if (!isToday && this.isListeningToday) {
      // Remove listener if not viewing today's data
      this.removeTodayListener();
      this.isListeningToday = false;
      console.log("🔇 Real-time listener deactivated");
    }
  },

  // Setup listener for today's sales data
  setupTodayListener() {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Listen to sales data for today
    const salesQuery = query(
      collection(firestore, "penjualanAksesoris"),
      where("timestamp", ">=", Timestamp.fromDate(startOfDay)),
      where("timestamp", "<=", Timestamp.fromDate(endOfDay)),
      orderBy("timestamp", "desc"),
    );

    this.currentListener = onSnapshot(salesQuery, (snapshot) => {
      if (!snapshot.metadata.hasPendingWrites && this.isDataLoaded) {
        console.log("📡 Real-time update detected for sales data");
        this.handleRealtimeUpdate();
      }
    });
  },

  // Remove today's listener
  removeTodayListener() {
    if (this.currentListener) {
      this.currentListener();
      this.currentListener = null;
      console.log("🔇 Removed real-time listener");
    }
  },

  // Handle real-time updates
  async handleRealtimeUpdate() {
    if (!this.currentDateRange || !this.currentDateRange.start || !this.currentDateRange.end) return;

    try {
      // Clear cache for current date range
      const startStr = formatDate(this.currentDateRange.start).replace(/\//g, "-");
      const endStr = formatDate(this.currentDateRange.end).replace(/\//g, "-");
      const cacheKey = `salesData_${startStr}_to_${endStr}`;
      cacheManager.clear(cacheKey);

      // Reload data for current date range
      await this.loadSalesDataByDateRange(this.currentDateRange.start, this.currentDateRange.end, true);

      // Filter and render
      this.filterSalesData();

      // Show update indicator
      this.showUpdateIndicator();
    } catch (error) {
      console.error("Error handling real-time update:", error);
    }
  },

  // Load sales data by date range
  async loadSalesDataByDateRange(startDate, endDate, forceRefresh = false) {
    try {
      // Validation
      if (endDate < startDate) {
        throw new Error("Tanggal akhir harus lebih besar atau sama dengan tanggal mulai");
      }

      // Create cache key from date range
      const startStr = formatDate(startDate).replace(/\//g, "-");
      const endStr = formatDate(endDate).replace(/\//g, "-");
      const cacheKey = `salesData_${startStr}_to_${endStr}`;

      this.currentSelectedDate = startDate;
      this.currentDateRange = { start: startDate, end: endDate };

      // Setup real-time listener for today
      this.setupRealtimeListener(endDate);

      // Check cache first (except for forced refresh)
      if (!forceRefresh) {
        const cachedData = cacheManager.get(cacheKey);
        if (cachedData) {
          console.log(`📦 Using cached data for ${startStr} to ${endStr}`);
          this.salesData = cachedData;
          this.showCacheIndicator(`Menggunakan data cache (${startStr} - ${endStr})`);
          this.populateSalesPersonFilter();
          return;
        }
      }

      console.log(`🔄 Loading fresh data from ${startStr} to ${endStr}`);
      this.hideCacheIndicator();

      // Query for date range
      const startOfDay = new Date(startDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);

      const salesQuery = query(
        collection(firestore, "penjualanAksesoris"),
        where("timestamp", ">=", Timestamp.fromDate(startOfDay)),
        where("timestamp", "<=", Timestamp.fromDate(endOfDay)),
        orderBy("timestamp", "desc"),
      );

      const salesSnapshot = await getDocs(salesQuery);
      const salesData = [];

      salesSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.jenisPenjualan === "gantiLock") {
          data.jenisPenjualan = "manual";
          data.isGantiLock = true;
        }
        salesData.push({ id: doc.id, ...data });
      });

      // Save to cache
      cacheManager.set(cacheKey, salesData);

      this.salesData = salesData;
      this.populateSalesPersonFilter();
      console.log(`✅ Loaded ${salesData.length} sales records for ${startStr} to ${endStr}`);
    } catch (error) {
      console.error("Error loading sales data by date range:", error);

      // Try fallback to cache
      const startStr = formatDate(startDate).replace(/\//g, "-");
      const endStr = formatDate(endDate).replace(/\//g, "-");
      const cacheKey = `salesData_${startStr}_to_${endStr}`;
      const cachedData = cacheManager.get(cacheKey);

      if (cachedData) {
        console.log("📦 Using cached data as fallback");
        this.showAlert(
          "Terjadi kesalahan saat mengambil data terbaru. Menggunakan data cache.",
          "Peringatan",
          "warning",
        );
        this.showCacheIndicator("Menggunakan data cache (fallback)");
        this.salesData = cachedData;
        this.populateSalesPersonFilter();
      } else {
        this.showAlert("Gagal memuat data penjualan: " + error.message, "Error", "error");
      }
    }
  },

  // Show cache indicator
  showCacheIndicator(message) {
    let cacheIndicator = document.getElementById("cacheIndicator");
    if (!cacheIndicator) {
      cacheIndicator = document.createElement("small");
      cacheIndicator.id = "cacheIndicator";
      cacheIndicator.className = "text-muted ms-2";

      const filterBtn = document.getElementById("filterSalesBtn");
      if (filterBtn && filterBtn.parentNode) {
        filterBtn.parentNode.appendChild(cacheIndicator);
      }
    }

    cacheIndicator.textContent = message;
    cacheIndicator.style.display = "inline-block";
  },

  // Hide cache indicator
  hideCacheIndicator() {
    const cacheIndicator = document.getElementById("cacheIndicator");
    if (cacheIndicator) {
      cacheIndicator.style.display = "none";
    }
  },

  // Show update indicator
  showUpdateIndicator() {
    // Remove existing indicator
    const existingIndicator = document.getElementById("updateIndicator");
    if (existingIndicator) {
      existingIndicator.remove();
    }

    // Create new indicator
    const indicator = document.createElement("div");
    indicator.id = "updateIndicator";
    indicator.className = "alert alert-success alert-dismissible fade show mb-2";
    indicator.innerHTML = `
      <i class="fas fa-sync-alt me-2"></i>
      Data telah diperbarui secara real-time
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    const tableContainer = document.querySelector("#penjualanTable").parentElement;
    tableContainer.insertBefore(indicator, tableContainer.firstChild);

    // Auto remove after 3 seconds
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.remove();
      }
    }, 3000);
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

    const reportType = this.currentReportType || "rekap";
    const isDetailMode = reportType === "detail";

    try {
      this.dataTable = $("#penjualanTable").DataTable({
        data: data,
        destroy: true,
        language: {
          url: "//cdn.datatables.net/plug-ins/1.10.25/i18n/Indonesian.json",
        },
        // PERBAIKAN: footerCallback dengan logika DP yang benar + support mode detail
        footerCallback: function (row, data, start, end, display) {
          let totalPcs = 0;
          let totalBerat = 0;
          let totalHarga = 0;
          let hasValidBerat = false;

          // PERBAIKAN: Akses data asli untuk perhitungan total yang akurat
          laporanPenjualanHandler.filteredSalesData.forEach((transaction) => {
            if (!transaction.items) return;

            transaction.items.forEach((item) => {
              const jumlah = parseInt(item.jumlah) || 1;
              let harga = parseInt(item.totalHarga) || 0;

              // Selalu hitung PCS dan berat
              totalPcs += jumlah;

              const berat = parseFloat(item.berat) || 0;
              if (berat > 0 && transaction.jenisPenjualan !== "kotak") {
                totalBerat += berat;
                hasValidBerat = true;
              }

              // PERBAIKAN: Logika perhitungan harga berdasarkan metode pembayaran
              if (transaction.metodeBayar === "dp") {
                const nominalDP = parseFloat(transaction.nominalDP) || 0;
                const totalHargaTransaksi = parseFloat(transaction.totalHarga) || 0;

                if (nominalDP >= totalHargaTransaksi) {
                  // Jika DP >= total harga, tidak dihitung (harga = 0)
                  harga = 0;
                } else {
                  // Jika DP < total harga, hitung proporsi sisa pembayaran
                  const sisaPembayaran = totalHargaTransaksi - nominalDP;
                  const proporsi = harga / totalHargaTransaksi;
                  harga = Math.round(proporsi * sisaPembayaran);
                }
              } else if (transaction.metodeBayar === "free") {
                harga = 0;
              }
              // Untuk metode tunai, harga tetap normal

              totalHarga += harga;
            });
          });

          const api = this.api();

          // Column indices (consistent untuk rekap & detail - sama-sama 12 kolom)
          const pcsColIndex = 6; // Kolom Pcs
          const grColIndex = 7; // Kolom Gr
          const hargaColIndex = 9; // Kolom Harga

          $(api.column(pcsColIndex).footer()).html(totalPcs);
          $(api.column(grColIndex).footer()).html(hasValidBerat ? `${totalBerat.toFixed(2)} gr` : "-");
          $(api.column(hargaColIndex).footer()).html(`Rp ${totalHarga.toLocaleString("id-ID")}`);
        },

        dom: "Bfrtip", // Menggunakan buttons DataTables dengan custom action
        buttons: [
          {
            extend: "excelHtml5",
            text: '<i class="fas fa-file-excel"></i> Excel',
            className: "btn btn-success btn-sm",
            action: function (e, dt, button, config) {
              // Override dengan logic custom (agregasi data)
              e.preventDefault();
              laporanPenjualanHandler.exportToExcel();
            },
          },
          {
            extend: "pdfHtml5",
            text: '<i class="fas fa-file-pdf"></i> PDF',
            className: "btn btn-danger btn-sm",
            action: function (e, dt, button, config) {
              // Override dengan logic custom (agregasi data)
              e.preventDefault();
              laporanPenjualanHandler.exportToPDF();
            },
          },
        ],
        order: [[0, "desc"]],
        autoWidth: false,
        scrollX: true,
        columnDefs: [{ targets: "_all", defaultContent: "-" }],
      });

      // Store reference to dataTable before setTimeout to avoid scope issues
      const dataTableInstance = this.dataTable;

      setTimeout(() => {
        // Column widths (consistent - sama untuk rekap & detail, 12 kolom)
        const widths = [
          "100px",
          "80px",
          "100px",
          "100px",
          "120px",
          "200px",
          "70px",
          "80px",
          "80px",
          "120px",
          "100px",
          "150px",
        ];

        $("#penjualanTable thead th").each(function (index) {
          $(this).css("width", widths[index]);
        });

        $("#penjualanTable tbody td").each(function (index) {
          const colIndex = index % widths.length;
          $(this).css("width", widths[colIndex]);
        });

        if (dataTableInstance) {
          dataTableInstance.columns.adjust();
        }
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
        const itemWithKode = transaction.items.find((item) => item.kodeLock);
        kodeAksesoris = itemWithKode ? itemWithKode.kodeLock : "";
      }
      return kodeAksesoris ? `Manual<br><small>(${kodeAksesoris})</small>` : "Manual";
    } else if (transaction.jenisPenjualan === "manual") {
      let kodeAksesoris = "";
      if (transaction.items && transaction.items.length > 0) {
        const itemWithKode = transaction.items.find((item) => item.kodeLock);
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
    const reportType = document.getElementById("reportType")?.value || "rekap";
    const config = tableConfigs[reportType];

    if (!config) {
      console.warn(`Config not found for reportType: ${reportType}`);
      return;
    }

    const headerRow = document.querySelector("#penjualanTable thead tr");
    if (headerRow) {
      headerRow.innerHTML = config.columns.map((col) => `<th>${col}</th>`).join("");
    }

    // Update footer colspan
    const footerTotalCell = document.querySelector("#penjualanTable tfoot td:first-child");
    if (footerTotalCell && config.colspanTotal) {
      footerTotalCell.setAttribute("colspan", config.colspanTotal);
    }
  },

  // Prepare data for DataTable
  prepareTableData() {
    const reportType = document.getElementById("reportType")?.value || "rekap";
    this.currentReportType = reportType;

    if (reportType === "detail") {
      return this.prepareDetailData();
    } else {
      return this.prepareRekapData();
    }
  },

  // Prepare REKAP data (existing aggregation logic)
  prepareRekapData() {
    const salesType = document.getElementById("salesType").value;
    const configKey = "manual";
    const config = tableConfigs[configKey];
    if (!config) return [];

    const tableData = [];

    // PERBAIKAN: Buat summary map global untuk menggabungkan item dengan kode sama
    const globalSummaryMap = new Map();

    this.filteredSalesData.forEach((transaction) => {
      // Enhanced date formatting with better timestamp handling
      let date = "-";
      if (transaction.timestamp) {
        if (typeof transaction.timestamp.toDate === "function") {
          date = formatDate(transaction.timestamp.toDate());
        } else if (transaction.timestamp instanceof Date) {
          date = formatDate(transaction.timestamp);
        } else if (typeof transaction.timestamp === "string") {
          date = formatDate(new Date(transaction.timestamp));
        } else if (typeof transaction.timestamp === "object" && transaction.timestamp.seconds) {
          date = formatDate(new Date(transaction.timestamp.seconds * 1000));
        }
      } else if (transaction.tanggal) {
        date = transaction.tanggal;
      }

      const jenisPenjualan = this.formatJenisPenjualan(transaction);
      const status = this.getStatusBadge(transaction);
      const keterangan = transaction.keterangan || "-";

      if (!transaction.items) return;

      // PERBAIKAN: Cek apakah ini penjualan manual atau bukan
      const isManualSale =
        transaction.jenisPenjualan === "manual" ||
        transaction.isGantiLock ||
        transaction.jenisPenjualan === "gantiLock";

      if (isManualSale) {
        // Untuk penjualan manual: tampilkan detail setiap item dalam setiap transaksi
        transaction.items.forEach((item) => {
          const key = item.kodeText || item.barcode || "-";
          const name = item.nama || "-";
          const kadar = item.kadar || "-";
          const berat = parseFloat(item.berat) || 0;
          const jumlah = parseInt(item.jumlah) || 1;

          let harga = parseInt(item.totalHarga) || 0;
          if (transaction.metodeBayar === "free") {
            harga = 0;
          }

          const beratDisplay = berat > 0 ? `${berat.toFixed(2)} gr` : "-";

          // Tambahkan setiap item sebagai baris terpisah (12 kolom - Jam & Sales diisi "-")
          tableData.push([
            date, // Tanggal
            "-", // Jam (tidak ada di mode rekap)
            "-", // Sales (tidak ada di mode rekap)
            jenisPenjualan, // Jenis
            key, // Kode
            name, // Nama
            jumlah, // Pcs
            beratDisplay, // Gr
            kadar, // Kadar
            `Rp ${harga.toLocaleString("id-ID")}`, // Harga
            status, // Status
            item.keterangan || keterangan, // Keterangan
          ]);
        });
      } else {
        // PERBAIKAN: Untuk penjualan aksesoris/kotak: gunakan global summary untuk menggabungkan semua item dengan kode sama
        transaction.items.forEach((item) => {
          const key = item.kodeText || item.barcode || "-";
          const name = item.nama || "-";
          const kadar = item.kadar || "-";
          const berat = parseFloat(item.berat) || 0;
          const jumlah = parseInt(item.jumlah) || 1;

          let harga = parseInt(item.totalHarga) || 0;
          if (transaction.metodeBayar === "free") {
            harga = 0;
          }

          // Gunakan kode sebagai key untuk menggabungkan item yang sama
          if (globalSummaryMap.has(key)) {
            const existing = globalSummaryMap.get(key);
            existing.jumlah += jumlah;
            existing.berat += berat;
            existing.harga += harga;
            // Update tanggal ke yang terbaru jika ada
            if (date !== "-") {
              existing.tanggal = date;
            }
          } else {
            globalSummaryMap.set(key, {
              tanggal: date,
              jenis: jenisPenjualan,
              kode: key,
              nama: name,
              jumlah,
              berat,
              kadar,
              harga,
              status,
              keterangan: item.keterangan || keterangan,
              jenisPenjualan: transaction.jenisPenjualan,
            });
          }
        });
      }
    });

    // PERBAIKAN: Tambahkan summary data dari global map ke tableData (12 kolom)
    Array.from(globalSummaryMap.values()).forEach((item) => {
      const beratDisplay = item.jenisPenjualan === "kotak" ? "-" : `${item.berat.toFixed(2)} gr`;
      tableData.push([
        item.tanggal, // Tanggal
        "-", // Jam (tidak ada di mode rekap)
        "-", // Sales (tidak ada di mode rekap)
        item.jenis, // Jenis
        item.kode, // Kode
        item.nama, // Nama
        item.jumlah, // Pcs
        beratDisplay, // Gr
        item.kadar, // Kadar
        `Rp ${item.harga.toLocaleString("id-ID")}`, // Harga
        item.status, // Status
        item.keterangan, // Keterangan
      ]);
    });

    return tableData;
  },

  // Prepare DETAIL data (per transaction, no aggregation)
  prepareDetailData() {
    const tableData = [];

    this.filteredSalesData.forEach((transaction) => {
      // Format tanggal dari timestamp
      let date = "-";
      if (transaction.timestamp) {
        if (typeof transaction.timestamp.toDate === "function") {
          date = formatDate(transaction.timestamp.toDate());
        } else if (transaction.timestamp instanceof Date) {
          date = formatDate(transaction.timestamp);
        } else if (typeof transaction.timestamp === "string") {
          date = formatDate(new Date(transaction.timestamp));
        } else if (typeof transaction.timestamp === "object" && transaction.timestamp.seconds) {
          date = formatDate(new Date(transaction.timestamp.seconds * 1000));
        }
      } else if (transaction.tanggal) {
        date = transaction.tanggal;
      }

      // Format jam dari timestamp
      let time = "-";
      if (transaction.timestamp) {
        let dateObj;
        if (typeof transaction.timestamp.toDate === "function") {
          dateObj = transaction.timestamp.toDate();
        } else if (transaction.timestamp instanceof Date) {
          dateObj = transaction.timestamp;
        } else if (typeof transaction.timestamp === "string") {
          dateObj = new Date(transaction.timestamp);
        } else if (typeof transaction.timestamp === "object" && transaction.timestamp.seconds) {
          dateObj = new Date(transaction.timestamp.seconds * 1000);
        }

        if (dateObj && !isNaN(dateObj.getTime())) {
          time = dateObj.toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      }

      const sales = transaction.sales || "-";
      const jenisPenjualan = this.formatJenisPenjualan(transaction);
      const status = this.getStatusBadge(transaction);
      const keterangan = transaction.keterangan || "-";

      if (!transaction.items) return;

      // Loop setiap item, buat 1 row per item (NO aggregation)
      transaction.items.forEach((item) => {
        const kode = item.kodeText || item.barcode || "-";
        const nama = item.nama || "-";
        const kadar = item.kadar || "-";
        const berat = parseFloat(item.berat) || 0;
        const jumlah = parseInt(item.jumlah) || 1;

        let harga = parseInt(item.totalHarga) || 0;
        if (transaction.metodeBayar === "free") {
          harga = 0;
        }

        const beratDisplay = berat > 0 ? `${berat.toFixed(2)} gr` : "-";

        tableData.push([
          date,
          time,
          sales,
          jenisPenjualan,
          kode,
          nama,
          jumlah,
          beratDisplay,
          kadar,
          `Rp ${harga.toLocaleString("id-ID")}`,
          status,
          item.keterangan || keterangan,
        ]);
      });
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
      // Update header berdasarkan reportType (rekap/detail)
      this.updateTableHeader();

      // Prepare data sesuai reportType
      const tableData = this.prepareTableData();

      // PERBAIKAN: Always destroy and reinitialize DataTable untuk memastikan
      // column count match antara header dan data
      this.destroyDataTable();
      this.initDataTable(tableData);
    } catch (error) {
      console.error("Error rendering sales table:", error);
      this.showAlert("Terjadi kesalahan saat menampilkan data", "Error", "error");
    }
  },

  // Filter data for selected date and other criteria
  filterSalesData() {
    if (!this.salesData || !this.salesData.length) return;

    this.showLoading(true);

    try {
      const salesType = document.getElementById("salesType").value;
      const salesPerson = document.getElementById("salesPerson").value;

      this.filteredSalesData = this.salesData.filter((item) => {
        if (!item) return false;

        // Type filter
        let typeMatches = true;
        if (salesType !== "all") {
          if (salesType === "layanan") {
            typeMatches = item.jenisPenjualan === "manual";
          } else {
            typeMatches = item.jenisPenjualan === salesType;
          }
        }

        // Sales person filter
        let salesMatches = true;
        if (salesPerson !== "all") {
          salesMatches = item.sales === salesPerson;
        }

        return typeMatches && salesMatches;
      });

      // Sort by timestamp (newest first)
      this.filteredSalesData.sort((a, b) => {
        const getDate = (item) => {
          if (item.timestamp) {
            if (typeof item.timestamp.toDate === "function") {
              return item.timestamp.toDate();
            } else if (item.timestamp instanceof Date) {
              return item.timestamp;
            } else if (typeof item.timestamp === "string") {
              return new Date(item.timestamp);
            } else if (typeof item.timestamp === "object" && item.timestamp.seconds) {
              return new Date(item.timestamp.seconds * 1000);
            }
          }
          return parseDate(item.tanggal) || new Date(0);
        };

        const dateA = getDate(a);
        const dateB = getDate(b);
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

  // Populate sales person filter
  populateSalesPersonFilter() {
    const salesPersons = [...new Set(this.salesData.map((item) => item.sales).filter(Boolean))];
    const dropdown = document.getElementById("salesPerson");

    if (!dropdown) return;

    while (dropdown.options.length > 1) {
      dropdown.remove(1);
    }

    salesPersons.forEach((person) => {
      const option = document.createElement("option");
      option.value = person;
      option.textContent = person;
      dropdown.appendChild(option);
    });
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
    // Get current date and format it
    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    const todayFormatted = `${day}/${month}/${year}`;

    // Set both start and end date to today by default
    document.getElementById("startDate").value = todayFormatted;
    document.getElementById("endDate").value = todayFormatted;
  },

  // Attach event listeners
  attachEventListeners() {
    // Main filter button
    document.getElementById("filterSalesBtn")?.addEventListener("click", () => {
      const startDateStr = document.getElementById("startDate").value;
      const endDateStr = document.getElementById("endDate").value;

      if (!startDateStr || !endDateStr) {
        this.showAlert("Silakan pilih tanggal mulai dan tanggal akhir", "Peringatan", "warning");
        return;
      }

      const startDate = parseDate(startDateStr);
      const endDate = parseDate(endDateStr);

      if (!startDate || !endDate) {
        this.showAlert("Format tanggal tidak valid", "Error", "error");
        return;
      }

      if (endDate < startDate) {
        this.showAlert("Tanggal akhir harus lebih besar atau sama dengan tanggal mulai", "Peringatan", "warning");
        return;
      }

      this.showLoading(true);
      this.loadSalesDataByDateRange(startDate, endDate)
        .then(() => {
          this.filterSalesData();
          this.isDataLoaded = true;
        })
        .catch((error) => {
          this.showAlert("Gagal memuat data: " + error.message, "Error", "error");
        })
        .finally(() => {
          this.showLoading(false);
        });
    });

    // Sales type filter change
    document.getElementById("salesType")?.addEventListener("change", () => {
      if (this.filteredSalesData && this.filteredSalesData.length > 0) {
        this.filterSalesData();
      }
    });

    // Sales person filter change
    document.getElementById("salesPerson")?.addEventListener("change", () => {
      if (this.filteredSalesData && this.filteredSalesData.length > 0) {
        this.filterSalesData();
      }
    });

    // Report type filter change (rekap/detail)
    document.getElementById("reportType")?.addEventListener("change", () => {
      if (this.filteredSalesData && this.filteredSalesData.length > 0) {
        this.renderSalesTable();
      }
    });

    // Date change handlers - reset when date changes
    document.getElementById("startDate")?.addEventListener("change", () => {
      this.isDataLoaded = false;
      this.salesData = [];
      this.filteredSalesData = [];
      this.clearTable();
    });

    document.getElementById("endDate")?.addEventListener("change", () => {
      this.isDataLoaded = false;
      this.salesData = [];
      this.filteredSalesData = [];
      this.clearTable();
    });
  },

  clearTable() {
    const tableBody = document.querySelector("#penjualanTable tbody");
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="12" class="text-center">
            Klik tombol "Tampilkan" untuk melihat data rentang tanggal yang dipilih
          </td>
        </tr>
      `;
    }
  },

  // ==================== DATA AGGREGATION METHODS ====================

  /**
   * Aggregate data by kode + nama + kadar
   * This reduces redundancy in export (10 transactions of same item → 1 aggregated row)
   */
  aggregateItemsByCode() {
    const aggregationMap = new Map();

    this.filteredSalesData.forEach((sale) => {
      if (!sale.items || !Array.isArray(sale.items)) return;

      sale.items.forEach((item) => {
        const kode = item.kodeText || item.barcode || "-";
        const nama = item.nama || "-";
        const kadar = item.kadar || "-";
        const jenis = (sale.jenisPenjualan || "aksesoris").toUpperCase();
        const isKotak = sale.jenisPenjualan === "kotak";

        // Create unique key for grouping - aggregate by kode only (same as web display)
        const key = kode;

        // Calculate item harga (handle DP, free, etc)
        const harga = this.calculateItemHarga(item, sale);
        const pcs = parseInt(item.jumlah) || 1;
        const gr = isKotak ? 0 : parseFloat(item.berat) || 0;

        // Aggregate or create new entry
        if (aggregationMap.has(key)) {
          const existing = aggregationMap.get(key);
          existing.totalPcs += pcs;
          existing.totalGr += gr;
          existing.totalHarga += harga;

          // Collect unique keterangan
          const itemKeterangan = item.keterangan || sale.keterangan || "";
          if (itemKeterangan && !existing.keteranganList.includes(itemKeterangan)) {
            existing.keteranganList.push(itemKeterangan);
          }
        } else {
          aggregationMap.set(key, {
            jenis: jenis,
            kode: kode,
            nama: nama,
            kadar: kadar,
            totalPcs: pcs,
            totalGr: gr,
            totalHarga: harga,
            keteranganList: [item.keterangan || sale.keterangan || ""].filter((k) => k),
          });
        }
      });
    });

    // Convert Map to Array and sort by kode
    return Array.from(aggregationMap.values()).sort((a, b) => {
      return a.kode.localeCompare(b.kode);
    });
  },

  /**
   * Calculate item harga with proper DP handling
   */
  calculateItemHarga(item, sale) {
    let harga = parseInt(item.totalHarga) || 0;

    // Handle DP calculation
    if (sale.metodeBayar === "dp") {
      const nominalDP = parseFloat(sale.nominalDP) || 0;
      const totalHargaTransaksi = parseFloat(sale.totalHarga) || 0;

      if (nominalDP >= totalHargaTransaksi) {
        harga = 0;
      } else {
        const sisaPembayaran = totalHargaTransaksi - nominalDP;
        const proporsi = harga / totalHargaTransaksi;
        harga = Math.round(proporsi * sisaPembayaran);
      }
    } else if (sale.metodeBayar === "free") {
      harga = 0;
    }

    return harga;
  },

  /**
   * Get date string from transaction
   */
  getDateStringFromTransaction(transaction) {
    if (transaction.timestamp && transaction.timestamp.seconds) {
      const date = new Date(transaction.timestamp.seconds * 1000);
      return formatDate(date);
    } else if (transaction.timestamp && typeof transaction.timestamp.toDate === "function") {
      return formatDate(transaction.timestamp.toDate());
    }
    return "-";
  },

  /**
   * Format aggregated item for export based on jenis
   */
  formatAggregatedItemForExport(item, jenisPenjualan) {
    const keterangan = item.keteranganList.join("; ");

    if (jenisPenjualan === "kotak") {
      return [
        item.jenis,
        item.kode || "-",
        item.nama,
        item.totalPcs,
        "-",
        "-",
        `Rp ${item.totalHarga.toLocaleString("id-ID")}`,
      ];
    } else if (jenisPenjualan === "all") {
      return [
        item.jenis,
        item.kode,
        item.nama,
        item.totalPcs,
        item.totalGr > 0 ? item.totalGr.toFixed(2) : "-",
        item.kadar,
        `Rp ${item.totalHarga.toLocaleString("id-ID")}`,
        keterangan,
      ];
    } else {
      return [
        item.jenis,
        item.kode,
        item.nama,
        item.totalPcs,
        item.totalGr > 0 ? item.totalGr.toFixed(2) : "-",
        item.kadar,
        `Rp ${item.totalHarga.toLocaleString("id-ID")}`,
      ];
    }
  },

  // ==================== EXPORT METHODS ====================

  /**
   * Export to Excel (conditional: rekap or detail)
   */
  exportToExcel() {
    if (!this.filteredSalesData || this.filteredSalesData.length === 0) {
      this.showAlert("Tidak ada data untuk diexport", "Peringatan", "warning");
      return;
    }

    if (this.currentReportType === "detail") {
      return this.exportDetailToExcel();
    } else {
      return this.exportRekapToExcel();
    }
  },

  /**
   * Export to Excel - REKAP mode (aggregated data)
   */
  exportRekapToExcel() {
    if (!this.filteredSalesData || this.filteredSalesData.length === 0) {
      this.showAlert("Tidak ada data untuk diexport", "Peringatan", "warning");
      return;
    }

    // Get filter info
    const startDate = document.getElementById("startDate").value;
    const endDate = document.getElementById("endDate").value;
    const jenisPenjualan = document.getElementById("salesType").value;

    // Determine jenis label
    const jenisLabel =
      {
        all: "SEMUA JENIS",
        aksesoris: "AKSESORIS",
        kotak: "KOTAK",
        silver: "SILVER",
        manual: "PENJUALAN MANUAL",
      }[jenisPenjualan] || "SEMUA JENIS";

    // Aggregate data per kode barang
    const aggregatedData = this.aggregateItemsByCode();

    // Create workbook
    const wb = XLSX.utils.book_new();
    const wsData = [];

    // Header
    wsData.push(["LAPORAN PENJUALAN MELATI BAWAH"]);
    wsData.push([jenisLabel]);
    wsData.push([`${startDate} - ${endDate}`]);
    wsData.push([]);

    // Column headers based on jenis
    let columns;
    if (jenisPenjualan === "kotak") {
      columns = ["Jenis", "Kode", "Nama Barang", "Pcs", "Gr", "Kadar", "Harga Total"];
    } else if (jenisPenjualan === "all") {
      columns = ["Jenis", "Kode", "Nama Barang", "Pcs", "Gr", "Kadar", "Harga Total", "Keterangan"];
    } else {
      columns = ["Jenis", "Kode", "Nama Barang", "Pcs", "Gr", "Kadar", "Harga Total"];
    }
    wsData.push(columns);

    // Data rows (aggregated)
    let totalPcs = 0;
    let totalGr = 0;
    let totalHarga = 0;

    aggregatedData.forEach((item) => {
      const row = this.formatAggregatedItemForExport(item, jenisPenjualan);
      wsData.push(row);

      // Calculate totals
      totalPcs += item.totalPcs;
      totalGr += item.totalGr;
      totalHarga += item.totalHarga;
    });

    // Total row
    wsData.push([]);
    if (jenisPenjualan === "kotak") {
      wsData.push(["TOTAL", "", "", totalPcs, "-", "-", `Rp ${totalHarga.toLocaleString("id-ID")}`]);
    } else {
      wsData.push(["TOTAL", "", "", totalPcs, totalGr.toFixed(2), "", `Rp ${totalHarga.toLocaleString("id-ID")}`, ""]);
    }

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths
    ws["!cols"] = [
      { wch: 12 }, // Jenis
      { wch: 15 }, // Kode
      { wch: 30 }, // Nama
      { wch: 8 }, // Pcs
      { wch: 10 }, // Gr
      { wch: 10 }, // Kadar
      { wch: 15 }, // Harga
      { wch: 20 }, // Keterangan
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Laporan Penjualan");

    // Download
    const filename = `Laporan_Penjualan_${startDate.replace(/\//g, "-")}_${endDate.replace(/\//g, "-")}.xlsx`;
    XLSX.writeFile(wb, filename);

    this.showAlert("Export Excel berhasil!", "Sukses", "success");
  },

  /**
   * Export to Excel - DETAIL mode (per transaction, no aggregation)
   * Structure: Tanggal, Jam, Sales, Jenis, Kode, Nama Barang, Pcs, Gr, Kadar, Harga, Keterangan
   */
  exportDetailToExcel() {
    if (!this.filteredSalesData || this.filteredSalesData.length === 0) {
      this.showAlert("Tidak ada data untuk diexport", "Peringatan", "warning");
      return;
    }

    const startDate = document.getElementById("startDate").value;
    const endDate = document.getElementById("endDate").value;
    const jenisPenjualan = document.getElementById("salesType").value;

    const jenisLabel =
      {
        all: "SEMUA JENIS",
        aksesoris: "AKSESORIS",
        kotak: "KOTAK",
        silver: "SILVER",
        manual: "PENJUALAN MANUAL",
      }[jenisPenjualan] || "SEMUA JENIS";

    const wb = XLSX.utils.book_new();
    const wsData = [];

    // Header
    wsData.push(["LAPORAN PENJUALAN DETAIL - MELATI BAWAH"]);
    wsData.push([jenisLabel]);
    wsData.push([`${startDate} - ${endDate}`]);
    wsData.push([]);

    // Column headers (NO Status column)
    const columns = [
      "Tanggal",
      "Jam",
      "Sales",
      "Jenis",
      "Kode",
      "Nama Barang",
      "Pcs",
      "Gr",
      "Kadar",
      "Harga",
      "Keterangan",
    ];
    wsData.push(columns);

    // Data rows (detail, no aggregation)
    let totalPcs = 0;
    let totalGr = 0;
    let totalHarga = 0;

    this.filteredSalesData.forEach((transaction) => {
      // Format tanggal
      let date = "-";
      if (transaction.timestamp) {
        if (typeof transaction.timestamp.toDate === "function") {
          date = formatDate(transaction.timestamp.toDate());
        } else if (transaction.timestamp instanceof Date) {
          date = formatDate(transaction.timestamp);
        } else if (typeof transaction.timestamp === "string") {
          date = formatDate(new Date(transaction.timestamp));
        } else if (typeof transaction.timestamp === "object" && transaction.timestamp.seconds) {
          date = formatDate(new Date(transaction.timestamp.seconds * 1000));
        }
      } else if (transaction.tanggal) {
        date = transaction.tanggal;
      }

      // Format jam
      let time = "-";
      if (transaction.timestamp) {
        let dateObj;
        if (typeof transaction.timestamp.toDate === "function") {
          dateObj = transaction.timestamp.toDate();
        } else if (transaction.timestamp instanceof Date) {
          dateObj = transaction.timestamp;
        } else if (typeof transaction.timestamp === "string") {
          dateObj = new Date(transaction.timestamp);
        } else if (typeof transaction.timestamp === "object" && transaction.timestamp.seconds) {
          dateObj = new Date(transaction.timestamp.seconds * 1000);
        }

        if (dateObj && !isNaN(dateObj.getTime())) {
          time = dateObj.toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      }

      const sales = transaction.sales || "-";
      const jenis = transaction.jenisPenjualan || "-";

      if (!transaction.items) return;

      transaction.items.forEach((item) => {
        const kode = item.kodeText || item.barcode || "-";
        const nama = item.nama || "-";
        const pcs = parseInt(item.jumlah) || 1;
        const gr = parseFloat(item.berat) || 0;
        const kadar = item.kadar || "-";
        let harga = parseInt(item.totalHarga) || 0;

        if (transaction.metodeBayar === "free") {
          harga = 0;
        }

        const keterangan = item.keterangan || transaction.keterangan || "-";

        wsData.push([date, time, sales, jenis, kode, nama, pcs, gr, kadar, harga, keterangan]);

        totalPcs += pcs;
        totalGr += gr;
        totalHarga += harga;
      });
    });

    // Total row
    wsData.push([]);
    wsData.push(["TOTAL", "", "", "", "", "", totalPcs, totalGr.toFixed(2), "", totalHarga, ""]);

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths
    ws["!cols"] = [
      { wch: 12 }, // Tanggal
      { wch: 8 }, // Jam
      { wch: 15 }, // Sales
      { wch: 12 }, // Jenis
      { wch: 15 }, // Kode
      { wch: 30 }, // Nama
      { wch: 8 }, // Pcs
      { wch: 10 }, // Gr
      { wch: 10 }, // Kadar
      { wch: 15 }, // Harga
      { wch: 20 }, // Keterangan
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Laporan Detail");

    // Download
    const filename = `Laporan_Penjualan_Detail_${startDate.replace(/\//g, "-")}_${endDate.replace(/\//g, "-")}.xlsx`;
    XLSX.writeFile(wb, filename);

    this.showAlert("Export Excel Detail berhasil!", "Sukses", "success");
  },

  /**
   * Export to PDF (conditional: rekap or detail)
   */
  exportToPDF() {
    if (!this.filteredSalesData || this.filteredSalesData.length === 0) {
      this.showAlert("Tidak ada data untuk diexport", "Peringatan", "warning");
      return;
    }

    if (this.currentReportType === "detail") {
      return this.exportDetailToPDF();
    } else {
      return this.exportRekapToPDF();
    }
  },

  /**
   * Export to PDF - REKAP mode (aggregated data)
   */
  exportRekapToPDF() {
    if (!this.filteredSalesData || this.filteredSalesData.length === 0) {
      this.showAlert("Tidak ada data untuk diexport", "Peringatan", "warning");
      return;
    }

    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
      this.showAlert("jsPDF library tidak tersedia", "Error", "error");
      return;
    }

    const doc = new jsPDF("landscape", "mm", "a4");

    // Get filter info
    const startDate = document.getElementById("startDate").value;
    const endDate = document.getElementById("endDate").value;
    const jenisPenjualan = document.getElementById("salesType").value;

    // Determine jenis label
    const jenisLabel =
      {
        all: "SEMUA JENIS",
        aksesoris: "AKSESORIS",
        kotak: "KOTAK",
        silver: "SILVER",
        manual: "PENJUALAN MANUAL",
      }[jenisPenjualan] || "SEMUA JENIS";

    // Header
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text("LAPORAN PENJUALAN MELATI BAWAH", 148.5, 15, { align: "center" });

    doc.setFontSize(12);
    doc.text(jenisLabel, 148.5, 22, { align: "center" });
    doc.text(`${startDate} - ${endDate}`, 148.5, 28, { align: "center" });

    // Aggregate data per kode barang
    const aggregatedData = this.aggregateItemsByCode();

    // Prepare table data (aggregated)
    const tableData = [];
    let totalPcs = 0;
    let totalGr = 0;
    let totalHarga = 0;

    aggregatedData.forEach((item) => {
      const row = this.formatAggregatedItemForExport(item, jenisPenjualan);
      tableData.push(row);

      totalPcs += item.totalPcs;
      totalGr += item.totalGr;
      totalHarga += item.totalHarga;
    });

    // Add total row
    if (jenisPenjualan === "kotak") {
      tableData.push(["TOTAL", "", "", totalPcs, "-", "-", `Rp ${totalHarga.toLocaleString("id-ID")}`]);
    } else {
      tableData.push([
        "TOTAL",
        "",
        "",
        totalPcs,
        totalGr.toFixed(2),
        "",
        `Rp ${totalHarga.toLocaleString("id-ID")}`,
        "",
      ]);
    }

    // Column headers based on jenis
    let columns;
    if (jenisPenjualan === "kotak") {
      columns = ["Jenis", "Kode", "Nama Barang", "Pcs", "Gr", "Kadar", "Harga Total"];
    } else if (jenisPenjualan === "all") {
      columns = ["Jenis", "Kode", "Nama Barang", "Pcs", "Gr", "Kadar", "Harga Total", "Keterangan"];
    } else {
      columns = ["Jenis", "Kode", "Nama Barang", "Pcs", "Gr", "Kadar", "Harga Total"];
    }

    // Generate table
    doc.autoTable({
      head: [columns],
      body: tableData,
      startY: 35,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [41, 128, 185], fontStyle: "bold" },
      footStyles: { fillColor: [236, 240, 241], fontStyle: "bold" },
      columnStyles: {
        3: { halign: "center" }, // Pcs
        4: { halign: "center" }, // Gr
        5: { halign: "center" }, // Kadar
        6: { halign: "center" }, // Harga Total
      },
      didParseCell: function (data) {
        // Center-align header cells for Pcs, Gr, Kadar, and Harga Total
        if (data.section === "head") {
          if (jenisPenjualan === "kotak") {
            // For kotak: Pcs (index 2), Harga Total (index 3)
            if (data.column.index === 2 || data.column.index === 3) {
              data.cell.styles.halign = "center";
            }
          } else {
            // For others: Pcs (3), Gr (4), Kadar (5), Harga Total (6)
            if (data.column.index >= 3 && data.column.index <= 6) {
              data.cell.styles.halign = "center";
            }
          }
        }
      },
      didDrawPage: function (data) {
        // Footer
        doc.setFontSize(8);
        doc.text(`Halaman ${data.pageNumber}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
      },
    });

    // Download
    const filename = `Laporan_Penjualan_${startDate.replace(/\//g, "-")}_${endDate.replace(/\//g, "-")}.pdf`;
    doc.save(filename);

    this.showAlert("Export PDF berhasil!", "Sukses", "success");
  },

  /**
   * Export to PDF - DETAIL mode (smart date range handling)
   * Conditional routing: single date vs date range
   */
  exportDetailToPDF() {
    if (!this.filteredSalesData || this.filteredSalesData.length === 0) {
      this.showAlert("Tidak ada data untuk diexport", "Peringatan", "warning");
      return;
    }

    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
      this.showAlert("jsPDF library tidak tersedia", "Error", "error");
      return;
    }

    const startDate = document.getElementById("startDate").value;
    const endDate = document.getElementById("endDate").value;

    // Determine if single date or date range
    const isSingleDate = startDate === endDate;

    if (isSingleDate) {
      return this.exportDetailToPDF_SingleDate(startDate, endDate);
    } else {
      return this.exportDetailToPDF_DateRange(startDate, endDate);
    }
  },

  /**
   * Export to PDF - DETAIL mode for SINGLE DATE
   * Structure: Jam, Sales, Jenis, Kode, Nama, Pcs, Gr, Kadar, Harga, Keterangan (10 columns)
   * NO Tanggal column (already in header)
   */
  exportDetailToPDF_SingleDate(startDate, endDate) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("landscape", "mm", "a4");

    const jenisPenjualan = document.getElementById("salesType").value;
    const jenisLabel =
      {
        all: "SEMUA JENIS",
        aksesoris: "AKSESORIS",
        kotak: "KOTAK",
        silver: "SILVER",
        manual: "PENJUALAN MANUAL",
      }[jenisPenjualan] || "SEMUA JENIS";

    // Header
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text("LAPORAN PENJUALAN DETAIL - MELATI BAWAH", 148.5, 12, { align: "center" });

    doc.setFontSize(12);
    doc.text(jenisLabel, 148.5, 19, { align: "center" });
    doc.text(`Tanggal: ${startDate}`, 148.5, 26, { align: "center" });

    // Build table data (NO Tanggal column)
    const tableData = [];
    let totalPcs = 0;
    let totalGr = 0;
    let totalHarga = 0;

    this.filteredSalesData.forEach((transaction) => {
      const time = this.getTransactionTime(transaction);
      const sales = transaction.sales || "-";
      const jenis = transaction.jenisPenjualan || "-";

      if (!transaction.items) return;

      transaction.items.forEach((item) => {
        const kode = item.kodeText || item.barcode || "-";
        const nama = item.nama || "-";
        const pcs = parseInt(item.jumlah) || 1;
        const gr = parseFloat(item.berat) || 0;
        const kadar = item.kadar || "-";
        let harga = parseInt(item.totalHarga) || 0;

        if (transaction.metodeBayar === "free") {
          harga = 0;
        }

        const keterangan = item.keterangan || transaction.keterangan || "-";

        tableData.push([
          time, // Jam
          sales, // Sales
          jenis, // Jenis
          kode, // Kode
          nama, // Nama
          pcs, // Pcs
          gr.toFixed(2), // Gr
          kadar, // Kadar
          `Rp ${harga.toLocaleString("id-ID")}`, // Harga
          keterangan, // Keterangan
        ]);

        totalPcs += pcs;
        totalGr += gr;
        totalHarga += harga;
      });
    });

    // Total row
    tableData.push([
      "TOTAL",
      "",
      "",
      "",
      "",
      totalPcs,
      totalGr.toFixed(2),
      "",
      `Rp ${totalHarga.toLocaleString("id-ID")}`,
      "",
    ]);

    // AutoTable (10 columns)
    doc.autoTable({
      head: [["Jam", "Sales", "Jenis", "Kode", "Nama Barang", "Pcs", "Gr", "Kadar", "Harga", "Keterangan"]],
      body: tableData,
      startY: 32,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [41, 128, 185], fontStyle: "bold", halign: "center" },
      footStyles: { fillColor: [236, 240, 241], fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 15 }, // Jam
        1: { cellWidth: 25 }, // Sales
        2: { cellWidth: 20 }, // Jenis
        3: { cellWidth: 25 }, // Kode
        4: { cellWidth: 60 }, // Nama
        5: { halign: "center", cellWidth: 15 }, // Pcs
        6: { halign: "center", cellWidth: 20 }, // Gr
        7: { halign: "center", cellWidth: 15 }, // Kadar
        8: { halign: "right", cellWidth: 30 }, // Harga
        9: { cellWidth: 40 }, // Keterangan
      },
      didDrawPage: function (data) {
        // Footer
        doc.setFontSize(8);
        doc.text(`Halaman ${data.pageNumber}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
      },
    });

    // Download
    const filename = `Laporan_Penjualan_Detail_${startDate.replace(/\//g, "-")}_${endDate.replace(/\//g, "-")}.pdf`;
    doc.save(filename);

    this.showAlert("Export PDF Detail berhasil!", "Sukses", "success");
  },

  /**
   * Export to PDF - DETAIL mode for DATE RANGE
   * Structure: Tanggal, Jam, Sales, Jenis, Kode, Nama, Pcs, Gr, Kadar, Harga, Keterangan (11 columns)
   * WITH Tanggal column, continuous flow (no forced page break per date)
   */
  exportDetailToPDF_DateRange(startDate, endDate) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("landscape", "mm", "a4");

    const jenisPenjualan = document.getElementById("salesType").value;
    const jenisLabel =
      {
        all: "SEMUA JENIS",
        aksesoris: "AKSESORIS",
        kotak: "KOTAK",
        silver: "SILVER",
        manual: "PENJUALAN MANUAL",
      }[jenisPenjualan] || "SEMUA JENIS";

    // Header dengan range
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text("LAPORAN PENJUALAN DETAIL - MELATI BAWAH", 148.5, 12, { align: "center" });

    doc.setFontSize(12);
    doc.text(jenisLabel, 148.5, 19, { align: "center" });
    doc.text(`Tanggal: ${startDate} - ${endDate}`, 148.5, 26, { align: "center" });

    // Sort transactions by timestamp (ascending for chronological order)
    const sortedTransactions = [...this.filteredSalesData].sort((a, b) => {
      const dateA = this.getTransactionDate(a);
      const dateB = this.getTransactionDate(b);
      return dateA - dateB;
    });

    // Build single table data array untuk semua tanggal
    const tableData = [];
    let totalPcs = 0;
    let totalGr = 0;
    let totalHarga = 0;

    sortedTransactions.forEach((transaction) => {
      const date = this.getFormattedDate(transaction); // Format: dd/mm/yyyy
      const time = this.getTransactionTime(transaction); // Format: HH:MM
      const sales = transaction.sales || "-";
      const jenis = transaction.jenisPenjualan || "-";

      if (!transaction.items) return;

      transaction.items.forEach((item) => {
        const kode = item.kodeText || item.barcode || "-";
        const nama = item.nama || "-";
        const pcs = parseInt(item.jumlah) || 1;
        const gr = parseFloat(item.berat) || 0;
        const kadar = item.kadar || "-";
        let harga = parseInt(item.totalHarga) || 0;

        if (transaction.metodeBayar === "free") {
          harga = 0;
        }

        const keterangan = item.keterangan || transaction.keterangan || "-";

        tableData.push([
          date, // Tanggal (NEW column)
          time, // Jam
          sales, // Sales
          jenis, // Jenis
          kode, // Kode
          nama, // Nama
          pcs, // Pcs
          gr.toFixed(2), // Gr
          kadar, // Kadar
          `Rp ${harga.toLocaleString("id-ID")}`, // Harga
          keterangan, // Keterangan
        ]);

        totalPcs += pcs;
        totalGr += gr;
        totalHarga += harga;
      });
    });

    // Total row (11 columns)
    tableData.push([
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      totalPcs,
      totalGr.toFixed(2),
      "",
      `Rp ${totalHarga.toLocaleString("id-ID")}`,
      "",
    ]);

    // Single autoTable call (auto-paging jika space habis)
    doc.autoTable({
      head: [["Tanggal", "Jam", "Sales", "Jenis", "Kode", "Nama Barang", "Pcs", "Gr", "Kadar", "Harga", "Keterangan"]],
      body: tableData,
      startY: 32,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [41, 128, 185], fontStyle: "bold", halign: "center" },
      footStyles: { fillColor: [236, 240, 241], fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 20 }, // Tanggal
        1: { cellWidth: 12 }, // Jam
        2: { cellWidth: 22 }, // Sales
        3: { cellWidth: 18 }, // Jenis
        4: { cellWidth: 22 }, // Kode
        5: { cellWidth: 55 }, // Nama
        6: { halign: "center", cellWidth: 12 }, // Pcs
        7: { halign: "center", cellWidth: 18 }, // Gr
        8: { halign: "center", cellWidth: 12 }, // Kadar
        9: { halign: "right", cellWidth: 28 }, // Harga
        10: { cellWidth: 38 }, // Keterangan
      },
      didDrawPage: function (data) {
        // Footer
        doc.setFontSize(8);
        doc.text(`Halaman ${data.pageNumber}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
      },
    });

    // Download
    const filename = `Laporan_Penjualan_Detail_${startDate.replace(/\//g, "-")}_${endDate.replace(/\//g, "-")}.pdf`;
    doc.save(filename);

    this.showAlert("Export PDF Detail berhasil!", "Sukses", "success");
  },

  // ==================== HELPER METHODS FOR DATE/TIME ====================

  /**
   * Get transaction date as Date object
   */
  getTransactionDate(transaction) {
    if (transaction.timestamp) {
      if (typeof transaction.timestamp.toDate === "function") {
        return transaction.timestamp.toDate();
      } else if (transaction.timestamp instanceof Date) {
        return transaction.timestamp;
      } else if (typeof transaction.timestamp === "string") {
        return new Date(transaction.timestamp);
      } else if (typeof transaction.timestamp === "object" && transaction.timestamp.seconds) {
        return new Date(transaction.timestamp.seconds * 1000);
      }
    }
    return new Date(0); // Fallback to epoch
  },

  /**
   * Get formatted date string (dd/mm/yyyy)
   */
  getFormattedDate(transaction) {
    const dateObj = this.getTransactionDate(transaction);
    if (dateObj && !isNaN(dateObj.getTime()) && dateObj.getTime() > 0) {
      return formatDate(dateObj);
    }
    return "-";
  },

  /**
   * Get formatted time string (HH:MM)
   */
  getTransactionTime(transaction) {
    const dateObj = this.getTransactionDate(transaction);
    if (dateObj && !isNaN(dateObj.getTime()) && dateObj.getTime() > 0) {
      return dateObj.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return "-";
  },

  // Utility function to check if two dates are the same
  isSameDate(date1, date2) {
    if (!date1 || !date2) return false;
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  },

  // Cleanup method
  destroy() {
    console.log("🧹 Destroying Sales Report Handler");

    // Remove real-time listener
    this.removeTodayListener();

    // Destroy DataTable
    this.destroyDataTable();

    // Clear data
    this.salesData = [];
    this.filteredSalesData = [];
    this.isDataLoaded = false;
    this.currentSelectedDate = null;
    this.isListeningToday = false;

    console.log("✅ Sales Report Handler destroyed");
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
          <td colspan="7" class="text-center">Silakan pilih tanggal dan klik tombol "Tampilkan" untuk melihat data</td>
        </tr>
      `;
    }

    // Clear old cache periodically (every 30 minutes)
    setInterval(
      () => {
        cacheManager.clearOldCache();
      },
      30 * 60 * 1000,
    );

    // Clear today's cache when page is about to unload (to ensure fresh data on next visit)
    window.addEventListener("beforeunload", () => {
      const today = new Date();
      cacheManager.clearCacheForDate(today);
      this.destroy();
    });

    console.log("✅ Sales Report Handler initialized successfully");
  },
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

  try {
    // Check dependencies
    if (typeof firestore === "undefined") {
      throw new Error("Firebase Firestore not initialized");
    }

    if (typeof $ === "undefined") {
      throw new Error("jQuery not loaded");
    }

    // Initialize the handler
    laporanPenjualanHandler.init();

    console.log("✅ Sales Report System initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize Sales Report System:", error);
    alert("Gagal menginisialisasi sistem laporan penjualan: " + error.message);
  }
});

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  if (typeof laporanPenjualanHandler !== "undefined") {
    laporanPenjualanHandler.destroy();
  }
});

export default laporanPenjualanHandler;

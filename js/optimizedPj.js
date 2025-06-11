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
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// Table configurations (tetap sama)
const tableConfigs = {
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

// Enhanced cache manager dengan real-time support
const cacheManager = {
  // Cache TTL constants
  CACHE_TTL_TODAY: 10 * 60 * 1000,     // 10 menit untuk data hari ini
  CACHE_TTL_STANDARD: 2 * 60 * 60 * 1000, // 2 jam untuk data historis

  // Real-time listeners
  listeners: new Map(),
  isListeningToday: false,
  currentDateRange: null,

  // Check if cache is valid
  isValid(cacheKey) {
    const metaKey = `${cacheKey}_timestamp`;
    const timestamp = localStorage.getItem(metaKey);
    
    if (!timestamp) return false;
    
    const now = Date.now();
    const lastUpdate = parseInt(timestamp);
    
    // Jika real-time aktif untuk data hari ini, cache selalu valid
    if (this.isListeningToday && this.isTodayData(cacheKey)) {
      return true;
    }
    
    // Untuk data historis, gunakan TTL standar
    const today = this.getLocalDateString();
    const ttl = cacheKey.includes(today) ? this.CACHE_TTL_TODAY : this.CACHE_TTL_STANDARD;
    
    return (now - lastUpdate) < ttl;
  },

  // Check if cache key is for today's data
  isTodayData(cacheKey) {
    const today = this.getLocalDateString();
    return cacheKey.includes(today);
  },

  // Set cache data
  set(cacheKey, data) {
    try {
      const compressedData = this.compressData(data);
      localStorage.setItem(cacheKey, compressedData);
      
      const metaKey = `${cacheKey}_timestamp`;
      localStorage.setItem(metaKey, Date.now().toString());
      
      console.log(`💾 Cache saved for key: ${cacheKey}`);
    } catch (error) {
      console.error("Error saving cache:", error);
      this.clearOldCache();
    }
  },

  // Get cache data
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

  // Setup real-time listener untuk date range yang mencakup hari ini
  setupRealtimeListener(startDate, endDate) {
    const today = new Date();
    const todayStr = this.getLocalDateString();
    const startDateStr = this.formatDate(startDate);
    const endDateStr = this.formatDate(endDate);
    
    // Cek apakah range mencakup hari ini
    const includesCurrentDay = startDateStr <= todayStr && todayStr <= endDateStr;
    
    if (includesCurrentDay && !this.isListeningToday) {
      this.startTodayListener();
      this.isListeningToday = true;
      this.currentDateRange = { startDate, endDate };
      console.log("📡 Real-time listener started for sales data");
    } else if (!includesCurrentDay && this.isListeningToday) {
      this.stopTodayListener();
      this.isListeningToday = false;
      this.currentDateRange = null;
      console.log("🔇 Real-time listener stopped");
    }
  },

  // Start real-time listener untuk hari ini
  startTodayListener() {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Listen to sales data
    const salesQuery = query(
      collection(firestore, "penjualanAksesoris"),
      where("timestamp", ">=", Timestamp.fromDate(startOfDay)),
      where("timestamp", "<=", Timestamp.fromDate(endOfDay)),
      orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(salesQuery, (snapshot) => {
      if (!snapshot.metadata.hasPendingWrites) {
        console.log("📡 Real-time sales update detected");
        this.handleRealtimeUpdate(snapshot);
      }
    }, (error) => {
      console.error("Real-time listener error:", error);
      this.fallbackToCache();
    });

    this.listeners.set("sales", unsubscribe);
  },

  // Stop real-time listener
  stopTodayListener() {
    this.listeners.forEach((unsubscribe, key) => {
      unsubscribe();
      console.log(`🔇 Removed listener: ${key}`);
    });
    this.listeners.clear();
  },

  // Handle real-time updates
  handleRealtimeUpdate(snapshot) {
    if (!this.currentDateRange) return;

    try {
      // Clear cache untuk date range saat ini
      const startDateStr = this.formatDate(this.currentDateRange.startDate);
      const endDateStr = this.formatDate(this.currentDateRange.endDate);
      const cacheKey = `salesData_${startDateStr}_${endDateStr}`;
      
      // Update cache dengan data terbaru
      const salesData = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.jenisPenjualan === "gantiLock") {
          data.jenisPenjualan = "manual";
          data.isGantiLock = true;
        }
        salesData.push({ id: doc.id, ...data });
      });

      // Update cache
      this.set(cacheKey, salesData);
      
      // Trigger UI update
      if (window.laporanPenjualanHandler) {
        window.laporanPenjualanHandler.handleRealtimeUpdate(salesData);
      }

      // Show update indicator
      this.showUpdateIndicator();
      
    } catch (error) {
      console.error("Error handling real-time update:", error);
    }
  },

  // Fallback to cache when real-time fails
  fallbackToCache() {
    console.warn("⚠️ Real-time connection failed, using cache");
    this.isListeningToday = false;
  },

  // Show update indicator
  showUpdateIndicator() {
    const existingIndicator = document.getElementById("salesUpdateIndicator");
    if (existingIndicator) {
      existingIndicator.remove();
    }

    const indicator = document.createElement("div");
    indicator.id = "salesUpdateIndicator";
    indicator.className = "alert alert-success alert-dismissible fade show mb-2";
    indicator.innerHTML = `
      <i class="fas fa-sync-alt me-2"></i>
      Data penjualan telah diperbarui secara real-time
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    const tableContainer = document.querySelector("#penjualanTable").parentElement;
    tableContainer.insertBefore(indicator, tableContainer.firstChild);

    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.remove();
      }
    }, 3000);
  },

  // Clear specific cache
  clear(cacheKey = null) {
    if (cacheKey) {
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(`${cacheKey}_timestamp`);
    } else {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('salesData_') || key.includes('_timestamp')) {
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
    keys.forEach(key => {
      if (key.endsWith('_timestamp')) {
        const timestamp = parseInt(localStorage.getItem(key));
        if (now - timestamp > maxAge) {
          const dataKey = key.replace('_timestamp', '');
          localStorage.removeItem(key);
          localStorage.removeItem(dataKey);
        }
      }
    });
  },

  // Compress data
  compressData(data) {
    try {
      const processedData = JSON.parse(JSON.stringify(data, (key, value) => {
        if (value && typeof value === 'object' && value.seconds && value.nanoseconds) {
          return new Date(value.seconds * 1000 + value.nanoseconds / 1000000).toISOString();
        }
        return value;
      }));
      
      return JSON.stringify(processedData).replace(/\s+/g, "");
    } catch (error) {
      console.error("Error compressing data:", error);
      return JSON.stringify(data);
    }
  },

  // Decompress data
  decompressData(compressedData) {
    try {
      const parsed = JSON.parse(compressedData);
      
      if (Array.isArray(parsed)) {
        return parsed.map(item => {
          if (item.timestamp && typeof item.timestamp === 'string') {
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

  // Utility functions
  getLocalDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${day}/${month}/${year}`;
  },

  // Cleanup
  destroy() {
    this.stopTodayListener();
    this.isListeningToday = false;
    this.currentDateRange = null;
  }
};

// Enhanced main handler dengan real-time support
const laporanPenjualanHandler = {
  salesData: [],
  filteredSalesData: [],
  dataTable: null,

  // Utility functions (tetap sama)
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

  // Enhanced load data dengan real-time support
  async loadSalesDataByDateRange(startDate, endDate, forceRefresh = false) {
    try {
      const startDateStr = formatDate(startDate);
      const endDateStr = formatDate(endDate);
      const cacheKey = `salesData_${startDateStr}_${endDateStr}`;
      
      // Setup real-time listener
      cacheManager.setupRealtimeListener(startDate, endDate);
      
      // Check cache first
      if (!forceRefresh) {
        const cachedData = cacheManager.get(cacheKey);
        if (cachedData) {
          console.log(`📦 Using cached sales data for ${startDateStr} - ${endDateStr}`);
          this.salesData = cachedData;
          this.showCacheIndicator(`Menggunakan data cache (${startDateStr} - ${endDateStr})`);
          return;
        }
      }
      
      console.log(`🔄 Loading fresh sales data for ${startDateStr} - ${endDateStr}`);
      this.hideCacheIndicator();
      
      // Query dengan filter tanggal
      const startTimestamp = Timestamp.fromDate(startDate);
      const endTimestamp = Timestamp.fromDate(new Date(endDate.getTime() + 24 * 60 * 60 * 1000));
      
      const salesQuery = query(
        collection(firestore, "penjualanAksesoris"),
        where("timestamp", ">=", startTimestamp),
        where("timestamp", "<", endTimestamp),
        orderBy("timestamp", "desc")
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

      this.salesData = salesData;
      
      // Cache the data
      cacheManager.set(cacheKey, salesData);
      
      console.log(`✅ Loaded ${salesData.length} sales records from Firestore`);
      
    } catch (error) {
      console.error("Error loading sales data:", error);
      this.showAlert("Gagal memuat data penjualan: " + error.message, "Error", "error");
      
      // Fallback to cache if available
      const startDateStr = formatDate(startDate);
      const endDateStr = formatDate(endDate);
      const cacheKey = `salesData_${startDateStr}_${endDateStr}`;
      const cachedData = cacheManager.get(cacheKey);
      
      if (cachedData) {
        console.log("📦 Using cached data as fallback");
        this.salesData = cachedData;
        this.showCacheIndicator("Menggunakan data cache (fallback)");
      }
    }
  },

  // Handle real-time updates
  handleRealtimeUpdate(updatedData) {
    console.log("🔄 Handling real-time update");
    
    // Update local data
    this.salesData = updatedData;
    
    // Re-apply current filters
    this.applyCurrentFilters();
    
    // Re-render table if it exists
    if (this.dataTable) {
      this.renderTable();
    }
  },

  // Apply current filters (untuk maintain filter state saat real-time update)
applyCurrentFilters() {
  const salesType = document.getElementById("salesType")?.value || "all";
  
  this.filteredSalesData = this.salesData.filter(item => {
    // Filter berdasarkan jenis penjualan
    if (salesType === "all") {
      return true;
    } else if (salesType === "aksesoris") {
      return item.jenisPenjualan === "aksesoris";
    } else if (salesType === "kotak") {
      return item.jenisPenjualan === "kotak";
    } else if (salesType === "manual") {
      return item.jenisPenjualan === "manual" || item.jenisPenjualan === "gantiLock";
    }
    
    return item.jenisPenjualan === salesType;
  });
  
  console.log(`Filtered ${this.filteredSalesData.length} items from ${this.salesData.length} total items`);
},

  // Enhanced filter and display dengan real-time support
  async filterAndDisplayData() {
    try {
      this.showLoading(true);
      
      const startDateStr = document.getElementById("startDate").value;
      const endDateStr = document.getElementById("endDate").value;
      
      if (!startDateStr || !endDateStr) {
        this.showAlert("Silakan pilih tanggal mulai dan tanggal akhir", "Peringatan", "warning");
        return;
      }

      const startDate = parseDate(startDateStr);
      const endDate = parseDate(endDateStr);
      
      if (startDate > endDate) {
        this.showAlert("Tanggal mulai tidak boleh lebih besar dari tanggal akhir", "Peringatan", "warning");
        return;
      }

      // Load data dengan real-time support
      await this.loadSalesDataByDateRange(startDate, endDate);
      
      // Apply filters
      this.applyCurrentFilters();
      
      // Render table
      this.renderTable();
      
    } catch (error) {
      console.error("Error filtering data:", error);
      this.showAlert("Terjadi kesalahan saat memfilter data", "Error", "error");
    } finally {
      this.showLoading(false);
    }
  },

  // Force refresh data
  async refreshData() {
    try {
      this.showLoading(true);
      
      const startDateStr = document.getElementById("startDate").value;
      const endDateStr = document.getElementById("endDate").value;
      
      if (!startDateStr || !endDateStr) {
        this.showAlert("Silakan pilih tanggal terlebih dahulu", "Peringatan", "warning");
        return;
      }

      const startDate = parseDate(startDateStr);
      const endDate = parseDate(endDateStr);
      
      // Clear cache untuk range ini
      const cacheKey = `salesData_${formatDate(startDate)}_${formatDate(endDate)}`;
      cacheManager.clear(cacheKey);
      
      // Force reload
      await this.loadSalesDataByDateRange(startDate, endDate, true);
      this.applyCurrentFilters();
      this.renderTable();
      
      this.showAlert("Data berhasil diperbarui", "Berhasil", "success");
      
    } catch (error) {
      console.error("Error refreshing data:", error);
      this.showAlert("Gagal memperbarui data", "Error", "error");
    } finally {
      this.showLoading(false);
    }
  },

  // Show cache indicator
  showCacheIndicator(message) {
    let indicator = document.getElementById("cacheIndicator");

    if (!indicator) {
      indicator = document.createElement("div");
      indicator.id = "cacheIndicator";
      indicator.className = "alert alert-info mb-2";

      const tableContainer = document.querySelector("#penjualanTable").parentElement;
      tableContainer.insertBefore(indicator, tableContainer.firstChild);
    }

    indicator.innerHTML = `<i class="fas fa-database me-2"></i>${message}`;
    indicator.style.display = "block";
  },

  // Hide cache indicator
  hideCacheIndicator() {
    const indicator = document.getElementById("cacheIndicator");
    if (indicator) {
      indicator.style.display = "none";
    }
  },

  // Render table (logika UI tetap sama, hanya tambahan handling real-time)
 renderTable() {
  const salesType = document.getElementById("salesType").value;
  const config = tableConfigs[salesType] || tableConfigs.all;
  
  // Destroy existing DataTable
  if (this.dataTable) {
    this.dataTable.destroy();
    this.dataTable = null;
  }

  // Clear table
  const tableHead = document.querySelector("#penjualanTable thead");
  const tableBody = document.querySelector("#penjualanTable tbody");
  const tableFoot = document.querySelector("#penjualanTable tfoot");
  
  if (!tableHead || !tableBody) {
    console.error("Table elements not found");
    return;
  }

  // Build header - sesuaikan dengan HTML yang ada
  tableHead.innerHTML = `
    <tr>
      ${config.columns.map(col => `<th>${col}</th>`).join('')}
    </tr>
  `;

  // Build body
  if (this.filteredSalesData.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="${config.columns.length}" class="text-center">
          Tidak ada data yang sesuai dengan filter
        </td>
      </tr>
    `;
    
    // Clear footer totals
    if (tableFoot) {
      const footerCells = tableFoot.querySelectorAll('td');
      if (footerCells.length >= 6) {
        footerCells[4].textContent = '0'; // Total Pcs
        footerCells[5].textContent = '0'; // Total Gr
        footerCells[7].textContent = 'Rp 0'; // Total Harga
      }
    }
    return;
  }

  let html = "";
  let totalPcs = 0;
  let totalGr = 0;
  let totalHarga = 0;

  this.filteredSalesData.forEach((item, index) => {
    const rowClass = item.isGantiLock ? "table-warning" : "";
    
    html += `<tr class="${rowClass}">`;
    
    config.fields.forEach(field => {
      let value = item[field] || "-";
      
      if (field === "tanggal") {
        // Perbaiki handling timestamp
        value = this.formatTimestamp(item.timestamp);
      } else if (field === "jenis") {
        value = item.jenisPenjualan || "-";
        if (item.isGantiLock) {
          value += " (Ganti Lock)";
        }
      } else if (field === "harga") {
        const hargaNum = parseInt(value) || 0;
        totalHarga += hargaNum;
        value = formatRupiah(hargaNum);
      } else if (field === "pcs") {
        const pcsNum = parseInt(value) || 0;
        totalPcs += pcsNum;
        value = pcsNum.toString();
      } else if (field === "gr") {
        const grNum = parseFloat(value) || 0;
        totalGr += grNum;
        value = grNum.toString();
      } else if (field === "status") {
        const badgeClass = value === "lunas" ? "bg-success" : 
                         value === "belum lunas" ? "bg-warning" : "bg-secondary";
        value = `<span class="badge ${badgeClass}">${value}</span>`;
      }
      
      html += `<td class="text-center">${value}</td>`;
    });
    
    html += `</tr>`;
  });

  tableBody.innerHTML = html;

  // Update footer totals
  if (tableFoot) {
    const footerCells = tableFoot.querySelectorAll('td');
    if (footerCells.length >= 6) {
      footerCells[4].textContent = totalPcs.toString(); // Total Pcs
      footerCells[5].textContent = totalGr.toFixed(2); // Total Gr
      footerCells[7].textContent = formatRupiah(totalHarga); // Total Harga
    }
  }

  // Initialize DataTable
  this.dataTable = $("#penjualanTable").DataTable({
    responsive: true,
    pageLength: 25,
    order: [[0, 'desc']], // Sort by date
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
    buttons: [
      {
        extend: "excel",
        text: '<i class="fas fa-file-excel me-2"></i>Excel',
        className: "btn btn-success btn-sm me-1",
        exportOptions: { columns: ":visible" },
        title: "Laporan Penjualan Aksesoris",
      },
      {
        extend: "pdf",
        text: '<i class="fas fa-file-pdf me-2"></i>PDF',
        className: "btn btn-danger btn-sm me-1",
        exportOptions: { columns: ":visible" },
        title: "Laporan Penjualan Aksesoris",
      },
    ],
  });

  console.log(`🎨 Table rendered with ${this.filteredSalesData.length} items`);
},

// Tambahkan fungsi helper untuk format timestamp
formatTimestamp(timestamp) {
  try {
    if (!timestamp) return "-";
    
    // Jika timestamp adalah Firestore Timestamp
    if (timestamp && typeof timestamp.toDate === 'function') {
      return formatDate(timestamp.toDate());
    }
    
    // Jika timestamp adalah Date object
    if (timestamp instanceof Date) {
      return formatDate(timestamp);
    }
    
    // Jika timestamp adalah string ISO
    if (typeof timestamp === 'string') {
      return formatDate(new Date(timestamp));
    }
    
    // Jika timestamp adalah object dengan seconds dan nanoseconds
    if (timestamp && typeof timestamp === 'object' && timestamp.seconds) {
      const date = new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
      return formatDate(date);
    }
    
    // Fallback
    return formatDate(new Date(timestamp));
    
  } catch (error) {
    console.warn("Error formatting timestamp:", error, timestamp);
    return "-";
  }
},

  // Edit item (logika tetap sama)
  async editItem(itemId) {
    // Existing edit logic...
    console.log("Edit item:", itemId);
  },

  // Delete item dengan cache update
  async deleteItem(itemId) {
    try {
      const result = await Swal.fire({
        title: "Konfirmasi Hapus",
        text: "Apakah Anda yakin ingin menghapus data ini?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        cancelButtonColor: "#3085d6",
        confirmButtonText: "Ya, Hapus!",
        cancelButtonText: "Batal",
      });

      if (result.isConfirmed) {
        this.showLoading(true);
        
        // Delete from Firestore
        await deleteDoc(doc(firestore, "penjualanAksesoris", itemId));
        
        // Update local data
        this.salesData = this.salesData.filter(item => item.id !== itemId);
        this.applyCurrentFilters();
        
        // Update cache
        const startDateStr = document.getElementById("startDate").value;
        const endDateStr = document.getElementById("endDate").value;
        if (startDateStr && endDateStr) {
          const startDate = parseDate(startDateStr);
          const endDate = parseDate(endDateStr);
          const cacheKey = `salesData_${formatDate(startDate)}_${formatDate(endDate)}`;
          cacheManager.set(cacheKey, this.salesData);
        }
        
        // Re-render table
        this.renderTable();
        
        this.showAlert("Data berhasil dihapus", "Berhasil", "success");
      }
    } catch (error) {
      console.error("Error deleting item:", error);
      this.showAlert("Gagal menghapus data: " + error.message, "Error", "error");
    } finally {
      this.showLoading(false);
    }
  },

  // Initialize handler
  init() {
    console.log("🚀 Initializing Enhanced Sales Report Handler");
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Set default dates
    this.setDefaultDates();
    
    // Initialize empty table
    this.initializeEmptyTable();
    
    console.log("✅ Enhanced Sales Report Handler initialized");
  },

  // Setup event listeners
  setupEventListeners() {
    // Filter button
    const filterBtn = document.getElementById("filterSalesBtn");
    if (filterBtn) {
      filterBtn.addEventListener("click", () => this.filterAndDisplayData());
    }

    // Refresh button
    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => this.refreshData());
    }

    // Jenis filter change
    const jenisFilter = document.getElementById("jenisFilter");
    if (jenisFilter) {
      jenisFilter.addEventListener("change", () => {
        if (this.salesData.length > 0) {
          this.applyCurrentFilters();
          this.renderTable();
        }
      });
    }

    // Status filter change
    const statusFilter = document.getElementById("statusFilter");
    if (statusFilter) {
      statusFilter.addEventListener("change", () => {
        if (this.salesData.length > 0) {
          this.applyCurrentFilters();
          this.renderTable();
        }
      });
    }
  },

  // Set default dates
  setDefaultDates() {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    document.getElementById("startDate").value = formatDate(startOfMonth);
    document.getElementById("endDate").value = formatDate(today);
  },

  // Initialize empty table
  initializeEmptyTable() {
    const tableBody = document.querySelector("#penjualanTable tbody");
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center">
            Silakan pilih tanggal dan klik tombol "Filter" untuk melihat data
          </td>
        </tr>
      `;
    }
  },

  // Cleanup
  destroy() {
    console.log("🧹 Destroying Enhanced Sales Report Handler");
    
    // Destroy DataTable
    if (this.dataTable) {
      this.dataTable.destroy();
      this.dataTable = null;
    }
    
    // Destroy cache manager
    cacheManager.destroy();
    
    // Clear data
    this.salesData = [];
    this.filteredSalesData = [];
    
    console.log("✅ Enhanced Sales Report Handler destroyed");
  }
};

// Utility functions (tetap sama)
function formatDate(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function parseDate(dateString) {
  if (!dateString) return null;
  const parts = dateString.split("/");
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

function formatRupiah(angka) {
  if (!angka && angka !== 0) return "Rp 0";
  const number = typeof angka === "string" ? parseInt(angka) : angka;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(number);
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", function () {
  try {
    // Check dependencies
    if (typeof firestore === 'undefined') {
      throw new Error("Firebase Firestore not initialized");
    }
    
    if (typeof $ === 'undefined') {
      throw new Error("jQuery not loaded");
    }
    
    // Initialize date pickers
    $(".datepicker").datepicker({
      format: "dd/mm/yyyy",
      autoclose: true,
      language: "id",
      todayHighlight: true,
    });
    
    // Initialize the enhanced handler
    laporanPenjualanHandler.init();
    
    // Make handler globally available
    window.laporanPenjualanHandler = laporanPenjualanHandler;
    
    console.log("✅ Enhanced Sales Report System initialized successfully");
    
  } catch (error) {
    console.error("❌ Failed to initialize Enhanced Sales Report System:", error);
    
    // Fallback to basic functionality if available
    if (typeof originalLaporanPenjualanHandler !== 'undefined') {
      console.log("🔄 Falling back to original sales report handler");
      originalLaporanPenjualanHandler.init();
    }
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (window.laporanPenjualanHandler) {
    window.laporanPenjualanHandler.destroy();
  }
});

// Add keyboard shortcuts
document.addEventListener('keydown', function(event) {
  // F5 - Refresh current data
  if (event.key === 'F5' && window.laporanPenjualanHandler) {
    event.preventDefault();
    window.laporanPenjualanHandler.refreshData();
  }
  
  // Ctrl+P - Print
  if (event.ctrlKey && event.key === 'p' && window.laporanPenjualanHandler?.filteredSalesData?.length > 0) {
    event.preventDefault();
    window.print();
  }
});

// Export for potential use in other modules
export { laporanPenjualanHandler as default, cacheManager };

console.log("📦 Enhanced Sales Report Module loaded successfully");


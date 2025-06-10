// Import Firebase modules
import {
  collection,
  getDocs,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
  onSnapshot,
  limit,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";
import { firestore } from "./configFirebase.js";

// 🚀 Advanced Cache Management System
class SmartStockCacheManager {
  constructor() {
    this.cache = new Map();
    this.metadata = new Map();
    this.realtimeListeners = [];
    this.pendingUpdates = new Set();
    this.updateTimeout = null;
    this.localState = new Map();
    this.lastSyncTimestamp = new Map();
    this.batchSize = 10;
    
    // Event emitter untuk UI updates
    this.eventTarget = new EventTarget();
  }

  // Initialize cache system
  init() {
    this.loadCacheFromStorage();
    this.setupTodayRealtimeListener();
    this.setupCleanupInterval();
    
    console.log("🚀 Smart Stock Cache Manager initialized");
  }

  // 📡 Setup realtime listener hanya untuk data hari ini
  setupTodayRealtimeListener() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);

    console.log(`📡 Setting up realtime listener for today: ${today.toDateString()}`);

    // Listen transaksi hari ini
    const transactionQuery = query(
      collection(firestore, "stokAksesorisTransaksi"),
      where("timestamp", ">=", todayTimestamp),
      orderBy("timestamp", "desc")
    );

    const unsubscribeTransactions = onSnapshot(
      transactionQuery,
      (snapshot) => {
        let hasChanges = false;
        
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added" || change.type === "modified") {
            const data = change.doc.data();
            if (data.kode) {
              this.markForUpdate(data.kode, 'transaction');
              hasChanges = true;
            }
          }
        });

        if (hasChanges) {
          console.log(`📊 Detected ${snapshot.docChanges().length} transaction changes`);
          this.debounceUpdate();
        }
      },
      (error) => {
        console.error("Error in transaction listener:", error);
      }
    );

    // Listen penambahan stok hari ini
    const stockAddQuery = query(
      collection(firestore, "stockAdditions"),
      where("timestamp", ">=", todayTimestamp),
      orderBy("timestamp", "desc")
    );

    const unsubscribeStockAdd = onSnapshot(
      stockAddQuery,
      (snapshot) => {
        let hasChanges = false;
        
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added" || change.type === "modified") {
            const data = change.doc.data();
            if (data.items?.length) {
              data.items.forEach(item => {
                if (item.kodeText) {
                  this.markForUpdate(item.kodeText, 'stockAdd');
                  hasChanges = true;
                }
              });
            }
          }
        });

        if (hasChanges) {
          console.log(`📦 Detected stock addition changes`);
          this.debounceUpdate();
        }
      },
      (error) => {
        console.error("Error in stock addition listener:", error);
      }
    );

    this.realtimeListeners.push(unsubscribeTransactions, unsubscribeStockAdd);
  }

  // 🎯 Mark item for selective update
  markForUpdate(kode, source) {
    this.pendingUpdates.add(kode);
    console.log(`🎯 Marked ${kode} for update (source: ${source})`);
  }

  // ⏱️ Debounce updates to avoid excessive processing
  debounceUpdate() {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    this.updateTimeout = setTimeout(() => {
      this.processUpdates();
    }, 1000); // 1 second delay
  }

  // 🔄 Process pending updates
  async processUpdates() {
    if (this.pendingUpdates.size === 0) return;

    const updatedCodes = Array.from(this.pendingUpdates);
    console.log(`🔄 Processing ${updatedCodes.length} pending updates:`, updatedCodes);
    
    try {
      // Selective invalidation - hapus cache untuk item yang berubah
      this.selectiveInvalidation(updatedCodes);
      
      // Update local state untuk kode yang berubah
      await this.updateLocalState(updatedCodes);
      
      this.pendingUpdates.clear();
      
      // Emit event untuk UI update
      this.eventTarget.dispatchEvent(new CustomEvent('cacheUpdated', {
        detail: { updatedCodes, timestamp: Date.now() }
      }));
      
      console.log(`✅ Successfully processed updates for ${updatedCodes.length} items`);
    } catch (error) {
      console.error("❌ Error processing updates:", error);
    }
  }

  // 🗑️ Selective cache invalidation
  selectiveInvalidation(codes) {
    const keysToDelete = [];
    
    this.cache.forEach((value, key) => {
      // Hapus cache yang terkait dengan kode yang berubah
      const shouldDelete = codes.some(code => 
        key.includes(code) || 
        key.includes('stock_') || 
        key.includes('trans_')
      );
      
      if (shouldDelete) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.metadata.delete(key);
    });

    console.log(`🗑️ Selectively invalidated ${keysToDelete.length} cache entries`);
    this.saveCacheToStorage();
  }

  // 📊 Update local state untuk kode tertentu
  async updateLocalState(codes) {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Batch query untuk efisiensi
    const batchResults = await this.batchQueryTransactions(codes, startOfDay, endOfDay);
    
    // Update local state
    batchResults.forEach((data, kode) => {
      this.localState.set(kode, {
        ...data,
        lastUpdate: Date.now()
      });
    });

    console.log(`📊 Updated local state for ${batchResults.size} items`);
  }

  // 📦 Batch queries untuk multiple kode
  async batchQueryTransactions(codes, startDate, endDate) {
    const results = new Map();
    const batches = this.createBatches(codes, this.batchSize);

    console.log(`📦 Processing ${batches.length} batches for ${codes.length} codes`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`📦 Processing batch ${i + 1}/${batches.length} (${batch.length} items)`);
      
      try {
        const batchResult = await this.queryTransactionBatch(batch, startDate, endDate);
        batchResult.forEach((value, key) => {
          results.set(key, value);
        });
        
        // Small delay between batches to avoid overwhelming Firestore
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`❌ Error in batch ${i + 1}:`, error);
      }
    }

    return results;
  }

  // 🔍 Query single batch of transactions
  async queryTransactionBatch(codes, startDate, endDate) {
    const results = new Map();

    // Initialize results for all codes
    codes.forEach(code => {
      results.set(code, {
        tambahStok: 0,
        laku: 0,
        free: 0,
        gantiLock: 0,
        nama: '',
        kategori: ''
      });
    });

    // Query transactions using 'in' operator (max 10 items)
    const transQuery = query(
      collection(firestore, "stokAksesorisTransaksi"),
      where("kode", "in", codes),
      where("timestamp", ">=", Timestamp.fromDate(startDate)),
      where("timestamp", "<=", Timestamp.fromDate(endDate))
    );

    const transSnapshot = await getDocs(transQuery);
    console.log(`🔍 Batch query returned ${transSnapshot.size} transactions for ${codes.length} codes`);

    transSnapshot.forEach(doc => {
      const data = doc.data();
      const kode = data.kode;
      
      if (results.has(kode)) {
        const result = results.get(kode);
        const jumlah = data.jumlah || 0;
        
        // Update nama dan kategori jika ada
        if (data.nama) result.nama = data.nama;
        if (data.kategori) result.kategori = data.kategori;
        
        // Update berdasarkan jenis transaksi
        switch (data.jenis) {
          case "tambah":
            result.tambahStok += jumlah;
            break;
          case "laku":
            result.laku += jumlah;
            break;
          case "free":
            result.free += jumlah;
            break;
          case "gantiLock":
            result.gantiLock += jumlah;
            break;
        }
      }
    });

    // Query stock additions
    const addQuery = query(
      collection(firestore, "stockAdditions"),
      where("timestamp", ">=", Timestamp.fromDate(startDate)),
      where("timestamp", "<=", Timestamp.fromDate(endDate))
    );

    const addSnapshot = await getDocs(addQuery);
    
    addSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.items?.length) {
        data.items.forEach(item => {
          const kode = item.kodeText;
          if (results.has(kode)) {
            const result = results.get(kode);
            result.tambahStok += parseInt(item.jumlah) || 0;
            if (item.nama) result.nama = item.nama;
          }
        });
      }
    });

    return results;
  }

  // 🔧 Create batches for batch processing
  createBatches(array, size) {
    const batches = [];
    for (let i = 0; i < array.length; i += size) {
      batches.push(array.slice(i, i + size));
    }
    return batches;
  }

  // 💾 Load cache from localStorage
  loadCacheFromStorage() {
    try {
      const cacheData = localStorage.getItem("smartStockCache");
      const metaData = localStorage.getItem("smartStockCacheMeta");
      const stateData = localStorage.getItem("smartStockLocalState");

      if (cacheData) {
        const parsed = JSON.parse(cacheData);
        Object.entries(parsed).forEach(([key, value]) => {
          this.cache.set(key, value);
        });
      }

      if (metaData) {
        const parsed = JSON.parse(metaData);
        Object.entries(parsed).forEach(([key, value]) => {
          this.metadata.set(key, value);
        });
      }

      if (stateData) {
        const parsed = JSON.parse(stateData);
        Object.entries(parsed).forEach(([key, value]) => {
          this.localState.set(key, value);
        });
      }

      console.log(`💾 Loaded cache: ${this.cache.size} entries, state: ${this.localState.size} entries`);
    } catch (error) {
      console.warn("Failed to load cache from localStorage:", error);
    }
  }

  // 💾 Save cache to localStorage
  saveCacheToStorage() {
    try {
      const cacheData = {};
      const metaData = {};
      const stateData = {};

      this.cache.forEach((value, key) => {
        cacheData[key] = value;
      });

      this.metadata.forEach((value, key) => {
        metaData[key] = value;
      });

      this.localState.forEach((value, key) => {
        stateData[key] = value;
      });

      localStorage.setItem("smartStockCache", JSON.stringify(cacheData));
      localStorage.setItem("smartStockCacheMeta", JSON.stringify(metaData));
      localStorage.setItem("smartStockLocalState", JSON.stringify(stateData));
    } catch (error) {
      console.warn("Failed to save cache to localStorage:", error);
    }
  }

  // 🧹 Setup cleanup interval
  setupCleanupInterval() {
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 10 * 60 * 1000); // Cleanup every 10 minutes
  }

  // 🧹 Clean up expired cache entries
  cleanupExpiredCache() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const keysToDelete = [];

    this.metadata.forEach((timestamp, key) => {
      if (now - timestamp > maxAge) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.metadata.delete(key);
    });

    // Cleanup local state
    const stateKeysToDelete = [];
    this.localState.forEach((data, key) => {
      if (data.lastUpdate && now - data.lastUpdate > maxAge) {
        stateKeysToDelete.push(key);
      }
    });

    stateKeysToDelete.forEach(key => {
      this.localState.delete(key);
    });

    if (keysToDelete.length > 0 || stateKeysToDelete.length > 0) {
      console.log(`🧹 Cleaned up ${keysToDelete.length} cache entries and ${stateKeysToDelete.length} state entries`);
      this.saveCacheToStorage();
    }
  }

  // 🔍 Get cached data
  getCachedData(key) {
    return this.cache.get(key);
  }

  // 💾 Set cached data
  setCachedData(key, data) {
    this.cache.set(key, data);
    this.metadata.set(key, Date.now());
    this.saveCacheToStorage();
  }

    // 🎯 Get local state for specific codes
  getLocalState(codes) {
    const result = new Map();
    codes.forEach(code => {
      if (this.localState.has(code)) {
        result.set(code, this.localState.get(code));
      }
    });
    return result;
  }

  // 🔄 Force refresh for specific date
  async forceRefresh(date) {
    const dateStr = this.formatDate(date).replace(/\//g, "-");
    const keysToDelete = [];
    
    // Find and delete cache entries for specific date
    this.cache.forEach((value, key) => {
      if (key.includes(dateStr)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.metadata.delete(key);
    });

    console.log(`🔄 Force refreshed cache for ${dateStr}: ${keysToDelete.length} entries removed`);
    this.saveCacheToStorage();
  }

  // 🚫 Destroy listeners
  destroy() {
    this.realtimeListeners.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this.realtimeListeners = [];
    
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }
    
    console.log("🚫 Smart Stock Cache Manager destroyed");
  }

  // 📅 Format date helper
  formatDate(date) {
    if (!date) return "";
    try {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return "";
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (error) {
      console.error("Error formatting date:", error);
      return "";
    }
  }
}

// 📊 Incremental Data Loader
class IncrementalStockLoader {
  constructor(cacheManager) {
    this.cacheManager = cacheManager;
    this.baseSnapshots = new Map();
  }

  // 📈 Load incremental changes since last sync
  async loadIncrementalChanges(codes, sinceTimestamp, endDate) {
    console.log(`📈 Loading incremental changes for ${codes.length} codes since ${new Date(sinceTimestamp)}`);
    
    const changes = new Map();
    const batches = this.cacheManager.createBatches(codes, this.cacheManager.batchSize);

    for (const batch of batches) {
      const batchChanges = await this.loadBatchIncrementalChanges(batch, sinceTimestamp, endDate);
      batchChanges.forEach((value, key) => {
        changes.set(key, value);
      });
    }

    console.log(`📈 Loaded incremental changes for ${changes.size} items`);
    return changes;
  }

  // 📦 Load incremental changes for a batch
  async loadBatchIncrementalChanges(codes, sinceTimestamp, endDate) {
    const changes = new Map();
    
    // Initialize changes for all codes
    codes.forEach(code => {
      changes.set(code, {
        tambahStok: 0,
        laku: 0,
        free: 0,
        gantiLock: 0,
        nama: '',
        kategori: ''
      });
    });

    // Query incremental transactions
    const transQuery = query(
      collection(firestore, "stokAksesorisTransaksi"),
      where("kode", "in", codes),
      where("timestamp", ">", Timestamp.fromMillis(sinceTimestamp)),
      where("timestamp", "<=", Timestamp.fromDate(endDate)),
      orderBy("timestamp", "asc")
    );

    const transSnapshot = await getDocs(transQuery);
    console.log(`📦 Incremental batch query: ${transSnapshot.size} new transactions`);

    transSnapshot.forEach(doc => {
      const data = doc.data();
      const kode = data.kode;
      
      if (changes.has(kode)) {
        const change = changes.get(kode);
        const jumlah = data.jumlah || 0;
        
        if (data.nama) change.nama = data.nama;
        if (data.kategori) change.kategori = data.kategori;
        
        switch (data.jenis) {
          case "tambah":
            change.tambahStok += jumlah;
            break;
          case "laku":
            change.laku += jumlah;
            break;
          case "free":
            change.free += jumlah;
            break;
          case "gantiLock":
            change.gantiLock += jumlah;
            break;
        }
      }
    });

    return changes;
  }

  // 🔗 Merge incremental changes with base data
  mergeIncrementalData(baseData, incrementalChanges) {
    const result = new Map();
    
    // Start with base data
    baseData.forEach((data, kode) => {
      result.set(kode, { ...data });
    });

    // Apply incremental changes
    incrementalChanges.forEach((changes, kode) => {
      const current = result.get(kode) || {
        stokAwal: 0,
        tambahStok: 0,
        laku: 0,
        free: 0,
        gantiLock: 0,
        stokAkhir: 0,
        nama: changes.nama,
        kategori: changes.kategori
      };

      // Update with incremental changes
      current.tambahStok += changes.tambahStok;
      current.laku += changes.laku;
      current.free += changes.free;
      current.gantiLock += changes.gantiLock;
      
      // Recalculate final stock
      current.stokAkhir = Math.max(0, 
        current.stokAwal + current.tambahStok - current.laku - current.free - current.gantiLock
      );

      result.set(kode, current);
    });

    return result;
  }
}

// 🎯 Main Stock Report Handler with Smart Caching
const smartLaporanStokHandler = {
  // Core components
  cacheManager: null,
  incrementalLoader: null,
  stockData: [],
  filteredStockData: [],
  isInitialized: false,

  // Initialize the module
  init() {
    console.log("🚀 Initializing Smart Stock Report Handler");
    
    // Initialize cache manager
    this.cacheManager = new SmartStockCacheManager();
    this.cacheManager.init();
    
    // Initialize incremental loader
    this.incrementalLoader = new IncrementalStockLoader(this.cacheManager);
    
    // Setup UI components
    this.initDatePickers();
    this.attachEventListeners();
    this.setDefaultDates();
    this.initDataTable();
    this.prepareEmptyTable();
    
    // Listen to cache updates
    this.setupCacheUpdateListener();
    
    this.isInitialized = true;
    console.log("✅ Smart Stock Report Handler initialized");
  },

  // 👂 Setup cache update listener
  setupCacheUpdateListener() {
    this.cacheManager.eventTarget.addEventListener('cacheUpdated', (event) => {
      const { updatedCodes, timestamp } = event.detail;
      console.log(`🔔 Cache updated for ${updatedCodes.length} codes at ${new Date(timestamp)}`);
      
      // Auto-refresh if user is viewing today's data
      const currentDate = document.getElementById("startDate").value;
      const today = this.formatDate(new Date());
      
      if (currentDate === today) {
        console.log("🔄 Auto-refreshing current view due to cache update");
        this.refreshCurrentView();
      } else {
        // Show notification for non-current dates
        this.showCacheUpdateNotification(updatedCodes.length);
      }
    });
  },

  // 🔄 Refresh current view
  async refreshCurrentView() {
    try {
      await this.loadAndFilterStockData(false, true); // Use incremental update
    } catch (error) {
      console.error("Error refreshing current view:", error);
    }
  },

  // 🔔 Show cache update notification
  showCacheUpdateNotification(count) {
    const notification = document.createElement('div');
    notification.className = 'alert alert-info alert-dismissible fade show position-fixed';
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 300px;';
    notification.innerHTML = `
      <i class="fas fa-sync-alt me-2"></i>
      ${count} item stok telah diperbarui secara real-time
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
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
    document.getElementById("startDate").value = this.formatDate(today);
  },

  // Initialize DataTable
  initDataTable() {
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
      buttons: [
        {
          extend: "excel",
          text: '<i class="fas fa-file-excel me-2"></i>Excel',
          className: "btn btn-success btn-sm me-1",
          exportOptions: { columns: ":visible" },
          title: "Laporan Stok",
        },
        {
          extend: "pdf",
          text: '<i class="fas fa-file-pdf me-2"></i>PDF',
          className: "btn btn-danger btn-sm me-1",
          exportOptions: { columns: ":visible" },
          title: "Laporan Stok",
          customize: function (doc) {
            doc.defaultStyle.fontSize = 8;
            doc.styles.tableHeader.fontSize = 9;
          },
        },
      ],
    });
  },

  // Prepare empty table
  prepareEmptyTable() {
    const tableBody = document.querySelector("#stockTable tbody");
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center">Silakan pilih tanggal dan klik tombol "Tampilkan" untuk melihat data</td>
        </tr>
      `;
    }
  },

  // Attach event listeners
  attachEventListeners() {
    // Filter button
    const filterBtn = document.getElementById("filterStockBtn");
    if (filterBtn) {
      filterBtn.addEventListener("click", () => {
        this.loadAndFilterStockData();
      });
    }

    // Reset filter button
    const resetBtn = document.getElementById("resetStockFilterBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.resetFilters();
      });
    }

    // Force refresh button
    const refreshBtn = document.getElementById("refreshStockBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        this.forceRefreshData();
      });
    }
  },

  // Reset filters
  resetFilters() {
    const today = new Date();
    document.getElementById("startDate").value = this.formatDate(today);
    this.loadAndFilterStockData();
  },

  // 🔄 Force refresh data
  async forceRefreshData() {
    try {
      this.showLoading(true);
      
      const startDateStr = document.getElementById("startDate").value;
      if (!startDateStr) {
        this.showError("Pilih tanggal terlebih dahulu sebelum refresh data");
        this.showLoading(false);
        return;
      }

      const selectedDate = this.parseDate(startDateStr);
      if (!selectedDate) {
        this.showError("Format tanggal tidak valid");
        this.showLoading(false);
        return;
      }

      // Force refresh cache for selected date
      await this.cacheManager.forceRefresh(selectedDate);
      
      // Reload data
      await this.loadAndFilterStockData(true);
      
      this.showSuccess(`Data untuk tanggal ${startDateStr} berhasil diperbarui dari server`);
    } catch (error) {
      console.error("Error force refreshing data:", error);
      this.showError("Gagal memperbarui data: " + error.message);
    } finally {
      this.showLoading(false);
    }
  },

  // 📊 Load and filter stock data with smart caching
  async loadAndFilterStockData(forceRefresh = false, useIncremental = false) {
    try {
      this.showLoading(true);
      this.hideCacheIndicator();

      const startDateStr = document.getElementById("startDate").value;
      if (!startDateStr) {
        this.showError("Tanggal harus diisi");
        this.showLoading(false);
        return;
      }

      const selectedDate = this.parseDate(startDateStr);
      if (!selectedDate) {
        this.showError("Format tanggal tidak valid");
        this.showLoading(false);
        return;
      }

      console.log(`📊 Loading stock data for ${startDateStr} (force: ${forceRefresh}, incremental: ${useIncremental})`);

      // Load master stock data
      await this.loadStockMasterData(forceRefresh);

      // Calculate stock with smart caching
      if (useIncremental && this.canUseIncremental(selectedDate)) {
        await this.calculateStockIncremental(selectedDate);
      } else {
        await this.calculateStockFull(selectedDate, forceRefresh);
      }

      this.renderStockTable();
      this.showLoading(false);
      
      console.log(`✅ Successfully loaded ${this.filteredStockData.length} stock items`);
    } catch (error) {
      console.error("Error loading stock data:", error);
      this.showError("Terjadi kesalahan saat memuat data: " + error.message);
      this.showLoading(false);
    }
  },

  // 🔍 Check if incremental loading can be used
  canUseIncremental(selectedDate) {
    const today = new Date();
    const isToday = this.formatDate(selectedDate) === this.formatDate(today);
    
    // Only use incremental for today's data and if we have local state
    return isToday && this.cacheManager.localState.size > 0;
  },

  // 📈 Calculate stock using incremental method
  async calculateStockIncremental(selectedDate) {
    console.log("📈 Using incremental stock calculation");
    
    const dateStr = this.formatDate(selectedDate).replace(/\//g, "-");
    const cacheKey = `stock_incremental_${dateStr}`;
    
    // Get base data from cache or calculate
    let baseData = this.cacheManager.getCachedData(cacheKey);
    
    if (!baseData) {
      // Calculate base data (stock until yesterday)
      baseData = await this.calculateBaseStockData(selectedDate);
      this.cacheManager.setCachedData(cacheKey, baseData);
    }

    // Get today's changes from local state
    const todayChanges = this.getTodayChangesFromLocalState();
    
    // Merge base data with today's changes
    this.filteredStockData = this.mergeBaseWithTodayChanges(baseData, todayChanges);
    
    this.showCacheIndicator(true, "incremental");
  },

  // 📊 Calculate stock using full method
  async calculateStockFull(selectedDate, forceRefresh = false) {
    console.log("📊 Using full stock calculation");
    
    const dateStr = this.formatDate(selectedDate).replace(/\//g, "-");
    const cacheKey = `stock_full_${dateStr}`;
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cachedData = this.cacheManager.getCachedData(cacheKey);
      if (cachedData) {
        console.log(`Using cached full stock data for ${dateStr}`);
        this.filteredStockData = cachedData;
        this.showCacheIndicator(true, "cached");
        return;
      }
    }

    // Calculate from scratch
    await this.calculateDailyContinuity(selectedDate);
    
    // Cache the result
    this.cacheManager.setCachedData(cacheKey, [...this.filteredStockData]);
    
    this.showCacheIndicator(false);
  },

  // 📊 Calculate base stock data (until yesterday)
  async calculateBaseStockData(selectedDate) {
    const previousDate = new Date(selectedDate);
    previousDate.setDate(previousDate.getDate() - 1);
    previousDate.setHours(23, 59, 59, 999);

    // Get snapshot as base
    const baseSnapshot = await this.getSnapshotAsBase(selectedDate);
    
    // Calculate stock from base until yesterday
    const stockMap = await this.calculateStockFromBase(baseSnapshot, previousDate, selectedDate);
    
    // Convert to array format
    const baseData = [];
    this.stockData.forEach(item => {
      const stokAwal = stockMap.get(item.kode) || 0;
      baseData.push({
        ...item,
        stokAwal: stokAwal,
        tambahStok: 0,
        laku: 0,
        free: 0,
        gantiLock: 0,
        stokAkhir: stokAwal
      });
    });

    return baseData;
  },

  // 📅 Get today's changes from local state
  getTodayChangesFromLocalState() {
    const changes = new Map();
    
    this.cacheManager.localState.forEach((data, kode) => {
      changes.set(kode, {
        tambahStok: data.tambahStok || 0,
        laku: data.laku || 0,
        free: data.free || 0,
        gantiLock: data.gantiLock || 0,
        nama: data.nama || '',
        kategori: data.kategori || ''
      });
    });

    return changes;
  },

  // 🔗 Merge base data with today's changes
  mergeBaseWithTodayChanges(baseData, todayChanges) {
    const result = baseData.map(item => {
      const kode = item.kode;
      const changes = todayChanges.get(kode) || {
        tambahStok: 0, laku: 0, free: 0, gantiLock: 0
      };

      const stokAkhir = Math.max(0, 
        item.stokAwal + changes.tambahStok - changes.laku - changes.free - changes.gantiLock
      );

      return {
        ...item,
        tambahStok: changes.tambahStok,
        laku: changes.laku,
        free: changes.free,
        gantiLock: changes.gantiLock,
        stokAkhir: stokAkhir
      };
    });

    // Add items that exist in changes but not in base data
    todayChanges.forEach((changes, kode) => {
      const exists = result.find(item => item.kode === kode);
      if (!exists) {
        result.push({
          kode: kode,
          nama: changes.nama || '',
          kategori: changes.kategori || '',
          stokAwal: 0,
          tambahStok: changes.tambahStok,
          laku: changes.laku,
          free: changes.free,
          gantiLock: changes.gantiLock,
          stokAkhir: Math.max(0, changes.tambahStok - changes.laku - changes.free - changes.gantiLock)
        });
      }
    });

    // Sort data
    result.sort((a, b) => {
      if (a.kategori !== b.kategori) {
        return a.kategori === "kotak" ? -1 : 1;
      }
      return a.kode.localeCompare(b.kode);
    });

    return result;
  },

  // 📊 Calculate daily continuity (original method with caching)
  async calculateDailyContinuity(selectedDate) {
    try {
      // 1. Calculate stock until previous day using priority system
      const previousDate = new Date(selectedDate);
      previousDate.setDate(previousDate.getDate() - 1);
      previousDate.setHours(23, 59, 59, 999);

      // Use priority snapshot system
      const baseSnapshot = await this.getSnapshotAsBase(selectedDate);
      const previousStockMap = await this.calculateStockFromBase(baseSnapshot, previousDate, selectedDate);

      // 2. Calculate today's transactions only
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      const todayTransactions = await this.getTransactionsForDate(startOfDay, endOfDay);

      // 3. Combine: initial stock (from snapshot/calculation) + today's transactions = final stock
      this.filteredStockData = this.stockData.map((item) => {
        const kode = item.kode;

        // Initial stock = yesterday's final stock (from snapshot or calculation)
        const stokAwal = previousStockMap.get(kode) || 0;

        // Today's transactions
        const todayTrans = todayTransactions.get(kode) || {
          tambahStok: 0,
          laku: 0,
          free: 0,
          gantiLock: 0,
        };

        // Final stock = initial stock + additions - outgoing
        const stokAkhir = Math.max(
          0,
          stokAwal + todayTrans.tambahStok - todayTrans.laku - todayTrans.free - todayTrans.gantiLock
        );

        return {
          ...item,
          stokAwal: stokAwal,
          tambahStok: todayTrans.tambahStok,
          laku: todayTrans.laku,
          free: todayTrans.free,
          gantiLock: todayTrans.gantiLock,
          stokAkhir: stokAkhir,
        };
      });

      // Add items that exist in transactions but not in master
      todayTransactions.forEach((trans, kode) => {
        const exists = this.filteredStockData.find((item) => item.kode === kode);
        if (!exists) {
          const stokAwal = previousStockMap.get(kode) || 0;
          const stokAkhir = Math.max(0, stokAwal + trans.tambahStok - trans.laku - trans.free - trans.gantiLock);

          this.filteredStockData.push({
            kode: kode,
            nama: trans.nama || "",
            kategori: trans.kategori || "",
            stokAwal: stokAwal,
            tambahStok: trans.tambahStok,
            laku: trans.laku,
            free: trans.free,
            gantiLock: trans.gantiLock,
            stokAkhir: stokAkhir,
          });
        }
      });

      // Sort data
      this.filteredStockData.sort((a, b) => {
        if (a.kategori !== b.kategori) {
          return a.kategori === "kotak" ? -1 : 1;
        }
        return a.kode.localeCompare(b.kode);
      });

      console.log(`✅ Daily continuity calculated: ${this.filteredStockData.length} items`);
    } catch (error) {
      console.error("Error calculating daily continuity:", error);
      throw error;
    }
  },

  // 📦 Load stock master data with smart caching
  async loadStockMasterData(forceRefresh = false) {
    const cacheKey = "stockMasterData";
    
    // Check cache first
    if (!forceRefresh) {
      const cachedData = this.cacheManager.getCachedData(cacheKey);
      if (cachedData) {
        console.log("Using cached stock master data");
        this.stockData = cachedData;
        return;
      }
    }

    try {
      // Load current stock
      const stockSnapshot = await getDocs(collection(firestore, "stokAksesoris"));
      this.stockData = [];

      stockSnapshot.forEach((doc) => {
        this.stockData.push({ id: doc.id, ...doc.data() });
      });

      // Load all kode aksesoris for complete list
      await this.loadAllKodeAksesoris();

      // Cache the stock data
      this.cacheManager.setCachedData(cacheKey, [...this.stockData]);

      console.log(`Loaded ${this.stockData.length} stock items`);
    } catch (error) {
      console.error("Error loading stock master data:", error);
      
      // Try to use cache as fallback
      const cachedData = this.cacheManager.getCachedData(cacheKey);
      if (cachedData) {
        console.log("Using cached stock master data as fallback");
        this.stockData = cachedData;
      } else {
        throw error;
      }
    }
  },

  // 📋 Load all kode aksesoris with smart caching
  async loadAllKodeAksesoris(forceRefresh = false) {
    const cacheKey = "kodeAksesorisData";
    
    // Check cache first
    if (!forceRefresh) {
      const cachedData = this.cacheManager.getCachedData(cacheKey);
      if (cachedData) {
        console.log("Using cached kode aksesoris data");
        this.mergeKodeAksesorisData(cachedData);
        return;
      }
    }

    try {
      const kodeAksesorisData = [];

      // Get kotak data
      const kotakSnapshot = await getDocs(collection(firestore, "kodeAksesoris", "kategori", "kotak"));
      
      // Get aksesoris data  
      const aksesorisSnapshot = await getDocs(collection(firestore, "kodeAksesoris", "kategori", "aksesoris"));

      // Process kotak data
      kotakSnapshot.forEach((doc) => {
        const data = doc.data();
        const kodeItem = {
          id: null,
          kode: data.text,
          nama: data.nama,
          kategori: "kotak",
          stokAwal: 0,
          tambahStok: 0,
          laku: 0,
          free: 0,
          gantiLock: 0,
          stokAkhir: 0,
          lastUpdate: new Date(),
        };
        kodeAksesorisData.push(kodeItem);
      });

      // Process aksesoris data
      aksesorisSnapshot.forEach((doc) => {
        const data = doc.data();
        const kodeItem = {
          id: null,
          kode: data.text,
          nama: data.nama,
          kategori: "aksesoris",
          stokAwal: 0,
          tambahStok: 0,
          laku: 0,
          free: 0,
          gantiLock: 0,
          stokAkhir: 0,
          lastUpdate: new Date(),
        };
        kodeAksesorisData.push(kodeItem);
      });

      // Cache the data
      this.cacheManager.setCachedData(cacheKey, kodeAksesorisData);
      
      // Merge with existing stock data
      this.mergeKodeAksesorisData(kodeAksesorisData);
      
    } catch (error) {
      console.error("Error loading kode aksesoris:", error);
      
      // Try to use cache as fallback
      const cachedData = this.cacheManager.getCachedData(cacheKey);
      if (cachedData) {
        console.log("Using cached kode aksesoris data as fallback");
        this.mergeKodeAksesorisData(cachedData);
      } else {
        throw error;
      }
    }
  },

  // 🔗 Merge kode aksesoris data with stock data
  mergeKodeAksesorisData(kodeAksesorisData) {
    kodeAksesorisData.forEach((item) => {
      const existingIndex = this.stockData.findIndex((stockItem) => stockItem.kode === item.kode);
      if (existingIndex === -1) {
        this.stockData.push(item);
      } else {
        this.stockData[existingIndex].kategori = item.kategori;
        this.stockData[existingIndex].nama = item.nama;
      }
    });
  },

  // 🎯 Get snapshot as base with smart caching
  async getSnapshotAsBase(selectedDate) {
    try {
      const cacheKey = `snapshot_${this.formatDate(selectedDate).replace(/\//g, "-")}`;
      
      // Check cache first
      const cachedSnapshot = this.cacheManager.getCachedData(cacheKey);
      if (cachedSnapshot) {
        console.log(`Using cached snapshot data for ${this.formatDate(selectedDate)}`);
        return cachedSnapshot;
      }

      console.log(`🎯 Getting snapshot base for: ${this.formatDate(selectedDate)}`);

      // Priority 1: Daily snapshot (previous day)
      const previousDate = new Date(selectedDate);
      previousDate.setDate(previousDate.getDate() - 1);

      const dailySnapshot = await this.getDailySnapshot(previousDate);
      if (dailySnapshot && dailySnapshot.size > 0) {
        console.log(`📅 Using daily snapshot: ${this.formatDate(previousDate)} (${dailySnapshot.size} items)`);
        this.cacheManager.setCachedData(cacheKey, dailySnapshot);
        return dailySnapshot;
      }

      // Priority 2: Same day snapshot (for special cases)
      const sameDaySnapshot = await this.getDailySnapshot(selectedDate);
      if (sameDaySnapshot && sameDaySnapshot.size > 0) {
        console.log(`📅 Using same-day snapshot: ${this.formatDate(selectedDate)} (${sameDaySnapshot.size} items)`);
        this.cacheManager.setCachedData(cacheKey, sameDaySnapshot);
        return sameDaySnapshot;
      }

      // Priority 3: Monthly snapshot (previous month)
      const monthlySnapshot = await this.getMonthlySnapshot(selectedDate);
      if (monthlySnapshot && monthlySnapshot.size > 0) {
        const prevMonth = new Date(selectedDate);
        prevMonth.setMonth(prevMonth.getMonth() - 1);
        console.log(`📊 Using monthly snapshot: ${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")} (${monthlySnapshot.size} items)`);
        this.cacheManager.setCachedData(cacheKey, monthlySnapshot);
        return monthlySnapshot;
      }

      // Priority 4: Empty base (start from zero)
      console.log("⚠️ No snapshot found, starting from zero");
      const emptySnapshot = new Map();
      this.cacheManager.setCachedData(cacheKey, emptySnapshot);
      return emptySnapshot;
      
    } catch (error) {
      console.error("Error getting snapshot base:", error);
      return new Map();
    }
  },

  // 📅 Get daily snapshot with smart caching
  async getDailySnapshot(date) {
    try {
      const dateKey = this.formatDate(date);
      const cacheKey = `daily_snapshot_${dateKey.replace(/\//g, "-")}`;
      
      // Check cache first
      const cachedData = this.cacheManager.getCachedData(cacheKey);
      if (cachedData !== undefined) {
        return cachedData;
      }

      console.log(`🔍 Looking for daily snapshot: ${dateKey}`);

      const dailySnapshotQuery = query(
        collection(firestore, "dailyStockSnapshot"), 
        where("date", "==", dateKey)
      );

      const querySnapshot = await getDocs(dailySnapshotQuery);

      if (querySnapshot.empty) {
        console.log(`❌ Daily snapshot not found for: ${dateKey}`);
        this.cacheManager.setCachedData(cacheKey, null);
        return null;
      }

      const doc = querySnapshot.docs[0];
      const data = doc.data();

      console.log(`✅ Daily snapshot found for: ${dateKey}`, {
        docId: doc.id,
        totalItems: data.totalItems || 0,
        stockDataLength: data.stockData?.length || 0,
      });

      const snapshotMap = new Map();

      if (data.stockData && Array.isArray(data.stockData)) {
        data.stockData.forEach((item) => {
          if (item.kode) {
            snapshotMap.set(item.kode, {
              stokAwal: item.stokAkhir || 0,
              nama: item.nama || "",
              kategori: item.kategori || "",
            });
          }
        });

        console.log(`📊 Daily snapshot loaded: ${snapshotMap.size} items`);
        this.cacheManager.setCachedData(cacheKey, snapshotMap);
        return snapshotMap;
      } else {
        console.log(`⚠️ No stockData array in snapshot: ${dateKey}`);
        this.cacheManager.setCachedData(cacheKey, null);
        return null;
      }
    } catch (error) {
      console.error("Error loading daily snapshot:", error);
      return null;
    }
  },

  // 📊 Get monthly snapshot with smart caching
  async getMonthlySnapshot(selectedDate) {
    try {
      const prevMonth = new Date(selectedDate);
      prevMonth.setMonth(prevMonth.getMonth() - 1);
      const monthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
      const cacheKey = `monthly_snapshot_${monthKey}`;
      
      // Check cache first
      const cachedData = this.cacheManager.getCachedData(cacheKey);
      if (cachedData) {
        return cachedData;
      }

      const snapshotQuery = query(
        collection(firestore, "stokSnapshot"), 
        where("bulan", "==", monthKey)
      );

      const snapshot = await getDocs(snapshotQuery);
      const snapshotMap = new Map();

      snapshot.forEach((doc) => {
        const data = doc.data();
        snapshotMap.set(data.kode, {
          stokAwal: data.stok_akhir || 0,
          nama: data.nama || "",
          kategori: data.kategori || "",
        });
      });

      this.cacheManager.setCachedData(cacheKey, snapshotMap);
      return snapshotMap;
    } catch (error) {
      console.error("Error loading monthly snapshot:", error);
      return new Map();
    }
  },

  // 📈 Calculate stock from base with smart caching
  async calculateStockFromBase(baseSnapshot, endDate, selectedDate) {
    const stockMap = new Map();

    try {
      // Initialize with base snapshot
      baseSnapshot.forEach((data, kode) => {
        stockMap.set(kode, data.stokAwal || 0);
      });

      // Initialize items not in snapshot
      this.stockData.forEach((item) => {
        if (!stockMap.has(item.kode)) {
          stockMap.set(item.kode, 0);
        }
      });

      // Determine start date for transaction calculation
      let startDate;
      if (baseSnapshot.size > 0) {
        const snapshotDate = new Date(selectedDate);
        snapshotDate.setDate(snapshotDate.getDate() - 1);
        startDate = new Date(snapshotDate);
        startDate.setHours(0, 0, 0, 0);
      } else {
        startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
      }

      // Calculate transactions from start date to end date
      if (startDate <= endDate) {
        const transactions = await this.getTransactionsForDate(startDate, endDate);

        // Apply transactions to stock
        transactions.forEach((trans, kode) => {
          const currentStock = stockMap.get(kode) || 0;
          const newStock = Math.max(0, currentStock + trans.tambahStok - trans.laku - trans.free - trans.gantiLock);
          stockMap.set(kode, newStock);
        });
      }

      console.log(`📈 Stock calculated from base until ${this.formatDate(endDate)}: ${stockMap.size} items`);
      return stockMap;
    } catch (error) {
      console.error("Error calculating stock from base:", error);
      return stockMap;
    }
  },

  // 📋 Get transactions for date range with smart caching and batching
  async getTransactionsForDate(startDate, endDate) {
    const transactionMap = new Map();
    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];
    const cacheKey = `trans_${startDateStr}_${endDateStr}`;

    // Check cache first
    const cachedData = this.cacheManager.getCachedData(cacheKey);
    if (cachedData) {
      console.log(`Using cached transaction data for ${startDateStr} to ${endDateStr}`);
      return cachedData;
    }

    try {
      // Get stock transactions with optimized query
      const transQuery = query(
        collection(firestore, "stokAksesorisTransaksi"),
        where("timestamp", ">=", Timestamp.fromDate(startDate)),
        where("timestamp", "<=", Timestamp.fromDate(endDate)),
        orderBy("timestamp", "asc")
      );

      const transSnapshot = await getDocs(transQuery);
      console.log(`📋 Transaction query returned ${transSnapshot.size} results`);

      transSnapshot.forEach((doc) => {
        const data = doc.data();
        const kode = data.kode;

        if (!kode) return;

        if (!transactionMap.has(kode)) {
          transactionMap.set(kode, {
            tambahStok: 0,
            laku: 0,
            free: 0,
            gantiLock: 0,
            nama: data.nama || "",
            kategori: data.kategori || "",
          });
        }

        const trans = transactionMap.get(kode);
        const jumlah = data.jumlah || 0;

        switch (data.jenis) {
          case "tambah":
            trans.tambahStok += jumlah;
            break;
          case "laku":
            trans.laku += jumlah;
            break;
          case "free":
            trans.free += jumlah;
            break;
          case "gantiLock":
            trans.gantiLock += jumlah;
            break;
        }
      });

      // Get stock additions
      const addQuery = query(
        collection(firestore, "stockAdditions"),
        where("timestamp", ">=", Timestamp.fromDate(startDate)),
        where("timestamp", "<=", Timestamp.fromDate(endDate))
      );

      const addSnapshot = await getDocs(addQuery);

      addSnapshot.forEach((doc) => {
        const data = doc.data();
        if (!data.items?.length) return;

        data.items.forEach((item) => {
          const kode = item.kodeText;
          if (!kode) return;

          if (!transactionMap.has(kode)) {
            transactionMap.set(kode, {
              tambahStok: 0,
              laku: 0,
              free: 0,
              gantiLock: 0,
              nama: item.nama || "",
              kategori: "",
            });
          }

          const trans = transactionMap.get(kode);
          trans.tambahStok += parseInt(item.jumlah) || 0;
        });
      });

      // Cache the transaction data
      this.cacheManager.setCachedData(cacheKey, transactionMap);

      const dateRange = startDate.toDateString() === endDate.toDateString()
        ? this.formatDate(startDate)
        : `${this.formatDate(startDate)} - ${this.formatDate(endDate)}`;

      console.log(`📋 Transactions for ${dateRange}: ${transactionMap.size} items`);
      return transactionMap;
    } catch (error) {
      console.error("Error getting transactions for date:", error);
      return new Map();
    }
  },

  // 🎨 Render stock table with enhanced features
  renderStockTable() {
    try {
      const tableElement = document.getElementById("stockTable");
      if (!tableElement) {
        console.error("Table element #stockTable not found");
        return;
      }

      // Destroy existing DataTable
      if ($.fn.DataTable.isDataTable("#stockTable")) {
        $("#stockTable").DataTable().destroy();
      }

      const tableBody = document.querySelector("#stockTable tbody");
      if (!tableBody) {
        console.error("Table body not found");
        return;
      }

      // Check if there's data to display
      if (!this.filteredStockData || this.filteredStockData.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="9" class="text-center">Tidak ada data yang sesuai dengan filter</td>
          </tr>
        `;
        this.initializeEmptyDataTable();
        return;
      }

      // Group data by category
      const kotakItems = this.filteredStockData.filter((item) => item.kategori === "kotak");
      const aksesorisItems = this.filteredStockData.filter((item) => item.kategori === "aksesoris");
      const otherItems = this.filteredStockData.filter(
        (item) => item.kategori !== "kotak" && item.kategori !== "aksesoris"
      );

      // Create HTML for table
      let html = "";
      let rowIndex = 1;

      [...kotakItems, ...aksesorisItems, ...otherItems].forEach((item) => {
        const categoryClass = item.kategori === "kotak" ? "kotak-item" 
          : item.kategori === "aksesoris" ? "aksesoris-item" : "other-item";

        html += `
          <tr class="${categoryClass}">
            <td class="text-center">${rowIndex++}</td>
            <td class="text-center">${item.kode || "-"}</td>
            <td>${item.nama || "-"}</td>
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

      // Get selected date for title
      const selectedDateStr = document.getElementById("startDate").value;
      const selectedDate = selectedDateStr || this.formatDate(new Date());

      // Initialize DataTable with export buttons
      this.initializeDataTable(selectedDate);

      // Add category headers
      this.addCategoryHeaders(kotakItems, aksesorisItems, otherItems);

      console.log(`🎨 Rendered table with ${this.filteredStockData.length} items`);
    } catch (error) {
      console.error("Error rendering stock table:", error);
      this.showError("Terjadi kesalahan saat menampilkan data: " + error.message);
      this.resetTableToCleanState();
    }
  },

  // 📊 Initialize DataTable with enhanced configuration
  initializeDataTable(selectedDate) {
    // Add CSS for responsive table
    this.addTableStyles();

    $("#stockTable").DataTable({
      responsive: true,
      dom: "Bfrtip",
      ordering: false,
      autoWidth: false,
      pageLength: 25,
      lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "Semua"]],
      buttons: [
        {
          extend: "excel",
          text: '<i class="fas fa-file-excel me-2"></i>Excel',
          className: "btn btn-success btn-sm me-1",
          exportOptions: { columns: ":visible" },
          title: `Laporan Stok Kotak & Aksesoris Melati Atas (${selectedDate})`,
          customize: function (xlsx) {
            var sheet = xlsx.xl.worksheets["sheet1.xml"];
            $('row c[r^="C"]', sheet).attr("s", "55");
            $("row:not(:first-child) c", sheet).attr("s", "55");
          },
        },
        {
          extend: "pdf",
          text: '<i class="fas fa-file-pdf me-2"></i>PDF',
          className: "btn btn-danger btn-sm me-1",
          exportOptions: { columns: ":visible" },
          title: `Laporan Stok Kotak & Aksesoris Melati Atas\n(${selectedDate})`,
          customize: function (doc) {
            doc.defaultStyle.fontSize = 8;
            doc.styles.tableHeader.fontSize = 9;
            doc.content[1].table.widths = ["5%", "10%", "35%", "8.33%", "8.33%", "8.33%", "8.33%", "8.33%", "8.33%"];
            doc.styles.tableHeader.alignment = "center";
            doc.styles.tableBodyEven.alignment = "center";
            doc.styles.tableBodyOdd.alignment = "center";
            
            doc.content[1].table.body.forEach(function (row) {
              row.forEach(function (cell, cellIndex) {
                if (cellIndex === 2) {
                  cell.alignment = "left";
                } else {
                  cell.alignment = "center";
                }
              });
            });
          },
        },
        {
          text: '<i class="fas fa-print me-2"></i>Print',
          className: "btn btn-info btn-sm me-1",
          action: function () {
            window.print();
          }
        }
      ],
      columnDefs: [
        { className: "text-center", targets: [0, 1, 3, 4, 5, 6, 7, 8] },
        { className: "text-wrap", targets: "_all" },
        { width: "5%", targets: 0 },
        { width: "10%", targets: 1 },
        { width: "35%", targets: 2 },
        { width: "8.33%", targets: [3, 4, 5, 6, 7, 8] },
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
          previous: "Sebelumnya",
        },
        emptyTable: "Tidak ada data yang tersedia",
        zeroRecords: "Tidak ditemukan data yang sesuai"
      },
    });
  },

  // 📊 Initialize empty DataTable
  initializeEmptyDataTable() {
    $("#stockTable").DataTable({
      responsive: true,
      language: {
        emptyTable: "Tidak ada data yang tersedia",
        search: "Cari:",
      },
    });
  },

  // 🎨 Add table styles
  addTableStyles() {
    // Remove existing style if any
    const existingStyle = document.getElementById("smartStockTableStyle");
    if (existingStyle) {
      existingStyle.remove();
    }

    const styleElement = document.createElement("style");
    styleElement.id = "smartStockTableStyle";
    styleElement.textContent = `
      #stockTable th, #stockTable td {
        white-space: normal;
        word-wrap: break-word;
        vertical-align: middle;
        padding: 8px 4px;
      }
      
      #stockTable th:nth-child(1), #stockTable td:nth-child(1) { width: 5%; }
      #stockTable th:nth-child(2), #stockTable td:nth-child(2) { width: 10%; }
      #stockTable th:nth-child(3), #stockTable td:nth-child(3) { width: 35%; }
      #stockTable th:nth-child(4), #stockTable td:nth-child(4),
      #stockTable th:nth-child(5), #stockTable td:nth-child(5),
      #stockTable th:nth-child(6), #stockTable td:nth-child(6),
      #stockTable th:nth-child(7), #stockTable td:nth-child(7),
      #stockTable th:nth-child(8), #stockTable td:nth-child(8),
      #stockTable th:nth-child(9), #stockTable td:nth-child(9) { width: 8.33%; }
      
      .kotak-item { background-color: rgba(0, 123, 255, 0.05); }
      .aksesoris-item { background-color: rgba(40, 167, 69, 0.05); }
      .other-item { background-color: rgba(108, 117, 125, 0.05); }
      
      .cache-indicator {
        position: sticky;
        top: 0;
        z-index: 1000;
        margin-bottom: 10px;
      }
      
      .realtime-indicator {
        animation: pulse 2s infinite;
      }
      
      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.7; }
        100% { opacity: 1; }
      }
      
      @media print {
        #stockTable { width: 100% !important; table-layout: fixed !important; }
        #stockTable th, #stockTable td {
          padding: 4px !important;
          font-size: 10pt !important;
          overflow: visible !important;
        }
        .cache-indicator, .btn, .dataTables_wrapper .dataTables_filter,
        .dataTables_wrapper .dataTables_length, .dataTables_wrapper .dataTables_info,
        .dataTables_wrapper .dataTables_paginate { display: none !important; }
      }
    `;
    document.head.appendChild(styleElement);
  },

  // 🏷️ Add category headers with enhanced functionality
  addCategoryHeaders(kotakItems, aksesorisItems, otherItems) {
    const tableContainer = document.querySelector("#stockTable_wrapper");
    if (!tableContainer) return;

    // Remove existing category header
    const existingHeader = document.querySelector(".category-headers");
    if (existingHeader) {
      existingHeader.remove();
    }

    const categoryHeaderContainer = document.createElement("div");
    categoryHeaderContainer.className = "category-headers mb-3 mt-3";
    
    // Calculate totals
    const kotakTotal = kotakItems.reduce((sum, item) => sum + (item.stokAkhir || 0), 0);
    const aksesorisTotal = aksesorisItems.reduce((sum, item) => sum + (item.stokAkhir || 0), 0);
    const otherTotal = otherItems.reduce((sum, item) => sum + (item.stokAkhir || 0), 0);

    categoryHeaderContainer.innerHTML = `
      <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center">
        <div class="d-flex flex-wrap gap-2">
          ${kotakItems.length > 0 ? `
            <div class="category-badge badge bg-primary p-2 cursor-pointer" data-category="kotak">
              <i class="fas fa-box me-1"></i>
              ${kotakItems.length} Kotak (Total: ${kotakTotal})
            </div>
          ` : ""}
          ${aksesorisItems.length > 0 ? `
            <div class="category-badge badge bg-success p-2 cursor-pointer" data-category="aksesoris">
              <i class="fas fa-gem me-1"></i>
              ${aksesorisItems.length} Aksesoris (Total: ${aksesorisTotal})
            </div>
          ` : ""}
          ${otherItems.length > 0 ? `
            <div class="category-badge badge bg-secondary p-2 cursor-pointer" data-category="other">
              <i class="fas fa-ellipsis-h me-1"></i>
              ${otherItems.length} Lainnya (Total: ${otherTotal})
            </div>
          ` : ""}
        </div>
        <div class="text-muted small">
          <i class="fas fa-info-circle me-1"></i>
          Klik kategori untuk filter
        </div>
      </div>
    `;

    tableContainer.insertBefore(categoryHeaderContainer, tableContainer.querySelector(".dataTables_filter"));

    // Add event listeners for category filtering
    this.setupCategoryFiltering();
  },

  // 🔍 Setup category filtering
  setupCategoryFiltering() {
    document.querySelectorAll(".category-badge").forEach((badge) => {
      badge.addEventListener("click", function () {
        const category = this.getAttribute("data-category");
        
        // Toggle active state
        this.classList.toggle("active");
        const isActive = this.classList.contains("active");

        // Update badge style
        if (isActive) {
          this.style.opacity = "1";
          this.style.transform = "scale(1.05)";
        } else {
          this.style.opacity = "0.7";
          this.style.transform = "scale(1)";
        }

        // Apply filtering
        smartLaporanStokHandler.applyCategoryFilter();
      });
    });
  },

  // 🎯 Apply category filter
  applyCategoryFilter() {
    const table = $("#stockTable").DataTable();
    
    // Get active categories
    const activeCategories = [];
    document.querySelectorAll(".category-badge.active").forEach((badge) => {
      activeCategories.push(badge.getAttribute("data-category"));
    });

    // Clear existing search functions
    $.fn.dataTable.ext.search = [];

    // Add custom search function if categories are selected
    if (activeCategories.length > 0) {
      $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
        const rowNode = table.row(dataIndex).node();
        
        return activeCategories.some((category) => {
          switch (category) {
            case "kotak":
              return rowNode.classList.contains("kotak-item");
            case "aksesoris":
              return rowNode.classList.contains("aksesoris-item");
            case "other":
              return rowNode.classList.contains("other-item");
            default:
              return false;
          }
        });
      });
    }

    // Redraw table
    table.draw();
  },

  // 📊 Show/hide cache indicator with enhanced info
  showCacheIndicator(show, type = "normal") {
    let indicator = document.getElementById("smartStockCacheIndicator");

    if (show && !indicator) {
      indicator = document.createElement("div");
      indicator.id = "smartStockCacheIndicator";
      indicator.className = "alert cache-indicator mb-2";

      const tableContainer = document.querySelector("#stockTable").parentElement;
      tableContainer.insertBefore(indicator, tableContainer.firstChild);
    }

    if (indicator) {
      if (show) {
        const now = new Date();
        const timeText = now.toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        });

        let iconClass, alertClass, message;

        switch (type) {
          case "incremental":
            iconClass = "fas fa-bolt";
            alertClass = "alert-success";
            message = `Menggunakan data real-time incremental (${timeText})`;
            indicator.classList.add("realtime-indicator");
            break;
          case "cached":
            iconClass = "fas fa-database";
            alertClass = "alert-info";
            message = `Menggunakan data cache (${timeText})`;
            break;
          case "fallback":
            iconClass = "fas fa-exclamation-triangle";
            alertClass = "alert-warning";
            message = "Menggunakan data cache (fallback)";
            break;
          default:
            iconClass = "fas fa-chart-line";
            alertClass = "alert-primary";
            message = `Data dihitung dari server (${timeText})`;
        }

        indicator.innerHTML = `<i class="${iconClass} me-2"></i>${message}`;
        indicator.className = `alert ${alertClass} cache-indicator mb-2`;
        indicator.style.display = "block";
      } else {
        indicator.style.display = "none";
        indicator.classList.remove("realtime-indicator");
      }
    }
  },

  // 🫥 Hide cache indicator
  hideCacheIndicator() {
    const indicator = document.getElementById("smartStockCacheIndicator");
    if (indicator) {
      indicator.style.display = "none";
    }
  },

  // 🔄 Reset table to clean state
  resetTableToCleanState() {
    try {
      const tableBody = document.querySelector("#stockTable tbody");
      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="9" class="text-center">Terjadi kesalahan saat memuat data</td>
          </tr>
        `;
      }

      if (!$.fn.DataTable.isDataTable("#stockTable")) {
        this.initializeEmptyDataTable();
      }
    } catch (error) {
      console.warn("Error resetting table:", error);
    }
  },

  // 🔧 Utility functions
  formatDate(date) {
    if (!date) return "";
    try {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return "";
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (error) {
      console.error("Error formatting date:", error);
      return "";
    }
  },

  parseDate(dateString) {
    if (!dateString) return null;
    const parts = dateString.split("/");
    return new Date(parts[2], parts[1] - 1, parts[0]);
  },

  formatRupiah(angka) {
    if (!angka && angka !== 0) return "0";
    const number = typeof angka === "string" ? parseInt(angka) : angka;
    return new Intl.NumberFormat("id-ID").format(number);
  },

  // 🔔 Show loading indicator with enhanced UI
  showLoading(isLoading) {
    let loadingIndicator = document.getElementById("smartLoadingIndicator");
    
    if (isLoading && !loadingIndicator) {
      loadingIndicator = document.createElement("div");
      loadingIndicator.id = "smartLoadingIndicator";
      loadingIndicator.className = "position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center";
      loadingIndicator.style.cssText = "background: rgba(0,0,0,0.5); z-index: 9999;";
      loadingIndicator.innerHTML = `
        <div class="bg-white rounded p-4 text-center shadow">
          <div class="spinner-border text-primary mb-3" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <div class="fw-bold">Memuat Data Stok...</div>
          <div class="text-muted small">Mohon tunggu sebentar</div>
        </div>
      `;
      document.body.appendChild(loadingIndicator);
    }
    
    if (loadingIndicator) {
      loadingIndicator.style.display = isLoading ? "flex" : "none";
      if (!isLoading && loadingIndicator.parentNode) {
        loadingIndicator.remove();
      }
    }
  },

  // ❌ Show error message with enhanced UI
  showError(message) {
    if (typeof Swal !== "undefined") {
      Swal.fire({
        icon: "error",
        title: "Terjadi Kesalahan!",
        html: message,
        confirmButtonColor: "#dc3545",
        confirmButtonText: "Tutup",
        showClass: {
          popup: "animate__animated animate__shakeX",
        },
        customClass: {
          popup: 'swal-error-popup'
        }
      });
    } else {
      // Fallback to custom modal
      this.showCustomAlert(message, "error");
    }
  },

  // ✅ Show success message with enhanced UI
  showSuccess(message) {
    if (typeof Swal !== "undefined") {
      Swal.fire({
        icon: "success",
        title: "Berhasil!",
        html: message,
        confirmButtonColor: "#28a745",
        confirmButtonText: "OK",
        timer: 3000,
        timerProgressBar: true,
        showClass: {
          popup: "animate__animated animate__fadeInDown",
        },
        hideClass: {
          popup: "animate__animated animate__fadeOutUp",
        },
        customClass: {
          popup: 'swal-success-popup'
        }
      });
    } else {
      this.showCustomAlert(message, "success");
    }
  },

  // ℹ️ Show info message
  showInfo(message, title = "Informasi") {
    if (typeof Swal !== "undefined") {
      Swal.fire({
        icon: "info",
        title: title,
        html: message,
        confirmButtonColor: "#0d6efd",
        confirmButtonText: "OK",
        customClass: {
          popup: 'swal-info-popup'
        }
      });
    } else {
      this.showCustomAlert(message, "info");
    }
  },

  // 🎨 Show custom alert (fallback)
  showCustomAlert(message, type = "info") {
    const alertDiv = document.createElement("div");
    alertDiv.className = `alert alert-${type === "error" ? "danger" : type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = "top: 20px; right: 20px; z-index: 9999; max-width: 400px;";
    
    const iconClass = type === "error" ? "fas fa-exclamation-circle" : 
                     type === "success" ? "fas fa-check-circle" : "fas fa-info-circle";
    
    alertDiv.innerHTML = `
      <i class="${iconClass} me-2"></i>
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      if (alertDiv.parentNode) {
        alertDiv.remove();
      }
    }, 5000);
  },

  // 🧹 Cleanup and destroy
  destroy() {
    console.log("🧹 Destroying Smart Stock Report Handler");
    
    // Destroy cache manager
    if (this.cacheManager) {
      this.cacheManager.destroy();
    }
    
    // Destroy DataTable
    if ($.fn.DataTable.isDataTable("#stockTable")) {
      $("#stockTable").DataTable().destroy();
    }
    
    // Remove custom styles
    const customStyle = document.getElementById("smartStockTableStyle");
    if (customStyle) {
      customStyle.remove();
    }
    
    // Remove indicators
    const cacheIndicator = document.getElementById("smartStockCacheIndicator");
    if (cacheIndicator) {
      cacheIndicator.remove();
    }
    
    const loadingIndicator = document.getElementById("smartLoadingIndicator");
    if (loadingIndicator) {
      loadingIndicator.remove();
    }
    
    // Clear data
    this.stockData = [];
    this.filteredStockData = [];
    this.isInitialized = false;
    
    console.log("✅ Smart Stock Report Handler destroyed");
  }
};

// 🚀 Performance Monitor
class StockPerformanceMonitor {
  constructor() {
    this.metrics = {
      loadTimes: [],
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      lastUpdate: null
    };
  }

  // 📊 Record load time
  recordLoadTime(startTime, endTime, source = 'unknown') {
    const loadTime = endTime - startTime;
    this.metrics.loadTimes.push({
      duration: loadTime,
      source: source,
      timestamp: new Date()
    });
    
    // Keep only last 50 records
    if (this.metrics.loadTimes.length > 50) {
      this.metrics.loadTimes.shift();
    }
    
    console.log(`⏱️ Load time: ${loadTime}ms (${source})`);
  }

  // 🎯 Record cache hit
  recordCacheHit() {
    this.metrics.cacheHits++;
  }

  // ❌ Record cache miss
  recordCacheMiss() {
    this.metrics.cacheMisses++;
  }

  // 🚨 Record error
  recordError(error) {
    this.metrics.errors++;
    console.error("📊 Performance Monitor - Error recorded:", error);
  }

  // 📈 Get performance stats
  getStats() {
    const totalRequests = this.metrics.cacheHits + this.metrics.cacheMisses;
    const cacheHitRate = totalRequests > 0 ? (this.metrics.cacheHits / totalRequests * 100).toFixed(2) : 0;
    
    const avgLoadTime = this.metrics.loadTimes.length > 0 
      ? (this.metrics.loadTimes.reduce((sum, record) => sum + record.duration, 0) / this.metrics.loadTimes.length).toFixed(2)
      : 0;

    return {
      cacheHitRate: `${cacheHitRate}%`,
      averageLoadTime: `${avgLoadTime}ms`,
      totalRequests: totalRequests,
      errors: this.metrics.errors,
      lastUpdate: this.metrics.lastUpdate
    };
  }

  // 🖨️ Print performance report
  printReport() {
    const stats = this.getStats();
    console.group("📊 Stock Performance Report");
    console.log("Cache Hit Rate:", stats.cacheHitRate);
    console.log("Average Load Time:", stats.averageLoadTime);
    console.log("Total Requests:", stats.totalRequests);
    console.log("Errors:", stats.errors);
    console.log("Last Update:", stats.lastUpdate);
    console.groupEnd();
  }
}

// 🎯 Initialize performance monitor
const stockPerformanceMonitor = new StockPerformanceMonitor();

// 🔧 Enhanced initialization with error handling
function initializeSmartStockReport() {
  try {
    console.log("🚀 Initializing Smart Stock Report System");
    
    // Check dependencies
    if (typeof firestore === 'undefined') {
      throw new Error("Firebase Firestore not initialized");
    }
    
    if (typeof $ === 'undefined') {
      throw new Error("jQuery not loaded");
    }
    
    // Initialize the smart handler
    smartLaporanStokHandler.init();
    
    // Add performance monitoring
    window.stockPerformanceMonitor = stockPerformanceMonitor;
    
    // Add global error handler
    window.addEventListener('error', (event) => {
      if (event.filename && event.filename.includes('laporanStok')) {
        stockPerformanceMonitor.recordError(event.error);
      }
    });
    
    // Add unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      stockPerformanceMonitor.recordError(event.reason);
    });
    
    console.log("✅ Smart Stock Report System initialized successfully");
    
    // Show initialization success
    setTimeout(() => {
      smartLaporanStokHandler.showInfo(
        "Sistem laporan stok telah diinisialisasi dengan fitur cache pintar dan real-time update",
        "Sistem Siap"
      );
    }, 1000);
    
  } catch (error) {
    console.error("❌ Failed to initialize Smart Stock Report System:", error);
    
    // Fallback to original handler
    console.log("🔄 Falling back to original stock report handler");
    if (typeof laporanStokHandler !== 'undefined') {
      laporanStokHandler.init();
    }
  }
}

// 🎯 Auto-initialize when DOM is ready
document.addEventListener("DOMContentLoaded", function () {
  // Add small delay to ensure all dependencies are loaded
  setTimeout(initializeSmartStockReport, 100);
});

// 🔧 Add keyboard shortcuts
document.addEventListener('keydown', function(event) {
  // Ctrl+R or F5 - Refresh data
  if ((event.ctrlKey && event.key === 'r') || event.key === 'F5') {
    if (smartLaporanStokHandler.isInitialized) {
      event.preventDefault();
      smartLaporanStokHandler.forceRefreshData();
    }
  }
  
  // Ctrl+P - Print
  if (event.ctrlKey && event.key === 'p') {
    if (smartLaporanStokHandler.isInitialized && smartLaporanStokHandler.filteredStockData.length > 0) {
      event.preventDefault();
      window.print();
    }
  }
  
  // F12 - Show performance stats
  if (event.key === 'F12' && event.shiftKey) {
    event.preventDefault();
    stockPerformanceMonitor.printReport();
  }
});

// 🌐 Export for potential use in other modules
export { 
  smartLaporanStokHandler as default, 
  SmartStockCacheManager, 
  IncrementalStockLoader,
  StockPerformanceMonitor,
  stockPerformanceMonitor
};

// 🔄 Backward compatibility
window.smartLaporanStokHandler = smartLaporanStokHandler;
window.stockPerformanceMonitor = stockPerformanceMonitor;

console.log("📦 Smart Stock Report Module loaded successfully");




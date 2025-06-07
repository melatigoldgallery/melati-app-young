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
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";
import { firestore } from "./configFirebase.js";

// 📦 Caching Logic for Stock Report Module - UPDATED
const CACHE_KEY_STOCK = 'cachedStockData';
const CACHE_EXPIRATION_STOCK = 5 * 60 * 1000; // 5 minutes
const CACHE_TTL_STANDARD = 60 * 60 * 1000; // 1 hour
const CACHE_TTL_TODAY = 5 * 60 * 1000; // 5 minutes for today's data

// NEW: Cache strategy constants
const CACHE_TTL_TODAY_DATA = 0; // Data hari ini tidak di-cache, selalu fresh
const CACHE_TTL_MASTER_DATA = 24 * 60 * 60 * 1000; // Master data cache 24 jam
const CACHE_TTL_SNAPSHOT = 24 * 60 * 60 * 1000; // Snapshot cache 24 jam

// Stock cache management
const stockCache = new Map();
const stockCacheMeta = new Map();

// Save stock cache to localStorage
function saveStockCacheToStorage() {
  try {
    const cacheData = {};
    const metaData = {};
    
    stockCache.forEach((value, key) => {
      cacheData[key] = value;
    });
    
    stockCacheMeta.forEach((value, key) => {
      metaData[key] = value;
    });
    
    localStorage.setItem('stockCache', JSON.stringify(cacheData));
    localStorage.setItem('stockCacheMeta', JSON.stringify(metaData));
  } catch (error) {
    console.warn('Failed to save stock cache to localStorage:', error);
  }
}

// Load stock cache from localStorage
function loadStockCacheFromStorage() {
  try {
    const cacheData = localStorage.getItem('stockCache');
    const metaData = localStorage.getItem('stockCacheMeta');
    
    if (cacheData) {
      const parsed = JSON.parse(cacheData);
      Object.entries(parsed).forEach(([key, value]) => {
        stockCache.set(key, value);
      });
    }
    
    if (metaData) {
      const parsed = JSON.parse(metaData);
      Object.entries(parsed).forEach(([key, value]) => {
        stockCacheMeta.set(key, value);
      });
    }
  } catch (error) {
    console.warn('Failed to load stock cache from localStorage:', error);
  }
}

// Check if cache should be updated
function shouldUpdateStockCache(cacheKey) {
  const timestamp = stockCacheMeta.get(cacheKey);
  if (!timestamp) return true;
  
  const now = Date.now();
  const lastUpdate = parseInt(timestamp);
  
  // If cache key includes today, use shorter TTL
  const today = getLocalDateString();
  if (cacheKey.includes(today)) {
    return (now - lastUpdate) > CACHE_TTL_TODAY;
  }
  
  // For historical data, use standard TTL
  return (now - lastUpdate) > CACHE_TTL_STANDARD;
}

// Update cache timestamp
function updateStockCacheTimestamp(cacheKey) {
  stockCacheMeta.set(cacheKey, Date.now());
  saveStockCacheToStorage();
}

// Get local date string
function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

function formatDate(date) {
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

// Main handler object
const laporanStokHandler = {
  // Data properties
  stockData: [],
  filteredStockData: [],
  transactionCache: new Map(),
  lastTransactionUpdate: 0,

  // MODIFIED: Initialize the module with auto-load
  init() {
    // Load cache from localStorage
    loadStockCacheFromStorage();
    
    this.initDatePickers();
    this.attachEventListeners();
    this.setDefaultDates();
    this.initDataTable();
    
    // NEW: Auto-load data hari ini saat halaman dibuka
    this.autoLoadTodayData();
    
    // NEW: Setup auto-refresh saat focus kembali ke tab
    this.setupFocusRefresh();
    
    // Clean up cache periodically dengan strategi baru
    setInterval(() => {
      this.cleanupCacheSmart();
    }, 5 * 60 * 1000); // Clean up every 5 minutes
  },

  // NEW: Method untuk auto-load data hari ini
  async autoLoadTodayData() {
    try {
      console.log("🚀 Auto-loading today's data...");
      this.showLoading(true);
      
      // Set tanggal hari ini
      const today = new Date();
      document.getElementById("startDate").value = formatDate(today);
      
      // Load data hari ini dengan strategi cache yang tepat
      await this.loadTodayDataSmart();
      
      this.showLoading(false);
      console.log("✅ Today's data loaded successfully");
      
    } catch (error) {
      console.error("❌ Error auto-loading today's data:", error);
      this.showLoading(false);
      this.prepareEmptyTable();
      // Jangan tampilkan error ke user, biarkan mereka klik manual jika perlu
    }
  },

  // NEW: Smart loading untuk data hari ini
  async loadTodayDataSmart() {
    const today = new Date();
    
    // Load master data dengan cache 24 jam (efisien)
    await this.loadMasterDataCached();
    
    // Load data hari ini tanpa cache (selalu fresh)
    await this.calculateDailyContinuityFresh(today);
    
    // Render table
    this.renderStockTable();
    
    // Show fresh data indicator
    this.showFreshDataIndicator();
  },

  // NEW: Load master data dengan cache 24 jam
  async loadMasterDataCached() {
    const masterDataCacheKey = 'stockMasterData';
    const kodeAksesorisCacheKey = 'kodeAksesorisData';
    
    // Check cache dengan TTL 24 jam untuk master data
    const shouldRefreshMaster = !stockCache.has(masterDataCacheKey) || 
      this.shouldUpdateMasterCache(masterDataCacheKey);
    const shouldRefreshKode = !stockCache.has(kodeAksesorisCacheKey) || 
      this.shouldUpdateMasterCache(kodeAksesorisCacheKey);
    
    if (!shouldRefreshMaster && !shouldRefreshKode) {
      console.log("📦 Using cached master data (24h cache)");
      this.stockData = stockCache.get(masterDataCacheKey) || [];
      
      // Merge dengan kode aksesoris
      const cachedKodeData = stockCache.get(kodeAksesorisCacheKey) || [];
      cachedKodeData.forEach(item => {
        const existingIndex = this.stockData.findIndex(stockItem => stockItem.kode === item.kode);
        if (existingIndex === -1) {
          this.stockData.push(item);
        } else {
          this.stockData[existingIndex].kategori = item.kategori;
        }
      });
      return;
    }
    
    // Load fresh master data jika cache expired
    console.log("🔄 Loading fresh master data...");
    await this.loadStockDataFresh();
  },

  // NEW: Check master data cache dengan TTL 24 jam
  shouldUpdateMasterCache(cacheKey) {
    const timestamp = stockCacheMeta.get(cacheKey);
    if (!timestamp) return true;
    
    const now = Date.now();
    const lastUpdate = parseInt(timestamp);
    
    return (now - lastUpdate) > CACHE_TTL_MASTER_DATA;
  },

  // NEW: Load stock data fresh (untuk master data)
  async loadStockDataFresh() {
    try {
      // Load current stock
      const stockSnapshot = await getDocs(collection(firestore, "stokAksesoris"));
      this.stockData = [];

      stockSnapshot.forEach((doc) => {
        this.stockData.push({ id: doc.id, ...doc.data() });
      });

      // Load all kode aksesoris for complete list
      await this.loadAllKodeAksesorisFresh();

      // Cache master data dengan TTL 24 jam
      stockCache.set('stockMasterData', [...this.stockData]);
      stockCacheMeta.set('stockMasterData', Date.now());
      saveStockCacheToStorage();

      console.log(`📦 Loaded ${this.stockData.length} stock items (cached for 24h)`);
    } catch (error) {
      console.error("Error loading fresh stock data:", error);
      
      // Try to use cache as fallback
      if (stockCache.has('stockMasterData')) {
        console.log("Using cached stock master data as fallback");
        this.stockData = stockCache.get('stockMasterData');
      } else {
        throw error;
      }
    }
  },

  // NEW: Load all kode aksesoris fresh
  async loadAllKodeAksesorisFresh() {
    try {
      const kodeAksesorisData = [];
      
      // Get kotak data
      const kotakSnapshot = await getDocs(collection(firestore, "kodeAksesoris", "kategori", "kotak"));

      // Get aksesoris data
      const aksesorisSnapshot = await getDocs(collection(firestore, "kodeAksesoris", "kategori", "aksesoris"));

      // Process kotak data
      kotakSnapshot.forEach((doc) => {
        const data = doc.data();
        const existingIndex = this.stockData.findIndex((item) => item.kode === data.text);

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

        if (existingIndex === -1) {
          this.stockData.push(kodeItem);
        } else {
          this.stockData[existingIndex].kategori = "kotak";
        }
        
        kodeAksesorisData.push(kodeItem);
      });

      // Process aksesoris data
      aksesorisSnapshot.forEach((doc) => {
        const data = doc.data();
        const existingIndex = this.stockData.findIndex((item) => item.kode === data.text);

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

        if (existingIndex === -1) {
          this.stockData.push(kodeItem);
        } else {
          this.stockData[existingIndex].kategori = "aksesoris";
        }
        
        kodeAksesorisData.push(kodeItem);
      });
      
      // Cache kode aksesoris data dengan TTL 24 jam
      stockCache.set('kodeAksesorisData', kodeAksesorisData);
      stockCacheMeta.set('kodeAksesorisData', Date.now());
      saveStockCacheToStorage();
      
    } catch (error) {
      console.error("Error loading fresh kode aksesoris:", error);
      
      // Try to use cache as fallback
      if (stockCache.has('kodeAksesorisData')) {
        console.log("Using cached kode aksesoris data as fallback");
        const cachedKodeData = stockCache.get('kodeAksesorisData');
        
        cachedKodeData.forEach(item => {
          const existingIndex = this.stockData.findIndex(stockItem => stockItem.kode === item.kode);
          if (existingIndex === -1) {
            this.stockData.push(item);
          } else {
            this.stockData[existingIndex].kategori = item.kategori;
          }
        });
      } else {
        throw error;
      }
    }
  },

  // NEW: Calculate daily continuity tanpa cache untuk data hari ini
  async calculateDailyContinuityFresh(selectedDate) {
    try {
      console.log(`🔄 Loading FRESH data for: ${formatDate(selectedDate)}`);
      
      // 1. Hitung stok akhir sampai hari sebelumnya (gunakan cache untuk snapshot)
      const previousDate = new Date(selectedDate);
      previousDate.setDate(previousDate.getDate() - 1);
      previousDate.setHours(23, 59, 59, 999);

      const baseSnapshot = await this.getSnapshotAsBaseCached(selectedDate);
      const previousStockMap = await this.calculateStockFromBaseCached(baseSnapshot, previousDate, selectedDate);

      // 2. Hitung transaksi hari ini TANPA CACHE (selalu fresh)
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
            endOfDay.setHours(23, 59, 59, 999);

      const todayTransactions = await this.getTransactionsForDateFresh(startOfDay, endOfDay);

      // 3. Gabungkan hasil
      this.filteredStockData = this.stockData.map((item) => {
        const kode = item.kode;
        const stokAwal = previousStockMap.get(kode) || 0;
        const todayTrans = todayTransactions.get(kode) || {
          tambahStok: 0,
          laku: 0,
          free: 0,
          gantiLock: 0,
        };

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

      // Tambahkan item yang ada di transaksi tapi tidak di master
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

      console.log(`✅ Fresh daily data calculated: ${this.filteredStockData.length} items`);
    } catch (error) {
      console.error("Error calculating fresh daily continuity:", error);
      throw error;
    }
  },

  // NEW: Get snapshot dengan cache 24 jam
  async getSnapshotAsBaseCached(selectedDate) {
    const snapshotCacheKey = `snapshot_${formatDate(selectedDate).replace(/\//g, '-')}`;
    
    // Check cache dengan TTL 24 jam untuk snapshot
    if (stockCache.has(snapshotCacheKey) && !this.shouldUpdateSnapshotCache(snapshotCacheKey)) {
      console.log(`📦 Using cached snapshot data for ${formatDate(selectedDate)}`);
      return stockCache.get(snapshotCacheKey);
    }
    
    // Load fresh snapshot
    const snapshot = await this.getSnapshotAsBase(selectedDate);
    
    // Cache dengan TTL 24 jam
    stockCache.set(snapshotCacheKey, snapshot);
    stockCacheMeta.set(snapshotCacheKey, Date.now());
    saveStockCacheToStorage();
    
    return snapshot;
  },

  // NEW: Check snapshot cache dengan TTL 24 jam
  shouldUpdateSnapshotCache(cacheKey) {
    const timestamp = stockCacheMeta.get(cacheKey);
    if (!timestamp) return true;
    
    const now = Date.now();
    const lastUpdate = parseInt(timestamp);
    
    return (now - lastUpdate) > CACHE_TTL_SNAPSHOT;
  },

  // NEW: Calculate stock from base dengan cache
  async calculateStockFromBaseCached(baseSnapshot, endDate, selectedDate) {
    const cacheKey = `stockFromBase_${formatDate(endDate).replace(/\//g, '-')}`;
    
    // Check cache untuk historical calculation
    if (stockCache.has(cacheKey) && !this.shouldUpdateSnapshotCache(cacheKey)) {
      console.log(`📦 Using cached stock calculation for ${formatDate(endDate)}`);
      return stockCache.get(cacheKey);
    }
    
    // Calculate fresh
    const stockMap = await this.calculateStockFromBase(baseSnapshot, endDate, selectedDate);
    
    // Cache hasil
    stockCache.set(cacheKey, stockMap);
    stockCacheMeta.set(cacheKey, Date.now());
    saveStockCacheToStorage();
    
    return stockMap;
  },

  // NEW: Get transactions tanpa cache untuk data hari ini
  async getTransactionsForDateFresh(startDate, endDate) {
    const transactionMap = new Map();
    
    console.log(`🔄 Loading FRESH transactions for ${formatDate(startDate)} - ${formatDate(endDate)}`);

    try {
      // Get stock transactions (FRESH - no cache)
      const transQuery = query(
        collection(firestore, "stokAksesorisTransaksi"),
        where("timestamp", ">=", Timestamp.fromDate(startDate)),
        where("timestamp", "<=", Timestamp.fromDate(endDate))
      );

      const transSnapshot = await getDocs(transQuery);

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

      // Get stock additions (FRESH - no cache)
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

      console.log(`✅ Fresh transactions loaded: ${transactionMap.size} items`);
      return transactionMap;
    } catch (error) {
      console.error("Error getting fresh transactions:", error);
      return new Map();
    }
  },

  // NEW: Setup auto-refresh saat focus kembali ke tab
  setupFocusRefresh() {
    let isHidden = false;
    
    // Detect when tab becomes hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        isHidden = true;
      } else if (isHidden) {
        // Tab menjadi visible lagi, refresh data hari ini
        isHidden = false;
        console.log("👁️ Tab visible again, refreshing today's data...");
        this.refreshTodayDataQuietly();
      }
    });
    
    // Detect window focus
    window.addEventListener('focus', () => {
      if (isHidden) {
        console.log("🎯 Window focused, refreshing today's data...");
        this.refreshTodayDataQuietly();
        isHidden = false;
      }
    });
  },

  // NEW: Refresh data hari ini secara quiet (tanpa loading indicator)
  async refreshTodayDataQuietly() {
    try {
      const startDateStr = document.getElementById("startDate").value;
      if (!startDateStr) return;
      
      const selectedDate = parseDate(startDateStr);
      const today = getLocalDateString();
      const selectedDateStr = formatDate(selectedDate).replace(/\//g, '-');
      
      // Hanya refresh jika yang ditampilkan adalah data hari ini
      if (selectedDateStr === today.replace(/-/g, '-')) {
        await this.loadTodayDataSmart();
        this.showQuietRefreshIndicator();
      }
    } catch (error) {
      console.warn("Error in quiet refresh:", error);
    }
  },

  // NEW: Show indicator untuk quiet refresh
  showQuietRefreshIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'alert alert-success alert-dismissible fade show position-fixed';
    indicator.style.cssText = `
      top: 20px;
      right: 20px;
      z-index: 1050;
      min-width: 300px;
      opacity: 0.9;
    `;
    indicator.innerHTML = `
      <i class="fas fa-sync-alt me-2"></i>
      Data hari ini telah diperbarui
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(indicator);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.remove();
      }
    }, 3000);
  },

  // NEW: Show fresh data indicator
  showFreshDataIndicator() {
    let indicator = document.getElementById('freshDataIndicator');
    
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'freshDataIndicator';
      indicator.className = 'alert alert-success mb-2';
      
      const tableContainer = document.querySelector('#stockTable').parentElement;
      tableContainer.insertBefore(indicator, tableContainer.firstChild);
    }
    
    const now = new Date();
    const timeText = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    indicator.innerHTML = `
      <i class="fas fa-check-circle me-2"></i>
      Data terbaru hari ini (diperbarui: ${timeText})
    `;
    indicator.style.display = 'block';
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

  // Set default dates (current date)
  setDefaultDates() {
    const today = new Date();
    document.getElementById("startDate").value = formatDate(today);
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
          exportOptions: {
            columns: ":visible",
          },
          title: "Laporan Stok",
        },
        {
          extend: "pdf",
          text: '<i class="fas fa-file-pdf me-2"></i>PDF',
          className: "btn btn-danger btn-sm me-1",
          exportOptions: {
            columns: ":visible",
          },
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
    
    // MODIFIED: Smart refresh button
    const refreshBtn = document.getElementById("refreshStockBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        this.smartRefreshData();
      });
    }
  },

  // Reset filters
  resetFilters() {
    const today = new Date();
    document.getElementById("startDate").value = formatDate(today);
    this.autoLoadTodayData(); // Load today's data after reset
  },

  // NEW: Smart refresh - hanya refresh data yang sedang ditampilkan
  async smartRefreshData() {
    try {
      this.showLoading(true);
      
      const startDateStr = document.getElementById("startDate").value;
      if (!startDateStr) {
        this.showError("Pilih tanggal terlebih dahulu");
        this.showLoading(false);
        return;
      }

      const today = getLocalDateString();
      const selectedDateStr = formatDate(selectedDate).replace(/\//g, '-');
      
      // Jika data hari ini, hanya refresh data hari ini
      if (selectedDateStr === today.replace(/-/g, '-')) {
        console.log("🔄 Smart refresh: Today's data only...");
        
        // Clear cache untuk data hari ini saja
        const todayKeys = Array.from(stockCache.keys()).filter(key => 
          key.includes(today.replace(/-/g, '-')) || key.includes('trans_')
        );
        
        todayKeys.forEach(key => {
          stockCache.delete(key);
          stockCacheMeta.delete(key);
        });
        
        await this.loadTodayDataSmart();
        this.showSuccess("Data hari ini berhasil diperbarui");
        
      } else {
        // Untuk data historis, gunakan method lama dengan cache terbatas
        console.log("🔄 Smart refresh: Historical data...");
        
        // Clear cache untuk tanggal yang dipilih saja
        const dateKeys = Array.from(stockCache.keys()).filter(key => 
          key.includes(selectedDateStr)
        );
        
        dateKeys.forEach(key => {
          stockCache.delete(key);
          stockCacheMeta.delete(key);
        });
        
        await this.loadAndFilterStockDataHistorical(selectedDate);
        this.showSuccess("Data berhasil diperbarui");
      }
      
    } catch (error) {
      console.error("Error in smart refresh:", error);
      this.showError("Gagal memperbarui data: " + error.message);
    } finally {
      this.showLoading(false);
    }
  },

  // NEW: Load historical data dengan cache
  async loadAndFilterStockDataHistorical(selectedDate) {
    try {
      // Load master data dengan cache
      await this.loadMasterDataCached();
      
      // Calculate dengan cache untuk data historis
      await this.calculateDailyContinuity(selectedDate);
      
      this.renderStockTable();
      
    } catch (error) {
      console.error("Error loading historical data:", error);
      
      // Try fallback dengan cache
      const dateStr = formatDate(selectedDate).replace(/\//g, '-');
      const cacheKey = `stock_${dateStr}`;
      
      if (stockCache.has(cacheKey)) {
        console.log("Using cached stock data as fallback due to error");
        this.filteredStockData = stockCache.get(cacheKey);
        this.renderStockTable();
        this.showError("Terjadi kesalahan saat mengambil data terbaru. Menggunakan data cache.");
        this.showCacheIndicator(true, 'fallback');
      } else {
        throw error;
      }
    }
  },

  // MODIFIED: Load and filter stock data dengan deteksi hari ini
  async loadAndFilterStockData(forceRefresh = false) {
    try {
      this.showLoading(true);

      const startDateStr = document.getElementById("startDate").value;

      if (!startDateStr) {
        this.showError("Tanggal harus diisi");
        this.showLoading(false);
        return;
      }

      const selectedDate = parseDate(startDateStr);
      if (!selectedDate) {
        this.showError("Format tanggal tidak valid");
        this.showLoading(false);
        return;
      }

      const today = getLocalDateString();
      const selectedDateStr = formatDate(selectedDate).replace(/\//g, '-');
      const isToday = selectedDateStr === today.replace(/-/g, '-');
      
      if (isToday) {
        // Untuk data hari ini, gunakan method yang lebih efisien
        console.log("📅 Loading today's data with smart caching...");
        await this.loadTodayDataSmart();
      } else {
        // Untuk data historis, gunakan method dengan cache
        console.log("📅 Loading historical data with cache...");
        await this.loadAndFilterStockDataHistorical(selectedDate);
      }

      this.showLoading(false);
    } catch (error) {
      console.error("Error loading stock data:", error);
      
      // Try fallback dengan cache
      const startDateStr = document.getElementById("startDate").value;
      const selectedDate = parseDate(startDateStr);
      const dateStr = formatDate(selectedDate).replace(/\//g, '-');
      const cacheKey = `stock_${dateStr}`;
      
      if (stockCache.has(cacheKey)) {
        console.log("Using cached stock data as fallback due to error");
        this.filteredStockData = stockCache.get(cacheKey);
        this.renderStockTable();
        this.showError("Terjadi kesalahan saat mengambil data terbaru. Menggunakan data cache.");
        this.showCacheIndicator(true, 'fallback');
      } else {
        this.showError("Terjadi kesalahan saat memuat data: " + error.message);
      }
      
      this.showLoading(false);
    }
  },

  // EXISTING: Calculate daily continuity (untuk data historis dengan cache)
  async calculateDailyContinuity(selectedDate) {
    try {
      // Create cache key
      const dateStr = formatDate(selectedDate).replace(/\//g, '-');
      const cacheKey = `stock_${dateStr}`;
      
      // Check if we should use cache (untuk data historis)
      const includesCurrentDay = dateStr === getLocalDateString().replace(/-/g, '-');
      const shouldRefresh = includesCurrentDay || !stockCache.has(cacheKey) || shouldUpdateStockCache(cacheKey);
      
      if (!shouldRefresh) {
        console.log(`Using cached stock data for ${dateStr}`);
        this.filteredStockData = stockCache.get(cacheKey);
        
        // Show cache indicator
        this.showCacheIndicator(true);
        return;
      }
      
      // Hide cache indicator
      this.showCacheIndicator(false);
      
      // 1. Hitung stok akhir sampai hari sebelumnya menggunakan sistem prioritas
      const previousDate = new Date(selectedDate);
      previousDate.setDate(previousDate.getDate() - 1);
      previousDate.setHours(23, 59, 59, 999);

      // Gunakan sistem prioritas snapshot dengan cache
      const baseSnapshot = await this.getSnapshotAsBaseCached(selectedDate);
      const previousStockMap = await this.calculateStockFromBaseCached(baseSnapshot, previousDate, selectedDate);

      // 2. Hitung transaksi hari ini dengan cache untuk data historis
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      const todayTransactions = await this.getTransactionsForDate(startOfDay, endOfDay);

      // 3. Gabungkan: stokAwal (dari snapshot/kalkulasi) + transaksi hari ini = stokAkhir
      this.filteredStockData = this.stockData.map((item) => {
        const kode = item.kode;

        // Stok awal = stok akhir kemarin (dari snapshot atau kalkulasi)
        const stokAwal = previousStockMap.get(kode) || 0;

        // Transaksi hari ini
        const todayTrans = todayTransactions.get(kode) || {
          tambahStok: 0,
          laku: 0,
          free: 0,
          gantiLock: 0,
        };

        // Stok akhir = stok awal + tambah - keluar
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

      // Tambahkan item yang ada di transaksi tapi tidak di master
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

      // Save to cache (hanya untuk data historis)
      if (!includesCurrentDay) {
        stockCache.set(cacheKey, [...this.filteredStockData]);
        updateStockCacheTimestamp(cacheKey);
      }

      console.log(`✅ Daily continuity calculated: ${this.filteredStockData.length} items`);
    } catch (error) {
      console.error("Error calculating daily continuity:", error);
      
      // Try to use cache as fallback
      const dateStr = formatDate(selectedDate).replace(/\//g, '-');
      const cacheKey = `stock_${dateStr}`;
      
      if (stockCache.has(cacheKey)) {
        console.log("Using cached data as fallback due to error");
        this.filteredStockData = stockCache.get(cacheKey);
        this.showError("Terjadi kesalahan saat mengambil data terbaru. Menggunakan data cache.");
        this.showCacheIndicator(true, 'fallback');
      } else {
        throw error;
      }
    }
  },

  // Show/hide cache indicator
  showCacheIndicator(show, type = 'normal') {
    let indicator = document.getElementById('stockCacheIndicator');
    
    if (show && !indicator) {
      // Create indicator if it doesn't exist
      indicator = document.createElement('div');
      indicator.id = 'stockCacheIndicator';
      indicator.className = 'alert alert-info mb-2';
      
      const tableContainer = document.querySelector('#stockTable').parentElement;
      tableContainer.insertBefore(indicator, tableContainer.firstChild);
    }
    
    if (indicator) {
      if (show) {
        const now = new Date();
        const timeText = now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit'
        });
        
        if (type === 'fallback') {
          indicator.innerHTML = '<i class="fas fa-database me-2"></i>Menggunakan data cache (fallback)';
          indicator.className = 'alert alert-warning mb-2';
        } else {
          indicator.innerHTML = `<i class="fas fa-database me-2"></i>Menggunakan data cache (${timeText})`;
          indicator.className = 'alert alert-info mb-2';
        }
        indicator.style.display = 'block';
      } else {
        indicator.style.display = 'none';
      }
    }
  },

  // EXISTING: Fungsi helper: Hitung stok dari base snapshot
  async calculateStockFromBase(baseSnapshot, endDate, selectedDate) {
    const stockMap = new Map();

    try {
      // Inisialisasi dengan base snapshot
      baseSnapshot.forEach((data, kode) => {
        stockMap.set(kode, data.stokAwal || 0);
      });

      // Inisialisasi item yang tidak ada di snapshot
      this.stockData.forEach((item) => {
        if (!stockMap.has(item.kode)) {
          stockMap.set(item.kode, 0);
        }
      });

      // Tentukan start date untuk kalkulasi transaksi
      let startDate;

      if (baseSnapshot.size > 0) {
        // Jika ada snapshot, hitung dari hari setelah snapshot
        const snapshotDate = new Date(selectedDate);
        snapshotDate.setDate(snapshotDate.getDate() - 1);
        startDate = new Date(snapshotDate);
        startDate.setHours(0, 0, 0, 0);
      } else {
        // Jika tidak ada snapshot, hitung dari awal bulan
        startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
      }

      // Hitung transaksi dari start date sampai end date
      if (startDate <= endDate) {
        const transactions = await this.getTransactionsForDate(startDate, endDate);

        // Apply transaksi ke stok
        transactions.forEach((trans, kode) => {
          const currentStock = stockMap.get(kode) || 0;
          const newStock = Math.max(0, currentStock + trans.tambahStok - trans.laku - trans.free - trans.gantiLock);
          stockMap.set(kode, newStock);
        });
      }

      console.log(`📈 Stock calculated from base until ${formatDate(endDate)}: ${stockMap.size} items`);
      return stockMap;
    } catch (error) {
      console.error("Error calculating stock from base:", error);
      return stockMap;
    }
  },

  // EXISTING: Method helper: Dapatkan transaksi untuk rentang tanggal dengan cache
  async getTransactionsForDate(startDate, endDate) {
    const transactionMap = new Map();
    
    // Create cache key for transactions
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    const transCacheKey = `trans_${startDateStr}_${endDateStr}`;
    
    // Check cache first
    if (stockCache.has(transCacheKey) && !shouldUpdateStockCache(transCacheKey)) {
      console.log(`Using cached transaction data for ${startDateStr} to ${endDateStr}`);
      return stockCache.get(transCacheKey);
    }

    try {
      // Get stock transactions
      const transQuery = query(
        collection(firestore, "stokAksesorisTransaksi"),
        where("timestamp", ">=", Timestamp.fromDate(startDate)),
        where("timestamp", "<=", Timestamp.fromDate(endDate))
      );

      const transSnapshot = await getDocs(transQuery);

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
      stockCache.set(transCacheKey, transactionMap);
      updateStockCacheTimestamp(transCacheKey);

      const dateRange =
        startDate.toDateString() === endDate.toDateString()
          ? formatDate(startDate)
          : `${formatDate(startDate)} - ${formatDate(endDate)}`;

      console.log(`📋 Transactions for ${dateRange}: ${transactionMap.size} items`);
      return transactionMap;
    } catch (error) {
      console.error("Error getting transactions for date:", error);
      
      // Try to use cached data as fallback
      if (stockCache.has(transCacheKey)) {
        console.log("Using cached transaction data as fallback");
        return stockCache.get(transCacheKey);
      }
      
      return new Map();
    }
  },

  // EXISTING: Load stock data with cache (kept for backward compatibility)
  async loadStockData(forceRefresh = false) {
    const stockDataCacheKey = 'stockMasterData';
    
    // Check cache first
    if (!forceRefresh && stockCache.has(stockDataCacheKey) && !shouldUpdateStockCache(stockDataCacheKey)) {
      console.log("Using cached stock master data");
      this.stockData = stockCache.get(stockDataCacheKey);
      return;
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
      stockCache.set(stockDataCacheKey, [...this.stockData]);
      updateStockCacheTimestamp(stockDataCacheKey);

      console.log(`Loaded ${this.stockData.length} stock items`);
    } catch (error) {
      console.error("Error loading stock data:", error);
      
      // Try to use cache as fallback
      if (stockCache.has(stockDataCacheKey)) {
        console.log("Using cached stock master data as fallback");
        this.stockData = stockCache.get(stockDataCacheKey);
      } else {
        throw error;
      }
    }
  },

  // EXISTING: Load all kode aksesoris with cache
  async loadAllKodeAksesoris(forceRefresh = false) {
    const kodeAksesorisCacheKey = 'kodeAksesorisData';
    
    // Check cache first
    if (!forceRefresh && stockCache.has(kodeAksesorisCacheKey) && !shouldUpdateStockCache(kodeAksesorisCacheKey)) {
      console.log("Using cached kode aksesoris data");
      const cachedKodeData = stockCache.get(kodeAksesorisCacheKey);
      
      // Merge with existing stock data
      cachedKodeData.forEach(item => {
        const existingIndex = this.stockData.findIndex(stockItem => stockItem.kode === item.kode);
        if (existingIndex === -1) {
          this.stockData.push(item);
        } else {
          this.stockData[existingIndex].kategori = item.kategori;
        }
      });
      
      return;
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
        const existingIndex = this.stockData.findIndex((item) => item.kode === data.text);

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

        if (existingIndex === -1) {
          this.stockData.push(kodeItem);
        } else {
          this.stockData[existingIndex].kategori = "kotak";
        }
        
        kodeAksesorisData.push(kodeItem);
      });

      // Process aksesoris data
      aksesorisSnapshot.forEach((doc) => {
        const data = doc.data();
        const existingIndex = this.stockData.findIndex((item) => item.kode === data.text);

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

        if (existingIndex === -1) {
          this.stockData.push(kodeItem);
        } else {
          this.stockData[existingIndex].kategori = "aksesoris";
        }
        
        kodeAksesorisData.push(kodeItem);
      });
      
      // Cache the kode aksesoris data
      stockCache.set(kodeAksesorisCacheKey, kodeAksesorisData);
      updateStockCacheTimestamp(kodeAksesorisCacheKey);
      
    } catch (error) {
      console.error("Error loading kode aksesoris:", error);
      
      // Try to use cache as fallback
      if (stockCache.has(kodeAksesorisCacheKey)) {
        console.log("Using cached kode aksesoris data as fallback");
        const cachedKodeData = stockCache.get(kodeAksesorisCacheKey);
        
        cachedKodeData.forEach(item => {
          const existingIndex = this.stockData.findIndex(stockItem => stockItem.kode === item.kode);
          if (existingIndex === -1) {
            this.stockData.push(item);
          } else {
            this.stockData[existingIndex].kategori = item.kategori;
          }
        });
      } else {
        throw error;
      }
    }
  },

  // EXISTING: Calculate stock continuity (kept for backward compatibility)
  async calculateStockContinuity(selectedDate) {
    try {
      const endOfSelectedDate = new Date(selectedDate);
      endOfSelectedDate.setHours(23, 59, 59, 999);

      // Step 1: Try to get snapshot data as base
      const snapshotData = await this.getSnapshotAsBase(selectedDate);

      // Step 2: Get current month transactions
      const currentMonthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      const transactions = await this.getCurrentMonthTransactions(currentMonthStart, endOfSelectedDate);

      // Step 3: Merge and calculate
      this.mergeSnapshotWithTransactions(snapshotData, transactions);
    } catch (error) {
      console.error("Error calculating stock continuity:", error);
      // Fallback: use current stock data as-is
      this.filteredStockData = [...this.stockData];
    }
  },

  // EXISTING: Get snapshot data as base stock with cache
  async getSnapshotAsBase(selectedDate) {
    try {
      console.log(`🎯 Getting snapshot base for: ${formatDate(selectedDate)}`);
      
      const snapshotCacheKey = `snapshot_${formatDate(selectedDate).replace(/\//g, '-')}`;
      
      // Check cache first
      if (stockCache.has(snapshotCacheKey) && !shouldUpdateStockCache(snapshotCacheKey)) {
        console.log(`Using cached snapshot data for ${formatDate(selectedDate)}`);
        return stockCache.get(snapshotCacheKey);
      }
      
      // Priority 1: Daily snapshot (hari sebelumnya)
      const previousDate = new Date(selectedDate);
      previousDate.setDate(previousDate.getDate() - 1);
      
      console.log(`🔍 Checking daily snapshot for previous day: ${formatDate(previousDate)}`);
      const dailySnapshot = await this.getDailySnapshot(previousDate);
      
      if (dailySnapshot && dailySnapshot.size > 0) {
        console.log(`📅 Using daily snapshot: ${formatDate(previousDate)} (${dailySnapshot.size} items)`);
        // Cache the result
        stockCache.set(snapshotCacheKey, dailySnapshot);
        updateStockCacheTimestamp(snapshotCacheKey);
        return dailySnapshot;
      }
      
      // Priority 2: Cek juga snapshot hari yang sama (untuk kasus khusus)
      console.log(`🔍 Checking daily snapshot for same day: ${formatDate(selectedDate)}`);
      const sameDaySnapshot = await this.getDailySnapshot(selectedDate);
      
      if (sameDaySnapshot && sameDaySnapshot.size > 0) {
        console.log(`📅 Using same-day snapshot: ${formatDate(selectedDate)} (${sameDaySnapshot.size} items)`);
        // Cache the result
        stockCache.set(snapshotCacheKey, sameDaySnapshot);
        updateStockCacheTimestamp(snapshotCacheKey);
        return sameDaySnapshot;
      }
      
      // Priority 3: Monthly snapshot (bulan sebelumnya)
      console.log(`🔍 Checking monthly snapshot...`);
      const monthlySnapshot = await this.getMonthlySnapshot(selectedDate);
      
      if (monthlySnapshot && monthlySnapshot.size > 0) {
        const prevMonth = new Date(selectedDate);
        prevMonth.setMonth(prevMonth.getMonth() - 1);
        console.log(`📊 Using monthly snapshot: ${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")} (${monthlySnapshot.size} items)`);
        // Cache the result
        stockCache.set(snapshotCacheKey, monthlySnapshot);
        updateStockCacheTimestamp(snapshotCacheKey);
        return monthlySnapshot;
      }
      
      // Priority 4: Empty base (start from zero)
      console.log("⚠️ No snapshot found, starting from zero");
      const emptySnapshot = new Map();
      // Cache the empty result
      stockCache.set(snapshotCacheKey, emptySnapshot);
      updateStockCacheTimestamp(snapshotCacheKey);
      return emptySnapshot;
      
    } catch (error) {
      console.error("Error getting snapshot base:", error);
      
      // Try to use cache as fallback
      const snapshotCacheKey = `snapshot_${formatDate(selectedDate).replace(/\//g, '-')}`;
      if (stockCache.has(snapshotCacheKey)) {
        console.log("Using cached snapshot data as fallback");
        return stockCache.get(snapshotCacheKey);
      }
      
      return new Map();
    }
  },

  // EXISTING: Fungsi baru: Ambil daily snapshot dengan cache
  async getDailySnapshot(date) {
    try {
      const dateKey = formatDate(date);
      const dailySnapshotCacheKey = `daily_snapshot_${dateKey.replace(/\//g, '-')}`;
      
      // Check cache first
      if (stockCache.has(dailySnapshotCacheKey) && !shouldUpdateStockCache(dailySnapshotCacheKey)) {
        console.log(`Using cached daily snapshot for ${dateKey}`);
        return stockCache.get(dailySnapshotCacheKey);
      }
      
      console.log(`🔍 Looking for daily snapshot: ${dateKey}`);
      
      // Gunakan query berdasarkan field 'date' bukan document ID
      const dailySnapshotQuery = query(
        collection(firestore, "dailyStockSnapshot"),
        where("date", "==", dateKey)
      );
      
      const querySnapshot = await getDocs(dailySnapshotQuery);
      
      if (querySnapshot.empty) {
        console.log(`❌ Daily snapshot not found for: ${dateKey}`);
        // Cache the null result to avoid repeated queries
        stockCache.set(dailySnapshotCacheKey, null);
        updateStockCacheTimestamp(dailySnapshotCacheKey);
        return null;
      }
      
      // Ambil document pertama (seharusnya hanya ada satu)
      const doc = querySnapshot.docs[0];
      const data = doc.data();
      
      console.log(`✅ Daily snapshot found for: ${dateKey}`, {
        docId: doc.id,
        totalItems: data.totalItems || 0,
        stockDataLength: data.stockData?.length || 0
      });
      
      const snapshotMap = new Map();
      
      // Convert array to Map
      if (data.stockData && Array.isArray(data.stockData)) {
        data.stockData.forEach((item, index) => {
          if (item.kode) {
            snapshotMap.set(item.kode, {
              stokAwal: item.stokAkhir || 0, // Gunakan stokAkhir sebagai stokAwal hari berikutnya
              nama: item.nama || "",
              kategori: item.kategori || "",
            });
            
            // Log beberapa item pertama untuk debug
            if (index < 3) {
              console.log(`📦 Item ${index}: ${item.kode} = ${item.stokAkhir}`);
            }
          }
        });
        
        console.log(`📊 Daily snapshot loaded: ${snapshotMap.size} items`);
        
        // Cache the result
        stockCache.set(dailySnapshotCacheKey, snapshotMap);
        updateStockCacheTimestamp(dailySnapshotCacheKey);
        
        return snapshotMap;
      } else {
        console.log(`⚠️ No stockData array in snapshot: ${dateKey}`);
        // Cache the null result
        stockCache.set(dailySnapshotCacheKey, null);
        updateStockCacheTimestamp(dailySnapshotCacheKey);
        return null;
      }
      
    } catch (error) {
      console.error("Error loading daily snapshot:", error);
      
      // Try to use cache as fallback
      const dateKey = formatDate(date);
      const dailySnapshotCacheKey = `daily_snapshot_${dateKey.replace(/\//g, '-')}`;
      if (stockCache.has(dailySnapshotCacheKey)) {
        console.log("Using cached daily snapshot as fallback");
        return stockCache.get(dailySnapshotCacheKey);
      }
      
      return null;
    }
  },

  // EXISTING: Fungsi baru: Ambil monthly snapshot dengan cache
  async getMonthlySnapshot(selectedDate) {
    try {
      const prevMonth = new Date(selectedDate);
      prevMonth.setMonth(prevMonth.getMonth() - 1);
      const monthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
      const monthlySnapshotCacheKey = `monthly_snapshot_${monthKey}`;
      
      // Check cache first
      if (stockCache.has(monthlySnapshotCacheKey) && !shouldUpdateStockCache(monthlySnapshotCacheKey)) {
        console.log(`Using cached monthly snapshot for ${monthKey}`);
        return stockCache.get(monthlySnapshotCacheKey);
      }

      const snapshotQuery = query(collection(firestore, "stokSnapshot"), where("bulan", "==", monthKey));

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

      // Cache the result
      stockCache.set(monthlySnapshotCacheKey, snapshotMap);
      updateStockCacheTimestamp(monthlySnapshotCacheKey);

      return snapshotMap;
    } catch (error) {
      console.error("Error loading monthly snapshot:", error);
      
      // Try to use cache as fallback
      const prevMonth = new Date(selectedDate);
      prevMonth.setMonth(prevMonth.getMonth() - 1);
      const monthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
      const monthlySnapshotCacheKey = `monthly_snapshot_${monthKey}`;
      
      if (stockCache.has(monthlySnapshotCacheKey)) {
        console.log("Using cached monthly snapshot as fallback");
        return stockCache.get(monthlySnapshotCacheKey);
      }
      
      return new Map();
    }
  },

  // EXISTING: Merge snapshot with current transactions
  mergeSnapshotWithTransactions(snapshotData, transactions) {
    const resultMap = new Map();

    // Start with snapshot data
    snapshotData.forEach((data, kode) => {
      resultMap.set(kode, {
        kode,
        nama: data.nama,
        kategori: data.kategori,
        stokAwal: data.stokAwal,
        tambahStok: 0,
        laku: 0,
        free: 0,
        gantiLock: 0,
        stokAkhir: data.stokAwal,
      });
    });

    // Add current stock data for items not in snapshot
    this.stockData.forEach((item) => {
      if (!resultMap.has(item.kode)) {
        resultMap.set(item.kode, {
          kode: item.kode,
          nama: item.nama || "",
          kategori: item.kategori || "",
          stokAwal: 0,
          tambahStok: 0,
          laku: 0,
          free: 0,
          gantiLock: 0,
          stokAkhir: item.stokAkhir || 0,
        });
      }
    });

    // Apply transactions
    transactions.forEach((trans, kode) => {
      if (!resultMap.has(kode)) {
        resultMap.set(kode, {
          kode,
          nama: trans.nama,
          kategori: trans.kategori,
          stokAwal: 0,
          tambahStok: 0,
          laku: 0,
          free: 0,
          gantiLock: 0,
          stokAkhir: 0,
        });
      }

      const item = resultMap.get(kode);
      item.tambahStok = trans.tambahStok;
      item.laku = trans.laku;
      item.free = trans.free;
      item.gantiLock = trans.gantiLock;

      // Calculate final stock
      item.stokAkhir = Math.max(0, item.stokAwal + item.tambahStok - item.laku - item.free - item.gantiLock);
    });

    // Convert to array and sort
    this.filteredStockData = Array.from(resultMap.values()).sort((a, b) => {
      if (a.kategori !== b.kategori) {
        return a.kategori === "kotak" ? -1 : 1;
      }
      return a.kode.localeCompare(b.kode);
    });

    console.log(`Final result: ${this.filteredStockData.length} items`);

    // Set flag for UI
    this.usedSnapshotFlag = snapshotData.size > 0;
  },

  // EXISTING: Fallback method using original calculation
  async calculateStockContinuityFallback(selectedDate) {
    try {
      const previousDay = new Date(selectedDate);
      previousDay.setDate(previousDay.getDate() - 1);
      previousDay.setHours(23, 59, 59, 999);

      const endOfSelectedDate = new Date(selectedDate);
      endOfSelectedDate.setHours(23, 59, 59, 999);

      // Use original logic without snapshot
      const stockTransactionsRef = collection(firestore, "stokAksesorisTransaksi");
      const transactionsQuery = query(
        stockTransactionsRef,
        where("timestamp", "<=", Timestamp.fromDate(endOfSelectedDate)),
        orderBy("timestamp", "asc")
      );

      const transactionsSnapshot = await getDocs(transactionsQuery);
      const stockByCode = {};

      // Process all transactions with original logic
      transactionsSnapshot.forEach((doc) => {
        const transaction = doc.data();
        const kode = transaction.kode;
        const timestamp = transaction.timestamp.toDate();

        if (!kode) return;

        if (!stockByCode[kode]) {
          stockByCode[kode] = {
            before: { stokAwal: 0, tambahStok: 0, laku: 0, free: 0, gantiLock: 0 },
            during: { tambahStok: 0, laku: 0, free: 0, gantiLock: 0 },
            nama: transaction.nama || "",
            kategori: transaction.kategori || "",
          };
        }

        const isPeriodBefore = timestamp <= previousDay;
        const isPeriodDuring = timestamp > previousDay && timestamp <= endOfSelectedDate;

        if (isPeriodBefore) {
          switch (transaction.jenis) {
            case "stokAwal":
              stockByCode[kode].before.stokAwal = transaction.jumlah || 0;
              break;
            case "tambah":
              stockByCode[kode].before.tambahStok += transaction.jumlah || 0;
              break;
            case "laku":
              stockByCode[kode].before.laku += transaction.jumlah || 0;
              break;
            case "free":
              stockByCode[kode].before.free += transaction.jumlah || 0;
              break;
            case "gantiLock":
              stockByCode[kode].before.gantiLock += transaction.jumlah || 0;
              break;
          }
        } else if (isPeriodDuring) {
          switch (transaction.jenis) {
            case "tambah":
              stockByCode[kode].during.tambahStok += transaction.jumlah || 0;
              break;
            case "laku":
              stockByCode[kode].during.laku += transaction.jumlah || 0;
              break;
            case "free":
              stockByCode[kode].during.free += transaction.jumlah || 0;
              break;
            case "gantiLock":
              stockByCode[kode].during.gantiLock += transaction.jumlah || 0;
              break;
          }
        }
      });

      // Process stock additions with original logic
      await this.processStockAdditions(new Date(selectedDate.getFullYear(), 0, 1), endOfSelectedDate, stockByCode);

      // Calculate final stock data
      this.calculateFinalStockData(stockByCode, false);
    } catch (error) {
      console.error("Error in fallback calculation:", error);
      throw error;
    }
  },

  // EXISTING: Process stock additions
  async processStockAdditions(startDate, endDate, stockByCode) {
    const stockAddRef = collection(firestore, "stockAdditions");
    const stockAddQuery = query(
      stockAddRef,
      where("timestamp", ">=", Timestamp.fromDate(startDate)),
      where("timestamp", "<=", Timestamp.fromDate(endDate))
    );

    const stockAddSnapshot = await getDocs(stockAddQuery);

    stockAddSnapshot.forEach((doc) => {
      const data = doc.data();
      if (!data.items?.length) return;

      data.items.forEach((item) => {
        const kode = item.kodeText;
        if (!kode) return;

        const quantity = parseInt(item.jumlah) || 0;

        if (!stockByCode[kode]) {
          stockByCode[kode] = {
            before: { stokAwal: 0, tambahStok: 0, laku: 0, free: 0, gantiLock: 0 },
            during: { tambahStok: 0, laku: 0, free: 0, gantiLock: 0 },
            nama: item.nama || "",
            kategori: "",
          };
        }

        stockByCode[kode].during.tambahStok += quantity;
      });
    });
  },

  // EXISTING: Calculate final stock data
  calculateFinalStockData(stockByCode, usedSnapshot) {
    // Store snapshot usage flag for UI indicator
    this.usedSnapshotFlag = usedSnapshot;

    this.filteredStockData = this.stockData.map((item) => {
      const kode = item.kode;
      const stockInfo = stockByCode[kode] || {
        before: { stokAwal: 0, tambahStok: 0, laku: 0, free: 0, gantiLock: 0 },
        during: { tambahStok: 0, laku: 0, free: 0, gantiLock: 0 },
      };

      // Calculate initial stock
      const initialStock = usedSnapshot
        ? stockInfo.before.stokAwal // From snapshot
        : stockInfo.before.stokAwal +
          stockInfo.before.tambahStok -
          stockInfo.before.laku -
          stockInfo.before.free -
          stockInfo.before.gantiLock;

      // Calculate final stock
      const finalStock =
        Math.max(0, initialStock) +
        stockInfo.during.tambahStok -
        stockInfo.during.laku -
        stockInfo.during.free -
        stockInfo.during.gantiLock;

      return {
        ...item,
        stokAwal: Math.max(0, initialStock),
        tambahStok: stockInfo.during.tambahStok,
        laku: stockInfo.during.laku,
        free: stockInfo.during.free,
        gantiLock: stockInfo.during.gantiLock,
        stokAkhir: Math.max(0, finalStock),
      };
    });

    // Sort by category then by code
    this.filteredStockData.sort((a, b) => {
      if ((a.kategori || "unknown") !== (b.kategori || "unknown")) {
        return (a.kategori || "unknown") === "kotak" ? -1 : 1;
      }
      return (a.kode || "").localeCompare(b.kode || "");
    });
  },

  // EXISTING: Tambahkan method untuk menghitung transaksi ganti lock
  async calculateStockMovements(kode, startDate, endDate) {
    try {
      const movements = {
        tambahStok: 0,
        laku: 0,
        free: 0,
        gantiLock: 0,
      };

      // Create cache key for movements
      const movementsCacheKey = `movements_${kode}_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}`;
      
      // Check cache first
      if (stockCache.has(movementsCacheKey) && !shouldUpdateStockCache(movementsCacheKey)) {
        return stockCache.get(movementsCacheKey);
      }

      // Query transaksi dalam rentang tanggal untuk kode ini
      const transactionQuery = query(
        collection(firestore, "stokAksesorisTransaksi"),
        where("kode", "==", kode),
        where("timestamp", ">=", Timestamp.fromDate(startDate)),
        where("timestamp", "<=", Timestamp.fromDate(endDate))
      );

      const transactionSnapshot = await getDocs(transactionQuery);

      transactionSnapshot.forEach((doc) => {
        const data = doc.data();
        const jenis = data.jenis;
        const jumlah = data.jumlah || 0;

        switch (jenis) {
          case "tambah":
            movements.tambahStok += jumlah;
            break;
          case "laku":
            movements.laku += jumlah;
            break;
          case "free":
            movements.free += jumlah;
            break;
          case "gantiLock":
            movements.gantiLock += jumlah;
            break;
        }
      });

      // Cache the movements
      stockCache.set(movementsCacheKey, movements);
      updateStockCacheTimestamp(movementsCacheKey);

      return movements;
    } catch (error) {
      console.error("Error calculating stock movements:", error);
      
      // Try to use cache as fallback
      const movementsCacheKey = `movements_${kode}_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}`;
      if (stockCache.has(movementsCacheKey)) {
        return stockCache.get(movementsCacheKey);
      }
      
      return {
        tambahStok: 0,
        laku: 0,
        free: 0,
        gantiLock: 0,
      };
    }
  },

  // EXISTING: Perbaiki method untuk menampilkan data dengan kolom ganti lock
  async displayStockData(stockData, selectedDate) {
    const tableBody = $("#stockTable tbody");
    tableBody.empty();

    if (stockData.length === 0) {
      tableBody.append(`
      <tr>
        <td colspan="9" class="text-center">Tidak ada data stok untuk tanggal ${selectedDate}</td>
      </tr>
    `);
      return;
    }

    // Hitung tanggal untuk query transaksi
    const startDate = new Date(selectedDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(selectedDate);
    endDate.setHours(23, 59, 59, 999);

    for (let i = 0; i < stockData.length; i++) {
      const item = stockData[i];

      // Hitung pergerakan stok
      const movements = await this.calculateStockMovements(item.kode, startDate, endDate);

      const row = `
      <tr>
        <td>${i + 1}</td>
        <td>${item.kode || "-"}</td>
        <td>${item.nama || "-"}</td>
        <td class="text-center">${item.stokAwal || 0}</td>
        <td class="text-center">${movements.tambahStok}</td>
        <td class="text-center">${movements.laku}</td>
        <td class="text-center">${movements.free}</td>
        <td class="text-center">${movements.gantiLock}</td>
        <td class="text-center">${item.stokAkhir || 0}</td>
      </tr>
    `;

      tableBody.append(row);
    }
  },

  // EXISTING: Render stock table
  renderStockTable() {
    try {
      // Check if table exists
      const tableElement = document.getElementById("stockTable");
      if (!tableElement) {
        console.error("Table element #stockTable not found");
        return;
      }

      // Safely destroy DataTable if it exists
      try {
        if ($.fn.DataTable.isDataTable("#stockTable")) {
          try {
            this.addDataSourceIndicator(this.usedSnapshotFlag || false);
          } catch (error) {
            console.warn("Error adding data source indicator:", error);
          }
          $("#stockTable").DataTable().destroy();
        }
      } catch (error) {
        console.warn("Error destroying DataTable:", error);
      }

      // Get table body
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
        // Add data source indicator
        if (this.usedSnapshotFlag) {
          const indicator = document.createElement("div");
          indicator.className = "alert alert-info mb-2";
          indicator.innerHTML =
            '<i class="fas fa-database me-2"></i>Menggunakan data snapshot bulan lalu + transaksi bulan ini';

          const tableContainer = document.querySelector("#stockTable").parentElement;
          const existingIndicator = tableContainer.querySelector(".alert");
          if (existingIndicator) existingIndicator.remove();

          tableContainer.insertBefore(indicator, tableContainer.firstChild);
        }
        // Initialize empty DataTable
        $("#stockTable").DataTable({
          responsive: true,
          language: {
            emptyTable: "Tidak ada data yang tersedia",
          },
        });

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

      // Add all items
      [...kotakItems, ...aksesorisItems, ...otherItems].forEach((item) => {
        const categoryClass =
          item.kategori === "kotak" ? "kotak-item" : item.kategori === "aksesoris" ? "aksesoris-item" : "other-item";

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

      // Set table body HTML
      if (html.trim() === "") {
        tableBody.innerHTML = `
            <tr>
              <td colspan="9" class="text-center">Tidak ada data yang valid untuk ditampilkan</td>
            </tr>
          `;
      } else {
        tableBody.innerHTML = html;
      }

      // Get selected date for title
      const selectedDateStr = document.getElementById("startDate").value;
      const selectedDate = selectedDateStr || formatDate(new Date());

      // Add CSS for text wrapping and equal column widths
      const styleElement = document.createElement("style");
      styleElement.id = "stockTableStyle";
      styleElement.textContent = `
          #stockTable th, #stockTable td {
            white-space: normal;
            word-wrap: break-word;
            vertical-align: middle;
          }
          
          #stockTable th:nth-child(1), #stockTable td:nth-child(1) { width: 5%; }  /* No */
          #stockTable th:nth-child(2), #stockTable td:nth-child(2) { width: 10%; } /* Kode */
          #stockTable th:nth-child(3), #stockTable td:nth-child(3) { width: 35%; } /* Nama */
          #stockTable th:nth-child(4), #stockTable td:nth-child(4),
          #stockTable th:nth-child(5), #stockTable td:nth-child(5),
          #stockTable th:nth-child(6), #stockTable td:nth-child(6),
          #stockTable th:nth-child(7), #stockTable td:nth-child(7),
          #stockTable th:nth-child(8), #stockTable td:nth-child(8),
          #stockTable th:nth-child(9), #stockTable td:nth-child(9) { width: 8.33%; } /* Stock columns */
          
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

      // Initialize DataTable with export buttons
      $("#stockTable").DataTable({
        responsive: true,
        dom: "Bfrtip",
        ordering: false,
        autoWidth: false,
        buttons: [
          {
            extend: "excel",
            text: '<i class="fas fa-file-excel me-2"></i>Excel',
            className: "btn btn-success btn-sm me-1",
            exportOptions: {
              columns: ":visible",
            },
            title: `Laporan Stok Kotak & Aksesoris Melati Atas (${selectedDate})`,
            customize: function (xlsx) {
              var sheet = xlsx.xl.worksheets["sheet1.xml"];
              $('row c[r^="C"]', sheet).attr("s", "55"); // Nama column - wider with wrap text
              $("row:not(:first-child) c", sheet).attr("s", "55");
            },
          },
          {
            extend: "pdf",
            text: '<i class="fas fa-file-pdf me-2"></i>PDF',
            className: "btn btn-danger btn-sm me-1",
            exportOptions: {
              columns: ":visible",
            },
            title: `Laporan Stok Kotak & Aksesoris Melati Atas\n(${selectedDate})`,
            customize: function (doc) {
              doc.defaultStyle.fontSize = 8;
              doc.styles.tableHeader.fontSize = 9;
              doc.content[1].table.widths = ["5%", "10%", "35%", "8.33%", "8.33%", "8.33%", "8.33%", "8.33%", "8.33%"];
              doc.styles.tableHeader.alignment = "center";
              doc.styles.tableBodyEven.alignment = "center";
              doc.styles.tableBodyOdd.alignment = "center";
              doc.content[1].table.body.forEach(function (row, rowIndex) {
                row.forEach(function (cell, cellIndex) {
                  if (cellIndex === 2) {
                    // Kolom nama (index 2) rata kiri
                    cell.alignment = "left";
                  } else if (cellIndex !== 2) {
                    // Kolom lainnya tetap center
                    cell.alignment = "center";
                  }
                });
              });
            },
          },
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
        },
      });

      // Add category headers
      this.addCategoryHeaders(kotakItems, aksesorisItems, otherItems);
    } catch (error) {
      console.error("Error rendering stock table:", error);
      this.showError("Terjadi kesalahan saat menampilkan data: " + error.message);

      // Reset table to clean state
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
          $("#stockTable").DataTable({
            responsive: true,
            language: {
              emptyTable: "Tidak ada data yang tersedia",
            },
          });
        }
      } catch (innerError) {
        console.warn("Error resetting table:", innerError);
      }
    }
  },

  // EXISTING: Add data source indicator
  addDataSourceIndicator(usedSnapshot = false) {
    try {
      const tableContainer =
        document.querySelector("#stockTable_wrapper") || document.querySelector("#stockTable")?.parentElement;

      if (!tableContainer) return;

      // Remove existing indicator
      const existingIndicator = document.querySelector(".data-source-indicator");
      if (existingIndicator) existingIndicator.remove();

      // Create new indicator
      const indicator = document.createElement("div");
      indicator.className = "data-source-indicator alert alert-info mb-2";
      indicator.innerHTML = usedSnapshot
        ? '<i class="fas fa-database me-2"></i>Data menggunakan snapshot bulan sebelumnya + transaksi bulan ini'
        : '<i class="fas fa-chart-line me-2"></i>Data dihitung dari seluruh riwayat transaksi';

      tableContainer.insertBefore(indicator, tableContainer.firstChild);
    } catch (error) {
      console.warn("Error adding data source indicator:", error);
    }
  },

  // EXISTING: Add category headers
  addCategoryHeaders(kotakItems, aksesorisItems, otherItems) {
    // Add container for category headers above the table
    const tableContainer = document.querySelector("#stockTable_wrapper");
    if (!tableContainer) return;

    // Check if category header container already exists
    let categoryHeaderContainer = document.querySelector(".category-headers");
    if (!categoryHeaderContainer) {
      categoryHeaderContainer = document.createElement("div");
      categoryHeaderContainer.className = "category-headers mb-3 mt-3";
      tableContainer.insertBefore(categoryHeaderContainer, tableContainer.querySelector(".dataTables_filter"));
    }

    // Create HTML for category headers
    categoryHeaderContainer.innerHTML = `
              <div class="d-flex flex-wrap gap-2">
        ${
          kotakItems.length > 0
            ? `<div class="category-badge badge bg-primary p-2">${kotakItems.length} Kotak Perhiasan</div>`
            : ""
        }
        ${
          aksesorisItems.length > 0
            ? `<div class="category-badge badge bg-success p-2">${aksesorisItems.length} Aksesoris Perhiasan</div>`
            : ""
        }
        ${
          otherItems.length > 0
            ? `<div class="category-badge badge bg-secondary p-2">${otherItems.length} Lainnya</div>`
            : ""
        }
      </div>
    `;

    // Add CSS for styling
    const styleElement = document.createElement("style");
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

    // Add event listeners for category filtering
    document.querySelectorAll(".category-badge").forEach((badge) => {
      badge.addEventListener("click", function () {
        const text = this.textContent.toLowerCase();
        let categoryClass = "";

        if (text.includes("kotak")) {
          categoryClass = "kotak-item";
        } else if (text.includes("aksesoris")) {
          categoryClass = "aksesoris-item";
        } else {
          categoryClass = "other-item";
        }

        // Toggle active state
        this.classList.toggle("active");
        const isActive = this.classList.contains("active");

        // Update badge style
        if (isActive) {
          this.style.opacity = "1";
        } else {
          this.style.opacity = "0.6";
        }

        // Filter table
        const table = $("#stockTable").DataTable();

        // Custom filtering function
        $.fn.dataTable.ext.search.push(function (settings, data, dataIndex, row) {
          // Get all active categories
          const activeCategories = [];
          document.querySelectorAll(".category-badge.active").forEach((activeBadge) => {
            const badgeText = activeBadge.textContent.toLowerCase();
            if (badgeText.includes("kotak")) {
              activeCategories.push("kotak-item");
            } else if (badgeText.includes("aksesoris")) {
              activeCategories.push("aksesoris-item");
            } else {
              activeCategories.push("other-item");
            }
          });

          // If no categories are active, show all rows
          if (activeCategories.length === 0) {
            return true;
          }

          // Check if row belongs to any active category
          const rowNode = table.row(dataIndex).node();
          return activeCategories.some((category) => rowNode.classList.contains(category));
        });

        // Redraw the table
        table.draw();
      });
    });
  },

  // EXISTING: Show loading indicator
  showLoading(isLoading) {
    const loadingIndicator = document.getElementById("loadingIndicator");
    if (loadingIndicator) {
      loadingIndicator.style.display = isLoading ? "flex" : "none";
    }
  },

  // EXISTING: Show error message
  showError(message) {
    if (typeof Swal !== "undefined") {
      Swal.fire({
        icon: "error",
        title: "Error!",
        html: message,
        confirmButtonColor: "#dc3545",
        showClass: {
          popup: "animate__animated animate__shakeX",
        },
      });
    } else {
      alert(message);
    }
  },

  // EXISTING: Show success message
  showSuccess(message) {
    if (typeof Swal !== "undefined") {
      Swal.fire({
        icon: "success",
        title: "Berhasil!",
        html: message,
        confirmButtonColor: "#28a745",
        timer: 3000,
        timerProgressBar: true,
        showClass: {
          popup: "animate__animated animate__fadeInDown",
        },
        hideClass: {
          popup: "animate__animated animate__fadeOutUp",
        },
      });
    } else {
      alert(message);
    }
  },

  // EXISTING: Clean up cache
  cleanupCache() {
    const now = Date.now();
    const cacheExpiry = 30 * 60 * 1000; // 30 minutes

    // Clean up expired cache entries
    const keysToDelete = [];
    
    stockCacheMeta.forEach((timestamp, key) => {
      if (now - timestamp > cacheExpiry) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      stockCache.delete(key);
      stockCacheMeta.delete(key);
      console.log(`Cleaning up expired cache for ${key}`);
    });

    // Limit number of cache entries
    const maxCacheEntries = 50;
    const cacheKeys = Array.from(stockCache.keys());

    if (cacheKeys.length > maxCacheEntries) {
      // Sort by timestamp (oldest first)
      const sortedKeys = cacheKeys.sort((a, b) => {
        const timestampA = stockCacheMeta.get(a) || 0;
        const timestampB = stockCacheMeta.get(b) || 0;
        return timestampA - timestampB;
      });

      // Remove oldest cache entries
      const keysToRemove = sortedKeys.slice(0, cacheKeys.length - maxCacheEntries);
      keysToRemove.forEach((key) => {
        stockCache.delete(key);
        stockCacheMeta.delete(key);
        console.log(`Removing excess cache for ${key}`);
      });
    }

    // Save updated cache to localStorage
    saveStockCacheToStorage();
  },

  // NEW: Load master data dengan cache yang lebih efisien
  async loadMasterDataCached() {
    const masterDataCacheKey = 'masterStockData';
    
    // Check cache first dengan TTL yang lebih panjang untuk master data
    if (stockCache.has(masterDataCacheKey)) {
      const timestamp = stockCacheMeta.get(masterDataCacheKey);
      const now = Date.now();
      const masterDataTTL = 60 * 60 * 1000; // 1 hour untuk master data
      
      if (timestamp && (now - timestamp) < masterDataTTL) {
        console.log("Using cached master stock data");
        this.stockData = stockCache.get(masterDataCacheKey);
        return;
      }
    }

    try {
      console.log("Loading fresh master stock data...");
      
      // Load current stock
      const stockSnapshot = await getDocs(collection(firestore, "stokAksesoris"));
      this.stockData = [];

      stockSnapshot.forEach((doc) => {
        this.stockData.push({ id: doc.id, ...doc.data() });
      });

      // Load all kode aksesoris for complete list
      await this.loadAllKodeAksesorisCached();

      // Cache the master data dengan timestamp
      stockCache.set(masterDataCacheKey, [...this.stockData]);
      stockCacheMeta.set(masterDataCacheKey, Date.now());
      saveStockCacheToStorage();

      console.log(`✅ Master data loaded: ${this.stockData.length} items`);
    } catch (error) {
      console.error("Error loading master stock data:", error);
      
      // Try to use cache as fallback
      if (stockCache.has(masterDataCacheKey)) {
        console.log("Using cached master stock data as fallback");
        this.stockData = stockCache.get(masterDataCacheKey);
      } else {
        throw error;
      }
    }
  },

  // NEW: Load kode aksesoris dengan cache yang lebih efisien
  async loadAllKodeAksesorisCached() {
    const kodeAksesorisCacheKey = 'kodeAksesorisDataCached';
    
    // Check cache first dengan TTL yang lebih panjang
    if (stockCache.has(kodeAksesorisCacheKey)) {
      const timestamp = stockCacheMeta.get(kodeAksesorisCacheKey);
      const now = Date.now();
      const kodeDataTTL = 2 * 60 * 60 * 1000; // 2 hours untuk kode data
      
      if (timestamp && (now - timestamp) < kodeDataTTL) {
        console.log("Using cached kode aksesoris data");
        const cachedKodeData = stockCache.get(kodeAksesorisCacheKey);
        
        // Merge with existing stock data
        cachedKodeData.forEach(item => {
          const existingIndex = this.stockData.findIndex(stockItem => stockItem.kode === item.kode);
          if (existingIndex === -1) {
            this.stockData.push(item);
          } else {
            this.stockData[existingIndex].kategori = item.kategori;
          }
        });
        
        return;
      }
    }

    try {
      console.log("Loading fresh kode aksesoris data...");
      const kodeAksesorisData = [];
      
      // Get kotak data
      const kotakSnapshot = await getDocs(collection(firestore, "kodeAksesoris", "kategori", "kotak"));

      // Get aksesoris data
      const aksesorisSnapshot = await getDocs(collection(firestore, "kodeAksesoris", "kategori", "aksesoris"));

      // Process kotak data
      kotakSnapshot.forEach((doc) => {
        const data = doc.data();
        const existingIndex = this.stockData.findIndex((item) => item.kode === data.text);

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

        if (existingIndex === -1) {
          this.stockData.push(kodeItem);
        } else {
          this.stockData[existingIndex].kategori = "kotak";
        }
        
        kodeAksesorisData.push(kodeItem);
      });

      // Process aksesoris data
      aksesorisSnapshot.forEach((doc) => {
        const data = doc.data();
        const existingIndex = this.stockData.findIndex((item) => item.kode === data.text);

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

        if (existingIndex === -1) {
          this.stockData.push(kodeItem);
        } else {
          this.stockData[existingIndex].kategori = "aksesoris";
        }
        
        kodeAksesorisData.push(kodeItem);
      });
      
      // Cache the kode aksesoris data dengan timestamp
      stockCache.set(kodeAksesorisCacheKey, kodeAksesorisData);
      stockCacheMeta.set(kodeAksesorisCacheKey, Date.now());
      saveStockCacheToStorage();
      
      console.log(`✅ Kode aksesoris loaded: ${kodeAksesorisData.length} items`);
      
    } catch (error) {
      console.error("Error loading kode aksesoris:", error);
      
      // Try to use cache as fallback
      if (stockCache.has(kodeAksesorisCacheKey)) {
        console.log("Using cached kode aksesoris data as fallback");
        const cachedKodeData = stockCache.get(kodeAksesorisCacheKey);
        
        cachedKodeData.forEach(item => {
          const existingIndex = this.stockData.findIndex(stockItem => stockItem.kode === item.kode);
          if (existingIndex === -1) {
            this.stockData.push(item);
          } else {
            this.stockData[existingIndex].kategori = item.kategori;
          }
        });
      } else {
        throw error;
      }
    }
  },

  // NEW: Get snapshot dengan cache yang lebih efisien
  async getSnapshotAsBaseCached(selectedDate) {
    try {
      console.log(`🎯 Getting cached snapshot base for: ${formatDate(selectedDate)}`);
      
      const snapshotCacheKey = `snapshot_cached_${formatDate(selectedDate).replace(/\//g, '-')}`;
      
      // Check cache first dengan TTL yang sesuai
      if (stockCache.has(snapshotCacheKey)) {
        const timestamp = stockCacheMeta.get(snapshotCacheKey);
        const now = Date.now();
        const snapshotTTL = 30 * 60 * 1000; // 30 minutes untuk snapshot
        
        if (timestamp && (now - timestamp) < snapshotTTL) {
          console.log(`Using cached snapshot data for ${formatDate(selectedDate)}`);
          return stockCache.get(snapshotCacheKey);
        }
      }
      
      // Load fresh snapshot data
      const snapshotData = await this.getSnapshotAsBase(selectedDate);
      
      // Cache dengan timestamp
      stockCache.set(snapshotCacheKey, snapshotData);
      stockCacheMeta.set(snapshotCacheKey, Date.now());
      saveStockCacheToStorage();
      
      return snapshotData;
      
    } catch (error) {
      console.error("Error getting cached snapshot base:", error);
      
      // Try to use cache as fallback
      const snapshotCacheKey = `snapshot_cached_${formatDate(selectedDate).replace(/\//g, '-')}`;
      if (stockCache.has(snapshotCacheKey)) {
        console.log("Using cached snapshot data as fallback");
        return stockCache.get(snapshotCacheKey);
      }
      
      return new Map();
    }
  },

  // NEW: Calculate stock from base dengan cache
  async calculateStockFromBaseCached(baseSnapshot, endDate, selectedDate) {
    const stockMap = new Map();

    try {
      // Create cache key untuk calculation
      const calcCacheKey = `calc_${formatDate(selectedDate).replace(/\//g, '-')}_${formatDate(endDate).replace(/\//g, '-')}`;
      
      // Check cache first
      if (stockCache.has(calcCacheKey)) {
        const timestamp = stockCacheMeta.get(calcCacheKey);
        const now = Date.now();
        const calcTTL = 15 * 60 * 1000; // 15 minutes untuk calculation
        
        if (timestamp && (now - timestamp) < calcTTL) {
          console.log(`Using cached calculation for ${formatDate(selectedDate)}`);
          return stockCache.get(calcCacheKey);
        }
      }

      // Inisialisasi dengan base snapshot
      baseSnapshot.forEach((data, kode) => {
        stockMap.set(kode, data.stokAwal || 0);
      });

      // Inisialisasi item yang tidak ada di snapshot
      this.stockData.forEach((item) => {
        if (!stockMap.has(item.kode)) {
          stockMap.set(item.kode, 0);
        }
      });

      // Tentukan start date untuk kalkulasi transaksi
      let startDate;

      if (baseSnapshot.size > 0) {
        // Jika ada snapshot, hitung dari hari setelah snapshot
        const snapshotDate = new Date(selectedDate);
        snapshotDate.setDate(snapshotDate.getDate() - 1);
        startDate = new Date(snapshotDate);
        startDate.setHours(0, 0, 0, 0);
      } else {
        // Jika tidak ada snapshot, hitung dari awal bulan
        startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
      }

      // Hitung transaksi dari start date sampai end date
      if (startDate <= endDate) {
        const transactions = await this.getTransactionsForDateCached(startDate, endDate);

        // Apply transaksi ke stok
        transactions.forEach((trans, kode) => {
          const currentStock = stockMap.get(kode) || 0;
          const newStock = Math.max(0, currentStock + trans.tambahStok - trans.laku - trans.free - trans.gantiLock);
          stockMap.set(kode, newStock);
        });
      }

      // Cache the calculation result
      stockCache.set(calcCacheKey, stockMap);
      stockCacheMeta.set(calcCacheKey, Date.now());
      saveStockCacheToStorage();

      console.log(`📈 Stock calculated from base until ${formatDate(endDate)}: ${stockMap.size} items`);
      return stockMap;
    } catch (error) {
      console.error("Error calculating stock from base cached:", error);
      
      // Try to use cache as fallback
      const calcCacheKey = `calc_${formatDate(selectedDate).replace(/\//g, '-')}_${formatDate(endDate).replace(/\//g, '-')}`;
      if (stockCache.has(calcCacheKey)) {
        console.log("Using cached calculation as fallback");
        return stockCache.get(calcCacheKey);
      }
      
      return stockMap;
    }
  },

  // NEW: Get transactions dengan cache yang lebih efisien
  async getTransactionsForDateCached(startDate, endDate) {
    const transactionMap = new Map();
    
    // Create cache key for transactions
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    const transCacheKey = `trans_cached_${startDateStr}_${endDateStr}`;
    
    // Check cache first dengan TTL yang sesuai
    if (stockCache.has(transCacheKey)) {
      const timestamp = stockCacheMeta.get(transCacheKey);
      const now = Date.now();
      
      // TTL berbeda untuk data hari ini vs historical
      const today = new Date().toISOString().split('T')[0];
      const isToday = endDateStr === today;
      const transTTL = isToday ? 5 * 60 * 1000 : 60 * 60 * 1000; // 5 min untuk hari ini, 1 jam untuk historical
      
      if (timestamp && (now - timestamp) < transTTL) {
        console.log(`Using cached transaction data for ${startDateStr} to ${endDateStr}`);
        return stockCache.get(transCacheKey);
      }
    }

    try {
      console.log(`Loading fresh transaction data for ${startDateStr} to ${endDateStr}...`);
      
      // Get stock transactions
      const transQuery = query(
        collection(firestore, "stokAksesorisTransaksi"),
        where("timestamp", ">=", Timestamp.fromDate(startDate)),
        where("timestamp", "<=", Timestamp.fromDate(endDate))
      );

      const transSnapshot = await getDocs(transQuery);

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

      // Cache the transaction data dengan timestamp
      stockCache.set(transCacheKey, transactionMap);
      stockCacheMeta.set(transCacheKey, Date.now());
      saveStockCacheToStorage();

      const dateRange =
        startDate.toDateString() === endDate.toDateString()
          ? formatDate(startDate)
          : `${formatDate(startDate)} - ${formatDate(endDate)}`;

      console.log(`📋 Transactions for ${dateRange}: ${transactionMap.size} items`);
      return transactionMap;
    } catch (error) {
      console.error("Error getting cached transactions for date:", error);
      
      // Try to use cached data as fallback
      if (stockCache.has(transCacheKey)) {
        console.log("Using cached transaction data as fallback");
        return stockCache.get(transCacheKey);
      }
      
      return new Map();
    }
  },

  // NEW: Optimized daily continuity calculation
  async calculateDailyContinuityCached(selectedDate) {
    try {
      // Create cache key
      const dateStr = formatDate(selectedDate).replace(/\//g, '-');
      const cacheKey = `stock_cached_${dateStr}`;
      
      // Check if we should use cache
      const includesCurrentDay = dateStr === getLocalDateString().replace(/-/g, '-');
      
      // Check cache first dengan TTL yang sesuai
      if (stockCache.has(cacheKey)) {
        const timestamp = stockCacheMeta.get(cacheKey);
        const now = Date.now();
        const stockTTL = includesCurrentDay ? 5 * 60 * 1000 : 30 * 60 * 1000; // 5 min untuk hari ini, 30 min untuk historical
        
        if (timestamp && (now - timestamp) < stockTTL) {
          console.log(`Using cached stock data for ${dateStr}`);
          this.filteredStockData = stockCache.get(cacheKey);
          this.showCacheIndicator(true);
          return;
        }
      }
      
      // Hide cache indicator
      this.showCacheIndicator(false);
      
      console.log(`Calculating fresh daily continuity for ${dateStr}...`);
      
      // 1. Hitung stok akhir sampai hari sebelumnya menggunakan sistem prioritas
      const previousDate = new Date(selectedDate);
      previousDate.setDate(previousDate.getDate() - 1);
      previousDate.setHours(23, 59, 59, 999);

      // Gunakan sistem prioritas snapshot dengan cache
      const baseSnapshot = await this.getSnapshotAsBaseCached(selectedDate);
      const previousStockMap = await this.calculateStockFromBaseCached(baseSnapshot, previousDate, selectedDate);

      // 2. Hitung transaksi hari ini saja
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      const todayTransactions = await this.getTransactionsForDateCached(startOfDay, endOfDay);

      // 3. Gabungkan: stokAwal (dari snapshot/kalkulasi) + transaksi hari ini = stokAkhir
      this.filteredStockData = this.stockData.map((item) => {
        const kode = item.kode;

        // Stok awal = stok akhir kemarin (dari snapshot atau kalkulasi)
        const stokAwal = previousStockMap.get(kode) || 0;

        // Transaksi hari ini
        const todayTrans = todayTransactions.get(kode) || {
          tambahStok: 0,
          laku: 0,
          free: 0,
          gantiLock: 0,
        };

        // Stok akhir = stok awal + tambah - keluar
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

      // Tambahkan item yang ada di transaksi tapi tidak di master
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

      // Save to cache dengan timestamp
      stockCache.set(cacheKey, [...this.filteredStockData]);
      stockCacheMeta.set(cacheKey, Date.now());
      saveStockCacheToStorage();

      console.log(`✅ Daily continuity calculated: ${this.filteredStockData.length} items`);
    } catch (error) {
      console.error("Error calculating cached daily continuity:", error);
      
      // Try to use cache as fallback
      const dateStr = formatDate(selectedDate).replace(/\//g, '-');
      const cacheKey = `stock_cached_${dateStr}`;
      
      if (stockCache.has(cacheKey)) {
        console.log("Using cached data as fallback due to error");
        this.filteredStockData = stockCache.get(cacheKey);
        this.showError("Terjadi kesalahan saat mengambil data terbaru. Menggunakan data cache.");
        this.showCacheIndicator(true, 'fallback');
      } else {
        throw error;
      }
    }
  },

  // NEW: Enhanced cache management
  getCacheStats() {
    const stats = {
      totalEntries: stockCache.size,
      totalSize: 0,
      oldestEntry: null,
      newestEntry: null,
      categories: {
        stock: 0,
        transactions: 0,
        snapshots: 0,
        calculations: 0,
        master: 0
      }
    };

    // Calculate cache statistics
    stockCache.forEach((value, key) => {
      // Estimate size (rough calculation)
      stats.totalSize += JSON.stringify(value).length;
      
      // Categorize cache entries
      if (key.startsWith('stock_')) {
        stats.categories.stock++;
      } else if (key.startsWith('trans_')) {
        stats.categories.transactions++;
      } else if (key.startsWith('snapshot_')) {
        stats.categories.snapshots++;
      } else if (key.startsWith('calc_')) {
        stats.categories.calculations++;
      } else if (key.includes('master') || key.includes('kode')) {
        stats.categories.master++;
      }
    });

    // Find oldest and newest entries
    let oldestTime = Date.now();
    let newestTime = 0;

    stockCacheMeta.forEach((timestamp, key) => {
      if (timestamp < oldestTime) {
        oldestTime = timestamp;
        stats.oldestEntry = { key, timestamp };
      }
      if (timestamp > newestTime) {
        newestTime = timestamp;
        stats.newestEntry = { key, timestamp };
      }
    });

    return stats;
  },

  // NEW: Advanced cache cleanup
  advancedCleanupCache() {
    const now = Date.now();
    const stats = this.getCacheStats();
    
    console.log('Cache stats before cleanup:', stats);

    // Different TTL for different types of data
    const ttlConfig = {
      stock: 30 * 60 * 1000,      // 30 minutes for stock data
      transactions: 60 * 60 * 1000, // 1 hour for transactions
      snapshots: 2 * 60 * 60 * 1000, // 2 hours for snapshots
      calculations: 15 * 60 * 1000,  // 15 minutes for calculations
      master: 4 * 60 * 60 * 1000     // 4 hours for master data
    };

    const keysToDelete = [];
    
    stockCacheMeta.forEach((timestamp, key) => {
      let ttl = 30 * 60 * 1000; // default 30 minutes
      
      // Determine TTL based on key type
      if (key.startsWith('stock_')) {
        ttl = ttlConfig.stock;
      } else if (key.startsWith('trans_')) {
        ttl = ttlConfig.transactions;
      } else if (key.startsWith('snapshot_')) {
        ttl = ttlConfig.snapshots;
      } else if (key.startsWith('calc_')) {
        ttl = ttlConfig.calculations;
      } else if (key.includes('master') || key.includes('kode')) {
        ttl = ttlConfig.master;
      }
      
      // Check if expired
      if (now - timestamp > ttl) {
        keysToDelete.push(key);
      }
    });

    // Clean up expired entries
    keysToDelete.forEach(key => {
      stockCache.delete(key);
      stockCacheMeta.delete(key);
      console.log(`Advanced cleanup: removed expired cache for ${key}`);
    });

    // Limit cache size (keep most recent entries)
    const maxCacheEntries = 100;
    const remainingKeys = Array.from(stockCache.keys());

    if (remainingKeys.length > maxCacheEntries) {
      // Sort by timestamp (oldest first)
      const sortedKeys = remainingKeys.sort((a, b) => {
        const timestampA = stockCacheMeta.get(a) || 0;
        const timestampB = stockCacheMeta.get(b) || 0;
        return timestampA - timestampB;
      });

      // Remove oldest entries
      const keysToRemove = sortedKeys.slice(0, remainingKeys.length - maxCacheEntries);
      keysToRemove.forEach((key) => {
        stockCache.delete(key);
        stockCacheMeta.delete(key);
        console.log(`Advanced cleanup: removed excess cache for ${key}`);
      });
    }

    // Save updated cache
    saveStockCacheToStorage();
    
    const newStats = this.getCacheStats();
    console.log('Cache stats after cleanup:', newStats);
    
    return {
      before: stats,
      after: newStats,
      deletedEntries: keysToDelete.length
    };
  },

  // NEW: Cache warming - preload commonly used data
  async warmCache() {
    try {
      console.log('🔥 Starting cache warming...');
      
      // Warm master data
      await this.loadMasterDataCached();
      
      // Warm today's data
      const today = new Date();
      await this.calculateDailyContinuityCached(today);
      
      // Warm yesterday's data
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      await this.calculateDailyContinuityCached(yesterday);
      
      console.log('🔥 Cache warming completed');
      
    } catch (error) {
      console.warn('Cache warming failed:', error);
    }
  },

  // NEW: Enhanced load and filter with better caching
  async loadAndFilterStockDataCached(forceRefresh = false) {
    try {
      this.showLoading(true);

      const startDateStr = document.getElementById("startDate").value;

      if (!startDateStr) {
        this.showError("Tanggal harus diisi");
        this.showLoading(false);
        return;
      }

      const selectedDate = parseDate(startDateStr);
      if (!selectedDate) {
        this.showError("Format tanggal tidak valid");
        this.showLoading(false);
        return;
      }

      // Check if today's data - always refresh if includes current day
      const today = getLocalDateString();
      const selectedDateStr = formatDate(selectedDate).replace(/\//g, '-');
      const includesCurrentDay = selectedDateStr === today.replace(/-/g, '-');
      
      forceRefresh = forceRefresh || includesCurrentDay;

      // Load master data with enhanced caching
      if (forceRefresh) {
        await this.loadStockData(true);
      } else {
        await this.loadMasterDataCached();
      }

      // Calculate with enhanced caching
      if (forceRefresh) {
        await this.calculateDailyContinuity(selectedDate);
      } else {
        await this.calculateDailyContinuityCached(selectedDate);
      }

      this.renderStockTable();
      this.showLoading(false);
      
      // Perform advanced cleanup after successful load
      this.advancedCleanupCache();
      
    } catch (error) {
      console.error("Error loading cached stock data:", error);
      
      // Try to use cache as fallback
      const startDateStr = document.getElementById("startDate").value;
      const selectedDate = parseDate(startDateStr);
      const dateStr = formatDate(selectedDate).replace(/\//g, '-');
      const cacheKey = `stock_cached_${dateStr}`;
      
      if (stockCache.has(cacheKey)) {
        console.log("Using cached stock data as fallback due to error");
        this.filteredStockData = stockCache.get(cacheKey);
        this.renderStockTable();
        this.showError("Terjadi kesalahan saat mengambil data terbaru. Menggunakan data cache.");
        this.showCacheIndicator(true, 'fallback');
      } else {
        this.showError("Terjadi kesalahan saat memuat data: " + error.message);
      }
      
      this.showLoading(false);
    }
  },

  // NEW: Performance monitoring
  startPerformanceMonitoring() {
    this.performanceMetrics = {
      loadTimes: [],
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0
    };
    
    // Monitor cache performance
    const originalGet = stockCache.get.bind(stockCache);
    stockCache.get = (key) => {
      const result = originalGet(key);
      if (result !== undefined) {
        this.performanceMetrics.cacheHits++;
      } else {
        this.performanceMetrics.cacheMisses++;
      }
      return result;
    };
  },

  // NEW: Get performance report
  getPerformanceReport() {
    const cacheStats = this.getCacheStats();
    const hitRate = this.performanceMetrics.cacheHits / 
                   (this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses) * 100;
    
    return {
      cache: cacheStats,
      performance: {
        ...this.performanceMetrics,
        cacheHitRate: hitRate.toFixed(2) + '%',
        averageLoadTime: this.performanceMetrics.loadTimes.length > 0 
          ? (this.performanceMetrics.loadTimes.reduce((a, b) => a + b, 0) / this.performanceMetrics.loadTimes.length).toFixed(2) + 'ms'
          : 'N/A'
      }
    };
  },

  // MODIFIED: Enhanced init with cache warming and performance monitoring
  async init() {
    try {
      // Load cache from localStorage
      loadStockCacheFromStorage();
      
      // Start performance monitoring
      this.startPerformanceMonitoring();
      
      this.initDatePickers();
      this.attachEventListeners();
      this.setDefaultDates();
      this.initDataTable();
      this.prepareEmptyTable();
      
      // Warm cache in background
      setTimeout(() => {
        this.warmCache();
      }, 1000);
      
      // Enhanced cleanup with different intervals for different data types
      setInterval(() => {
        this.advancedCleanupCache();
      }, 10 * 60 * 1000); // Clean up every 10 minutes
      
      // Performance report every hour
      setInterval(() => {
        const report = this.getPerformanceReport();
        console.log('📊 Performance Report:', report);
      }, 60 * 60 * 1000);
      
    } catch (error) {
      console.error('Error initializing stock report handler:', error);
    }
  },

  // MODIFIED: Enhanced attach event listeners
  attachEventListeners() {
    // Filter button - use cached version
    const filterBtn = document.getElementById("filterStockBtn");
    if (filterBtn) {
      filterBtn.addEventListener("click", () => {
        const startTime = performance.now();
        this.loadAndFilterStockDataCached().finally(() => {
          const endTime = performance.now();
          this.performanceMetrics.loadTimes.push(endTime - startTime);
        });
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
        this.refreshAllData();
      });
    }

    // NEW: Add cache management buttons (for debugging/admin)
    if (window.location.hostname === 'localhost' || window.location.search.includes('debug=true')) {
      this.addDebugButtons();
    }
  },

  // NEW: Add debug buttons for cache management
  addDebugButtons() {
    const debugContainer = document.createElement('div');
    debugContainer.className = 'debug-container mt-2';
    debugContainer.innerHTML = `
      <div class="btn-group" role="group">
        <button type="button" class="btn btn-outline-info btn-sm" id="cacheStatsBtn">
          <i class="fas fa-chart-bar me-1"></i>Cache Stats
        </button>
        <button type="button" class="btn btn-outline-warning btn-sm" id="clearCacheBtn">
          <i class="fas fa-trash me-1"></i>Clear Cache
        </button>
        <button type="button" class="btn btn-outline-success btn-sm" id="warmCacheBtn">
          <i class="fas fa-fire me-1"></i>Warm Cache
        </button>
      </div>
    `;

    const filterCard = document.querySelector('.card .card-body');
    if (filterCard) {
      filterCard.appendChild(debugContainer);

      // Add event listeners for debug buttons
      document.getElementById('cacheStatsBtn').addEventListener('click', () => {
        const report = this.getPerformanceReport();
        console.log('📊 Cache & Performance Report:', report);
        
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            title: 'Cache Statistics',
            html: `
              <div class="text-start">
                <h6>Cache Info:</h6>
                <ul>
                  <li>Total Entries: ${report.cache.totalEntries}</li>
                  <li>Estimated Size: ${(report.cache.totalSize / 1024).toFixed(2)} KB</li>
                  <li>Stock Data: ${report.cache.categories.stock}</li>
                  <li>Transactions: ${report.cache.categories.transactions}</li>
                  <li>Snapshots: ${report.cache.categories.snapshots}</li>
                </ul>
                <h6>Performance:</h6>
                <ul>
                  <li>Cache Hit Rate: ${report.performance.cacheHitRate}</li>
                  <li>Average Load Time: ${report.performance.averageLoadTime}</li>
                  <li>Errors: ${report.performance.errors}</li>
                </ul>
              </div>
            `,
            icon: 'info'
          });
        }
      });

      document.getElementById('clearCacheBtn').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all cache?')) {
          stockCache.clear();
          stockCacheMeta.clear();
          localStorage.removeItem('stockCache');
          localStorage.removeItem('stockCacheMeta');
          this.showSuccess('Cache cleared successfully');
        }
      });

      document.getElementById('warmCacheBtn').addEventListener('click', () => {
        this.warmCache().then(() => {
          this.showSuccess('Cache warming completed');
        }).catch(error => {
          this.showError('Cache warming failed: ' + error.message);
        });
      });
    }
  }
};

// EXISTING: Helper function to show loading indicator
function showLoading(show) {
  const loadingElement = document.getElementById("loadingIndicator");
  if (loadingElement) {
    loadingElement.style.display = show ? "flex" : "none";
  }
}

// EXISTING: Helper function to show alerts
function showAlert(message, title = "Informasi", type = "info") {
  if (typeof Swal !== "undefined") {
    return Swal.fire({
      title: title,
      text: message,
      icon: type,
      confirmButtonText: "OK",
      confirmButtonColor: "#0d6efd",
    });
  } else {
    alert(message);
    return Promise.resolve();
  }
}

// EXISTING: Initialize when document is ready
document.addEventListener("DOMContentLoaded", function () {
  // Initialize the handler
  laporanStokHandler.init();
});

// EXISTING: Export the handler for potential use in other modules
export default laporanStokHandler;







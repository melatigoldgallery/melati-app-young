// Import Firebase modules
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";
import { firestore } from "./configFirebase.js";

// 📦 Production-Ready Stock Report with Incremental Updates
class OptimizedStockReport {
  constructor() {
    // Cache configuration
    this.CACHE_TTL_STANDARD = 60 * 60 * 1000; // 1 hour for historical data
    this.CACHE_TTL_TODAY = 30 * 60 * 1000; // 30 minutes for today's data
    
    // Data storage
    this.stockData = [];
    this.filteredStockData = [];
    this.cache = new Map();
    this.cacheMeta = new Map();
    
    // Real-time listeners
    this.listeners = new Map();
    this.isListeningToday = false;
    
    // Incremental update state
    this.localStockState = new Map(); // kode → current values
    this.updateBuffer = []; // Buffer untuk batch updates
    this.updateTimeout = null;
    
    // UI state
    this.isDataLoaded = false;
    this.currentSelectedDate = null;
    
    // Bind methods
    this.init = this.init.bind(this);
    this.loadAndFilterStockData = this.loadAndFilterStockData.bind(this);
    this.resetFilters = this.resetFilters.bind(this);
  }

  // Initialize the module
  init() {
    this.loadCacheFromStorage();
    this.initDatePickers();
    this.attachEventListeners();
    this.setDefaultDates();
    this.initDataTable();
    this.prepareEmptyTable();
    this.setupVisibilityListener();
    
    // Cleanup cache periodically
    setInterval(() => this.cleanupCache(), 30 * 60 * 1000); // 30 minutes
  }

  // Initialize date pickers
  initDatePickers() {
    $(".datepicker").datepicker({
      format: "dd/mm/yyyy",
      autoclose: true,
      language: "id",
      todayHighlight: true,
    });
  }

  // Set default dates
  setDefaultDates() {
    const today = new Date();
    document.getElementById("startDate").value = this.formatDate(today);
  }

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
  }

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
  }

  // Attach event listeners
  attachEventListeners() {
    const filterBtn = document.getElementById("filterStockBtn");
    if (filterBtn) {
      filterBtn.addEventListener("click", () => this.loadAndFilterStockData());
    }

    const resetBtn = document.getElementById("resetStockFilterBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => this.resetFilters());
    }
  }

  // Setup visibility listener untuk pause/resume real-time
  setupVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pauseRealtimeListeners();
      } else {
        this.resumeRealtimeListeners();
      }
    });
  }

  // Reset filters
  resetFilters() {
    const today = new Date();
    document.getElementById("startDate").value = this.formatDate(today);
    this.loadAndFilterStockData();
  }

  // Main data loading function
  async loadAndFilterStockData(forceRefresh = false) {
    try {
      this.showLoading(true);
      
      const startDateStr = document.getElementById("startDate").value;
      if (!startDateStr) {
        this.showError("Tanggal harus diisi");
        return;
      }

      const selectedDate = this.parseDate(startDateStr);
      if (!selectedDate) {
        this.showError("Format tanggal tidak valid");
        return;
      }

      this.currentSelectedDate = selectedDate;
      
      // Setup real-time listener untuk hari ini
      this.setupRealtimeListener(selectedDate);
      
      // Load stock master data
      await this.loadStockMasterData(forceRefresh);
      
      // Calculate stock untuk tanggal terpilih
      await this.calculateStockForDate(selectedDate, forceRefresh);
      
      // Initialize local state untuk incremental updates
      this.initializeLocalState();
      
      // Render table
      this.renderStockTable();
      this.isDataLoaded = true;
      
    } catch (error) {
      console.error("Error loading stock data:", error);
      this.showError("Terjadi kesalahan saat memuat data: " + error.message);
    } finally {
      this.showLoading(false);
    }
  }

  // Setup real-time listener hanya untuk hari ini
  setupRealtimeListener(selectedDate) {
    const today = new Date();
    const isToday = this.isSameDate(selectedDate, today);
    
    if (isToday && !this.isListeningToday && !document.hidden) {
      this.setupTodayListener();
      this.isListeningToday = true;
    } else if (!isToday && this.isListeningToday) {
      this.removeTodayListener();
      this.isListeningToday = false;
    }
  }

  // Setup listener untuk transaksi hari ini dengan incremental processing
  setupTodayListener() {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    console.log("📡 Setting up incremental real-time listeners");

    // Listen to stock transactions
    const transQuery = query(
      collection(firestore, "stokAksesorisTransaksi"),
      where("timestamp", ">=", Timestamp.fromDate(startOfDay)),
      where("timestamp", "<=", Timestamp.fromDate(endOfDay))
    );

    const unsubscribeTrans = onSnapshot(transQuery, (snapshot) => {
      if (!snapshot.metadata.hasPendingWrites && this.isDataLoaded) {
        console.log("📡 Processing transaction changes");
        this.processTransactionChanges(snapshot.docChanges());
      }
    });

    // Listen to stock additions
    const addQuery = query(
      collection(firestore, "stockAdditions"),
      where("timestamp", ">=", Timestamp.fromDate(startOfDay)),
      where("timestamp", "<=", Timestamp.fromDate(endOfDay))
    );

    const unsubscribeAdd = onSnapshot(addQuery, (snapshot) => {
      if (!snapshot.metadata.hasPendingWrites && this.isDataLoaded) {
        console.log("📡 Processing stock addition changes");
        this.processStockAdditionChanges(snapshot.docChanges());
      }
    });

    this.listeners.set("transactions", unsubscribeTrans);
    this.listeners.set("additions", unsubscribeAdd);
  }

  // Process ONLY document changes untuk transactions
  processTransactionChanges(docChanges) {
    docChanges.forEach((change) => {
      if (change.type === "added" || change.type === "modified") {
        const data = change.doc.data();
        
        if (data.kode) {
          this.updateBuffer.push({
            type: 'transaction',
            action: data.jenis, // tambah, laku, free, gantiLock
            kode: data.kode,
            jumlah: data.jumlah || 0,
            nama: data.nama || "",
            kategori: data.kategori || ""
          });
        }
      }
    });

    this.debounceIncrementalUpdate();
  }

  // Process ONLY document changes untuk stock additions
  processStockAdditionChanges(docChanges) {
    docChanges.forEach((change) => {
      if (change.type === "added" || change.type === "modified") {
        const data = change.doc.data();
        
        if (data.items && Array.isArray(data.items)) {
          data.items.forEach(item => {
            if (item.kodeText) {
              this.updateBuffer.push({
                type: 'addition',
                action: 'tambah',
                kode: item.kodeText,
                jumlah: parseInt(item.jumlah) || 0,
                nama: item.nama || ""
              });
            }
          });
        }
      }
    });

    this.debounceIncrementalUpdate();
  }

  // Debounce untuk menghindari update terlalu sering
  debounceIncrementalUpdate() {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    this.updateTimeout = setTimeout(() => {
      this.processIncrementalUpdates();
    }, 1000); // 1 second debounce
  }

  // Process incremental updates (ZERO additional Firestore reads)
  processIncrementalUpdates() {
    if (this.updateBuffer.length === 0) return;

    console.log(`🔄 Processing ${this.updateBuffer.length} incremental updates`);
    
    // Group updates by kode
    const updatesByKode = new Map();
    
    this.updateBuffer.forEach(update => {
      if (!updatesByKode.has(update.kode)) {
        updatesByKode.set(update.kode, {
          tambahStok: 0,
          laku: 0,
          free: 0,
          gantiLock: 0,
          nama: update.nama,
          kategori: update.kategori
        });
      }
      
      const kodeUpdates = updatesByKode.get(update.kode);
      
      switch (update.action) {
        case 'tambah':
          kodeUpdates.tambahStok += update.jumlah;
          break;
        case 'laku':
          kodeUpdates.laku += update.jumlah;
          break;
        case 'free':
          kodeUpdates.free += update.jumlah;
          break;
        case 'gantiLock':
          kodeUpdates.gantiLock += update.jumlah;
          break;
      }
    });

    // Apply updates to current data
    updatesByKode.forEach((updates, kode) => {
      this.applyIncrementalUpdate(kode, updates);
    });

    // Clear buffer
    this.updateBuffer = [];
    
    // Update UI tanpa additional reads
    this.updateUIFromLocalState();
    this.showUpdateIndicator();
  }

  // Apply incremental update ke data lokal
  applyIncrementalUpdate(kode, updates) {
    // Find item in current data
    const itemIndex = this.filteredStockData.findIndex(item => item.kode === kode);
    
    if (itemIndex !== -1) {
      const item = this.filteredStockData[itemIndex];
      
      // Apply incremental changes
      item.tambahStok += updates.tambahStok;
      item.laku += updates.laku;
      item.free += updates.free;
      item.gantiLock += updates.gantiLock;
      
      // Recalculate final stock
      item.stokAkhir = Math.max(0, 
        item.stokAwal + item.tambahStok - item.laku - item.free - item.gantiLock
      );
      
      // Update local state
      this.localStockState.set(kode, {
        tambahStok: item.tambahStok,
        laku: item.laku,
        free: item.free,
        gantiLock: item.gantiLock,
        stokAkhir: item.stokAkhir
      });
      
    } else {
      // Item baru, tambahkan ke data
      const newItem = {
        kode: kode,
        nama: updates.nama || "",
        kategori: updates.kategori || "",
        stokAwal: 0,
        tambahStok: updates.tambahStok,
        laku: updates.laku,
        free: updates.free,
        gantiLock: updates.gantiLock,
        stokAkhir: Math.max(0, updates.tambahStok - updates.laku - updates.free - updates.gantiLock)
      };
      
      this.filteredStockData.push(newItem);
      this.localStockState.set(kode, {
        tambahStok: newItem.tambahStok,
        laku: newItem.laku,
        free: newItem.free,
        gantiLock: newItem.gantiLock,
        stokAkhir: newItem.stokAkhir
      });
    }
  }

  // Initialize local state dari data yang sudah di-load
  initializeLocalState() {
    this.localStockState.clear();
    this.filteredStockData.forEach(item => {
      this.localStockState.set(item.kode, {
        tambahStok: item.tambahStok || 0,
        laku: item.laku || 0,
        free: item.free || 0,
        gantiLock: item.gantiLock || 0,
                stokAkhir: item.stokAkhir || 0
      });
    });
  }

  // Update UI dari local state (ZERO Firestore reads)
  updateUIFromLocalState() {
    // Sort data sebelum render
    this.filteredStockData.sort((a, b) => {
      if (a.kategori !== b.kategori) {
        return a.kategori === "kotak" ? -1 : 1;
      }
      return a.kode.localeCompare(b.kode);
    });

    // Re-render table
    this.renderStockTable();
    
    console.log(`✅ UI updated incrementally (0 Firestore reads)`);
  }

  // Pause real-time listeners saat page hidden
  pauseRealtimeListeners() {
    if (this.isListeningToday) {
      this.removeTodayListener();
      console.log("⏸️ Real-time listeners paused");
    }
  }

  // Resume real-time listeners saat page visible
  resumeRealtimeListeners() {
    const today = new Date();
    if (this.currentSelectedDate && this.isSameDate(this.currentSelectedDate, today) && !this.isListeningToday) {
      this.setupTodayListener();
      this.isListeningToday = true;
      console.log("▶️ Real-time listeners resumed");
    }
  }

  // Remove today's listener
  removeTodayListener() {
    this.listeners.forEach((unsubscribe, key) => {
      unsubscribe();
      console.log(`🔇 Removed listener: ${key}`);
    });
    this.listeners.clear();
    this.isListeningToday = false;
  }

  // Load stock master data dengan smart caching
  async loadStockMasterData(forceRefresh = false) {
    const cacheKey = "stockMasterData";
    
    if (!forceRefresh && this.isCacheValid(cacheKey)) {
      this.stockData = this.cache.get(cacheKey);
      return;
    }

    try {
      // Load current stock
      const stockSnapshot = await getDocs(collection(firestore, "stokAksesoris"));
      this.stockData = [];
      
      stockSnapshot.forEach((doc) => {
        this.stockData.push({ id: doc.id, ...doc.data() });
      });

      // Load all kode aksesoris
      await this.loadAllKodeAksesoris();
      
      // Cache the data
      this.setCache(cacheKey, [...this.stockData]);
      
      console.log(`✅ Loaded ${this.stockData.length} stock items`);
    } catch (error) {
      console.error("Error loading stock master data:", error);
      
      // Fallback to cache
      if (this.cache.has(cacheKey)) {
        this.stockData = this.cache.get(cacheKey);
        this.showError("Menggunakan data cache karena terjadi kesalahan");
      } else {
        throw error;
      }
    }
  }

  // Load all kode aksesoris
  async loadAllKodeAksesoris() {
    const cacheKey = "kodeAksesorisData";
    
    if (this.isCacheValid(cacheKey)) {
      const cachedData = this.cache.get(cacheKey);
      this.mergeKodeAksesoris(cachedData);
      return;
    }

    try {
      const kodeAksesorisData = [];
      
      // Get kotak and aksesoris data
      const [kotakSnapshot, aksesorisSnapshot] = await Promise.all([
        getDocs(collection(firestore, "kodeAksesoris", "kategori", "kotak")),
        getDocs(collection(firestore, "kodeAksesoris", "kategori", "aksesoris"))
      ]);

      // Process kotak data
      kotakSnapshot.forEach((doc) => {
        const data = doc.data();
        const kodeItem = this.createKodeItem(data, "kotak");
        kodeAksesorisData.push(kodeItem);
        this.mergeStockItem(kodeItem);
      });

      // Process aksesoris data
      aksesorisSnapshot.forEach((doc) => {
        const data = doc.data();
        const kodeItem = this.createKodeItem(data, "aksesoris");
        kodeAksesorisData.push(kodeItem);
        this.mergeStockItem(kodeItem);
      });

      // Cache the data
      this.setCache(cacheKey, kodeAksesorisData);
      
    } catch (error) {
      console.error("Error loading kode aksesoris:", error);
      
      // Fallback to cache
      if (this.cache.has(cacheKey)) {
        const cachedData = this.cache.get(cacheKey);
        this.mergeKodeAksesoris(cachedData);
      }
    }
  }

  // Calculate stock untuk tanggal tertentu (Data Continuity Logic)
  async calculateStockForDate(selectedDate, forceRefresh = false) {
    const dateStr = this.formatDate(selectedDate).replace(/\//g, "-");
    const cacheKey = `stock_${dateStr}`;
    
    // Check cache first (kecuali untuk hari ini atau forced refresh)
    const isToday = this.isSameDate(selectedDate, new Date());
    if (!forceRefresh && !isToday && this.isCacheValid(cacheKey)) {
      this.filteredStockData = this.cache.get(cacheKey);
      this.showCacheIndicator(true);
      return;
    }

    this.showCacheIndicator(false);

    try {
      // 1. Get base snapshot (previous day stock)
      const baseSnapshot = await this.getSnapshotAsBase(selectedDate);
      
      // 2. Calculate stock until previous day
      const previousDate = new Date(selectedDate);
      previousDate.setDate(previousDate.getDate() - 1);
      previousDate.setHours(23, 59, 59, 999);
      
      const previousStockMap = await this.calculateStockFromBase(baseSnapshot, previousDate);
      
      // 3. Get today's transactions only
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      const todayTransactions = await this.getTransactionsForDate(startOfDay, endOfDay);
      
      // 4. Calculate final stock: previous stock + today's transactions
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

      // Add items yang ada di transactions tapi tidak di master
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

      // Cache the result dengan TTL yang sesuai
      const ttl = isToday ? this.CACHE_TTL_TODAY : this.CACHE_TTL_STANDARD;
      this.setCache(cacheKey, [...this.filteredStockData], ttl);

      console.log(`✅ Calculated stock for ${dateStr}: ${this.filteredStockData.length} items`);
    } catch (error) {
      console.error("Error calculating stock for date:", error);
      throw error;
    }
  }

  // Get snapshot as base (Priority: Daily → Monthly → Empty)
  async getSnapshotAsBase(selectedDate) {
  const dateStr = this.formatDate(selectedDate).replace(/\//g, "-");
  const cacheKey = `snapshot_${dateStr}`;
  
  if (this.isCacheValid(cacheKey)) {
    const cached = this.cache.get(cacheKey);
    // PERBAIKAN: Pastikan return Map
    return cached instanceof Map ? cached : new Map();
  }

  try {
    // Priority 1: Daily snapshot (previous day)
    const previousDate = new Date(selectedDate);
    previousDate.setDate(previousDate.getDate() - 1);

    const dailySnapshot = await this.getDailySnapshot(previousDate);
    if (dailySnapshot && dailySnapshot instanceof Map && dailySnapshot.size > 0) {
      this.setCache(cacheKey, dailySnapshot);
      return dailySnapshot;
    }

    // Priority 2: Monthly snapshot
    const monthlySnapshot = await this.getMonthlySnapshot(selectedDate);
    if (monthlySnapshot && monthlySnapshot instanceof Map && monthlySnapshot.size > 0) {
      this.setCache(cacheKey, monthlySnapshot);
      return monthlySnapshot;
    }

    // Priority 3: Empty base - PERBAIKAN: Pastikan return Map
    const emptySnapshot = new Map();
    this.setCache(cacheKey, emptySnapshot);
    return emptySnapshot;
    
  } catch (error) {
    console.error("Error getting snapshot base:", error);
    return new Map(); // PERBAIKAN: Selalu return Map
  }
}

  // Get daily snapshot
  async getDailySnapshot(date) {
  const dateKey = this.formatDate(date);
  const cacheKey = `daily_snapshot_${dateKey.replace(/\//g, "-")}`;
  
  if (this.isCacheValid(cacheKey)) {
    const cached = this.cache.get(cacheKey);
    // PERBAIKAN: Handle null cache
    return cached === null ? null : (cached instanceof Map ? cached : new Map());
  }

  try {
    const dailySnapshotQuery = query(
      collection(firestore, "dailyStockSnapshot"), 
      where("date", "==", dateKey)
    );

    const querySnapshot = await getDocs(dailySnapshotQuery);

    if (querySnapshot.empty) {
      this.setCache(cacheKey, null);
      return null;
    }

    const doc = querySnapshot.docs[0];
    const data = doc.data();
    const snapshotMap = new Map(); // PERBAIKAN: Selalu buat Map baru

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

      this.setCache(cacheKey, snapshotMap);
      return snapshotMap;
    } else {
      this.setCache(cacheKey, null);
      return null;
    }
  } catch (error) {
    console.error("Error loading daily snapshot:", error);
    return null;
  }
}

  // Get monthly snapshot
  async getMonthlySnapshot(selectedDate) {
  const prevMonth = new Date(selectedDate);
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  const monthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
  const cacheKey = `monthly_snapshot_${monthKey}`;
  
  if (this.isCacheValid(cacheKey)) {
    const cached = this.cache.get(cacheKey);
    return cached instanceof Map ? cached : new Map();
  }

  try {
    const snapshotQuery = query(
      collection(firestore, "stokSnapshot"), 
      where("bulan", "==", monthKey)
    );

    const snapshot = await getDocs(snapshotQuery);
    const snapshotMap = new Map(); // PERBAIKAN: Selalu buat Map baru

    snapshot.forEach((doc) => {
      const data = doc.data();
      snapshotMap.set(data.kode, {
        stokAwal: data.stok_akhir || 0,
        nama: data.nama || "",
        kategori: data.kategori || "",
      });
    });

    this.setCache(cacheKey, snapshotMap);
    return snapshotMap;
  } catch (error) {
    console.error("Error loading monthly snapshot:", error);
    return new Map(); // PERBAIKAN: Return Map kosong, bukan null
  }
}

  // Calculate stock from base
  async calculateStockFromBase(baseSnapshot, endDate) {
    const stockMap = new Map();

    try {
      // Initialize dengan base snapshot
      baseSnapshot.forEach((data, kode) => {
        stockMap.set(kode, data.stokAwal || 0);
      });

      // Initialize items yang tidak ada di snapshot
      this.stockData.forEach((item) => {
        if (!stockMap.has(item.kode)) {
          stockMap.set(item.kode, 0);
        }
      });

      // Tentukan start date untuk calculation
      let startDate;
      if (baseSnapshot.size > 0) {
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 30); // Max 30 days back
      } else {
        startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
      }

      // Calculate transactions dari start date ke end date
      if (startDate <= endDate) {
        const transactions = await this.getTransactionsForDate(startDate, endDate);

        // Apply transactions ke stock
        transactions.forEach((trans, kode) => {
          const currentStock = stockMap.get(kode) || 0;
          const newStock = Math.max(0, currentStock + trans.tambahStok - trans.laku - trans.free - trans.gantiLock);
          stockMap.set(kode, newStock);
        });
      }

      return stockMap;
    } catch (error) {
      console.error("Error calculating stock from base:",      error);
      return stockMap;
    }
  }

  // Get transactions untuk date range dengan smart caching
  async getTransactionsForDate(startDate, endDate) {
  const startDateStr = startDate.toISOString().split("T")[0];
  const endDateStr = endDate.toISOString().split("T")[0];
  const cacheKey = `trans_${startDateStr}_${endDateStr}`;

  // Check cache first dengan TTL yang sesuai
  const isRecent = (Date.now() - endDate.getTime()) < (24 * 60 * 60 * 1000);
  const ttl = isRecent ? this.CACHE_TTL_TODAY : this.CACHE_TTL_STANDARD;
  
  if (this.isCacheValid(cacheKey, ttl)) {
    const cached = this.cache.get(cacheKey);
    // PERBAIKAN: Pastikan return Map
    return cached instanceof Map ? cached : new Map();
  }

  const transactionMap = new Map(); // PERBAIKAN: Selalu buat Map baru

  try {
    // Get stock transactions
    const transQuery = query(
      collection(firestore, "stokAksesorisTransaksi"),
      where("timestamp", ">=", Timestamp.fromDate(startDate)),
      where("timestamp", "<=", Timestamp.fromDate(endDate)),
      orderBy("timestamp", "asc")
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
    this.setCache(cacheKey, transactionMap, ttl);

    console.log(`📋 Loaded transactions: ${transactionMap.size} items`);
    return transactionMap;
  } catch (error) {
    console.error("Error getting transactions for date:", error);
    return new Map(); // PERBAIKAN: Return Map kosong, bukan null
  }
}

  // Render stock table
  renderStockTable() {
    try {
      // Destroy existing DataTable
      if ($.fn.DataTable.isDataTable("#stockTable")) {
        $("#stockTable").DataTable().destroy();
      }

      const tableBody = document.querySelector("#stockTable tbody");
      if (!tableBody) return;

      // Check if there's data to display
      if (!this.filteredStockData || this.filteredStockData.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="9" class="text-center">Tidak ada data yang sesuai dengan filter</td>
          </tr>
        `;
        this.initDataTable();
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
        const categoryClass = item.kategori === "kotak" ? "table-secondary" 
          : item.kategori === "aksesoris" ? "table-secondary" : "table-secondary";

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
            <td class="text-center"><strong>${item.stokAkhir || 0}</strong></td>
          </tr>
        `;
      });

      tableBody.innerHTML = html;

      // Initialize DataTable dengan export
      const selectedDateStr = document.getElementById("startDate").value;
      this.initDataTableWithExport(selectedDateStr);

      console.log(`🎨 Rendered table with ${this.filteredStockData.length} items`);
    } catch (error) {
      console.error("Error rendering stock table:", error);
      this.showError("Terjadi kesalahan saat menampilkan data");
    }
  }

  // Initialize DataTable dengan export buttons
  initDataTableWithExport(selectedDate) {
    $("#stockTable").DataTable({
      responsive: true,
      dom: "Bfrtip",
      ordering: false,
      pageLength: 25,
      lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "Semua"]],
      buttons: [
        {
          extend: "excel",
          text: '<i class="fas fa-file-excel me-2"></i>Excel',
          className: "btn btn-success btn-sm me-1",
          exportOptions: { columns: ":visible" },
          title: `Laporan Stok Kotak & Aksesoris Melati Atas (${selectedDate})`,
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
          },
        },
      ],
      columnDefs: [
        { className: "text-center", targets: [0, 1, 3, 4, 5, 6, 7, 8] },
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
  }

  // Helper methods untuk kode aksesoris
  createKodeItem(data, kategori) {
    return {
      id: null,
      kode: data.text,
      nama: data.nama,
      kategori: kategori,
      stokAwal: 0,
      tambahStok: 0,
      laku: 0,
      free: 0,
      gantiLock: 0,
      stokAkhir: 0,
      lastUpdate: new Date(),
    };
  }

  mergeStockItem(kodeItem) {
    const existingIndex = this.stockData.findIndex((stockItem) => stockItem.kode === kodeItem.kode);
    if (existingIndex === -1) {
      this.stockData.push(kodeItem);
    } else {
      this.stockData[existingIndex].kategori = kodeItem.kategori;
      this.stockData[existingIndex].nama = kodeItem.nama;
    }
  }

  mergeKodeAksesoris(kodeAksesorisData) {
    kodeAksesorisData.forEach((item) => {
      this.mergeStockItem(item);
    });
  }

  // Cache management methods
  setCache(key, data, customTTL = null) {
    this.cache.set(key, data);
    this.cacheMeta.set(key, {
      timestamp: Date.now(),
      ttl: customTTL || this.CACHE_TTL_STANDARD
    });
    this.saveCacheToStorage();
  }

  isCacheValid(key, customTTL = null) {
    if (!this.cache.has(key) || !this.cacheMeta.has(key)) {
      return false;
    }

    const meta = this.cacheMeta.get(key);
    const ttl = customTTL || meta.ttl;
    const isValid = (Date.now() - meta.timestamp) < ttl;
    
    if (!isValid) {
      this.cache.delete(key);
      this.cacheMeta.delete(key);
    }
    
    return isValid;
  }

  cleanupCache() {
    const now = Date.now();
    const keysToDelete = [];

    this.cacheMeta.forEach((meta, key) => {
      if (now - meta.timestamp > meta.ttl) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.cacheMeta.delete(key);
    });

    if (keysToDelete.length > 0) {
      console.log(`🧹 Cleaned up ${keysToDelete.length} expired cache entries`);
      this.saveCacheToStorage();
    }
  }

  loadCacheFromStorage() {
    try {
      const cacheData = localStorage.getItem("optimizedStockCache");
      const metaData = localStorage.getItem("optimizedStockCacheMeta");

      if (cacheData) {
        const parsed = JSON.parse(cacheData);
        Object.entries(parsed).forEach(([key, value]) => {
          this.cache.set(key, value);
        });
      }

      if (metaData) {
        const parsed = JSON.parse(metaData);
        Object.entries(parsed).forEach(([key, value]) => {
          this.cacheMeta.set(key, value);
        });
      }

      console.log(`💾 Loaded cache: ${this.cache.size} entries`);
    } catch (error) {
      console.warn("Failed to load cache from localStorage:", error);
    }
  }

  saveCacheToStorage() {
    try {
      const cacheData = {};
      const metaData = {};

      this.cache.forEach((value, key) => {
        cacheData[key] = value;
      });

      this.cacheMeta.forEach((value, key) => {
        metaData[key] = value;
      });

      localStorage.setItem("optimizedStockCache", JSON.stringify(cacheData));
      localStorage.setItem("optimizedStockCacheMeta", JSON.stringify(metaData));
    } catch (error) {
      console.warn("Failed to save cache to localStorage:", error);
    }
  }

  // UI helper methods
  showCacheIndicator(show) {
    let indicator = document.getElementById("cacheIndicator");

    if (show && !indicator) {
      indicator = document.createElement("div");
      indicator.id = "cacheIndicator";
      indicator.className = "alert alert-info mb-2";
      indicator.innerHTML = '<i class="fas fa-database me-2"></i>Menggunakan data cache';

      const tableContainer = document.querySelector("#stockTable").parentElement;
      tableContainer.insertBefore(indicator, tableContainer.firstChild);
    }

    if (indicator) {
      indicator.style.display = show ? "block" : "none";
    }
  }

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
      <i class="fas fa-bolt me-2"></i>
      Data telah diperbarui secara real-time
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    const tableContainer = document.querySelector("#stockTable").parentElement;
    tableContainer.insertBefore(indicator, tableContainer.firstChild);

    // Auto remove after 3 seconds
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.remove();
      }
    }, 3000);
  }

  showLoading(isLoading) {
    let loadingIndicator = document.getElementById("loadingIndicator");
    
    if (isLoading && !loadingIndicator) {
      loadingIndicator = document.createElement("div");
      loadingIndicator.id = "loadingIndicator";
      loadingIndicator.className = "position-fixed top-0 start-0 w-100  h-100 d-flex align-items-center justify-content-center";
      loadingIndicator.style.cssText = "background: rgba(0,0,0,0.5); z-index: 9999;";
      loadingIndicator.innerHTML = `
        <div class="bg-white rounded p-4 text-center shadow">
          <div class="spinner-border text-primary mb-3" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <div class="fw-bold">Memuat Data Stok...</div>
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
  }

  showError(message) {
    if (typeof Swal !== "undefined") {
      Swal.fire({
        icon: "error",
        title: "Terjadi Kesalahan!",
        text: message,
        confirmButtonColor: "#dc3545",
      });
    } else {
      alert("Error: " + message);
    }
  }

  showSuccess(message) {
    if (typeof Swal !== "undefined") {
      Swal.fire({
        icon: "success",
        title: "Berhasil!",
        text: message,
        confirmButtonColor: "#28a745",
        timer: 2000,
        timerProgressBar: true,
      });
    } else {
      alert("Success: " + message);
    }
  }

  // Utility methods
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

  parseDate(dateString) {
    if (!dateString) return null;
    try {
      const parts = dateString.split("/");
      if (parts.length !== 3) return null;
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    } catch (error) {
      console.error("Error parsing date:", error);
      return null;
    }
  }

  isSameDate(date1, date2) {
    if (!date1 || !date2) return false;
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  // Cleanup method
  destroy() {
    console.log("🧹 Destroying Optimized Stock Report");
    
    // Remove listeners
    this.removeTodayListener();
    
    // Clear timeouts
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }
    
    // Destroy DataTable
    if ($.fn.DataTable.isDataTable("#stockTable")) {
      $("#stockTable").DataTable().destroy();
    }
    
    // Clear data
    this.stockData = [];
    this.filteredStockData = [];
    this.localStockState.clear();
    this.updateBuffer = [];
    this.isDataLoaded = false;
    this.currentSelectedDate = null;
    this.isListeningToday = false;
    
    console.log("✅ Optimized Stock Report destroyed");
  }
}

// Create global instance
const optimizedStockReport = new OptimizedStockReport();

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
    
    // Initialize the optimized handler
    optimizedStockReport.init();
    
    console.log("✅ Production Stock Report System initialized successfully");
    
  } catch (error) {
    console.error("❌ Failed to initialize Stock Report System:", error);
    
    // Fallback to basic functionality
    if (typeof laporanStokHandler !== 'undefined') {
      console.log("🔄 Falling back to basic stock report handler");
      laporanStokHandler.init();
    }
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  optimizedStockReport.destroy();
});

// Add keyboard shortcuts
document.addEventListener('keydown', function(event) {
  // F5 - Refresh current data
  if (event.key === 'F5' && optimizedStockReport.isDataLoaded) {
    event.preventDefault();
    optimizedStockReport.loadAndFilterStockData(true);
  }
  
  // Ctrl+P - Print
  if (event.ctrlKey && event.key === 'p' && optimizedStockReport.filteredStockData.length > 0) {
    event.preventDefault();
    window.print();
  }
});

// Export for potential use in other modules
export { optimizedStockReport as default };

// Backward compatibility
window.optimizedStockReport = optimizedStockReport;

console.log("📦 Production Stock Report Module loaded successfully");




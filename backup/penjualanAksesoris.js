import { firestore } from "../js/configFirebase.js";
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

// Global variables
let activeLockRow = null;
let currentTransactionData = null;

// Enhanced Cache management with localStorage and TTL - mengadopsi dari kehadiran.js
const cacheManager = {
  prefix: "melati_penjualan_",
  stockTTL: 10 * 60 * 1000, // 10 menit untuk data stok
  salesTTL: 2 * 60 * 1000, // 2 menit untuk data penjualan
  todayTTL: 1 * 60 * 1000, // 1 menit untuk data hari ini

  set(key, data, ttl) {
    try {
      const item = {
        data,
        timestamp: Date.now(),
        ttl,
        version: Date.now(),
      };
      localStorage.setItem(this.prefix + key, JSON.stringify(item));
    } catch (error) {
      console.warn("Cache set failed:", error);
      this.clearOldCache();
      try {
        localStorage.setItem(this.prefix + key, JSON.stringify(item));
      } catch (retryError) {
        console.error("Cache retry failed:", retryError);
      }
    }
  },

  get(key) {
    try {
      const item = JSON.parse(localStorage.getItem(this.prefix + key));
      if (!item) return null;

      if (Date.now() - item.timestamp > item.ttl) {
        this.remove(key);
        return null;
      }

      return item.data;
    } catch (error) {
      console.warn("Cache get failed:", error);
      this.remove(key);
      return null;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch (error) {
      console.warn("Cache remove failed:", error);
    }
  },

  clear() {
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(this.prefix))
        .forEach((key) => localStorage.removeItem(key));
    } catch (error) {
      console.warn("Cache clear failed:", error);
    }
  },

  clearOldCache() {
    const now = Date.now();
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(this.prefix))
        .forEach((key) => {
          try {
            const item = JSON.parse(localStorage.getItem(key));
            if (item && now - item.timestamp > item.ttl) {
              localStorage.removeItem(key);
            }
          } catch (error) {
            localStorage.removeItem(key);
          }
        });
    } catch (error) {
      console.warn("Clear old cache failed:", error);
    }
  },

  // Cek apakah cache perlu diperbarui
  shouldUpdateCache(key) {
    const item = localStorage.getItem(this.prefix + key);
    if (!item) return true;

    try {
      const parsed = JSON.parse(item);
      const now = Date.now();
      
      // Jika cache untuk data hari ini, gunakan TTL yang lebih pendek
      const today = this.getLocalDateString();
      if (key.includes(today)) {
        return (now - parsed.timestamp) > this.todayTTL;
      }
      
      return (now - parsed.timestamp) > parsed.ttl;
    } catch (error) {
      return true;
    }
  },

  // Helper untuk mendapatkan tanggal hari ini
  getLocalDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // Get cache info for debugging
  getCacheInfo() {
    const info = {};
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(this.prefix))
        .forEach((key) => {
          try {
            const item = JSON.parse(localStorage.getItem(key));
            const age = Date.now() - item.timestamp;
            info[key.replace(this.prefix, "")] = {
              age: Math.round(age / 1000) + "s",
              valid: age < item.ttl,
              size: JSON.stringify(item.data).length,
            };
          } catch (error) {
            info[key.replace(this.prefix, "")] = "corrupted";
          }
        });
    } catch (error) {
      console.warn("Get cache info failed:", error);
    }
    return info;
  },
};

// Utility functions
const utils = {
  showAlert: (message, title = "Informasi", type = "info") => {
    return Swal.fire({
      title,
      text: message,
      icon: type,
      confirmButtonText: "OK",
      confirmButtonColor: "#0d6efd",
    });
  },

  showConfirm: (message, title = "Konfirmasi") => {
    return Swal.fire({
      title,
      text: message,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Ya",
      cancelButtonText: "Batal",
      confirmButtonColor: "#0d6efd",
      cancelButtonColor: "#6c757d",
    }).then((result) => result.isConfirmed);
  },

  formatDate: (date) => {
    if (!date) return "";
    try {
      const d = date.toDate ? date.toDate() : date instanceof Date ? date : new Date(date);
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (error) {
      console.error("Error formatting date:", error);
      return "";
    }
  },

  parseDate: (dateString) => {
    if (!dateString) return null;
    try {
      const parts = dateString.split("/");
      return new Date(parts[2], parts[1] - 1, parts[0]);
    } catch (error) {
      console.error("Error parsing date:", error);
      return null;
    }
  },

  formatRupiah: (angka) => {
    if (!angka && angka !== 0) return "0";
    const number = typeof angka === "string" ? parseInt(angka.replace(/\./g, "")) : angka;
    return new Intl.NumberFormat("id-ID").format(number);
  },

  showLoading: (show) => {
    const loader = document.getElementById("loadingIndicator");
    if (loader) loader.style.display = show ? "flex" : "none";
  },

  debounce: (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  throttle: (func, limit) => {
    let inThrottle;
    return function () {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  },
};

// Main application handler
const penjualanHandler = {
  stockData: [],
  salesData: [],
  stockCache: new Map(),
  lastStockUpdate: 0,
  dataTable: null,
  isLoadingStock: false,
  isLoadingSales: false,
  refreshInterval: null,

  // Initialize application
  async init() {
    this.setupEventListeners();
    this.initDatePicker();
    this.setDefaultDate();

    // Load data with cache
    await Promise.all([this.loadStockData(), this.loadTodaySales()]);

    this.updateUIForSalesType("aksesoris");
    $("#sales").focus();

    // Auto refresh dengan interval yang lebih panjang
    this.startAutoRefresh();

    // Log cache info for debugging
    console.log("Cache info:", cacheManager.getCacheInfo());
  },

  // Setup all event listeners
  setupEventListeners() {
    // Sales type change
    $("#jenisPenjualan").on("change", (e) => {
      this.updateUIForSalesType(e.target.value);
    });

    // Payment method change
    $("#metodeBayar").on("change", (e) => {
      this.handlePaymentMethodChange(e.target.value);
    });

    // Button events
    $("#btnTambah").on("click", () => this.showStockModal());
    $("#btnTambahBaris").on("click", () => this.addNewRow("manual"));
    $("#btnSimpanPenjualan").on("click", () => this.saveTransaction());
    $("#btnBatal").on("click", () => this.resetForm());
    $("#btnPrintReceipt").on("click", (e) => {
      e.preventDefault();
      this.printDocument("receipt");
    });

    $("#btnPrintInvoice").on("click", (e) => {
      e.preventDefault();
      this.printDocument("invoice");
    });
    $("#refreshStok").on("click", () => this.refreshStock());

    // Input events with debouncing
    $("#jumlahBayar").on(
      "input",
      utils.debounce(() => this.calculateKembalian(), 300)
    );
    $("#nominalDP").on(
      "input",
      utils.debounce(() => this.calculateSisaPembayaran(), 300)
    );

    $("#jumlahBayar, #nominalDP").on("blur", function () {
      const value = $(this).val().replace(/\./g, "");
      $(this).val(utils.formatRupiah(parseInt(value || 0)));
    });

    // Search events with throttling
    $("#searchAksesoris, #searchKotak, #searchLock").on(
      "input",
      utils.throttle((e) => {
        this.searchTable(e.target);
      }, 300)
    );

    // Sales validation
    $("#sales").on("blur", () => this.validateSales());
    $("#sales").on("focus", function () {
      $(this).removeClass("is-invalid is-valid");
      $(this).next(".invalid-feedback").remove();
    });
  },

  // Start auto refresh dengan interval yang lebih efisien
  startAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    // Refresh sales data setiap 2 menit (lebih jarang)
    this.refreshInterval = setInterval(async () => {
      try {
        // Hanya refresh jika tidak sedang loading
        if (!this.isLoadingSales) {
          await this.loadTodaySales(false); // Gunakan cache jika masih valid
          console.log("Auto-refreshed sales data");
        }
      } catch (error) {
        console.error("Auto-refresh failed:", error);
      }
    }, 2 * 60 * 1000); // 2 menit

    // Refresh stock data setiap 10 menit (lebih jarang)
    setInterval(async () => {
      try {
        if (!this.isLoadingStock) {
          // Hanya refresh jika cache sudah expired
          if (cacheManager.shouldUpdateCache("stockData")) {
            await this.loadStockData(true);
            console.log("Auto-refreshed stock data");
          }
        }
      } catch (error) {
        console.error("Stock auto-refresh failed:", error);
      }
    }, 10 * 60 * 1000); // 10 menit
  },

  // Initialize date picker
  initDatePicker() {
    $("#tanggal").datepicker({
      format: "dd/mm/yyyy",
      autoclose: true,
      language: "id",
      todayHighlight: true,
    });

    $("#calendarIcon").on("click", () => $("#tanggal").datepicker("show"));
  },

  // Set default date
  setDefaultDate() {
    const today = new Date();
    $("#tanggal").val(utils.formatDate(today));
  },

  // Load stock data with smart caching - mengadopsi dari kehadiran.js
  async loadStockData(forceRefresh = false) {
  if (this.isLoadingStock) return;

  try {
    this.isLoadingStock = true;
    const cacheKey = "stockData";

    // ✅ PERTAHANKAN: Check in-memory cache first (fastest)
    const cacheAge = Date.now() - this.lastStockUpdate;
    if (!forceRefresh && cacheAge < 2 * 60 * 1000 && this.stockData.length > 0) {
      console.log("📦 Using in-memory stock cache");
      this.populateStockTables();
      return;
    }

    // ✅ PERTAHANKAN: Check localStorage cache dengan smart TTL
    if (!forceRefresh && !cacheManager.shouldUpdateCache(cacheKey)) {
      const cachedData = cacheManager.get(cacheKey);
      if (cachedData) {
        console.log("📦 Using localStorage stock cache");
        this.stockData = cachedData;
        this.stockCache.clear();
        this.stockData.forEach((item) => {
          this.stockCache.set(item.kode, item.stokAkhir);
        });
        this.lastStockUpdate = Date.now();
        this.populateStockTables();
        return;
      }
    }

    utils.showLoading(true);
    console.log("🔄 Fetching fresh stock data from Firestore");

    // ✅ PERBAIKAN: Gunakan query sederhana seperti kode asli Anda
    // Batching tidak diperlukan untuk collection stok yang relatif kecil
    const stockSnapshot = await getDocs(
      query(
        collection(firestore, "stokAksesoris"),
        where("stokAkhir", ">", 0)
      )
    );

    const stockData = [];
    stockSnapshot.forEach((doc) => {
      const data = doc.data();
      stockData.push({
        id: doc.id,
        ...data,
        lastChecked: Date.now(),
      });
      
      this.stockCache.set(data.kode, data.stokAkhir || 0);
    });

    // ✅ PERTAHANKAN: Cache dengan TTL yang sesuai
    cacheManager.set(cacheKey, stockData, cacheManager.stockTTL);
    this.stockData = stockData;
    this.lastStockUpdate = Date.now();
    
    // ✅ TAMBAHAN: Simpan timestamp untuk change detection
    localStorage.setItem("lastStockUpdateTime", Date.now().toString());

    this.populateStockTables();
    
    console.log(`✅ Loaded ${stockData.length} stock items from Firestore`);

  } catch (error) {
    console.error("Error loading stock:", error);

    // ✅ PERTAHANKAN: Fallback ke cache jika ada error
    const cachedData = cacheManager.get("stockData");
    if (cachedData) {
      console.log("📦 Using cached stock data due to error");
      this.stockData = cachedData;
      
      // ✅ TAMBAHAN: Rebuild stockCache dari cached data
      this.stockCache.clear();
      this.stockData.forEach((item) => {
        this.stockCache.set(item.kode, item.stokAkhir);
      });
      
      this.populateStockTables();
    } else {
      utils.showAlert("Gagal memuat data stok: " + error.message, "Error", "error");
    }
  } finally {
    this.isLoadingStock = false;
    utils.showLoading(false);
  }
},

  // Optimized stock checking dengan cache yang efisien
  async getStockForItem(kode) {
    // Check in-memory cache first
    if (this.stockCache.has(kode)) {
      const cachedStock = this.stockCache.get(kode);
      const cacheAge = Date.now() - this.lastStockUpdate;

      // Jika cache masih fresh (< 2 menit), gunakan cache
      if (cacheAge < 2 * 60 * 1000) {
        return cachedStock;
      }
    }

    // Jika tidak ada di cache atau cache expired, ambil dari stockData
    const stockItem = this.stockData.find((item) => item.kode === kode);
    if (stockItem) {
      this.stockCache.set(kode, stockItem.stokAkhir);
      return stockItem.stokAkhir;
    }

    // Last resort: query Firestore (jarang terjadi)
    try {
      const stockQuery = query(collection(firestore, "stokAksesoris"), where("kode", "==", kode));
      const stockSnapshot = await getDocs(stockQuery);

      if (!stockSnapshot.empty) {
        const stock = stockSnapshot.docs[0].data().stokAkhir || 0;
        this.stockCache.set(kode, stock);
        return stock;
      }
    } catch (error) {
      console.warn("Failed to get stock for", kode, error);
    }

    return 0;
  },

  // Load today's sales data dengan smart caching
  async loadTodaySales(forceRefresh = false) {
    if (this.isLoadingSales) return;

    try {
      this.isLoadingSales = true;
      const today = cacheManager.getLocalDateString();
      const cacheKey = `todaySales_${today}`;

      // Check cache dengan TTL yang lebih pendek untuk data hari ini
      if (!forceRefresh && !cacheManager.shouldUpdateCache(cacheKey)) {
        const cachedData = cacheManager.get(cacheKey);
        if (cachedData) {
          console.log("Using cached sales data");
          this.salesData = cachedData;
          return;
        }
      }

      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      const tomorrow = new Date(todayDate);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const q = query(
        collection(firestore, "penjualanAksesoris"),
        where("timestamp", ">=", Timestamp.fromDate(todayDate)),
        where("timestamp", "<", Timestamp.fromDate(tomorrow)),
        orderBy("timestamp", "desc")
      );

      const snapshot = await getDocs(q);
      const salesData = [];

      snapshot.forEach((doc) => {
        salesData.push({ id: doc.id, ...doc.data() });
      });

      // Cache dengan TTL khusus untuk data hari ini
      cacheManager.set(cacheKey, salesData, cacheManager.todayTTL);
      this.salesData = salesData;
    } catch (error) {
      console.error("Error loading sales:", error);
      
      // Fallback ke cache
      const today = cacheManager.getLocalDateString();
      const cachedData = cacheManager.get(`todaySales_${today}`);
      if (cachedData) {
        console.log("Using cached sales data due to error");
        this.salesData = cachedData;
      } else {
        utils.showAlert("Gagal memuat data penjualan: " + error.message, "Error", "error");
      }
    } finally {
      this.isLoadingSales = false;
    }
  },

  // Populate stock tables
  populateStockTables() {
    const categories = {
      aksesoris: "#tableAksesoris",
      kotak: "#tableKotak",
    };

    Object.entries(categories).forEach(([category, selector]) => {
      const tbody = $(`${selector} tbody`);
      tbody.empty();

      const items = this.stockData.filter((item) => item.kategori === category);

      if (items.length === 0) {
        tbody.append(`<tr><td colspan="2" class="text-center">Tidak ada data ${category}</td></tr>`);
      } else {
        items.forEach((item) => {
          const row = `
          <tr data-kode="${item.kode}" data-nama="${item.nama}" data-harga="${item.hargaJual || 0}">
            <td>${item.kode || "-"}</td>
            <td>${item.nama || "-"}</td>
          </tr>
        `;
          tbody.append(row);
        });
      }
    });

    // Populate lock table (using aksesoris data)
    const lockTable = $("#tableLock tbody");
    lockTable.empty();

    const lockItems = this.stockData.filter((item) => item.kategori === "aksesoris");

    if (lockItems.length === 0) {
      lockTable.append('<tr><td colspan="2" class="text-center">Tidak ada data lock</td></tr>');
    } else {
      lockItems.forEach((item) => {
        const row = `
        <tr data-kode="${item.kode}" data-nama="${item.nama}" data-harga="${item.hargaJual || 0}">
          <td>${item.kode || "-"}</td>
          <td>${item.nama || "-"}</td>
        </tr>
      `;
        lockTable.append(row);
      });
    }

    // Attach click handlers
    this.attachTableRowClickHandlers();
  },

  // Attach table row click handlers
  attachTableRowClickHandlers() {
    // Remove existing handlers to prevent duplicates
    $("#tableAksesoris tbody tr, #tableKotak tbody tr, #tableLock tbody tr").off("click");

    // Aksesoris table
    $("#tableAksesoris tbody tr").on("click", function () {
      if ($(this).data("kode")) {
        const data = {
          kode: $(this).data("kode"),
          nama: $(this).data("nama"),
          harga: $(this).data("harga"),
        };
        penjualanHandler.addAksesorisToTable(data);
        $("#modalPilihAksesoris").modal("hide");
      }
    });

    // Kotak table
    $("#tableKotak tbody tr").on("click", function () {
      if ($(this).data("kode")) {
        const data = {
          kode: $(this).data("kode"),
          nama: $(this).data("nama"),
          harga: $(this).data("harga"),
        };
        penjualanHandler.addKotakToTable(data);
        $("#modalPilihKotak").modal("hide");
      }
    });

    // Lock table
    $("#tableLock tbody tr").on("click", function () {
      if ($(this).data("kode") && activeLockRow) {
        const kode = $(this).data("kode");

        if (activeLockRow.hasClass("input-row")) {
          $("#manualInputKodeLock").val(kode);
        } else {
          activeLockRow.find(".kode-lock-input").val(kode);
        }

        activeLockRow = null;
        $("#modalPilihLock").modal("hide");
      }
    });
  },

  // Show stock modal based on sales type
  showStockModal() {
    const salesType = $("#jenisPenjualan").val();

    if (salesType === "aksesoris") {
      $("#modalPilihAksesoris").modal("show");
    } else if (salesType === "kotak") {
      $("#modalPilihKotak").modal("show");
    }
  },

  // Add aksesoris to table
  addAksesorisToTable(data) {
    const { kode, nama, harga } = data;
    const newRow = `
    <tr>
      <td>${kode}</td>
      <td>${nama}</td>
      <td>
        <input type="number" class="form-control form-control-sm jumlah-input" value="1" min="1">
      </td>
      <td>
        <input type="text" class="form-control form-control-sm kadar-input" value="" placeholder="Masukkan kadar" required>
      </td>
      <td>
        <input type="text" class="form-control form-control-sm berat-input" value="" placeholder="0.00" required>
      </td>
      <td>
        <input type="text" class="form-control form-control-sm harga-per-gram-input" value="0" readonly>
      </td>
      <td>
        <input type="text" class="form-control form-control-sm total-harga-input" value="" placeholder="Masukkan harga" required>
      </td>
      <td>
        <button class="btn btn-sm btn-danger btn-delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>
  `;

    $("#tableAksesorisDetail tbody").append(newRow);
    const $newRow = $("#tableAksesorisDetail tbody tr:last-child");
    $newRow.find(".kadar-input").focus();
    this.attachRowEventHandlers($newRow);
    this.updateGrandTotal("aksesoris");
  },

  // Add kotak to table
  addKotakToTable(data) {
    const { kode, nama, harga } = data;
    const jumlah = 1;
    const hargaSatuan = harga;
    const totalHarga = jumlah * hargaSatuan;

    const newRow = `
    <tr>
      <td>${kode}</td>
      <td>${nama}</td>
      <td>
        <input type="number" class="form-control form-control-sm jumlah-input" value="${jumlah}" min="1">
      </td>
      <td>
        <input type="text" class="form-control form-control-sm harga-input" value="${utils.formatRupiah(
          hargaSatuan
        )}" placeholder="Masukkan harga" required>
      </td>
      <td class="total-harga">${utils.formatRupiah(totalHarga)}</td>
      <td>
        <button class="btn btn-sm btn-danger btn-delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>
  `;

    $("#tableKotakDetail tbody").append(newRow);
    const $newRow = $("#tableKotakDetail tbody tr:last-child");

    // Focus ke harga input untuk kotak
    $newRow.find(".harga-input").focus().select();

    this.attachRowEventHandlers($newRow);
    this.updateGrandTotal("kotak");
  },

  // Attach row event handlers
  attachRowEventHandlers($row) {
    // Remove existing handlers
    $row.find("input, button").off();

    if ($row.closest("table").attr("id") === "tableAksesorisDetail") {
      this.attachAksesorisRowHandlers($row);
    } else if ($row.closest("table").attr("id") === "tableKotakDetail") {
      this.attachKotakRowHandlers($row);
    }

    // Delete button handler
    $row.find(".btn-delete").on("click", () => {
      const tableId = $row.closest("table").attr("id");
      const salesType =
        tableId === "tableAksesorisDetail" ? "aksesoris" : tableId === "tableKotakDetail" ? "kotak" : "manual";
      $row.remove();
      this.updateGrandTotal(salesType);
    });
  },

  // Attach aksesoris row handlers
  attachAksesorisRowHandlers($row) {
    const $beratInput = $row.find(".berat-input");
    const $totalHargaInput = $row.find(".total-harga-input");
    const $hargaPerGramInput = $row.find(".harga-per-gram-input");
    const $kadarInput = $row.find(".kadar-input");
    const $jumlahInput = $row.find(".jumlah-input");

    // Calculate harga per gram
    const calculateHargaPerGram = () => {
      const berat = parseFloat($beratInput.val()) || 0;
      let totalHarga = $totalHargaInput.val().replace(/\./g, "");
      totalHarga = parseFloat(totalHarga) || 0;

      let hargaPerGram = 0;
      if (berat > 0) {
        hargaPerGram = totalHarga / berat;
      }

      $hargaPerGramInput.val(utils.formatRupiah(Math.round(hargaPerGram)));
      this.updateGrandTotal("aksesoris");
    };

    $totalHargaInput.add($beratInput).on("input", calculateHargaPerGram);
    $jumlahInput.on("input", () => this.updateGrandTotal("aksesoris"));

    // Format total harga
    $totalHargaInput.on("blur", function () {
      const value = $(this).val().replace(/\./g, "");
      $(this).val(utils.formatRupiah(parseInt(value || 0)));
    });

    // Enter key navigation untuk aksesoris
    $kadarInput.on("keypress", (e) => {
      if (e.which === 13) {
        e.preventDefault();
        $beratInput.focus();
      }
    });

    $beratInput.on("keypress", (e) => {
      if (e.which === 13) {
        e.preventDefault();
        $totalHargaInput.focus().select();
      }
    });

    $totalHargaInput.on("keypress", (e) => {
      if (e.which === 13) {
        e.preventDefault();
        const value = $totalHargaInput.val().replace(/\./g, "");
        $totalHargaInput.val(utils.formatRupiah(parseInt(value || 0)));
        calculateHargaPerGram();

        // Langsung ke jumlah bayar
        $("#jumlahBayar").focus();
      }
    });
  },

  // Attach kotak row handlers
  attachKotakRowHandlers($row) {
    const $jumlahInput = $row.find(".jumlah-input");
    const $hargaInput = $row.find(".harga-input");
    const $totalCell = $row.find(".total-harga");

    const calculateTotal = () => {
      const jumlah = parseInt($jumlahInput.val());
      const harga = parseInt($hargaInput.val().replace(/\./g, "")) || 0;
      const total = jumlah * harga;
      $totalCell.text(utils.formatRupiah(total));
      this.updateGrandTotal("kotak");
    };

    $jumlahInput.add($hargaInput).on("input", calculateTotal);

    // Format harga saat blur
    $hargaInput.on("blur", function () {
      const value = $(this).val().replace(/\./g, "");
      $(this).val(utils.formatRupiah(parseInt(value)));
    });

    // Enter key navigation untuk kotak
    $hargaInput.on("keypress", (e) => {
      if (e.which === 13) {
        e.preventDefault();
        const value = $hargaInput.val().replace(/\./g, "");
        $hargaInput.val(utils.formatRupiah(parseInt(value)));
        calculateTotal();

        // Langsung ke jumlah bayar
        $("#jumlahBayar").focus();
      }
    });

    // Enter key navigation untuk jumlah
    $jumlahInput.on("keypress", (e) => {
      if (e.which === 13) {
        e.preventDefault();
        $hargaInput.focus().select();
      }
    });
  },

  // Update UI for sales type
  updateUIForSalesType(type) {
    // Hide all containers
    $("#aksesorisTableContainer, #kotakTableContainer, #manualTableContainer").hide();
    $("#btnTambah, #btnTambahBaris").hide();

    let detailTitle = "Detail Barang";

    switch (type) {
      case "aksesoris":
        $("#aksesorisTableContainer").show();
        $("#btnTambah").show();
        detailTitle = "Detail Aksesoris";
        break;
      case "kotak":
        $("#kotakTableContainer").show();
        $("#btnTambah").show();
        detailTitle = "Detail Kotak";
        break;
      case "manual":
        $("#manualTableContainer").show();
        $("#btnTambahBaris").show();
        detailTitle = "Detail Penjualan Manual";
        this.resetTableAndAddInputRow("manual");
        break;
    }

    $("#detailTitle").text(detailTitle);
    this.updatePaymentMethodOptions(type);
  },

  // Update payment method options
  updatePaymentMethodOptions(salesType) {
    const currentMethod = $("#metodeBayar").val();
    $("#metodeBayar").empty();

    $("#metodeBayar").append('<option value="tunai">Tunai</option>');

    if (salesType === "manual") {
      $("#metodeBayar").append('<option value="dp">DP</option>');
    }

    if (salesType === "kotak" || salesType === "aksesoris") {
      $("#metodeBayar").append('<option value="free">Free</option>');
    }

    if ($("#metodeBayar option[value='" + currentMethod + "']").length > 0) {
      $("#metodeBayar").val(currentMethod);
    } else {
      $("#metodeBayar").val("tunai");
    }

    $("#metodeBayar").trigger("change");
  },

  // Handle payment method change
  handlePaymentMethodChange(method) {
    const salesType = $("#jenisPenjualan").val();

    if (method === "free") {
      $(".payment-field, .dp-field").hide();
      $("#totalOngkos").val("0");
    } else if (method === "dp") {
      if (salesType === "manual") {
        $(".payment-field, .dp-field").show();
      } else {
        $("#metodeBayar").val("tunai");
        $(".payment-field").show();
        $(".dp-field").hide();
      }
      this.updateTotal();
    } else {
      $(".payment-field").show();
      $(".dp-field").hide();
      this.updateTotal();
    }
  },

  // Reset table and add input row for manual
  resetTableAndAddInputRow(type) {
    $("#tableManualDetail tbody").empty();

    const inputRow = `
    <tr class="input-row">
      <td><input type="text" class="form-control form-control-sm" id="manualInputKode" placeholder="Kode"></td>
      <td><input type="text" class="form-control form-control-sm" id="manualInputNamaBarang" placeholder="Nama barang"></td>
      <td>
        <div class="input-group input-group-sm">
          <input type="text" class="form-control" id="manualInputKodeLock" placeholder="Pilih kode" readonly>
          <button class="btn btn-outline-secondary" id="manualBtnPilihKodeLock" type="button">
            <i class="fas fa-search"></i>
          </button>
        </div>
      </td>
      <td><input type="text" class="form-control form-control-sm" id="manualInputKadar" placeholder="Kadar" required></td>
      <td><input type="text" class="form-control form-control-sm" id="manualInputBerat" placeholder="0.00" required></td>
      <td><input type="text" class="form-control form-control-sm" id="manualInputHargaPerGram" placeholder="0" readonly></td>
      <td><input type="text" class="form-control form-control-sm" id="manualInputTotalHarga" placeholder="Masukkan harga" required></td>
      <td><input type="text" class="form-control form-control-sm" id="manualInputKeterangan" placeholder="Keterangan"></td>
      <td></td>
    </tr>
  `;

    $("#tableManualDetail tbody").append(inputRow);
    this.attachManualInputHandlers();
    $("#manualInputKode").focus();
  },

  // Attach manual input handlers
  attachManualInputHandlers() {
    // Remove existing handlers
    $("#manualBtnPilihKodeLock").off("click");
    $("#manualInputBerat, #manualInputTotalHarga").off("input");

    // Pilih kode lock button
    $("#manualBtnPilihKodeLock").on("click", function () {
      activeLockRow = $(this).closest("tr");
      $("#modalPilihLock").modal("show");
    });

    // Calculate harga per gram
    $("#manualInputBerat, #manualInputTotalHarga").on("input", () => {
      this.calculateHargaPerGram("manual");
    });

    // Enter key navigation
    const inputs = [
      "#manualInputKode",
      "#manualInputNamaBarang",
      "#manualInputKadar",
      "#manualInputBerat",
      "#manualInputTotalHarga",
      "#manualInputKeterangan",
    ];

    inputs.forEach((selector, index) => {
      $(selector)
        .off("keypress")
        .on("keypress", (e) => {
          if (e.which === 13) {
            e.preventDefault();
            if (index < inputs.length - 1) {
              $(inputs[index + 1]).focus();
            } else {
              this.addNewRow("manual");
            }
          }
        });
    });
  },

  // Calculate harga per gram for manual
  calculateHargaPerGram(type) {
    const berat = parseFloat($(`#${type}InputBerat`).val()) || 0;
    const totalHarga = parseFloat($(`#${type}InputTotalHarga`).val().replace(/\./g, "")) || 0;

    let hargaPerGram = 0;
    if (berat > 0) {
      hargaPerGram = totalHarga / berat;
    }

    $(`#${type}InputHargaPerGram`).val(utils.formatRupiah(Math.round(hargaPerGram)));
  },

  // Add new row for manual
  addNewRow(type) {
    const kode = $(`#${type}InputKode`).val() || "-";
    const namaBarang = $(`#${type}InputNamaBarang`).val();
    const kodeLock = $(`#${type}InputKodeLock`).val() || "-";
    const kadar = $(`#${type}InputKadar`).val() || "-";
    const berat = $(`#${type}InputBerat`).val() || 0;
    const totalHargaValue = $(`#${type}InputTotalHarga`).val() || "0";
    const totalHarga = parseFloat(totalHargaValue.replace(/\./g, "")) || 0;
    const hargaPerGram = $(`#${type}InputHargaPerGram`).val() || "0";
    const keterangan = $(`#${type}InputKeterangan`).val() || "";

    // Validation
    if (!namaBarang) {
      utils.showAlert("Nama barang harus diisi!");
      $(`#${type}InputNamaBarang`).focus();
      return;
    }
    if (!kadar) {
      utils.showAlert("Kadar harus diisi!");
      $(`#${type}InputKadar`).focus();
      return;
    }
    if (berat <= 0) {
      utils.showAlert("Berat harus lebih dari 0!");
      $(`#${type}InputBerat`).focus();
      return;
    }
    if (totalHarga <= 0) {
      utils.showAlert("Total harga harus lebih dari 0!");
      $(`#${type}InputTotalHarga`).focus();
      return;
    }

    const newRow = `
      <tr>
        <td>${kode}</td>
        <td>${namaBarang}</td>
        <td>${kodeLock}</td>
        <td>${kadar}</td>
        <td>${berat}</td>
        <td>${hargaPerGram}</td>
        <td class="total-harga">${utils.formatRupiah(totalHarga)}</td>
        <td class="keterangan">${keterangan}</td>
        <td>
          <button class="btn btn-sm btn-danger btn-delete">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;

    $(`#table${type.charAt(0).toUpperCase() + type.slice(1)}Detail tbody`).append(newRow);

    // Clear input row
    $(
      `#${type}InputKode, #${type}InputNamaBarang, #${type}InputKodeLock, #${type}InputKadar, #${type}InputBerat, #${type}InputHargaPerGram, #${type}InputTotalHarga, #${type}InputKeterangan`
    ).val("");

    $(`#${type}InputKode`).focus();
    this.updateGrandTotal(type);
  },

  // Update grand total
  updateGrandTotal(salesType) {
    let tableSelector, grandTotalId;

    switch (salesType) {
      case "aksesoris":
        tableSelector = "#tableAksesorisDetail";
        grandTotalId = "#grand-total-aksesoris";
        break;
      case "kotak":
        tableSelector = "#tableKotakDetail";
        grandTotalId = "#grand-total-kotak";
        break;
      case "manual":
        tableSelector = "#tableManualDetail";
        grandTotalId = "#grand-total-manual";
        break;
    }

    let total = 0;

    if (salesType === "aksesoris") {
      $(tableSelector + " tbody tr:not(.input-row) .total-harga-input").each(function () {
        const value = $(this).val().replace(/\./g, "");
        total += parseFloat(value) || 0;
      });
    } else if (salesType === "kotak") {
      $(tableSelector + " tbody tr:not(.input-row) .total-harga").each(function () {
        const value = $(this).text().replace(/\./g, "");
        total += parseFloat(value) || 0;
      });
    } else {
      $(tableSelector + " tbody tr:not(.input-row) .total-harga").each(function () {
        const value = $(this).text().replace(/\./g, "");
        total += parseFloat(value) || 0;
      });
    }

    $(grandTotalId).text(utils.formatRupiah(total));
    $("#totalOngkos").val(utils.formatRupiah(total));

    if ($("#metodeBayar").val() === "dp") {
      this.calculateSisaPembayaran();
    }
  },

  // Update total
  updateTotal() {
    const salesType = $("#jenisPenjualan").val();
    const paymentMethod = $("#metodeBayar").val();

    if (paymentMethod === "free") {
      $("#totalOngkos").val("0");
      return;
    }

    let total = 0;
    const grandTotalSelector =
      salesType === "aksesoris"
        ? "#grand-total-aksesoris"
        : salesType === "kotak"
        ? "#grand-total-kotak"
        : "#grand-total-manual";

    total = parseFloat($(grandTotalSelector).text().replace(/\./g, "")) || 0;
    $("#totalOngkos").val(utils.formatRupiah(total));

    if (paymentMethod === "dp") {
      this.calculateSisaPembayaran();
    }
  },

  // Calculate sisa pembayaran
  calculateSisaPembayaran() {
    const total = parseFloat($("#totalOngkos").val().replace(/\./g, "")) || 0;
    const nominalDP = parseFloat($("#nominalDP").val().replace(/\./g, "")) || 0;
    const sisa = total - nominalDP;
    $("#sisaPembayaran").val(utils.formatRupiah(sisa > 0 ? sisa : 0));

    if ($("#jumlahBayar").val()) {
      this.calculateKembalian();
    }
  },

  // Calculate kembalian
    calculateKembalian() {
    const paymentMethod = $("#metodeBayar").val();
    const jumlahBayar = parseFloat($("#jumlahBayar").val().replace(/\./g, "")) || 0;

    if (paymentMethod === "dp") {
      const sisaPembayaran = parseFloat($("#sisaPembayaran").val().replace(/\./g, "")) || 0;
      const kembalian = jumlahBayar - sisaPembayaran;
      $("#kembalian").val(utils.formatRupiah(kembalian >= 0 ? kembalian : 0));
    } else {
      const total = parseFloat($("#totalOngkos").val().replace(/\./g, "")) || 0;
      const kembalian = jumlahBayar - total;
      $("#kembalian").val(utils.formatRupiah(kembalian >= 0 ? kembalian : 0));
    }
  },

  // Search table
  searchTable(input) {
    const searchText = $(input).val().toLowerCase();
    const tableId = $(input).attr("id").replace("search", "table");

    $(`#${tableId} tbody tr`).each(function () {
      const kode = $(this).find("td:nth-child(1)").text().toLowerCase();
      const nama = $(this).find("td:nth-child(2)").text().toLowerCase();

      if (kode.includes(searchText) || nama.includes(searchText)) {
        $(this).show();
      } else {
        $(this).hide();
      }
    });
  },

  // Validate sales
  validateSales() {
    const salesName = $("#sales").val().trim();
    if (!salesName) {
      $("#sales").addClass("is-invalid");
      if (!$("#sales").next(".invalid-feedback").length) {
        $("#sales").after('<div class="invalid-feedback">Nama sales harus diisi!</div>');
      }
    } else {
      $("#sales").removeClass("is-invalid").addClass("is-valid");
      $("#sales").next(".invalid-feedback").remove();
    }
  },

  // Refresh stock dengan cache invalidation yang efisien
  async refreshStock() {
  try {
    utils.showLoading(true);
    
    // ✅ Cek apakah benar-benar perlu refresh
    const lastRefresh = localStorage.getItem('lastStockRefresh');
    const now = Date.now();
    
    if (lastRefresh && (now - parseInt(lastRefresh)) < 60000) { // 1 menit
      utils.showAlert("Data baru saja diperbarui. Tunggu 1 menit sebelum refresh lagi.", "Info", "info");
      return;
    }
    
    // ✅ Cek perubahan data dengan lightweight query
    const hasChanges = await this.checkForStockChanges();
    
    if (!hasChanges) {
      utils.showAlert("Tidak ada perubahan data stok", "Info", "info");
      return;
    }
    
    // ✅ Clear cache secara selektif
    cacheManager.remove("stockData");
    this.stockCache.clear();
    this.lastStockUpdate = 0;
    
    await this.loadStockData(true);
    
    // ✅ Simpan timestamp refresh
    localStorage.setItem('lastStockRefresh', now.toString());
    
    utils.showAlert("Data stok berhasil diperbarui", "Sukses", "success");
  } catch (error) {
    console.error("Error refreshing stock:", error);
    utils.showAlert("Gagal memperbarui data stok", "Error", "error");
  } finally {
    utils.showLoading(false);
  }
},

// ✅ BARU: Method untuk cek perubahan dengan minimal reads
async checkForStockChanges() {
  try {
    // ✅ Query hanya metadata perubahan (1-5 reads max)
    const lastUpdate = localStorage.getItem('lastStockUpdateTime') || '0';
    const lastUpdateTime = new Date(parseInt(lastUpdate));
    
    // Cek apakah ada transaksi stok baru
    const recentTransQuery = query(
      collection(firestore, "stokAksesorisTransaksi"),
      where("timestamp", ">", Timestamp.fromDate(lastUpdateTime)),
      limit(1) // ✅ Hanya 1 dokumen untuk cek
    );
    
    const recentTransSnapshot = await getDocs(recentTransQuery);
    
    if (!recentTransSnapshot.empty) {
      console.log("📊 Stock changes detected");
      return true;
    }
    
    // Cek apakah ada penambahan stok baru
    const recentAddQuery = query(
      collection(firestore, "stockAdditions"),
      where("timestamp", ">", Timestamp.fromDate(lastUpdateTime)),
      limit(1) // ✅ Hanya 1 dokumen untuk cek
    );
    
    const recentAddSnapshot = await getDocs(recentAddQuery);
    
    if (!recentAddSnapshot.empty) {
      console.log("📦 New stock additions detected");
      return true;
    }
    
    console.log("✅ No stock changes detected");
    return false;
    
  } catch (error) {
    console.warn("Error checking stock changes, proceeding with refresh:", error);
    return true; // Default ke refresh jika error
  }
},

  // Fungsi untuk menduplikat transaksi manual ke mutasiKode
  async duplicateToMutasiKode(transactionData, transactionId) {
    try {
      // Hanya proses jika jenis penjualan adalah manual
      if (transactionData.jenisPenjualan !== "manual" || !transactionData.items) {
        return;
      }

      const jenisBarang = { C: "Cincin", K: "Kalung", L: "Liontin", A: "Anting", G: "Gelang", S: "Giwang", Z: "HALA", V: "HALA", };
      const duplicatePromises = [];

      transactionData.items.forEach((item, index) => {
        // Skip item tanpa kode atau kode kosong
        if (!item.kodeText || item.kodeText === "-" || !item.kodeText.trim()) {
          return;
        }

        const kode = item.kodeText.trim();
        const prefix = kode.charAt(0).toUpperCase();

        // Skip jika prefix tidak valid
        if (!jenisBarang[prefix]) {
          return;
        }

        // Data untuk mutasiKode
        const mutasiKodeData = {
          kode: kode,
          namaBarang: item.nama || "Tidak ada nama",
          kadar: item.kadar || "-",
          berat: parseFloat(item.berat) || 0,
          keterangan: item.keterangan || "",
          hargaPerGram: parseFloat(item.hargaPerGram) || 0,
          totalHarga: parseFloat(item.totalHarga) || 0,
          tanggalInput: transactionData.tanggal,
          sales: transactionData.sales || "",
          penjualanId: transactionId,
          isMutated: false,
          tanggalMutasi: null,
          mutasiKeterangan: "",
          mutasiHistory: [],
          timestamp: serverTimestamp(),
          lastUpdated: serverTimestamp(),
          jenisPrefix: prefix,
          jenisNama: jenisBarang[prefix]
        };

        duplicatePromises.push(
          addDoc(collection(firestore, "mutasiKode"), mutasiKodeData)
        );
      });

      if (duplicatePromises.length > 0) {
        await Promise.all(duplicatePromises);
        console.log(`✅ Duplicated ${duplicatePromises.length} items to mutasiKode`);
      }

    } catch (error) {
      console.error("❌ Error duplicating to mutasiKode:", error);
      // Jangan throw error agar tidak mengganggu proses utama
    }
  },

  // Save transaction dengan cache invalidation yang efisien
  async saveTransaction() {
      try {
        // Validasi sales name
        const salesName = $("#sales").val().trim();
        if (!salesName) {
          utils.showAlert("Nama sales harus diisi!");
          $("#sales").focus();
          return;
        }
  
        const salesType = $("#jenisPenjualan").val();
        const tableSelector =
          salesType === "aksesoris"
            ? "#tableAksesorisDetail"
            : salesType === "kotak"
            ? "#tableKotakDetail"
            : "#tableManualDetail";
  
        // Check if table has rows
        if ($(tableSelector + " tbody tr:not(.input-row)").length === 0) {
          utils.showAlert("Tidak ada barang yang ditambahkan!");
          return;
        }
  
        // Validasi pembayaran (kode yang sudah ada)...
        const paymentMethod = $("#metodeBayar").val();
        if (paymentMethod === "dp") {
          const nominalDP = parseFloat($("#nominalDP").val().replace(/\./g, "")) || 0;
          const total = parseFloat($("#totalOngkos").val().replace(/\./g, "")) || 0;
  
          if (nominalDP <= 0 || nominalDP >= total) {
            utils.showAlert(
              nominalDP <= 0 ? "Nominal DP harus diisi!" : "Nominal DP tidak boleh sama dengan atau melebihi total harga!"
            );
            $("#nominalDP").focus();
            return;
          }
        } else if (paymentMethod !== "free") {
          const jumlahBayar = parseFloat($("#jumlahBayar").val().replace(/\./g, "")) || 0;
          const total = parseFloat($("#totalOngkos").val().replace(/\./g, "")) || 0;
  
          if (jumlahBayar < total) {
            utils.showAlert("Jumlah bayar kurang dari total!");
            $("#jumlahBayar").focus();
            return;
          }
        }
  
        utils.showLoading(true);
  
        // Collect items data
        const items = this.collectItemsData(salesType, tableSelector);
  
        // Prepare transaction data
        const transactionData = {
          jenisPenjualan: salesType,
          tanggal: $("#tanggal").val(),
          sales: salesName,
          metodeBayar: paymentMethod,
          totalHarga: parseFloat($("#totalOngkos").val().replace(/\./g, "")) || 0,
          timestamp: serverTimestamp(),
          items: items,
        };
  
        // Mark as ganti lock if applicable
        if (salesType === "manual" && items.some((item) => item.kodeLock)) {
          transactionData.isGantiLock = true;
        }
  
        // Add payment details
        if (paymentMethod === "dp") {
          transactionData.nominalDP = parseFloat($("#nominalDP").val().replace(/\./g, "")) || 0;
          transactionData.sisaPembayaran = parseFloat($("#sisaPembayaran").val().replace(/\./g, "")) || 0;
          transactionData.statusPembayaran = "DP";
        } else if (paymentMethod === "free") {
          transactionData.statusPembayaran = "Free";
        } else {
          transactionData.jumlahBayar = parseFloat($("#jumlahBayar").val().replace(/\./g, "")) || 0;
          transactionData.kembalian = parseFloat($("#kembalian").val().replace(/\./g, "")) || 0;
          transactionData.statusPembayaran = "Lunas";
        }
  
        // Save transaction
        const docRef = await addDoc(collection(firestore, "penjualanAksesoris"), transactionData);
  
        // Update stock
        await this.updateStock(salesType, items);
  
        // Duplikasi ke mutasiKode jika transaksi manual
        if (transactionData.jenisPenjualan === "manual") {
          await this.duplicateToMutasiKode(transactionData, docRef.id);
        }
  
        // Smart cache invalidation
        cacheManager.remove("stockData");
        cacheManager.remove("todaySales");
  
        utils.showAlert("Transaksi berhasil disimpan!", "Sukses", "success");
  
        // Store transaction data for printing
        currentTransactionData = {
          id: docRef.id,
          salesType: salesType,
          tanggal: $("#tanggal").val(),
          sales: salesName,
          totalHarga: $("#totalOngkos").val(),
          items: items,
          metodeBayar: paymentMethod,
        };
  
        // Add DP information if applicable
        if (paymentMethod === "dp") {
          currentTransactionData.nominalDP = $("#nominalDP").val();
          currentTransactionData.sisaPembayaran = $("#sisaPembayaran").val();
        }
  
        // Show print modal
        $("#printModal").modal("show");
  
        // Reset form after modal is closed
        $("#printModal").on("hidden.bs.modal", () => {
          this.resetForm();
          $("#sales").focus();
          $("#printModal").off("hidden.bs.modal");
        });
  
      } catch (error) {
        console.error("Error saving transaction:", error);
        utils.showAlert("Terjadi kesalahan saat menyimpan transaksi: " + error.message, "Error", "error");
      } finally {
        utils.showLoading(false);
      }
    },

  // Collect items data based on sales type
  collectItemsData(salesType, tableSelector) {
    const items = [];

    if (salesType === "aksesoris") {
      $(tableSelector + " tbody tr:not(.input-row)").each(function () {
        const kode = $(this).find("td:nth-child(1)").text();
        const nama = $(this).find("td:nth-child(2)").text();
        const jumlah = parseInt($(this).find(".jumlah-input").val()) || 1;
        const kadar = $(this).find(".kadar-input").val() || "-";
        const berat = parseFloat($(this).find(".berat-input").val()) || 0;
        const hargaPerGram = parseFloat($(this).find(".harga-per-gram-input").val().replace(/\./g, "")) || 0;
        const totalHarga = parseFloat($(this).find(".total-harga-input").val().replace(/\./g, "")) || 0;

        items.push({
          kodeText: kode,
          nama: nama,
          jumlah: jumlah,
          kadar: kadar,
          berat: berat,
          hargaPerGram: hargaPerGram,
          totalHarga: totalHarga,
        });
      });
    } else if (salesType === "kotak") {
      $(tableSelector + " tbody tr:not(.input-row)").each(function () {
        const kode = $(this).find("td:nth-child(1)").text();
        const nama = $(this).find("td:nth-child(2)").text();
        const jumlah = parseInt($(this).find(".jumlah-input").val()) || 1;
        const hargaSatuan = parseFloat($(this).find(".harga-input").val().replace(/\./g, "")) || 0;
        const totalHarga = parseFloat($(this).find(".total-harga").text().replace(/\./g, "")) || 0;

        items.push({
          kodeText: kode,
          nama: nama,
          jumlah: jumlah,
          totalHarga: totalHarga,
          hargaSatuan: hargaSatuan,
        });
      });
    } else {
      // Manual
      $(tableSelector + " tbody tr:not(.input-row)").each(function () {
        const kode = $(this).find("td:nth-child(1)").text();
        const nama = $(this).find("td:nth-child(2)").text();
        const kodeLock = $(this).find("td:nth-child(3)").text();
        const kadar = $(this).find("td:nth-child(4)").text();
        const berat = parseFloat($(this).find("td:nth-child(5)").text()) || 0;
        const hargaPerGram = parseFloat($(this).find("td:nth-child(6)").text().replace(/\./g, "")) || 0;
        const totalHarga = parseFloat($(this).find("td:nth-child(7)").text().replace(/\./g, "")) || 0;
        const keterangan = $(this).find("td:nth-child(8)").text() || "";

        items.push({
          kodeText: kode,
          nama: nama,
          kodeLock: kodeLock !== "-" ? kodeLock : null,
          kadar: kadar,
          berat: berat,
          hargaPerGram: hargaPerGram,
          totalHarga: totalHarga,
          keterangan: keterangan,
        });
      });
    }

    return items;
  },

  // Update stock after sales dengan cache update yang efisien
  async updateStock(salesType, items) {
    try {
      const updatePromises = [];
      const stockUpdates = new Map();

      // Prepare batch updates
      for (const item of items) {
        const kode = item.kodeText;
        if (!kode || kode === "-") continue;

        if (salesType === "manual") {
          // Untuk penjualan manual
          if (item.kodeLock && item.kodeLock !== "-") {
            // Kode aksesoris yang dipilih - mengurangi stok sebagai ganti lock
            const lockCurrentStock = await this.getStockForItem(item.kodeLock);
            const jumlah = parseInt(item.jumlah) || 1;
            const lockNewStock = Math.max(0, lockCurrentStock - jumlah);

            stockUpdates.set(item.kodeLock, {
              item: {
                ...item,
                kodeText: item.kodeLock,
                nama: `Ganti lock untuk ${item.nama}`,
              },
              currentStock: lockCurrentStock,
              newStock: lockNewStock,
              jumlah,
              isGantiLock: true,
            });
          }
          // Kode barcode manual tidak mengurangi stok
        } else {
          // Untuk penjualan aksesoris dan kotak (termasuk yang free)
          const currentStock = await this.getStockForItem(kode);
          const jumlah = parseInt(item.jumlah) || 1;
          const newStock = Math.max(0, currentStock - jumlah);

          stockUpdates.set(kode, {
            item,
            currentStock,
            newStock,
            jumlah,
            isGantiLock: false,
          });
        }
      }

      // Execute batch updates
      for (const [kode, updateData] of stockUpdates) {
        updatePromises.push(this.processSingleStockUpdate(kode, updateData));
      }

      await Promise.all(updatePromises);

      // Update local caches secara efisien
      for (const [kode, updateData] of stockUpdates) {
        this.stockCache.set(kode, updateData.newStock);

        // Update stockData array
        const stockIndex = this.stockData.findIndex((item) => item.kode === kode);
        if (stockIndex !== -1) {
          this.stockData[stockIndex].stokAkhir = updateData.newStock;
        }
      }

      // Update cache dengan data terbaru
      cacheManager.set("stockData", this.stockData, cacheManager.stockTTL);
      this.lastStockUpdate = Date.now();

      return true;
    } catch (error) {
      console.error("Error updating stock:", error);
      throw error;
    }
  },

  // Process single stock update
  async processSingleStockUpdate(kode, { item, currentStock, newStock, jumlah, isGantiLock }) {
    const metodeBayar = $("#metodeBayar").val();
    const salesType = $("#jenisPenjualan").val();

    let jenisTransaksi, keterangan;

    // Tentukan jenis transaksi
    if (isGantiLock) {
      jenisTransaksi = "gantiLock";
      keterangan = `Ganti lock ${kode} oleh ${$("#sales").val()}`;
    } else if (metodeBayar === "free") {
      jenisTransaksi = "free";
      keterangan = `Penjualan ${salesType} gratis oleh ${$("#sales").val()}`;
    } else {
      jenisTransaksi = "laku";
      keterangan = `Penjualan ${salesType} oleh ${$("#sales").val()}`;
    }

    try {
      // Update stok document
      const stockQuery = query(collection(firestore, "stokAksesoris"), where("kode", "==", kode));
      const stockSnapshot = await getDocs(stockQuery);

      if (!stockSnapshot.empty) {
        const stockDoc = stockSnapshot.docs[0];
        await updateDoc(doc(firestore, "stokAksesoris", stockDoc.id), {
          stokAkhir: newStock,
          lastUpdate: serverTimestamp(),
        });
      } else {
        // Buat document baru jika tidak ada
        const newStockData = {
          kode,
          nama: item.nama || "",
          kategori: this.determineCategory(kode),
          stokAwal: currentStock,
          stokAkhir: newStock,
          hargaJual: 0,
          lastUpdate: serverTimestamp(),
        };

        await addDoc(collection(firestore, "stokAksesoris"), newStockData);
      }

      // Catat transaksi stok
      await addDoc(collection(firestore, "stokAksesorisTransaksi"), {
        kode,
        nama: item.nama || "",
        kategori: this.determineCategory(kode),
        jenis: jenisTransaksi,
        jumlah,
        stokSebelum: currentStock,
        stokSesudah: newStock,
        stokAkhir: newStock,
        timestamp: serverTimestamp(),
        keterangan,
        isGantiLock: isGantiLock || false,
      });

      console.log(`Updated stock for ${kode}: ${currentStock} → ${newStock} (${jenisTransaksi})`);
    } catch (error) {
      console.error(`Error updating stock for ${kode}:`, error);
      throw error;
    }
  },

  // Helper untuk menentukan kategori berdasarkan kode
  determineCategory(kode) {
    if (kode.startsWith("K") || kode.includes("KOTAK")) return "kotak";
    return "aksesoris";
  },

  // Print receipt
  printReceipt() {
    if (!currentTransactionData) {
      utils.showAlert("Tidak ada data transaksi untuk dicetak!");
      return;
    }

    const transaction = currentTransactionData;
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      
      return;
    }

    let receiptHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Struk Kasir</title>
        <style>
          body {
            font-family: consolas;
            font-size: 14px;
            margin: 0;
            padding: 0;
            width: 80mm;
          }
          .receipt {          
            margin: 0 auto;
            padding: 5mm;
          }
          .receipt h3, .receipt h4 {
            text-align: center;
            margin: 2mm 0;
          }
          .receipt hr {
            border-top: 1px dashed #000;
          }
          .receipt table {
            width: 100%;
            border-collapse: collapse;
          }
          .receipt th, .receipt td {
            text-align: left;
            padding: 1mm 2mm;
          }
          .receipt .tanggal {
          margin-left: 10px
          }
          .text-center {
            text-align: center;
          }
          .text-right {
            text-align: right;
          }
          .keterangan {
            font-style: italic;
            font-size: 14px;
            margin-top: 2mm;
            border-top: 1px dotted #000;
            padding-top: 2mm;
          }
          .payment-info {
            margin-top: 2mm;
            border-top: 1px dotted #000;
            padding-top: 2mm;
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <h3>MELATI 3</h3>
          <h4>JL. DIPONEGORO NO. 116</h4>
          <h4>NOTA PENJUALAN ${transaction.salesType.toUpperCase()}</h4>
          <hr>
          <p class="tanggal">Tanggal: ${transaction.tanggal}<br>Sales: ${transaction.sales}</p>
          <hr>
          <table>
            <tr>
              <th>Kode</th>
              <th>Nama</th>
              <th>Kadar</th>
              <th>Gr</th>
              <th>Harga</th>
            </tr>
    `;

    let hasKeterangan = false;
    let keteranganText = "";

    transaction.items.forEach((item) => {
      const itemHarga = parseInt(item.totalHarga) || 0;
      receiptHTML += `
        <tr>
          <td>${item.kodeText || "-"}</td>
          <td>${item.nama || "-"}</td>
          <td>${item.kadar || "-"}</td>
          <td>${item.berat || "-"}</td>
          <td class="text-right">${utils.formatRupiah(itemHarga)}</td>
        </tr>
      `;

      if (item.keterangan && item.keterangan.trim() !== "") {
        hasKeterangan = true;
        keteranganText += item.keterangan + " ";
      }
    });

    const totalHarga = parseInt(transaction.totalHarga.replace(/\./g, "")) || 0;
    receiptHTML += `
            <tr>
              <td colspan="4" class="text-right"><strong>Total:</strong></td>
              <td class="text-right"><strong>${utils.formatRupiah(totalHarga)}</strong></td>
            </tr>
          </table>
    `;

    // Add DP information if applicable
    if (transaction.metodeBayar === "dp") {
      const dpAmount = parseInt(transaction.nominalDP.replace(/\./g, "")) || 0;
      const remainingAmount = parseInt(transaction.sisaPembayaran.replace(/\./g, "")) || 0;

      receiptHTML += `
          <div class="payment-info">
            <table>
              <tr>
                <td>Total Harga:</td>
                <td class="text-right">${utils.formatRupiah(totalHarga)}</td>
              </tr>
              <tr>
                <td>DP:</td>
                <td class="text-right">${utils.formatRupiah(dpAmount)}</td>
              </tr>
              <tr>
                <td><strong>SISA:</strong></td>
                <td class="text-right"><strong>${utils.formatRupiah(remainingAmount)}</strong></td>
              </tr>
            </table>
          </div>
      `;
    }

    // Add keterangan if exists and is manual sale
    if (hasKeterangan && transaction.salesType === "manual") {
      receiptHTML += `
          <div class="keterangan">
            <strong>Keterangan:</strong> ${keteranganText.trim()}
          </div>
      `;
    }

    receiptHTML += `
          <hr>
          <p class="text-center">Terima Kasih<br>Atas Kunjungan Anda</p>
        </div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(receiptHTML);
    printWindow.document.close();
  },

  // Print invoice
  printInvoice() {
    if (!currentTransactionData) {
      utils.showAlert("Tidak ada data transaksi untuk dicetak!");
      return;
    }

    const transaction = currentTransactionData;
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      utils.showAlert("Popup diblokir oleh browser. Mohon izinkan popup untuk mencetak.", "Error", "error");
      return;
    }

    let invoiceHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Invoice Customer</title>
      <style>
        @page {
          size: 10cm 20cm;
          margin: 0;
        }
        body {
          font-family: Arial, sans-serif;
          font-size: 12px;
          margin: 0;
          padding: 5mm;
          width: 20cm;
          box-sizing: border-box;
        }
        .invoice {
          width: 100%;
        }
        .header-info {
          text-align: right;
          margin-bottom: 2cm;
          margin-right: 3cm;
          margin-top: 0.8cm;
        }         
        .total-row {
          margin-top: 0.7cm;
          text-align: right;
          font-weight: bold;
          margin-right: 3cm;
        }
        .sales {
          text-align: right;
          margin-top: 0.6cm;
          margin-right: 2cm;
        }
        .keterangan {
          font-style: italic;
          font-size: 10px;
          margin-top: 1cm;
          margin-bottom: 0.5cm;
          padding-top: 2mm;
          text-align: left;
          margin-left: 0.5cm;
          margin-right: 3cm;
        }
        .keterangan-spacer { height: 1.6cm; }
        .item-details {
          display: flex;
          flex-wrap: wrap;
        }
        .item-data {
          display: grid;
          grid-template-columns: 2cm 1.8cm 5cm 2cm 2cm 2cm;
          width: 100%;
          column-gap: 0.2cm;
          margin-left: 0.5cm;
          margin-top: 1cm;
          margin-right: 3cm;
        }
        .item-data span {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      </style>
    </head>
    <body>
      <div class="invoice">
        <div class="header-info">
          <p>${transaction.tanggal}</p>
        </div>
        <hr>
  `;

    let hasKeterangan = false;
    let keteranganText = "";
    let totalHarga = 0;

    // Loop untuk menampilkan semua item-data terlebih dahulu
    transaction.items.forEach((item) => {
      const itemHarga = parseInt(item.totalHarga) || 0;
      totalHarga += itemHarga;

      invoiceHTML += `
      <div class="item-details">
        <div class="item-data">
          <span>${item.kodeText || "-"}</span>
          <span>${item.jumlah || "1"}pcs</span>
          <span>${item.nama || "-"}</span>
          <span>${item.kadar || "-"}</span>
          <span>${item.berat || "-"}gr</span>
          <span>${utils.formatRupiah(itemHarga)}</span>
        </div>
      </div>
    `;

      // Kumpulkan keterangan
      if (item.keterangan && item.keterangan.trim() !== "") {
        hasKeterangan = true;
        keteranganText += `${item.keterangan}; `;
      }
    });

    // Tampilkan keterangan atau spacer untuk menjaga posisi total-row
    if (hasKeterangan && transaction.salesType === "manual") {
      invoiceHTML += `
      <div class="keterangan">
        <strong>Keterangan:</strong><br>
        ${keteranganText.trim()}
      </div>
    `;
    } else {
      // Tambahkan spacer jika tidak ada keterangan untuk menjaga posisi total-row
      invoiceHTML += `
      <div class="keterangan-spacer"></div>
    `;
    }

    // Tampilkan total dan sales
    invoiceHTML += `
      <div class="total-row">
        Rp ${utils.formatRupiah(totalHarga)}
      </div>
      <div class="sales">${transaction.sales || "-"}</div>
  `;

    invoiceHTML += `
      </div>
      <script>
        window.onload = function() {
          window.print();
          setTimeout(function() { window.close(); }, 500);
        };
      </script>
    </body>
    </html>
  `;

    printWindow.document.write(invoiceHTML);
    printWindow.document.close();
  },

  // Reset form
  resetForm() {
    try {
      // Reset sales type to default
      $("#jenisPenjualan").val("aksesoris").trigger("change");

      // Reset date to current date
      this.setDefaultDate();

      // Reset sales name field
      $("#sales").val("").removeClass("is-valid is-invalid");

      // Clear all tables
      $("#tableAksesorisDetail tbody, #tableKotakDetail tbody, #tableManualDetail tbody").empty();

      // Reset payment fields
      $("#metodeBayar").val("tunai").trigger("change");
      $("#nominalDP, #totalOngkos, #sisaPembayaran, #jumlahBayar, #kembalian").val("");

      // Reset grand totals
      $("#grand-total-aksesoris, #grand-total-kotak, #grand-total-manual").text("0");

      // Clear current transaction data
      currentTransactionData = null;

      // Set focus to sales field
      $("#sales").focus();

      console.log("Form reset successfully");
    } catch (error) {
      console.error("Error resetting form:", error);
    }
  },

  // Print document handler
  printDocument(type) {
    if (type === "receipt") {
      this.printReceipt();
    } else if (type === "invoice") {
      this.printInvoice();
    }
  },

  // Cleanup when page unloads
  cleanup() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    // Clear old cache entries
    cacheManager.clearOldCache();
  },
};

// Enhanced shared cache manager untuk multi-device sync
const sharedCacheManager = {
  ...cacheManager,
  
  // TTL khusus untuk data hari ini
  todayTTL: 1 * 60 * 1000, // 1 menit untuk data hari ini
  
  // Get local date string untuk cache key
  getLocalDateString() {
    const today = new Date();
    return `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;
  },

  // Check if cache should be updated based on time
  shouldUpdateCache(key, maxAge = null) {
    const item = this.get(key);
    if (!item) return true;

    try {
      const cacheItem = JSON.parse(localStorage.getItem(this.prefix + key));
      if (!cacheItem) return true;

      const age = Date.now() - cacheItem.timestamp;
      const ttl = maxAge || cacheItem.ttl;
      
      return age >= ttl;
    } catch (error) {
      return true;
    }
  },

  // Set cache with version for multi-device sync
  setVersioned(key, data, ttl) {
    const versionedData = {
      data,
      version: Date.now(),
      deviceId: this.getDeviceId(),
    };
    this.set(key, versionedData, ttl);
  },

  // Get versioned cache data
  getVersioned(key) {
    const cachedItem = this.get(key);
    if (!cachedItem) return null;

    return {
      data: cachedItem.data,
      version: cachedItem.version,
      age: Date.now() - cachedItem.version,
    };
  },

  // Get or generate device ID
  getDeviceId() {
    let deviceId = localStorage.getItem('melati_device_id');
    if (!deviceId) {
      deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('melati_device_id', deviceId);
    }
    return deviceId;
  },

  // Invalidate related cache entries
  invalidateRelated(pattern) {
    try {
      Object.keys(localStorage)
        .filter(key => key.startsWith(this.prefix) && key.includes(pattern))
        .forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.warn("Failed to invalidate related cache:", error);
    }
  },

  // Get cache statistics
  getStats() {
    const stats = {
      totalEntries: 0,
      totalSize: 0,
      validEntries: 0,
      expiredEntries: 0,
      entries: {}
    };

    try {
      Object.keys(localStorage)
        .filter(key => key.startsWith(this.prefix))
        .forEach(key => {
          try {
            const item = JSON.parse(localStorage.getItem(key));
            const cleanKey = key.replace(this.prefix, '');
            const age = Date.now() - item.timestamp;
            const isValid = age < item.ttl;
            const size = JSON.stringify(item).length;

            stats.totalEntries++;
            stats.totalSize += size;
            
            if (isValid) {
              stats.validEntries++;
            } else {
              stats.expiredEntries++;
            }

            stats.entries[cleanKey] = {
              age: Math.round(age / 1000) + 's',
              size: size + ' bytes',
              valid: isValid,
              ttl: Math.round(item.ttl / 1000) + 's'
            };
          } catch (error) {
            // Corrupted entry
            localStorage.removeItem(key);
          }
        });
    } catch (error) {
      console.warn("Failed to get cache stats:", error);
    }

    return stats;
  }
};

// Initialize when document is ready
$(document).ready(async function () {
  try {
    // Initialize print event handlers
    $("#btnPrintReceipt")
      .off("click")
      .on("click", () => penjualanHandler.printReceipt());
    $("#btnPrintInvoice")
      .off("click")
      .on("click", () => penjualanHandler.printInvoice());

    // Add refresh stock button if not exists
    if ($("#refreshStok").length === 0) {
      $(".catalog-select").before(`
        <button type="button" class="btn btn-outline-primary me-2" id="refreshStok">
          <i class="fas fa-sync-alt me-1"></i> Refresh Stok
        </button>
      `);
    }

    // Initialize the main handler
    await penjualanHandler.init();

    console.log("Penjualan Aksesoris initialized successfully");
    console.log("Cache info:", sharedCacheManager.getStats());
  } catch (error) {
    console.error("Error initializing penjualan aksesoris:", error);
    utils.showAlert("Terjadi kesalahan saat memuat halaman: " + error.message, "Error", "error");
  }
});

// Cleanup when page unloads
$(window).on("beforeunload", () => {
  penjualanHandler.cleanup();
});

// Handle visibility change to refresh data when tab becomes active
document.addEventListener("visibilitychange", async () => {
  if (!document.hidden) {
    // Page became visible, check if cache is stale
    const stockCacheAge = 5 * 60 * 1000; // 5 minutes
    const salesCacheAge = 1 * 60 * 1000; // 1 minute

    if (sharedCacheManager.shouldUpdateCache("stockData", stockCacheAge)) {
      console.log("Refreshing stale stock cache");
      await penjualanHandler.loadStockData(true);
    }

    const today = sharedCacheManager.getLocalDateString();
    if (sharedCacheManager.shouldUpdateCache(`todaySales_${today}`, salesCacheAge)) {
      console.log("Refreshing stale sales cache");
      await penjualanHandler.loadTodaySales(true);
    }
  }
});

// Export for potential use in other modules
window.penjualanHandler = penjualanHandler;
window.cacheManager = cacheManager;
window.sharedCacheManager = sharedCacheManager;

// Utility functions for backward compatibility
function showAlert(message, title = "Informasi", type = "info") {
  return utils.showAlert(message, title, type);
}

function showConfirm(message, title = "Konfirmasi") {
  return utils.showConfirm(message, title);
}

function formatDate(date) {
  return utils.formatDate(date);
}

function printDocument(type) {
  return penjualanHandler.printDocument(type);
}

// Auto-clear cache every hour to prevent localStorage bloat
setInterval(() => {
  sharedCacheManager.clearOldCache();
  console.log("Performed automatic cache cleanup");
}, 60 * 60 * 1000);

// Monitor localStorage usage and performance
setInterval(() => {
  try {
    const usage = JSON.stringify(localStorage).length;
    const maxSize = 5 * 1024 * 1024; // 5MB typical limit
    const usagePercent = (usage / maxSize) * 100;

    if (usagePercent > 80) {
      console.warn(`localStorage usage high: ${usagePercent.toFixed(1)}% (${usage} bytes)`);
      sharedCacheManager.clearOldCache();
      
      // If still high after cleanup, remove oldest entries
      if (JSON.stringify(localStorage).length > maxSize * 0.7) {
        console.warn("Performing aggressive cache cleanup");
        const stats = sharedCacheManager.getStats();
        
        // Remove expired entries first
        Object.keys(stats.entries)
          .filter(key => !stats.entries[key].valid)
          .forEach(key => sharedCacheManager.remove(key));
      }
    }

    // Log performance metrics every 10 minutes
    if (Date.now() % (10 * 60 * 1000) < 5000) {
      console.log("Cache performance:", {
        usage: `${usagePercent.toFixed(1)}%`,
        entries: sharedCacheManager.getStats().totalEntries,
        stockCacheAge: penjualanHandler.lastStockUpdate ? 
          Math.round((Date.now() - penjualanHandler.lastStockUpdate) / 1000) + 's' : 'none'
      });
    }
  } catch (error) {
    console.warn("Could not check localStorage usage:", error);
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Handle online/offline status
window.addEventListener('online', async () => {
  console.log('Connection restored, refreshing data...');
  try {
    await Promise.all([
      penjualanHandler.loadStockData(true),
      penjualanHandler.loadTodaySales(true)
    ]);
    utils.showAlert('Koneksi pulih, data telah diperbarui', 'Info', 'info');
  } catch (error) {
    console.error('Failed to refresh data after reconnection:', error);
  }
});

window.addEventListener('offline', () => {
  console.log('Connection lost, using cached data');
  utils.showAlert('Koneksi terputus, menggunakan data cache', 'Warning', 'warning');
});

// Performance monitoring
const performanceMonitor = {
  startTime: Date.now(),
  
  logTiming(operation, startTime) {
    const duration = Date.now() - startTime;
    console.log(`⏱️ ${operation}: ${duration}ms`);
    
    if (duration > 3000) {
      console.warn(`🐌 Slow operation detected: ${operation} took ${duration}ms`);
    }
  },
  
  measureAsync(operation, asyncFn) {
    return async (...args) => {
      const start = Date.now();
      try {
        const result = await asyncFn(...args);
        this.logTiming(operation, start);
        return result;
      } catch (error) {
        this.logTiming(`${operation} (failed)`, start);
        throw error;
      }
    };
  }
};

// Wrap critical functions with performance monitoring
penjualanHandler.loadStockData = performanceMonitor.measureAsync(
  'Load Stock Data', 
  penjualanHandler.loadStockData.bind(penjualanHandler)
);

penjualanHandler.saveTransaction = performanceMonitor.measureAsync(
  'Save Transaction', 
  penjualanHandler.saveTransaction.bind(penjualanHandler)
);

// Error boundary for unhandled errors
window.addEventListener('error', (event) => {
  console.error('Unhandled error:', event.error);
  
  // Don't show alert for minor errors
  if (event.error && event.error.message && 
      !event.error.message.includes('Non-Error promise rejection')) {
    utils.showAlert(
      'Terjadi kesalahan tidak terduga. Silakan refresh halaman jika masalah berlanjut.',
      'Error',
      'error'
    );
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  
  // Prevent default browser behavior
  event.preventDefault();
  
  if (event.reason && typeof event.reason === 'object' && event.reason.message) {
    console.error('Promise rejection details:', event.reason.message);
  }
});

console.log('🚀 Penjualan Aksesoris module loaded successfully');
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
  updateDoc,
  deleteDoc,
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

// Tambahkan fungsi baru untuk mencetak laporan summary dengan ukuran struk kasir
function printSummaryReceiptFormat(summaryData) {
  // Ambil informasi tanggal filter
  const startDateStr = document.querySelector("#sales-tab-pane #startDate").value;
  const endDateStr = document.querySelector("#sales-tab-pane #endDate").value;

  // Ambil total pendapatan
  const totalRevenue = summaryData.reduce((sum, item) => sum + item.totalHarga, 0);

  // Buat jendela baru untuk print
  const printWindow = window.open("", "_blank");

  // Buat konten HTML untuk struk
  let receiptHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Summary Penjualan</title>
      <style>
        @page {
          size: 80mm auto;  /* Lebar 8cm, tinggi menyesuaikan */
          margin: 0;
        }

        body {
          font-family: 'Courier New', monospace;
          font-size: 10px;
          margin: 0;
          padding: 5mm;
          width: 73mm;  /* 7.3cm */
        }
        .receipt {
          width: 100%;
        }
        .receipt h3, .receipt h4 {
          text-align: center;
          margin: 2mm 0;
          font-size: 12px;
        }
        .receipt hr {
          border-top: 1px dashed #000;
          margin: 2mm 0;
        }
        .receipt table {
          width: 100%;
          border-collapse: collapse;
          margin: 2mm 0;
        }
        .receipt th, .receipt td {
          text-align: left;
          padding: 1mm;
          font-size: 9px;
        }
        .receipt th {
          border-bottom: 1px solid #000;
        }
        .text-center {
          text-align: center;
        }
        .text-right {
          text-align: right;
        }
        .date-range {
          text-align: center;
          margin: 2mm 0;
          font-size: 9px;
        }
        .total-row {
          font-weight: bold;
          border-top: 1px solid #000;
          padding-top: 1mm;
        }
      </style>
    </head>
    <body>
      <div class="receipt">
        <h3>MELATI GOLD SHOP</h3>
        <h4>SUMMARY PENJUALAN</h4>
        <hr>
         <div class="date-range">
          Periode: ${startDateStr} - ${endDateStr}
        </div>
        <hr>
        <table>
          <thead>
            <tr>
              <th>Kode</th>
              <th>Nama</th>
              <th class="text-center">Jml</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
  `;

  // Tambahkan data summary
  summaryData.forEach((item) => {
    receiptHTML += `
            <tr>
              <td>${item.kode}</td>
              <td>${item.nama.length > 15 ? item.nama.substring(0, 15) + "..." : item.nama}</td>
              <td class="text-center">${item.jumlah}</td>
              <td class="text-right">${item.totalHarga.toLocaleString("id-ID")}</td>
            </tr>
    `;
  });

  // Tambahkan total
  receiptHTML += `
            <tr class="total-row">
              <td colspan="2">TOTAL</td>
              <td class="text-center">${summaryData.reduce((sum, item) => sum + item.jumlah, 0)}</td>
              <td class="text-right">${totalRevenue.toLocaleString("id-ID")}</td>
            </tr>
          </tbody>
        </table>
        <hr>
        <p class="text-center">Dicetak pada: ${new Date().toLocaleString("id-ID")}</p>
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

  // Tulis HTML ke jendela baru
  printWindow.document.write(receiptHTML);
  printWindow.document.close();
}

// Main handler object
const laporanAksesorisHandler = {
  // Data properties
  salesData: [],
  stockData: [],
  filteredSalesData: [],
  filteredStockData: [],
  isSummaryMode: false,
  summaryData: [],

  // Cache properties
  cache: {
    salesData: {
      data: null,
      lastFetched: null,
    },
    stockData: {
      data: null,
      lastFetched: null,
    },
  },

  // Initialize the module
  init() {
    this.initDatePickers();
    this.attachEventListeners();
    this.setDefaultDates();

    // Initialize DataTables
    this.initDataTables();

    // Tidak lagi memanggil loadSalesData() dan loadStockData() secara otomatis
    // Hanya menyiapkan tabel kosong
    this.prepareEmptyTables();
  },

  // Tambahkan fungsi untuk menyiapkan tabel kosong
  prepareEmptyTables() {
    // Tampilkan pesan di tabel penjualan
    const salesTableBody = document.querySelector("#penjualanTable tbody");
    if (salesTableBody) {
      salesTableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center">Silakan pilih filter dan klik tombol "Tampilkan" untuk melihat data</td>
      </tr>
    `;
    }

    // Tampilkan pesan di tabel stok
    const stockTableBody = document.querySelector("#stockTable tbody");
    if (stockTableBody) {
      stockTableBody.innerHTML = `
       <tr>
         <td colspan="9" class="text-center">Silakan pilih filter dan klik tombol "Tampilkan" untuk melihat data</td>
       </tr>
     `;
    }
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

  // Update the attachEventListeners method to handle the reset filter button
  attachEventListeners() {
    // Filter Sales button
    const filterSalesBtn = document.getElementById("filterSalesBtn");
    if (filterSalesBtn) {
      filterSalesBtn.addEventListener("click", () => {
        this.loadSalesData().then(() => {
          this.filterSalesData();
        });
      });
    }

    // Reset Filter button
    const resetFilterBtn = document.getElementById("resetFilterBtn");
    if (resetFilterBtn) {
      resetFilterBtn.addEventListener("click", () => {
        this.resetSalesFilters();
      });
    }

    // Toggle Summary button
    const toggleSummaryBtn = document.getElementById("toggleSummaryBtn");
    if (toggleSummaryBtn) {
      toggleSummaryBtn.addEventListener("click", () => {
        this.toggleSummaryView();
      });
    }
    // Filter Stock button
    const filterStockBtn = document.getElementById("filterStockBtn");
    if (filterStockBtn) {
      filterStockBtn.addEventListener("click", () => {
        this.loadStockData().then(() => {
          this.filterStockData();
        });
      });
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

  // Add this method to toggle between detailed and summary views
  toggleSummaryView() {
    this.isSummaryMode = !this.isSummaryMode;

    // Update button text
    const toggleSummaryBtn = document.getElementById("toggleSummaryBtn");
    if (toggleSummaryBtn) {
      toggleSummaryBtn.innerHTML = this.isSummaryMode
        ? '<i class="fas fa-list me-1"></i> Detail Penjualan'
        : '<i class="fas fa-chart-pie me-1"></i> Summary Penjualan';
    }
    // If in summary mode, generate summary data
    if (this.isSummaryMode) {
      this.generateSalesSummary();
    }

    // Re-render the table
    this.renderSalesTable();
  },

  // Add this new method to toggle between detailed and summary views
  toggleSummaryView() {
    this.isSummaryMode = !this.isSummaryMode;

    // Update button text
    const toggleSummaryBtn = document.getElementById("toggleSummaryBtn");
    if (toggleSummaryBtn) {
      toggleSummaryBtn.innerHTML = this.isSummaryMode
        ? '<i class="fas fa-list me-1"></i> Detail Penjualan'
        : '<i class="fas fa-chart-pie me-1"></i> Summary Penjualan';
    }
    // If in summary mode, generate summary data
    if (this.isSummaryMode) {
      this.generateSalesSummary();
    }

    // Re-render the table
    this.renderSalesTable();
  },

  // Add this method to generate summary data
  generateSalesSummary() {
    try {
      // Reset summary data
      this.summaryData = [];

      // Create a map to store summary data
      const summaryMap = new Map();

      // Process each transaction
      this.filteredSalesData.forEach((transaction) => {
        // Process each item in the transaction
        if (transaction.items && transaction.items.length > 0) {
          transaction.items.forEach((item) => {
            const kode = item.kodeText || "-";
            const nama = item.nama || "Tidak diketahui";
            const jumlah = parseInt(item.jumlah || 1);
            const totalHarga = parseInt(item.totalHarga || 0);

            // Create a unique key for this item
            const key = `${kode}-${nama}`;

            // Update summary map
            if (summaryMap.has(key)) {
              const existingItem = summaryMap.get(key);
              existingItem.jumlah += jumlah;
              existingItem.totalHarga += totalHarga;
            } else {
              summaryMap.set(key, {
                kode,
                nama,
                jumlah,
                totalHarga,
              });
            }
          });
        }
      });

      // Convert map to array
      this.summaryData = Array.from(summaryMap.values());

      // Sort by total price (descending)
      this.summaryData.sort((a, b) => b.totalHarga - a.totalHarga);

      console.log("Summary data generated:", this.summaryData);
    } catch (error) {
      console.error("Error generating sales summary:", error);
    }
  },

  // Add this method to populate the sales person dropdown
  populateSalesPersonDropdown() {
    // Get unique sales persons from the data
    const salesPersons = [...new Set(this.salesData.map((item) => item.sales).filter(Boolean))];

    // Get the dropdown element
    const dropdown = document.querySelector("#sales-tab-pane #salesPerson");
    if (!dropdown) return;

    // Clear existing options except the first one (All Sales)
    while (dropdown.options.length > 1) {
      dropdown.remove(1);
    }

    // Add options for each sales person
    salesPersons.forEach((person) => {
      const option = document.createElement("option");
      option.value = person;
      option.textContent = person;
      dropdown.appendChild(option);
    });
  },

  // Update the resetSalesFilters method
  resetSalesFilters() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

    document.querySelector("#sales-tab-pane #startDate").value = formatDate(firstDay);
    document.querySelector("#sales-tab-pane #endDate").value = formatDate(today);

    // Reset select dropdowns
    document.querySelector("#sales-tab-pane #salesType").value = "all";
    document.querySelector("#sales-tab-pane #salesPerson").value = "all";

    // Reload and filter data
    this.loadSalesData().then(() => {
      this.filterSalesData();
    });
  },

  // Reset stock filters
  resetStockFilters() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

    document.querySelector("#stock-tab-pane #startDate").value = formatDate(firstDay);
    document.querySelector("#stock-tab-pane #endDate").value = formatDate(today);

    this.filterStockData();
  },

  // Update the loadSalesData method to call populateSalesPersonDropdown
  async loadSalesData() {
    try {
      this.showLoading(true);

      // Check cache validity (cache expires after 5 minutes)
      const now = new Date().getTime();
      const cacheExpiry = 5 * 60 * 1000; // 5 minutes

      if (
        this.cache.salesData.data &&
        this.cache.salesData.lastFetched &&
        now - this.cache.salesData.lastFetched < cacheExpiry
      ) {
        console.log("Using cached sales data");
        this.salesData = this.cache.salesData.data;
        this.populateSalesPersonDropdown(); // Add this line
        this.showLoading(false);
        return Promise.resolve();
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

      // Populate sales person dropdown
      this.populateSalesPersonDropdown(); // Add this line

      this.showLoading(false);
      return Promise.resolve();
    } catch (error) {
      console.error("Error loading sales data:", error);
      this.showError("Error loading sales data: " + error.message);
      this.showLoading(false);
      return Promise.reject(error);
    }
  },

  // Load stock data from Firestore
  async loadStockData() {
    try {
      this.showLoading(true);

      // Selalu ambil data stok terbaru dari Firestore
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
      this.cache.stockData.lastFetched = new Date().getTime();

      this.showLoading(false);
      return Promise.resolve();
    } catch (error) {
      console.error("Error loading stock data:", error);
      this.showError("Error loading stock data: " + error.message);
      this.showLoading(false);
      return Promise.reject(error);
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
      kotakSnapshot.forEach((doc) => {
        const data = doc.data();
        // Check if this kode already exists in stockData
        const existingIndex = this.stockData.findIndex((item) => item.kode === data.text);

        if (existingIndex === -1) {
          // If not exists, add new item with default values
          this.stockData.push({
            id: null, // No document ID yet
            kode: data.text,
            nama: data.nama,
            kategori: "kotak", // Tambahkan informasi kategori
            stokAwal: 0,
            tambahStok: 0,
            laku: 0,
            free: 0,
            gantiLock: 0,
            stokAkhir: 0,
            lastUpdate: new Date(),
          });
        } else {
          // Update kategori jika item sudah ada
          this.stockData[existingIndex].kategori = "kotak";
        }
      });

      // Process aksesoris data
      aksesorisSnapshot.forEach((doc) => {
        const data = doc.data();
        // Check if this kode already exists in stockData
        const existingIndex = this.stockData.findIndex((item) => item.kode === data.text);

        if (existingIndex === -1) {
          // If not exists, add new item with default values
          this.stockData.push({
            id: null, // No document ID yet
            kode: data.text,
            nama: data.nama,
            kategori: "aksesoris", // Tambahkan informasi kategori
            stokAwal: 0,
            tambahStok: 0,
            laku: 0,
            free: 0,
            gantiLock: 0,
            stokAkhir: 0,
            lastUpdate: new Date(),
          });
        } else {
          // Update kategori jika item sudah ada
          this.stockData[existingIndex].kategori = "aksesoris";
        }
      });
    } catch (error) {
      console.error("Error loading kode aksesoris:", error);
      throw error;
    }
  },

  // Modify the filterSalesData method to properly apply the sales type filter
  filterSalesData() {
    if (!this.salesData.length) return;

    this.showLoading(true);

    // Get filter values
    const startDateStr = document.querySelector("#sales-tab-pane #startDate").value;
    const endDateStr = document.querySelector("#sales-tab-pane #endDate").value;
    const salesType = document.querySelector("#sales-tab-pane #salesType").value;
    const salesPerson = document.querySelector("#sales-tab-pane #salesPerson").value;

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

      // Check if sales type matches
      let typeMatches = true;
      if (salesType !== "all") {
        typeMatches = item.jenisPenjualan === salesType;
      }

      // Check if sales person matches
      let salesMatches = true;
      if (salesPerson !== "all") {
        salesMatches = item.sales === salesPerson;
      }

      return dateInRange && typeMatches && salesMatches;
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

  async filterStockData() {
    if (!this.stockData.length) return;

    this.showLoading(true);

    try {
      // Get filter values
      const startDateStr = document.querySelector("#stock-tab-pane #startDate")?.value;
      const endDateStr = document.querySelector("#stock-tab-pane #endDate")?.value;

      // Validasi input tanggal
      if (!startDateStr || !endDateStr) {
        this.showError("Tanggal awal dan akhir harus diisi");
        this.showLoading(false);
        return;
      }

      // Parse dates
      const startDate = parseDate(startDateStr);
      const endDate = parseDate(endDateStr);
      if (!startDate || !endDate) {
        this.showError("Format tanggal tidak valid. Gunakan format DD/MM/YYYY");
        this.showLoading(false);
        return;
      }

      // Tambahkan waktu ke tanggal akhir untuk mencakup seluruh hari
      const endDateWithTime = new Date(endDate);
      endDateWithTime.setHours(23, 59, 59, 999);

      // Cek apakah data sudah ada di cache untuk rentang tanggal ini
      const cacheKey = `stock_${startDateStr}_${endDateStr}`;
      if (this.cache[cacheKey] && this.cache[cacheKey].data) {
        console.log(`Using cached stock data for range ${startDateStr} to ${endDateStr}`);

        // Buat salinan data dari cache untuk menghindari masalah referensi
        try {
          this.filteredStockData = [...this.cache[cacheKey].data];

          // Perbarui timestamp akses terakhir
          this.cache[cacheKey].lastAccessed = new Date().getTime();

          // Render tabel dengan data dari cache
          this.renderStockTable();
          this.showLoading(false);
          return;
        } catch (cacheError) {
          console.warn("Error using cached data:", cacheError);
          // Lanjutkan dengan mengambil data baru jika cache gagal
        }
      }

      // Ambil data penjualan hanya sekali dan simpan dalam cache
      try {
        if (!this.cache.allSalesData) {
          // Ambil semua data penjualan (ini hanya dilakukan sekali)
          const salesRef = collection(firestore, "penjualanAksesoris");
          const salesSnapshot = await getDocs(salesRef);

          // Proses data penjualan
          const allSalesData = [];
          salesSnapshot.forEach((doc) => {
            const sale = doc.data();
            // Tambahkan ID dokumen ke data
            allSalesData.push({
              id: doc.id,
              ...sale,
            });
          });

          // Simpan di cache
          this.cache.allSalesData = {
            data: allSalesData,
            lastFetched: new Date().getTime(),
          };
        }
      } catch (salesError) {
        console.error("Error fetching sales data:", salesError);
        // Lanjutkan meskipun gagal mengambil data penjualan
      }

      // Hitung stok dengan kontinuitas
      try {
        await this.calculateStockContinuity(startDate, endDateWithTime);
      } catch (calcError) {
        console.error("Error calculating stock continuity:", calcError);
        throw new Error("Gagal menghitung stok: " + calcError.message);
      }

      // Simpan hasil di cache jika berhasil
      if (this.filteredStockData && this.filteredStockData.length > 0) {
        // Buat salinan data untuk disimpan di cache
        this.cache[cacheKey] = {
          data: [...this.filteredStockData],
          lastFetched: new Date().getTime(),
          lastAccessed: new Date().getTime(),
        };
      }

      // Render tabel
      this.renderStockTable();
      this.showLoading(false);
    } catch (error) {
      console.error("Error dalam filterStockData:", error);
      this.showError("Error memfilter data stok: " + error.message);
      this.showLoading(false);

      // Reset the table to a clean state
      try {
        const tableElement = document.getElementById("stockTable");
        if (!tableElement) {
          console.warn("Table element not found for reset");
          return;
        }

        // Destroy existing DataTable if it exists
        try {
          if ($.fn.DataTable.isDataTable("#stockTable")) {
            $("#stockTable").DataTable().destroy();
          }
        } catch (dtError) {
          console.warn("Error destroying DataTable during reset:", dtError);
        }

        const tableBody = document.querySelector("#stockTable tbody");
        if (tableBody) {
          tableBody.innerHTML = `
            <tr>
              <td colspan="9" class="text-center">Terjadi kesalahan saat memuat data</td>
            </tr>
          `;
        }

        // Initialize a fresh DataTable
        try {
          if (!$.fn.DataTable.isDataTable("#stockTable")) {
            $("#stockTable").DataTable({
              responsive: true,
              language: {
                emptyTable: "Tidak ada data yang tersedia",
              },
              dom: "Bfrtip",
              buttons: [
                {
                  extend: "excel",
                  text: '<i class="fas fa-file-excel me-2"></i>Excel',
                  className: "btn btn-success btn-sm me-1",
                },
                {
                  extend: "pdf",
                  text: '<i class="fas fa-file-pdf me-2"></i>PDF',
                  className: "btn btn-danger btn-sm me-1",
                },
                {
                  extend: "print",
                  text: '<i class="fas fa-print me-2"></i>Print',
                  className: "btn btn-primary btn-sm",
                },
              ],
            });
          }
        } catch (initError) {
          console.warn("Error initializing DataTable during reset:", initError);
        }
      } catch (innerError) {
        console.warn("Error resetting table:", innerError);
      }
    } finally {
      // Pastikan loading indicator dimatikan dalam semua kasus
      this.showLoading(false);

      // Bersihkan cache yang sudah tidak digunakan
      setTimeout(() => this.cleanupCache(), 1000);
    }
  },

  // Metode untuk menghitung kontinuitas stok dengan logika yang benar
  async calculateStockContinuity(startDate, endDate) {
    try {
      this.showLoading(true);

      // Buat tanggal sehari sebelum tanggal awal
      const previousDay = new Date(startDate);
      previousDay.setDate(previousDay.getDate() - 1);
      previousDay.setHours(23, 59, 59, 999);

      // Tambahkan waktu ke tanggal akhir
      const endDateWithTime = new Date(endDate);
      endDateWithTime.setHours(23, 59, 59, 999);

      // Ambil data transaksi stok dari Firestore
      const stockTransactionsRef = collection(firestore, "stokAksesorisTransaksi");

      // Query untuk mendapatkan semua transaksi hingga tanggal akhir
      const transactionsQuery = query(
        stockTransactionsRef,
        where("timestamp", "<=", Timestamp.fromDate(endDateWithTime)),
        orderBy("timestamp", "asc")
      );

      const transactionsSnapshot = await getDocs(transactionsQuery);

      // Map untuk menyimpan data stok per kode barang
      const stockByCode = {};

      // Proses semua transaksi
      transactionsSnapshot.forEach((doc) => {
        const transaction = doc.data();
        const kode = transaction.kode;
        const timestamp = transaction.timestamp.toDate();

        if (!kode) return;

        if (!stockByCode[kode]) {
          stockByCode[kode] = {
            // Data untuk periode sebelum tanggal mulai
            before: {
              stokAwal: 0,
              tambahStok: 0,
              laku: 0,
              free: 0,
              gantiLock: 0,
            },
            // Data untuk periode yang dipilih
            during: {
              tambahStok: 0,
              laku: 0,
              free: 0,
              gantiLock: 0,
            },
            nama: transaction.nama || "",
            kategori: transaction.kategori || "",
          };
        }

        // Tentukan apakah transaksi terjadi sebelum atau selama periode yang dipilih
        const isPeriodBefore = timestamp <= previousDay;
        const isPeriodDuring = timestamp > previousDay && timestamp <= endDateWithTime;

        // Update data berdasarkan jenis transaksi dan periode
        if (isPeriodBefore) {
          // Transaksi sebelum periode yang dipilih
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
          // Transaksi selama periode yang dipilih
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

      // Ambil data tambahan stok dari stockAdditions jika ada
      const stockAddRef = collection(firestore, "stockAdditions");
      const stockAddSnapshot = await getDocs(stockAddRef);

      stockAddSnapshot.forEach((doc) => {
        const data = doc.data();
        if (!data.timestamp) return;

        const timestamp = data.timestamp.toDate();

        if (data.items && data.items.length) {
          data.items.forEach((item) => {
            const kode = item.kodeText;
            if (!kode) return;

            const quantity = parseInt(item.jumlah) || 0;

            if (!stockByCode[kode]) {
              stockByCode[kode] = {
                before: {
                  stokAwal: 0,
                  tambahStok: 0,
                  laku: 0,
                  free: 0,
                  gantiLock: 0,
                },
                during: {
                  tambahStok: 0,
                  laku: 0,
                  free: 0,
                  gantiLock: 0,
                },
                nama: item.nama || "",
                kategori: "",
              };
            }

            // Kategorikan berdasarkan tanggal
            if (timestamp <= previousDay) {
              stockByCode[kode].before.tambahStok += quantity;
            } else if (timestamp <= endDateWithTime) {
              stockByCode[kode].during.tambahStok += quantity;
            }
          });
        }
      });

      // Ambil data kode aksesoris untuk memastikan semua item tercakup
      await this.loadAllKodeAksesoris();

      // Buat data stok dengan kontinuitas yang benar
      this.filteredStockData = this.stockData.map((item) => {
        const kode = item.kode;
        const stockInfo = stockByCode[kode] || {
          before: {
            stokAwal: 0,
            tambahStok: 0,
            laku: 0,
            free: 0,
            gantiLock: 0,
          },
          during: {
            tambahStok: 0,
            laku: 0,
            free: 0,
            gantiLock: 0,
          },
        };

        // Hitung stok awal periode (stok akhir dari periode sebelumnya)
        const initialStock =
          stockInfo.before.stokAwal +
          stockInfo.before.tambahStok -
          stockInfo.before.laku -
          stockInfo.before.free -
          stockInfo.before.gantiLock;

        // Hitung stok akhir periode
        const finalStock =
          Math.max(0, initialStock) +
          stockInfo.during.tambahStok -
          stockInfo.during.laku -
          stockInfo.during.free -
          stockInfo.during.gantiLock;

        // Buat objek data stok dengan kontinuitas yang benar
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

      // Urutkan berdasarkan kategori dulu (kotak dulu, lalu aksesoris), kemudian berdasarkan kode
      this.filteredStockData.sort((a, b) => {
        // Prioritaskan kategori
        if ((a.kategori || "unknown") !== (b.kategori || "unknown")) {
          return (a.kategori || "unknown") === "kotak" ? -1 : 1;
        }

        // Jika kategori sama, urutkan berdasarkan kode
        return (a.kode || "").localeCompare(b.kode || "");
      });

      this.showLoading(false);
    } catch (error) {
      console.error("Error menghitung kontinuitas stok:", error);
      this.showError("Error menghitung kontinuitas stok: " + error.message);
      this.showLoading(false);
    }
  },

  // Render the sales table
  renderSalesTable() {
    try {
      // Periksa apakah tabel ada di DOM
      const tableElement = document.getElementById("penjualanTable");
      if (!tableElement) {
        console.error("Elemen tabel #penjualanTable tidak ditemukan di DOM");
        return;
      }

      // Hancurkan DataTable yang ada dengan aman
      try {
        if ($.fn.DataTable.isDataTable("#penjualanTable")) {
          $("#penjualanTable").DataTable().destroy();
        }
      } catch (error) {
        console.warn("Error destroying DataTable:", error);
        // Lanjutkan eksekusi meskipun destroy gagal
      }

      // Get table body
      const tableBody = document.querySelector("#penjualanTable tbody");
      if (!tableBody) {
        console.error("Elemen tbody dari #penjualanTable tidak ditemukan");
        return;
      }

      // Clear table body
      tableBody.innerHTML = "";

      // Check if there's data to display
      if ((this.isSummaryMode && !this.summaryData.length) || (!this.isSummaryMode && !this.filteredSalesData.length)) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="9" class="text-center">Tidak ada data yang sesuai dengan filter</td>
          </tr>
        `;

        // Inisialisasi DataTable kosong
        $("#penjualanTable").DataTable({
          language: {
            url: "//cdn.datatables.net/plug-ins/1.10.25/i18n/Indonesian.json",
          },
          dom: "Bfrtip",
          buttons: ["excel", "pdf", "print"],
        });

        return;
      }

      // Prepare data for table
      let totalRevenue = 0;
      let totalTransactions = 0;

      if (this.isSummaryMode) {
        // Render summary view
        // Modify table header for summary view
        const tableHeader = document.querySelector("#penjualanTable thead tr");
        if (tableHeader) {
          tableHeader.innerHTML = `
            <th>Kode Barang</th>
            <th>Nama Barang</th>
            <th>Total Jumlah</th>
            <th>Total Harga</th>
          `;
        }

        // Calculate total revenue
        totalRevenue = this.summaryData.reduce((sum, item) => sum + item.totalHarga, 0);

        // Render summary rows
        this.summaryData.forEach((item) => {
          const row = document.createElement("tr");
          row.innerHTML = `
            <td>${item.kode}</td>
            <td>${item.nama}</td>
            <td class="text-center">${item.jumlah}</td>
            <td>Rp ${item.totalHarga.toLocaleString("id-ID")}</td>
          `;
          tableBody.appendChild(row);
        });

        // Set total transactions to number of unique items
        totalTransactions = this.summaryData.length;

        // Tambahkan tombol print struk di samping tombol summary
        const salesSummary = document.querySelector(".sales-summary");
        if (salesSummary) {
          // Periksa apakah tombol sudah ada
          if (!document.getElementById("printReceiptBtn")) {
            const printReceiptBtn = document.createElement("button");
            printReceiptBtn.id = "printReceiptBtn";
            printReceiptBtn.className = "btn btn-sm btn-warning me-2";
            printReceiptBtn.innerHTML = '<i class="fas fa-print me-1"></i> Print Struk';

            // Gunakan fungsi global printSummaryReceiptFormat
            printReceiptBtn.addEventListener("click", () => {
              // Panggil fungsi print dengan mengakses handler
              printSummaryReceiptFormat(this.summaryData);
            });

            // Tambahkan tombol setelah tombol summary
            salesSummary.insertBefore(printReceiptBtn, document.getElementById("totalTransactions"));
          }
        }
      } else {
        // Render detailed view
        // Restore original table header
        const tableHeader = document.querySelector("#penjualanTable thead tr");
        if (tableHeader) {
          tableHeader.innerHTML = `
            <th>Tanggal</th>
            <th>Sales</th>
            <th style="width: 1%">Jenis</th>
            <th>Kode Barang</th>
            <th>Nama Barang</th>
            <th>Jumlah</th>
            <th>Berat</th>
            <th>Harga</th>
            <th>Aksi</th>
          `;
        }

        // Process each transaction
        this.filteredSalesData.forEach((transaction) => {
          const date = transaction.timestamp ? formatDate(transaction.timestamp.toDate()) : transaction.tanggal;

          const sales = transaction.sales || "Admin";

          // Modifikasi tampilan jenis penjualan untuk gantiLock
          let jenisPenjualan = transaction.jenisPenjualan || "Tidak diketahui";

          totalRevenue += transaction.totalHarga || 0;
          totalTransactions++;

          // Process each item in the transaction
          if (transaction.items && transaction.items.length > 0) {
            transaction.items.forEach((item) => {
              // Untuk jenis gantiLock, tambahkan kode lock ke tampilan jenis penjualan
              let displayJenisPenjualan = jenisPenjualan;
              if (jenisPenjualan === "gantiLock" && item.kodeLock) {
                displayJenisPenjualan = `gantiLock ${item.kodeLock}`;
              }

              const row = document.createElement("tr");
              row.innerHTML = `
              <td>${date}</td>
              <td>${sales}</td>
              <td>${displayJenisPenjualan}</td>
              <td>${item.kodeText || "-"}</td>
              <td>${item.nama || "-"}</td>
              <td>${item.jumlah || 1}</td>
              <td>${item.berat ? item.berat + " gr" : "-"}</td>
              <td>Rp ${parseInt(item.totalHarga || 0).toLocaleString("id-ID")}</td>
              <td>
                <div class="dropdown">
                  <button class="btn btn-sm btn-primary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                    <i class="fas fa-cog"></i>
                  </button>
                  <ul class="dropdown-menu dropdown-menu-end">
                    <li><button class="dropdown-item btn-reprint" data-id="${
                      transaction.id
                    }"><i class="fas fa-print me-2"></i>Cetak Ulang</button></li>
                    <li><button class="dropdown-item btn-edit" data-id="${
                      transaction.id
                    }"><i class="fas fa-edit me-2"></i>Edit</button></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><button class="dropdown-item btn-delete text-danger" data-id="${
                      transaction.id
                    }"><i class="fas fa-trash-alt me-2"></i>Hapus</button></li>
                  </ul>
                </div>
              </td>
            `;
              tableBody.appendChild(row);
            });
          } else {
            // Fallback if no items
            const row = document.createElement("tr");
            row.innerHTML = `
              <td>${date}</td>
              <td>${sales}</td>
              <td>${jenisPenjualan}</td>
              <td colspan="4" class="text-center">Tidak ada detail item</td>
              <td>Rp ${parseInt(transaction.totalHarga || 0).toLocaleString("id-ID")}</td>
              <td>
                <button class="btn btn-sm btn-info btn-detail" data-id="${transaction.id}">
                  <i class="fas fa-eye"></i>
                </button>
              </td>
            `;
            tableBody.appendChild(row);
          }
        });

        // Hapus tombol print struk jika ada
        const printReceiptBtn = document.getElementById("printReceiptBtn");
        if (printReceiptBtn) {
          printReceiptBtn.remove();
        }
      }

      // Update summary
      document.getElementById("totalTransactions").textContent = this.isSummaryMode
        ? `Total Jenis Barang: ${totalTransactions}`
        : `Total Transaksi: ${totalTransactions}`;
      document.getElementById("totalRevenue").textContent = `Total Pendapatan: Rp ${parseInt(
        totalRevenue
      ).toLocaleString("id-ID")}`;

      // Initialize DataTable with a delay to ensure DOM is ready
      setTimeout(() => {
        try {
          $("#penjualanTable").DataTable({
            language: {
              url: "//cdn.datatables.net/plug-ins/1.10.25/i18n/Indonesian.json",
            },
            dom: "Bfrtip",
            buttons: ["excel", "pdf", "print"],
            order: this.isSummaryMode ? [[3, "desc"]] : [[0, "desc"]], // Sort by total price in summary mode, date in detail mode
          });
        } catch (error) {
          console.error("Error initializing DataTable:", error);
        }
      }, 100);

      // Attach event handlers for detail buttons (only in detailed view)
      if (!this.isSummaryMode) {
        // Detail button handler
        document.querySelectorAll(".btn-detail").forEach((btn) => {
          btn.addEventListener("click", () => {
            const transactionId = btn.getAttribute("data-id");
            this.showTransactionDetails(transactionId);
          });
        });

        // Reprint button handler
        document.querySelectorAll(".btn-reprint").forEach((btn) => {
          btn.addEventListener("click", () => {
            const transactionId = btn.getAttribute("data-id");
            this.reprintInvoice(transactionId);
          });
        });

        // Edit button handler
        document.querySelectorAll(".btn-edit").forEach((btn) => {
          btn.addEventListener("click", () => {
            const transactionId = btn.getAttribute("data-id");
            this.showEditForm(transactionId);
          });
        });

        // Delete button handler
        document.querySelectorAll(".btn-delete").forEach((btn) => {
          btn.addEventListener("click", () => {
            const transactionId = btn.getAttribute("data-id");
            this.confirmDelete(transactionId);
          });
        });
      }
    } catch (error) {
      console.error("Error rendering sales table:", error);
    }
  },

  // Show transaction details (existing method, but let's add it for reference)
  showTransactionDetail(transactionId) {
    try {
      const transaction = this.salesData.find((item) => item.id === transactionId);
      if (!transaction) {
        throw new Error("Transaksi tidak ditemukan");
      }

      const modalBody = document.querySelector("#detailModal .modal-body");

      // Format tanggal
      const tanggal = transaction.tanggal || this.formatTimestamp(transaction.timestamp);

      // Buat HTML untuk detail transaksi
      let detailHTML = `
        <div class="transaction-detail">
          <div class="row mb-3">
            <div class="col-md-6">
              <p><strong>Tanggal:</strong> ${tanggal}</p>
              <p><strong>Sales:</strong> ${transaction.sales || "-"}</p>
              <p><strong>Jenis Penjualan:</strong> ${this.formatSalesType(transaction.jenisPenjualan)}</p>
            </div>
            <div class="col-md-6">
              <p><strong>Metode Bayar:</strong> ${this.formatPaymentMethod(transaction.metodeBayar)}</p>
              <p><strong>Status Pembayaran:</strong> ${transaction.statusPembayaran || "Lunas"}</p>
              <p><strong>Total Harga:</strong> Rp ${this.formatNumber(transaction.totalHarga)}</p>
            </div>
          </div>
          
          <h5 class="mb-3">Detail Item</h5>
          <div class="table-responsive">
            <table class="table table-bordered table-striped">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Nama Barang</th>
                  <th>Jumlah</th>
                  <th>Kadar</th>
                  <th>Berat</th>
                  <th>Harga</th>
                </tr>
              </thead>
              <tbody>
      `;

      // Tambahkan baris untuk setiap item
      transaction.items.forEach((item) => {
        detailHTML += `
          <tr>
            <td>${item.kodeText || "-"}</td>
            <td>${item.nama || "-"}</td>
            <td>${item.jumlah || "1"}</td>
            <td>${item.kadar || "-"}</td>
            <td>${item.berat || "-"}</td>
            <td>Rp ${this.formatNumber(item.totalHarga)}</td>
          </tr>
        `;
      });

      detailHTML += `
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="5" class="text-end"><strong>Total:</strong></td>
                  <td><strong>Rp ${this.formatNumber(transaction.totalHarga)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      `;

      // Tambahkan tombol cetak di footer modal
      const modalFooter = document.querySelector("#detailModal .modal-footer");
      modalFooter.innerHTML = `
        <div class="btn-group me-2">
          <button type="button" class="btn btn-primary" id="btnPrintInvoice">
            <i class="fas fa-file-invoice me-1"></i> Cetak Invoice
          </button>
          <button type="button" class="btn btn-info" id="btnPrintReceipt">
            <i class="fas fa-receipt me-1"></i> Cetak Struk
          </button>
        </div>
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Tutup</button>
      `;

      // Set HTML ke modal body
      modalBody.innerHTML = detailHTML;

      // Simpan data transaksi saat ini untuk digunakan saat mencetak
      this.currentTransaction = transaction;

      // Tampilkan modal
      const detailModal = new bootstrap.Modal(document.getElementById("detailModal"));
      detailModal.show();

      // Tambahkan event listener untuk tombol cetak
      document.getElementById("btnPrintInvoice").addEventListener("click", () => {
        this.printInvoice(transaction);
      });

      document.getElementById("btnPrintReceipt").addEventListener("click", () => {
        this.printReceipt(transaction);
      });
    } catch (error) {
      console.error("Error showing transaction detail:", error);
      this.showError("Error menampilkan detail transaksi: " + error.message);
    }
  },

  // Fungsi untuk mencetak struk kasir
  printReceipt(transaction) {
    try {
      if (!transaction) {
        this.showError("Tidak ada data transaksi untuk dicetak!");
        return;
      }

      console.log("Printing receipt with data:", transaction);

      // Buat jendela baru untuk print
      const printWindow = window.open("", "_blank");

      // Periksa apakah jendela berhasil dibuka
      if (!printWindow) {
        throw new Error("Popup diblokir oleh browser. Mohon izinkan popup untuk mencetak struk.");
      }

      // Format tanggal
      const tanggal = transaction.tanggal || this.formatTimestamp(transaction.timestamp);
      const salesType = transaction.jenisPenjualan || "aksesoris";

      // Buat konten HTML untuk struk
      let receiptHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Struk Kasir</title>
        <style>
          body {
            font-family: 'Courier New', monospace;
            font-size: 13px;
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
          .text-center {
            text-align: center;
          }
          .text-right {
            text-align: right;
          }
          .keterangan {
            font-style: italic;
            font-size: 13px;
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
          <h4>NOTA PENJUALAN ${salesType.toUpperCase()}</h4>
          <hr>
          <p>Tanggal: ${tanggal}<br>Sales: ${transaction.sales || "-"}</p>
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

      // Tambahkan item ke struk
      let hasKeterangan = false;
      let keteranganText = "";

      transaction.items.forEach((item) => {
        receiptHTML += `
        <tr>
          <td>${item.kodeText || "-"}</td>
          <td>${item.nama || "-"}</td>
          <td>${item.kadar || "-"}</td>
          <td>${item.berat || "-"}</td>
          <td class="text-right">${parseInt(item.totalHarga || 0).toLocaleString("id-ID")}</td>
        </tr>
      `;

        // Simpan keterangan jika ada
        if (item.keterangan && item.keterangan.trim() !== "") {
          hasKeterangan = true;
          keteranganText += item.keterangan + " ";
        }
      });

      // Tambahkan total
      receiptHTML += `
            <tr>
              <td colspan="4" class="text-right"><strong>Total:</strong></td>
              <td class="text-right"><strong>${parseInt(transaction.totalHarga || 0).toLocaleString(
                "id-ID"
              )}</strong></td>
            </tr>
          </table>
          <hr>
    `;

      // Tambahkan keterangan jika ada
      if (hasKeterangan && transaction.jenisPenjualan === "manual") {
        receiptHTML += `
          <div class="keterangan">
            <strong>Keterangan:</strong> ${keteranganText}
          </div>
      `;
      }

      receiptHTML += `
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

      // Tulis HTML ke jendela baru dengan penanganan error yang lebih baik
      try {
        // Tunggu sebentar untuk memastikan jendela sudah siap
        setTimeout(() => {
          if (printWindow.document) {
            printWindow.document.write(receiptHTML);
            printWindow.document.close();
          } else {
            console.error("Dokumen jendela cetak tidak tersedia");
            this.showError("Gagal mencetak struk: Dokumen jendela cetak tidak tersedia");
          }
        }, 100);
      } catch (writeError) {
        console.error("Error writing to print window:", writeError);
        this.showError("Gagal menulis ke jendela cetak: " + writeError.message);
      }
    } catch (error) {
      console.error("Error printing receipt:", error);
      this.showError("Error mencetak struk: " + error.message);
    }
  },

  // Fungsi untuk mencetak invoice customer
  printInvoice(transaction) {
    try {
      const currentTransactionData = transaction;
      if (!currentTransactionData) {
        this.showError("Tidak ada data transaksi untuk dicetak!");
        return;
      }

      console.log("Printing invoice with data:", currentTransactionData);

      // Buat jendela baru untuk print
      const printWindow = window.open("", "_blank");

      // Buat konten HTML untuk invoice
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
            margin-right:3cm:
            margin-top:1cm;
          }         
          .total-row {
            margin-top: 1.9cm;
            text-align: right;
            font-weight: bold;
            margin-right: 3cm;
          }
          .sales{
          text-align: right;
          margin-top: 0.6cm;
          margin-right:2cm;
          }
          .keterangan {
            font-style: italic;
            font-size: 10px;
            margin-top: 2mm;
            padding-top: 2mm;
          }
          
          .item-details {
            display: flex;
            flex-wrap: wrap;
          }
          .item-price {
            width: 100%;
            text-align: right;
            font-weight: bold;
          }
          .item-data {
            display: grid;
            grid-template-columns: 2cm 1.8cm 5cm 2cm 2cm 2cm;
            width: 100%;
            column-gap: 0.2cm;
            margin-left: 1cm;
            margin-top: 1.5cm;
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
            <p>${transaction.tanggal || this.formatTimestamp(transaction.timestamp)}</p>
          </div>
          <hr>
    `;

      // Tambahkan item ke invoice
      let hasKeterangan = false;
      let keteranganText = "";
      let totalHarga = 0;

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
              <span>${itemHarga.toLocaleString("id-ID")}</span>
            </div>
          </div>
      `;

        // Simpan keterangan jika ada
        if (item.keterangan && item.keterangan.trim() !== "") {
          hasKeterangan = true;
          keteranganText += `${item.nama}: ${item.keterangan}; `;
        }
      });

      // Tambahkan total di pojok kanan bawah
      invoiceHTML += `
          <div class="total-row">
            Rp ${totalHarga.toLocaleString("id-ID")}
          </div>
        <div class="sales">${transaction.sales || "-"}</div>
    `;

      // Tambahkan keterangan jika ada
      if (hasKeterangan && transaction.jenisPenjualan === "manual") {
        invoiceHTML += `
          <div class="keterangan">
            ${keteranganText}
          </div>
      `;
      }

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

      // Tulis HTML ke jendela baru
      printWindow.document.write(invoiceHTML);
      printWindow.document.close();
    } catch (error) {
      console.error("Error printing invoice:", error);
      this.showError("Error mencetak invoice: " + error.message);
    }
  },

  // Fungsi untuk memformat timestamp menjadi string tanggal
  formatTimestamp(timestamp) {
    if (!timestamp) return "-";

    try {
      // Jika timestamp adalah objek Timestamp dari Firestore
      if (timestamp.toDate) {
        const date = timestamp.toDate();
        return formatDate(date);
      }
      // Jika timestamp sudah dalam bentuk Date
      else if (timestamp instanceof Date) {
        return formatDate(timestamp);
      }
      // Jika timestamp dalam format string
      else {
        return timestamp;
      }
    } catch (error) {
      console.error("Error formatting timestamp:", error);
      return "-";
    }
  },

  // Fungsi untuk memformat jenis penjualan
  formatSalesType(type) {
    if (!type) return "-";

    switch (type.toLowerCase()) {
      case "aksesoris":
        return "Aksesoris";
      case "kotak":
        return "Kotak Perhiasan";
      case "gantilock":
        return "Ganti Lock";
      case "manual":
        return "Manual";
      default:
        return type;
    }
  },

  // Fungsi untuk memformat angka menjadi format rupiah
  formatNumber(number) {
    if (number === undefined || number === null) return "0";

    // Pastikan number adalah angka
    const num = typeof number === "string" ? parseInt(number.replace(/\D/g, "")) : number;

    return num.toLocaleString("id-ID");
  },

  // Reprint invoice - modifikasi fungsi yang sudah ada
  async reprintInvoice(transactionId) {
    try {
      this.showLoading(true);

      // Get transaction data from Firestore
      const transactionDoc = await getDoc(doc(firestore, "penjualanAksesoris", transactionId));

      if (!transactionDoc.exists()) {
        throw new Error("Transaksi tidak ditemukan");
      }

      const transaction = transactionDoc.data();
      transaction.id = transactionId; // Tambahkan ID ke objek transaksi

      // Tampilkan dropdown untuk memilih jenis cetak
      const printOptions = [
        { id: "invoice", name: "Invoice Customer (A4)", icon: "file-invoice" },
        { id: "receipt", name: "Struk Kasir (Thermal)", icon: "receipt" },
      ];

      // Buat modal untuk memilih jenis cetak
      const modalHTML = `
      <div class="modal fade" id="printOptionsModal" tabindex="-1" aria-labelledby="printOptionsModalLabel" aria-hidden="true">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="printOptionsModalLabel">Pilih Jenis Cetak</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div class="list-group">
                ${printOptions
                  .map(
                    (option) => `
                  <button type="button" class="list-group-item list-group-item-action print-option" data-option="${option.id}">
                    <i class="fas fa-${option.icon} me-2"></i> ${option.name}
                  </button>
                `
                  )
                  .join("")}
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Batal</button>
            </div>
          </div>
        </div>
      </div>
    `;

      // Tambahkan modal ke body jika belum ada
      if (!document.getElementById("printOptionsModal")) {
        const modalContainer = document.createElement("div");
        modalContainer.innerHTML = modalHTML;
        document.body.appendChild(modalContainer);
      }

      // Tampilkan modal
      const printOptionsModal = new bootstrap.Modal(document.getElementById("printOptionsModal"));
      printOptionsModal.show();

      // Tambahkan event listener untuk opsi cetak
      document.querySelectorAll(".print-option").forEach((button) => {
        button.addEventListener("click", () => {
          const option = button.getAttribute("data-option");
          printOptionsModal.hide();

          // Cetak sesuai opsi yang dipilih
          if (option === "invoice") {
            this.printInvoice(transaction);
          } else if (option === "receipt") {
            this.printReceipt(transaction);
          }
        });
      });

      this.showLoading(false);
    } catch (error) {
      console.error("Error reprinting invoice:", error);
      this.showError("Error mencetak ulang: " + error.message);
      this.showLoading(false);
    }
  },

  // Show edit form
  async showEditForm(transactionId) {
    try {
      this.showLoading(true);

      // Get transaction data from Firestore
      const transactionDoc = await getDoc(doc(firestore, "penjualanAksesoris", transactionId));

      if (!transactionDoc.exists()) {
        throw new Error("Transaksi tidak ditemukan");
      }

      const transaction = transactionDoc.data();

      // Store the transaction ID for later use
      this.currentEditId = transactionId;

      // Fill the edit form with transaction data
      document.getElementById("editSales").value = transaction.sales || "";
      document.getElementById("editJenisPenjualan").value = transaction.jenisPenjualan || "aksesoris";

      // Clear previous items
      const itemsContainer = document.getElementById("editItemsContainer");
      itemsContainer.innerHTML = "";

      // Add items to the form
      if (transaction.items && transaction.items.length > 0) {
        transaction.items.forEach((item, index) => {
          const itemRow = document.createElement("div");
          itemRow.className = "card mb-3 edit-item";
          itemRow.dataset.index = index;

          itemRow.innerHTML = `
          <div class="card-body">
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">Kode</label>
                <input type="text" class="form-control item-kode" value="${item.kodeText || ""}">
              </div>
              <div class="col-md-6">
                <label class="form-label">Nama</label>
                <input type="text" class="form-control item-nama" value="${item.nama || ""}">
              </div>
              <div class="col-md-4">
                <label class="form-label">Jumlah</label>
                <input type="number" class="form-control item-jumlah" value="${item.jumlah || 1}" min="1">
              </div>
              <div class="col-md-4">
                <label class="form-label">Berat (gr)</label>
                <input type="number" class="form-control item-berat" value="${item.berat || 0}" step="0.01">
              </div>
              <div class="col-md-4">
                <label class="form-label">Harga</label>
                <input type="text" class="form-control item-harga" value="${parseInt(item.totalHarga || 0)}">
              </div>
            </div>
            <div class="mt-2 text-end">
              <button type="button" class="btn btn-sm btn-danger btn-remove-item">
                <i class="fas fa-trash-alt"></i> Hapus Item
              </button>
            </div>
          </div>
        `;

          itemsContainer.appendChild(itemRow);

          // Add event listener for remove button
          itemRow.querySelector(".btn-remove-item").addEventListener("click", function () {
            itemRow.remove();
          });

          // Add event listener for formatting price
          const hargaInput = itemRow.querySelector(".item-harga");
          hargaInput.addEventListener("blur", function () {
            const value = this.value.replace(/\D/g, "");
            this.value = parseInt(value || 0).toLocaleString("id-ID");
          });

          hargaInput.addEventListener("focus", function () {
            this.value = this.value.replace(/\./g, "");
          });
        });
      }

      // Add button to add new item
      const addItemBtn = document.createElement("button");
      addItemBtn.type = "button";
      addItemBtn.className = "btn btn-success mt-2";
      addItemBtn.innerHTML = '<i class="fas fa-plus"></i> Tambah Item';
      addItemBtn.addEventListener("click", () => {
        this.addNewItemRow();
      });

      itemsContainer.appendChild(addItemBtn);

      // Show modal
      const editModal = new bootstrap.Modal(document.getElementById("editModal"));
      editModal.show();

      this.showLoading(false);
    } catch (error) {
      console.error("Error showing edit form:", error);
      this.showError("Error menampilkan form edit: " + error.message);
      this.showLoading(false);
    }
  },

  // Add new item row to edit form
  addNewItemRow() {
    const itemsContainer = document.getElementById("editItemsContainer");
    const itemCount = document.querySelectorAll(".edit-item").length;

    const itemRow = document.createElement("div");
    itemRow.className = "card mb-3 edit-item";
    itemRow.dataset.index = itemCount;

    itemRow.innerHTML = `
    <div class="card-body">
      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label">Kode</label>
          <input type="text" class="form-control item-kode" value="">
        </div>
        <div class="col-md-6">
          <label class="form-label">Nama</label>
          <input type="text" class="form-control item-nama" value="">
        </div>
        <div class="col-md-4">
          <label class="form-label">Jumlah</label>
          <input type="number" class="form-control item-jumlah" value="1" min="1">
        </div>
        <div class="col-md-4">
          <label class="form-label">Berat (gr)</label>
          <input type="number" class="form-control item-berat" value="0" step="0.01">
        </div>
        <div class="col-md-4">
          <label class="form-label">Harga</label>
          <input type="text" class="form-control item-harga" value="0">
        </div>
      </div>
      <div class="mt-2 text-end">
        <button type="button" class="btn btn-sm btn-danger btn-remove-item">
          <i class="fas fa-trash-alt"></i> Hapus Item
        </button>
      </div>
    </div>
  `;

    // Insert before the add button
    const addButton = itemsContainer.querySelector("button");
    itemsContainer.insertBefore(itemRow, addButton);

    // Add event listener for remove button
    itemRow.querySelector(".btn-remove-item").addEventListener("click", function () {
      itemRow.remove();
    });

    // Add event listener for formatting price
    const hargaInput = itemRow.querySelector(".item-harga");
    hargaInput.addEventListener("blur", function () {
      const value = this.value.replace(/\D/g, "");
      this.value = parseInt(value || 0).toLocaleString("id-ID");
    });

    hargaInput.addEventListener("focus", function () {
      this.value = this.value.replace(/\./g, "");
    });
  },

  // Save edited transaction
  async saveEditedTransaction() {
    try {
      this.showLoading(true);

      if (!this.currentEditId) {
        throw new Error("ID transaksi tidak ditemukan");
      }

      // Get form data
      const sales = document.getElementById("editSales").value.trim();
      const jenisPenjualan = document.getElementById("editJenisPenjualan").value;

      if (!sales) {
        throw new Error("Nama sales harus diisi");
      }

      // Get items data
      const itemElements = document.querySelectorAll(".edit-item");
      const items = [];

      let totalHarga = 0;

      itemElements.forEach((itemEl) => {
        const kodeText = itemEl.querySelector(".item-kode").value.trim();
        const nama = itemEl.querySelector(".item-nama").value.trim();
        const jumlah = parseInt(itemEl.querySelector(".item-jumlah").value) || 1;
        const berat = parseFloat(itemEl.querySelector(".item-berat").value) || 0;
        const hargaStr = itemEl.querySelector(".item-harga").value.replace(/\./g, "");
        const totalHargaItem = parseInt(hargaStr) || 0;

        if (!nama) {
          throw new Error("Nama barang harus diisi");
        }

        items.push({
          kodeText,
          nama,
          jumlah,
          berat,
          totalHarga: totalHargaItem,
        });

        totalHarga += totalHargaItem;
      });

      if (items.length === 0) {
        throw new Error("Minimal harus ada satu item");
      }

      // Buat objek data yang akan diupdate
      const updatedData = {
        sales,
        jenisPenjualan,
        totalHarga,
        items,
        lastEdited: new Date(),
      };

      // Update transaction in Firestore
      await updateDoc(doc(firestore, "penjualanAksesoris", this.currentEditId), updatedData);

      // PERUBAHAN: Update data lokal
      // Cari indeks data yang diedit di salesData
      const salesDataIndex = this.salesData.findIndex((item) => item.id === this.currentEditId);
      if (salesDataIndex !== -1) {
        // Update data di salesData dengan mempertahankan properti lain yang tidak diubah
        this.salesData[salesDataIndex] = {
          ...this.salesData[salesDataIndex], // Pertahankan properti lain
          ...updatedData, // Terapkan perubahan baru
        };
      }

      // Cari indeks data yang diedit di filteredSalesData
      const filteredDataIndex = this.filteredSalesData.findIndex((item) => item.id === this.currentEditId);
      if (filteredDataIndex !== -1) {
        // Update data di filteredSalesData
        this.filteredSalesData[filteredDataIndex] = {
          ...this.filteredSalesData[filteredDataIndex], // Pertahankan properti lain
          ...updatedData, // Terapkan perubahan baru
        };
      }

      // Render ulang tabel dengan data yang sudah diperbarui
      this.renderSalesTable();

      // Close modal
      const editModal = bootstrap.Modal.getInstance(document.getElementById("editModal"));
      editModal.hide();

      // Show success message
      this.showSuccess("Transaksi berhasil diperbarui");

      // Refresh data
      this.loadSalesData();

      this.showLoading(false);
    } catch (error) {
      console.error("Error saving edited transaction:", error);
      this.showError("Error menyimpan perubahan: " + error.message);
      this.showLoading(false);
    }
  },

  // Confirm delete
  async confirmDelete(transactionId) {
    // Store the ID for the delete operation
    this.currentDeleteId = transactionId;

    // Show confirmation dialog
    const confirmed = await this.showConfirm("Apakah Anda yakin ingin menghapus transaksi ini?");
    if (confirmed) {
      this.deleteTransaction();
    }
  },

  // Delete transaction
  async deleteTransaction() {
    try {
      this.showLoading(true);

      if (!this.currentDeleteId) {
        throw new Error("ID transaksi tidak ditemukan");
      }

      // Delete transaction from Firestore
      await deleteDoc(doc(firestore, "penjualanAksesoris", this.currentDeleteId));

      // Tidak perlu menutup modal karena kita menggunakan SweetAlert2
      // Hapus baris berikut:
      // const confirmationModal = bootstrap.Modal.getInstance(document.getElementById("confirmationModal"));
      // confirmationModal.hide();

      // PERUBAHAN: Update data lokal dengan menghapus item dari array
      this.salesData = this.salesData.filter((item) => item.id !== this.currentDeleteId);
      this.filteredSalesData = this.filteredSalesData.filter((item) => item.id !== this.currentDeleteId);

      // Render ulang tabel dengan data yang sudah diperbarui
      this.renderSalesTable();

      // Show success message
      this.showSuccess("Transaksi berhasil dihapus");

      this.showLoading(false);
    } catch (error) {
      console.error("Error deleting transaction:", error);
      this.showError("Error menghapus transaksi: " + error.message);
      this.showLoading(false);
    }
  },

  // Show success message
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

  // Show error message
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

  // Show confirmation dialog
  showConfirm(message, title = "Konfirmasi") {
    return new Promise((resolve) => {
      if (typeof Swal !== "undefined") {
        Swal.fire({
          title: title,
          html: message,
          icon: "question",
          showCancelButton: true,
          confirmButtonColor: "#28a745",
          cancelButtonColor: "#dc3545",
          confirmButtonText: "Ya",
          cancelButtonText: "Batal",
        }).then((result) => {
          resolve(result.isConfirmed);
        });
      } else {
        resolve(confirm(message));
      }
    });
  },

  renderStockTable() {
    try {
      // Periksa apakah tabel ada di DOM sebelum mencoba destroy
      const tableElement = document.getElementById("stockTable");
      if (!tableElement) {
        console.error("Elemen tabel #stockTable tidak ditemukan di DOM");
        return;
      }

      // Hancurkan DataTable yang ada dengan aman
      try {
        if ($.fn.DataTable.isDataTable("#stockTable")) {
          $("#stockTable").DataTable().destroy();
        }
      } catch (error) {
        console.warn("Error destroying DataTable:", error);
        // Lanjutkan eksekusi meskipun destroy gagal
      }

      // Get table body
      const tableBody = document.querySelector("#stockTable tbody");
      if (!tableBody) {
        console.error("Elemen tbody dari #stockTable tidak ditemukan");
        return;
      }

      // Check if there's data to display
      if (!this.filteredStockData || this.filteredStockData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center">Tidak ada data yang sesuai dengan filter</td>
            </tr>
        `;

        // Initialize empty DataTable
        try {
          $("#stockTable").DataTable({
            responsive: true,
            language: {
              emptyTable: "Tidak ada data yang tersedia",
            },
          });
        } catch (error) {
          console.warn("Error initializing empty DataTable:", error);
        }
        return;
      }

      // Kelompokkan data berdasarkan kategori
      const kotakItems = this.filteredStockData.filter((item) => item.kategori === "kotak");
      const aksesorisItems = this.filteredStockData.filter((item) => item.kategori === "aksesoris");
      const otherItems = this.filteredStockData.filter(
        (item) => item.kategori !== "kotak" && item.kategori !== "aksesoris"
      );

      // Buat HTML untuk tabel tanpa header kategori
      let html = "";
      let rowIndex = 1;

      // Tambahkan semua item tanpa header kategori
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

      // Pastikan HTML tidak kosong sebelum menetapkannya ke tableBody
      if (html.trim() === "") {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center">Tidak ada data yang valid untuk ditampilkan</td>
            </tr>
        `;
      } else {
        tableBody.innerHTML = html;
      }

      // Get current date for title
      const today = new Date();
      const formattedDate = formatDate(today);

      // Add CSS for text wrapping and equal column widths
      try {
        const existingStyle = document.getElementById("stockTableStyle");
        if (existingStyle) {
          existingStyle.remove();
        }

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
          
          .continuity-note {
              margin-bottom: 15px;
              font-size: 0.9rem;
          }
        `;
        document.head.appendChild(styleElement);
      } catch (styleError) {
        console.warn("Error adding style element:", styleError);
      }

      // Inisialisasi DataTable dengan tombol export
      try {
        const dataTable = $("#stockTable").DataTable({
          responsive: true,
          dom: "Bfrtip",
          ordering: false, // Menonaktifkan fitur pengurutan/sorting
          autoWidth: false, // Disable auto width calculation
          buttons: [
            {
              extend: "excel",
              text: '<i class="fas fa-file-excel me-2"></i>Excel',
              className: "btn btn-success btn-sm me-1",
              exportOptions: {
                columns: ":visible",
              },
              title: `Laporan Aksesoris Kasir Atas\n(${formattedDate})`,
              customize: function (xlsx) {
                // Kustomisasi file Excel
                var sheet = xlsx.xl.worksheets["sheet1.xml"];
                // Adjust column widths in Excel
                $('row c[r^="C"]', sheet).attr("s", "55"); // Nama column - wider with wrap text
                // Set wrap text for all data cells
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
              title: `Laporan Aksesoris Kasir Atas\n(${formattedDate})`,
              customize: function (doc) {
                // Kustomisasi file PDF
                doc.defaultStyle.fontSize = 8;
                doc.styles.tableHeader.fontSize = 9;
                // Set column widths for PDF
                doc.content[1].table.widths = [
                  "5%",
                  "10%",
                  "35%",
                  "8.33%",
                  "8.33%",
                  "8.33%",
                  "8.33%",
                  "8.33%",
                  "8.33%",
                ];
                // Enable text wrapping
                doc.styles.tableHeader.alignment = "center";
                doc.styles.tableBodyEven.alignment = "center";
                doc.styles.tableBodyOdd.alignment = "center";
                // Center all columns except the name column
                doc.content[1].table.body.forEach(function (row, rowIndex) {
                  row.forEach(function (cell, cellIndex) {
                    if (cellIndex !== 2) {
                      // Skip the name column (index 2)
                      cell.alignment = "center";
                    }
                  });
                });
              },
            },
            {
              extend: "print",
              text: '<i class="fas fa-print me-2"></i>Print',
              className: "btn btn-primary btn-sm",
              exportOptions: {
                columns: ":visible",
              },
              title: `Laporan Aksesoris Kasir Atas\n(${formattedDate})`,
              customize: function (win) {
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
                $(win.document.body).find("table td:not(:nth-child(3))").css("text-align", "center");
                // Make sure the table uses the full width
                $(win.document.body).find("table").css("width", "100%");
              },
            },
          ],
          columnDefs: [
            { className: "text-center", targets: [0, 1, 3, 4, 5, 6, 7, 8] }, // Center align all columns except name
            { className: "text-wrap", targets: "_all" }, // Enable text wrapping for all columns
            { width: "5%", targets: 0 }, // No
            { width: "10%", targets: 1 }, // Kode
            { width: "30%", targets: 2 }, // Nama - lebih lebar
            { width: "8.33%", targets: 3 }, // Stok Awal
            { width: "8.33%", targets: 4 }, // Tambah Stok
            { width: "8.33%", targets: 5 }, // Laku
            { width: "8.33%", targets: 6 }, // Free
            { width: "8.33%", targets: 7 }, // Ganti Lock
            { width: "8.33%", targets: 8 }, // Stok Akhir
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

        // Tambahkan header kategori dan catatan kontinuitas setelah DataTable diinisialisasi
        this.addCategoryHeadersAndContinuityNote(kotakItems, aksesorisItems, otherItems);
      } catch (dtError) {
        console.error("Error initializing DataTable:", dtError);
        // Tampilkan pesan error yang lebih ramah pengguna
        this.showError("Terjadi kesalahan saat memuat tabel. Silakan coba lagi.");
      }
    } catch (error) {
      console.error("Error dalam renderStockTable:", error);
      this.showError("Terjadi kesalahan saat menampilkan data stok: " + error.message);

      // Pastikan tabel dalam keadaan bersih
      try {
        const tableBody = document.querySelector("#stockTable tbody");
        if (tableBody) {
          tableBody.innerHTML = `
            <tr>
              <td colspan="9" class="text-center">Terjadi kesalahan saat memuat data</td>
            </tr>
          `;
        }

        // Inisialisasi DataTable kosong jika terjadi error
        if (!$.fn.DataTable.isDataTable("#stockTable")) {
          $("#stockTable").DataTable({
            responsive: true,
            language: {
              emptyTable: "Tidak ada data yang tersedia",
            },
          });
        }
      } catch (innerError) {
        console.warn("Error saat mereset tabel:", innerError);
      }
    }
  },

  // Fungsi untuk menambahkan header kategori dan catatan kontinuitas
  addCategoryHeadersAndContinuityNote(kotakItems, aksesorisItems, otherItems) {
    // Tambahkan container untuk header kategori di atas tabel
    const tableContainer = document.querySelector("#stockTable_wrapper");
    if (!tableContainer) return;

    // Cek apakah container header kategori sudah ada
    let categoryHeaderContainer = document.querySelector(".category-headers");
    if (!categoryHeaderContainer) {
      categoryHeaderContainer = document.createElement("div");
      categoryHeaderContainer.className = "category-headers mb-3 mt-3";
      tableContainer.insertBefore(categoryHeaderContainer, tableContainer.querySelector(".dataTables_filter"));
    }

    // Buat HTML untuk header kategori
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

    // Tambahkan CSS untuk styling
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

    // Tambahkan event listener untuk filter berdasarkan kategori
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

  // Fungsi untuk menampilkan notifikasi sukses
  showSuccessNotification(message) {
    if (typeof Swal !== "undefined") {
      Swal.fire({
        icon: "success",
        title: "Berhasil!",
        text: message,
        confirmButtonColor: "#28a745",
        timer: 3000,
        timerProgressBar: true,
        showClass: {
          popup: "animate__animated animate__fadeInDown",
        },
        hideClass: {
          popup: "animate__animated animate__fadeOutUp",
        },
        didOpen: (toast) => {
          toast.addEventListener("mouseenter", Swal.stopTimer);
          toast.addEventListener("mouseleave", Swal.resumeTimer);
        },
      });
    } else {
      alert(message);
    }
  },

  // Helper method to create table row HTML
  createTableRow(item, index) {
    // Tambahkan kelas untuk kategori
    const categoryClass =
      item.kategori === "kotak" ? "kotak-item" : item.kategori === "aksesoris" ? "aksesoris-item" : "other-item";

    return `
        <tr class="${categoryClass}">
          <td>${index}</td>
          <td>${item.kode || "-"}</td>
          <td>${item.nama || "-"}</td>
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
      this.showError("Tidak ada data untuk diekspor");
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
      this.showError("Tidak ada data untuk diekspor");
      return;
    }

    // Gunakan tombol export dari DataTables
    $("#stockTable").DataTable().button(0).trigger(); // Trigger tombol Excel
  },

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

  // Metode untuk membersihkan cache yang sudah tidak digunakan
  cleanupCache() {
    const now = new Date().getTime();
    const cacheExpiry = 30 * 60 * 1000; // 30 menit

    // Bersihkan cache yang sudah kadaluarsa
    Object.keys(this.cache).forEach((key) => {
      if (key.startsWith("stock_") && this.cache[key].lastFetched && now - this.cache[key].lastFetched > cacheExpiry) {
        console.log(`Cleaning up expired cache for ${key}`);
        delete this.cache[key];
      }
    });

    // Batasi jumlah cache untuk mencegah penggunaan memori berlebihan
    const maxCacheEntries = 10;
    const cacheKeys = Object.keys(this.cache).filter((key) => key.startsWith("stock_"));

    if (cacheKeys.length > maxCacheEntries) {
      // Urutkan berdasarkan waktu terakhir diakses (yang paling lama dihapus)
      cacheKeys.sort((a, b) => this.cache[a].lastFetched - this.cache[b].lastFetched);

      // Hapus cache yang paling lama
      const keysToRemove = cacheKeys.slice(0, cacheKeys.length - maxCacheEntries);
      keysToRemove.forEach((key) => {
        console.log(`Removing excess cache for ${key}`);
        delete this.cache[key];
      });
    }
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

  // Save edit button handler
  document.getElementById("saveEditBtn").addEventListener("click", () => {
    laporanAksesorisHandler.saveEditedTransaction();
  });

  // Confirm delete button handler
  document.getElementById("confirmDeleteBtn").addEventListener("click", () => {
    laporanAksesorisHandler.deleteTransaction();
  });

  // Set interval to clean up cache periodically
  setInterval(() => {
    laporanAksesorisHandler.cleanupCache();
  }, 5 * 60 * 1000); // Bersihkan cache setiap 5 menit
});

// Export the handler for potential use in other modules
export default laporanAksesorisHandler;

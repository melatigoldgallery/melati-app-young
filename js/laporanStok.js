// Import Firebase modules
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  getDoc,
  Timestamp,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";
import { firestore } from "./configFirebase.js";

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

// Main handler object
const laporanStokHandler = {
  // Data properties
  stockData: [],
  filteredStockData: [],
  transactionCache: new Map(),
  lastTransactionUpdate: 0,

  // Cache properties
  cache: {},

  // Initialize the module
  init() {
    this.initDatePickers();
    this.attachEventListeners();
    this.setDefaultDates();
    this.initDataTable();
    this.prepareEmptyTable();
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
        {
          extend: "print",
          text: '<i class="fas fa-print me-2"></i>Print',
          className: "btn btn-primary btn-sm",
          exportOptions: {
            columns: ":visible",
          },
          title: "Laporan Stok",
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
  },

  // Reset filters
  resetFilters() {
    const today = new Date();
    document.getElementById("startDate").value = formatDate(today);
    this.loadAndFilterStockData();
  },

  // Load and filter stock data
  async loadAndFilterStockData() {
    try {
      this.showLoading(true);

      // Get filter values
      const startDateStr = document.getElementById("startDate").value;

      // Validate date
      if (!startDateStr) {
        this.showError("Tanggal harus diisi");
        this.showLoading(false);
        return;
      }

      const startDate = parseDate(startDateStr);

      if (!startDate) {
        this.showError("Format tanggal tidak valid");
        this.showLoading(false);
        return;
      }

      // Check cache
      const cacheKey = `stock_${startDateStr}`;
      if (this.cache[cacheKey] && this.cache[cacheKey].data) {
        console.log("Using cached stock data");
        this.filteredStockData = [...this.cache[cacheKey].data];
        this.renderStockTable();
        this.showLoading(false);
        return;
      }

      // Load stock data
      await this.loadStockData();

      // Calculate stock continuity
      await this.calculateStockContinuity(startDate);

      // Cache the result
      this.cache[cacheKey] = {
        data: [...this.filteredStockData],
        lastFetched: new Date().getTime(),
      };

      // Render table
      this.renderStockTable();

      this.showLoading(false);
    } catch (error) {
      console.error("Error loading and filtering stock data:", error);
      this.showError("Terjadi kesalahan saat memuat data: " + error.message);
      this.showLoading(false);
    }
  },

  // Load stock data
  async loadStockData() {
    try {
      // Get stock data from Firestore
      const stockRef = collection(firestore, "stokAksesoris");
      const stockSnapshot = await getDocs(stockRef);

      this.stockData = [];
      stockSnapshot.forEach((doc) => {
        const data = doc.data();
        this.stockData.push({
          id: doc.id,
          ...data,
        });
      });

      // Load all kode aksesoris
      await this.loadAllKodeAksesoris();

      return Promise.resolve();
    } catch (error) {
      console.error("Error loading stock data:", error);
      return Promise.reject(error);
    }
  },

  // Load all kode aksesoris
  async loadAllKodeAksesoris() {
    try {
      // Get kotak data
      const kotakSnapshot = await getDocs(collection(firestore, "kodeAksesoris", "kategori", "kotak"));

      // Get aksesoris data
      const aksesorisSnapshot = await getDocs(collection(firestore, "kodeAksesoris", "kategori", "aksesoris"));

      // Process kotak data
      kotakSnapshot.forEach((doc) => {
        const data = doc.data();
        const existingIndex = this.stockData.findIndex((item) => item.kode === data.text);

        if (existingIndex === -1) {
          this.stockData.push({
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
          });
        } else {
          this.stockData[existingIndex].kategori = "kotak";
        }
      });

      // Process aksesoris data
      aksesorisSnapshot.forEach((doc) => {
        const data = doc.data();
        const existingIndex = this.stockData.findIndex((item) => item.kode === data.text);

        if (existingIndex === -1) {
          this.stockData.push({
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
          });
        } else {
          this.stockData[existingIndex].kategori = "aksesoris";
        }
      });
    } catch (error) {
      console.error("Error loading kode aksesoris:", error);
      throw error;
    }
  },

  // Calculate stock continuity
 async calculateStockContinuity(selectedDate) {
  try {
    // Create day before selected date
    const previousDay = new Date(selectedDate);
    previousDay.setDate(previousDay.getDate() - 1);
    previousDay.setHours(23, 59, 59, 999);

    // Set end of selected date
    const endOfSelectedDate = new Date(selectedDate);
    endOfSelectedDate.setHours(23, 59, 59, 999);

    // Get stock transactions
    const stockTransactionsRef = collection(firestore, "stokAksesorisTransaksi");
    const transactionsQuery = query(
      stockTransactionsRef,
      where("timestamp", "<=", Timestamp.fromDate(endOfSelectedDate)),
      orderBy("timestamp", "asc")
    );

    const transactionsSnapshot = await getDocs(transactionsQuery);

    // Map to store stock data by code
    const stockByCode = {};

    // Process all transactions
    transactionsSnapshot.forEach((doc) => {
      const transaction = doc.data();
      const kode = transaction.kode;
      const timestamp = transaction.timestamp.toDate();

      if (!kode) return;

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
          nama: transaction.nama || "",
          kategori: transaction.kategori || "",
        };
      }

      // Determine if transaction is before or during the selected date
      const isPeriodBefore = timestamp <= previousDay;
      const isPeriodDuring = timestamp > previousDay && timestamp <= endOfSelectedDate;

      // Update data based on transaction type and period
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

    // Get additional stock data from stockAdditions
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

          // Categorize based on date
          if (timestamp <= previousDay) {
            stockByCode[kode].before.tambahStok += quantity;
          } else if (timestamp <= endOfSelectedDate) {
            stockByCode[kode].during.tambahStok += quantity;
          }
        });
      }
    });

    // Create stock data with correct continuity
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

      // PERBAIKAN: Ganti lock MENGURANGI stok
      // Calculate initial stock (end stock from previous period)
      const initialStock =
        stockInfo.before.stokAwal +
        stockInfo.before.tambahStok -
        stockInfo.before.laku -
        stockInfo.before.free -
        stockInfo.before.gantiLock; // Ganti lock mengurangi stok

      // Calculate final stock
      const finalStock =
        Math.max(0, initialStock) +
        stockInfo.during.tambahStok -
        stockInfo.during.laku -
        stockInfo.during.free -
        stockInfo.during.gantiLock; // Ganti lock mengurangi stok

      // Create stock object with correct continuity
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
      // Prioritize category
      if ((a.kategori || "unknown") !== (b.kategori || "unknown")) {
        return (a.kategori || "unknown") === "kotak" ? -1 : 1;
      }

      // If category is the same, sort by code
      return (a.kode || "").localeCompare(b.kode || "");
    });
  } catch (error) {
    console.error("Error calculating stock continuity:", error);
    throw error;
  }
},

  // Tambahkan method untuk menghitung transaksi ganti lock
async calculateStockMovements(kode, startDate, endDate) {
  try {
    const movements = {
      tambahStok: 0,
      laku: 0,
      free: 0,
      gantiLock: 0
    };

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

    return movements;
  } catch (error) {
    console.error("Error calculating stock movements:", error);
    return {
      tambahStok: 0,
      laku: 0,
      free: 0,
      gantiLock: 0
    };
  }
},

// Perbaiki method untuk menampilkan data dengan kolom ganti lock
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

  // Render stock table
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
            title: `Laporan Stok (${selectedDate})`,
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
            title: `Laporan Stok (${selectedDate})`,
            customize: function (doc) {
              doc.defaultStyle.fontSize = 8;
              doc.styles.tableHeader.fontSize = 9;
              doc.content[1].table.widths = ["5%", "10%", "35%", "8.33%", "8.33%", "8.33%", "8.33%", "8.33%", "8.33%"];
              doc.styles.tableHeader.alignment = "center";
              doc.styles.tableBodyEven.alignment = "center";
              doc.styles.tableBodyOdd.alignment = "center";
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
            title: `Laporan Stok (${selectedDate})`,
            customize: function (win) {
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
              $(win.document.body).find("table td:not(:nth-child(3))").css("text-align", "center");
              $(win.document.body).find("table").css("width", "100%");
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

  // Add category headers
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

  // Show loading indicator
  showLoading(isLoading) {
    const loadingIndicator = document.getElementById("loadingIndicator");
    if (loadingIndicator) {
      loadingIndicator.style.display = isLoading ? "flex" : "none";
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

  // Clean up cache
  cleanupCache() {
    const now = new Date().getTime();
    const cacheExpiry = 30 * 60 * 1000; // 30 minutes

    // Clean up expired cache
    Object.keys(this.cache).forEach((key) => {
      if (key.startsWith("stock_") && this.cache[key].lastFetched && now - this.cache[key].lastFetched > cacheExpiry) {
        console.log(`Cleaning up expired cache for ${key}`);
        delete this.cache[key];
      }
    });

    // Limit number of cache entries
    const maxCacheEntries = 10;
    const cacheKeys = Object.keys(this.cache).filter((key) => key.startsWith("stock_"));

    if (cacheKeys.length > maxCacheEntries) {
      // Sort by last fetched time (oldest first)
      cacheKeys.sort((a, b) => this.cache[a].lastFetched - this.cache[b].lastFetched);

      // Remove oldest cache entries
      const keysToRemove = cacheKeys.slice(0, cacheKeys.length - maxCacheEntries);
      keysToRemove.forEach((key) => {
        console.log(`Removing excess cache for ${key}`);
        delete this.cache[key];
      });
    }
  },
};

// Helper function to show loading indicator
function showLoading(show) {
  const loadingElement = document.getElementById("loadingIndicator");
  if (loadingElement) {
    loadingElement.style.display = show ? "flex" : "none";
  }
}

// Helper function to show alerts
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

// Initialize when document is ready
document.addEventListener("DOMContentLoaded", function () {
  // Initialize the handler
  laporanStokHandler.init();

  // Set interval to clean up cache periodically
  setInterval(() => {
    laporanStokHandler.cleanupCache();
  }, 5 * 60 * 1000); // Clean up cache every 5 minutes
});

// Export the handler for potential use in other modules
export default laporanStokHandler;


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
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";
import { firestore } from "./configFirebase.js";

// Tambahkan konstanta untuk kata sandi verifikasi
const VERIFICATION_PASSWORD = "melati3"; // Ganti dengan kata sandi yang diinginkan

// Tambahkan variabel untuk menyimpan jenis data yang akan dihapus
let deleteDataType = "";
let deleteStartDate = null;
let deleteEndDate = null;

// Tambahkan fungsi untuk menghapus data penjualan
async function deleteSalesData(startDate, endDate) {
  try {
    showLoading(true);
    console.log("Deleting sales data from", startDate, "to", endDate);

    // Query untuk mendapatkan data penjualan dalam rentang tanggal
    const salesRef = collection(firestore, "penjualanAksesoris");
    const q = query(
      salesRef,
      where("timestamp", ">=", Timestamp.fromDate(startDate)),
      where("timestamp", "<=", Timestamp.fromDate(endDate))
    );

    const querySnapshot = await getDocs(q);
    console.log("Found", querySnapshot.size, "documents to delete");

    if (querySnapshot.empty) {
      showLoading(false);
      return showAlert("Tidak ada data penjualan dalam rentang tanggal yang dipilih.", "Info", "info");
    }

    // Gunakan batch untuk menghapus data
    const batch = writeBatch(firestore);
    let deleteCount = 0;

    querySnapshot.forEach((docSnapshot) => {
      console.log("Adding document to batch delete:", docSnapshot.id);
      batch.delete(doc(firestore, "penjualanAksesoris", docSnapshot.id));
      deleteCount++;
    });

    // Commit batch
    console.log("Committing batch delete for", deleteCount, "documents");
    await batch.commit();
    console.log("Batch delete successful");

    // Refresh data
    laporanAksesorisHandler.cache.salesData.data = null;
    await laporanAksesorisHandler.loadSalesData();
    laporanAksesorisHandler.filterSalesData();

    showLoading(false);
    return showAlert(`Berhasil menghapus ${deleteCount} data penjualan.`, "Sukses", "success");
  } catch (error) {
    console.error("Error deleting sales data:", error);
    showLoading(false);
    return showAlert("Gagal menghapus data: " + error.message, "Error", "error");
  }
}

// Tambahkan fungsi untuk menampilkan modal verifikasi
function showVerificationModal(dataType, startDate, endDate) {
  // Simpan jenis data dan rentang tanggal
  deleteDataType = dataType;
  deleteStartDate = startDate;
  deleteEndDate = endDate;

  // Format tanggal untuk ditampilkan
  const startDateStr = formatDate(startDate);
  const endDateStr = formatDate(endDate);

  // Set teks konfirmasi
  const confirmationText = document.getElementById("deleteConfirmationText");
  if (dataType === "sales") {
    confirmationText.textContent = `Anda akan menghapus data penjualan dari ${startDateStr} hingga ${endDateStr}. Tindakan ini tidak dapat dibatalkan.`;
  } else {
    confirmationText.textContent = `Anda akan menghapus data transaksi stok dari ${startDateStr} hingga ${endDateStr}. Tindakan ini tidak dapat dibatalkan.`;
  }

  // Reset input password
  document.getElementById("verificationPassword").value = "";

  // Tampilkan modal
  const modal = new bootstrap.Modal(document.getElementById("verificationModal"));
  modal.show();
}

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
          font-family: Roboto;
          font-size: 13px;
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
          font-size: 13px;
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

  // Fungsi utilitas untuk menghancurkan DataTable dengan aman
safelyDestroyDataTable(tableId) {
  try {
    const tableSelector = `#${tableId}`;
    if ($.fn.DataTable.isDataTable(tableSelector)) {
      const dt = $(tableSelector).DataTable();
      if (dt && typeof dt.destroy === 'function') {
        dt.destroy();
        return true;
      }
    }
    return false;
  } catch (error) {
    console.warn(`Error safely destroying DataTable ${tableId}:`, error);
    return false;
  }
},

// Fungsi utilitas untuk memastikan struktur tabel lengkap
ensureTableStructure(tableId, columnHeaders) {
  try {
    const tableElement = document.getElementById(tableId);
    if (!tableElement) {
      console.error(`Table element #${tableId} not found`);
      return false;
    }
    
    // Pastikan thead ada
    let theadElement = tableElement.querySelector("thead");
    if (!theadElement) {
      theadElement = document.createElement("thead");
      tableElement.appendChild(theadElement);
    }
    
    // Pastikan thead memiliki tr
    let headerRow = theadElement.querySelector("tr");
    if (!headerRow) {
      headerRow = document.createElement("tr");
      theadElement.appendChild(headerRow);
    }
    
    // Isi header dengan kolom yang diberikan
    headerRow.innerHTML = columnHeaders.map(header => `<th>${header}</th>`).join('');
    
    // Pastikan tbody ada
    let tbodyElement = tableElement.querySelector("tbody");
    if (!tbodyElement) {
      tbodyElement = document.createElement("tbody");
      tableElement.appendChild(tbodyElement);
    }
    
    return true;
  } catch (error) {
    console.error(`Error ensuring table structure for #${tableId}:`, error);
    return false;
  }
},


  // Initialize the module
  init() {
    this.ensureTableStructure("penjualanTable", [
      "Tanggal", "Sales", "Jenis", "Kode Barang", "Nama Barang", 
      "Jumlah", "Berat", "Harga", "Status", "Aksi"
    ]);
    
    this.ensureTableStructure("stockTable", [
      "No", "Kode", "Nama", "Stok Awal", "Tambah Stok", 
      "Laku", "Free", "Ganti Lock", "Stok Akhir"
    ]);
    
    this.initDatePickers();
    this.attachEventListeners();
    this.setDefaultDates();
    this.initDataTables();
    this.prepareEmptyTables();

    // Tombol hapus data penjualan
    const deleteSalesDataBtn = document.getElementById("deleteSalesDataBtn");
    if (deleteSalesDataBtn) {
      deleteSalesDataBtn.addEventListener("click", () => {
        const startDateStr = document.querySelector("#sales-tab-pane #startDate").value;
        const endDateStr = document.querySelector("#sales-tab-pane #endDate").value;

        if (!startDateStr || !endDateStr) {
          return showAlert("Pilih rentang tanggal terlebih dahulu.", "Peringatan", "warning");
        }

        const startDate = parseDate(startDateStr);
        const endDate = parseDate(endDateStr);

        if (!startDate || !endDate) {
          return showAlert("Format tanggal tidak valid.", "Peringatan", "warning");
        }

        // Set waktu
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        showVerificationModal("sales", startDate, endDate);
      });
    }

    // Tombol konfirmasi hapus di modal - GUNAKAN ID BARU
    const confirmDeleteRangeBtn = document.getElementById("confirmDeleteRangeBtn");
    if (confirmDeleteRangeBtn) {
      confirmDeleteRangeBtn.addEventListener("click", async () => {
        console.log("Confirm delete range button clicked");
        const password = document.getElementById("verificationPassword").value;

        if (password !== VERIFICATION_PASSWORD) {
          return showAlert("Kata sandi verifikasi salah.", "Error", "error");
        }

        // Tutup modal
        const modal = bootstrap.Modal.getInstance(document.getElementById("verificationModal"));
        modal.hide();

        // Hapus data sesuai jenis
        if (deleteDataType === "sales") {
          await deleteSalesData(deleteStartDate, deleteEndDate);
        } else if (deleteDataType === "stock") {
          await deleteStockData(deleteStartDate, deleteEndDate);
        }
      });
    }
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
    try {
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
  
      // Pastikan struktur tabel sebelum render
      if (this.isSummaryMode) {
        this.ensureTableStructure("penjualanTable", [
          "Kode Barang", "Nama Barang", "Total Jumlah", "Total Harga"
        ]);
      } else {
        this.ensureTableStructure("penjualanTable", [
          "Tanggal", "Sales", "Jenis", "Kode Barang", "Nama Barang", 
          "Jumlah", "Berat", "Harga", "Status", "Aksi"
        ]);
      }
      
      // Hancurkan DataTable dengan aman sebelum render
      this.safelyDestroyDataTable("penjualanTable");
  
      // Re-render the table
      this.renderSalesTable();
    } catch (error) {
      console.error("Error toggling summary view:", error);
      this.showError("Terjadi kesalahan saat mengubah tampilan: " + error.message);
    }
  },

  // Add this method to generate summary data
  generateSummaryData() {
    if (!this.filteredSalesData.length) return;

    this.showLoading(true);

    try {
      // Create a map to store summary data
      const summaryMap = new Map();

      // Process each transaction
      this.filteredSalesData.forEach((transaction) => {
        // Skip transactions without items
        if (!transaction.items || !transaction.items.length) return;

        // Process each item in the transaction
        transaction.items.forEach((item) => {
          const key = item.kodeText ? item.kodeText : "unknown";
          const name = item.nama ? item.nama : "Tidak diketahui";
          const quantity = parseInt(item.jumlah) || 1;

          // PERBAIKAN: Hitung total harga berdasarkan metode pembayaran
          let itemTotalPrice = parseInt(item.totalHarga) || 0;

          // Jika transaksi menggunakan DP, hitung proporsi sisa pembayaran untuk item ini
          if (transaction.metodeBayar === "dp" && transaction.statusPembayaran === "DP") {
            // Hitung proporsi harga item terhadap total transaksi
            const proportion = itemTotalPrice / transaction.totalHarga;
            // Hitung bagian sisa pembayaran untuk item ini
            itemTotalPrice = Math.round(proportion * transaction.sisaPembayaran);
          } else if (transaction.metodeBayar === "free") {
            // Untuk transaksi free, set harga item menjadi 0
            itemTotalPrice = 0;
          }

          // If item already exists in map, update it
          if (summaryMap.has(key)) {
            const existingItem = summaryMap.get(key);
            existingItem.jumlah += quantity;
            existingItem.totalHarga += itemTotalPrice;
          } else {
            // Otherwise, add new item to map
            summaryMap.set(key, {
              kode: key,
              nama: name,
              jumlah: quantity,
              totalHarga: itemTotalPrice,
            });
          }
        });
      });

      // Convert map to array
      this.summaryData = Array.from(summaryMap.values());

      // Sort by total price (highest first)
      this.summaryData.sort((a, b) => b.totalHarga - a.totalHarga);

      // Update UI
      this.isSummaryMode = true;
      this.renderSalesTable();

      this.showLoading(false);
    } catch (error) {
      console.error("Error generating summary data:", error);
      this.showError("Terjadi kesalahan saat membuat ringkasan: " + error.message);
      this.showLoading(false);
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

  filterSalesData() {
    if (!this.salesData || !this.salesData.length) return;
  
    this.showLoading(true);
  
    try {
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
        if (!item) return false; // Skip undefined/null items
        
        // Parse transaction date
        const transactionDate = item.timestamp ? item.timestamp.toDate() : parseDate(item.tanggal);
        if (!transactionDate) return false;
  
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
        if (!a || !b) return 0;
        const dateA = a.timestamp ? a.timestamp.toDate() : parseDate(a.tanggal);
        const dateB = b.timestamp ? b.timestamp.toDate() : parseDate(b.tanggal);
        if (!dateA || !dateB) return 0;
        return dateB - dateA;
      });
  
      // Pastikan struktur tabel sebelum render
      if (this.isSummaryMode) {
        this.ensureTableStructure("penjualanTable", [
          "Kode Barang", "Nama Barang", "Total Jumlah", "Total Harga"
        ]);
      } else {
        this.ensureTableStructure("penjualanTable", [
          "Tanggal", "Sales", "Jenis", "Kode Barang", "Nama Barang", 
          "Jumlah", "Berat", "Harga", "Status", "Aksi"
        ]);
      }
      
      // Hancurkan DataTable dengan aman sebelum render
      this.safelyDestroyDataTable("penjualanTable");
      
      // Render the table
      this.renderSalesTable();
    } catch (error) {
      console.error("Error filtering sales data:", error);
      this.showError("Terjadi kesalahan saat memfilter data: " + error.message);
    } finally {
      this.showLoading(false);
    }
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

    // PERBAIKAN UTAMA: Pendekatan yang lebih defensif untuk menghancurkan DataTable
    try {
      // Cek apakah DataTable sudah diinisialisasi
      if ($.fn.DataTable.isDataTable("#penjualanTable")) {
        // Simpan referensi ke instance DataTable
        const dt = $("#penjualanTable").DataTable();
        
        // Coba hancurkan dengan aman
        if (dt && typeof dt.destroy === 'function') {
          dt.destroy();
        }
      }
    } catch (dtError) {
      console.warn("Error saat menghancurkan DataTable:", dtError);
      // Lanjutkan eksekusi meskipun ada error
    }

    // Persiapkan header tabel sesuai mode tampilan
    const tableHeader = document.querySelector("#penjualanTable thead tr");
    if (!tableHeader) {
      console.error("Header tabel tidak ditemukan");
      // Buat header jika tidak ada
      const thead = document.createElement("thead");
      thead.innerHTML = `<tr>
        ${this.isSummaryMode ? `
          <th>Kode Barang</th>
          <th>Nama Barang</th>
          <th>Total Jumlah</th>
          <th>Total Harga</th>
        ` : `
          <th>Tanggal</th>
          <th>Sales</th>
          <th>Jenis</th>
          <th>Kode Barang</th>
          <th>Nama Barang</th>
          <th>Jumlah</th>
          <th>Berat</th>
          <th>Harga</th>
          <th>Status</th>
          <th>Aksi</th>
        `}
      </tr>`;
      tableElement.appendChild(thead);
    } else {
      // Update header yang sudah ada
      tableHeader.innerHTML = this.isSummaryMode ? `
        <th>Kode Barang</th>
        <th>Nama Barang</th>
        <th>Total Jumlah</th>
        <th>Total Harga</th>
      ` : `
        <th>Tanggal</th>
        <th>Sales</th>
        <th>Jenis</th>
        <th>Kode Barang</th>
        <th>Nama Barang</th>
        <th>Jumlah</th>
        <th>Berat</th>
        <th>Harga</th>
        <th>Status</th>
        <th>Aksi</th>
      `;
    }

    // Pastikan tbody ada
    let tableBody = document.querySelector("#penjualanTable tbody");
    if (!tableBody) {
      tableBody = document.createElement("tbody");
      tableElement.appendChild(tableBody);
    } else {
      // Kosongkan tbody yang sudah ada
      tableBody.innerHTML = "";
    }

    // Check if there's data to display
    const hasData = this.isSummaryMode 
      ? this.summaryData && this.summaryData.length > 0
      : this.filteredSalesData && this.filteredSalesData.length > 0;

    if (!hasData) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="${this.isSummaryMode ? 4 : 10}" class="text-center">Tidak ada data yang sesuai dengan filter</td>
        </tr>
      `;
      
      // Inisialisasi DataTable dengan data kosong
      try {
        $("#penjualanTable").DataTable({
          language: {
            url: "//cdn.datatables.net/plug-ins/1.10.25/i18n/Indonesian.json",
          },
          dom: "Bfrtip",
          buttons: ["excel", "pdf", "print"],
        });
      } catch (initError) {
        console.warn("Error inisialisasi DataTable kosong:", initError);
      }
      
      return;
    }

    // Prepare data for table
    let totalRevenue = 0;
    let totalTransactions = 0;
    let tableHTML = '';

    if (this.isSummaryMode && this.summaryData) {
      // Calculate total revenue
      totalRevenue = this.calculateTotalRevenue(this.summaryData);

      // Render summary rows
      this.summaryData.forEach((item) => {
        tableHTML += `
          <tr>
            <td>${item.kode || '-'}</td>
            <td>${item.nama || '-'}</td>
            <td class="text-center">${item.jumlah || 0}</td>
            <td>Rp ${(item.totalHarga || 0).toLocaleString("id-ID")}</td>
          </tr>
        `;
      });

      // Set total transactions to number of unique items
      totalTransactions = this.summaryData.length;
    } else if (this.filteredSalesData) {
      // Process each transaction
      this.filteredSalesData.forEach((transaction) => {
        if (!transaction) return; // Skip undefined/null items
        
        const date = transaction.timestamp 
          ? formatDate(transaction.timestamp.toDate()) 
          : (transaction.tanggal || "-");
        const sales = transaction.sales || "Admin";
        let jenisPenjualan = transaction.jenisPenjualan || "Tidak diketahui";

        // Hitung total pendapatan berdasarkan metode pembayaran
        if (transaction.metodeBayar === "dp" && transaction.statusPembayaran === "DP") {
          totalRevenue += transaction.sisaPembayaran || 0;
        } else if (transaction.metodeBayar === "free") {
          totalRevenue += 0;
        } else {
          totalRevenue += transaction.totalHarga || 0;
        }

        totalTransactions++;

        // Process each item in the transaction
        if (transaction.items && transaction.items.length > 0) {
          transaction.items.forEach((item) => {
            if (!item) return; // Skip undefined/null items
            
            // Untuk jenis gantiLock, tambahkan kode lock ke tampilan jenis penjualan
            let displayJenisPenjualan = jenisPenjualan;
            if (jenisPenjualan === "gantiLock" && item.kodeLock) {
              displayJenisPenjualan = `gantiLock ${item.kodeLock}`;
            }

            // Tambahkan kolom status pembayaran
            let statusPembayaran = transaction.statusPembayaran || "Lunas";
            let statusBadge = "";

            if (statusPembayaran === "DP") {
              statusBadge = `<span class="badge bg-warning">DP: Rp ${formatRupiah(transaction.nominalDP)}</span>
                            <br><small>Sisa: Rp ${formatRupiah(transaction.sisaPembayaran)}</small>`;
            } else if (statusPembayaran === "Lunas") {
              statusBadge = `<span class="badge bg-success">Lunas</span>`;
            } else if (transaction.metodeBayar === "free") {
              statusBadge = `<span class="badge bg-info">Gratis</span>`;
            } else {
              statusBadge = `<span class="badge bg-secondary">${statusPembayaran}</span>`;
            }

            tableHTML += `
              <tr>
                <td>${date}</td>
                <td>${sales}</td>
                <td>${displayJenisPenjualan}</td>
                <td>${item.kodeText || "-"}</td>
                <td>${item.nama || "-"}</td>
                <td>${item.jumlah || 1}</td>
                <td>${item.berat ? item.berat + " gr" : "-"}</td>
                <td>Rp ${parseInt(item.totalHarga || 0).toLocaleString("id-ID")}</td>
                <td>${statusBadge}</td>
                <td>
                  <div class="btn-group">
                    <button class="btn btn-sm btn-warning btn-reprint" data-id="${transaction.id}">
                      <i class="fas fa-print"></i>
                    </button>
                    <button class="btn btn-sm btn-primary btn-edit" data-id="${transaction.id}">
                      <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger btn-delete" data-id="${transaction.id}">
                      <i class="fas fa-trash-alt"></i>
                    </button>
                  </div>
                </td>
              </tr>
            `;
          });
        } else {
          // Fallback if no items
          let statusPembayaran = transaction.statusPembayaran || "Lunas";
          let statusBadge = "";
          if (statusPembayaran === "DP") {
            statusBadge = `<span class="badge bg-warning">DP: Rp ${formatRupiah(transaction.nominalDP)}</span>
                          <br><small>Sisa: Rp ${formatRupiah(transaction.sisaPembayaran)}</small>`;
          } else if (statusPembayaran === "Lunas") {
            statusBadge = `<span class="badge bg-success">Lunas</span>`;
          } else if (transaction.metodeBayar === "free") {
            statusBadge = `<span class="badge bg-info">Gratis</span>`;
          } else {
            statusBadge = `<span class="badge bg-secondary">${statusPembayaran}</span>`;
          }

          tableHTML += `
            <tr>
              <td>${date}</td>
              <td>${sales}</td>
              <td>${jenisPenjualan}</td>
              <td colspan="4" class="text-center">Tidak ada detail item</td>
              <td>Rp ${parseInt(transaction.totalHarga || 0).toLocaleString("id-ID")}</td>
              <td>${statusBadge}</td>
              <td>
                <div class="btn-group">
                  <button class="btn btn-sm btn-info btn-detail" data-id="${transaction.id}">
                    <i class="fas fa-eye"></i>
                  </button>
                  <button class="btn btn-sm btn-warning btn-reprint" data-id="${transaction.id}">
                    <i class="fas fa-print"></i>
                  </button>
                  <button class="btn btn-sm btn-primary btn-edit" data-id="${transaction.id}">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button class="btn btn-sm btn-danger btn-delete" data-id="${transaction.id}">
                    <i class="fas fa-trash-alt"></i>
                  </button>
                </div>
              </td>
            </tr>
          `;
        }
      });
    }

    // Isi tabel dengan HTML yang sudah dibuat
    tableBody.innerHTML = tableHTML;

    // Update summary
    const totalTransactionsElement = document.getElementById("totalTransactions");
    if (totalTransactionsElement) {
      totalTransactionsElement.textContent = this.isSummaryMode
        ? `Total Jenis Barang: ${totalTransactions}`
        : `Total Transaksi: ${totalTransactions}`;
    }
    
    const totalRevenueElement = document.getElementById("totalRevenue");
    if (totalRevenueElement) {
      totalRevenueElement.textContent = `Total Pendapatan: Rp ${parseInt(
        totalRevenue
      ).toLocaleString("id-ID")}`;
    }

    // PERBAIKAN UTAMA: Inisialisasi DataTable dengan cara yang benar
    try {
      const dataTableOptions = {
        language: {
          url: "//cdn.datatables.net/plug-ins/1.10.25/i18n/Indonesian.json",
        },
        dom: "Bfrtip",
        buttons: ["excel", "pdf", "print"],
        order: this.isSummaryMode ? [[3, "desc"]] : [[0, "desc"]], // Sort by total price in summary mode, date in detail mode
        drawCallback: () => {
          // Pasang event listener setelah DataTable selesai menggambar
          try {
            this.attachEventListenersToButtons();
          } catch (eventError) {
            console.warn("Error attaching event listeners:", eventError);
          }
        },
      };

      // Inisialisasi DataTable
      $("#penjualanTable").DataTable(dataTableOptions);
    } catch (dtInitError) {
      console.error("Error initializing DataTable:", dtInitError);
      // Fallback: tampilkan tabel tanpa DataTable
    }
    
  } catch (error) {
    console.error("Error rendering sales table:", error);
    this.showError("Terjadi kesalahan saat menampilkan data: " + error.message);
    
    // Tampilkan pesan error di tabel
    try {
      // Pastikan tabel dalam keadaan bersih
      try {
        if ($.fn.DataTable.isDataTable("#penjualanTable")) {
          $("#penjualanTable").DataTable().destroy();
        }
      } catch (dtError) {
        console.warn("Error destroying DataTable in error handler:", dtError);
      }
      
      const tableElement = document.getElementById("penjualanTable");
      if (tableElement) {
        // Pastikan struktur tabel lengkap
        if (!tableElement.querySelector("thead")) {
          const thead = document.createElement("thead");
          thead.innerHTML = `<tr>
            <th>Tanggal</th>
            <th>Sales</th>
            <th>Jenis</th>
            <th>Kode Barang</th>
            <th>Nama Barang</th>
            <th>Jumlah</th>
            <th>Berat</th>
            <th>Harga</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>`;
          tableElement.appendChild(thead);
        }
        
        let tableBody = tableElement.querySelector("tbody");
        if (!tableBody) {
          tableBody = document.createElement("tbody");
          tableElement.appendChild(tableBody);
        }
        
        tableBody.innerHTML = `
          <tr>
                      <td colspan="10" class="text-center">Terjadi kesalahan saat memuat data: ${error.message}</td>
          </tr>
        `;
      }
      
      // Inisialisasi DataTable kosong dengan penanganan error
      try {
        $("#penjualanTable").DataTable({
          language: {
            emptyTable: "Tidak ada data yang tersedia",
          },
          dom: "Bfrtip",
          buttons: ["excel", "pdf", "print"],
        });
      } catch (initError) {
        console.warn("Error initializing DataTable in error handler:", initError);
        // Jika gagal inisialisasi DataTable, biarkan tabel HTML biasa
      }
    } catch (innerError) {
      console.warn("Error saat menampilkan pesan error:", innerError);
    }
  }
},

  // Tambahkan fungsi untuk memasang event listener ke tombol-tombol
  attachEventListenersToButtons() {
    console.log("Attaching event listeners to buttons");

    // Detail button handler
    document.querySelectorAll(".btn-detail").forEach((btn) => {
      // Hapus event listener yang mungkin sudah ada untuk mencegah duplikasi
      btn.removeEventListener("click", this.handleDetailClick);
      btn.addEventListener("click", this.handleDetailClick);
    });

    // Reprint button handler
    document.querySelectorAll(".btn-reprint").forEach((btn) => {
      // Hapus event listener yang mungkin sudah ada untuk mencegah duplikasi
      btn.removeEventListener("click", this.handleReprintClick);
      btn.addEventListener("click", this.handleReprintClick);
    });

    // Edit button handler
    document.querySelectorAll(".btn-edit").forEach((btn) => {
      // Hapus event listener yang mungkin sudah ada untuk mencegah duplikasi
      btn.removeEventListener("click", this.handleEditClick);
      btn.addEventListener("click", this.handleEditClick);
    });

    // Delete button handler
    document.querySelectorAll(".btn-delete").forEach((btn) => {
      // Hapus event listener yang mungkin sudah ada untuk mencegah duplikasi
      btn.removeEventListener("click", this.handleDeleteClick);
      btn.addEventListener("click", this.handleDeleteClick);
    });
  },

  // Handler untuk tombol detail
  handleDetailClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const transactionId = this.getAttribute("data-id");
    console.log("Detail button clicked for transaction:", transactionId);
    laporanAksesorisHandler.showTransactionDetails(transactionId);
  },

  // Handler untuk tombol reprint
  handleReprintClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const transactionId = this.getAttribute("data-id");
    console.log("Reprint button clicked for transaction:", transactionId);
    laporanAksesorisHandler.reprintTransaction(transactionId);
  },

  // Handler untuk tombol edit
  handleEditClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const transactionId = this.getAttribute("data-id");
    console.log("Edit button clicked for transaction:", transactionId);
    laporanAksesorisHandler.editTransaction(transactionId);
  },

  // Handler untuk tombol delete
  handleDeleteClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const transactionId = this.getAttribute("data-id");
    console.log("Delete button clicked for transaction:", transactionId);
    laporanAksesorisHandler.confirmDeleteTransaction(transactionId);
  },

  // Tambahkan fungsi baru untuk menghitung total pendapatan dengan benar
  calculateTotalRevenue(data) {
    let total = 0;

    if (!data || !Array.isArray(data)) {
      // Jika data adalah array transaksi (mode detail)
      if (this.filteredSalesData && Array.isArray(this.filteredSalesData)) {
        this.filteredSalesData.forEach((transaction) => {
          // PERBAIKAN: Untuk transaksi DP, tambahkan sisa pembayaran (bukan DP)
          if (transaction.metodeBayar === "dp" && transaction.statusPembayaran === "DP") {
            // Untuk transaksi DP, tambahkan sisa pembayaran ke total pendapatan
            total += transaction.sisaPembayaran || 0;
          } else if (transaction.metodeBayar === "free") {
            // Untuk transaksi free, tidak menambahkan apa-apa
            total += 0;
          } else {
            // Untuk transaksi lain (tunai), tambahkan total harga
            total += transaction.totalHarga || 0;
          }
        });
      }
      return total;
    }

    // Jika data adalah array ringkasan (mode summary)
    data.forEach((item) => {
      total += item.totalHarga || 0;
    });

    return total;
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
            font-family: roboto;
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
    if (!transaction) {
      this.showError("Tidak ada data transaksi untuk dicetak!");
      return;
    }

    console.log("Printing invoice with data:", transaction);

    // PERBAIKAN: Tutup jendela print yang mungkin sudah ada
    if (this.printWindow && !this.printWindow.closed) {
      this.printWindow.close();
    }

    // Buat jendela baru untuk print
    this.printWindow = window.open("", "_blank");

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
          margin-right:3cm;
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
          margin-top: 0.5cm;
          padding-top: 2mm;
          margin-left: 1cm;
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
          <p>${transaction.tanggal}</p>
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

      // PERBAIKAN: Simpan keterangan jika ada
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

    // PERBAIKAN: Tambahkan keterangan jika ada dan jenis penjualan adalah manual
    if (hasKeterangan && transaction.salesType === "manual") {
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
    this.printWindow.document.write(invoiceHTML);
    this.printWindow.document.close();
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

  // Perbaikan fungsi reprintTransaction
  reprintTransaction(transactionId) {
    try {
      // Find transaction by ID
      const transaction = this.salesData.find((item) => item.id === transactionId);
      if (!transaction) {
        return this.showError("Transaksi tidak ditemukan");
      }

      // Prepare data for printing
      const printData = {
        id: transactionId,
        salesType: transaction.jenisPenjualan,
        tanggal: transaction.timestamp ? formatDate(transaction.timestamp.toDate()) : transaction.tanggal,
        sales: transaction.sales || "Admin",
        totalHarga: parseInt(transaction.totalHarga || 0).toLocaleString("id-ID"),
        items: transaction.items || [],
        metodeBayar: transaction.metodeBayar || "tunai",
      };

      // Add DP information if payment method is DP
      if (transaction.metodeBayar === "dp" && transaction.statusPembayaran === "DP") {
        printData.nominalDP = parseInt(transaction.nominalDP || 0).toLocaleString("id-ID");
        printData.sisaPembayaran = parseInt(transaction.sisaPembayaran || 0).toLocaleString("id-ID");
      }

      // Show print options modal
      Swal.fire({
        title: "Cetak Ulang",
        html: `
        <p>Pilih jenis nota yang akan dicetak:</p>
        <div class="d-grid gap-2">
          <button type="button" class="btn btn-primary" id="btnPrintReceipt">
            <i class="fas fa-receipt me-2"></i>
            Struk Kasir
          </button>
          <button type="button" class="btn btn-success" id="btnPrintInvoice">
            <i class="fas fa-file-invoice me-2"></i>
            Invoice Customer
          </button>
        </div>
      `,
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: "Tutup",
        width: "400px",
        didOpen: () => {
          // Add event listeners to print buttons
          document.getElementById("btnPrintReceipt").addEventListener("click", () => {
            this.printReceipt(printData);
            Swal.close();
          });
          document.getElementById("btnPrintInvoice").addEventListener("click", () => {
            this.printInvoice(printData);
            Swal.close();
          });
        },
      });
    } catch (error) {
      console.error("Error reprinting transaction:", error);
      this.showError("Terjadi kesalahan saat mencetak ulang: " + error.message);
    }
  },

  // Show edit form
// Perbaikan fungsi editTransaction
editTransaction(transactionId) {
  try {
    // Find transaction by ID
    const transaction = this.salesData.find((item) => item.id === transactionId);
    if (!transaction) {
      return this.showError("Transaksi tidak ditemukan");
    }

    // Tampilkan form edit sesuai jenis penjualan
    let formHtml = '';
    
    // Form untuk semua jenis penjualan
    formHtml += `
      <div class="mb-3">
        <label for="editSales" class="form-label">Sales:</label>
        <input type="text" class="form-control" id="editSales" value="${transaction.sales || ''}">
      </div>
    `;
    
    // Form khusus untuk transaksi DP
    if (transaction.metodeBayar === "dp") {
      formHtml += `
        <div class="mb-3">
          <label for="editNominalDP" class="form-label">Nominal DP:</label>
          <input type="text" class="form-control" id="editNominalDP" value="${parseInt(transaction.nominalDP || 0).toLocaleString("id-ID")}">
        </div>
        <div class="mb-3">
          <label for="editSisaPembayaran" class="form-label">Sisa Pembayaran:</label>
          <input type="text" class="form-control" id="editSisaPembayaran" value="${parseInt(transaction.sisaPembayaran || 0).toLocaleString("id-ID")}" readonly>
        </div>
        <div class="mb-3">
          <label for="editStatusPembayaran" class="form-label">Status Pembayaran:</label>
          <select class="form-select" id="editStatusPembayaran">
            <option value="DP" ${transaction.statusPembayaran === "DP" ? "selected" : ""}>DP</option>
            <option value="Lunas" ${transaction.statusPembayaran === "Lunas" ? "selected" : ""}>Lunas</option>
          </select>
        </div>
      `;
    } else {
      // Form untuk transaksi non-DP
      formHtml += `
        <div class="mb-3">
          <label for="editTotalHarga" class="form-label">Total Harga:</label>
          <input type="text" class="form-control" id="editTotalHarga" value="${parseInt(transaction.totalHarga || 0).toLocaleString("id-ID")}">
        </div>
        <div class="mb-3">
          <label for="editMetodeBayar" class="form-label">Metode Pembayaran:</label>
          <select class="form-select" id="editMetodeBayar">
            <option value="tunai" ${transaction.metodeBayar === "tunai" ? "selected" : ""}>Tunai</option>
            <option value="dp" ${transaction.metodeBayar === "dp" ? "selected" : ""}>DP</option>
            <option value="free" ${transaction.metodeBayar === "free" ? "selected" : ""}>Free</option>
          </select>
        </div>
      `;
    }

    // Simpan referensi ke this untuk digunakan dalam callback
    const self = this;

    Swal.fire({
      title: "Edit Transaksi",
      html: formHtml,
      showCancelButton: true,
      confirmButtonText: "Simpan",
      cancelButtonText: "Batal",
      didOpen: () => {
        // Event listener untuk transaksi DP
        if (transaction.metodeBayar === "dp") {
          const editNominalDPInput = document.getElementById("editNominalDP");
          const editSisaPembayaranInput = document.getElementById("editSisaPembayaran");
          
          editNominalDPInput.addEventListener("input", () => {
            const dpValue = parseFloat(editNominalDPInput.value.replace(/\./g, "").replace(",", ".")) || 0;
            const totalHarga = parseFloat(transaction.totalHarga) || 0;
            const sisaPembayaran = Math.max(0, totalHarga - dpValue);
            
            editSisaPembayaranInput.value = sisaPembayaran.toLocaleString("id-ID");
          });
          
          // Format DP input with thousand separator
          editNominalDPInput.addEventListener("blur", () => {
            const value = editNominalDPInput.value.replace(/\./g, "");
            editNominalDPInput.value = parseInt(value || 0).toLocaleString("id-ID");
          });
        } else {
          // Event listener untuk transaksi non-DP
          const editTotalHargaInput = document.getElementById("editTotalHarga");
          const editMetodeBayarSelect = document.getElementById("editMetodeBayar");
          
          // Format total harga input with thousand separator
          editTotalHargaInput.addEventListener("blur", () => {
            const value = editTotalHargaInput.value.replace(/\./g, "");
            editTotalHargaInput.value = parseInt(value || 0).toLocaleString("id-ID");
          });
          
          // Jika metode bayar diubah menjadi DP, tampilkan form DP
          editMetodeBayarSelect.addEventListener("change", () => {
            if (editMetodeBayarSelect.value === "dp") {
              Swal.close();
              
              // Panggil fungsi edit dengan metode DP
              const updatedTransaction = {...transaction, metodeBayar: "dp"};
              self.editTransaction(transactionId);
            }
          });
        }
      }
    }).then(async (result) => {
      if (result.isConfirmed) {
        // Persiapkan data yang akan diupdate
        const updateData = {};
        
        // Update sales untuk semua jenis transaksi
        updateData.sales = document.getElementById("editSales").value.trim();
        
        // Update data khusus untuk transaksi DP
        if (transaction.metodeBayar === "dp") {
          const nominalDP = parseFloat(document.getElementById("editNominalDP").value.replace(/\./g, "").replace(",", ".")) || 0;
          const sisaPembayaran = parseFloat(document.getElementById("editSisaPembayaran").value.replace(/\./g, "").replace(",", ".")) || 0;
          const statusPembayaran = document.getElementById("editStatusPembayaran").value;
          
          // Validasi input
          if (nominalDP <= 0) {
            return self.showError("Nominal DP harus lebih dari 0");
          }
          
          if (nominalDP >= transaction.totalHarga && statusPembayaran === "DP") {
            return self.showError("Nominal DP tidak boleh sama dengan atau melebihi total harga untuk status DP");
          }
          
          updateData.nominalDP = nominalDP;
          updateData.sisaPembayaran = sisaPembayaran;
          updateData.statusPembayaran = statusPembayaran;
        } else {
          // Update data untuk transaksi non-DP
          const totalHarga = parseFloat(document.getElementById("editTotalHarga").value.replace(/\./g, "").replace(",", ".")) || 0;
          const metodeBayar = document.getElementById("editMetodeBayar").value;
          
          // Validasi input
          if (totalHarga < 0) {
            return self.showError("Total harga tidak boleh negatif");
          }
          
          updateData.totalHarga = totalHarga;
          updateData.metodeBayar = metodeBayar;
          
          // Update status pembayaran berdasarkan metode bayar
          if (metodeBayar === "free") {
            updateData.statusPembayaran = "Free";
          } else {
            updateData.statusPembayaran = "Lunas";
          }
        }
        
        // Tambahkan timestamp update
        updateData.lastUpdated = serverTimestamp();
        
        try {
          self.showLoading(true);
          
          // Update transaction in Firestore
          await updateDoc(doc(firestore, "penjualanAksesoris", transactionId), updateData);
          
          // PERBAIKAN: Update data lokal dengan benar
          // Buat salinan data transaksi yang diperbarui
          const updatedTransaction = {...transaction, ...updateData};
          
          // Hapus properti serverTimestamp karena tidak bisa dirender langsung
          delete updatedTransaction.lastUpdated;
          
          // Update array salesData
          const salesIndex = self.salesData.findIndex(item => item.id === transactionId);
          if (salesIndex !== -1) {
            self.salesData[salesIndex] = updatedTransaction;
          }
          
          // Update array filteredSalesData
          const filteredIndex = self.filteredSalesData.findIndex(item => item.id === transactionId);
          if (filteredIndex !== -1) {
            self.filteredSalesData[filteredIndex] = updatedTransaction;
          }
          
          // Re-render tabel
          self.renderSalesTable();
          
          self.showLoading(false);
          self.showSuccess("Transaksi berhasil diperbarui");
        } catch (error) {
          self.showLoading(false);
          console.error("Error updating transaction:", error);
          self.showError("Terjadi kesalahan saat memperbarui transaksi: " + error.message);
        }
      }
    });
  } catch (error) {
    console.error("Error editing transaction:", error);
    this.showError("Terjadi kesalahan saat mengedit transaksi: " + error.message);
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
  confirmDeleteTransaction(transactionId) {
    try {
      // Find transaction by ID
      const transaction = this.salesData.find((item) => item.id === transactionId);
      if (!transaction) {
        return this.showError("Transaksi tidak ditemukan");
      }
  
      // Format date
      const date = transaction.timestamp ? formatDate(transaction.timestamp.toDate()) : transaction.tanggal;
  
      // Show confirmation dialog
      Swal.fire({
        title: "Konfirmasi Hapus",
        html: `
          <p>Apakah Anda yakin ingin menghapus transaksi ini?</p>
          <div class="alert alert-warning">
            <i class="fas fa-exclamation-triangle me-2"></i>
            <strong>Peringatan!</strong> Tindakan ini akan menghapus data secara permanen dan tidak dapat dikembalikan.
          </div>
          <div class="text-start">
            <p><strong>Tanggal:</strong> ${date}</p>
            <p><strong>Sales:</strong> ${transaction.sales || "Admin"}</p>
            <p><strong>Jenis Penjualan:</strong> ${transaction.jenisPenjualan || "Tidak diketahui"}</p>
            <p><strong>Total Harga:</strong> Rp ${parseInt(transaction.totalHarga || 0).toLocaleString("id-ID")}</p>
          </div>
        `,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Ya, Hapus",
        cancelButtonText: "Batal",
        confirmButtonColor: "#dc3545",
      }).then((result) => {
        if (result.isConfirmed) {
          this.deleteTransaction(transactionId);
        }
      });
    } catch (error) {
      console.error("Error confirming delete transaction:", error);
      this.showError("Terjadi kesalahan saat menghapus transaksi: " + error.message);
    }
  },
  
  // Fungsi untuk menghapus transaksi
  async deleteTransaction(transactionId) {
    try {
      this.showLoading(true);
      
      // Delete transaction from Firestore
      await deleteDoc(doc(firestore, "penjualanAksesoris", transactionId));
      
      // Hapus data dari array lokal tanpa reload
      this.salesData = this.salesData.filter(item => item.id !== transactionId);
      this.filteredSalesData = this.filteredSalesData.filter(item => item.id !== transactionId);
      
      // Re-render tabel tanpa reload data
      this.renderSalesTable();
      
      this.showLoading(false);
      this.showSuccess("Transaksi berhasil dihapus");
    } catch (error) {
      this.showLoading(false);
      console.error("Error deleting transaction:", error);
      this.showError("Terjadi kesalahan saat menghapus transaksi: " + error.message);
    }
  },
  
  // Fungsi untuk menampilkan pesan sukses
  showSuccess(message) {
    Swal.fire({
      title: "Berhasil!",
      text: message,
      icon: "success",
      confirmButtonText: "OK",
    });
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
  document.getElementById("confirmDeleteRangeBtn").addEventListener("click", () => {
    laporanAksesorisHandler.deleteTransaction();
  });

  // Set interval to clean up cache periodically
  setInterval(() => {
    laporanAksesorisHandler.cleanupCache();
  }, 5 * 60 * 1000); // Bersihkan cache setiap 5 menit
});

// Export the handler for potential use in other modules
export default laporanAksesorisHandler;

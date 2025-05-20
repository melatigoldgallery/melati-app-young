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
  
  // Tambahkan fungsi untuk menghapus data stok
  async function deleteStockData(startDate, endDate) {
    try {
      showLoading(true);
      console.log("Deleting stock data from", startDate, "to", endDate);
  
      // Query untuk mendapatkan data transaksi stok dalam rentang tanggal
      const stockTransactionsRef = collection(firestore, "stokAksesorisTransaksi");
      const q = query(
        stockTransactionsRef,
        where("timestamp", ">=", Timestamp.fromDate(startDate)),
        where("timestamp", "<=", Timestamp.fromDate(endDate))
      );
  
      const querySnapshot = await getDocs(q);
      console.log("Found", querySnapshot.size, "documents to delete");
  
      if (querySnapshot.empty) {
        showLoading(false);
        return showAlert("Tidak ada data transaksi stok dalam rentang tanggal yang dipilih.", "Info", "info");
      }
  
      // Gunakan batch untuk menghapus data
      const batch = writeBatch(firestore);
      let deleteCount = 0;
  
      querySnapshot.forEach((docSnapshot) => {
        console.log("Adding document to batch delete:", docSnapshot.id);
        batch.delete(doc(firestore, "stokAksesorisTransaksi", docSnapshot.id));
        deleteCount++;
      });
  
      // Commit batch
      console.log("Committing batch delete for", deleteCount, "documents");
      await batch.commit();
      console.log("Batch delete successful");
  
      // Refresh data
      laporanAksesorisHandler.cache.stockData.data = null;
      await laporanAksesorisHandler.loadStockData();
      laporanAksesorisHandler.filterStockData();
  
      showLoading(false);
      return showAlert(`Berhasil menghapus ${deleteCount} data transaksi stok.`, "Sukses", "success");
    } catch (error) {
      console.error("Error deleting stock data:", error);
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
  
      // Tombol hapus data stok
      const deleteStockDataBtn = document.getElementById("deleteStockDataBtn");
      if (deleteStockDataBtn) {
        deleteStockDataBtn.addEventListener("click", () => {
          const startDateStr = document.querySelector("#stock-tab-pane #startDate").value;
          const endDateStr = document.querySelector("#stock-tab-pane #endDate").value;
  
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
  
          showVerificationModal("stock", startDate, endDate);
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
  
        // Always fetch the latest stock data from Firestore
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
              kategori: "kotak", // Add category information
              stokAwal: 0,
              tambahStok: 0,
              laku: 0,
              free: 0,
              gantiLock: 0,
              stokAkhir: 0,
              lastUpdate: new Date(),
            });
          } else {
            // Update category if item already exists
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
              kategori: "aksesoris", // Add category information
              stokAwal: 0,
              tambahStok: 0,
              laku: 0,
              free: 0,
              gantiLock: 0,
              stokAkhir: 0,
              lastUpdate: new Date(),
            });
          } else {
            // Update category if item already exists
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
  
        // Validate input dates
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
  
        // Add time to the end date to cover the entire day
        const endDateWithTime = new Date(endDate);
        endDateWithTime.setHours(23, 59, 59, 999);
  
        // Check if data is already cached for this date range
        const cacheKey = `stock_${startDateStr}_${endDateStr}`;
        if (this.cache[cacheKey] && this.cache[cacheKey].data) {
          console.log(`Using cached stock data for range ${startDateStr} to ${endDateStr}`);
  
          // Create a copy of the data from cache to avoid reference issues
          try {
            this.filteredStockData = [...this.cache[cacheKey].data];
  
            // Update last accessed timestamp
            this.cache[cacheKey].lastAccessed = new Date().getTime();
  
            // Render table with data from cache
            this.renderStockTable();
            this.showLoading(false);
            return;
          } catch (cacheError) {
            console.warn("Error using cached data:", cacheError);
            // Continue with fetching new data if cache fails
          }
        }
  
        // Fetch all sales data once and store it in cache
        try {
          if (!this.cache.allSalesData) {
            // Fetch all sales data (this is done only once)
            const salesRef = collection(firestore, "penjualanAksesoris");
            const salesSnapshot = await getDocs(salesRef);
  
            // Process sales data
            const allSalesData = [];
            salesSnapshot.forEach((doc) => {
              const sale = doc.data();
              // Add document ID to the data
              allSalesData.push({
                id: doc.id,
                ...sale,
              });
            });
  
            // Store in cache
            this.cache.allSalesData = {
              data: allSalesData,
              lastFetched: new Date().getTime(),
            };
          }
        } catch (salesError) {
          console.error("Error fetching sales data:", salesError);
          // Continue even if fetching sales data fails
        }
  
        // Calculate stock continuity
        try {
          await this.calculateStockContinuity(startDate, endDateWithTime);
        } catch (calcError) {
          console.error("Error calculating stock continuity:", calcError);
          throw new Error("Gagal menghitung stok: " + calcError.message);
        }
  
        // Store result in cache if successful
        if (this.filteredStockData && this.filteredStockData.length > 0) {
          // Create a copy of the data to store in cache
          this.cache[cacheKey] = {
            data: [...this.filteredStockData],
            lastFetched: new Date().getTime(),
            lastAccessed: new Date().getTime(),
          };
        }
  
        // Render table
        this.renderStockTable();
        this.showLoading(false);
      } catch (error) {
        console.error("Error in filterStockData:", error);
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
        // Ensure the loading indicator is turned off in all cases
        this.showLoading(false);
  
        // Clean up unused cache
        setTimeout(() => this.cleanupCache(), 1000);
      }
    },
  
    // Method to calculate stock continuity with correct logic
    async calculateStockContinuity(startDate, endDate) {
      try {
        this.showLoading(true);
  
        // Create a date one day before the start date
        const previousDay = new Date(startDate);
        previousDay.setDate(previousDay.getDate() - 1);
        previousDay.setHours(23, 59, 59, 999);
  
        // Add time to the end date
        const endDateWithTime = new Date(endDate);
        endDateWithTime.setHours(23, 59, 59, 999);
  
        // Fetch stock transactions from Firestore
        const stockTransactionsRef = collection(firestore, "stokAksesorisTransaksi");
  
        // Query to get all transactions up to the end date
        const transactionsQuery = query(
          stockTransactionsRef,
          where("timestamp", "<=", Timestamp.fromDate(endDateWithTime)),
          orderBy("timestamp", "asc")
        );
  
        const transactionsSnapshot = await getDocs(transactionsQuery);
  
        // Map to store stock data per item code
        const stockByCode = {};
  
        // Process all transactions
        transactionsSnapshot.forEach((doc) => {
          const transaction = doc.data();
          const kode = transaction.kode;
          const timestamp = transaction.timestamp.toDate();
  
          if (!kode) return;
  
          if (!stockByCode[kode]) {
            stockByCode[kode] = {
              // Data for period before the start date
              before: {
                stokAwal: 0,
                tambahStok: 0,
                laku: 0,
                free: 0,
                gantiLock: 0,
              },
              // Data for the selected period
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
  
          // Determine whether the transaction occurred before or during the selected period
          const isPeriodBefore = timestamp <= previousDay;
          const isPeriodDuring = timestamp > previousDay && timestamp <= endDateWithTime;
  
          // Update data based on transaction type and period
          if (isPeriodBefore) {
            // Transactions before the selected period
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
            // Transactions during the selected period
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
  
        // Fetch additional stock data from stockAdditions if available
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
              } else if (timestamp <= endDateWithTime) {
                stockByCode[kode].during.tambahStok += quantity;
              }
            });
          }
        });
  
        // Fetch all kode aksesoris to ensure all items are covered
        await this.loadAllKodeAksesoris();
  
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
  
          // Calculate initial stock for the period (end stock from the previous period)
          const initialStock =
            stockInfo.before.stokAwal +
            stockInfo.before.tambahStok -
            stockInfo.before.laku -
            stockInfo.before.free -
            stockInfo.before.gantiLock;
  
          // Calculate final stock for the period
          const finalStock =
            Math.max(0, initialStock) +
            stockInfo.during.tambahStok -
            stockInfo.during.laku -
            stockInfo.during.free -
            stockInfo.during.gantiLock;
  
          // Create stock data object with correct continuity
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
  
        // Sort by category first (kotak first, then aksesoris), then by kode
        this.filteredStockData.sort((a, b) => {
          // Prioritize category
          if ((a.kategori || "unknown") !== (b.kategori || "unknown")) {
            return (a.kategori || "unknown") === "kotak" ? -1 : 1;
          }
  
          // If categories are the same, sort by kode
          return (a.kode || "").localeCompare(b.kode || "");
        });
  
        this.showLoading(false);
      } catch (error) {
        console.error("Error calculating stock continuity:", error);
        this.showError("Error calculating stock continuity: " + error.message);
        this.showLoading(false);
      }
    },
  
    // Render the sales table
    renderSalesTable() {
      try {
        // Check if the table exists in the DOM
        const tableElement = document.getElementById("penjualanTable");
        if (!tableElement) {
          console.error("Element #penjualanTable not found in the DOM");
          return;
        }
  
        // Destroy existing DataTable safely
        try {
          if ($.fn.DataTable.isDataTable("#penjualanTable")) {
            $("#penjualanTable").DataTable().destroy();
          }
        } catch (error) {
          console.warn("Error destroying DataTable:", error);
          // Continue execution even if destroy fails
        }
  
        // Get table body
        const tableBody = document.querySelector("#penjualanTable tbody");
        if (!tableBody) {
          console.error("Element tbody of #penjualanTable not found");
          return;
        }
  
        // Clear table body
        tableBody.innerHTML = "";
  
        // Check if there is data to display
        if ((this.isSummaryMode && !this.summaryData.length) || (!this.isSummaryMode && !this.filteredSalesData.length)) {
          tableBody.innerHTML = `
            <tr>
              <td colspan="10" class="text-center">No data matches the filter</td>
            </tr>
          `;
  
          // Initialize empty DataTable
          $("#penjualanTable").DataTable({
            language: {
              url: "//cdn.datatables.net/plug-ins/1.10.25/i18n/Indonesian.json",
            },
            dom: "Bfrtip",
            buttons: ["excel", "pdf", "print"],
          });
  
          return;
        }
  
        // Prepare data for the table
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
          totalRevenue = this.calculateTotalRevenue(this.summaryData);
  
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
  
          // Set total transactions to the number of unique items
          totalTransactions = this.summaryData.length;
        } else {
          // Render detailed view
          // Restore original table header
          const tableHeader = document.querySelector("#penjualanTable thead tr");
          if (tableHeader) {
            tableHeader.innerHTML = `
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
  
          // Process each transaction
          this.filteredSalesData.forEach((transaction) => {
            const date = transaction.timestamp ? formatDate(transaction.timestamp.toDate()) : transaction.tanggal;
            const sales = transaction.sales || "Admin";
  
            // Modify display of sales type for gantiLock
            let jenisPenjualan = transaction.jenisPenjualan || "Tidak diketahui";
  
            // PERBAIKAN: Calculate total revenue based on payment method
            if (transaction.metodeBayar === "dp" && transaction.statusPembayaran === "DP") {
              // For DP transactions, add the remaining payment to total revenue
              totalRevenue += transaction.sisaPembayaran || 0;
            } else if (transaction.metodeBayar === "free") {
              // For free transactions, add nothing
              totalRevenue += 0;
            } else {
              // For other transactions (cash), add total price
              totalRevenue += transaction.totalHarga || 0;
            }
  
            totalTransactions++;
  
            // Process each item in the transaction
            if (transaction.items && transaction.items.length > 0) {
              transaction.items.forEach((item, index) => {
                // For gantiLock type, add lock code to sales type display
                let displayJenisPenjualan = jenisPenjualan;
                if (jenisPenjualan === "gantiLock" && item.kodeLock) {
                  displayJenisPenjualan = `gantiLock ${item.kodeLock}`;
                }
  
                const row = document.createElement("tr");
  
                // PERBAIKAN: Add payment status column
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
  
                row.innerHTML = `
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
                `;
                tableBody.appendChild(row);
              });
            } else {
              // Fallback if no items
              const row = document.createElement("tr");
  
              // PERBAIKAN: Add payment status column
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
  
              row.innerHTML = `
                <td>${date}</td>
                <td>${sales}</td>
                <td>${jenisPenjualan}</td>
                <td colspan="4" class="text-center">No item details</td>
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
              `;
              tableBody.appendChild(row);
            }
          });
        }
  
        // Update summary
        document.getElementById("totalTransactions").textContent = this.isSummaryMode
          ? `Total Jenis Barang: ${totalTransactions}`
          : `Total Transaksi: ${totalTransactions}`;
        document.getElementById("totalRevenue").textContent = `Total Pendapatan: Rp ${parseInt(
          totalRevenue
        ).toLocaleString("id-ID")}`;
  
        // PERBAIKAN: Initialize DataTable with drawCallback
        // But do not call attachEventListeners directly to avoid duplication
        try {
          dataTable = $("#penjualanTable").DataTable({
            language: {
              url: "//cdn.datatables.net/plug-ins/1.10.25/i18n/Indonesian.json",
            },
            dom: "Bfrtip",
            buttons: ["excel", "pdf", "print"],
            order: this.isSummaryMode ? [[3, "desc"]] : [[0, "desc"]], // Sort by total price in summary mode, date in detail mode
            drawCallback: () => {
              // Attach event listeners after DataTable has finished drawing
              this.attachEventListenersToButtons();
            },
          });
        } catch (error) {
          console.error("Error initializing DataTable:", error);
          // If DataTable fails, still attach event listeners
          this.attachEventListenersToButtons();
        }
      } catch (error) {
        console.error("Error rendering sales table:", error);
        this.showError("An error occurred while displaying the data: " + error.message);
      }
    },
  
    // Add a function to attach event listeners to buttons
    attachEventListenersToButtons() {
      console.log("Attaching event listeners to buttons");
  
      // Detail button handler
      document.querySelectorAll(".btn-detail").forEach((btn) => {
        // Remove any existing event listener to prevent duplication
        btn.removeEventListener("click", this.handleDetailClick);
        btn.addEventListener("click", this.handleDetailClick);
      });
  
      // Reprint button handler
      document.querySelectorAll(".btn-reprint").forEach((btn) => {
        // Remove any existing event listener to prevent duplication
        btn.removeEventListener("click", this.handleReprintClick);
        btn.addEventListener("click", this.handleReprintClick);
      });
  
      // Edit button handler
      document.querySelectorAll(".btn-edit").forEach((btn) => {
        // Remove any existing event listener to prevent duplication
        btn.removeEventListener("click", this.handleEditClick);
        btn.addEventListener("click", this.handleEditClick);
      });
  
      // Delete button handler
      document.querySelectorAll(".btn-delete").forEach((btn) => {
        // Remove any existing event listener to prevent duplication
        btn.removeEventListener("click", this.handleDeleteClick);
        btn.addEventListener("click", this.handleDeleteClick);
      });
    },
  
    // Handler for the detail button
    handleDetailClick(e) {
      e.preventDefault();
      e.stopPropagation();
      const transactionId = this.getAttribute("data-id");
      console.log("Detail button clicked for transaction:", transactionId);
      laporanAksesorisHandler.showTransactionDetails(transactionId);
    },
  
    // Handler for the reprint button
    handleReprintClick(e) {
      e.preventDefault();
      e.stopPropagation();
      const transactionId = this.getAttribute("data-id");
      console.log("Reprint button clicked for transaction:", transactionId);
      laporanAksesorisHandler.reprintTransaction(transactionId);
    },
  
    // Handler for the edit button
    handleEditClick(e) {
      e.preventDefault();
      e.stopPropagation();
      const transactionId = this.getAttribute("data-id");
      console.log("Edit button clicked for transaction:", transactionId);
      laporanAksesorisHandler.editTransaction(transactionId);
    },
  
    // Handler for the delete button
    handleDeleteClick(e) {
      e.preventDefault();
      e.stopPropagation();
      const transactionId = this.getAttribute("data-id");
      console.log("Delete button clicked for transaction:", transactionId);
      laporanAksesorisHandler.confirmDeleteTransaction(transactionId);
    },
  
    // Add a new function to calculate total revenue correctly
    calculateTotalRevenue(data) {
      let total = 0;
  
      if (!data || !Array.isArray(data)) {
        // If data is an array of transactions (detail mode)
        if (this.filteredSalesData && Array.isArray(this.filteredSalesData)) {
          this.filteredSalesData.forEach((transaction) => {
            // PERBAIKAN: For DP transactions, add the remaining payment (not DP)
            if (transaction.metodeBayar === "dp" && transaction.statusPembayaran === "DP") {
              // For DP transactions, add the remaining payment to total revenue
              total += transaction.sisaPembayaran || 0;
            } else if (transaction.metodeBayar === "free") {
              // For free transactions, add nothing
              total += 0;
            } else {
              // For other transactions (cash), add total price
              total += transaction.totalHarga || 0;
            }
          });
        }
        return total;
      }
  
      // If data is an array of summaries (summary mode)
      data.forEach((item) => {
        total += item.totalHarga || 0;
      });
  
      return total;
    },
  
    // Modify the showTransactionDetails function to display DP information correctly
    showTransactionDetails(transactionId) {
      try {
        // Find transaction by ID
        const transaction = this.salesData.find((item) => item.id === transactionId);
        if (!transaction) {
          return this.showError("Transaction not found");
        }
  
        // Format date
        const date = transaction.timestamp ? formatDate(transaction.timestamp.toDate()) : transaction.tanggal;
  
        // Create modal content
        let modalContent = `
          <div class="transaction-details">
            <div class="row mb-3">
              <div class="col-md-6">
                <p><strong>Tanggal:</strong> ${date}</p>
                <p><strong>Sales:</strong> ${transaction.sales || "Admin"}</p>
                <p><strong>Jenis Penjualan:</strong> ${transaction.jenisPenjualan || "Tidak diketahui"}</p>
                          </div>
            <div class="col-md-6">
              <p><strong>Metode Pembayaran:</strong> ${transaction.metodeBayar || "Tunai"}</p>
              <p><strong>Status Pembayaran:</strong> ${transaction.statusPembayaran || "Lunas"}</p>
              <p><strong>Total Harga:</strong> Rp ${parseInt(transaction.totalHarga || 0).toLocaleString("id-ID")}</p>
      `;

      // PERBAIKAN: Add DP information if payment method is DP
      if (transaction.metodeBayar === "dp" && transaction.statusPembayaran === "DP") {
        // For DP transactions, add the remaining payment to total revenue
        modalContent += `
              <p><strong>Nominal DP:</strong> Rp ${parseInt(transaction.nominalDP || 0).toLocaleString("id-ID")}</p>
              <p><strong>Sisa Pembayaran:</strong> Rp ${parseInt(transaction.sisaPembayaran || 0).toLocaleString(
                "id-ID"
              )}</p>
        `;
      }

      modalContent += `
            </div>
          </div>
          <h5>Detail Item:</h5>
          <div class="table-responsive">
            <table class="table table-bordered">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Nama Barang</th>
                  <th>Jumlah</th>
                  <th>Kadar</th>
                  <th>Berat</th>
                  <th>Harga Per Gram</th>
                  <th>Total Harga</th>
                </tr>
              </thead>
              <tbody>
      `;

      // Add items to table
      if (transaction.items && transaction.items.length > 0) {
        transaction.items.forEach((item) => {
          modalContent += `
            <tr>
              <td>${item.kodeText || "-"}</td>
              <td>${item.nama || "-"}</td>
              <td>${item.jumlah || 1}</td>
              <td>${item.kadar || "-"}</td>
              <td>${item.berat ? item.berat + " gr" : "-"}</td>
              <td>${item.hargaPerGram ? "Rp " + parseInt(item.hargaPerGram).toLocaleString("id-ID") : "-"}</td>
              <td>Rp ${parseInt(item.totalHarga || 0).toLocaleString("id-ID")}</td>
            </tr>
          `;
        });
      } else {
        modalContent += `
          <tr>
            <td colspan="7" class="text-center">No item details</td>
          </tr>
        `;
      }

      modalContent += `
              </tbody>
            </table>
          </div>
        </div>
      `;

      // Show modal
      Swal.fire({
        title: "Detail Transaksi",
        html: modalContent,
        width: "800px",
        confirmButtonText: "Close",
      });
    } catch (error) {
      console.error("Error showing transaction details:", error);
      this.showError("An error occurred while displaying transaction details: " + error.message);
    }
  },

  // Function to format numbers to Rupiah format
  formatRupiah(number) {
    return parseInt(number).toLocaleString("id-ID");
  },

  // Function to print a receipt
  printReceipt(transaction) {
    try {
      if (!transaction) {
        this.showError("No transaction data to print!");
        return;
      }

      console.log("Printing receipt with data:", transaction);

      // Create a new window for printing
      const printWindow = window.open("", "_blank");

      // Check if the window was successfully opened
      if (!printWindow) {
        throw new Error("Popup blocked by browser. Please allow popups to print the receipt.");
      }

      // Format date
      const tanggal = transaction.tanggal || this.formatTimestamp(transaction.timestamp);
      const salesType = transaction.jenisPenjualan || "aksesoris";

      // Create HTML content for the receipt
      let receiptHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt</title>
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

      // Add items to the receipt
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

        // Save keterangan if any
        if (item.keterangan && item.keterangan.trim() !== "") {
          hasKeterangan = true;
          keteranganText += item.keterangan + " ";
        }
      });

      // Add total
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

      // Add keterangan if any
      if (hasKeterangan && transaction.jenisPenjualan === "manual") {
        receiptHTML += `
          <div class="keterangan">
            <strong>Keterangan:</strong> ${keteranganText}
          </div>
      `;
      }

      receiptHTML += `
          <p class="text-center">Thank You<br>For Your Visit</p>
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

      // Write HTML to the new window with better error handling
      try {
        // Wait a bit to ensure the window is ready
        setTimeout(() => {
          if (printWindow.document) {
            printWindow.document.write(receiptHTML);
            printWindow.document.close();
          } else {
            console.error("Print window document is not available");
            this.showError("Failed to write to print window: Print window document is not available");
          }
        }, 100);
      } catch (writeError) {
        console.error("Error writing to print window:", writeError);
        this.showError("Failed to write to print window: " + writeError.message);
      }
    } catch (error) {
      console.error("Error printing receipt:", error);
      this.showError("Error printing receipt: " + error.message);
    }
  },

  // Function to print an invoice
  printInvoice(transaction) {
    if (!transaction) {
      this.showError("No transaction data to print!");
      return;
    }

    console.log("Printing invoice with data:", transaction);

    // Close the print window if it already exists
    if (this.printWindow && !this.printWindow.closed) {
      this.printWindow.close();
    }

    // Create a new window for printing
    this.printWindow = window.open("", "_blank");

    // Create HTML content for the invoice
    let invoiceHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Invoice</title>
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

    // Add items to the invoice
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

      // Save keterangan if any
      if (item.keterangan && item.keterangan.trim() !== "") {
        hasKeterangan = true;
        keteranganText += `${item.nama}: ${item.keterangan}; `;
      }
    });

    // Add total at the bottom right corner
    invoiceHTML += `
        <div class="total-row">
          Rp ${totalHarga.toLocaleString("id-ID")}
        </div>
      <div class="sales">${transaction.sales || "-"}</div>
  `;

    // Add keterangan if any and sales type is manual
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

    // Write HTML to the new window
    this.printWindow.document.write(invoiceHTML);
    this.printWindow.document.close();
  },

  // Function to format timestamp to date string
  formatTimestamp(timestamp) {
    if (!timestamp) return "-";

    try {
      // If timestamp is a Firestore Timestamp object
      if (timestamp.toDate) {
        const date = timestamp.toDate();
        return formatDate(date);
      }
      // If timestamp is already a Date object
      else if (timestamp instanceof Date) {
        return formatDate(timestamp);
      }
      // If timestamp is in string format
      else {
        return timestamp;
      }
    } catch (error) {
      console.error("Error formatting timestamp:", error);
      return "-";
    }
  },

  // Function to format sales type
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
        return this.showError("Transaction not found");
      }

      // Prepare data for printing
      const printData = {
        id: transactionId,
        salesType: transaction.jenisPenjualan,
        tanggal: transaction.timestamp ? formatDate(transaction.timestamp.toDate()) : transaction.tanggal,
        sales: transaction.sales || "Admin",
        totalHarga: parseInt(transaction.totalHarga || 0).toLocaleString("id-ID"),
        items: transaction.items || [],
        metodeBayar: transaction.metodeBayar || "cash",
      };

      // Add DP information if payment method is DP
      if (transaction.metodeBayar === "dp" && transaction.statusPembayaran === "DP") {
        printData.nominalDP = parseInt(transaction.nominalDP || 0).toLocaleString("id-ID");
        printData.sisaPembayaran = parseInt(transaction.sisaPembayaran || 0).toLocaleString("id-ID");
      }

      // Show print options modal
      Swal.fire({
        title: "Print Again",
        html: `
        <p>Please select the type of receipt to print:</p>
        <div class="d-grid gap-2">
          <button type="button" class="btn btn-primary" id="btnPrintReceipt">
            <i class="fas fa-receipt me-2"></i>
            Cashier Receipt
          </button>
          <button type="button" class="btn btn-success" id="btnPrintInvoice">
            <i class="fas fa-file-invoice me-2"></i>
            Customer Invoice
          </button>
        </div>
      `,
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: "Close",
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
      this.showError("An error occurred while reprinting: " + error.message);
    }
  },

  // Show edit form
  editTransaction(transactionId) {
    try {
      // Find transaction by ID
      const transaction = this.salesData.find((item) => item.id === transactionId);
      if (!transaction) {
        return this.showError("Transaction not found");
      }

      // Display edit form based on sales type
      let formHtml = '';
      
      // Form for all sales types
      formHtml += `
        <div class="mb-3">
          <label for="editSales" class="form-label">Sales:</label>
          <input type="text" class="form-control" id="editSales" value="${transaction.sales || ''}">
        </div>
      `;
      
      // Form specific to DP transactions
      if (transaction.metodeBayar === "dp") {
        formHtml += `
          <div class="mb-3">
            <label for="editNominalDP" class="form-label">DP Nominal:</label>
            <input type="text" class="form-control" id="editNominalDP" value="${parseInt(transaction.nominalDP || 0).toLocaleString("id-ID")}">
          </div>
          <div class="mb-3">
            <label for="editSisaPembayaran" class="form-label">Remaining Payment:</label>
            <input type="text" class="form-control" id="editSisaPembayaran" value="${parseInt(transaction.sisaPembayaran || 0).toLocaleString("id-ID")}" readonly>
          </div>
          <div class="mb-3">
            <label for="editStatusPembayaran" class="form-label">Payment Status:</label>
            <select class="form-select" id="editStatusPembayaran">
              <option value="DP" ${transaction.statusPembayaran === "DP" ? "selected" : ""}>DP</option>
              <option value="Lunas" ${transaction.statusPembayaran === "Lunas" ? "selected" : ""}>Lunas</option>
            </select>
          </div>
        `;
      } else {
        // Form for non-DP transactions
        formHtml += `
          <div class="mb-3">
            <label for="editTotalHarga" class="form-label">Total Price:</label>
            <input type="text" class="form-control" id="editTotalHarga" value="${parseInt(transaction.totalHarga || 0).toLocaleString("id-ID")}">
          </div>
          <div class="mb-3">
            <label for="editMetodeBayar" class="form-label">Payment Method:</label>
            <select class="form-select" id="editMetodeBayar">
              <option value="cash" ${transaction.metodeBayar === "cash" ? "selected" : ""}>Cash</option>
              <option value="dp" ${transaction.metodeBayar === "dp" ? "selected" : ""}>DP</option>
              <option value="free" ${transaction.metodeBayar === "free" ? "selected" : ""}>Free</option>
            </select>
          </div>
        `;
      }

      // Save reference to this for use in callback
      const self = this;

      Swal.fire({
        title: "Edit Transaction",
        html: formHtml,
        showCancelButton: true,
        confirmButtonText: "Save",
        cancelButtonText: "Cancel",
        didOpen: () => {
          // Event listener for DP transactions
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
            // Event listener for non-DP transactions
            const editTotalHargaInput = document.getElementById("editTotalHarga");
            const editMetodeBayarSelect = document.getElementById("editMetodeBayar");
            
            // Format total price input with thousand separator
            editTotalHargaInput.addEventListener("blur", () => {
              const value = editTotalHargaInput.value.replace(/\./g, "");
              editTotalHargaInput.value = parseInt(value || 0).toLocaleString("id-ID");
            });
            
            // If payment method is changed to DP, show DP form
            editMetodeBayarSelect.addEventListener("change", () => {
              if (editMetodeBayarSelect.value === "dp") {
                Swal.close();
                
                // Call the edit function with DP method
                const updatedTransaction = {...transaction, metodeBayar: "dp"};
                self.editTransaction(transactionId);
              }
            });
          }
        }
      }).then(async (result) => {
        if (result.isConfirmed) {
          // Prepare data to be updated
          const updateData = {};
          
          // Update sales for all transaction types
          updateData.sales = document.getElementById("editSales").value.trim();
          
          // Update data specific to DP transactions
          if (transaction.metodeBayar === "dp") {
            const nominalDP = parseFloat(document.getElementById("editNominalDP").value.replace(/\./g, "").replace(",", ".")) || 0;
            const sisaPembayaran = parseFloat(document.getElementById("editSisaPembayaran").value.replace(/\./g, "").replace(",", ".")) || 0;
            const statusPembayaran = document.getElementById("editStatusPembayaran").value;
            
            // Validate input
            if (nominalDP <= 0) {
              return self.showError("DP Nominal must be greater than 0");
            }
            
            if (nominalDP >= transaction.totalHarga && statusPembayaran === "DP") {
              return self.showError("DP Nominal cannot be equal to or greater than total price for DP status");
            }
            
            updateData.nominalDP = nominalDP;
            updateData.sisaPembayaran = sisaPembayaran;
            updateData.statusPembayaran = statusPembayaran;
          } else {
            // Update data for non-DP transactions
            const totalHarga = parseFloat(document.getElementById("editTotalHarga").value.replace(/\./g, "").replace(",", ".")) || 0;
            const metodeBayar = document.getElementById("editMetodeBayar").value;
            
            // Validate input
            if (totalHarga < 0) {
              return self.showError("Total price cannot be negative");
            }
            
            updateData.totalHarga = totalHarga;
            updateData.metodeBayar = metodeBayar;
            
            // Update payment status based on payment method
            if (metodeBayar === "free") {
              updateData.statusPembayaran = "Free";
            } else {
              updateData.statusPembayaran = "Lunas";
            }
          }
          
          // Add timestamp update
          updateData.lastUpdated = serverTimestamp();
          
          try {
            self.showLoading(true);
            
            // Update transaction in Firestore
            await updateDoc(doc(firestore, "penjualanAksesoris", transactionId), updateData);
            
            // PERBAIKAN: Update local data correctly
            // Create a copy of the updated transaction data
            const updatedTransaction = {...transaction, ...updateData};
            
            // Remove serverTimestamp property as it cannot be rendered directly
            delete updatedTransaction.lastUpdated;
            
            // Update salesData array
            const salesIndex = self.salesData.findIndex(item => item.id === transactionId);
            if (salesIndex !== -1) {
              self.salesData[salesIndex] = updatedTransaction;
            }
            
            // Update filteredSalesData array
            const filteredIndex = self.filteredSalesData.findIndex(item => item.id === transactionId);
            if (filteredIndex !== -1) {
              self.filteredSalesData[filteredIndex] = updatedTransaction;
            }
            
            // Re-render table
            self.renderSalesTable();
            
            self.showLoading(false);
            self.showSuccess("Transaction successfully updated");
          } catch (error) {
            self.showLoading(false);
            console.error("Error updating transaction:", error);
            self.showError("An error occurred while updating the transaction: " + error.message);
          }
        }
      });
    } catch (error) {
      console.error("Error editing transaction:", error);
      this.showError("An error occurred while editing the transaction: " + error.message);
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
          <i class="fas fa-trash-alt"></i> Remove Item
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
        throw new Error("Transaction ID not found");
      }

      // Get form data
      const sales = document.getElementById("editSales").value.trim();
      const jenisPenjualan = document.getElementById("editJenisPenjualan").value;

      if (!sales) {
        throw new Error("Sales name must be filled");
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
          throw new Error("Item name must be filled");
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
        throw new Error("At least one item is required");
      }

      // Create the data object to be updated
      const updatedData = {
        sales,
        jenisPenjualan,
        totalHarga,
        items,
        lastEdited: new Date(),
      };

      // Update transaction in Firestore
      await updateDoc(doc(firestore, "penjualanAksesoris", this.currentEditId), updatedData);

      // PERUBAHAN: Update local data
      // Find the index of the edited data in salesData
      const salesDataIndex = this.salesData.findIndex((item) => item.id === this.currentEditId);
      if (salesDataIndex !== -1) {
        // Update data in salesData while preserving other properties that were not changed
        this.salesData[salesDataIndex] = {
          ...this.salesData[salesDataIndex], // Preserve other properties
          ...updatedData, // Apply new changes
        };
      }

      // Find the index of the edited data in filteredSalesData
      const filteredDataIndex = this.filteredSalesData.findIndex((item) => item.id === this.currentEditId);
      if (filteredDataIndex !== -1) {
        // Update data in filteredSalesData
        this.filteredSalesData[filteredDataIndex] = {
          ...this.filteredSalesData[filteredDataIndex], // Preserve other properties
          ...updatedData, // Apply new changes
        };
      }

      // Re-render the table with the updated data
      this.renderSalesTable();

      // Close the modal
      const editModal = bootstrap.Modal.getInstance(document.getElementById("editModal"));
      editModal.hide();

      // Show success message
      this.showSuccess("Transaction successfully updated");

      // Refresh data
      this.loadSalesData();

      this.showLoading(false);
    } catch (error) {
      console.error("Error saving edited transaction:", error);
      this.showError("Error saving changes: " + error.message);
      this.showLoading(false);
    }
  },

  // Confirm delete
  confirmDeleteTransaction(transactionId) {
    try {
      // Find transaction by ID
      const transaction = this.salesData.find((item) => item.id === transactionId);
      if (!transaction) {
        return this.showError("Transaction not found");
      }
  
      // Format date
      const date = transaction.timestamp ? formatDate(transaction.timestamp.toDate()) : transaction.tanggal;
  
      // Show confirmation dialog
      Swal.fire({
        title: "Confirm Delete",
        html: `
          <p>Are you sure you want to delete this transaction?</p>
          <div class="alert alert-warning">
            <i class="fas fa-exclamation-triangle me-2"></i>
            <strong>Warning!</strong> This action will permanently delete the data and cannot be undone.
          </div>
          <div class="text-start">
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>Sales:</strong> ${transaction.sales || "Admin"}</p>
            <p><strong>Sales Type:</strong> ${transaction.jenisPenjualan || "Unknown"}</p>
            <p><strong>Total Price:</strong> Rp ${parseInt(transaction.totalHarga || 0).toLocaleString("id-ID")}</p>
          </div>
        `,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, Delete",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#dc3545",
      }).then((result) => {
        if (result.isConfirmed) {
          this.deleteTransaction(transactionId);
        }
      });
    } catch (error) {
      console.error("Error confirming delete transaction:", error);
      this.showError("An error occurred while deleting the transaction: " + error.message);
    }
  },
  
  // Function to delete a transaction
  async deleteTransaction(transactionId) {
    try {
      this.showLoading(true);
      
      // Delete transaction from Firestore
      await deleteDoc(doc(firestore, "penjualanAksesoris", transactionId));
      
      // Remove data from local array without reloading
      this.salesData = this.salesData.filter(item => item.id !== transactionId);
      this.filteredSalesData = this.filteredSalesData.filter(item => item.id !== transactionId);
      
      // Re-render table without reloading data
      this.renderSalesTable();
      
      this.showLoading(false);
      this.showSuccess("Transaction successfully deleted");
    } catch (error) {
      this.showLoading(false);
      console.error("Error deleting transaction:", error);
      this.showError("An error occurred while deleting the transaction: " + error.message);
    }
  },
  
  // Function to show success message
  showSuccess(message) {
    if (typeof Swal !== "undefined") {
      Swal.fire({
        icon: "success",
        title: "Success!",
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
  showConfirm(message, title = "Confirmation") {
    return new Promise((resolve) => {
      if (typeof Swal !== "undefined") {
        Swal.fire({
          title: title,
          html: message,
          icon: "question",
          showCancelButton: true,
          confirmButtonColor: "#28a745",
          cancelButtonColor: "#dc3545",
          confirmButtonText: "Yes",
          cancelButtonText: "Cancel",
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
      // Check if the table exists in the DOM before trying to destroy it
      const tableElement = document.getElementById("stockTable");
      if (!tableElement) {
        console.error("Element #stockTable not found in the DOM");
        return;
      }

      // Destroy existing DataTable safely
      try {
        if ($.fn.DataTable.isDataTable("#stockTable")) {
          $("#stockTable").DataTable().destroy();
        }
      } catch (error) {
        console.warn("Error destroying DataTable:", error);
        // Continue execution even if destroy fails
      }

      // Get table body
      const tableBody = document.querySelector("#stockTable tbody");
      if (!tableBody) {
        console.error("Element tbody of #stockTable not found");
        return;
      }

      // Check if there is data to display
      if (!this.filteredStockData || this.filteredStockData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center">No data matches the filter</td>
            </tr>
        `;

        // Initialize empty DataTable
        try {
          $("#stockTable").DataTable({
            responsive: true,
            language: {
              emptyTable: "No data available",
            },
          });
        } catch (error) {
          console.warn("Error initializing empty DataTable:", error);
        }
        return;
      }

      // Group data by category
      const kotakItems = this.filteredStockData.filter((item) => item.kategori === "kotak");
      const aksesorisItems = this.filteredStockData.filter((item) => item.kategori === "aksesoris");
      const otherItems = this.filteredStockData.filter(
        (item) => item.kategori !== "kotak" && item.kategori !== "aksesoris"
      );

      // Create HTML for the table without category headers
      let html = "";
      let rowIndex = 1;

      // Add all items without category headers
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

      // Ensure HTML is not empty before setting it to tableBody
      if (html.trim() === "") {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center">No valid data to display</td>
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
          #stockTable th:nth-child(3), #stockTable td:nth-child(3) { width: 35%; } /* Nama - more space */
          #stockTable th:nth-child(4), #stockTable td:nth-child(4),
          #stockTable th:nth-child(5), #stockTable td:nth-child(5),
          #stockTable th:nth-child(6), #stockTable td:nth-child(6),
          #stockTable th:nth-child(7), #stockTable td:nth-child(7),
          #stockTable th:nth-child(8), #stockTable td:nth-child(8),
          #stockTable th:nth-child(9), #stockTable td:nth-child(9) { width: 8.33%; } /* Stock columns - equal width */
          
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

      // Initialize DataTable with export buttons
      try {
        const dataTable = $("#stockTable").DataTable({
          responsive: true,
          dom: "Bfrtip",
          ordering: false, // Disable sorting feature
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
                // Customize Excel file
                var sheet = xlsx.xl.worksheets["sheet1.xml"];
                // Adjust column widths in Excel
                $('row c[r^="C"]', sheet).attr("s", "55"); // Wider column for Name with wrap text
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
                // Customize PDF file
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
            { width: "30%", targets: 2 }, // Nama - more space
            { width: "8.33%", targets: 3 }, // Stok Awal
            { width: "8.33%", targets: 4 }, // Tambah Stok
            { width: "8.33%", targets: 5 }, // Laku
            { width: "8.33%", targets: 6 }, // Free
            { width: "8.33%", targets: 7 }, // Ganti Lock
            { width: "8.33%", targets: 8 }, // Stok Akhir
          ],
          language: {
            search: "Search:",
            lengthMenu: "Show _MENU_ entries",
            info: "Showing _START_ to _END_ of _TOTAL_ entries",
            infoEmpty: "Showing 0 to 0 of 0 entries",
            infoFiltered: "(filtered from _MAX_ total entries)",
            paginate: {
              first: "First",
              last: "Last",
              next: "Next",
              previous: "Previous",
            },
          },
        });

        // Add category headers and continuity note after DataTable is initialized
        this.addCategoryHeadersAndContinuityNote(kotakItems, aksesorisItems, otherItems);
      } catch (dtError) {
        console.error("Error initializing DataTable:", dtError);
        // Show a more user-friendly error message
        this.showError("An error occurred while loading the table. Please try again.");
      }
    } catch (error) {
      console.error("Error in renderStockTable:", error);
      this.showError("An error occurred while displaying stock data: " + error.message);

      // Ensure the table is in a clean state
      try {
        const tableBody = document.querySelector("#stockTable tbody");
        if (tableBody) {
          tableBody.innerHTML = `
            <tr>
              <td colspan="9" class="text-center">An error occurred while loading the data</td>
            </tr>
          `;
        }

        // Initialize an empty DataTable if an error occurs
        if (!$.fn.DataTable.isDataTable("#stockTable")) {
          $("#stockTable").DataTable({
            responsive: true,
            language: {
              emptyTable: "No data available",
            },
          });
        }
      } catch (innerError) {
        console.warn("Error resetting the table:", innerError);
      }
    }
  },

  // Function to add category headers and continuity note
  addCategoryHeadersAndContinuityNote(kotakItems, aksesorisItems, otherItems) {
    // Add container for category headers above the table
    const tableContainer = document.querySelector("#stockTable_wrapper");
    if (!tableContainer) return;

    // Check if the category header container already exists
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
            ? `<div class="category-badge badge bg-primary p-2">${kotakItems.length} Jewelry Boxes</div>`
            : ""
        }
        ${
          aksesorisItems.length > 0
            ? `<div class="category-badge badge bg-success p-2">${aksesorisItems.length} Jewelry Accessories</div>`
            : ""
        }
          ${
            otherItems.length > 0
              ? `<div class="category-badge badge bg-secondary p-2">${otherItems.length} Others</div>`
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

    // Add event listeners for filtering by category
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

  // Function to show success notification
  showSuccessNotification(message) {
    if (typeof Swal !== "undefined") {
      Swal.fire({
        icon: "success",
        title: "Success!",
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
    // Add class for category
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
      this.showError("No data to export");
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
            Date: date,
            Sales: sale.sales || "-",
            "Item Code": item.kodeText || "-",
            "Item Name": item.nama || "-",
            Quantity: item.jumlah || 0,
            "Unit Price": item.hargaSatuan || 0,
            Total: (item.jumlah || 0) * (item.hargaSatuan || 0),
          });
        });
      }
    });

    // Generate filename with date range
    const startDate = document.querySelector("#sales-tab-pane #startDate").value.replace(/\//g, "-");
    const endDate = document.querySelector("#sales-tab-pane #endDate").value.replace(/\//g, "-");
    const filename = `Sales_Report_${startDate}_to_${endDate}.xlsx`;

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Set column widths
    const wscols = [
      { wch: 12 }, // Date
      { wch: 15 }, // Sales
      { wch: 12 }, // Item Code
      { wch: 25 }, // Item Name
      { wch: 8 }, // Quantity
      { wch: 15 }, // Unit Price
      { wch: 15 }, // Total
    ];
    ws["!cols"] = wscols;

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Data");

    // Export to file
    XLSX.writeFile(wb, filename);
  },

  // Export stock data to Excel (this function can be removed as it is already replaced by DataTables Buttons)
  exportStockData() {
    if (!this.filteredStockData.length) {
      this.showError("No data to export");
      return;
    }

    // Use DataTables export button
    $("#stockTable").DataTable().button(0).trigger(); // Trigger Excel export button
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

  // Method to clean up cache that is no longer in use
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

    // Limit the number of cache entries to prevent excessive memory usage
    const maxCacheEntries = 10;
    const cacheKeys = Object.keys(this.cache).filter((key) => key.startsWith("stock_"));

    if (cacheKeys.length > maxCacheEntries) {
      // Sort by last accessed time (oldest first)
      cacheKeys.sort((a, b) => this.cache[a].lastFetched - this.cache[b].lastFetched);

      // Remove excess cache entries
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
function showAlert(message, title = "Information", type = "info") {
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

// Initialize when the document is ready
document.addEventListener("DOMContentLoaded", function () {
  // Check if SheetJS (XLSX) library is loaded (for Excel export)
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
  }, 5 * 60 * 1000); // Clean up cache every 5 minutes
});

// Export the handler for potential use in other modules
export default laporanAksesorisHandler;
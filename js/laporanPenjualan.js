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
  
  // Konstanta untuk kata sandi verifikasi
  const VERIFICATION_PASSWORD = "melati3"; // Ganti dengan kata sandi yang diinginkan
  
  // Variabel untuk menyimpan jenis data yang akan dihapus
  let deleteDataType = "";
  let deleteStartDate = null;
  let deleteEndDate = null;
  
  // Fungsi untuk menghapus data penjualan
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
      laporanPenjualanHandler.cache.salesData.data = null;
      await laporanPenjualanHandler.loadSalesData();
      laporanPenjualanHandler.filterSalesData();
  
      showLoading(false);
      return showAlert(`Berhasil menghapus ${deleteCount} data penjualan.`, "Sukses", "success");
    } catch (error) {
      console.error("Error deleting sales data:", error);
      showLoading(false);
      return showAlert("Gagal menghapus data: " + error.message, "Error", "error");
    }
  }
  
  // Fungsi untuk menampilkan modal verifikasi
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
    confirmationText.textContent = `Anda akan menghapus data penjualan dari ${startDateStr} hingga ${endDateStr}. Tindakan ini tidak dapat dibatalkan.`;
  
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
  
  // Fungsi untuk mencetak laporan summary dengan ukuran struk kasir
  function printSummaryReceiptFormat(summaryData) {
    // Ambil informasi tanggal filter
    const startDateStr = document.querySelector("#startDate").value;
    const endDateStr = document.querySelector("#endDate").value;
  
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
  const laporanPenjualanHandler = {
    // Data properties
    salesData: [],
    filteredSalesData: [],
    isSummaryMode: false,
    summaryData: [],
  
    // Cache properties
    cache: {
      salesData: {
        data: null,
        lastFetched: null,
      }
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
    
    this.initDatePickers();
    this.attachEventListeners();
    this.setDefaultDates();
    this.initDataTables();
    this.prepareEmptyTables();

    // Tombol hapus data penjualan
    const deleteSalesDataBtn = document.getElementById("deleteSalesDataBtn");
    if (deleteSalesDataBtn) {
      deleteSalesDataBtn.addEventListener("click", () => {
        const startDateStr = document.querySelector("#startDate").value;
        const endDateStr = document.querySelector("#endDate").value;

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

    // Tombol konfirmasi hapus di modal
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
        <td colspan="10" class="text-center">Silakan pilih filter dan klik tombol "Tampilkan" untuk melihat data</td>
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

  // Fungsi untuk menghasilkan ringkasan penjualan
  generateSalesSummary() {
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

          // Hitung total harga berdasarkan metode pembayaran
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

      this.showLoading(false);
    } catch (error) {
      console.error("Error generating summary data:", error);
      this.showError("Terjadi kesalahan saat membuat ringkasan: " + error.message);
      this.showLoading(false);
    }
  },

  // Fungsi untuk mengisi dropdown sales person
  populateSalesPersonDropdown() {
    // Get unique sales persons from the data
    const salesPersons = [...new Set(this.salesData.map((item) => item.sales).filter(Boolean))];

    // Get the dropdown element
    const dropdown = document.querySelector("#salesPerson");
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

  // Fungsi untuk memuat data penjualan
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
        this.populateSalesPersonDropdown();
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
      this.populateSalesPersonDropdown();

      this.showLoading(false);
      return Promise.resolve();
    } catch (error) {
      console.error("Error loading sales data:", error);
      this.showError("Error loading sales data: " + error.message);
      this.showLoading(false);
      return Promise.reject(error);
    }
  },

  // Fungsi untuk memfilter data penjualan
  filterSalesData() {
    if (!this.salesData || !this.salesData.length) return;
  
    this.showLoading(true);
  
    try {
      // Get filter values
      const startDateStr = document.querySelector("#startDate").value;
      const endDateStr = document.querySelector("#endDate").value;
      const salesType = document.querySelector("#salesType").value;
      const salesPerson = document.querySelector("#salesPerson").value;
  
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
  
        // Check if sales type matches - PERUBAHAN: Gabungkan manual dan gantiLock menjadi "layanan"
        let typeMatches = true;
        if (salesType !== "all") {
          if (salesType === "layanan") {
            // Jika filter adalah "layanan", tampilkan jenis "manual" dan "gantiLock"
            typeMatches = item.jenisPenjualan === "manual" || item.jenisPenjualan === "gantiLock";
          } else {
            // Untuk filter lainnya, gunakan exact match
            typeMatches = item.jenisPenjualan === salesType;
          }
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
        
        // PERUBAHAN: Format jenis penjualan untuk menggabungkan manual dan gantiLock
        let jenisPenjualan = transaction.jenisPenjualan || "Tidak diketahui";
        
        // Tampilkan "Layanan" untuk jenis manual dan gantiLock
        if (jenisPenjualan === "manual" || jenisPenjualan === "gantiLock") {
          jenisPenjualan = "Layanan";
        }

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
            if (transaction.jenisPenjualan === "gantiLock" && item.kodeLock) {
              displayJenisPenjualan = `Layanan (Lock ${item.kodeLock})`;
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
  laporanPenjualanHandler.showTransactionDetails(transactionId);
},

// Handler untuk tombol reprint
handleReprintClick(e) {
  e.preventDefault();
  e.stopPropagation();
  const transactionId = this.getAttribute("data-id");
  console.log("Reprint button clicked for transaction:", transactionId);
  laporanPenjualanHandler.reprintTransaction(transactionId);
},

// Handler untuk tombol edit
handleEditClick(e) {
  e.preventDefault();
  e.stopPropagation();
  const transactionId = this.getAttribute("data-id");
  console.log("Edit button clicked for transaction:", transactionId);
  laporanPenjualanHandler.editTransaction(transactionId);
},

// Handler untuk tombol delete
handleDeleteClick(e) {
  e.preventDefault();
  e.stopPropagation();
  const transactionId = this.getAttribute("data-id");
  console.log("Delete button clicked for transaction:", transactionId);
  laporanPenjualanHandler.confirmDeleteTransaction(transactionId);
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
    
    // PERUBAHAN: Format jenis penjualan untuk menggabungkan manual dan gantiLock
    let salesType = transaction.jenisPenjualan || "aksesoris";
    if (salesType === "manual" || salesType === "gantiLock") {
      salesType = "layanan";
    }

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
    if (hasKeterangan && (transaction.jenisPenjualan === "manual" || transaction.jenisPenjualan === "gantiLock")) {
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

  // PERBAIKAN: Tambahkan keterangan jika ada dan jenis penjualan adalah manual atau gantiLock
  if (hasKeterangan && (transaction.jenisPenjualan === "manual" || transaction.jenisPenjualan === "gantiLock")) {
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
      jenisPenjualan: transaction.jenisPenjualan,
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
          
          // Update data lokal dengan benar
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

// Refresh sales table (called when tab is activated)
refreshSalesTable() {
const table = $("#penjualanTable").DataTable();
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
const startDate = document.querySelector("#startDate").value.replace(/\//g, "-");
const endDate = document.querySelector("#endDate").value.replace(/\//g, "-");
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

// Show loading indicator
showLoading(isLoading) {
const loadingIndicator = document.getElementById("loadingIndicator");
if (loadingIndicator) {
  loadingIndicator.style.display = isLoading ? "flex" : "none";
}
},

// Metode untuk membersihkan cache yang sudah tidak digunakan
cleanupCache() {
const now = new Date().getTime();
const cacheExpiry = 30 * 60 * 1000; // 30 menit

// Bersihkan cache yang sudah kadaluarsa
Object.keys(this.cache).forEach((key) => {
  if (key.startsWith("sales_") && this.cache[key].lastFetched && now - this.cache[key].lastFetched > cacheExpiry) {
    console.log(`Cleaning up expired cache for ${key}`);
    delete this.cache[key];
  }
});

// Batasi jumlah cache untuk mencegah penggunaan memori berlebihan
const maxCacheEntries = 10;
const cacheKeys = Object.keys(this.cache).filter((key) => key.startsWith("sales_"));

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
laporanPenjualanHandler.init();

// Confirm delete button handler
document.getElementById("confirmDeleteRangeBtn").addEventListener("click", () => {
laporanPenjualanHandler.deleteTransaction();
});

// Set interval to clean up cache periodically
setInterval(() => {
laporanPenjualanHandler.cleanupCache();
}, 5 * 60 * 1000); // Bersihkan cache setiap 5 menit
});

// Export the handler for potential use in other modules
export default laporanPenjualanHandler;





  
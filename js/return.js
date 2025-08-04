import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";
import { firestore } from "./configFirebase.js";

// Utils function untuk alert
const showAlert = (message, title = "Informasi", type = "info") => {
  return Swal.fire({
    title,
    text: message,
    icon: type,
    confirmButtonText: "OK",
    confirmButtonColor: "#0d6efd",
  });
};

const returnHandler = {
  stockData: [],
  stockListener: null,
  isSaving: false,
  riwayatData: [],

  async filterRiwayatReturn() {
    const selectedDate = $("#filterDate").val();
    if (!selectedDate) {
      showAlert("Mohon pilih tanggal", "Warning", "warning");
      return;
    }
    this.loadRiwayatReturn(selectedDate);
  },

  async init() {
    try {
      await this.setupEventListeners();
      this.setupRealTimeListeners();
      this.setDefaultDate();
      this.setDefaultFilterDates();
      await this.loadRiwayatReturn();
    } catch (error) {
      console.error("Error initializing return handler:", error);
      showAlert("Terjadi kesalahan saat memuat halaman", "Error", "error");
    }
  },

  // Set default filter date
  setDefaultFilterDates() {
    const today = new Date();
    $("#filterDate").val(today.toISOString().split("T")[0]);
  },

  // Load riwayat return
  async loadRiwayatReturn(selectedDate = null) {
    try {
      const returnRef = collection(firestore, "returnBarang");
      let returnQuery = returnRef;

      if (selectedDate) {
        // Convert to Date object to handle time zones properly
        const date = new Date(selectedDate);
        const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
        
        returnQuery = query(
          returnRef,
          where("tanggal", ">=", startOfDay.toISOString()),
          where("tanggal", "<=", endOfDay.toISOString())
        );
      }

      const snapshot = await getDocs(returnQuery);
      this.riwayatData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      this.renderRiwayatReturn();
    } catch (error) {
      console.error("Error loading riwayat return:", error);
      showAlert("Gagal memuat data riwayat return", "Error", "error");
    }
  },

  // Render riwayat return
  renderRiwayatReturn() {
    const $tbody = $("#tableRiwayatReturn tbody");
    $tbody.empty();

    if (this.riwayatData.length === 0) {
      $tbody.append(`
        <tr>
          <td colspan="7" class="text-center">Tidak ada data</td>
        </tr>
      `);
      return;
    }

    this.riwayatData.forEach(data => {
      // Handle multiple items in detailReturn
      data.detailReturn.forEach(item => {
        $tbody.append(`
          <tr>
            <td>${data.tanggal}</td>
            <td>${data.namaSales}</td>
            <td>${data.jenisReturn}</td>
            <td>${item.kode}</td>
            <td>${item.namaBarang}</td>
            <td>${item.jumlah}</td>
            <td>${item.keterangan || "-"}</td>
          </tr>
        `);
      });
    });
  },

  // Print laporan return
  printLaporanReturn() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showAlert("Popup diblokir oleh browser. Mohon izinkan popup untuk mencetak.", "Error", "error");
      return;
    }

    const selectedDate = $("#filterDate").val();
    const formattedDate = new Date(selectedDate).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    let printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Laporan Return Barang</title>
          <style>
            body { font-family: Arial, sans-serif; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
            .header { text-align: center; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Laporan Return Barang</h2>
            <p>Tanggal: ${formattedDate}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Sales</th>
                <th>Jenis Return</th>
                <th>Kode</th>
                <th>Nama Barang</th>
                <th>Jumlah</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
    `;

    this.riwayatData.forEach(data => {
      data.detailReturn.forEach(item => {
        printContent += `
          <tr>
            <td>${data.tanggal}</td>
            <td>${data.namaSales}</td>
            <td>${data.jenisReturn}</td>
            <td>${item.kode}</td>
            <td>${item.namaBarang}</td>
            <td>${item.jumlah}</td>
            <td>${item.keterangan || "-"}</td>
          </tr>
        `;
      });
    });

    printContent += `
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  },

  // Filter riwayat return
  filterRiwayatReturn() {
    const selectedDate = $("#filterDate").val();
    if (!selectedDate) {
      showAlert("Mohon pilih tanggal", "Warning", "warning");
      return;
    }
    this.loadRiwayatReturn(selectedDate);
  },

  // Setup event listeners
  setupEventListeners() {
    // Jenis return change
    $("#jenisReturn").on("change", () => {
      const jenisReturn = $("#jenisReturn").val();
      if (jenisReturn) {
        this.loadStockData(jenisReturn);
      }
    });

    // Filter and print buttons
    $("#btnTampilkan").on("click", () => this.filterRiwayatReturn());
    $("#btnPrintLaporan").on("click", () => this.printLaporanReturn());

    // Add filter function
    async function filterRiwayatReturn() {
      const selectedDate = $("#filterDate").val();
      if (!selectedDate) {
        showAlert("Mohon pilih tanggal", "Warning", "warning");
        return;
      }
      await this.loadRiwayatReturn(selectedDate);
    }

    // Pilih barang button
    $("#btnPilihBarang").on("click", async () => {
      const jenisReturn = $("#jenisReturn").val();
      if (!jenisReturn) {
        showAlert("Pilih jenis return terlebih dahulu", "Warning", "warning");
        return;
      }
      // Load data sebelum menampilkan modal
      await this.loadStockData(jenisReturn);
      $("#modalPilihBarang").modal("show");
    });

    // Search barang dengan debounce
    let searchTimeout;
    $("#searchBarang").on("keyup", () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.searchTable("#searchBarang", "#tableBarang tbody tr");
      }, 300);
    });

    // Table barang row click
    $("#tableBarang tbody").on("click", "tr", (e) => {
      const $row = $(e.currentTarget);
      const kode = $row.find("td:first").text();
      const nama = $row.find("td:eq(1)").text();
      
      this.addReturnRow(kode, nama);
      $("#modalPilihBarang").modal("hide");
    });

    // Delete return row
    $("#tableReturn tbody").on("click", ".btn-delete", (e) => {
      $(e.currentTarget).closest("tr").remove();
    });

    // Simpan return
    $("#btnSimpanReturn").on("click", () => this.saveReturn());

    // Batal button
    $("#btnBatal").on("click", () => this.resetForm());
  },

  // Setup realtime listeners
  setupRealTimeListeners() {
    // Listen for stock changes
    const stockQuery = collection(firestore, "stokAksesoris");
    this.stockListener = onSnapshot(stockQuery, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "modified") {
          this.updateStockInTable(change.doc.data());
        }
      });
    });
  },

  // Load stock data based on type
  async loadStockData(type) {
    try {
      // Get all stock data first
      const stockRef = collection(firestore, "stokAksesoris");
      const snapshot = await getDocs(stockRef);
      
      // Log raw data for debugging
      console.log("Raw Firestore data:", snapshot.docs.map(doc => doc.data()));
      
      this.stockData = snapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, ...data };
      });

      // Filter based on type
      this.stockData = this.stockData.filter(item => {
        // Check both kategori and jenis fields
        const itemType = (item.kategori || item.jenis || "").toLowerCase();
        const isMatchingType = type === "kotak" 
          ? itemType.includes("kotak") 
          : (itemType.includes("aksesoris") || itemType === "");
          
        // Check stock
        const hasStock = (parseInt(item.stok) || parseInt(item.stokAkhir) || 0) > 0;
        
        // Log item details for debugging
        console.log(`Item ${item.kode}:`, {
          type: itemType,
          matches: isMatchingType,
          stock: hasStock,
          stok: item.stok,
          stokAkhir: item.stokAkhir
        });
        
        return isMatchingType && hasStock;
      });
      
      this.populateStockTable();
      
      // Log filtered results
      console.log(`Loaded ${this.stockData.length} items for type: ${type}`);
      console.log("Filtered data:", this.stockData);
    } catch (error) {
      console.error("Error loading stock data:", error);
      showAlert("Gagal memuat data stok", "Error", "error");
    }
  },

  // Populate stock table
  populateStockTable() {
    const $tbody = $("#tableBarang tbody");
    $tbody.empty();

    if (!this.stockData || this.stockData.length === 0) {
      $tbody.append(`
        <tr>
          <td colspan="3" class="text-center">Tidak ada data</td>
        </tr>
      `);
      return;
    }

    this.stockData.forEach(item => {
      const stok = parseInt(item.stok) || parseInt(item.stokAkhir) || 0;
      if (stok > 0) {
        $tbody.append(`
          <tr data-id="${item.id}" data-kode="${item.kode}">
            <td>${item.kode}</td>
            <td>${item.nama || "-"}</td>
          </tr>
        `);
      }
    });

    // Log untuk debugging
    console.log(`Populated table with ${this.stockData.length} items`);
  },

  // Add return row
  addReturnRow(kode, nama) {
    const $tbody = $("#tableReturn tbody");
    const rowHtml = `
      <tr>
        <td>${kode}</td>
        <td>${nama}</td>
        <td>
          <input type="number" class="form-control form-control-sm jumlah-return" 
                 min="1" required style="width: 100px">
        </td>
        <td>
          <input type="text" class="form-control form-control-sm keterangan" 
                 placeholder="Opsional">
        </td>
        <td>
          <button type="button" class="btn btn-danger btn-sm btn-delete">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
    $tbody.append(rowHtml);
  },

  // Search table function
  searchTable(input, targetRows) {
    const searchText = $(input).val().toLowerCase();
    $(targetRows).each(function() {
      const rowText = $(this).text().toLowerCase();
      $(this).toggle(rowText.includes(searchText));
    });
  },

  // Set default date
  setDefaultDate() {
    const today = new Date();
    // Format tanggal ke YYYY-MM-DD
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    
    // Set nilai default untuk input tanggal
    $("#tanggalReturn").val(formattedDate);
    $("#filterDate").val(formattedDate); // Set juga untuk filter tanggal
    
    // Set max date ke hari ini untuk mencegah pemilihan tanggal masa depan
    $("#tanggalReturn").attr("max", formattedDate);
    $("#filterDate").attr("max", formattedDate);
  },

  // Validate return
  validateReturn() {
    let isValid = true;
    const sales = $("#sales").val().trim();
    const jenisReturn = $("#jenisReturn").val();
    
    if (!sales) {
      $("#sales").addClass("is-invalid");
      isValid = false;
    } else {
      $("#sales").removeClass("is-invalid");
    }

    if (!jenisReturn) {
      $("#jenisReturn").addClass("is-invalid");
      isValid = false;
    } else {
      $("#jenisReturn").removeClass("is-invalid");
    }

    // Check if table has rows
    if ($("#tableReturn tbody tr").length === 0) {
      showAlert("Tambahkan minimal satu barang", "Warning", "warning");
      isValid = false;
    }

    // Validate jumlah return
    $(".jumlah-return").each(function() {
      const value = $(this).val();
      if (!value || value < 1) {
        $(this).addClass("is-invalid");
        isValid = false;
      } else {
        $(this).removeClass("is-invalid");
      }
    });

    return isValid;
  },

  // Save return
  // Perbaiki bagian save return untuk memastikan format tanggal konsisten
async saveReturn() {
  if (this.isSaving || !this.validateReturn()) return;
  
  try {
    this.isSaving = true;
    $("#btnSimpanReturn").prop("disabled", true);

    // PERBAIKAN: Pastikan format tanggal konsisten
    const selectedDate = $("#tanggalReturn").val(); // Format: YYYY-MM-DD
    
    const returnData = {
      tanggal: selectedDate, // Simpan dalam format YYYY-MM-DD
      namaSales: $("#sales").val().trim(),
      jenisReturn: $("#jenisReturn").val(),
      detailReturn: [],
      timestamp: serverTimestamp(),
    };

    // Collect items data
    $("#tableReturn tbody tr").each(function() {
      const $row = $(this);
      returnData.detailReturn.push({
        kode: $row.find("td:first").text(),
        namaBarang: $row.find("td:eq(1)").text(),
        jumlah: parseInt($row.find(".jumlah-return").val()),
        keterangan: $row.find(".keterangan").val() || ""
      });
    });

    console.log("Saving return data:", returnData); // Debug log

    // Save to Firebase
    await addDoc(collection(firestore, "returnBarang"), returnData);
    
    showAlert("Data return berhasil disimpan", "Sukses", "success");
    this.resetForm();
  } catch (error) {
    console.error("Error saving return:", error);
    showAlert("Gagal menyimpan data return", "Error", "error");
  } finally {
    this.isSaving = false;
    $("#btnSimpanReturn").prop("disabled", false);
  }
},

  // Reset form
  resetForm() {
    this.setDefaultDate();
    $("#sales").val("").removeClass("is-invalid");
    $("#jenisReturn").val("").removeClass("is-invalid");
    $("#tableReturn tbody").empty();
    $("#tableBarang tbody").empty();
  },

  // Update stock in table
  updateStockInTable(updatedStock) {
    const $row = $(`#tableBarang tbody tr:contains('${updatedStock.kode}')`);
    if ($row.length) {
      $row.find("td:eq(2)").text(updatedStock.stok || 0);
    }
  },

  // Cleanup
  cleanup() {
    if (this.stockListener) {
      this.stockListener();
    }
  }
};

// Initialize when document is ready
$(document).ready(async () => {
  try {
    await returnHandler.init();
    console.log("✅ Return handler initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing return handler:", error);
  }
});

// Cleanup when page unloads
$(window).on("beforeunload", () => {
  returnHandler.cleanup();
});
